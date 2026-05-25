"""api/dataset.py"""
from __future__ import annotations
import os
from flask import Blueprint, request, jsonify, current_app
from api.utils import require_auth
from core import preprocessor, analyzer, arff_converter
from core.preprocessor import quality_score
from db import mongo_store
from storage import file_store
import config

ds_bp = Blueprint("dataset", __name__)
def _s(): return current_app.config["SECRET_KEY"]

def _builtin(name: str):
    import pandas as pd
    import numpy as np
    from sklearn import datasets as skd
    from sklearn.datasets import (
        make_blobs,
        make_circles,
        make_classification,
        make_friedman1,
        make_friedman2,
        make_friedman3,
        make_moons,
        make_regression,
        make_s_curve,
        make_swiss_roll,
    )

    rng = np.random.default_rng(config.RAND)

    def cls_df(X, y, cols=None, target="target"):
        cols = cols or [f"feature_{i+1}" for i in range(X.shape[1])]
        df = pd.DataFrame(X, columns=cols)
        df[target] = y
        return df, name

    def positive_target(y, lo=0.5, hi=5.0):
        y = np.asarray(y, dtype=float)
        span = float(y.max() - y.min()) or 1.0
        return lo + (y - y.min()) / span * (hi - lo)

    if name == "iris":
        d = skd.load_iris()
    elif name == "wine":
        d = skd.load_wine()
    elif name == "breast_cancer":
        d = skd.load_breast_cancer()
    elif name == "digits":
        d = skd.load_digits()
        return cls_df(d.data[:500], d.target[:500], [f"pixel_{i}" for i in range(d.data.shape[1])])
    elif name == "diabetes":
        d = skd.load_diabetes()
    elif name == "california":
        X, y = make_regression(
            n_samples=1200, n_features=8, n_informative=6,
            random_state=config.RAND, noise=10
        )
        cols = [
            "MedInc", "HouseAge", "AveRooms", "AveBedrms",
            "Population", "AveOccup", "Latitude", "Longitude",
        ]
        df = pd.DataFrame(X, columns=cols)
        df["MedHouseVal"] = positive_target(y)
        return df, name
    elif name == "moons":
        X, y = make_moons(n_samples=300, noise=0.1, random_state=config.RAND)
        return cls_df(X, y, ["feature_1", "feature_2"])
    elif name == "circles":
        X, y = make_circles(n_samples=300, noise=0.05, random_state=config.RAND)
        return cls_df(X, y, ["feature_1", "feature_2"])
    elif name == "blobs":
        X, y = make_blobs(n_samples=300, centers=3, random_state=config.RAND)
        return cls_df(X, y, ["feature_1", "feature_2"])
    elif name == "classification":
        X, y = make_classification(
            n_samples=240, n_features=10, n_informative=5,
            n_redundant=2, random_state=config.RAND
        )
        return cls_df(X, y)
    elif name == "regression":
        X, y = make_regression(
            n_samples=240, n_features=10, n_informative=5,
            random_state=config.RAND, noise=8
        )
        return cls_df(X, y)
    elif name in ("friedman1", "friedman2", "friedman3"):
        funcs = {"friedman1": make_friedman1, "friedman2": make_friedman2, "friedman3": make_friedman3}
        X, y = funcs[name](n_samples=240, random_state=config.RAND)
        return cls_df(X, y)
    elif name == "olivetti":
        cached = os.path.join(config.PROCESSED_DIR, "olivetti_processed.csv")
        if os.path.exists(cached):
            return pd.read_csv(cached), name
        try:
            from sklearn.datasets import fetch_olivetti_faces
            d = fetch_olivetti_faces(download_if_missing=False)
            X = d.data[:200]
            df = pd.DataFrame(X[:, :20], columns=[f"pixel_{i}" for i in range(20)])
            df["target"] = d.target[:200]
            return df, name
        except Exception:
            X, y = make_classification(
                n_samples=200, n_features=20, n_informative=10,
                n_redundant=2, n_classes=10, n_clusters_per_class=1,
                random_state=config.RAND
            )
            return cls_df(X, y, [f"pixel_{i}" for i in range(20)])
    elif name == "swiss_roll":
        X, _ = make_swiss_roll(n_samples=300, random_state=config.RAND)
        return pd.DataFrame(X, columns=["x", "y", "z"]), name
    elif name == "s_curve":
        X, _ = make_s_curve(n_samples=300, random_state=config.RAND)
        return pd.DataFrame(X, columns=["x", "y", "z"]), name
    elif name == "anisotropic":
        X, _ = make_blobs(
            n_samples=300, cluster_std=[1.0, 2.5, 0.5],
            centers=[[0, 0], [5, 5], [0, 5]], random_state=config.RAND
        )
        return pd.DataFrame(X, columns=["feature_1", "feature_2"]), name
    elif name == "varied_var":
        X, _ = make_blobs(n_samples=300, cluster_std=[1.0, 1.5, 0.8], random_state=config.RAND)
        return pd.DataFrame(X, columns=["feature_1", "feature_2"]), name
    elif name == "noisy_moons":
        X, _ = make_moons(n_samples=300, noise=0.2, random_state=config.RAND)
        return pd.DataFrame(X, columns=["feature_1", "feature_2"]), name
    elif name == "noisy_circles":
        X, _ = make_circles(n_samples=300, noise=0.1, random_state=config.RAND)
        return pd.DataFrame(X, columns=["feature_1", "feature_2"]), name
    elif name == "no_structure":
        X = rng.uniform(0, 1, (300, 2))
        return pd.DataFrame(X, columns=["feature_1", "feature_2"]), name
    elif name == "20news_small":
        X, y = make_classification(
            n_samples=240, n_features=40, n_informative=18, n_redundant=4,
            n_classes=4, n_clusters_per_class=1, class_sep=1.2,
            random_state=config.RAND
        )
        labels = np.array(["comp.graphics", "rec.sport", "sci.med", "talk.politics"])
        return cls_df(X, labels[y], [f"tfidf_term_{i+1}" for i in range(X.shape[1])], "newsgroup")
    elif name == "banknote":
        X, y = make_classification(
            n_samples=240, n_features=4, n_informative=3,
            n_redundant=0, n_repeated=0, class_sep=1.4,
            random_state=config.RAND
        )
        return cls_df(X, y, ["variance", "skewness", "curtosis", "entropy"], "authentic")
    elif name == "spambase_small":
        X, y = make_classification(
            n_samples=240, n_features=30, n_informative=15,
            n_redundant=5, random_state=config.RAND
        )
        return cls_df(X, y, [f"word_freq_{i+1}" for i in range(X.shape[1])], "is_spam")
    elif name == "titanic_sim":
        X, y = make_classification(n_samples=240, n_features=5, n_informative=3, random_state=config.RAND)
        return cls_df(X, y, ["age", "fare", "pclass", "sibsp", "parch"], "survived")
    elif name == "boston_sim":
        X, y = make_regression(n_samples=240, n_features=13, n_informative=10, random_state=config.RAND, noise=6)
        cols = ["crim", "zn", "indus", "chas", "nox", "rm", "age", "dis", "rad", "tax", "ptratio", "b", "lstat"]
        df = pd.DataFrame(X, columns=cols)
        df["medv"] = positive_target(y, 5, 50)
        return df, name
    elif name == "linnerud":
        d = skd.load_linnerud()
        df = pd.DataFrame(d.data, columns=d.feature_names)
        df["target"] = d.target[:, 0]
        return df, name
    elif name == "energy_sim":
        X, y = make_regression(n_samples=240, n_features=8, n_informative=6, random_state=config.RAND, noise=6)
        return cls_df(X, positive_target(y, 10, 45), ["x1", "x2", "x3", "x4", "x5", "x6", "x7", "x8"], "y")
    elif name == "auto_mpg_sim":
        X, y = make_regression(n_samples=240, n_features=7, n_informative=6, random_state=config.RAND, noise=4)
        cols = ["cylinders", "displacement", "horsepower", "weight", "acceleration", "model_year", "origin"]
        return cls_df(X, positive_target(y, 8, 48), cols, "mpg")
    elif name == "stock_sim":
        dates = pd.date_range("2020-01-01", periods=240)
        prices = np.cumsum(rng.normal(size=240)) + 100
        volume = rng.integers(1_000_000, 10_000_000, 240)
        return pd.DataFrame({"date": dates, "close": prices, "volume": volume}), name
    elif name == "weather_sim":
        dates = pd.date_range("2020-01-01", periods=240)
        df = pd.DataFrame({
            "date": dates,
            "temp": rng.uniform(0, 40, 240),
            "humidity": rng.uniform(20, 100, 240),
            "pressure": rng.uniform(990, 1030, 240),
            "precipitation": rng.uniform(0, 100, 240),
        })
        return df, name
    elif name == "sensor_sim":
        time_idx = np.arange(240)
        df = pd.DataFrame({
            "timestamp": time_idx,
            "sensor_1": np.sin(time_idx * 0.05) + rng.normal(size=240) * 0.1,
            "sensor_2": np.cos(time_idx * 0.03) + rng.normal(size=240) * 0.1,
            "sensor_3": rng.normal(size=240),
        })
        return df, name
    elif name == "survey_sim":
        df = pd.DataFrame({
            "age": rng.integers(18, 80, 240),
            "income": rng.integers(20_000, 200_000, 240),
            "education": rng.integers(0, 5, 240),
            "satisfaction": rng.integers(1, 6, 240),
        })
        return df, name
    else:
        raise ValueError(f"Unknown built-in: {name}")

    df = pd.DataFrame(d.data, columns=d.feature_names)
    df["target"] = d.target
    return df, name

