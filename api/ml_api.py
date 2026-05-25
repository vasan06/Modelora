"""api/ml_api.py"""
from __future__ import annotations
import json, traceback, logging
from flask import Blueprint, request, jsonify, current_app
from api.utils import require_auth
from core import preprocessor
from models import ml_pipeline
from models.ml_pipeline import ALGORITHMS
from db import mongo_store
from storage import file_store

ml_bp = Blueprint("ml", __name__)
logger = logging.getLogger(__name__)
def _s(): return current_app.config["SECRET_KEY"]

@ml_bp.get("/api/ml/algorithms")
def algorithms():
    return jsonify({"ok":True,"algorithms":ALGORITHMS})

@ml_bp.post("/api/ml/run")
def run():
    username = require_auth(request, _s()) or "anon"
    data = request.get_json(silent=True) or {}

    cat         = data.get("algo_category")
    atype       = data.get("algo_type","")
    aname       = data.get("algo_name")
    target      = data.get("target_col")
    feats       = data.get("feature_cols")
    n_clusters  = int(data.get("n_clusters",3))
    train_ratio = float(data.get("train_ratio",0.8))
    cv_folds    = int(data.get("cv_folds",5))

    if not cat or not aname:
        return jsonify({"ok":False,"msg":"algo_category and algo_name required"}),400

    df_json = file_store.cache_get(f"{username}:df")
    ds_name = file_store.cache_get(f"{username}:name") or "dataset"
    if not df_json:
        return jsonify({"ok":False,"msg":"No dataset loaded. Upload or select a dataset first."}),400

    try:
        df = preprocessor.df_from_json(df_json)
    except Exception as e:
        return jsonify({"ok":False,"msg":f"Failed to read dataset: {e}"}),400

    # Validate / auto-fix columns
    if feats:
        avail = set(df.columns)
        feats = [f for f in feats if f in avail]

    if target and target not in df.columns:
        cleaned = preprocessor._clean(target, 0)
        if cleaned in df.columns: target = cleaned
        else:
            return jsonify({"ok":False,
                "msg":f"Target '{target}' not found. Available: {list(df.columns)}"}), 400

    try:
        result = ml_pipeline.run_pipeline(
            df, cat, atype, aname,
            target_col=target, feature_cols=feats,
            n_clusters=n_clusters, train_ratio=train_ratio, cv_folds=cv_folds,
        )
    except ValueError as e:
        return jsonify({"ok":False,"msg":str(e)}),400
    except Exception as e:
        logger.error(traceback.format_exc())
        return jsonify({"ok":False,"msg":str(e)}),500

    # Strip non-serialisable
    clean = {k:v for k,v in result.items() if not callable(v) and k != "model"}

    # Save predictions
    if "predictions" in result and isinstance(result["predictions"],list):
        try:
            pred_path = file_store.export_predictions(result["predictions"], ds_name, username)
            file_store.cache_set(f"{username}:predictions", pred_path)
        except Exception:
            pass

    # Log experiment
    metrics = {k:v for k,v in clean.items()
               if isinstance(v,(int,float)) and k not in ("train_size","test_size","n_clusters")}
    mongo_store.log_experiment(ds_name, aname, atype or cat, metrics, username)
    file_store.cache_set(f"{username}:result", json.dumps(clean, default=str))

    return jsonify({"ok":True,**clean})

@ml_bp.post("/api/ml/whatif")
def whatif():
    """What-if prediction: pass custom feature values, get prediction."""
    username = require_auth(request, _s()) or "anon"
    data = request.get_json(silent=True) or {}
    result_json = file_store.cache_get(f"{username}:result")
    df_json     = file_store.cache_get(f"{username}:df")
    if not result_json or not df_json:
        return jsonify({"ok":False,"msg":"No trained model available"}),400

    res = json.loads(result_json)
    target = res.get("target_col")
    feats  = res.get("feature_cols",[])
    cat    = res.get("algo_category","SML")
    atype  = res.get("algo_type","Classification")
    aname  = res.get("algo_name","")

    if cat != "SML":
        return jsonify({"ok":False,"msg":"What-if only works for supervised models"}),400

    import numpy as np, pandas as pd
    from core.preprocessor import df_from_json
    from models.ml_pipeline import _make, _supervised
    from sklearn.preprocessing import LabelEncoder

    df = df_from_json(df_json)
    user_vals = data.get("values",{})

    # Build single-row input
    row = {}
    for f in feats:
        row[f] = float(user_vals.get(f, df[f].mean() if f in df else 0))
    X = pd.DataFrame([row])[feats].fillna(0).values

    # Retrain quickly on full data for prediction
    try:
        full_res = _supervised(df, target, feats, atype, aname)
        model = full_res.get("_model")
        # Retrain for this request since model not cached
        from models.ml_pipeline import _make as mk
        m = mk(atype, aname)
        X_all = df[feats].select_dtypes(include="number").fillna(0).values
        if atype == "Classification":
            le = LabelEncoder()
            y_all = le.fit_transform(df[target].astype(str))
            m.fit(X_all, y_all)
            pred_enc = m.predict(X)[0]
            pred = str(le.inverse_transform([pred_enc])[0])
            prob = None
            if hasattr(m,"predict_proba"):
                probs = m.predict_proba(X)[0]
                prob = {str(le.inverse_transform([i])[0]): round(float(p),4)
                        for i,p in enumerate(probs)}
        else:
            y_all = pd.to_numeric(df[target],errors="coerce").fillna(0).values
            m.fit(X_all, y_all)
            pred = round(float(m.predict(X)[0]),4)
            prob = None
        return jsonify({"ok":True,"prediction":pred,"probabilities":prob,"features":row})
    except Exception as e:
        logger.error(traceback.format_exc())
        return jsonify({"ok":False,"msg":str(e)}),500
