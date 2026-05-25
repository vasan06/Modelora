"""models/ml_pipeline.py — Modelora V6: 50+ algorithm ML pipeline."""
from __future__ import annotations
import logging, numpy as np, pandas as pd
from sklearn.model_selection import train_test_split, StratifiedKFold, KFold
from sklearn.metrics import (accuracy_score, precision_score, recall_score,
    f1_score, confusion_matrix, mean_absolute_error, mean_squared_error, r2_score)
from sklearn.preprocessing import LabelEncoder
import config

logger = logging.getLogger(__name__)

# ── Algorithm Registry ────────────────────────────────────────────────────────
ALGORITHMS = {
    "SML": {
        "Classification": [
            "Logistic Regression","Decision Tree","Random Forest","KNN","Naive Bayes",
            "SVM (RBF)","SVM (Linear)","Gradient Boosting","AdaBoost","Extra Trees",
            "Linear Discriminant Analysis","Ridge Classifier","Bagging Classifier",
            "Passive Aggressive","Perceptron","SGD Classifier","Bernoulli NB",
            "Voting Classifier","Stacking Classifier","XGBoost","LightGBM","CatBoost",
        ],
        "Regression": [
            "Linear Regression","Ridge","Lasso","ElasticNet","Decision Tree Regressor",
            "Random Forest Regressor","KNN Regressor","SVR","Gradient Boosting Regressor",
            "AdaBoost Regressor","Extra Trees Regressor","Huber","BayesianRidge",
            "ARD Regression","Lars","LassoLars","TheilSen","RANSACRegressor",
            "Poisson Regression","Tweedie Regression","Quantile Regression",
            "PLSRegression","XGBoost Regressor","LightGBM Regressor",
        ],
    },
    "UNSML": {
        "Clustering": [
            "K-Means","Hierarchical","DBSCAN","Gaussian Mixture","Spectral Clustering",
            "Mini-Batch K-Means","OPTICS","Birch","MeanShift","Affinity Propagation",
            "FP-Growth (Assoc)","Apriori (Assoc)",
        ],
        "Dimensionality Reduction": [
            "PCA","t-SNE","Truncated SVD","UMAP","Kernel PCA","Factor Analysis",
            "FastICA","NMF","ISOMAP","MDS",
        ],
        "Anomaly Detection": [
            "Isolation Forest","Local Outlier Factor","One-Class SVM","Elliptic Envelope",
        ],
    },
    "SSVML": {
        "Semi-supervised": ["Label Propagation","Label Spreading","Self-Training"],
    },
    "RL": {
        "Reinforcement Learning": ["Q-Learning Demo","SARSA Demo"],
    },
    "DL": {
        "Neural Network": ["MLP Classifier","MLP Regressor","RBF Network"],
    },
}

NO_TARGET = {
    "K-Means","Hierarchical","DBSCAN","Gaussian Mixture","Spectral Clustering",
    "Mini-Batch K-Means","OPTICS","Birch","MeanShift","Affinity Propagation",
    "FP-Growth (Assoc)","Apriori (Assoc)","PCA","t-SNE","Truncated SVD","UMAP",
    "Kernel PCA","Factor Analysis","FastICA","NMF","ISOMAP","MDS",
    "Isolation Forest","Local Outlier Factor","One-Class SVM","Elliptic Envelope",
    "Q-Learning Demo","SARSA Demo",
}

