"""api/utils.py"""
from db.user_store import verify_token
def require_auth(request, secret):
    auth = request.headers.get("Authorization","")
    if auth.startswith("Bearer "): return verify_token(auth[7:], secret)
    return verify_token(request.headers.get("X-Token",""), secret)
