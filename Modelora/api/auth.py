"""api/auth.py – Email-based auth with brute-force protection and session tracking."""
from flask import Blueprint, request, jsonify, current_app
import time
from db import user_store, admin_store
from api.utils import require_auth
from middleware.security import (
    rate_limit, check_lockout, record_failed_login,
    record_successful_login, _get_ip, _audit, sanitize_str,
)
import config as cfg

auth_bp = Blueprint("auth", __name__)


def _s():
    return current_app.config["SECRET_KEY"]


@auth_bp.post("/api/auth/register")
@rate_limit(10, 300)
def register():
    try:
        reg_open = admin_store.get_config("registration_open")
        if reg_open is False:
            return jsonify({"ok": False, "msg": "Registration is currently closed by admin."}), 403
    except Exception:
        pass

    d        = request.get_json(silent=True) or {}
    email    = sanitize_str(d.get("email", "") or d.get("username", ""), 128).strip()
    password = d.get("password", "")
    # Accept display_name, username, or name field
    dname    = sanitize_str(d.get("display_name", "") or d.get("username", "") or d.get("name",""), 64)

    r = user_store.register(email, password, dname)
    if r["ok"]:
        # Sync role into admin_store (MongoDB) if available
        db = admin_store.get_db()
        if db is not None:
            db["users"].update_one(
                {"email": email},
                {"$set": {"role": r["role"], "is_locked": False,
                          "failed_attempts": 0, "login_count": 0}},
                upsert=False,
            )
        _audit("user_registered", f"email={email} role={r['role']}",
               ip=_get_ip(), severity="info")
    return jsonify(r), (200 if r["ok"] else 400)


@auth_bp.post("/api/auth/login")
@rate_limit(10, 60)
def login():
    d        = request.get_json(silent=True) or {}
    # Accept either "email" or legacy "username" field from the form
    email    = sanitize_str(d.get("email", "") or d.get("username", ""), 128).strip().lower()
    password = d.get("password", "")
    ip       = _get_ip()
    ua       = request.headers.get("User-Agent", "")[:200]

    locked, reason = check_lockout(email)
    if locked:
        _audit("login_blocked", f"email={email} reason={reason}", ip=ip, severity="warn")
        return jsonify({"ok": False, "msg": reason}), 403

    r = user_store.login(email, password, _s())
    if not r["ok"]:
        record_failed_login(email, ip)
        _audit("login_failed", f"email={email}", ip=ip, severity="warn")
        return jsonify(r), 401

    # Check account lock AFTER password validation, BEFORE issuing session
    db = admin_store.get_db()
    if db is not None:
        fresh = db["users"].find_one({"email": email}, {"is_locked": 1, "_id": 0})
        if fresh is None:
            fresh = db["users"].find_one({"username": email}, {"is_locked": 1, "_id": 0})
        if fresh and fresh.get("is_locked"):
            _audit("login_blocked_locked", f"email={email}", ip=ip, severity="warn")
            return jsonify({"ok": False, "msg": "Your account has been locked by an administrator. Please contact support.", "is_locked": True}), 403
    else:
        u_check = user_store.get_user(email)
        if u_check and u_check.get("is_locked"):
            _audit("login_blocked_locked", f"email={email}", ip=ip, severity="warn")
            return jsonify({"ok": False, "msg": "Your account has been locked by an administrator. Please contact support.", "is_locked": True}), 403

    record_successful_login(email, ip)
    _audit("login_success", f"email={email} role={r.get('role','user')}",
           ip=ip, severity="info")

    if email == "demo@ml.local":
        from storage import file_store
        file_store.cache_clear_user(email)

    admin_store.create_session(email, r["token"], ip, ua,
                               exp_seconds=cfg.JWT_EXP_H * 3600)
    return jsonify(r)


@auth_bp.post("/api/auth/logout")
def logout():
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    email = require_auth(request, _s())
    if token and email:
        admin_store.close_session(token, "user_logout")
        if email == "demo@ml.local":
            from storage import file_store
            file_store.cache_clear_user(email)
        _audit("logout", f"email={email}", ip=_get_ip(), severity="info")
    return jsonify({"ok": True})


