"""
api/admin.py
============
Admin API endpoints – ALL protected by require_role('admin')
  - Overview stats
  - User management (CRUD + actions)
  - Session monitor + force-kill
  - Experiment analytics
  - Audit log
  - Config / customization
  - SSE live activity stream
  - CSV export
  - System health
  - Telemetry ingestion (public endpoint for all users)
"""
from __future__ import annotations
import csv
import io
import json
import logging
import os
import smtplib
import time
from email.message import EmailMessage
from typing import Generator

from flask import Blueprint, Response, g, jsonify, request, current_app, stream_with_context

from api.utils import require_auth
from db import admin_store
from middleware.security import (
    require_role, rate_limit, sanitize_dict, sanitize_str, _get_ip, _audit,
    record_failed_login, record_successful_login, check_lockout,
)

logger = logging.getLogger(__name__)
admin_bp = Blueprint("admin", __name__)


def _s():
    return current_app.config["SECRET_KEY"]


# ── Overview ──────────────────────────────────────────────────────────────────
@admin_bp.get("/api/admin/stats")
@require_role("admin")
def stats():
    data = admin_store.get_overview_stats()
    health = admin_store.get_system_health()
    return jsonify({"ok": True, "stats": data, "health": health})


# ── User management ───────────────────────────────────────────────────────────
@admin_bp.get("/api/admin/users")
@require_role("admin")
def list_users():
    page   = int(request.args.get("page", 1))
    limit  = min(int(request.args.get("limit", 50)), 200)
    search = sanitize_str(request.args.get("search", ""), 100)
    role   = sanitize_str(request.args.get("role", ""), 20)
    return jsonify({"ok": True, **admin_store.get_all_users(page, limit, search, role)})


@admin_bp.get("/api/admin/users/<username>")
@require_role("admin")
def user_detail(username: str):
    username = sanitize_str(username, 64)
    detail = admin_store.get_user_detail(username)
    if not detail:
        return jsonify({"ok": False, "msg": "User not found"}), 404
    return jsonify({"ok": True, "user": detail})


@admin_bp.post("/api/admin/users/<username>/action")
@require_role("admin")
def user_action(username: str):
    username = sanitize_str(username, 64)
    data   = request.get_json(silent=True) or {}
    action = sanitize_str(data.get("action", ""), 32)
    actor  = g.current_user

    ALLOWED_ACTIONS = {"lock", "unlock", "promote", "demote", "delete", "force_logout"}
    if action not in ALLOWED_ACTIONS:
        return jsonify({"ok": False, "msg": f"Unknown action: {action}"}), 400

    # Prevent self-demotion / self-deletion
    if username == actor and action in ("demote", "delete", "lock"):
        return jsonify({"ok": False, "msg": "Cannot perform this action on your own account"}), 400

    if action == "lock":
        ok = admin_store.update_user(username, {"is_locked": True, "locked_at": time.time(), "locked_until": 0}, actor)
        admin_store.invalidate_user_sessions(username, "admin_lock")
        # Push specific lock notification so client shows lock screen
        db = admin_store.get_db()
        if db is not None:
            try:
                db["user_notifications"].update_many(
                    {"username": username, "type": "lock", "read": False},
                    {"$set": {"read": True}}  # clear old ones
                )
                db["user_notifications"].insert_one({
                    "username": username,
                    "msg": "Your account has been locked by an administrator. Contact admin to unlock.",
                    "type": "lock",
                    "ts": time.time(),
                    "read": False
                })
            except Exception:
                pass
    elif action == "unlock":
        ok = admin_store.update_user(username, {"is_locked": False, "failed_attempts": 0, "locked_until": 0}, actor)
        _audit("user_unlocked", f"target={username}", severity="warn")
    elif action == "promote":
        ok = admin_store.update_user(username, {"role": "admin"}, actor)
    elif action == "demote":
        ok = admin_store.update_user(username, {"role": "user"}, actor)
    elif action == "force_logout":
        admin_store.invalidate_user_sessions(username, f"admin_force_logout by {actor}")
        ok = True
        _audit("force_logout", f"target={username}", severity="warn")
        # Push real-time notification so client is kicked immediately
        _db = admin_store.get_db()
        if _db is not None:
            try:
                _db["user_notifications"].insert_one({"username": username,
                    "msg": "Your session was terminated by an administrator.",
                    "type": "force_logout", "ts": time.time(), "read": False})
            except Exception:
                pass
    elif action == "delete":
        db = admin_store.get_db()
        if db is not None:
            db["users"].delete_one({"username": username})
            db["sessions"].update_many({"username": username},
                                       {"$set": {"is_active": False}})
        else:
            from db.user_store import _mem
            _mem.pop(username, None)
        _audit("user_deleted", f"target={username}", severity="critical")
        ok = True
    else:
        ok = False

    return jsonify({"ok": ok, "action": action, "target": username})


