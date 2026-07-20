"""Standalone refresher — rebuilds every derived sheet in data/PMO_Master.xlsx
from the current Projects sheet.

Run by double-clicking Refresh_Data.bat, or:  python Refresh_Data.py
"""
import sys, os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from config import get_master_file  # noqa: E402
from utils.rebuild_derived import rebuild_all  # noqa: E402


def _is_locked(path: Path) -> bool:
    """True if Excel (or anything else) has an exclusive lock on the file."""
    if not path.exists():
        return False
    try:
        # Try to open for append — Windows blocks this while Excel has it open.
        with open(path, "r+b"):
            return False
    except PermissionError:
        return True
    except OSError:
        return True


if __name__ == "__main__":
    master = get_master_file()
    print(f"Master workbook: {master}")

    if not master.exists():
        print(f"\n[ERROR] File not found: {master}")
        sys.exit(1)

    if _is_locked(master):
        print("\n[ERROR] The workbook is currently OPEN in Excel.")
        print("        Close PMO_Master.xlsx in Excel first, then re-run this refresher.")
        print("        (Excel locks the file so Python cannot write to it, and Excel")
        print("         will not reload changes while the workbook is open anyway.)")
        sys.exit(2)

    print("\nRebuilding derived sheets from Projects…")
    try:
        counts = rebuild_all()
    except Exception as e:
        print(f"\n[ERROR] Rebuild failed: {e}")
        import traceback; traceback.print_exc()
        sys.exit(3)

    if not counts:
        print("No projects found — nothing to rebuild.")
        sys.exit(1)

    print("\n[OK] Rebuilt sheets:")
    for sheet, n in counts.items():
        print(f"   • {sheet:<18} {n} rows")
    print(f"\nSaved to: {master}")
    print("Open (or re-open) the workbook in Excel to see the updated data.")