def _process(df, username):
    val = preprocessor.validate(df)
    if not val["ok"]: return None, val["issues"]
    res = preprocessor.preprocess(df)
    pdf = res["df"]
    smry = preprocessor.summary(pdf)
    qual = quality_score(pdf)
    analysis_df = pdf.sample(min(len(pdf), config.MAX_ANALYSIS_ROWS), random_state=42) if len(pdf) else pdf
    anal = analyzer.full_analysis(analysis_df)
    return {"processed_json": preprocessor.df_to_json(pdf),
            "schema": res["schema"], "report": res["report"],
            "warnings": res.get("warnings",[]),
            "summary": smry, "analysis": anal,
            "quality": qual,
            "columns": list(pdf.columns),
            "raw_columns": list(df.columns)}, None

@ds_bp.post("/api/dataset/upload")
def upload():
    username = require_auth(request, _s())
    if not username:
        return jsonify({"ok": False, "msg": "Please sign in to upload your own dataset"}), 401
    if username == "demo@ml.local":
        return jsonify({"ok": False, "msg": "External datasets are not allowed in demo account. For that, sign in or create an account to continue."}), 403
    data = request.get_json(silent=True) or {}
    content  = data.get("content")
    filename = data.get("filename","upload.csv")
    if not content: return jsonify({"ok":False,"msg":"No file content"}), 400
    b64_size = len(content.split(",",1)[-1]) * 3 // 4
    if b64_size > config.MAX_FILE_B:
        return jsonify({"ok":False,"msg":f"File exceeds {config.MAX_FILE_MB} MB"}), 400
    path = file_store.decode_upload(content, filename, username)
    try:
        df = preprocessor.load_dataset(path)
    except Exception as e:
        return jsonify({"ok":False,"msg":str(e)}), 400
    result, errs = _process(df, username)
    if errs: return jsonify({"ok":False,"msg":"; ".join(errs)}), 400
    name = os.path.splitext(filename)[0]
    storage_name = file_store.scoped_name(username, name)
    processed_path = preprocessor.save_processed(df, storage_name)
    arff_path = arff_converter.save_arff(df, storage_name)
    mongo_store.log_upload(filename, df.shape[0], df.shape[1], path, username)
    file_store.cache_set(f"{username}:df", result["processed_json"])
    file_store.cache_set(f"{username}:name", name)
    file_store.cache_set(f"{username}:processed", processed_path)
    file_store.cache_set(f"{username}:arff", arff_path)
    return jsonify({"ok":True,"name":name,**result})