# ── Model factory ─────────────────────────────────────────────────────────────
def _make(task: str, name: str, **kw):
    rs = config.RAND; nc = kw.get("n_clusters", 3); k = kw.get("k", 5)
    clf = task == "Classification"

    # ── Supervised Classification ─────────────────────────────────────────
    if name == "Logistic Regression":
        from sklearn.linear_model import LogisticRegression
        return LogisticRegression(max_iter=1000, random_state=rs)
    if name == "Decision Tree":
        from sklearn.tree import DecisionTreeClassifier
        return DecisionTreeClassifier(random_state=rs, max_depth=kw.get("max_depth", 5))
    if name == "Random Forest":
        from sklearn.ensemble import RandomForestClassifier
        return RandomForestClassifier(n_estimators=100, random_state=rs, max_depth=10, min_samples_leaf=2)
    if name == "KNN":
        from sklearn.neighbors import KNeighborsClassifier
        return KNeighborsClassifier(n_neighbors=min(k, 10))
    if name == "Naive Bayes":
        from sklearn.naive_bayes import GaussianNB
        return GaussianNB()
    if name in ("SVM (RBF)", "SVM (Linear)"):
        from sklearn.svm import SVC
        return SVC(kernel="rbf" if "RBF" in name else "linear", probability=True, random_state=rs)
    if name == "Gradient Boosting":
        from sklearn.ensemble import GradientBoostingClassifier
        return GradientBoostingClassifier(random_state=rs, max_depth=3, n_estimators=100)
    if name == "AdaBoost":
        from sklearn.ensemble import AdaBoostClassifier
        return AdaBoostClassifier(random_state=rs, n_estimators=50)
    if name == "Extra Trees":
        from sklearn.ensemble import ExtraTreesClassifier
        return ExtraTreesClassifier(n_estimators=100, random_state=rs, max_depth=10)
    if name == "Linear Discriminant Analysis":
        from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
        return LinearDiscriminantAnalysis()
    if name == "Ridge Classifier":
        from sklearn.linear_model import RidgeClassifier
        return RidgeClassifier()
    if name == "Bagging Classifier":
        from sklearn.ensemble import BaggingClassifier
        return BaggingClassifier(n_estimators=20, random_state=rs)
    if name == "Passive Aggressive":
        from sklearn.linear_model import PassiveAggressiveClassifier
        return PassiveAggressiveClassifier(random_state=rs, max_iter=1000)
    if name == "Perceptron":
        from sklearn.linear_model import Perceptron
        return Perceptron(random_state=rs, max_iter=1000)
    if name == "SGD Classifier":
        from sklearn.linear_model import SGDClassifier
        return SGDClassifier(random_state=rs, max_iter=1000)
    if name == "Bernoulli NB":
        from sklearn.naive_bayes import BernoulliNB
        return BernoulliNB()
    if name == "Voting Classifier":
        from sklearn.ensemble import VotingClassifier
        from sklearn.linear_model import LogisticRegression
        from sklearn.tree import DecisionTreeClassifier
        from sklearn.neighbors import KNeighborsClassifier
        return VotingClassifier([
            ("lr", LogisticRegression(max_iter=500, random_state=rs)),
            ("dt", DecisionTreeClassifier(max_depth=4, random_state=rs)),
            ("knn", KNeighborsClassifier(n_neighbors=5))], voting="soft")
    if name == "Stacking Classifier":
        from sklearn.ensemble import StackingClassifier
        from sklearn.linear_model import LogisticRegression
        from sklearn.tree import DecisionTreeClassifier
        from sklearn.neighbors import KNeighborsClassifier
        return StackingClassifier(
            estimators=[("dt", DecisionTreeClassifier(max_depth=4, random_state=rs)),
                        ("knn", KNeighborsClassifier(n_neighbors=5))],
            final_estimator=LogisticRegression(max_iter=500, random_state=rs))
    if name == "XGBoost":
        try:
            from xgboost import XGBClassifier
            return XGBClassifier(random_state=rs, n_estimators=100, max_depth=4,
                                 eval_metric="logloss", verbosity=0)
        except ImportError:
            from sklearn.ensemble import GradientBoostingClassifier
            return GradientBoostingClassifier(random_state=rs, n_estimators=100)
    if name == "LightGBM":
        try:
            from lightgbm import LGBMClassifier
            return LGBMClassifier(random_state=rs, n_estimators=100, verbose=-1)
        except ImportError:
            from sklearn.ensemble import GradientBoostingClassifier
            return GradientBoostingClassifier(random_state=rs, n_estimators=100)
    if name == "CatBoost":
        try:
            from catboost import CatBoostClassifier
            return CatBoostClassifier(random_state=rs, n_estimators=100, verbose=0)
        except ImportError:
            from sklearn.ensemble import GradientBoostingClassifier
            return GradientBoostingClassifier(random_state=rs, n_estimators=100)
    if name == "MLP Classifier":
        from sklearn.neural_network import MLPClassifier
        return MLPClassifier(hidden_layer_sizes=(100, 50), max_iter=500, random_state=rs)

    # ── Regression ────────────────────────────────────────────────────────
    if name == "Linear Regression":
        from sklearn.linear_model import LinearRegression; return LinearRegression()
    if name == "Ridge":
        from sklearn.linear_model import Ridge; return Ridge(alpha=1.0)
    if name == "Lasso":
        from sklearn.linear_model import Lasso; return Lasso(alpha=0.01, max_iter=5000)
    if name == "ElasticNet":
        from sklearn.linear_model import ElasticNet; return ElasticNet(alpha=0.01, max_iter=5000)
    if name == "Decision Tree Regressor":
        from sklearn.tree import DecisionTreeRegressor
        return DecisionTreeRegressor(random_state=rs, max_depth=5)
    if name == "Random Forest Regressor":
        from sklearn.ensemble import RandomForestRegressor
        return RandomForestRegressor(n_estimators=100, random_state=rs, max_depth=10)
    if name == "KNN Regressor":
        from sklearn.neighbors import KNeighborsRegressor
        return KNeighborsRegressor(n_neighbors=min(k, 10))
    if name == "SVR":
        from sklearn.svm import SVR; return SVR(C=1.0)
    if name == "Gradient Boosting Regressor":
        from sklearn.ensemble import GradientBoostingRegressor
        return GradientBoostingRegressor(random_state=rs, max_depth=3, n_estimators=100)
    if name == "AdaBoost Regressor":
        from sklearn.ensemble import AdaBoostRegressor
        return AdaBoostRegressor(random_state=rs, n_estimators=50)
    if name == "Extra Trees Regressor":
        from sklearn.ensemble import ExtraTreesRegressor
        return ExtraTreesRegressor(n_estimators=100, random_state=rs, max_depth=10)
    if name == "Huber":
        from sklearn.linear_model import HuberRegressor; return HuberRegressor()
    if name == "BayesianRidge":
        from sklearn.linear_model import BayesianRidge; return BayesianRidge()
    if name == "ARD Regression":
        from sklearn.linear_model import ARDRegression; return ARDRegression()
    if name == "Lars":
        from sklearn.linear_model import Lars; return Lars()
    if name == "LassoLars":
        from sklearn.linear_model import LassoLars; return LassoLars()
    if name == "TheilSen":
        from sklearn.linear_model import TheilSenRegressor; return TheilSenRegressor(random_state=rs)
    if name == "RANSACRegressor":
        from sklearn.linear_model import RANSACRegressor; return RANSACRegressor(random_state=rs)
    if name == "Poisson Regression":
        from sklearn.linear_model import PoissonRegressor; return PoissonRegressor(max_iter=1000)
    if name == "Tweedie Regression":
        from sklearn.linear_model import TweedieRegressor; return TweedieRegressor(max_iter=1000)
    if name == "Quantile Regression":
        from sklearn.linear_model import QuantileRegressor; return QuantileRegressor()
    if name == "PLSRegression":
        from sklearn.cross_decomposition import PLSRegression; return PLSRegression(n_components=2)
    if name == "XGBoost Regressor":
        try:
            from xgboost import XGBRegressor
            return XGBRegressor(random_state=rs, n_estimators=100, verbosity=0)
        except ImportError:
            from sklearn.ensemble import GradientBoostingRegressor
            return GradientBoostingRegressor(random_state=rs)
    if name == "LightGBM Regressor":
        try:
            from lightgbm import LGBMRegressor
            return LGBMRegressor(random_state=rs, verbose=-1)
        except ImportError:
            from sklearn.ensemble import GradientBoostingRegressor
            return GradientBoostingRegressor(random_state=rs)
    if name == "MLP Regressor":
        from sklearn.neural_network import MLPRegressor
        return MLPRegressor(hidden_layer_sizes=(100, 50), max_iter=500, random_state=rs)
    if name == "RBF Network":
        # Approximate with RBF kernel SVM
        from sklearn.svm import SVR; return SVR(kernel="rbf")

    # ── Clustering ────────────────────────────────────────────────────────
    if name == "K-Means":
        from sklearn.cluster import KMeans
        return KMeans(n_clusters=nc, random_state=rs, n_init=10)
    if name == "Mini-Batch K-Means":
        from sklearn.cluster import MiniBatchKMeans
        return MiniBatchKMeans(n_clusters=nc, random_state=rs)
    if name == "Hierarchical":
        from sklearn.cluster import AgglomerativeClustering
        return AgglomerativeClustering(n_clusters=nc)
    if name == "DBSCAN":
        from sklearn.cluster import DBSCAN
        return DBSCAN(eps=kw.get("eps", 0.5), min_samples=kw.get("min_samples", 5))
    if name == "OPTICS":
        from sklearn.cluster import OPTICS
        return OPTICS(min_samples=kw.get("min_samples", 5))
    if name == "Gaussian Mixture":
        from sklearn.mixture import GaussianMixture
        return GaussianMixture(n_components=nc, random_state=rs)
    if name == "Spectral Clustering":
        from sklearn.cluster import SpectralClustering
        return SpectralClustering(n_clusters=nc, random_state=rs, assign_labels="discretize")
    if name == "Birch":
        from sklearn.cluster import Birch; return Birch(n_clusters=nc)
    if name == "MeanShift":
        from sklearn.cluster import MeanShift; return MeanShift()
    if name == "Affinity Propagation":
        from sklearn.cluster import AffinityPropagation
        return AffinityPropagation(random_state=rs)

    # ── Dimensionality Reduction ──────────────────────────────────────────
    nc2 = kw.get("n_components", 2)
    if name == "PCA":
        from sklearn.decomposition import PCA
        return PCA(n_components=min(nc2, 50), random_state=rs)
    if name == "t-SNE":
        from sklearn.manifold import TSNE
        return TSNE(n_components=2, random_state=rs,
                    perplexity=min(30, kw.get("perplexity", 30)))
    if name == "Truncated SVD":
        from sklearn.decomposition import TruncatedSVD
        return TruncatedSVD(n_components=nc2, random_state=rs)
    if name == "Kernel PCA":
        from sklearn.decomposition import KernelPCA
        return KernelPCA(n_components=nc2, kernel="rbf", random_state=rs)
    if name == "Factor Analysis":
        from sklearn.decomposition import FactorAnalysis
        return FactorAnalysis(n_components=nc2, random_state=rs)
    if name == "FastICA":
        from sklearn.decomposition import FastICA
        return FastICA(n_components=nc2, random_state=rs, max_iter=500)
    if name == "NMF":
        from sklearn.decomposition import NMF
        return NMF(n_components=nc2, random_state=rs, max_iter=500)
    if name == "ISOMAP":
        from sklearn.manifold import Isomap; return Isomap(n_components=nc2)
    if name == "MDS":
        from sklearn.manifold import MDS
        return MDS(n_components=nc2, random_state=rs)
    if name == "UMAP":
        try:
            from umap import UMAP; return UMAP(n_components=nc2, random_state=rs)
        except ImportError:
            from sklearn.manifold import TSNE
            return TSNE(n_components=2, random_state=rs)

    # ── Anomaly Detection ─────────────────────────────────────────────────
    cont = kw.get("contamination", 0.1)
    if name == "Isolation Forest":
        from sklearn.ensemble import IsolationForest
        return IsolationForest(random_state=rs, contamination=cont)
    if name == "Local Outlier Factor":
        from sklearn.neighbors import LocalOutlierFactor
        return LocalOutlierFactor(n_neighbors=min(20, k), contamination=cont)
    if name == "One-Class SVM":
        from sklearn.svm import OneClassSVM; return OneClassSVM(nu=cont)
    if name == "Elliptic Envelope":
        from sklearn.covariance import EllipticEnvelope
        return EllipticEnvelope(contamination=cont, random_state=rs)

    # ── Semi-supervised ───────────────────────────────────────────────────
    if name == "Label Propagation":
        from sklearn.semi_supervised import LabelPropagation; return LabelPropagation()
    if name == "Label Spreading":
        from sklearn.semi_supervised import LabelSpreading; return LabelSpreading()
    if name == "Self-Training":
        from sklearn.semi_supervised import SelfTrainingClassifier
        from sklearn.svm import SVC
        return SelfTrainingClassifier(SVC(probability=True, random_state=rs))

    raise ValueError(f"Unknown algorithm: {name}")


