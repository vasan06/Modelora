"""storage/file_store.py - File ops + process-safe session cache."""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import threading
import time

import pandas as pd

import config

_cache: dict = {}
_lock = threading.RLock()


def safe_name(name: str, fallback: str = "dataset") -> str:
    stem = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(name or "")).strip("._")
    return stem[:100] or fallback


def scoped_name(username: str | None, name: str, fallback: str = "dataset") -> str:
    base = safe_name(name, fallback)
    if not username:
        return base
    digest = hashlib.sha256(str(username).encode("utf-8")).hexdigest()[:10]
    return f"{digest}_{base}"


def _cache_path(k: str) -> str:
    digest = hashlib.sha256(k.encode("utf-8")).hexdigest()
    return os.path.join(config.CACHE_DIR, f"{digest}.json")


def cache_set(k, v):
    payload = {"key": k, "value": v, "ts": time.time()}
    path = _cache_path(k)
    tmp = f"{path}.{os.getpid()}.tmp"
    with _lock:
        _cache[k] = v
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, default=str)
        os.replace(tmp, path)


def cache_get(k):
    with _lock:
        if k in _cache:
            return _cache.get(k)

    path = _cache_path(k)
    try:
        with open(path, encoding="utf-8") as f:
            payload = json.load(f)
        if payload.get("key") != k:
            return None
        value = payload.get("value")
        with _lock:
            _cache[k] = value
        return value
    except FileNotFoundError:
        return None
    except Exception:
        return None


def cache_clear_user(username: str):
    prefix = f"{username}:"
    with _lock:
        keys = [k for k in _cache if k.startswith(prefix)]
        for k in keys:
            del _cache[k]

    try:
        for fn in os.listdir(config.CACHE_DIR):
            if not fn.endswith(".json"):
                continue
            path = os.path.join(config.CACHE_DIR, fn)
            try:
                with open(path, encoding="utf-8") as f:
                    payload = json.load(f)
                if str(payload.get("key", "")).startswith(prefix):
                    os.remove(path)
            except Exception:
                pass
    except FileNotFoundError:
        pass


def decode_upload(content: str, filename: str, username: str | None = None) -> str:
    _, b64 = content.split(",", 1)
    dest = os.path.join(config.UPLOAD_DIR, scoped_name(username, filename, "upload"))
    with open(dest, "wb") as f:
        f.write(base64.b64decode(b64))
    return dest


def size_ok(path: str) -> bool:
    return os.path.getsize(path) <= config.MAX_FILE_B


def export_predictions(rows: list, name: str, username: str | None = None) -> str:
    path = os.path.join(config.EXPORT_DIR, f"{scoped_name(username, name)}_predictions.csv")
    pd.DataFrame(rows).to_csv(path, index=False)
    return path


def export_processed(df: pd.DataFrame, name: str, username: str | None = None) -> str:
    path = os.path.join(config.EXPORT_DIR, f"{scoped_name(username, name)}_processed.csv")
    df.to_csv(path, index=False)
    return path


def export_summary(data: dict, name: str, username: str | None = None) -> str:
    path = os.path.join(config.EXPORT_DIR, f"{scoped_name(username, name)}_summary.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)
    return path
