#!/usr/bin/env python3
"""iProjectX cinematic advert — dual VO, clean quiet mix, no noise bed."""

from __future__ import annotations

import asyncio
import json
import math
import re
import shutil
import subprocess
import sys
import wave
from pathlib import Path

import edge_tts
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
WORK = Path("/tmp/ipx-ad3")
OUT_MP4 = ROOT / "public/landing/ipx-pitch.mp4"
OUT_POSTER = ROOT / "public/landing/ipx-pitch-poster.jpg"
LOGO_DIR = ROOT / "public/landing/logos"
BG_DIR = ROOT / "public/landing/story-bg"
ACTOR_DIR = BG_DIR / "actors"

MALE = "en-US-AndrewMultilingualNeural"
FEMALE = "en-US-AvaMultilingualNeural"
RATE = "-2%"
VOLUME = "+0%"
PITCH = "+0Hz"
SR = 44100
W, H = 1280, 720
FPS = 24
FADE = 0.40
FONT_BOLD = Path("/usr/share/fonts/truetype/macos/Inter-Bold.ttf")
FONT_SEMI = Path("/usr/share/fonts/truetype/macos/Inter-SemiBold.ttf")
FONT_REG = Path("/usr/share/fonts/truetype/macos/Inter-Regular.ttf")

NAVY = (7, 11, 24)
WHITE = (248, 250, 252)
MUTED = (214, 224, 236)
CYAN = (125, 211, 252)
BLUE = (147, 197, 253)
RED = (248, 113, 113)
AMBER = (251, 191, 36)
GREEN = (52, 211, 153)


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size)


def run(cmd: list[str]) -> None:
    print("+", " ".join(str(c) for c in cmd[:12]), "..." if len(cmd) > 12 else "")
    subprocess.run(cmd, check=True)


def ffprobe_duration(path: Path) -> float:
    out = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        text=True,
    ).strip()
    return float(out)


def cover_resize(im: Image.Image, w: int, h: int) -> Image.Image:
    im = im.convert("RGB")
    scale = max(w / im.width, h / im.height)
    nw, nh = int(im.width * scale), int(im.height * scale)
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - w) // 2
    top = (nh - h) // 2
    return im.crop((left, top, left + w, top + h))


def knock_black(im: Image.Image, thresh: int = 22) -> Image.Image:
    im = im.convert("RGBA")
    arr = np.array(im)
    luma = arr[:, :, 0].astype(np.int16) + arr[:, :, 1] + arr[:, :, 2]
    arr[:, :, 3] = np.where(luma < thresh * 3, 0, arr[:, :, 3])
    return Image.fromarray(arr, "RGBA")


def readable_wordmark(path: Path) -> Image.Image:
    """Keep the colourful X; lift navy 'iProject' letters so they read on black."""
    im = Image.open(path).convert("RGBA")
    arr = np.array(im)
    r, g, b = arr[:, :, 0].astype(np.int16), arr[:, :, 1].astype(np.int16), arr[:, :, 2].astype(np.int16)
    luma = r + g + b
    sat = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    navy = (luma > 24) & (luma < 160) & (sat < 70)
    arr[navy, 0] = 248
    arr[navy, 1] = 250
    arr[navy, 2] = 252
    arr[luma < 18, 3] = 0
    im = Image.fromarray(arr, "RGBA")
    bbox = im.getbbox()
    if bbox:
        pad = 8
        l, t, r, b = bbox
        im = im.crop((max(0, l - pad), max(0, t - pad), min(im.width, r + pad), min(im.height, b + pad)))
    return im


def paste_mark_top_right(base: Image.Image, mark: Image.Image, height: int = 78) -> Image.Image:
    mark = knock_black(mark)
    mw = int(mark.width * (height / mark.height))
    mark = mark.resize((mw, height), Image.Resampling.LANCZOS)
    rgba = base.convert("RGBA")
    rgba.paste(mark, (W - mw - 32, 24), mark)
    return rgba.convert("RGB")


def bottom_gradient(base: Image.Image, strength: float = 0.90) -> Image.Image:
    overlay = Image.new("RGBA", base.size, (7, 11, 24, 0))
    pix = overlay.load()
    h = base.height
    start = int(h * 0.40)
    for y in range(start, h):
        t = (y - start) / max(1, h - start)
        a = int(255 * strength * (t**1.12))
        for x in range(base.width):
            pix[x, y] = (7, 11, 24, a)
    out = Image.alpha_composite(base.convert("RGBA"), overlay)
    return out.convert("RGB")


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    cur = ""
    for word in words:
        trial = word if not cur else f"{cur} {word}"
        if draw.textlength(trial, font=fnt) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def draw_chip(draw: ImageDraw.ImageDraw, xy: tuple[int, int], label: str, fnt: ImageFont.FreeTypeFont) -> int:
    pad_x = 12
    tw = int(draw.textlength(label, font=fnt))
    w, h = tw + pad_x * 2, 32
    x, y = xy
    draw.rounded_rectangle(
        [x, y, x + w, y + h],
        radius=8,
        fill=(12, 22, 44, 210),
        outline=(125, 211, 252, 160),
        width=1,
    )
    draw.text((x + pad_x, y + 7), label, font=fnt, fill=(226, 244, 255, 255))
    return w + 8