# ── Metric helpers ─────────────────────────────────────────────────────────────
def _clf_metrics(yt, yp):
    avg = "binary" if len(set(yt)) <= 2 else "macro"
    return {
        "accuracy":  round(float(accuracy_score(yt, yp)), 4),
        "precision": round(float(precision_score(yt, yp, average=avg, zero_division=0)), 4),
        "recall":    round(float(recall_score(yt, yp, average=avg, zero_division=0)), 4),
        "f1":        round(float(f1_score(yt, yp, average=avg, zero_division=0)), 4),
    }

def _reg_metrics(yt, yp):
    mae  = float(mean_absolute_error(yt, yp))
    mse  = float(mean_squared_error(yt, yp))
    r2   = float(r2_score(yt, yp)) if len(yt) > 1 else 0.0
    mape = float(np.mean(np.abs((np.array(yt) - np.array(yp)) /
                                 (np.abs(np.array(yt)) + 1e-9))) * 100)
    mae, mse, r2, mape = [float(np.nan_to_num(v, nan=0.0, posinf=0.0, neginf=0.0))
                          for v in (mae, mse, r2, mape)]
    return {"mae": round(mae,4), "mse": round(mse,4),
            "rmse": round(float(np.sqrt(mse)),4), "r2": round(r2,4),
            "mape": round(mape,2)}

