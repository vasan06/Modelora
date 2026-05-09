"""
db/admin_store.py
=================
Admin-specific database operations:
  - Unified DB connection (shared with user_store)
  - Session management
  - Audit log (append-only)
  - Admin config (theme, features, limits)
  - Aggregated analytics
  - Telemetry storage
"""
from __future__ import annotations
import logging
import time
import hashlib
from typing import Any

logger = logging.getLogger(__name__)

_db = None
# In-memory fallbacks
_mem_sessions: list[dict] = []
_mem_audit:    list[dict] = []
_mem_telem:    list[dict] = []
_mem_config:   dict[str, Any] = {}
_mem_feedback: list[dict] = []  # In-memory feedback fallback

def store_feedback_mem(item: dict) -> None:
    """Store feedback in memory when MongoDB is unavailable."""
    _mem_feedback.append(item)
    if len(_mem_feedback) > 500:
        _mem_feedback.pop(0)

def get_feedback_mem() -> list[dict]:
    """Retrieve in-memory feedback (most recent first)."""
    return list(reversed(_mem_feedback[-50:]))



def get_db():
    """Return MongoDB db object or None (graceful fallback)."""
    global _db
    if _db is not None:
        return _db
    try:
        import config
        from pymongo import MongoClient, ASCENDING, DESCENDING
        c = MongoClient(config.MONGO_URI, serverSelectionTimeoutMS=2000)
        c.server_info()
        _db = c[config.MONGO_DB]
        # Indexes
        _db["sessions"].create_index([("token_hash", ASCENDING)], unique=True, sparse=True)
        _db["sessions"].create_index([("username", ASCENDING)])
        _db["sessions"].create_index([("expires_at", ASCENDING)], expireAfterSeconds=0)
        _db["audit_log"].create_index([("timestamp", DESCENDING)])
        _db["audit_log"].create_index([("actor", ASCENDING)])
        _db["telemetry"].create_index([("timestamp", DESCENDING)])
        _db["telemetry"].create_index([("session_id", ASCENDING)])
        _db["users"].create_index([("role", ASCENDING)])
        logger.info("Admin store connected to MongoDB")
    except Exception as e:
        logger.warning("Admin store: MongoDB unavailable (%s); in-memory fallback", e)
        _db = None
    return _db


# ── Session management ───────────────────────────────────────────────────────

def create_session(username: str, token: str, ip: str, user_agent: str,
                   exp_seconds: int = 172800) -> str:
    """Create session record. Store token HASH only."""
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    doc = {
        "username":      username,
        "token_hash":    token_hash,
        "ip_address":    ip[:64],
        "user_agent":    user_agent[:200],
        "created_at":    time.time(),
        "expires_at":    time.time() + exp_seconds,
        "last_activity": time.time(),
        "is_active":     True,
        "logout_at":     None,
        "logout_reason": None,
        "pages_visited": 0,
        "api_calls":     0,
        "experiments_run": 0,
    }
    db = get_db()
    if db is not None:
        try:
            db["sessions"].insert_one(doc)
        except Exception as e:
            logger.error("Session create error: %s", e)
    else:
        _mem_sessions.append(doc)
    return token_hash


def update_session_activity(token: str, page: str = "", api_call: bool = False):
    """Bump last_activity timestamp."""
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    db = get_db()
    upd: dict = {"$set": {"last_activity": time.time()}}
    if page:
        upd["$set"]["current_page"] = page[:200]
    if api_call:
        upd["$inc"] = {"api_calls": 1}
    if db is not None:
        db["sessions"].update_one({"token_hash": token_hash, "is_active": True}, upd)
    else:
        for s in _mem_sessions:
            if s.get("token_hash") == token_hash and s.get("is_active"):
                s["last_activity"] = time.time()
                if page:
                    s["current_page"] = page
                if api_call:
                    s["api_calls"] = s.get("api_calls", 0) + 1