def actor_frame(
    bg_path: Path,
    kicker: str,
    title: str,
    body: str = "",
    chips: list[str] | None = None,
    corner_mark: Image.Image | None = None,
) -> Image.Image:
    base = cover_resize(Image.open(bg_path), W, H)
    dim = Image.new("RGB", (W, H), NAVY)
    base = Image.blend(base, dim, 0.14)
    base = bottom_gradient(base, 0.90)
    if corner_mark is not None:
        base = paste_mark_top_right(base, corner_mark)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    fk, ft, fb, fc = font(FONT_SEMI, 14), font(FONT_BOLD, 40), font(FONT_REG, 21), font(FONT_SEMI, 13)
    x, y = 52, H - 250
    if kicker:
        lab = kicker.upper()
        kw = int(draw.textlength(lab, font=fk)) + 24
        draw.rounded_rectangle([x, y - 16, x + kw, y + 10], radius=6, fill=(8, 14, 32, 180), outline=(147, 197, 253, 140), width=1)
        draw.text((x + 12, y - 11), lab, font=fk, fill=(*BLUE, 255))
        y += 28
    for line in wrap(draw, title, ft, W - 120):
        draw.text((x, y), line, font=ft, fill=(*WHITE, 255))
        y += 48
    if body:
        y += 4
        for line in wrap(draw, body, fb, W - 140):
            draw.text((x, y), line, font=fb, fill=(*MUTED, 255))
            y += 28
    if chips:
        y += 12
        cx = x
        for chip in chips:
            used = draw_chip(draw, (cx, y), chip, fc)
            cx += used
            if cx > W - 160:
                cx = x
                y += 40
    return Image.alpha_composite(base.convert("RGBA"), layer).convert("RGB")


def solid_navy() -> Image.Image:
    return Image.new("RGB", (W, H), NAVY)


def ui_base() -> tuple[Image.Image, ImageDraw.ImageDraw, Image.Image]:
    base = Image.new("RGB", (W, H), NAVY)
    # faint grid
    g = ImageDraw.Draw(base)
    for x in range(0, W, 48):
        g.line([(x, 0), (x, H)], fill=(16, 28, 52), width=1)
    for y in range(0, H, 48):
        g.line([(0, y), (W, y)], fill=(16, 28, 52), width=1)
    vig = Image.new("L", (W, H), 0)
    vd = ImageDraw.Draw(vig)
    vd.ellipse([-40, -80, W + 40, H + 120], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(80))
    tint = Image.new("RGB", (W, H), (14, 28, 58))
    base = Image.composite(tint, base, vig)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    return base, ImageDraw.Draw(layer), layer


def labeled_flow(
    kicker: str,
    title: str,
    nodes: list[str],
    note: str = "",
    active: int | None = None,
) -> Image.Image:
    base, draw, layer = ui_base()
    fk, ft, fb = font(FONT_SEMI, 14), font(FONT_BOLD, 32), font(FONT_REG, 18)
    draw.text((56, 36), kicker.upper(), font=fk, fill=(*CYAN, 255))
    y = 62
    for line in wrap(draw, title, ft, W - 120):
        draw.text((56, y), line, font=ft, fill=(*WHITE, 255))
        y += 40
    y += 16
    x, row_h = 56, 52
    fchip = font(FONT_SEMI, 15)
    for i, node in enumerate(nodes):
        tw = int(draw.textlength(node, font=fchip)) + 28
        if x + tw > W - 56:
            x = 56
            y += row_h + 18
        on = active is None or i <= active
        hot = active is not None and i == active
        fill = (18, 70, 92, 240) if hot else ((12, 24, 48, 230) if on else (10, 16, 28, 200))
        outline = (125, 211, 252, 230) if hot or on else (60, 80, 110, 120)
        draw.rounded_rectangle([x, y, x + tw, y + row_h], radius=10, fill=fill, outline=outline, width=2 if hot else 1)
        draw.text((x + 14, y + 16), node, font=fchip, fill=(*WHITE, 255) if on else (148, 163, 184, 255))
        if i < len(nodes) - 1:
            ax = x + tw + 6
            if ax + 20 < W - 56:
                draw.polygon([(ax, y + 22), (ax + 12, y + 26), (ax, y + 30)], fill=(*CYAN, 220))
        x += tw + 28
    if note:
        draw.text((56, H - 64), note, font=fb, fill=(*MUTED, 255))
    return Image.alpha_composite(base.convert("RGBA"), layer).convert("RGB")