def _overfit(train_s, test_s, task, n_train):
    gap = train_s - test_s
    if gap >= config.OVERFIT_GAP_ERROR:
        lvl, msg = "severe", (
            f"⚠️ Severe overfitting: train={train_s:.1%} vs test={test_s:.1%} "
            f"(gap={gap:.1%}). Model memorised training data.")
        tips = ["Reduce tree depth / n_estimators",
                "Increase regularisation (C, alpha, lambda)",
                "Get more training data",
                "Use cross-validation",
                "Try a simpler algorithm"]
    elif gap >= config.OVERFIT_GAP_WARN:
        lvl, msg = "moderate", (
            f"⚠ Moderate overfitting: train={train_s:.1%}, test={test_s:.1%} "
            f"(gap={gap:.1%}).")
        tips = ["Tune regularisation", "Add more training data"]
    elif test_s < 0.55 and task == "Classification":
        lvl, msg = "underfitting", (
            f"📉 Underfitting: test accuracy only {test_s:.1%}.")
        tips = ["Try a more complex model", "Add features",
                "Reduce regularisation", "Check class balance"]
    else:
        lvl, msg = "ok", (
            f"✅ Healthy: train={train_s:.1%}, test={test_s:.1%}.")
        tips = []
    return {"level": lvl, "message": msg, "suggestions": tips,
            "train_score": round(train_s, 4), "test_score": round(test_s, 4),
            "gap": round(gap, 4)}