@admin_bp.post("/api/admin/users/<username>/time_limit")
@require_role("admin")
def set_user_time_limit(username: str):
    username = sanitize_str(username, 64)
    data = request.get_json(silent=True) or {}
    minutes = int(data.get("minutes", 0))
    if minutes < 0:
        minutes = 0

    actor = g.current_user
    ok = admin_store.update_user(username, {"time_limit": minutes}, actor)
    if ok:
        _audit("time_limit_set", f"target={username} minutes={minutes}", severity="info")
        db = admin_store.get_db()
        if db is not None:
            try:
                db["user_notifications"].insert_one({
                    "username": username,
                    "msg": f"Your session time limit has been {'set to ' + str(minutes) + ' minutes' if minutes > 0 else 'removed (unlimited)'}.",
                    "type": "warning" if minutes > 0 else "info",
                    "action": "time_limit_update",
                    "ts": time.time(),
                    "read": False,
                })
            except Exception:
                pass
    return jsonify({"ok": ok})


# ── Session management ────────────────────────────────────────────────────────
@admin_bp.get("/api/admin/sessions")
@require_role("admin")
def sessions():
    active  = admin_store.get_active_sessions(100)
    history = admin_store.get_session_history(limit=200)
    return jsonify({"ok": True, "active": active, "history": history})


@admin_bp.post("/api/admin/sessions/<token_hash>/kill")
@require_role("admin")
def kill_session(token_hash: str):
    token_hash = sanitize_str(token_hash, 64)
    db = admin_store.get_db()
    actor = g.current_user
    if db is not None:
        # Support both token_hash and username lookups
        sess = db["sessions"].find_one({"token_hash": token_hash}, {"username": 1})
        if sess:
            db["sessions"].update_one(
                {"token_hash": token_hash},
                {"$set": {"is_active": False, "logout_at": time.time(), "logout_reason": f"admin_kill by {actor}"}}
            )
            target = sess.get("username", "")
            # Push logout notification so user gets kicked in real-time
            try:
                db["user_notifications"].insert_one({
                    "username": target,
                    "msg": "Your session was terminated by an administrator.",
                    "type": "force_logout",
                    "ts": time.time(),
                    "read": False
                })
            except Exception:
                pass
            _audit("session_killed", f"session={token_hash[:16]}… target={target}", severity="warn")
            return jsonify({"ok": True})
        return jsonify({"ok": False, "msg": "Session not found"}), 404
    else:
        # In-memory fallback
        from db.admin_store import _mem_sessions
        for s in _mem_sessions:
            if s.get("token_hash") == token_hash and s.get("is_active"):
                s.update({"is_active": False, "logout_at": time.time(), "logout_reason": f"admin_kill by {actor}"})
                return jsonify({"ok": True})
        return jsonify({"ok": False, "msg": "Session not found"}), 404


# ── Experiments ───────────────────────────────────────────────────────────────
@admin_bp.get("/api/admin/experiments")
@require_role("admin")
def experiments():
    page   = int(request.args.get("page", 1))
    limit  = min(int(request.args.get("limit", 100)), 500)
    user   = sanitize_str(request.args.get("user", ""), 64)
    algo   = sanitize_str(request.args.get("algo", ""), 64)
    skip   = (page - 1) * limit

    db = admin_store.get_db()
    if db is  not None:
        q: dict = {}
        if user: q["username"] = user
        if algo: q["algo"]     = {"$regex": algo, "$options": "i"}
        total = db["experiments"].count_documents(q)
        docs  = list(db["experiments"].find(q, {"_id": 0}).sort("ts", -1).skip(skip).limit(limit))
    else:
        from db.mongo_store import _mem
        docs = _mem["experiments"]
        if user: docs = [d for d in docs if d.get("username") == user]
        if algo: docs = [d for d in docs if algo.lower() in d.get("algo", "").lower()]
        total = len(docs)
        docs  = list(reversed(docs))[:limit]

    return jsonify({"ok": True, "experiments": docs, "total": total, "page": page})


