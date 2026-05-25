"""api/export.py"""
import json, os
from flask import Blueprint, send_file, jsonify, request, current_app
from api.utils import require_auth
from storage import file_store
import config

exp_bp = Blueprint("export", __name__)
def _s(): return current_app.config["SECRET_KEY"]

@exp_bp.get("/api/export/predictions")
def predictions():
    u = require_auth(request, _s()) or "anon"
    name = file_store.cache_get(f"{u}:name") or "dataset"
    path = os.path.join(config.EXPORT_DIR, f"{name}_predictions.csv")
    if not os.path.exists(path): return jsonify({"ok":False,"msg":"No predictions"}),404
    return send_file(path, as_attachment=True)

@exp_bp.get("/api/export/processed")
def processed():
    u = require_auth(request, _s()) or "anon"
    name = file_store.cache_get(f"{u}:name") or "dataset"
    path = os.path.join(config.PROCESSED_DIR, f"{name}_processed.csv")
    if not os.path.exists(path): return jsonify({"ok":False,"msg":"No processed file"}),404
    return send_file(path, as_attachment=True)

@exp_bp.get("/api/export/arff")
def arff():
    u = require_auth(request, _s()) or "anon"
    path = file_store.cache_get(f"{u}:arff")
    if not path or not os.path.exists(path): return jsonify({"ok":False,"msg":"No ARFF"}),404
    return send_file(path, as_attachment=True)

@exp_bp.get("/api/export/summary")
def summary():
    u = require_auth(request, _s()) or "anon"
    rj = file_store.cache_get(f"{u}:result")
    if not rj: return jsonify({"ok":False,"msg":"No results"}),404
    name = file_store.cache_get(f"{u}:name") or "dataset"
    path = file_store.export_summary(json.loads(rj), name)
    return send_file(path, as_attachment=True)

@exp_bp.get("/api/experiments")
def experiments():
    u = require_auth(request, _s())
    if not u:
        return jsonify({"ok": False, "msg": "Unauthorized"}), 401
    try:
        from db import mongo_store
        exps = mongo_store.list_experiments(u)
        return jsonify({"ok": True, "experiments": exps})
    except Exception as e:
        return jsonify({"ok": True, "experiments": [], "warning": str(e)})