def _cv_clf(model_fn, X, y, cv):
    skf = StratifiedKFold(n_splits=cv, shuffle=True, random_state=config.RAND)
    scores = []
    for tr, te in skf.split(X, y):
        m = model_fn(); m.fit(X[tr], y[tr])
        scores.append(float(accuracy_score(y[te], m.predict(X[te]))))
    return {"mean": round(float(np.mean(scores)),4),
            "std":  round(float(np.std(scores)),4),
            "folds": [round(s,4) for s in scores]}

def _cv_reg(model_fn, X, y, cv):
    kf = KFold(n_splits=cv, shuffle=True, random_state=config.RAND)
    scores = []
    for tr, te in kf.split(X, y):
        m = model_fn(); m.fit(X[tr], y[tr])
        scores.append(float(r2_score(y[te], m.predict(X[te]))))
    return {"mean": round(float(np.mean(scores)),4),
            "std":  round(float(np.std(scores)),4),
            "folds": [round(s,4) for s in scores]}


# ── Supervised pipeline ────────────────────────────────────────────────────────
def _supervised(df, target, features, task, name, train_ratio=0.8, cv_folds=5, **kw):
    if target not in df.columns:
        raise ValueError(f"Target column '{target}' was not found in the loaded dataset.")

    effective_task = task
    if name == "MLP Classifier":
        effective_task = "Classification"
    elif name in ("MLP Regressor", "RBF Network"):
        effective_task = "Regression"

    features = [f for f in features if f in df.columns and f != target]
    Xdf = (
        df[features]
        .select_dtypes(include="number")
        .replace([np.inf, -np.inf], np.nan)
        .fillna(0)
    )
    feat_names = list(Xdf.columns)
    if not feat_names:
        raise ValueError("No numeric feature columns found. Select at least one numeric feature.")

    n = min(len(df), config.MAX_ROWS)
    if n < 2:
        raise ValueError("Need at least two rows to train a model.")
    X = Xdf.iloc[:n].values
    y_raw = df[target].iloc[:n]

    is_clf = (effective_task == "Classification")
    le = None
    if is_clf:
        if y_raw.nunique(dropna=False) > max(50, int(len(y_raw) * 0.4)):
            raise ValueError("This target has too many unique values for classification. Try a regression algorithm.")
        le = LabelEncoder()
        y = le.fit_transform(y_raw.astype(str))
        if len(np.unique(y)) < 2:
            raise ValueError("Classification needs at least two target classes.")
    else:
        y = pd.to_numeric(y_raw, errors="coerce").replace([np.inf, -np.inf], np.nan).fillna(0).values
        if name == "Poisson Regression" and np.min(y) <= 0:
            y = y - np.min(y) + 1e-3

    test_frac = 1 - float(train_ratio)
    test_frac = min(max(test_frac, 1 / n), (n - 1) / n)
    strat = None
    if is_clf:
        counts = np.bincount(y)
        n_classes = len(counts)
        test_count = int(np.ceil(n * test_frac))
        if counts.min() >= 2 and test_count >= n_classes and (n - test_count) >= n_classes:
            strat = y

    Xtr, Xte, ytr, yte = train_test_split(
        X, y, test_size=test_frac, random_state=config.RAND, stratify=strat
    )
    if is_clf and len(np.unique(ytr)) < 2:
        raise ValueError("The train split contains only one class. Use a larger dataset or choose a different target.")

    if name in ("Bernoulli NB",):
        from sklearn.preprocessing import MinMaxScaler
        sc = MinMaxScaler()
        Xtr = sc.fit_transform(Xtr)
        Xte = sc.transform(Xte)

    model = _make(effective_task, name, **kw)
    model.fit(Xtr, ytr)
    trp = model.predict(Xtr)
    tep = model.predict(Xte)

    res = {
        "algo_category": "SML" if effective_task in ("Classification", "Regression") else "DL",
        "algo_type": effective_task,
        "algo_name": name,
        "feature_cols": feat_names,
        "target_col": target,
        "n_train": len(Xtr),
        "n_test": len(Xte),
    }

    pred_limit = int(getattr(config, "MAX_PREDICTIONS", 1000))
    if is_clf:
        tm = _clf_metrics(ytr, trp)
        vm = _clf_metrics(yte, tep)
        classes = [str(c) for c in (le.classes_ if le else sorted(set(y)))]
        cm = confusion_matrix(yte, tep).tolist()
        preds = [
            {
                "actual": str(le.inverse_transform([int(a)])[0]) if le else int(a),
                "predicted": str(le.inverse_transform([int(p)])[0]) if le else int(p),
            }
            for a, p in list(zip(yte, tep))[:pred_limit]
        ]
        res.update({**vm, "train_accuracy": tm["accuracy"],
                    "confusion_matrix": cm, "classes": classes, "predictions": preds})
        if len(X) <= config.SMALL_DATASET_ROWS:
            safe_cv = min(int(cv_folds), len(X), int(np.bincount(y).min()))
            if safe_cv >= 2:
                res["cv"] = _cv_clf(lambda: _make(effective_task, name, **kw), X, y, safe_cv)
        res["overfit"] = _overfit(tm["accuracy"], vm["accuracy"], "Classification", len(Xtr))
    else:
        tm = _reg_metrics(ytr, trp)
        vm = _reg_metrics(yte, tep)
        preds = [
            {"actual": round(float(a), 4), "predicted": round(float(p), 4)}
            for a, p in list(zip(yte, tep))[:pred_limit]
        ]
        res.update({**vm, "train_r2": tm["r2"], "train_mae": tm["mae"], "predictions": preds})
        if len(X) <= config.SMALL_DATASET_ROWS:
            safe_cv = min(int(cv_folds), len(X))
            if safe_cv >= 2:
                res["cv"] = _cv_reg(lambda: _make(effective_task, name, **kw), X, y, safe_cv)
        res["overfit"] = _overfit(tm["r2"], vm["r2"], "Regression", len(Xtr))

    if hasattr(model, "feature_importances_"):
        fi = model.feature_importances_
        res["feature_importance"] = {f: round(float(v), 6) for f, v in zip(feat_names, fi)}
    elif hasattr(model, "coef_"):
        coef = np.asarray(model.coef_)
        coef = np.mean(np.abs(coef), axis=0) if coef.ndim > 1 else np.abs(coef).flatten()
        if len(coef) == len(feat_names):
            res["feature_importance"] = {f: round(float(v), 6) for f, v in zip(feat_names, coef)}
    return res