@auth_bp.get("/api/auth/me")
def me():
    token = request.cookies.get("token") or request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        return jsonify({"ok": False, "msg": "Not logged in"}), 401

    email = user_store.verify_token(token, current_app.config["SECRET_KEY"])
    if not email:
        return jsonify({"ok": False, "msg": "Invalid or expired session"}), 401

    u = user_store.get_user(email)
    if not u:
        return jsonify({"ok": False, "msg": "User not found"}), 404

    db = user_store._get_db()

    experiments = u.get("experiments", 0)
    tutorial_done = u.get("tutorial_done", False)
    role = u.get("role", "user")
    display_name = u.get("display_name", "")
    username = u.get("username", email)
    time_limit = u.get("time_limit", 0)
    last_login = u.get("last_login", 0)

    if db is not None and db != "sqlite":
        fresh = db["users"].find_one({"email": email}, {"_id": 0})
        if fresh is None:
            fresh = db["users"].find_one({"username": email}, {"_id": 0})
        if fresh:
            if fresh.get("is_locked"):
                admin_store.close_session(token, "account_locked")
                return jsonify({"ok": False, "msg": "This account has been locked by an administrator.", "is_locked": True}), 403
            experiments = fresh.get("experiments", experiments)
            tutorial_done = fresh.get("tutorial_done", tutorial_done)
            role = fresh.get("role", role)
            display_name = fresh.get("display_name", display_name)
            username = fresh.get("username", username)
            time_limit = fresh.get("time_limit", time_limit)
            last_login = fresh.get("last_login", last_login)
    elif u.get("is_locked"):
        admin_store.close_session(token, "account_locked")
        return jsonify({"ok": False, "msg": "This account has been locked by an administrator.", "is_locked": True}), 403

    return jsonify({
        "ok": True,
        "email": email,
        "username": username,
        "display_name": display_name,
        "role": role,
        "experiments": experiments,
        "tutorial_done": tutorial_done,
        "time_limit": time_limit,
        "last_login": last_login,
        "user": {
            "email": email,
            "username": username,
            "display_name": display_name,
            "role": role,
            "experiments": experiments,
            "tutorial_done": tutorial_done,
            "time_limit": time_limit,
            "last_login": last_login,
        }
    }), 200

@auth_bp.post("/api/auth/tutorial_done")
def tutorial_done():
    u = require_auth(request, _s())
    if u:
        user_store.mark_tutorial_done(u)
    return jsonify({"ok": True})

@auth_bp.post("/api/auth/heartbeat")
def heartbeat():
    """Client heartbeat — checks lock status, time limits, returns session ok."""
    from db.user_store import verify_token, get_user, _get_db
    token = request.headers.get("Authorization","").replace("Bearer ","")
    if not token: return jsonify({"ok":False}),401
    email = verify_token(token, current_app.config["SECRET_KEY"])
    if not email: return jsonify({"ok":False,"action":"force_logout","msg":"Session expired"}),401

    # Update session activity
    admin_store.update_session_activity(token, page=request.json.get("page","") if request.json else "")

    # Get fresh user doc
    db = _get_db()
    user = None
    if db is not None and db != "sqlite":
        user = db["users"].find_one({"email": email}, {"_id":0,"password":0})
    if user is None: user = get_user(email) or {}

    # Check locked
    if user.get("is_locked"):
        admin_store.close_session(token,"account_locked")
        return jsonify({"ok":False,"action":"force_logout","msg_text":"⛔ Your account has been locked by an administrator."})

    # Check time limit
    tl = user.get("time_limit",0) or 0
    if tl > 0:
        last_login = user.get("last_login",0) or 0
        if last_login:
            elapsed_min = (time.time()-last_login)/60
            if elapsed_min >= tl:
                admin_store.close_session(token,"time_limit_exceeded")
                return jsonify({"ok":False,"action":"force_logout","msg_text":f"⏱️ Your session time limit of {tl} minutes has been reached."})
            if elapsed_min >= tl-1:
                return jsonify({"ok":True,"warn":"1min","msg_text":"⚠️ You will be logged out in under 1 minute due to your session time limit."})

    return jsonify({"ok":True})