# ── Audit log ─────────────────────────────────────────────────────────────────
@admin_bp.get("/api/admin/audit")
@require_role("admin")
def audit():
    limit    = min(int(request.args.get("limit", 200)), 1000)
    severity = sanitize_str(request.args.get("severity", ""), 20) or None
    actor    = sanitize_str(request.args.get("actor", ""), 64) or None
    action   = sanitize_str(request.args.get("action", ""), 64) or None
    logs = admin_store.get_audit_log(limit, severity, actor, action)
    return jsonify({"ok": True, "logs": logs, "total": len(logs)})


# ── Admin config ──────────────────────────────────────────────────────────────
@admin_bp.route("/api/admin/config", methods=["GET"])
@require_role("admin")
def get_config():
    return jsonify({"ok": True, "config": admin_store.get_all_config()})


@admin_bp.route("/api/admin/config", methods=["POST"])
@require_role("admin")
def set_config():
    data  = request.get_json(silent=True) or {}
    key   = sanitize_str(data.get("key", ""), 32)
    value = data.get("value")
    ALLOWED_KEYS = {"theme", "features", "limits", "announcements", "contact",
                    "maintenance_mode", "registration_open"}
    if key not in ALLOWED_KEYS:
        return jsonify({"ok": False, "msg": f"Invalid config key: {key}"}), 400
    if value is None:
        return jsonify({"ok": False, "msg": "No value provided"}), 400
    admin_store.set_config(key, value, actor=g.current_user)
    return jsonify({"ok": True, "key": key})


# ── SSE live activity feed ────────────────────────────────────────────────────
@admin_bp.get("/api/admin/stream")
@require_role("admin")
def live_stream():
    """Server-Sent Events stream for real-time admin dashboard."""

    def generate() -> Generator[str, None, None]:
        last_sent = 0.0
        while True:
            now = time.time()
            if now - last_sent >= 3:   # push every 3 seconds
                try:
                    payload = {
                        "ts":      now,
                        "stats":   admin_store.get_overview_stats(),
                        "health":  admin_store.get_system_health(),
                        "active":  admin_store.get_active_sessions(20),
                        "alerts":  admin_store.get_audit_log(10, severity="critical"),
                    }
                    yield f"data: {json.dumps(payload, default=str)}\n\n"
                    last_sent = now
                except Exception as e:
                    yield f"data: {json.dumps({'error': str(e)})}\n\n"
            time.sleep(1)

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control":      "no-cache",
            "X-Accel-Buffering":  "no",
            "Connection":         "keep-alive",
        },
    )


# ── System health ─────────────────────────────────────────────────────────────
@admin_bp.get("/api/admin/health")
@require_role("admin")
def health():
    return jsonify({"ok": True, "health": admin_store.get_system_health()})


# ── CSV Export ────────────────────────────────────────────────────────────────
@admin_bp.get("/api/admin/export/<resource>")
@require_role("admin")
def export_csv(resource: str):
    ALLOWED = {"users", "experiments", "sessions", "audit"}
    if resource not in ALLOWED:
        return jsonify({"ok": False, "msg": "Invalid resource"}), 400

    db = admin_store.get_db()
    rows: list[dict] = []

    if resource == "users":
        if db is  not None:
            rows = list(db["users"].find({}, {"_id": 0, "password": 0}))
        else:
            from db.user_store import _mem
            rows = [{k: v for k, v in u.items() if k != "password"} for u in _mem.values()]
    elif resource == "experiments":
        if db is  not None:
            rows = list(db["experiments"].find({}, {"_id": 0}).sort("ts", -1).limit(5000))
        else:
            from db.mongo_store import _mem
            rows = list(reversed(_mem["experiments"]))
    elif resource == "sessions":
        rows = admin_store.get_session_history(limit=5000)
    elif resource == "audit":
        rows = admin_store.get_audit_log(limit=5000)

    if not rows:
        rows = [{"message": "No data"}]

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()), extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    _audit(g.current_user, f"export_{resource}", severity="warn")

    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f'attachment; filename="admin_{resource}_{int(time.time())}.csv"'},
    )