def close_session(token: str, reason: str = "logout"):
    """Mark session as closed."""
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    db = get_db()
    upd = {"$set": {"is_active": False, "logout_at": time.time(), "logout_reason": reason}}
    if db is not None:
        db["sessions"].update_one({"token_hash": token_hash}, upd)
    else:
        for s in _mem_sessions:
            if s.get("token_hash") == token_hash:
                s.update({"is_active": False, "logout_at": time.time(), "logout_reason": reason})


def invalidate_user_sessions(username: str, reason: str = "admin_action"):
    """Force-logout all sessions for a user (admin action)."""
    db = get_db()
    if db is not None:
        db["sessions"].update_many(
            {"username": username, "is_active": True},
            {"$set": {"is_active": False, "logout_at": time.time(), "logout_reason": reason}}
        )
        # Send notification
        db["user_notifications"].insert_one({
            "username": username,
            "msg": "You have been logged out by an administrator.",
            "type": "force_logout",
            "ts": time.time(),
            "read": False
        })
    else:
        for s in _mem_sessions:
            if s.get("username") == username and s.get("is_active"):
                s.update({"is_active": False, "logout_at": time.time(), "logout_reason": reason})


def get_active_sessions(limit: int = 100) -> list[dict]:
    db = get_db()
    if db is not None:
        now = time.time()
        return list(db["sessions"].find(
            {"is_active": True, "$or": [
                {"expires_at": {"$gt": now}},
                {"expires_at": {"$exists": False}},
                {"expires_at": None},
                {"expires_at": 0},
            ]},
            {"_id": 0, "token_hash": 0}
        ).sort("last_activity", -1).limit(limit))
    return [s for s in _mem_sessions if s.get("is_active")][-limit:]


def get_session_history(username: str | None = None, limit: int = 200) -> list[dict]:
    db = get_db()
    q = {"username": username} if username else {}
    if db is not None:
        return list(db["sessions"].find(q, {"_id": 0, "token_hash": 0}).sort("created_at", -1).limit(limit))
    data = [s for s in _mem_sessions if not username or s.get("username") == username]
    return list(reversed(data[-limit:]))


# ── Audit log (append-only) ──────────────────────────────────────────────────

def log_audit(actor: str, action: str, details: str = "",
              ip: str = "", user_agent: str = "", severity: str = "info",
              resource: str = ""):
    doc = {
        "timestamp":   time.time(),
        "actor":       actor[:64],
        "action":      action[:100],
        "resource":    resource[:200],
        "details":     details[:1000],
        "ip_address":  ip[:64],
        "user_agent":  user_agent[:200],
        "severity":    severity,
    }
    db = get_db()
    if db is not None:
        try:
            db["audit_log"].insert_one(doc)
        except Exception as e:
            logger.error("Audit log error: %s", e)
    else:
        _mem_audit.append(doc)


def get_audit_log(limit: int = 500, severity: str | None = None,
                  actor: str | None = None, action: str | None = None) -> list[dict]:
    db = get_db()
    q: dict = {}
    if severity:
        q["severity"] = severity
    if actor:
        q["actor"] = actor
    if action:
        q["action"] = {"$regex": action, "$options": "i"}
    if db is not None:
        return list(db["audit_log"].find(q, {"_id": 0}).sort("timestamp", -1).limit(limit))
    data = list(reversed(_mem_audit[-limit:]))
    if severity:
        data = [d for d in data if d.get("severity") == severity]
    if actor:
        data = [d for d in data if d.get("actor") == actor]
    return data


# ── Telemetry ────────────────────────────────────────────────────────────────

def store_telemetry(data: dict):
    doc = {
        "timestamp":       time.time(),
        "session_id":      data.get("session_id", "")[:64],
        "username":        data.get("username", "")[:64],
        "page_url":        data.get("page_url", "")[:200],
        "action_type":     data.get("action_type", "heartbeat")[:32],
        "duration_ms":     int(data.get("duration_ms", 0)),
        "memory_mb":       float(data.get("memory_mb", 0)),
        "connection_type": data.get("connection_type", "")[:32],
        "viewport_w":      int(data.get("viewport_w", 0)),
        "viewport_h":      int(data.get("viewport_h", 0)),
        "errors":          data.get("errors", [])[:5],
        "ip_address":      data.get("ip", "")[:64],
    }
    db = get_db()
    if db is not None:
        try:
            db["telemetry"].insert_one(doc)
        except Exception:
            pass
    else:
        _mem_telem.append(doc)
        if len(_mem_telem) > 10000:
            _mem_telem.pop(0)


