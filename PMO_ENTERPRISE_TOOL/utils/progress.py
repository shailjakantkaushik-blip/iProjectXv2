"""Uniform in-progress / completion feedback for every button in the app.

Usage:
    from utils.progress import run_with_progress

    if st.button("Save"):
        run_with_progress("Saving…", "Saved.", do_save)

Or as a context manager:

    with progress("Rebuilding sheets…", "Rebuilt derived sheets."):
        rebuild_all()
"""
from __future__ import annotations
from contextlib import contextmanager
from typing import Callable, Any
import time
import streamlit as st


def _toast(msg: str, icon: str = "✅"):
    try:
        st.toast(msg, icon=icon)
    except Exception:
        pass


@contextmanager
def progress(in_msg: str = "Working…", done_msg: str | None = None,
             error_msg: str = "Something went wrong."):
    """Context manager: shows a live status while the block runs, flips to
    ✅ complete on success and ❌ error on exception. Also emits a toast."""
    status = None
    t0 = time.perf_counter()
    try:
        status = st.status(in_msg, expanded=False, state="running")
    except Exception:
        # Older Streamlit fallback
        with st.spinner(in_msg):
            yield
            if done_msg:
                st.success(done_msg); _toast(done_msg)
            return

    try:
        with status:
            yield
        elapsed = time.perf_counter() - t0
        final = done_msg or "Done."
        status.update(label=f"{final}  ·  {elapsed:.1f}s", state="complete", expanded=False)
        _toast(final)
    except Exception as e:
        status.update(label=f"{error_msg}  ({e})", state="error", expanded=True)
        _toast(error_msg, icon="❌")
        raise


def run_with_progress(in_msg: str, done_msg: str, fn: Callable[..., Any],
                      *args, **kwargs) -> Any:
    with progress(in_msg, done_msg):
        return fn(*args, **kwargs)
