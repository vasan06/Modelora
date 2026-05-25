"""db/mongo_store.py – Experiment metadata with MongoDB / in-memory fallback."""
from __future__ import annotations
import logging
import time

logger = logging.getLogger(__name__)
_db = None
_mem: dict[str, list] = {"experiments": [], "uploads": []}


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
        logger.info("MongoDB experiments OK")
    except Exception as e:
        logger.warning("MongoDB unavailable: %s", e)
        _db = None
    return _db


def log_upload(filename, rows, cols, path, username="anon"):
    if username == "demo@ml.local":
        return
    doc = {
        "filename": filename,
        "rows": rows,
        "cols": cols,
        "path": path,
        "username": username,
        "ts": time.time(),
    }
    db = _get_db()
    if db is not None:
        db["uploads"].insert_one(doc)
    else:
        _mem["uploads"].append(doc)


def log_experiment(dataset, algo, algo_type, metrics, username="anon"):
    if username == "demo@ml.local":
        return
    safe = {}
    for k, v in metrics.items():
        if isinstance(v, (int, float)):
            safe[k] = round(float(v), 6)
        elif isinstance(v, str):
            safe[k] = v

    doc = {
        "dataset": dataset,
        "algo": algo,
        "algo_type": algo_type,
        "metrics": safe,
        "username": username,
        "ts": time.time(),
    }
    db = _get_db()
    if db is not None:
        db["experiments"].insert_one(doc)
    else:
        _mem["experiments"].append(doc)


def list_experiments(username=None, limit=50):
    db = _get_db()
    if db is not None:
        q = {"username": username} if username else {}
        return list(db["experiments"].find(q, {"_id": 0}).sort("ts", -1).limit(limit))

    exps = _mem["experiments"]
    if username:
        exps = [e for e in exps if e.get("username") == username]
    return list(reversed(exps[-limit:]))


def stats(username=None):
    try:
        exps = list_experiments(username, 1000)
        return {
            "total": len(exps),
            "algorithms": list({e["algo"] for e in exps}),
            "last": exps[0]["ts"] if exps else None,
        }
    except Exception:
        return {"total": 0, "algorithms": [], "last": None}