# ── Admin config ─────────────────────────────────────────────────────────────

DEFAULT_CONFIG = {
    "theme": {
        "primary":    "#7c5cfc",
        "secondary":  "#e040fb",
        "accent":     "#00d4ff",
        "success":    "#00e5a0",
        "warning":    "#ffb700",
        "danger":     "#ff4d6d",
        "bg_dark":    "#060b14",
        "bg_light":   "#f0f4ff",
        "card_dark":  "#131f30",
        "card_light": "#ffffff",
        "font":       "DM Sans",
        "default_theme": "dark",
        "border_radius": "12",
    },
    "features": {
        "algorithms_enabled": [
            "Logistic Regression","Decision Tree","Random Forest","KNN","Naive Bayes",
            "SVM (RBF)","SVM (Linear)","Gradient Boosting","AdaBoost","Extra Trees",
            "Linear Discriminant Analysis","Ridge Classifier",
            "Linear Regression","Ridge","Lasso","ElasticNet","SVR","Huber",
            "K-Means","Hierarchical","DBSCAN","Gaussian Mixture","Spectral Clustering","Mini-Batch K-Means",
            "PCA","t-SNE","Truncated SVD",
            "Isolation Forest","Local Outlier Factor",
            "Label Propagation","Label Spreading",
            "Q-Learning Demo",
        ],
        "charts_enabled": ["scatter","bar","line","histogram","box","pie","heatmap","scatter3d","bubble","violin","pairs"],
        "upload_formats": ["csv","xlsx","json","tsv","parquet","xml","pkl","arff","db"],
        "visualizer_enabled": True,
        "whatif_enabled": True,
        "arena_enabled": True,
    },
    "limits": {
        "max_file_mb":       50,
        "max_train_rows":    100000,
        "cv_folds_default":  5,
        "max_clusters":      20,
        "preview_rows":      100,
        "test_size_min":     10,
        "test_size_max":     50,
        "rate_limit_per_min": 200,
    },
    "announcements": [],
    "contact": {
        "admin_feedback_email": "",
        "feedback_mail_enabled": True
    },
    "maintenance_mode": False,
    "registration_open": True,
}


def get_config(key: str) -> dict:
    db = get_db()
    if db is not None:
        doc = db["admin_config"].find_one({"_id": key}, {"_id": 0})
        if doc:
            return doc.get("value", DEFAULT_CONFIG.get(key, {}))
    return _mem_config.get(key, DEFAULT_CONFIG.get(key, {}))


def set_config(key: str, value: dict, actor: str = "admin"):
    db = get_db()
    if db is not None:
        db["admin_config"].update_one(
            {"_id": key},
            {"$set": {"value": value, "updated_at": time.time(), "updated_by": actor}},
            upsert=True,
        )
    else:
        _mem_config[key] = value
    log_audit(actor, "config_updated", f"key={key}", severity="warn")


def get_all_config() -> dict:
    keys = ["theme", "features", "limits", "announcements", "contact", "maintenance_mode", "registration_open"]
    return {k: get_config(k) for k in keys}


# ── Analytics aggregations ───────────────────────────────────────────────────