def pulse_frame(mode: str = "full", caption: str = "Portfolio Pulse") -> Image.Image:
    base, draw, layer = ui_base()
    fk, ft, fb, fs = font(FONT_SEMI, 14), font(FONT_BOLD, 36), font(FONT_REG, 18), font(FONT_SEMI, 16)
    draw.text((56, 36), "INTELLIGENCE", font=fk, fill=(*CYAN, 255))
    y = 62
    for line in wrap(draw, caption, ft, W - 120):
        draw.text((56, y), line, font=ft, fill=(*WHITE, 255))
        y += 40
    y += 10
    show_score = mode != "focus"
    show_focus = mode != "score"
    if show_score:
        draw.rounded_rectangle([56, y, 420, y + 180], radius=16, fill=(12, 22, 44, 230), outline=(251, 191, 36, 180), width=2)
        draw.text((88, y + 28), "72", font=font(FONT_BOLD, 84), fill=(*AMBER, 255))
        draw.text((88, y + 120), "AT RISK", font=font(FONT_BOLD, 22), fill=(*AMBER, 255))
        rows = [
            ("Financial Health", GREEN),
            ("Delivery Health", AMBER),
            ("Resource Health", AMBER),
            ("Risk Health", RED),
            ("Benefits", GREEN),
            ("Dependencies", RED),
        ]
        ry = y + 8
        for label, col in rows:
            draw.ellipse([468, ry + 8, 484, ry + 24], fill=(*col, 255))
            draw.text((500, ry + 4), label, font=fs, fill=(*WHITE, 255))
            ry += 36
        y += 200
    if show_focus:
        draw.text((56, y), "CRITICAL FOCUS AREAS", font=fk, fill=(*RED, 255))
        y += 32
        focus = [
            "Cost forecast — Project Alpha",
            "Resource capacity — Program Beta",
            "Dependency — Project Gamma",
        ]
        for item in focus:
            draw.rounded_rectangle([56, y, 900, y + 48], radius=8, fill=(40, 16, 24, 230), outline=(248, 113, 113, 140), width=1)
            draw.ellipse([76, y + 17, 90, y + 31], fill=(*RED, 255))
            draw.text((106, y + 12), item, font=fb, fill=(*WHITE, 255))
            y += 56
    return Image.alpha_composite(base.convert("RGBA"), layer).convert("RGB")


def gate_frame(caption: str = "Stage gate — ready for decision") -> Image.Image:
    base, draw, layer = ui_base()
    fk, ft, fb = font(FONT_SEMI, 14), font(FONT_BOLD, 32), font(FONT_SEMI, 18)
    draw.text((56, 40), "GOVERNANCE", font=fk, fill=(*CYAN, 255))
    y = 68
    for line in wrap(draw, caption, ft, W - 120):
        draw.text((56, y), line, font=ft, fill=(*WHITE, 255))
        y += 40
    items = ["Business case", "Financials", "Risks", "Benefits", "Resources", "Dependencies", "Approvals"]
    y = 140
    for item in items:
        draw.rounded_rectangle([56, y, 560, y + 48], radius=8, fill=(12, 24, 48, 230), outline=(52, 211, 153, 140), width=1)
        draw.text((76, y + 12), "✓  " + item, font=fb, fill=(*WHITE, 255))
        y += 58
    draw.rounded_rectangle([640, 200, 1220, 360], radius=14, fill=(10, 40, 32, 230), outline=(52, 211, 153, 200), width=2)
    draw.text((672, 230), "READY FOR DECISION", font=font(FONT_BOLD, 22), fill=(*GREEN, 255))
    draw.text((672, 278), "Approve", font=font(FONT_BOLD, 36), fill=(*WHITE, 255))
    return Image.alpha_composite(base.convert("RGBA"), layer).convert("RGB")


def layers_frame(caption: str = "Work item to portfolio") -> Image.Image:
    base, draw, layer = ui_base()
    fk, ft, fs = font(FONT_SEMI, 14), font(FONT_BOLD, 32), font(FONT_SEMI, 16)
    draw.text((56, 40), "ONE SPINE", font=fk, fill=(*CYAN, 255))
    y = 68
    for line in wrap(draw, caption, ft, W - 120):
        draw.text((56, y), line, font=ft, fill=(*WHITE, 255))
        y += 40
    y += 12
    cols = [
        ("FINANCIALS", ["Budget", "Plan", "Forecast", "Demand", "Actual"]),
        ("RAID", ["Risks", "Assumptions", "Issues", "Dependencies"]),
        ("BENEFITS", ["Planned", "Realised"]),
        ("RESOURCES", ["Capacity", "Allocation", "Actuals"]),
    ]
    x = 56
    for title, items in cols:
        draw.rounded_rectangle([x, 140, x + 280, 520], radius=14, fill=(12, 22, 44, 230), outline=(125, 211, 252, 120), width=1)
        draw.text((x + 22, 162), title, font=fs, fill=(*CYAN, 255))
        y = 210
        for item in items:
            draw.ellipse([x + 24, y + 6, x + 36, y + 18], fill=(*CYAN, 255))
            draw.text((x + 48, y), item, font=fs, fill=(*WHITE, 255))
            y += 42
        x += 304
    return Image.alpha_composite(base.convert("RGBA"), layer).convert("RGB")