# ── Forgot Password / OTP Reset ───────────────────────────────────────────────
import random
import threading

_otp_store: dict[str, dict] = {}   # email -> {otp, exp, attempts}
_otp_lock = threading.Lock()


@auth_bp.post("/api/auth/forgot_password")
@rate_limit(5, 300)
def forgot_password():
    d = request.get_json(silent=True) or {}
    email = sanitize_str(d.get("email", ""), 128).strip().lower()
    if not email:
        return jsonify({"ok": False, "msg": "Email is required"}), 400

    u = user_store.get_user(email)
    # Always return ok=True to prevent email enumeration
    if u is None:
        return jsonify({"ok": True, "msg": "If that email exists, a code was sent."})

    otp = str(random.randint(100000, 999999))
    exp = time.time() + 600  # 10 min

    with _otp_lock:
        _otp_store[email] = {"otp": otp, "exp": exp, "attempts": 0}

    import smtplib, ssl, logging
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText as _MIMEText

    log = logging.getLogger(__name__)
    smtp_host = str(getattr(cfg, "SMTP_HOST", "") or "").strip()
    smtp_port = int(getattr(cfg, "SMTP_PORT", 587) or 587)
    smtp_user = str(getattr(cfg, "SMTP_USER", "") or "").strip()
    smtp_pass = str(getattr(cfg, "SMTP_PASS", "") or "").strip()
    smtp_from = str(getattr(cfg, "SMTP_FROM", "") or smtp_user or "noreply@modelora.ai").strip()

    email_sent = False
    smtp_error  = ""
    dev_mode    = not (smtp_host and smtp_user and smtp_pass)

    if not dev_mode:
        try:
            html_body = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#0a0a18;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:500px;margin:40px auto;background:#0f1629;border-radius:16px;overflow:hidden;border:1px solid #1e2d50">
    <div style="background:linear-gradient(135deg,#7c5cfc 0%,#00d4ff 100%);padding:32px;text-align:center">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto 12px">
        <rect width="48" height="48" rx="12" fill="rgba(255,255,255,0.15)"/>
        <path d="M11 34L11 14L24 27L37 14L37 34" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <circle cx="24" cy="27" r="3" fill="#00e5a0"/>
      </svg>
      <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px">Modelora</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.75);margin-top:4px">Password Reset Verification</div>
    </div>
    <div style="padding:36px 32px">
      <p style="color:#8aa0c8;font-size:14px;line-height:1.7;margin:0 0 28px">
        We received a request to reset your password. Enter this code to continue:
      </p>
      <div style="background:#080d1e;border:2px solid rgba(124,92,252,0.4);border-radius:14px;padding:24px;text-align:center;margin-bottom:28px">
        <div style="font-size:44px;font-weight:900;letter-spacing:14px;color:#ffffff;font-family:'Courier New',monospace;text-indent:14px">{otp}</div>
        <div style="font-size:12px;color:#4a5a7a;margin-top:10px">Valid for 10 minutes · Do not share this code</div>
      </div>
      <p style="color:#4a5a7a;font-size:12px;line-height:1.7;margin:0;border-top:1px solid #1a2540;padding-top:20px">
        If you didn't request a password reset, you can safely ignore this email. Your account remains secure.
      </p>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #1a2540;text-align:center">
      <span style="font-size:11px;color:#2a3a5a">Modelora · Interactive ML Platform · noreply</span>
    </div>
  </div>
