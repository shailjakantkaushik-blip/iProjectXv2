"""Shared Financial Year (FY) filter widget.

Renders a multiselect populated from the FYAllocation sheet and returns the
set of Project IDs whose allocations fall in the selected FY(s). Pages can
apply the returned IDs to any DataFrame carrying a `Project ID` column.
"""
from __future__ import annotations
import pandas as pd
import streamlit as st

from utils.fy_allocation import load_allocations, fy_sort_key


def available_fys() -> list[str]:
    alloc = load_allocations()
    if alloc.empty:
        return []
    return sorted(alloc["FY"].dropna().astype(str).unique().tolist(),
                  key=fy_sort_key)


def fy_filter(location=st, key: str = "fy_filter",
              label: str = "Financial Year") -> list[str]:
    """Render an FY multiselect. Returns the selected FYs (empty = all)."""
    fys = available_fys()
    if not fys:
        location.caption("💡 Add FY allocations to enable Financial Year filtering.")
        return []
    return location.multiselect(label, options=fys, default=[], key=key,
                                help="Filter to projects allocated in the selected FY(s). "
                                     "Leave empty for all.")


def project_ids_for_fys(fys: list[str]) -> set[str]:
    if not fys:
        return set()
    alloc = load_allocations()
    if alloc.empty:
        return set()
    sub = alloc[alloc["FY"].astype(str).isin([str(f) for f in fys])]
    return set(sub["Project ID"].astype(str).unique().tolist())


def apply_fy_filter(df: pd.DataFrame, fys: list[str],
                    id_col: str = "Project ID") -> pd.DataFrame:
    if not fys or df is None or df.empty or id_col not in df.columns:
        return df
    ids = project_ids_for_fys(fys)
    if not ids:
        return df.iloc[0:0]
    return df[df[id_col].astype(str).isin(ids)]