@ds_bp.post("/api/dataset/builtin")
def builtin():
    username = "demo"
    try:
        auth_user = require_auth(request, _s())
        if auth_user:
            username = auth_user
    except Exception:
        pass
    data = request.get_json(silent=True) or {}
    name = data.get("name")
    if not name: return jsonify({"ok":False,"msg":"No dataset name"}), 400
    try:
        df, name = _builtin(name)
    except ValueError as e:
        return jsonify({"ok":False,"msg":str(e)}), 400
    except Exception as e:
        current_app.logger.exception("Built-in dataset failed: %s", name)
        return jsonify({"ok":False,"msg":f"Could not load dataset '{name}': {e}"}), 400
    result, errs = _process(df, username)
    if errs: return jsonify({"ok":False,"msg":"; ".join(errs)}), 400
    storage_name = file_store.scoped_name(username, name)
    processed_path = preprocessor.save_processed(df, storage_name)
    arff_path = arff_converter.save_arff(df, storage_name)
    mongo_store.log_upload(name, df.shape[0], df.shape[1], "builtin", username)
    file_store.cache_set(f"{username}:df", result["processed_json"])
    file_store.cache_set(f"{username}:name", name)
    file_store.cache_set(f"{username}:processed", processed_path)
    file_store.cache_set(f"{username}:arff", arff_path)
    return jsonify({"ok":True,"name":name,**result})
