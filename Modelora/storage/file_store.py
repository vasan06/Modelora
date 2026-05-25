"""storage/file_store.py – File ops + session cache."""
from __future__ import annotations
import base64, json, os
import pandas as pd
import config

_cache: dict = {}
def cache_set(k, v): _cache[k] = v
def cache_get(k):    return _cache.get(k)
def cache_clear_user(username: str):
    keys = [k for k in _cache if k.startswith(f"{username}:")]
    for k in keys:
        del _cache[k]

def decode_upload(content: str, filename: str) -> str:
    _, b64 = content.split(",", 1)
    dest = os.path.join(config.UPLOAD_DIR, filename)
    with open(dest, "wb") as f: f.write(base64.b64decode(b64))
    return dest

def size_ok(path: str) -> bool:
    return os.path.getsize(path) <= config.MAX_FILE_B

def export_predictions(rows: list, name: str) -> str:
    path = os.path.join(config.EXPORT_DIR, f"{name}_predictions.csv")
    pd.DataFrame(rows).to_csv(path, index=False)
    return path

def export_processed(df: pd.DataFrame, name: str) -> str:
    path = os.path.join(config.EXPORT_DIR, f"{name}_processed.csv")
    df.to_csv(path, index=False)
    return path

def export_summary(data: dict, name: str) -> str:
    path = os.path.join(config.EXPORT_DIR, f"{name}_summary.json")
    with open(path,"w") as f: json.dump(data, f, indent=2, default=str)
    return path