# ── Announce ──────────────────────────────────────────────────────────────────
@admin_bp.post("/api/admin/announce")
@require_role("admin")
def announce():
    data = request.get_json(silent=True) or {}
    text = sanitize_str(data.get("text", ""), 500)
    atype = sanitize_str(data.get("type", "info"), 20)
    if not text:
        return jsonify({"ok": False, "msg": "Announcement text required"}), 400
    announcements = admin_store.get_config("announcements")
    if not isinstance(announcements, list):
        announcements = []
    announcements.insert(0, {
        "text":       text,
        "type":       atype,
        "active":     True,
        "created_at": time.time(),
        "created_by": g.current_user,
    })
    admin_store.set_config("announcements", announcements[:20], g.current_user)
    return jsonify({"ok": True})


@admin_bp.delete("/api/admin/announce/<int:index>")
@require_role("admin")
def delete_announcement(index: int):
    announcements = admin_store.get_config("announcements")
    if not isinstance(announcements, list):
        announcements = []
    if 0 <= index < len(announcements):
        removed = announcements.pop(index)
        admin_store.set_config("announcements", announcements, g.current_user)
        _audit("announcement_deleted", f"text={removed.get('text', '')[:50]}…", severity="info")
        return jsonify({"ok": True})
    return jsonify({"ok": False, "msg": "Invalid announcement index"}), 400




