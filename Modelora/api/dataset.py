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
    
    # Classification datasets
    if name == "iris":
        d = skd.load_iris()
    elif name == "wine":
        d = skd.load_wine()
    elif name == "breast_cancer":
        d = skd.load_breast_cancer()
    elif name == "digits":
        d = skd.load_digits()
    # Regression datasets
    elif name == "diabetes":
        d = skd.load_diabetes()
    elif name == "california":
        try:
            from sklearn.datasets import fetch_california_housing
            d = fetch_california_housing()
        except Exception:
            # Fallback: simulate with make_regression using realistic column names
            from sklearn.datasets import make_regression
            X, y = make_regression(n_samples=500, n_features=8, n_informative=6, random_state=42, noise=10)
            cols = ['MedInc', 'HouseAge', 'AveRooms', 'AveBedrms', 'Population', 'AveOccup', 'Latitude', 'Longitude']
            df = pd.DataFrame(X, columns=cols)
            df['MedHouseVal'] = y
            return df, name
    # Synthetic datasets - Classification
    elif name == "moons":
        from sklearn.datasets import make_moons
        X, y = make_moons(n_samples=300, noise=0.1)
        df = pd.DataFrame(X, columns=['feature_1', 'feature_2'])
        df['target'] = y
        return df, name
    elif name == "circles":
        from sklearn.datasets import make_circles
        X, y = make_circles(n_samples=300, noise=0.05)
        df = pd.DataFrame(X, columns=['feature_1', 'feature_2'])
        df['target'] = y
        return df, name
    elif name == "blobs":
        from sklearn.datasets import make_blobs
        X, y = make_blobs(n_samples=300, centers=3)
        df = pd.DataFrame(X, columns=['feature_1', 'feature_2'])
        df['target'] = y
        return df, name
    elif name == "classification":
        from sklearn.datasets import make_classification
        X, y = make_classification(n_samples=200, n_features=10, n_informative=5, n_redundant=2, random_state=42)
        cols = [f'feature_{i+1}' for i in range(X.shape[1])]
        df = pd.DataFrame(X, columns=cols)
        df['target'] = y
        return df, name
    # Synthetic datasets - Regression
    elif name == "regression":
        from sklearn.datasets import make_regression
        X, y = make_regression(n_samples=200, n_features=10, n_informative=5, random_state=42)
        cols = [f'feature_{i+1}' for i in range(X.shape[1])]
        df = pd.DataFrame(X, columns=cols)
        df['target'] = y
        return df, name
    elif name in ("friedman1", "friedman2", "friedman3"):
        from sklearn.datasets import make_friedman1, make_friedman2, make_friedman3
        funcs = {"friedman1": make_friedman1, "friedman2": make_friedman2, "friedman3": make_friedman3}
        X, y = funcs[name](n_samples=200, random_state=42)
        cols = [f'feature_{i+1}' for i in range(X.shape[1])]
        df = pd.DataFrame(X, columns=cols)
        df['target'] = y
        return df, name
    # Unsupervised datasets
    elif name == "olivetti":
        try:
            from sklearn.datasets import fetch_olivetti_faces
            d = fetch_olivetti_faces()
            X = d.data[:50]  # Limit to 50 samples for speed
            df = pd.DataFrame(X[:, :20], columns=[f'pixel_{i}' for i in range(20)])
            df['target'] = d.target[:50]
        except Exception:
            X, y = make_classification(n_samples=100, n_features=20, n_informative=10, random_state=42)
            df = pd.DataFrame(X, columns=[f'pixel_{i}' for i in range(X.shape[1])])
            df['target'] = y
        return df, name
    elif name == "swiss_roll":
        from sklearn.datasets import make_swiss_roll
        X, _ = make_swiss_roll(n_samples=200, random_state=42)
        df = pd.DataFrame(X, columns=['x', 'y', 'z'])
        return df, name
    elif name == "s_curve":
        from sklearn.datasets import make_s_curve
        X, _ = make_s_curve(n_samples=200, random_state=42)
        df = pd.DataFrame(X, columns=['x', 'y', 'z'])
        return df, name
    elif name == "anisotropic":
        from sklearn.datasets import make_blobs
        X, _ = make_blobs(n_samples=300, cluster_std=[1.0, 2.5, 0.5], centers=[[0, 0], [5, 5], [0, 5]], random_state=42)
        df = pd.DataFrame(X, columns=['feature_1', 'feature_2'])
        return df, name
    elif name == "varied_var":
        from sklearn.datasets import make_blobs
        X, _ = make_blobs(n_samples=300, cluster_std=[1.0, 1.5, 0.8], random_state=42)
        df = pd.DataFrame(X, columns=['feature_1', 'feature_2'])
        return df, name
    elif name == "noisy_moons":
        from sklearn.datasets import make_moons
        X, _ = make_moons(n_samples=300, noise=0.2, random_state=42)
        df = pd.DataFrame(X, columns=['feature_1', 'feature_2'])
        return df, name
    elif name == "noisy_circles":
        from sklearn.datasets import make_circles
        X, _ = make_circles(n_samples=300, noise=0.1, random_state=42)
        df = pd.DataFrame(X, columns=['feature_1', 'feature_2'])
        return df, name
    elif name == "no_structure":
        X = np.random.uniform(0, 1, (300, 2))
        df = pd.DataFrame(X, columns=['feature_1', 'feature_2'])
        return df, name
    # Simulated real-world datasets
    elif name == "20news_small":
        X, y = make_classification(n_samples=200, n_features=20, n_informative=10, random_state=42)
        cols = [f'word_freq_{i+1}' for i in range(X.shape[1])]
        df = pd.DataFrame(X, columns=cols)
        df['category'] = y
        return df, name
    elif name == "banknote":
        from sklearn.datasets import make_classification
        X, y = make_classification(n_samples=200, n_features=4, n_informative=3, random_state=42)
        df = pd.DataFrame(X, columns=['variance', 'skewness', 'curtosis', 'entropy'])
        df['target'] = y
        return df, name
    elif name == "spambase_small":
        X, y = make_classification(n_samples=200, n_features=30, n_informative=15, random_state=42)
        cols = [f'feature_{i+1}' for i in range(X.shape[1])]
        df = pd.DataFrame(X, columns=cols)
        df['is_spam'] = y
        return df, name
    elif name == "titanic_sim":
        from sklearn.datasets import make_classification
        X, y = make_classification(n_samples=200, n_features=5, n_informative=3, random_state=42)
        df = pd.DataFrame(X, columns=['age', 'fare', 'pclass', 'sibsp', 'parch'])
        df['survived'] = y
        return df, name
    elif name == "boston_sim":
        from sklearn.datasets import make_regression
        X, y = make_regression(n_samples=200, n_features=13, n_informative=10, random_state=42)
        cols = ['crim', 'zn', 'indus', 'chas', 'nox', 'rm', 'age', 'dis', 'rad', 'tax', 'ptratio', 'b', 'lstat']
        df = pd.DataFrame(X[:, :13], columns=cols)
        df['medv'] = y
        return df, name
    elif name == "linnerud":
        d = skd.load_linnerud()
        df = pd.DataFrame(d.data, columns=d.feature_names)
        df['target'] = d.target[:, 0]  # Use first target
        return df, name
    elif name == "energy_sim":
        from sklearn.datasets import make_regression
        X, y = make_regression(n_samples=200, n_features=8, n_informative=6, random_state=42)
        cols = ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8']
        df = pd.DataFrame(X, columns=cols)
        df['y'] = y
        return df, name
    elif name == "auto_mpg_sim":
        from sklearn.datasets import make_regression
        X, y = make_regression(n_samples=200, n_features=7, n_informative=6, random_state=42)
        cols = ['cylinders', 'displacement', 'horsepower', 'weight', 'acceleration', 'model_year', 'origin']
        df = pd.DataFrame(X, columns=cols)
        df['mpg'] = y
        return df, name
    elif name == "stock_sim":
        dates = pd.date_range('2020-01-01', periods=200)
        prices = np.cumsum(np.random.randn(200)) + 100
        volume = np.random.randint(1000000, 10000000, 200)
        df = pd.DataFrame({'date': dates, 'close': prices, 'volume': volume})
        return df, name
    elif name == "weather_sim":
        dates = pd.date_range('2020-01-01', periods=200)
        df = pd.DataFrame({
            'date': dates,
            'temp': np.random.uniform(0, 40, 200),
            'humidity': np.random.uniform(20, 100, 200),
            'pressure': np.random.uniform(990, 1030, 200),
            'precipitation': np.random.uniform(0, 100, 200)
        })
        return df, name
    elif name == "sensor_sim":
        time_idx = np.arange(200)
        df = pd.DataFrame({
            'timestamp': time_idx,
            'sensor_1': np.sin(time_idx * 0.05) + np.random.randn(200) * 0.1,
            'sensor_2': np.cos(time_idx * 0.03) + np.random.randn(200) * 0.1,
            'sensor_3': np.random.randn(200)
        })
        return df, name
    elif name == "survey_sim":
        df = pd.DataFrame({
            'age': np.random.randint(18, 80, 200),
            'income': np.random.randint(20000, 200000, 200),
            'education': np.random.randint(0, 5, 200),
            'satisfaction': np.random.randint(1, 6, 200)
        })
        return df, name
    else:
        raise ValueError(f"Unknown built-in: {name}")
    
    # For sklearn datasets (those not already returned)
    df = pd.DataFrame(d.data, columns=d.feature_names)
    if hasattr(d,"target_names"):
        df["target"] = [d.target_names[i] for i in d.target]
    else:
        df["target"] = d.target
    return df, name