def get_overview_stats() -> dict:
    db = get_db()
    now = time.time()
    day_ago  = now - 86400
    week_ago = now - 604800

    if db is not None:
        total_users    = db["users"].count_documents({})
        active_today   = db["sessions"].count_documents({"last_activity": {"$gt": day_ago}})
        new_week       = db["users"].count_documents({"created_at": {"$gt": week_ago}})
        total_exp      = db["experiments"].count_documents({})
        exp_today      = db["experiments"].count_documents({"ts": {"$gt": day_ago}})
        total_uploads  = db["uploads"].count_documents({})
        locked_users   = db["users"].count_documents({"is_locked": True})
        active_sessions = db["sessions"].count_documents({"is_active": True, "$or": [
            {"expires_at": {"$gt": now}},
            {"expires_at": {"$exists": False}},
            {"expires_at": None},
            {"expires_at": 0},
        ]})
        failed_logins  = db["audit_log"].count_documents({"action": "login_failed", "timestamp": {"$gt": day_ago}})

        # Top algorithms
        pipeline = [
            {"$group": {"_id": "$algo", "count": {"$sum": 1}, "avg_score": {"$avg": "$metrics.accuracy"}}},
            {"$sort": {"count": -1}},
            {"$limit": 10},
        ]
        top_algos = list(db["experiments"].aggregate(pipeline))

        # Recent errors
        recent_errors = list(db["audit_log"].find(
            {"severity": {"$in": ["warn", "critical"]}},
            {"_id": 0}
        ).sort("timestamp", -1).limit(20))

    else:
        import sqlite3
        from db.mongo_store import _mem as _mmem
        # Query SQLite for users
        conn = sqlite3.connect("instance/modelora_users.sqlite3")
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM users")
        total_users = cur.fetchone()[0]
        cur.execute("SELECT data FROM users WHERE json_extract(data, '$.is_locked') = 1")
        locked_users = len(cur.fetchall())
        cur.execute("SELECT data FROM users WHERE json_extract(data, '$.created_at') > ?", (week_ago,))
        new_week = len(cur.fetchall())
        conn.close()
        active_today    = len([s for s in _mem_sessions if s.get("last_activity", 0) > day_ago])
        total_exp       = len(_mmem["experiments"])
        exp_today       = len([e for e in _mmem["experiments"] if e.get("ts", 0) > day_ago])
        total_uploads   = len(_mmem["uploads"])
        active_sessions = len([s for s in _mem_sessions if s.get("is_active")])
        failed_logins   = 0
        top_algos       = []
        recent_errors   = []

    return {
        "total_users":    total_users,
        "active_today":   active_today,
        "new_this_week":  new_week,
        "total_experiments": total_exp,
        "experiments_today": exp_today,
        "total_uploads":  total_uploads,
        "locked_users":   locked_users,
        "active_sessions": active_sessions,
        "failed_logins_today": failed_logins,
        "top_algorithms": [{"name": a["_id"], "count": a["count"],
                            "avg_score": round(float(a.get("avg_score") or 0), 3)} for a in top_algos],
        "recent_alerts":  recent_errors,
    }