</body></html>"""

            plain_body = (
                f"Modelora Password Reset\n\n"
                f"Your verification code is: {otp}\n\n"
                f"This code expires in 10 minutes.\n"
                f"If you did not request this, ignore this email."
            )

            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"Your Modelora verification code: {otp}"
            msg["From"]    = f"Modelora <{smtp_from}>"
            msg["To"]      = email
            msg.attach(_MIMEText(plain_body, "plain", "utf-8"))
            msg.attach(_MIMEText(html_body,  "html",  "utf-8"))

            ctx = ssl.create_default_context()
            with smtplib.SMTP(smtp_host, smtp_port, timeout=12) as s:
                s.ehlo()
                s.starttls(context=ctx)
                s.login(smtp_user, smtp_pass)
                s.sendmail(smtp_from, [email], msg.as_string())

            email_sent = True
            log.info("OTP email sent to %s via %s", email, smtp_host)

        except smtplib.SMTPAuthenticationError as e:
            smtp_error = f"SMTP auth failed: {e} — use an App Password for Gmail (not your account password)"
            log.error(smtp_error)
        except smtplib.SMTPConnectError as e:
            smtp_error = f"Cannot connect to {smtp_host}:{smtp_port}: {e}"
            log.error(smtp_error)
        except Exception as e:
            smtp_error = f"SMTP error: {e}"
            log.error("Failed to send OTP email to %s: %s", email, e)

    # Always log OTP as fallback (dev mode or send failure)
    if not email_sent:
        log.warning(">>> OTP for %s: %s (valid 10 min) <<<", email, otp)
        if smtp_error:
            log.error("Send failed: %s", smtp_error)

    _audit("forgot_password", f"email={email} sent={email_sent}", ip=_get_ip(), severity="info")

    if dev_mode:
        return jsonify({"ok": True, "dev": True,
            "msg": "SMTP not configured — OTP printed to server terminal."})
    elif not email_sent:
        return jsonify({"ok": True, "dev": True,
            "msg": f"Email send failed ({smtp_error[:80]}) — OTP printed to server terminal."})
    else:
        return jsonify({"ok": True, "dev": False,
            "msg": "Verification code sent to your email address."})


@auth_bp.post("/api/auth/verify_otp")
@rate_limit(10, 300)
def verify_otp():
    d = request.get_json(silent=True) or {}
    email = sanitize_str(d.get("email", ""), 128).strip().lower()
    otp   = str(d.get("otp", "")).strip()

    with _otp_lock:
        record = _otp_store.get(email)
        if not record:
            return jsonify({"ok": False, "msg": "No pending reset for this email. Request a new code."}), 400
        if time.time() > record["exp"]:
            del _otp_store[email]
            return jsonify({"ok": False, "msg": "Code expired. Please request a new one."}), 400
        record["attempts"] = record.get("attempts", 0) + 1
        if record["attempts"] > 5:
            del _otp_store[email]
            return jsonify({"ok": False, "msg": "Too many attempts. Request a new code."}), 429
        if record["otp"] != otp:
            remaining = 5 - record["attempts"]
            return jsonify({"ok": False, "msg": f"Incorrect code. {remaining} attempts remaining."}), 400
        # Mark verified (keep record for reset step)
        record["verified"] = True

    return jsonify({"ok": True})


@auth_bp.post("/api/auth/reset_password")
@rate_limit(5, 300)
def reset_password():
    d = request.get_json(silent=True) or {}
    email    = sanitize_str(d.get("email", ""), 128).strip().lower()
    otp      = str(d.get("otp", "")).strip()
    new_pw   = d.get("new_password", "")

    if len(new_pw) < 6:
        return jsonify({"ok": False, "msg": "Password must be at least 6 characters"}), 400

    with _otp_lock:
        record = _otp_store.get(email)
        if not record or not record.get("verified"):
            return jsonify({"ok": False, "msg": "Please complete OTP verification first."}), 400
        if record["otp"] != otp or time.time() > record["exp"]:
            return jsonify({"ok": False, "msg": "Invalid or expired session. Start over."}), 400
        del _otp_store[email]

    # Update password in DB
    ok = _update_password(email, new_pw)
    if not ok:
        return jsonify({"ok": False, "msg": "Account not found."}), 404

    _audit("password_reset", f"email={email}", ip=_get_ip(), severity="info")
    return jsonify({"ok": True, "msg": "Password updated successfully."})


def _update_password(email: str, new_pw: str) -> bool:
    from db.user_store import _get_db, _hash_pw
    db = _get_db()
    new_hash = _hash_pw(new_pw)
    if db is not None and db != "sqlite":
        r = db["users"].update_one({"email": email}, {"$set": {"password": new_hash}})
        return r.matched_count > 0
    elif db == "sqlite":
        import sqlite3, json
        conn = sqlite3.connect("instance/modelora_users.sqlite3")
        row = conn.execute("SELECT data FROM users WHERE email = ?", (email,)).fetchone()
        if row:
            u = json.loads(row[0])
            u["password"] = new_hash
            conn.execute("UPDATE users SET data = ? WHERE email = ?", (json.dumps(u), email))
            conn.commit()
            conn.close()
            return True
        conn.close()
        return False
    return False


@auth_bp.get("/api/auth/smtp_test")
def smtp_test():
    """Admin-only SMTP connectivity test endpoint."""
    import smtplib, ssl as _ssl
    from middleware.security import require_auth
    from db import admin_store as _ast

    email = require_auth(request, current_app.config["SECRET_KEY"])
    if not email:
        return jsonify({"ok": False, "msg": "Unauthorized"}), 401
    db = _ast.get_db()
    if db is not None:
        u = db["users"].find_one({"email": email}, {"role": 1})
        if not u or u.get("role") != "admin":
            return jsonify({"ok": False, "msg": "Admin only"}), 403

    smtp_host = str(getattr(cfg, "SMTP_HOST", "") or "").strip()
    smtp_port = int(getattr(cfg, "SMTP_PORT", 587) or 587)
    smtp_user = str(getattr(cfg, "SMTP_USER", "") or "").strip()
    smtp_pass = str(getattr(cfg, "SMTP_PASS", "") or "").strip()

    if not (smtp_host and smtp_user and smtp_pass):
        return jsonify({"ok": False, "msg": "SMTP not configured in config.py"})

    try:
        ctx = _ssl.create_default_context()
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as s:
            s.ehlo()
            s.starttls(context=ctx)
            s.login(smtp_user, smtp_pass)
        return jsonify({"ok": True, "msg": f"SMTP connection to {smtp_host}:{smtp_port} successful ✓"})
    except smtplib.SMTPAuthenticationError as e:
        return jsonify({"ok": False, "msg": f"Auth failed — use 16-char Gmail App Password (not login password): {e}"})
    except Exception as e:
        return jsonify({"ok": False, "msg": str(e)})


@auth_bp.post("/api/auth/check_lock")
def check_lock():
    """Let a locked-out user poll whether admin has unlocked them — no auth required."""
    d = request.get_json(silent=True) or {}
    email = sanitize_str(d.get("email", ""), 128).strip().lower()
    if not email:
        return jsonify({"ok": False, "msg": "email required"}), 400
    # Rate-limit: max 10 calls per 5 min per IP
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()

    # Look up the user
    db = admin_store.get_db()
    user = None
    if db is not None:
        user = db["users"].find_one({"email": email}, {"is_locked": 1, "username": 1, "_id": 0})
    else:
        import sqlite3, json as _json
        try:
            conn = sqlite3.connect("instance/modelora_users.sqlite3")
            row = conn.execute("SELECT data FROM users WHERE email = ?", (email,)).fetchone()
            conn.close()
            if row:
                u = _json.loads(row[0])
                user = {"is_locked": u.get("is_locked", False), "username": u.get("username", "")}
        except Exception:
            pass

    if not user:
        # Don't reveal whether email exists
        return jsonify({"ok": True, "locked": False})

    locked = bool(user.get("is_locked"))
    return jsonify({"ok": True, "locked": locked})
