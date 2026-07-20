"""Lightweight caching helpers shared across utils.

Goal: skip re-computing heavy aggregations / plotly figures on every Streamlit
rerun. We key caches on the Excel master-file mtime so they auto-invalidate
when the underlying data file changes (data editor saves, manual edits, etc.).
"""
from __future__ import annotations
import os
import streamlit as st
from config import get_master_file


def data_version() -> float:
    """Return master-file mtime as the cache key for derived computations."""
    try:
        return os.path.getmtime(get_master_file())
    except Exception:
        return 0.0
