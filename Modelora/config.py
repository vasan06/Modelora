import os
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

UPLOAD_DIR    = os.path.join(BASE_DIR, "uploads")
PROCESSED_DIR = os.path.join(BASE_DIR, "processed")
ARFF_DIR      = os.path.join(BASE_DIR, "arff")
EXPORT_DIR    = os.path.join(BASE_DIR, "exports")
LOG_DIR       = os.path.join(BASE_DIR, "logs")

for d in [UPLOAD_DIR, PROCESSED_DIR, ARFF_DIR, EXPORT_DIR, LOG_DIR]:
    os.makedirs(d, exist_ok=True)

MONGO_URI   = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB    = "ml_dashboard_v3"
SECRET_KEY  = os.environ.get("SECRET_KEY", "ml-v3-secret-2025")
JWT_EXP_H   = 48

MAX_FILE_MB  = 50
MAX_FILE_B   = MAX_FILE_MB * 1024 * 1024
PREVIEW_ROWS = 100
RAND         = 42
MAX_ROWS     = 100_000

SMALL_DATASET_ROWS  = 200
CV_FOLDS_DEFAULT    = 5
OVERFIT_GAP_WARN    = 0.10
OVERFIT_GAP_ERROR   = 0.20
CORR_LEAK_THRESHOLD = 0.98

ALLOWED_EXTS = {".csv",".tsv",".xlsx",".xls",".json",".parquet",
                ".xml",".pkl",".pickle",".arff",".db",".sqlite"}
PORT  = 5000
DEBUG = True

# ── Admin detection ─────────────────────────────────────────────────────────
# Emails matching these patterns are auto-assigned admin role on registration.
# Pattern: username part ends with 'admin' or 'manager', or domain is @admin.*
# Examples: admin1@gmail.com, manager@admin.com, sysadmin@company.com
import re as _re
ADMIN_EMAIL_PATTERNS = [
    _re.compile(r'^admin', _re.I),          # username starts with admin
    _re.compile(r'admin\d*@', _re.I),       # adminN@...
    _re.compile(r'manager@', _re.I),        # manager@...
    _re.compile(r'@admin\.', _re.I),        # ...@admin.com / @admin.org
    _re.compile(r'sysadmin@', _re.I),       # sysadmin@...
    _re.compile(r'superadmin@', _re.I),     # superadmin@...
]

def is_admin_email(email: str) -> bool:
    """Return True if the email matches any admin pattern."""
    if not email:
        return False
    return any(p.search(email.lower()) for p in ADMIN_EMAIL_PATTERNS)

# ── Email / SMTP (for password reset OTP) ────────────────────────────────────
#
# ⚠ GMAIL: You MUST use an App Password, NOT your regular Gmail password.
#   Regular password will cause SMTPAuthenticationError (530 5.7.0).
#
# How to get a Gmail App Password:
#   1. Go to https://myaccount.google.com/security
#   2. Enable 2-Step Verification (required)
#   3. Go to https://myaccount.google.com/apppasswords
#   4. Select "Mail" → "Other" → type "Modelora" → Generate
#   5. Copy the 16-character password (e.g. "abcd efgh ijkl mnop")
#   6. Set SMTP_PASS to that 16-char password (no spaces)
#
# Quick setup via environment variables (recommended):
#   export SMTP_HOST=smtp.gmail.com
#   export SMTP_PORT=587
#   export SMTP_USER=your@gmail.com
#   export SMTP_PASS=abcdefghijklmnop    ← 16-char App Password (no spaces)
#
# OR set directly below for development (change before production):
#
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "vasan830002@gmail.com")
# ↓ Replace with your 16-character Gmail App Password (NOT your login password)
SMTP_PASS = os.environ.get("SMTP_PASS", "kujpeionqhplvnla")   # e.g. "abcdefghijklmnop"
SMTP_FROM = os.environ.get("SMTP_FROM", SMTP_USER)
