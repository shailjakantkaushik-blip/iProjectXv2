"""Whole-app PowerPoint export — uses the SAME builders & figures the pages
render, so the deck matches the UI exactly."""
from __future__ import annotations
from pathlib import Path
from datetime import datetime
from config import EXPORT_DIR
from utils.excel_loader import load_all
from utils.tab_builders import BUILDERS
from utils.exporters import bundle_to_pptx


def build_portfolio_ppt() -> str:
    data = load_all()
    bundles = [fn(data) for _, fn in BUILDERS]
    pptx_bytes = bundle_to_pptx(bundles, single_tab=False)
    out = EXPORT_DIR / f"PMO_Portfolio_Briefing_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pptx"
    out.write_bytes(pptx_bytes)
    return str(out)
