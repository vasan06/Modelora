"""core/preprocessor.py – Multi-format loader + bulletproof preprocessing."""
from __future__ import annotations
import io, os, re, logging
from pathlib import Path
from typing import Any
import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder, StandardScaler
import config

logger = logging.getLogger(__name__)

# ── Safe JSON round-trip (fixes Windows Pandas 3.x bug) ──────────────────────
def df_to_json(df: pd.DataFrame) -> str:
    return df.to_json(orient="records", date_format="iso", default_handler=str)

def df_from_json(s: str) -> pd.DataFrame:
    return pd.read_json(io.StringIO(s), orient="records")

# ── Column name cleaning ──────────────────────────────────────────────────────
def _clean(name: str, idx: int) -> str:
    s = re.sub(r"[^\w]", "_", str(name)).strip("_").lower()
    return s if s else f"col_{idx}"

def clean_cols(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [_clean(c, i) for i, c in enumerate(df.columns)]
    return df

def remap_cols(cols: list[str]) -> list[str]:
    return [_clean(c, i) for i, c in enumerate(cols)]

# ── Multi-format loader ───────────────────────────────────────────────────────
def load_dataset(path: str, table: str | None = None) -> pd.DataFrame:
    ext = Path(path).suffix.lower()
    try:
        if ext in (".csv",):
            df = pd.read_csv(path)
        elif ext == ".tsv":
            df = pd.read_csv(path, sep="\t")
        elif ext in (".xlsx", ".xls"):
            df = pd.read_excel(path, engine="openpyxl")
        elif ext == ".json":
            df = pd.read_json(path)
        elif ext == ".parquet":
            df = pd.read_parquet(path)
        elif ext == ".xml":
            df = pd.read_xml(path)
        elif ext in (".pkl", ".pickle"):
            df = pd.read_pickle(path)
        elif ext == ".arff":
            df = _load_arff(path)
        elif ext in (".db", ".sqlite"):
            import sqlite3
            conn = sqlite3.connect(path)
            tables = pd.read_sql("SELECT name FROM sqlite_master WHERE type='table'", conn)["name"].tolist()
            tname = table or tables[0]
            df = pd.read_sql(f"SELECT * FROM [{tname}]", conn)
            conn.close()
        else:
            raise ValueError(f"Unsupported format: {ext}")
    except Exception as e:
        raise ValueError(f"Could not load file ({ext}): {e}")
    logger.info("Loaded %s shape=%s", path, df.shape)
    return df

def _load_arff(path: str) -> pd.DataFrame:
    try:
        import arff
        with open(path) as f: data = arff.load(f)
        cols = [a[0] for a in data["attributes"]]
        return pd.DataFrame(data["data"], columns=cols)
    except ImportError:
        # Manual ARFF parser fallback
        rows, attrs = [], []
        in_data = False
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("%"): continue
                low = line.lower()
                if low.startswith("@attribute"):
                    parts = line.split()
                    attrs.append(parts[1])
                elif low.startswith("@data"):
                    in_data = True
                elif in_data:
                    rows.append(line.split(","))
        return pd.DataFrame(rows, columns=attrs)

# ── Validation ────────────────────────────────────────────────────────────────
def validate(df: pd.DataFrame) -> dict:
    issues = []
    if df.empty: issues.append("Dataset is empty")
    if df.shape[1] < 2: issues.append("Need at least 2 columns")
    bad = df.columns[df.isna().all()].tolist()
    if bad: issues.append(f"Fully-empty columns: {bad}")
    return {"ok": not issues, "issues": issues}

# ── Schema detection ──────────────────────────────────────────────────────────
def detect_schema(df: pd.DataFrame) -> dict[str, str]:
    out = {}
    for col in df.columns:
        if pd.api.types.is_numeric_dtype(df[col]):
            out[col] = "numeric"
        else:
            try: pd.to_datetime(df[col], infer_datetime_format=True); out[col] = "datetime"
            except: out[col] = "categorical"
    return out

# ── Data quality score ────────────────────────────────────────────────────────
def quality_score(df: pd.DataFrame) -> dict:
    n = len(df)
    completeness = round(float(1 - df.isna().mean().mean()), 4)
    uniqueness   = round(float(1 - df.duplicated().mean()), 4)
    schema       = detect_schema(df)
    cat_cols     = [c for c,t in schema.items() if t=="categorical"]
    high_card    = sum(1 for c in cat_cols if df[c].nunique() > 50) / max(len(cat_cols),1)
    cardinality  = round(1 - high_card * 0.5, 4)
    score = round((completeness*0.35 + uniqueness*0.30 + cardinality*0.35)*100, 1)
    return {"score": score, "completeness": round(completeness*100,1),
            "uniqueness": round(uniqueness*100,1), "cardinality": round(cardinality*100,1),
            "rows": n, "cols": df.shape[1]}

# ── Leakage detection ─────────────────────────────────────────────────────────
def detect_leakage(df: pd.DataFrame, target: str) -> list[str]:
    if target not in df.columns: return []
    warnings = []
    y = pd.to_numeric(df[target], errors="coerce").dropna()
    for col in df.columns:
        if col == target: continue
        x = pd.to_numeric(df[col], errors="coerce").dropna()
        common = x.index.intersection(y.index)
        if len(common) < 5: continue
        try:
            corr = abs(float(x.loc[common].corr(y.loc[common])))
            if corr >= config.CORR_LEAK_THRESHOLD:
                warnings.append(f"'{col}' has {corr:.2f} correlation with target — possible data leakage")
        except Exception:
            pass
    return warnings

# ── Main preprocessing pipeline ───────────────────────────────────────────────
def preprocess(df: pd.DataFrame, target_col: str | None = None,
               feature_cols: list[str] | None = None,
               scale: bool = False) -> dict[str, Any]:
    report, warnings = [], []
    df = clean_cols(df)

    # Remap caller's column names to cleaned versions
    if target_col:
        target_col = _clean(target_col, 0)
        # ensure target exists
        if target_col not in df.columns:
            possible = [c for c in df.columns if target_col in c]
            target_col = possible[0] if possible else None

    if feature_cols:
        feature_cols = [c if c in df.columns else _clean(c, 0) for c in feature_cols]
        feature_cols = [c for c in feature_cols if c in df.columns and c != target_col]

    # Drop fully-empty rows/cols
    before = df.shape
    df.dropna(how="all", inplace=True)
    df.dropna(axis=1, how="all", inplace=True)
    if df.shape != before:
        report.append(f"Removed fully-empty rows/cols: {before} → {df.shape}")

    # Remove duplicates
    n_dup = int(df.duplicated().sum())
    df = df.drop_duplicates()
    if n_dup: report.append(f"Removed {n_dup} duplicate rows")

    schema = detect_schema(df)
    report.append(f"Schema detected: {df.shape[1]} columns")

    # CoW-safe fillna
    for col in df.columns:
        n_miss = int(df[col].isna().sum())
        if n_miss == 0: continue
        if schema.get(col) == "numeric":
            fv = df[col].median()
            df[col] = df[col].fillna(fv)
            report.append(f"'{col}': filled {n_miss} NaN with median {fv:.4g}")
        else:
            mode = df[col].mode()
            fv = mode.iloc[0] if not mode.empty else "unknown"
            df[col] = df[col].fillna(fv)
            report.append(f"'{col}': filled {n_miss} NaN with mode '{fv}'")

    # Encode categoricals — SKIP target column (bug fix #2)
    encoders: dict[str, LabelEncoder] = {}
    for col in df.columns:
        if col == target_col: continue          # ← critical fix
        if schema.get(col) == "categorical":
            le = LabelEncoder()
            df[col] = le.fit_transform(df[col].astype(str))
            encoders[col] = le
            report.append(f"'{col}': label-encoded ({len(le.classes_)} classes)")

    # Optional scaling
    scaler = None
    if scale and feature_cols:
        num = [c for c in feature_cols if schema.get(c)=="numeric" and c!=target_col]
        if num:
            scaler = StandardScaler()
            df[num] = scaler.fit_transform(df[num])
            report.append(f"Scaled: {num}")

    # Leakage warnings
    if target_col:
        warnings.extend(detect_leakage(df, target_col))

    return {"df": df, "encoders": encoders, "scaler": scaler, "schema": schema,
            "report": report, "warnings": warnings,
            "target_col": target_col, "feature_cols": feature_cols}

def save_processed(df: pd.DataFrame, name: str) -> str:
    out = os.path.join(config.PROCESSED_DIR, f"{name}_processed.csv")
    df.to_csv(out, index=False)
    return out

def summary(df: pd.DataFrame) -> dict:
    numeric = df.select_dtypes(include="number")
    return {
        "rows": int(df.shape[0]), "cols": int(df.shape[1]),
        "dtypes": df.dtypes.astype(str).to_dict(),
        "missing": {c: int(v) for c, v in df.isna().sum().items()},
        "missing_pct": {c: round(float(v*100), 2) for c, v in df.isna().mean().items()},
        "stats": numeric.describe().round(4).to_dict() if not numeric.empty else {},
        "columns": list(df.columns),
        "numeric_cols": list(numeric.columns),
        "preview": df.head(config.PREVIEW_ROWS).to_dict("records"),
    }
