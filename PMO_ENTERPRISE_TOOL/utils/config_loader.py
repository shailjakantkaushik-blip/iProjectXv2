"""Read the Config + ConfigRules sheets from the active workbook and expose
them as plain Python dicts. Cached via Streamlit so every page sees the
latest values after edits.

Public API:
    get_lists()  -> {category: [values]}
    get_rules()  -> {key: typed_value}
    get_list(category, fallback=None) -> [values]
    get_rule(key, default=None) -> typed value
"""
from __future__ import annotations
import pandas as pd
import streamlit as st
from utils.excel_loader import load_all


def _coerce(value, typ: str):
    typ = (typ or "").strip().lower()
    try:
        if typ in ("int","integer"):    return int(float(value))
        if typ in ("float","ratio","number","currency"): return float(value)
        if typ == "bool":               return str(value).strip().lower() in {"1","true","yes","y"}
    except Exception:
        return value
    return value


@st.cache_data(show_spinner=False)
def _read():
    data = load_all()
    sheets = data.get("_sheets", {})
    cfg = sheets.get("Config", pd.DataFrame())
    rules = sheets.get("ConfigRules", pd.DataFrame())

    lists: dict[str, list] = {}
    if not cfg.empty and {"Category","Value"}.issubset(cfg.columns):
        df = cfg.copy()
        if "Active" in df.columns:
            df = df[df["Active"].fillna(True).astype(bool)]
        if "Display Order" in df.columns:
            df = df.sort_values(["Category","Display Order"])
        for cat, grp in df.groupby("Category"):
            lists[str(cat)] = [str(v) for v in grp["Value"].tolist() if pd.notna(v)]

    rules_d: dict[str, object] = {}
    if not rules.empty and {"Key","Value"}.issubset(rules.columns):
        for _, row in rules.iterrows():
            key = str(row["Key"]).strip()
            if not key:
                continue
            typ = str(row.get("Type","")) if "Type" in rules.columns else ""
            rules_d[key] = _coerce(row["Value"], typ)
    return lists, rules_d


def get_lists() -> dict[str, list]:
    return _read()[0]


def get_rules() -> dict[str, object]:
    return _read()[1]


def get_list(category: str, fallback: list | None = None) -> list:
    return _read()[0].get(category, fallback or [])


def get_rule(key: str, default=None):
    return _read()[1].get(key, default)


def refresh():
    _read.clear()