def security_frame() -> Image.Image:
    base, draw, layer = ui_base()
    fk, ft, fs = font(FONT_SEMI, 14), font(FONT_BOLD, 34), font(FONT_SEMI, 18)
    draw.text((56, 40), "TRUST", font=fk, fill=(*CYAN, 255))
    draw.text((56, 68), "Security a board will buy", font=ft, fill=(*WHITE, 255))
    items = [
        "Mandatory MFA",
        "SSO",
        "IP allowlisting",
        "Row-level security",
        "Secure database",
        "Bring Your Own Database",
    ]
    x, y = 56, 150
    for item in items:
        draw.rounded_rectangle([x, y, x + 560, y + 64], radius=10, fill=(12, 24, 48, 230), outline=(125, 211, 252, 150), width=1)
        draw.text((x + 24, y + 20), item, font=fs, fill=(*WHITE, 255))
        y += 80
        if y > 560:
            x, y = 660, 150
    return Image.alpha_composite(base.convert("RGBA"), layer).convert("RGB")


def brand_frame() -> Image.Image:
    base, draw, layer = ui_base()
    fk, ft, fb = font(FONT_SEMI, 14), font(FONT_BOLD, 36), font(FONT_REG, 20)
    draw.text((56, 40), "YOUR ORGANISATION", font=fk, fill=(*CYAN, 255))
    draw.text((56, 72), "Make it yours.", font=ft, fill=(*WHITE, 255))
    palettes = [((14, 116, 144), (8, 47, 73)), ((88, 28, 135), (24, 16, 48)), ((15, 118, 110), (8, 40, 36))]
    labels = ["Your logo", "Your colours", "Your login"]
    x = 56
    for (a, b), lab in zip(palettes, labels):
        draw.rounded_rectangle([x, 180, x + 360, 480], radius=16, fill=(*b, 255), outline=(*a, 255), width=2)
        draw.rounded_rectangle([x + 40, 230, x + 320, 300], radius=8, fill=(*a, 255))
        draw.text((x + 56, 250), lab, font=font(FONT_BOLD, 22), fill=(*WHITE, 255))
        draw.text((x + 56, 340), "Custom branding", font=fb, fill=(*MUTED, 255))
        draw.text((x + 56, 374), "White label", font=fb, fill=(*MUTED, 255))
        x += 390
    return Image.alpha_composite(base.convert("RGBA"), layer).convert("RGB")


def network_frame() -> Image.Image:
    return labeled_flow(
        "THE MODEL",
        "Strategy to outcomes. One spine.",
        [
            "Strategic Alignment",
            "Programs",
            "Projects",
            "Estimation",
            "Phases",
            "Streams",
            "Work",
            "Resources",
            "Governance",
            "Delivery",
            "Outcomes",
        ],
        "Portfolio Pulse sits above everything.",
    )


