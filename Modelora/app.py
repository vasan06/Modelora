"""app.py – Modelora V6."""
import logging, sys, os, time
os.makedirs("logs", exist_ok=True)
logging.basicConfig(level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s %(message)s",
    handlers=[logging.StreamHandler(sys.stdout),
              logging.FileHandler(os.path.join("logs","app.log"))])

from flask import Flask, send_from_directory, jsonify, request, render_template
import config
from api.auth    import auth_bp
from api.dataset import ds_bp
from api.ml_api  import ml_bp
from api.export  import exp_bp
from api.admin   import admin_bp
from middleware.security import apply_security_headers
from db import admin_store
from flask import send_from_directory

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["SECRET_KEY"]         = config.SECRET_KEY
app.config["MAX_CONTENT_LENGTH"] = config.MAX_FILE_B

for bp in [auth_bp, ds_bp, ml_bp, exp_bp, admin_bp]:
    app.register_blueprint(bp)

app.after_request(apply_security_headers)

# ── Auto health snapshots ─────────────────────────────────────────────────────
_last_snap = 0
@app.before_request
def auto_snapshot():
    global _last_snap
    if time.time() - _last_snap > 30:
        _last_snap = time.time()
        try:
            h = admin_store.get_system_health()
            h["ts"] = time.time()
            db = admin_store.get_db()
            if db is not None:
                db["health_history"].insert_one(h)
                count = db["health_history"].count_documents({})
                if count > 200:
                    oldest = list(db["health_history"].find({},{"_id":1}).sort("ts",1).limit(count-200))
                    db["health_history"].delete_many({"_id":{"$in":[o["_id"] for o in oldest]}})
        except Exception:
            pass

# ── Maintenance mode ──────────────────────────────────────────────────────────
@app.before_request
def check_maintenance():
    path = request.path
    if path.startswith(("/api/auth","/api/admin","/admin","/login","/static","/splash","/maintenance")):
        return None
    try:
        maint = admin_store.get_config("maintenance_mode")
        if maint is True:
            if path.startswith("/api/"):
                return jsonify({"ok":False,"msg":"System under maintenance. Please try again later."}),503
            return send_from_directory("templates","maintenance.html"),503
    except Exception:
        pass
    return None

# ── Page routes ───────────────────────────────────────────────────────────────
@app.get("/")
def landing():
    return render_template("landing.html")

@app.get("/splash")
def splash():
    return send_from_directory("templates", "splash.html")

@app.get("/admin/splash")
def admin_splash():
    return send_from_directory("templates", "admin_splash.html")

@app.get("/login")
def login():
    return send_from_directory("templates", "login.html")

@app.get("/dashboard")
def dashboard():
    return send_from_directory("templates", "dashboard.html")

@app.get("/admin")
def admin():
    return send_from_directory("templates", "admin.html")

@app.get("/maintenance")
def maintenance():
    return send_from_directory("templates", "maintenance.html")

# ── Error handlers ────────────────────────────────────────────────────────────
@app.errorhandler(404)
def not_found(e):    return jsonify({"ok":False,"msg":"Not found"}),404
@app.errorhandler(500)
def server_error(e): logging.getLogger().error("500: %s",e); return jsonify({"ok":False,"msg":"Internal server error"}),500
@app.errorhandler(429)
def too_many(e):     return jsonify({"ok":False,"msg":"Too many requests"}),429

@app.route('/robots.txt')
def robots():
    return send_from_directory('static', 'robots.txt')

@app.route('/sitemap.xml')
def sitemap():
    return send_from_directory('static', 'sitemap.xml')

@app.route('/google2077f6ca169844c1.html')
def google_verify():
    return send_from_directory('static', 'google2077f6ca169844c1.html')

if __name__ == "__main__":
    logging.getLogger().info("Modelora V6 -> http://localhost:%s", config.PORT)
    logging.getLogger().info("Admin Panel  -> http://localhost:%s/admin", config.PORT)
    app.run(debug=config.DEBUG, host="0.0.0.0", port=config.PORT, threaded=True)
