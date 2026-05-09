"""core/analyzer.py – Dataset analysis."""
from __future__ import annotations
import numpy as np
import pandas as pd
from scipy import stats as sp

def correlation(df: pd.DataFrame) -> dict:
    n = df.select_dtypes(include="number")
    if n.shape[1] < 2: return {}
    c = n.corr().round(4)
    return {"columns": list(c.columns), "values": c.values.tolist()}

def distributions(df: pd.DataFrame) -> dict:
    out = {}
    for col in df.select_dtypes(include="number").columns:
        s = df[col].dropna()
        if len(s) < 2: continue
        counts, bins = np.histogram(s, bins=20)
        out[col] = {
            "mean": float(s.mean()), "median": float(s.median()),
            "std": float(s.std()), "skew": float(s.skew()),
            "min": float(s.min()), "max": float(s.max()),
            "q25": float(s.quantile(.25)), "q75": float(s.quantile(.75)),
            "hist_x": [float((bins[i]+bins[i+1])/2) for i in range(len(counts))],
            "hist_y": counts.tolist(),
        }
    return out

def outliers(df: pd.DataFrame) -> dict:
    out = {}
    for col in df.select_dtypes(include="number").columns:
        s = df[col].dropna()
        if len(s) < 4: continue
        z = np.abs(sp.zscore(s))
        out[col] = int((z > 3).sum())
    return out

def class_balance(df: pd.DataFrame, target: str) -> dict | None:
    if target not in df.columns: return None
    vc = df[target].value_counts()
    return {"labels": [str(k) for k in vc.index.tolist()], "counts": vc.values.tolist()}

def full_analysis(df: pd.DataFrame, target: str | None = None) -> dict:
    return {
        "correlation":   correlation(df),
        "distributions": distributions(df),
        "outliers":      outliers(df),
        "class_balance": class_balance(df, target) if target else None,
    }