# ── Unsupervised pipeline ─────────────────────────────────────────────────────
def _unsupervised(df, features, algo_type, name, **kw):
    from sklearn.decomposition import PCA as _PCA
    X = df[features].select_dtypes(include="number").fillna(0)
    n = min(len(X), config.MAX_ROWS)
    Xn = X.iloc[:n].values
    feat_names = list(X.columns)
    if Xn.size == 0:
        raise ValueError("No numeric features for unsupervised learning.")
    res = {"algo_category":"UNSML","algo_type":algo_type,"algo_name":name,"feature_cols":feat_names}

    # Association rules (FP-Growth / Apriori)
    if name in ("FP-Growth (Assoc)", "Apriori (Assoc)"):
        try:
            from mlxtend.frequent_patterns import fpgrowth, apriori, association_rules
            df_bin = (df[features].fillna(0) > 0).astype(bool)
            freq = fpgrowth(df_bin, min_support=0.1, use_colnames=True) if "FP" in name \
                   else apriori(df_bin, min_support=0.1, use_colnames=True)
            rules = association_rules(freq, metric="confidence", min_threshold=0.5)
            res["rules"] = rules.head(20).astype(str).to_dict("records")
            res["n_rules"] = len(rules)
        except ImportError:
            res["error"] = "mlxtend not installed — run: pip install mlxtend"
        return res

    # Dimensionality reduction
    if algo_type == "Dimensionality Reduction":
        nc = min(kw.get("n_components", 2), Xn.shape[1], max(Xn.shape[0]-1,1))
        model = _make("", name, n_components=nc, **kw)
        coords = model.fit_transform(Xn)
        res["coords"] = coords.tolist()
        if hasattr(model, "explained_variance_ratio_"):
            res["explained_variance"] = [round(float(v),6) for v in model.explained_variance_ratio_]
        return res

    # Anomaly detection
    if algo_type == "Anomaly Detection":
        model = _make("", name, **kw)
        labels = model.fit_predict(Xn) if hasattr(model,"fit_predict") else model.fit(Xn).predict(Xn)
        pca = _PCA(n_components=min(2, Xn.shape[1]))
        coords = pca.fit_transform(Xn)
        res.update({"labels":labels.tolist(),"n_anomalies":int((labels==-1).sum()),
                    "pca_coords":coords.tolist()})
        return res

    # Clustering
    nc = kw.get("n_clusters", 3)
    model = _make("", name, n_clusters=nc, **kw)
    labels = model.fit_predict(Xn) if hasattr(model,"fit_predict") else model.fit(Xn).labels_
    pca = _PCA(n_components=min(2, Xn.shape[1]))
    coords = pca.fit_transform(Xn)
    res.update({"labels":labels.tolist(),"n_clusters":len(set(labels)-{-1}),"pca_coords":coords.tolist()})
    if hasattr(model, "inertia_"):
        res["inertia"] = round(float(model.inertia_), 4)
    # Elbow curve for K-Means variants
    if name in ("K-Means", "Mini-Batch K-Means"):
        elbow = []
        for k in range(2, min(11, n)):
            from sklearn.cluster import KMeans
            km = KMeans(n_clusters=k, random_state=config.RAND, n_init=10)
            km.fit(Xn)
            elbow.append({"k": k, "inertia": round(float(km.inertia_), 2)})
        res["elbow_data"] = elbow
    return res


