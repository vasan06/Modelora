"""core/arff_converter.py – ARFF conversion."""
from __future__ import annotations
import os, logging
import pandas as pd
import config
logger = logging.getLogger(__name__)

def _arff_type(s: pd.Series) -> str:
    if pd.api.types.is_numeric_dtype(s): return "NUMERIC"
    classes = sorted(str(v) for v in s.dropna().unique())
    return "{" + ",".join(classes) + "}"

def to_arff_str(df: pd.DataFrame, relation: str = "dataset") -> str:
    lines = [f"@RELATION {relation}", ""]
    for col in df.columns:
        lines.append(f"@ATTRIBUTE {col} {_arff_type(df[col])}")
    lines += ["", "@DATA"]
    for _, row in df.iterrows():
        lines.append(",".join("?" if pd.isna(v) else str(v) for v in row))
    return "\n".join(lines)

def save_arff(df: pd.DataFrame, name: str) -> str | None:
    try:
        path = os.path.join(config.ARFF_DIR, f"{name}.arff")
        with open(path, "w") as f: f.write(to_arff_str(df, name))
        logger.info("ARFF saved: %s", path)
        return path
    except Exception as e:
        logger.warning("ARFF failed (non-fatal): %s", e)
        return None