@admin_bp.post("/api/feedback")
@rate_limit(10, 300)
def submit_feedback():
    email = require_auth(request, _s())
    if not email:
        return jsonify({"ok": False, "msg": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    subject = sanitize_str(data.get("subject", "Customer Feedback"), 120).strip() or "Customer Feedback"
    message = sanitize_str(data.get("message", ""), 4000).strip()
    page = sanitize_str(data.get("page", "dashboard"), 80).strip() or "dashboard"

    if len(message) < 5:
        return jsonify({"ok": False, "msg": "Please enter a longer feedback message."}), 400

    me = admin_store.get_config("contact") or {}
    admin_email = sanitize_str(me.get("admin_feedback_email", ""), 128).strip()

    payload = {
        "user_email": email,
        "subject": subject,
        "message": message,
        "page": page,
        "timestamp": time.time(),
        "ip": _get_ip(),
    }

    db = admin_store.get_db()
    if db is not None:
        db["feedback"].insert_one(payload)
    else:
        # In-memory fallback when MongoDB is unavailable
        admin_store.store_feedback_mem(payload)

    mailed = False
    if admin_email and me.get("feedback_mail_enabled", True):
        smtp_host = os.environ.get("MAIL_HOST", "").strip()
        smtp_port = int(os.environ.get("MAIL_PORT", "587"))
        smtp_user = os.environ.get("MAIL_USER", "").strip()
        smtp_pass = os.environ.get("MAIL_PASS", "")
        smtp_from = os.environ.get("MAIL_FROM", smtp_user).strip()
        smtp_tls  = os.environ.get("MAIL_TLS", "true").lower() != "false"
        if smtp_host and smtp_from:
            try:
                msg = EmailMessage()
                msg["Subject"] = f"[ML Dashboard] {subject}"
                msg["From"] = smtp_from
                msg["To"] = admin_email
                msg.set_content(
                    f"Feedback received from: {email}\n"
                    f"Page: {page}\n"
                    f"IP: {_get_ip()}\n\n"
                    f"Message:\n{message}\n"
                )
                with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
                    if smtp_tls:
                        server.starttls()
                    if smtp_user:
                        server.login(smtp_user, smtp_pass)
                    server.send_message(msg)
                mailed = True
            except Exception as exc:
                logger.warning("feedback email failed: %s", exc)

    _audit("feedback_submitted", f"from={email} page={page} mailed={mailed}", ip=_get_ip(), severity="info")
    if mailed:
        return jsonify({"ok": True, "msg": "Feedback sent to admin email."})
    if admin_email:
        return jsonify({"ok": True, "msg": "Feedback saved. Email delivery is not configured on the server yet."})
    return jsonify({"ok": True, "msg": "Feedback saved. Admin recipient email is not set yet."})


@admin_bp.get("/api/admin/feedback")
@require_role("admin")
def get_feedback():
    db = admin_store.get_db()
    items = []
    if db is not None:
        for item in db["feedback"].find({}, {"_id": 0}).sort("timestamp", -1).limit(50):
            items.append(item)
    else:
        # In-memory fallback
        items = admin_store.get_feedback_mem()
    return jsonify({"ok": True, "feedback": items})

@admin_bp.get("/api/announcements")
def get_announcements():
    """Public endpoint — all users can fetch active announcements."""
    ann = admin_store.get_config("announcements")
    if not isinstance(ann, list):
        ann = []
    active = [a for a in ann if a.get("active")]
    return jsonify({"ok": True, "announcements": active})


# ── Telemetry (public – all authenticated users) ──────────────────────────────
@admin_bp.post("/api/telemetry")
@rate_limit(60, 60)  # 60 calls / minute per IP
def telemetry():
    username = require_auth(request, _s())
    if not username:
        return jsonify({"ok": False}), 401
    data = request.get_json(silent=True) or {}
    safe = {k:v for k,v in data.items() if k in [
        "session_id","page_url","action_type","duration_ms",
        "memory_mb","connection_type","viewport_w","viewport_h","errors",
    ]}
    safe["username"] = username
    safe["ip"]       = _get_ip()
    admin_store.store_telemetry(safe)
    # Update session activity
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if token:
        admin_store.update_session_activity(token, safe.get("page_url", ""), api_call=True)
    return jsonify({"ok": True})


# ── Public config endpoint (for users to read theme/features) ─────────────────
@admin_bp.get("/api/config/public")
def public_config():
    theme    = admin_store.get_config("theme")
    features = admin_store.get_config("features")
    limits   = admin_store.get_config("limits")
    return jsonify({"ok": True, "theme": theme, "features": features, "limits": limits})

@admin_bp.post("/api/admin/users/<username>/notify")
@require_role("admin")
def notify_user(username: str):
    """Push a notification message to a specific user."""
    from middleware.security import sanitize_str
    data = request.get_json(silent=True) or {}
    msg  = sanitize_str(data.get("msg",""), 500)
    type_= sanitize_str(data.get("type","info"), 20)
    db = admin_store.get_db()
    doc = {"username": username, "msg": msg, "type": type_, "ts": time.time(), "read": False}
    if db is not None:
        try: db["user_notifications"].insert_one(doc)
        except Exception: pass
    return jsonify({"ok": True})

@admin_bp.get("/api/admin/notifications/<username>")
def get_user_notifications(username: str):
    """Users poll this for admin push messages."""
    from db.user_store import verify_token
    token = request.headers.get("Authorization","").replace("Bearer ","")
    caller = verify_token(token, current_app.config["SECRET_KEY"]) if token else None
    if not caller: return jsonify({"ok":False,"msg":"Unauthorized"}),401
    # Allow user to read their own, or admin to read anyone's
    db = admin_store.get_db()
    notes = []
    if db is not None:
        try:
            notes = list(db["user_notifications"].find(
                {"username": username, "read": False}, {"_id":0}
            ).sort("ts",-1).limit(10))
            db["user_notifications"].update_many(
                {"username": username, "read": False}, {"$set": {"read": True}})
        except Exception: pass
    return jsonify({"ok": True, "notifications": notes})

@admin_bp.get("/api/admin/livefeed")
@require_role("admin")
def livefeed():
    """Polling fallback for live feed data."""
    import time as _time
    now = _time.time()
    sessions = admin_store.get_active_sessions(50)
    active = [s for s in sessions if s.get("is_active") and (not s.get("expires_at") or s.get("expires_at", 0) > now)]

    # Merge time_limit from user records into session objects
    db = admin_store.get_db()
    user_cache = {}
    if db is not None:
        usernames = list({s.get("username") for s in active if s.get("username")})
        if usernames:
            for u in db["users"].find({"username": {"$in": usernames}}, {"username": 1, "time_limit": 1, "_id": 0}):
                user_cache[u["username"]] = u
    for s in active:
        uname = s.get("username", "")
        u = user_cache.get(uname, {})
        s["time_limit_mins"] = u.get("time_limit", 0) or 0

    audit  = admin_store.get_audit_log(limit=20)
    health = admin_store.get_system_health()
    return jsonify({"ok": True, "active_sessions": active, "activity": audit, "health": health})
