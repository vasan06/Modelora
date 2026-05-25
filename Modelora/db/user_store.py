"""db/user_store.py – Email-based auth: PBKDF2 passwords + lightweight JWT.

Login identifier: EMAIL (not username).
Display name derived from the email local-part on registration.
Admin role auto-assigned when email matches config.ADMIN_EMAIL_PATTERNS.
"""
from __future__ import annotations
import base64, hashlib, hmac, json, logging, re, time

logger = logging.getLogger(__name__)


# ── Password hashing ──────────────────────────────────────────────────────────
def _hash_pw(pw: str) -> str:
    salt = base64.b64encode(hashlib.sha256(pw.encode()).digest()).decode()[:16]
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 260_000)
    return f"{salt}${base64.b64encode(dk).decode()}"


def _check_pw(pw: str, stored: str) -> bool:
    try:
        salt, dk_b64 = stored.split("$", 1)
        dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 260_000)
        return hmac.compare_digest(base64.b64encode(dk).decode(), dk_b64)
    except Exception:
        return False


# ── JWT ───────────────────────────────────────────────────────────────────────
def _b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _b64ud(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (4 - len(s) % 4))


def make_token(uid: str, secret: str, exp_h: int = 48) -> str:
    h = _b64u(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    p = _b64u(json.dumps({"sub": uid, "exp": int(time.time()) + exp_h * 3600}).encode())
    sig = _b64u(hmac.new(secret.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest())
    return f"{h}.{p}.{sig}"


def verify_token(token: str, secret: str) -> str | None:
    try:
        h, p, s = token.split(".")
        expected = _b64u(hmac.new(secret.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(s, expected):
            return None
        payload = json.loads(_b64ud(p))
        if payload["exp"] < time.time():
            return None
        return payload["sub"]   # returns email
    except Exception:
        return None


# ── Email helpers ─────────────────────────────────────────────────────────────
_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def _norm_email(raw: str) -> str:
    return raw.strip().lower()


def _display_name(email: str) -> str:
    """alice.smith@gmail.com -> Alice Smith"""
    local = email.split("@")[0]
    return " ".join(p.capitalize() for p in re.split(r'[._\-]+', local))


# ── DB layer ──────────────────────────────────────────────────────────────────
_db = None
_mem: dict[str, dict] = {}   # keyed by normalised email


def _get_db():
    global _db
    if _db is not None:
        return _db
    try:
        import config
        from pymongo import MongoClient

        c = MongoClient(config.MONGO_URI, serverSelectionTimeoutMS=2000)
        c.server_info()
        _db = c[config.MONGO_DB]
        _db["users"].create_index("email", unique=True)
        try:
            _db["users"].create_index("username", unique=True, sparse=True)
        except Exception:
            pass
        logger.info("MongoDB users OK")
    except Exception as e:
        logger.warning("MongoDB unavailable (%s); using SQLite", e)
        import sqlite3
        _db = "sqlite"
        # Ensure table exists
        conn = sqlite3.connect("instance/modelora_users.sqlite3")
        conn.execute("""CREATE TABLE IF NOT EXISTS users (
            email TEXT PRIMARY KEY,
            data TEXT
        )""")
        conn.commit()
        conn.close()
    return _db


def register(email: str, password: str, display_name: str = "") -> dict:
    email = _norm_email(email)

    if not _EMAIL_RE.match(email):
        return {"ok": False, "msg": "Please enter a valid email address"}
    if len(password) < 6:
        return {"ok": False, "msg": "Password must be at least 6 characters"}

    import config
    role = "admin" if config.is_admin_email(email) else "user"
    dname = display_name.strip() or _display_name(email)

    doc = {
        "email": email,
        "username": email,
        "display_name": dname,
        "password": _hash_pw(password),
        "role": role,
        "created_at": time.time(),
        "experiments": 0,
        "tutorial_done": False,
        "is_locked": False,
        "failed_attempts": 0,
        "login_count": 0,
        "last_login": None,
    }

    db = _get_db()
    if db is not None and db != "sqlite":
        try:
            db["users"].insert_one(doc)
        except Exception:
            return {"ok": False, "msg": "An account with that email already exists"}
    elif db == "sqlite":
        import sqlite3, json
        conn = sqlite3.connect("instance/modelora_users.sqlite3")
        try:
            conn.execute("INSERT INTO users VALUES (?, ?)", (email, json.dumps(doc)))
            conn.commit()
        except sqlite3.IntegrityError:
            conn.close()
            return {"ok": False, "msg": "An account with that email already exists"}
        conn.close()
    else:
        if email in _mem:
            return {"ok": False, "msg": "An account with that email already exists"}
        _mem[email] = doc

    return {
        "ok": True,
        "email": email,
        "display_name": dname,
        "username": email,
        "role": role,
    }


def login(email: str, password: str, secret: str) -> dict:
    email = _norm_email(email)
    db = _get_db()

    if db is not None and db != "sqlite":
        user = db["users"].find_one({"email": email}, {"_id": 0})
        if user is None:
            user = db["users"].find_one({"username": email}, {"_id": 0})
    elif db == "sqlite":
        import sqlite3, json
        conn = sqlite3.connect("instance/modelora_users.sqlite3")
        row = conn.execute("SELECT data FROM users WHERE email = ?", (email,)).fetchone()
        if row:
            user = json.loads(row[0])
        else:
            user = None
        conn.close()
    else:
        user = _mem.get(email)

    if user is None or not _check_pw(password, user.get("password", "")):
        return {"ok": False, "msg": "Incorrect email or password"}

    if user.get("is_locked"):
        return {"ok": False, "msg": "This account has been locked. Contact an admin."}

    if db is not None and db != "sqlite":
        db["users"].update_one(
            {"email": email},
            {"$set": {"last_login": time.time()}, "$inc": {"login_count": 1}},
        )
    elif db == "sqlite":
        import sqlite3, json
        user["last_login"] = time.time()
        user["login_count"] = user.get("login_count", 0) + 1
        conn = sqlite3.connect("instance/modelora_users.sqlite3")
        conn.execute("UPDATE users SET data = ? WHERE email = ?", (json.dumps(user), email))
        conn.commit()
        conn.close()
    elif email in _mem:
        _mem[email]["last_login"] = time.time()
        _mem[email]["login_count"] = _mem[email].get("login_count", 0) + 1

    dname = user.get("display_name") or _display_name(email)
    role = user.get("role", "user")

    return {
        "ok": True,
        "token": make_token(email, secret),
        "email": email,
        "username": email,
        "display_name": dname,
        "tutorial_done": user.get("tutorial_done", False),
        "role": role,
    }


def get_user(identifier: str) -> dict | None:
    identifier = _norm_email(identifier)
    db = _get_db()

    if db is not None and db != "sqlite":
        u = db["users"].find_one({"email": identifier}, {"_id": 0, "password": 0})
        if u is None:
            u = db["users"].find_one({"username": identifier}, {"_id": 0, "password": 0})
    elif db == "sqlite":
        import sqlite3, json
        conn = sqlite3.connect("instance/modelora_users.sqlite3")
        row = conn.execute("SELECT data FROM users WHERE email = ?", (identifier,)).fetchone()
        if row:
            u = json.loads(row[0])
            u.pop("password", None)
        else:
            u = None
        conn.close()
    else:
        raw = _mem.get(identifier)
        u = {k: v for k, v in raw.items() if k != "password"} if raw else None

    return u or None


def mark_tutorial_done(identifier: str):
    identifier = _norm_email(identifier)
    db = _get_db()

    if db is not None and db != "sqlite":
        db["users"].update_one({"email": identifier}, {"$set": {"tutorial_done": True}})
    elif db == "sqlite":
        import sqlite3, json
        conn = sqlite3.connect("instance/modelora_users.sqlite3")
        row = conn.execute("SELECT data FROM users WHERE email = ?", (identifier,)).fetchone()
        if row:
            user = json.loads(row[0])
            user["tutorial_done"] = True
            conn.execute("UPDATE users SET data = ? WHERE email = ?", (json.dumps(user), identifier))
            conn.commit()
        conn.close()
    elif identifier in _mem:
        _mem[identifier]["tutorial_done"] = True


def increment_experiments(identifier: str):
    identifier = _norm_email(identifier)
    db = _get_db()

    if db is not None and db != "sqlite":
        db["users"].update_one({"email": identifier}, {"$inc": {"experiments": 1}})
    elif db == "sqlite":
        import sqlite3, json
        conn = sqlite3.connect("instance/modelora_users.sqlite3")
        row = conn.execute("SELECT data FROM users WHERE email = ?", (identifier,)).fetchone()
        if row:
            user = json.loads(row[0])
            user["experiments"] = user.get("experiments", 0) + 1
            conn.execute("UPDATE users SET data = ? WHERE email = ?", (json.dumps(user), identifier))
            conn.commit()
        conn.close()
    elif identifier in _mem:
        _mem[identifier]["experiments"] = _mem[identifier].get("experiments", 0) + 1