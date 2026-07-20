"""Fiscal-year aware x-axis helper.

- Stores the financial-year start month in ``data/fy_config.json``.
- ``apply_fy_quarter_axis(fig)`` rewrites the x-axis of any time-based Plotly
  figure (px.timeline, go.Bar with date base, scatter, etc.) so each month
  appears as a tick AND the first month of every fiscal quarter shows the
  ``Q# FY##`` label above the month name.
"""
from __future__ import annotations
import json
from pathlib import Path
import pandas as pd

_CFG_PATH = Path(__file__).resolve().parent.parent / "data" / "fy_config.json"
_MONTHS = ["January","February","March","April","May","June",
           "July","August","September","October","November","December"]


def _ensure():
    _CFG_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not _CFG_PATH.exists():
        _CFG_PATH.write_text(json.dumps({"fy_start_month": 1}))


def get_fy_start_month() -> int:
    _ensure()
    try:
        return int(json.loads(_CFG_PATH.read_text()).get("fy_start_month", 1)) or 1
    except Exception:
        return 1


def set_fy_start_month(month: int) -> None:
    _ensure()
    m = max(1, min(12, int(month)))
    _CFG_PATH.write_text(json.dumps({"fy_start_month": m}))


def month_name(idx: int) -> str:
    return _MONTHS[max(0, min(11, int(idx) - 1))]


def fy_quarter(date: pd.Timestamp, fy_start: int):
    """Return (quarter 1-4, fy short like '25') for a given date."""
    m, y = date.month, date.year
    offset = (m - fy_start) % 12  # 0..11
    q = offset // 3 + 1
    if fy_start == 1:
        fy = y
    else:
        fy = y + 1 if m >= fy_start else y
    return q, fy


def _collect_dates(fig):
    xs = []
    for tr in fig.data:
        # px.timeline encodes bar widths in 'x' as numeric ms — skip those and
        # rely on 'base' (start) + 'base'+'x' (end) for date extraction.
        ttype = getattr(tr, "type", "")
        base = getattr(tr, "base", None)
        x = getattr(tr, "x", None)
        if ttype == "bar" and base is not None:
            try: xs.extend(list(base))
            except Exception: pass
            # End = base + width(ms)
            try:
                base_s = pd.to_datetime(pd.Series(list(base)), errors="coerce")
                widths = pd.to_numeric(pd.Series(list(x)), errors="coerce")
                ends = base_s + pd.to_timedelta(widths, unit="ms")
                xs.extend(ends.dropna().tolist())
            except Exception:
                pass
        else:
            if x is not None:
                try: xs.extend(list(x))
                except Exception: pass
    return xs


def apply_fy_quarter_axis(fig, fy_start: int | None = None, axis: str = "xaxis"):
    """Inject month + fiscal-quarter ticks into ``fig``.

    Safe to call on any figure — if no date data is found the figure is
    returned unchanged.
    """
    if fig is None:
        return fig
    if fy_start is None:
        fy_start = get_fy_start_month()
    xs = _collect_dates(fig)
    for sh in (fig.layout.shapes or []):
        for k in ("x0", "x1"):
            v = getattr(sh, k, None)
            if v is not None:
                xs.append(v)
    if not xs:
        return fig
    s = pd.to_datetime(pd.Series(xs), errors="coerce").dropna()
    # Filter to plausible date range to avoid numeric-as-ns artifacts
    s = s[(s >= pd.Timestamp("2000-01-01")) & (s <= pd.Timestamp("2100-01-01"))]
    if s.empty:
        return fig
    start = s.min().to_period("M").to_timestamp()
    end = (s.max().to_period("M").to_timestamp() + pd.offsets.MonthBegin(1))
    months = pd.date_range(start, end, freq="MS")
    # Safety cap — if span is huge, bail out
    if len(months) > 120:
        return fig
    # Major ticks: ONE label per quarter (prevents overlap with month text)
    tickvals, ticktext = [], []
    minor_vals = []
    for d in months:
        offset = (d.month - fy_start) % 12
        if offset % 3 == 0:
            q, fy = fy_quarter(d, fy_start)
            tickvals.append(d)
            ticktext.append(f"<b>Q{q} FY{str(fy)[-2:]}</b><br>{d.strftime('%b %Y')}")
        else:
            minor_vals.append(d)
    fig.update_layout(**{axis: dict(
        tickmode="array", tickvals=tickvals, ticktext=ticktext,
        tickangle=0, showgrid=True, ticks="outside",
        minor=dict(tickvals=minor_vals, ticks="outside", ticklen=4,
                   showgrid=True, gridcolor="rgba(148,163,184,0.12)"),
    )})
    # Mark fiscal-year boundaries only
    for d in months:
        offset = (d.month - fy_start) % 12
        if offset == 0:
            fig.add_vline(x=d, line=dict(color="rgba(148,163,184,0.35)",
                                          width=1, dash="dot"))
    return fig