def endcard(wordmark: Path) -> Image.Image:
    base = Image.new("RGB", (W, H), (0, 0, 0))
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    wm = readable_wordmark(wordmark)
    mw = 720
    mh = int(wm.height * (mw / wm.width))
    wm = wm.resize((mw, mh), Image.Resampling.LANCZOS)
    rgba = base.convert("RGBA")
    rgba.paste(wm, ((W - mw) // 2, 110), wm)
    sub = font(FONT_SEMI, 18)
    tag = font(FONT_BOLD, 28)
    line1 = "PMO COMMAND CENTER PLATFORM"
    w1 = draw.textlength(line1, font=sub)
    draw.text(((W - w1) / 2, 110 + mh + 8), line1, font=sub, fill=(*CYAN, 255))
    line2 = "From Strategy to Delivery"
    w2 = draw.textlength(line2, font=font(FONT_REG, 18))
    draw.text(((W - w2) / 2, 110 + mh + 42), line2, font=font(FONT_REG, 18), fill=(*MUTED, 255))
    line3 = "STOP FLYING BLIND"
    w3 = draw.textlength(line3, font=tag)
    draw.text(((W - w3) / 2, 110 + mh + 84), line3, font=tag, fill=(*WHITE, 255))
    return Image.alpha_composite(rgba, layer).convert("RGB")


def load_still(name: str) -> Path:
    p = ACTOR_DIR / f"{name}.jpg"
    if p.exists():
        return p
    q = BG_DIR / f"{name}.jpg"
    if q.exists():
        return q
    sys.exit(f"Missing still {name}")


def B(bid: str, kind: str, spk: str, text: str, **kw) -> dict:
    """One spoken line = one picture, so the cut matches the narrative."""
    row = {
        "id": bid,
        "kind": kind,
        "hold": 2.2,
        "title": kw.pop("title", text),
        "lines": [(spk, text)],
    }
    row.update(kw)
    return row


SPINE = [
    "Strategic Alignment",
    "Programs",
    "Projects",
    "Estimation",
    "Phases",
    "Streams",
    "Work items",
    "Timesheets",
    "Delivery",
]
DEMAND = [
    "New demand",
    "Assessment",
    "Estimation",
    "Prioritisation",
    "Approval",
    "Resource demand",
    "Allocation",
    "Delivery",
]
NETWORK = [
    "Strategic Alignment",
    "Programs",
    "Projects",
    "Estimation",
    "Phases",
    "Streams",
    "Work",
    "Resources",
    "Governance",
    "Delivery",
    "Outcomes",
]

BEATS: list[dict] = [
    B("s1a", "actor", "male", "Are we on track?", still="team-board", corner=True, kicker="The boardroom"),
    B("s1b", "actor", "female", "The projects are... mostly on track.", still="board", kicker="The boardroom", title="The projects are… mostly on track."),
    B("s1c", "actor", "male", "Mostly?", still="team-board", kicker="The boardroom"),
    B("s2a", "actor", "female", "Strategy sits in one place. Projects somewhere else.", still="team-chaos", kicker="The cost", chips=["Excel", "Email", "Teams"]),
    B("s2b", "actor", "female", "Resources, financials, risks and delivery... all telling different stories.", still="team-numbers", kicker="The cost", title="All telling different stories.", chips=["Budget", "RAID", "Plan"]),
    B("s2c", "actor", "male", "And leadership is left trying to connect the dots.", still="command-team", kicker="The cost", title="Leadership is left connecting the dots."),
    B("s2d", "solid", "both", "Stop flying blind."),
    B("s3a", "logo", "female", "Meet iProjectX."),
    B("s3b", "flow", "male", "A single platform connecting strategy, governance, planning and delivery.", kicker="The platform", title="Strategy, governance, planning, delivery.", nodes=["Strategy", "Governance", "Planning", "Delivery"]),
    B("s4a", "flow", "male", "Start with organisational strategy.", kicker="Delivery engine", title="Start with Strategic Alignment.", nodes=SPINE, active=0),
    B("s4b", "flow", "male", "Turn strategy into programs.", kicker="Delivery engine", nodes=SPINE, active=1),
    B("s4c", "flow", "male", "Programs into projects.", kicker="Delivery engine", nodes=SPINE, active=2),
    B("s4d", "flow", "male", "Estimate the effort, cost, resources and timelines.", kicker="Delivery engine", nodes=["Scope", "Effort", "Cost", "Duration", "Resources", "Dependencies"], active=None),
    B("s4e", "flow", "male", "Break projects into phases and streams.", kicker="Delivery engine", nodes=SPINE, active=5),
    B("s4f", "actor", "female", "Turn plans into work.", still="delivery", kicker="Delivery engine", chips=["Work items"]),
    B("s4g", "actor", "female", "Capture actual effort through timesheets.", still="delivery", kicker="Delivery engine", chips=["Timesheets"]),
    B("s4h", "actor", "female", "And manage delivery end to end.", still="s14-action", kicker="Delivery engine", chips=["Delivery"]),
    B("s4i", "flow", "both", "One connected delivery model.", kicker="Delivery engine", nodes=SPINE),
    B("s5a", "actor", "female", "See the entire portfolio through a connected timeline.", still="team-timeline", kicker="Timeline", chips=["Programs", "Projects", "Phases", "Streams", "Milestones"]),
    B("s5b", "actor", "male", "Understand what's happening, what's coming next, and what could impact delivery.", still="team-timeline", kicker="Timeline", title="What's happening. What's next. What could slip.", chips=["Dependencies", "Delivery dates"]),
    B("s6a", "flow", "male", "Manage demand before it becomes delivery.", kicker="Demand & resources", nodes=DEMAND, active=0),
    B("s6b", "actor", "female", "See capacity.", still="team-numbers", kicker="Demand & resources"),
    B("s6c", "actor", "female", "Forecast resource requirements.", still="team-numbers", kicker="Demand & resources"),
    B("s6d", "actor", "female", "Allocate the right people to the right work.", still="s14-action", kicker="Demand & resources"),
    B("s6e", "flow", "male", "And connect planned effort to actual delivery.", kicker="Demand & resources", nodes=["Planned effort", "Actual effort"]),
    B("s7a", "gate", "female", "Govern delivery with structured stage gates."),
    B("s7b", "gate", "male", "Make decisions with the right information, before moving to the next stage.", title="Ready for decision. Approve."),
    B("s8a", "layers", "female", "Manage financials, RAID, benefits, dependencies and resources."),
    B("s8b", "layers", "male", "All connected from work item to portfolio."),
    B("s9a", "actor", "male", "But iProjectX doesn't just collect data.", still="team-pulse", kicker="Intelligence"),
    B("s9b", "pulse", "female", "It makes sense of it.", pulse="score"),
    B("s9c", "pulse", "male", "Portfolio Pulse and Health Status analyse financials, risks, resources, benefits, dependencies and delivery.", pulse="full", title="Portfolio Pulse and Health Status."),
    B("s9d", "pulse", "female", "And identify the areas that need leadership attention.", pulse="focus", title="Areas that need leadership attention."),
    B("s10a", "actor", "female", "Executives get the picture.", still="team-pulse", kicker="The right view"),
    B("s10b", "actor", "female", "Leaders get the insight.", still="team-timeline", kicker="The right view"),
    B("s10c", "actor", "male", "And delivery teams get the detail.", still="delivery", kicker="The right view"),
    B("s10d", "flow", "both", "One platform. The right view for every level.", kicker="The right view", nodes=["Executive", "Leadership", "PMO", "Project manager"]),
    B("s11a", "actor", "male", "From portfolio dashboards, to project detail, everyone sees the information that matters to them.", still="command-team", kicker="Live dashboards", title="Everyone sees what matters to them.", chips=["Portfolio", "Program", "Project", "Resource", "Financials", "Timeline"]),
    B("s12a", "actor", "female", "Built for organisations where security, privacy and trust are essential.", still="team-security", kicker="Trust", chips=["MFA", "SSO", "IP allowlisting"]),
    B("s12b", "security", "male", "With enterprise security controls and flexible deployment options, including Bring Your Own Database.", title="Enterprise controls, including Bring Your Own Database."),
    B("s13a", "brand", "female", "And make it yours. Custom branding. White label. Designed around your organisation.", title="Make it yours."),
    B("s14a", "actor", "male", "What needs my attention?", still="team-resolved", kicker="The question"),
    B("s14b", "pulse", "female", "These three.", pulse="focus"),
    B("s14c", "actor", "male", "Let's fix them.", still="s14-action", kicker="The answer"),
    B("s15a", "network", "male", "See the whole portfolio.", kicker="The model", nodes=NETWORK, title="See the whole portfolio."),
    B("s15b", "network", "female", "Understand what matters.", kicker="The model", nodes=NETWORK, title="Understand what matters."),
    B("s15c", "pulse", "male", "Know where to focus.", pulse="focus"),
    B("end", "end", "both", "Stop flying blind.", hold=5.0),
]

def render_beat(beat: dict, mark_x: Image.Image, wordmark: Path) -> Image.Image:
    kind = beat["kind"]
    if kind == "actor":
        still = load_still(beat["still"])
        return actor_frame(
            still,
            beat.get("kicker", ""),
            beat.get("title", ""),
            beat.get("body", ""),
            beat.get("chips"),
            mark_x if beat.get("corner") else None,
        )
    if kind == "solid":
        base = solid_navy()
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        draw = ImageDraw.Draw(layer)
        ft = font(FONT_BOLD, 48)
        title = beat["title"]
        tw = draw.textlength(title, font=ft)
        draw.text(((W - tw) / 2, H / 2 - 30), title, font=ft, fill=(*WHITE, 255))
        return Image.alpha_composite(base.convert("RGBA"), layer).convert("RGB")
    if kind == "logo":
        base = solid_navy()
        mark = knock_black(mark_x)
        mh = 160
        mw = int(mark.width * (mh / mark.height))
        mark = mark.resize((mw, mh), Image.Resampling.LANCZOS)
        rgba = base.convert("RGBA")
        rgba.paste(mark, ((W - mw) // 2, 150), mark)
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        draw = ImageDraw.Draw(layer)
        name = font(FONT_BOLD, 52)
        sub = font(FONT_SEMI, 18)
        label = "iProjectX"
        lw = draw.textlength(label, font=name)
        draw.text(((W - lw) / 2, 340), label, font=name, fill=(*WHITE, 255))
        tag = "PMO COMMAND CENTER PLATFORM"
        tw = draw.textlength(tag, font=sub)
        draw.text(((W - tw) / 2, 410), tag, font=sub, fill=(*CYAN, 255))
        return Image.alpha_composite(rgba, layer).convert("RGB")
    if kind == "flow":
        return labeled_flow(
            beat["kicker"],
            beat["title"],
            beat["nodes"],
            beat.get("note", ""),
            beat.get("active"),
        )
    if kind == "pulse":
        return pulse_frame(beat.get("pulse", "full"), beat.get("title", "Portfolio Pulse"))
    if kind == "gate":
        return gate_frame(beat.get("title", "Stage gate — ready for decision"))
    if kind == "layers":
        return layers_frame(beat.get("title", "Work item to portfolio"))
    if kind == "security":
        return security_frame()
    if kind == "brand":
        return brand_frame()
    if kind == "network":
        return labeled_flow(
            beat.get("kicker", "THE MODEL"),
            beat.get("title", "Strategy to outcomes. One spine."),
            beat.get(
                "nodes",
                [
                    "Strategic Alignment",
                    "Programs",
                    "Projects",
                    "Estimation",
                    "Phases",
                    "Streams",
                    "Work",
                    "Resources",
                    "Governance",
                    "Delivery",
                    "Outcomes",
                ],
            ),
            beat.get("note", "Portfolio Pulse sits above everything."),
            beat.get("active"),
        )
    if kind == "end":
        return endcard(wordmark)
    raise ValueError(kind)


def encode_visual(slides: list[tuple[float, Path]]) -> Path:
    clips: list[Path] = []
    for i, (hold, png) in enumerate(slides):
        clip = WORK / f"clip_{i:02d}.mp4"
        run(
            [
                "ffmpeg",
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-loop",
                "1",
                "-i",
                str(png),
                "-t",
                f"{hold:.3f}",
                "-r",
                str(FPS),
                "-vf",
                "format=yuv420p",
                "-an",
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-crf",
                "20",
                "-pix_fmt",
                "yuv420p",
                str(clip),
            ]
        )
        clips.append(clip)
    inputs: list[str] = []
    for c in clips:
        inputs += ["-i", str(c)]
    parts = []
    last = "[0:v]"
    offset = slides[0][0] - FADE
    for i in range(1, len(clips)):
        out = f"[x{i}]" if i < len(clips) - 1 else "[vout]"
        parts.append(f"{last}[{i}:v]xfade=transition=fade:duration={FADE}:offset={offset:.3f}{out}")
        last = out
        offset += slides[i][0] - FADE
    visual = WORK / "visual.mp4"
    run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            *inputs,
            "-filter_complex",
            ";".join(parts),
            "-map",
            "[vout]",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "20",
            "-r",
            str(FPS),
            "-pix_fmt",
            "yuv420p",
            "-an",
            "-movflags",
            "+faststart",
            str(visual),
        ]
    )
    return visual


async def tts(text: str, voice: str, dest: Path) -> None:
    communicate = edge_tts.Communicate(text, voice, rate=RATE, volume=VOLUME, pitch=PITCH)
    await communicate.save(str(dest))


async def synth(beats: list[dict]) -> tuple[list[tuple[float, Path]], list[tuple[float, dict]]]:
    placed: list[tuple[float, Path]] = []
    plan: list[tuple[float, dict]] = []
    pic = 0.0
    n = 0
    for beat in beats:
        t = pic + 0.10
        lines = beat.get("lines") or []
        for i, (spk, text) in enumerate(lines):
            if spk == "both":
                m = WORK / f"vo_{n:03d}_m.mp3"
                f = WORK / f"vo_{n:03d}_f.mp3"
                await tts(text, MALE, m)
                await tts(text, FEMALE, f)
                placed.append((t, m))
                placed.append((t + 0.04, f))
                d = max(ffprobe_duration(m), ffprobe_duration(f))
                print(f"  BOTH {t:6.2f} +{d:4.2f}  {text}")
            else:
                dest = WORK / f"vo_{n:03d}.mp3"
                await tts(text, MALE if spk == "male" else FEMALE, dest)
                d = ffprobe_duration(dest)
                placed.append((t, dest))
                print(f"  {spk[:1].upper()}   {t:6.2f} +{d:4.2f}  {text}")
            n += 1
            gap = 0.22 if i < len(lines) - 1 else 0.0
            t += d + gap
        vo_end = t if lines else pic
        hold = max(float(beat.get("hold", 2.2)), (vo_end - pic) + 0.30)
        hold = max(hold, FADE + 1.05)
        plan.append((hold, beat))
        # Match ffmpeg xfade output clock (each dissolve overlaps FADE seconds).
        pic += hold - FADE
    return placed, plan


def decode_vo(path: Path) -> np.ndarray:
    wav = WORK / f"{path.stem}.wav"
    run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(path),
            "-ac",
            "1",
            "-ar",
            str(SR),
            "-af",
            "highpass=f=80,lowpass=f=11000,equalizer=f=3000:t=q:w=1.1:g=1.2,volume=-3.5dB",
            str(wav),
        ]
    )
    with wave.open(str(wav), "rb") as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32767.0


