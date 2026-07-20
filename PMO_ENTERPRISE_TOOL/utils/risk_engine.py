"""Risk scoring: Score = Probability x Impact x Velocity Factor."""
from __future__ import annotations
import pandas as pd

LEVEL = {"Low": 1, "Medium": 3, "High": 5, "Critical": 8}
VELOCITY = {"Slow": 1.0, "Medium": 1.3, "Fast": 1.6}


def score_risks(risks: pd.DataFrame) -> pd.DataFrame:
    if risks.empty:
        return risks
    df = risks.copy()
    p = df.get("Probability", "Medium").map(lambda x: LEVEL.get(str(x), 3))
    i = df.get("Impact",      "Medium").map(lambda x: LEVEL.get(str(x), 3))
    v = df.get("Velocity",    "Medium").map(lambda x: VELOCITY.get(str(x), 1.3))
    df["Risk Score"] = (p * i * v).round(1)
    df["Escalate"]   = df["Risk Score"] >= 25
    return df.sort_values("Risk Score", ascending=False)