def _process(df, username):
    val = preprocessor.validate(df)
    if not val["ok"]: return None, val["issues"]
    res = preprocessor.preprocess(df)
    pdf = res["df"]
    smry = preprocessor.summary(pdf)
    qual = quality_score(pdf)
    anal = analyzer.full_analysis(pdf)
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
    path = file_store.decode_upload(content, filename)
    try:
        df = preprocessor.load_dataset(path)
    except Exception as e:
        return jsonify({"ok":False,"msg":str(e)}), 400
    result, errs = _process(df, username)
    if errs: return jsonify({"ok":False,"msg":"; ".join(errs)}), 400
    name = os.path.splitext(filename)[0]
    preprocessor.save_processed(df, name)
    arff_path = arff_converter.save_arff(df, name)
    mongo_store.log_upload(filename, df.shape[0], df.shape[1], path, username)
    file_store.cache_set(f"{username}:df", result["processed_json"])
    file_store.cache_set(f"{username}:name", name)
    file_store.cache_set(f"{username}:arff", arff_path)
    return jsonify({"ok":True,"name":name,**result})

@ds_bp.post("/api/dataset/builtin")
def builtin():
    username = require_auth(request, _s()) or "anon"
    data = request.get_json(silent=True) or {}
    name = data.get("name")
    if not name: return jsonify({"ok":False,"msg":"No dataset name"}), 400
    try:
        df, name = _builtin(name)
    except ValueError as e:
        return jsonify({"ok":False,"msg":str(e)}), 400
    result, errs = _process(df, username)
    if errs: return jsonify({"ok":False,"msg":"; ".join(errs)}), 400
    preprocessor.save_processed(df, name)
    arff_path = arff_converter.save_arff(df, name)
    mongo_store.log_upload(name, df.shape[0], df.shape[1], "builtin", username)
    file_store.cache_set(f"{username}:df", result["processed_json"])
    file_store.cache_set(f"{username}:name", name)
    file_store.cache_set(f"{username}:arff", arff_path)
    return jsonify({"ok":True,"name":name,**result})