# ── Semi-supervised pipeline ──────────────────────────────────────────────────
def _unsupervised_safe(df, features, algo_type, name, **kw):
    from sklearn.decomposition import PCA as _PCA

    features = [f for f in features if f in df.columns]
    X = (
        df[features]
        .select_dtypes(include="number")
        .replace([np.inf, -np.inf], np.nan)
        .fillna(0)
    )
    feat_names = list(X.columns)
    if X.empty or not feat_names:
        raise ValueError("No numeric features for unsupervised learning.")

    expensive = {"t-SNE", "UMAP", "ISOMAP", "MDS", "Spectral Clustering", "MeanShift", "Affinity Propagation"}
    row_limit = config.MAX_EXPENSIVE_ALGO_ROWS if name in expensive else config.MAX_UNSUPERVISED_ROWS
    n = min(len(X), row_limit)
    if n < 2:
        raise ValueError("Need at least two rows for unsupervised learning.")
    Xn = X.iloc[:n].values

    def coords2(arr):
        arr = np.asarray(arr)
        if arr.ndim == 1:
            arr = arr.reshape(-1, 1)
        if arr.shape[1] == 1:
            arr = np.column_stack([arr[:, 0], np.zeros(arr.shape[0])])
        return arr[:, :2].tolist()

    res = {"algo_category": "UNSML", "algo_type": algo_type, "algo_name": name, "feature_cols": feat_names}

    if name in ("FP-Growth (Assoc)", "Apriori (Assoc)"):
        try:
            from mlxtend.frequent_patterns import fpgrowth, apriori, association_rules
            df_bin = (X.iloc[:n] > 0).astype(bool)
            freq = fpgrowth(df_bin, min_support=0.1, use_colnames=True) if "FP" in name \
                else apriori(df_bin, min_support=0.1, use_colnames=True)
            if freq.empty:
                res.update({"rules": [], "n_rules": 0})
                return res
            rules = association_rules(freq, metric="confidence", min_threshold=0.5)
            res["rules"] = rules.head(20).astype(str).to_dict("records")
            res["n_rules"] = len(rules)
        except ImportError:
            res["error"] = "mlxtend is not installed. Install it to run association rules."
        return res

    if algo_type == "Dimensionality Reduction":
        local_kw = dict(kw)
        local_kw.pop("n_components", None)
        nc = min(int(kw.get("n_components", 2)), Xn.shape[1], max(Xn.shape[0] - 1, 1))
        if name == "NMF":
            from sklearn.preprocessing import MinMaxScaler
            Xn = MinMaxScaler().fit_transform(Xn)
        if name == "t-SNE":
            local_kw["perplexity"] = min(int(local_kw.get("perplexity", 30)), max(1, Xn.shape[0] - 1))
        model = _make("", name, n_components=nc, **local_kw)
        coords = model.fit_transform(Xn)
        res["coords"] = coords2(coords)
        if hasattr(model, "explained_variance_ratio_"):
            res["explained_variance"] = [round(float(v), 6) for v in model.explained_variance_ratio_]
        return res

    if algo_type == "Anomaly Detection":
        local_kw = dict(kw)
        local_kw.pop("n_components", None)
        model = _make("", name, **local_kw)
        labels = model.fit_predict(Xn) if hasattr(model, "fit_predict") else model.fit(Xn).predict(Xn)
        pca = _PCA(n_components=min(2, Xn.shape[1]))
        coords = pca.fit_transform(Xn)
        res.update({"labels": labels.tolist(), "n_anomalies": int((labels == -1).sum()),
                    "pca_coords": coords2(coords)})
        return res

    local_kw = dict(kw)
    local_kw.pop("n_clusters", None)
    nc = max(2, min(int(kw.get("n_clusters", 3)), n))
    model = _make("", name, n_clusters=nc, **local_kw)
    labels = model.fit_predict(Xn) if hasattr(model, "fit_predict") else model.fit(Xn).labels_
    pca = _PCA(n_components=min(2, Xn.shape[1]))
    coords = pca.fit_transform(Xn)
    label_set = set(int(x) for x in labels)
    res.update({"labels": labels.tolist(), "n_clusters": len(label_set - {-1}), "pca_coords": coords2(coords)})
    if hasattr(model, "inertia_"):
        res["inertia"] = round(float(model.inertia_), 4)
    if len(label_set - {-1}) >= 2:
        try:
            from sklearn.metrics import silhouette_score
            res["silhouette"] = round(float(silhouette_score(Xn, labels)), 4)
        except Exception:
            pass
    if name in ("K-Means", "Mini-Batch K-Means"):
        elbow = []
        for k in range(2, min(11, n + 1)):
            from sklearn.cluster import KMeans
            km = KMeans(n_clusters=k, random_state=config.RAND, n_init=10)
            km.fit(Xn)
            elbow.append({"k": k, "inertia": round(float(km.inertia_), 2)})
        res["elbow_data"] = elbow
    return res