def mix_audio(placed: list[tuple[float, Path]], seconds: float, dest: Path) -> None:
    n = int(seconds * SR)
    mix = np.zeros((n, 2), dtype=np.float64)
    # Clean bed only: two low sine tones. No noise, no shimmer.
    t = np.arange(n) / SR
    fade = np.clip(t / 0.8, 0, 1) * np.clip((seconds - t) / 1.6, 0, 1)
    bed = 0.018 * np.sin(2 * math.pi * 65.41 * t) + 0.010 * np.sin(2 * math.pi * 98.00 * t)
    mix[:, 0] += bed * fade
    mix[:, 1] += bed * fade * 0.96
    for start, path in placed:
        buf = decode_vo(path)
        i0 = int(start * SR)
        if i0 >= n:
            continue
        if i0 < 0:
            buf = buf[-i0:]
            i0 = 0
        i1 = min(n, i0 + len(buf))
        if i1 <= i0:
            continue
        mix[i0:i1, 0] += buf[: i1 - i0] * 0.72
        mix[i0:i1, 1] += buf[: i1 - i0] * 0.72
    peak = float(np.max(np.abs(mix)))
    if peak > 0.70:
        mix *= 0.70 / peak
    pcm = (np.clip(mix, -0.95, 0.95) * 32767).astype(np.int16)
    with wave.open(str(dest), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def measure_loudnorm(path: Path, seconds: float) -> dict:
    proc = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-i",
            str(path),
            "-af",
            f"apad,atrim=0:{seconds:.3f},loudnorm=I=-18:TP=-2.0:LRA=11:print_format=json",
            "-f",
            "null",
            "-",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    match = re.search(r"\{[\s\S]*\}", proc.stderr)
    if not match:
        raise RuntimeError(proc.stderr[-2000:])
    return json.loads(match.group(0))


def mux(visual: Path, audio: Path) -> None:
    vdur = ffprobe_duration(visual)
    stats = measure_loudnorm(audio, vdur)
    stats = dict(stats)
    stats["input_i"] = f"{min(float(stats['input_i']), -0.1):.2f}"
    stats["input_tp"] = f"{min(float(stats['input_tp']), -0.1):.2f}"
    print("loudnorm", {k: stats.get(k) for k in ("input_i", "input_tp", "input_lra", "target_offset")})
    loud = (
        "apad,atrim=0:{vdur:.3f},"
        "loudnorm=I=-18:TP=-2.0:LRA=11:linear=true:"
        "measured_I={input_i}:measured_TP={input_tp}:"
        "measured_LRA={input_lra}:measured_thresh={input_thresh}:"
        "offset={target_offset},"
        "alimiter=limit=0.89,"
        "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a]"
    ).format(vdur=vdur, **stats)
    tmp = WORK / "final.mp4"
    run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(visual),
            "-i",
            str(audio),
            "-filter_complex",
            f"[1:a]{loud}",
            "-map",
            "0:v:0",
            "-map",
            "[a]",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "21",
            "-r",
            str(FPS),
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            str(tmp),
        ]
    )
    shutil.copy2(tmp, OUT_MP4)
    run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            "0.4",
            "-i",
            str(OUT_MP4),
            "-frames:v",
            "1",
            "-q:v",
            "4",
            str(OUT_POSTER),
        ]
    )


