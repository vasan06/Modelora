"""middleware/security.py — Security middleware, rate limiting, lockout. Email-keyed."""
from __future__ import annotations
import re, time, hashlib, logging, html, ipaddress
from collections import defaultdict
from functools import wraps
from typing import Callable, Any
from flask import request, jsonify, g, current_app

logger = logging.getLogger(__name__)

_rate_store: dict[str, list[float]] = defaultdict(list)

SECURITY_HEADERS = {
    "X-Content-Type-Options":  "nosniff",
    "X-Frame-Options":         "DENY",
    "X-XSS-Protection":        "1; mode=block",
    "Referrer-Policy":         "strict-origin-when-cross-origin",
    "Permissions-Policy":      "geolocation=(), camera=(), microphone=()",
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self' https://cdn.plot.ly https://fonts.googleapis.com 'unsafe-inline'; "
        "style-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com 'unsafe-inline'; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: blob:; "
        "connect-src 'self'; "
        "frame-ancestors 'none';"
    ),
}

def apply_security_headers(response):
    for k, v in SECURITY_HEADERS.items():
        response.headers[k] = v
    return response

def rate_limit(max_calls: int, window_seconds: int = 60):
    def decorator(fn: Callable) -> Callable:
        @wraps(fn)
        def wrapper(*args, **kwargs):
            ip  = _get_ip()
            key = f"{fn.__name__}:{ip}"
            now = time.time()
            _rate_store[key] = [t for t in _rate_store[key] if t > now - window_seconds]
            if len(_rate_store[key]) >= max_calls:
                logger.warning("Rate limit exceeded: %s %s", key, len(_rate_store[key]))
                _audit("rate_limit", f"endpoint={fn.__name__}", ip=ip, severity="warn")
                return jsonify({"ok": False, "msg": f"Too many requests. Please wait {window_seconds}s.", "retry_after": window_seconds}), 429
            _rate_store[key].append(now)
            return fn(*args, **kwargs)
        return wrapper
    return decorator

MAX_FAILED_ATTEMPTS = 10          # raised from 5 — less aggressive during dev
LOCKOUT_DURATION    = 5 * 60      # 5 minutes (was 30)

def _lookup_user(identifier: str):
    """Find user by email OR username field."""
    try:
        from db.admin_store import get_db
        db = get_db()
        if db is None:
            return None, None
        ident = identifier.strip().lower()
        u = db["users"].find_one({"email": ident}, {"_id": 0})
        if u is None:
            u = db["users"].find_one({"username": ident}, {"_id": 0})
        return db, u
    except Exception as e:
        logger.error("User lookup error: %s", e)
        return None, None

def check_lockout(identifier: str) -> tuple[bool, str]:
    db, user = _lookup_user(identifier)
    if db is None or user is None:
        return False, ""
    if user.get("is_locked"):
        locked_until = user.get("locked_until", 0)
        if locked_until and locked_until > time.time():
            remaining = int((locked_until - time.time()) / 60) + 1
            return True, f"Account locked. Try again in {remaining} minute(s)."
        if locked_until and locked_until <= time.time():
            db["users"].update_one({"email": identifier.strip().lower()}, {"$set": {"is_locked": False, "failed_attempts": 0}})
            return False, ""
        return True, "This account has been locked by an administrator. Contact support to restore access."
    return False, ""

def record_failed_login(identifier: str, ip: str):
    db, user = _lookup_user(identifier)
    if db is None or user is None:
        return
    email = user.get("email", identifier.strip().lower())
    result = db["users"].find_one_and_update(
        {"email": email},
        {"$inc": {"failed_attempts": 1}},
        return_document=True,
    )
    if result:
        attempts = result.get("failed_attempts", 0) + 1
        if attempts >= MAX_FAILED_ATTEMPTS:
            db["users"].update_one({"email": email}, {"$set": {"is_locked": True, "locked_until": time.time() + LOCKOUT_DURATION}})
            logger.warning("Account locked: %s after %d failures from %s", email, attempts, ip)
            _audit("account_locked", f"email={email} failures={attempts}", ip=ip, severity="critical")

def record_successful_login(identifier: str, ip: str):
    db, user = _lookup_user(identifier)
    if db is None or user is None:
        return
    email = user.get("email", identifier.strip().lower())
    db["users"].update_one({"email": email}, {"$set": {"failed_attempts": 0, "last_login": time.time(), "last_login_ip": ip}, "$inc": {"login_count": 1}})

def require_role(role: str = "admin"):
    def decorator(fn: Callable) -> Callable:
        @wraps(fn)
        def wrapper(*args, **kwargs):
            from db.user_store import verify_token
            from db.admin_store import get_db

            token = request.headers.get("Authorization", "").replace("Bearer ", "") or request.args.get("token", "")
            secret = current_app.config.get("SECRET_KEY", "")
            email = verify_token(token, secret)

            if not email:
                return jsonify({"ok": False, "msg": "Unauthorized"}), 401

            db = get_db()
            if db is not None:
                u = db["users"].find_one({"email": email}, {"role": 1, "email": 1, "username": 1})
                if u is None:
                    u = db["users"].find_one({"username": email}, {"role": 1, "email": 1, "username": 1})

                if not u or u.get("role") != role:
                    return jsonify({"ok": False, "msg": "Admin access required"}), 403

            g.current_user = email
            return fn(*args, **kwargs)
        return wrapper
    return decorator

def _get_ip() -> str:
    for hdr in ("X-Forwarded-For", "X-Real-IP"):
        v = request.headers.get(hdr, "").split(",")[0].strip()
        if v:
            try:
                ipaddress.ip_address(v)
                return v
            except ValueError:
                pass
    return request.remote_addr or "0.0.0.0"

def sanitize_str(s: Any, max_len: int = 256) -> str:
    return html.escape(str(s or "").strip())[:max_len]

def _audit(action: str, details: str = "", ip: str = "", severity: str = "info"):
    try:
        from db.admin_store import get_db
        db = get_db()
        doc = {"action": action, "details": details[:500], "ip_address": ip[:64],
               "timestamp": time.time(), "severity": severity,
               "actor": getattr(g, "current_user", "system")}
        if db is not None:
            db["audit_log"].insert_one(doc)
        else:
            from db.admin_store import _mem_audit
            _mem_audit.append(doc)
    except Exception as e:
        logger.debug("Audit write error: %s", e)


def sanitize_dict(data: Any, allowed_keys=None):
    """Recursively sanitize string values inside dictionaries/lists."""
    if isinstance(data, dict):
        d2 = {sanitize_str(k, 128): sanitize_dict(v) for k, v in data.items()}
        if allowed_keys:
            d2 = {k:v for k,v in d2.items() if k in allowed_keys}
        return d2
    if isinstance(data, list):
        return [sanitize_dict(v) for v in data]
    if isinstance(data, tuple):
        return tuple(sanitize_dict(v) for v in data)
    if isinstance(data, str):
        return sanitize_str(data, 2000)
    return data