def get_all_users(page: int = 1, limit: int = 50, search: str = "", role: str = "") -> dict:
    db = get_db()
    skip = (page - 1) * limit
    if db is not None:
        q: dict = {}
        if search:
            q["$or"] = [
                {"username": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}},
            ]
        if role:
            q["role"] = role
        total = db["users"].count_documents(q)
        users = list(db["users"].find(q, {"_id": 0, "password": 0}).sort("created_at", -1).skip(skip).limit(limit))
    else:
        # Check SQLite fallback
        import sqlite3, json
        conn = sqlite3.connect("instance/modelora_users.sqlite3")
        cursor = conn.cursor()
        query = "SELECT data FROM users"
        params = []
        conditions = []
        if search:
            conditions.append("data LIKE ?")
            params.append(f"%{search}%")
        if role:
            conditions.append("json_extract(data, '$.role') = ?")
            params.append(role)
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        cursor.execute(query, params)
        rows = cursor.fetchall()
        users = []
        for row in rows:
            try:
                user = json.loads(row[0])
                user.pop("password", None)
                users.append(user)
            except:
                pass
        conn.close()
        users.sort(key=lambda u: u.get("created_at", 0), reverse=True)
        total = len(users)
        users = users[skip:skip+limit]
    return {"users": users, "total": total, "page": page, "pages": max(1, (total + limit - 1) // limit)}


def get_user_detail(username: str) -> dict | None:
    db = get_db()
    if db is not None:
        user = db["users"].find_one({"username": username}, {"_id": 0, "password": 0})
        if not user:
            return None
        user["experiment_count"] = user.get("experiments", 0) if not isinstance(user.get("experiments"), list) else len(user.get("experiments", []))
        user["sessions"]    = list(db["sessions"].find({"username": username}, {"_id": 0, "token_hash": 0}).sort("created_at", -1).limit(20))
        user["experiments_list"] = list(db["experiments"].find({"username": username}, {"_id": 0}).sort("ts", -1).limit(50))
        user["uploads"]     = list(db["uploads"].find({"username": username}, {"_id": 0}).sort("ts", -1).limit(20))
        return user
    from db.user_store import _mem, _get_db
    u = _mem.get(username)
    if not u and _get_db() == "sqlite":
        try:
            import sqlite3, json
            conn = sqlite3.connect("instance/modelora_users.sqlite3")
            row = conn.execute(
                "SELECT data FROM users WHERE email = ? OR json_extract(data, '$.username') = ?",
                (username, username),
            ).fetchone()
            conn.close()
            if row:
                u = json.loads(row[0])
        except Exception:
            u = None
    if not u:
        return None
    user = {k: v for k, v in u.items() if k != "password"}
    user["experiment_count"] = user.get("experiments", 0) if not isinstance(user.get("experiments"), list) else len(user.get("experiments", []))
    try:
        from db.mongo_store import _mem as _mmem
        user["sessions"] = [s for s in _mem_sessions if s.get("username") == username][-20:]
        user["experiments_list"] = [e for e in _mmem.get("experiments", []) if e.get("username") == username][-50:]
        user["uploads"] = [x for x in _mmem.get("uploads", []) if x.get("username") == username][-20:]
    except Exception:
        user["sessions"], user["experiments_list"], user["uploads"] = [], [], []
    return user


def update_user(username: str, updates: dict, actor: str = "admin"):
    """Whitelist allowed admin updates."""
    ALLOWED = {"is_active", "is_locked", "role", "email", "time_limit", "failed_attempts", "locked_until", "locked_at"}
    safe = {k: v for k, v in updates.items() if k in ALLOWED}
    if not safe:
        return False
    db = get_db()
    if db is not None:
        db["users"].update_one({"username": username}, {"$set": safe})
    else:
        from db.user_store import _get_db, _mem
        udb = _get_db()
        if udb == "sqlite":
            import sqlite3, json
            conn = sqlite3.connect("instance/modelora_users.sqlite3")
            row = conn.execute(
                "SELECT email, data FROM users WHERE email = ? OR json_extract(data, '$.username') = ?",
                (username, username),
            ).fetchone()
            if not row:
                conn.close()
                return False
            email, raw = row
            user = json.loads(raw)
            user.update(safe)
            conn.execute("UPDATE users SET data = ? WHERE email = ?", (json.dumps(user), email))
            conn.commit()
            conn.close()
        elif username in _mem:
            _mem[username].update(safe)
        else:
            return False
    log_audit(actor, "user_updated", f"target={username} changes={safe}", severity="warn")
    return True


def get_system_health() -> dict:
    """Server resource metrics."""
    try:
        import psutil
        cpu = psutil.cpu_percent(interval=0.1)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("/")
        return {
            "cpu_pct":   round(cpu, 1),
            "mem_used_mb":  round(mem.used / 1024 / 1024, 1),
            "mem_total_mb": round(mem.total / 1024 / 1024, 1),
            "mem_pct":   round(mem.percent, 1),
            "disk_used_gb":  round(disk.used / 1024**3, 2),
            "disk_total_gb": round(disk.total / 1024**3, 2),
            "disk_pct":  round(disk.percent, 1),
            "psutil":    True,
        }
    except ImportError:
        import os
        return {"psutil": False, "note": "Install psutil for server metrics: pip install psutil"}
    except Exception as e:
        return {"psutil": False, "error": str(e)}