async def main() -> None:
    if WORK.exists():
        shutil.rmtree(WORK)
    WORK.mkdir(parents=True)
    mark_path = LOGO_DIR / "mark-x.png"
    word_path = LOGO_DIR / "wordmark.png"
    if not mark_path.exists() or not word_path.exists():
        sys.exit("Missing logos")
    mark_x = Image.open(mark_path)
    print("== voice")
    placed, plan = await synth(BEATS)
    print("== slides")
    slides: list[tuple[float, Path]] = []
    for i, (hold, beat) in enumerate(plan):
        img = render_beat(beat, mark_x, word_path)
        dest = WORK / f"slide_{i:02d}.png"
        img.save(dest, "PNG", optimize=True)
        slides.append((hold, dest))
        print(f"slide {dest.name} {hold:4.1f}s  {beat['id']}")
    print("== picture")
    visual = encode_visual(slides)
    dur = ffprobe_duration(visual)
    print("visual", dur)
    last = max(start + ffprobe_duration(p) for start, p in placed)
    print("last VO end", last)
    print("== mix")
    mixed = WORK / "mix.wav"
    mix_audio(placed, dur + 0.3, mixed)
    print("== mux")
    mux(visual, mixed)
    print("done", ffprobe_duration(OUT_MP4), OUT_MP4.stat().st_size)


if __name__ == "__main__":
    asyncio.run(main())