def _semi(df, target, features, name):
    if target not in df.columns:
        raise ValueError(f"Target column '{target}' was not found in the loaded dataset.")
    features = [f for f in features if f in df.columns and f != target]
    Xdf = df[features].select_dtypes(include="number").replace([np.inf, -np.inf], np.nan).fillna(0)
    if Xdf.empty:
        raise ValueError("No numeric feature columns found for semi-supervised learning.")
    n = min(len(Xdf), config.MAX_ROWS)
    X = Xdf.iloc[:n].values
    le = LabelEncoder()
    y_full = le.fit_transform(df[target].iloc[:n].astype(str))
    if len(np.unique(y_full)) < 2:
        raise ValueError("Semi-supervised learning needs at least two target classes.")
    y = y_full.copy()
    rng = np.random.default_rng(config.RAND)
    mask = rng.random(len(y)) < 0.5  # 50% unlabeled
    if len(np.unique(y[~mask])) < 2:
        mask[:] = False
        mask[rng.random(len(y)) < 0.35] = True
    y[mask] = -1
    model = _make("", name)
    model.fit(X, y)
    pred = model.predict(X[~mask])
    m = _clf_metrics(y_full[~mask], pred)
    return {"algo_category":"SSVML","algo_name":name,
            "accuracy":m["accuracy"],"precision":m["precision"],"recall":m["recall"],"f1":m["f1"],
            "labeled":int((~mask).sum()),"unlabeled":int(mask.sum()),
            "classes":le.classes_.tolist()}


# ── RL demo ───────────────────────────────────────────────────────────────────
def _rl_demo(name="Q-Learning Demo"):
    np.random.seed(config.RAND)
    G, A = 5, 4
    Q = np.zeros((G*G, A))
    alpha, gamma, eps = 0.1, 0.9, 0.1
    goal = G*G - 1
    rewards = []

    def step(s, a):
        r, c = divmod(s, G)
        dr, dc = [(-1,0),(1,0),(0,-1),(0,1)][a]
        ns = max(0,min(G-1,r+dr))*G + max(0,min(G-1,c+dc))
        return ns, (1.0 if ns == goal else -0.01)

    for _ in range(500):
        s, tot = 0, 0.0
        for __ in range(200):
            a = np.random.randint(A) if np.random.rand() < eps else int(Q[s].argmax())
            ns, reward = step(s, a)
            Q[s,a] += alpha * (reward + gamma * Q[ns].max() - Q[s,a])
            s, tot = ns, tot + reward
            if s == goal: break
        rewards.append(round(tot, 4))

    return {"algo_category":"RL","algo_name":name,
            "rewards":rewards,"q_table":Q.tolist(),"grid_size":G}


# ── Main entry point ──────────────────────────────────────────────────────────
def run_pipeline(df, algo_category, algo_type, algo_name,
                 target_col=None, feature_cols=None,
                 n_clusters=3, train_ratio=0.8, cv_folds=5, **kw):
    logger.info("Pipeline cat=%s type=%s algo=%s n=%d",
                algo_category, algo_type, algo_name, len(df))

    if algo_category == "RL":
        return _rl_demo(algo_name)

    if algo_category == "UNSML":
        feats = feature_cols or list(df.select_dtypes(include="number").columns)
        extra = {"n_clusters": n_clusters}
        extra.update(kw)
        return _unsupervised_safe(df, feats, algo_type, algo_name, **extra)

    if algo_category == "SSVML":
        if not target_col:
            raise ValueError("target_col required for semi-supervised learning.")
        feats = feature_cols or [c for c in df.select_dtypes(include="number").columns if c != target_col]
        return _semi(df, target_col, feats, algo_name)

    # SML / DL (both are supervised)
    if not target_col:
        raise ValueError("target_col is required for supervised learning.")
    if not feature_cols:
        feature_cols = [c for c in df.select_dtypes(include="number").columns if c != target_col]
    if not feature_cols:
        raise ValueError("No numeric feature columns available.")

    return _supervised(df, target_col, feature_cols, algo_type, algo_name,
                       train_ratio=train_ratio, cv_folds=cv_folds, **kw)
