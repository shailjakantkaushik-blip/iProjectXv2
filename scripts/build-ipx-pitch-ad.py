#!/usr/bin/env python3
"""Build a seamless iProjectX enterprise advert (no Ken Burns, no opening logo)."""

from __future__ import annotations

import asyncio
import math
import shutil
import subprocess
import sys
import wave
from pathlib import Path

import edge_tts
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
WORK = Path("/tmp/ipx-ad2")
OUT_MP4 = ROOT / "public/landing/ipx-pitch.mp4"
OUT_POSTER = ROOT / "public/landing/ipx-pitch-poster.jpg"
LOGO_DIR = ROOT / "public/landing/logos"
ASSETS = Path("/opt/cursor/artifacts/assets")
BG_DIR = ROOT / "public/landing/story-bg"

def bg(name: str) -> Path:
    local = BG_DIR / f"{name}.jpg"
    art = ASSETS / f"bg-{name}.png"
    return local if local.exists() else art

# Atmosphere stills — product UI, not zooming photographs.
BACKGROUNDS = {
    "fragment": bg("fragment"),
    "command": bg("command"),
    "spine": bg("spine"),
    "health": bg("health"),
    "cockpit": bg("cockpit"),
    "money": bg("money"),
    "govern": bg("govern"),
    "delivery": bg("delivery"),
    "trust": bg("trust"),
}

VOICE = "en-AU-WilliamMultilingualNeural"
RATE = "-4%"
PITCH = "-2Hz"
SR = 44100
W, H = 1280, 720
FPS = 24
HOLD = 6.35
FADE = 0.90
FONT_BOLD = Path("/usr/share/fonts/truetype/macos/Inter-Bold.ttf")
FONT_SEMI = Path("/usr/share/fonts/truetype/macos/Inter-SemiBold.ttf")
FONT_REG = Path("/usr/share/fonts/truetype/macos/Inter-Regular.ttf")


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size)


def cover_resize(im: Image.Image, w: int, h: int) -> Image.Image:
    im = im.convert("RGB")
    scale = max(w / im.width, h / im.height)
    nw, nh = int(im.width * scale), int(im.height * scale)
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - w) // 2
    top = (nh - h) // 2
    return im.crop((left, top, left + w, top + h))


def bottom_gradient(base: Image.Image, strength: float = 0.88) -> Image.Image:
    overlay = Image.new("RGBA", base.size, (7, 11, 24, 0))
    pix = overlay.load()
    h = base.height
    start = int(h * 0.38)
    for y in range(start, h):
        t = (y - start) / max(1, h - start)
        a = int(255 * strength * (t**1.15))
        for x in range(base.width):
            pix[x, y] = (7, 11, 24, a)
    out = base.convert("RGBA")
    out = Image.alpha_composite(out, overlay)
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
    pad_x, pad_y = 14, 8
    tw = int(draw.textlength(label, font=fnt))
    w, h = tw + pad_x * 2, 28 + pad_y
    x, y = xy
    draw.rounded_rectangle(
        [x, y, x + w, y + h],
        radius=8,
        fill=(12, 22, 44, 210),
        outline=(125, 211, 252, 160),
        width=1,
    )
    draw.text((x + pad_x, y + 8), label, font=fnt, fill=(226, 244, 255, 255))
    return w + 8


def compose_slide(
    bg_path: Path | None,
    kicker: str,
    title: str,
    body: str,
    chips: list[str] | None = None,
    wordmark: Path | None = None,
) -> Image.Image:
    if bg_path and bg_path.exists():
        base = cover_resize(Image.open(bg_path), W, H)
        base = base.filter(ImageFilter.GaussianBlur(radius=0.4))
        # Slightly darken so type always reads
        dim = Image.new("RGB", (W, H), (7, 11, 24))
        base = Image.blend(base, dim, 0.28)
        base = bottom_gradient(base, 0.92)
    else:
        base = Image.new("RGB", (W, H), (7, 11, 24))
        # subtle vignette
        vig = Image.new("L", (W, H), 0)
        vd = ImageDraw.Draw(vig)
        vd.ellipse([-80, -120, W + 80, H + 160], fill=255)
        vig = vig.filter(ImageFilter.GaussianBlur(90))
        tint = Image.new("RGB", (W, H), (18, 36, 72))
        base = Image.composite(tint, base, vig)

    rgba = base.convert("RGBA")
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    fk = font(FONT_SEMI, 15)
    ft = font(FONT_BOLD, 42)
    fb = font(FONT_REG, 22)
    fc = font(FONT_SEMI, 13)

    if wordmark and wordmark.exists():
        mark = Image.open(wordmark).convert("RGBA")
        arr = np.array(mark)
        r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
        luma = r.astype(np.int16) + g.astype(np.int16) + b.astype(np.int16)
        a = np.where(luma < 28, 0, a)
        arr[:, :, 3] = a
        mark = Image.fromarray(arr, "RGBA")
        mw = 280
        mh = int(mark.height * (mw / mark.width))
        mark = mark.resize((mw, mh), Image.Resampling.LANCZOS)
        rgba.paste(mark, ((W - mw) // 2, 88), mark)
        name = font(FONT_BOLD, 52)
        tag = font(FONT_SEMI, 18)
        sub = font(FONT_BOLD, 36)
        label = "iProjectX"
        lw = draw.textlength(label, font=name)
        draw.text(((W - lw) / 2, 88 + mh + 18), label, font=name, fill=(248, 250, 252, 255))
        tagline = "PLAN  ·  EXECUTE  ·  DELIVER"
        tw = draw.textlength(tagline, font=tag)
        draw.text(((W - tw) / 2, 88 + mh + 80), tagline, font=tag, fill=(125, 211, 252, 255))
        for i, line in enumerate(wrap(draw, title, sub, W - 160)):
            lw = draw.textlength(line, font=sub)
            draw.text(((W - lw) / 2, 88 + mh + 126 + i * 44), line, font=sub, fill=(248, 250, 252, 255))
        out = Image.alpha_composite(rgba, layer)
        return out.convert("RGB")

    x = 56
    y = H - 268
    kicker_label = kicker.upper()
    kw = int(draw.textlength(kicker_label, font=fk)) + 28
    draw.rounded_rectangle(
        [x, y - 18, x + kw, y + 10],
        radius=6,
        fill=(8, 14, 32, 180),
        outline=(147, 197, 253, 140),
        width=1,
    )
    draw.text((x + 12, y - 12), kicker_label, font=fk, fill=(147, 197, 253, 255))

    y += 28
    for line in wrap(draw, title, ft, W - 120):
        draw.text((x, y), line, font=ft, fill=(248, 250, 252, 255))
        y += 50
    y += 6
    for line in wrap(draw, body, fb, W - 140):
        draw.text((x, y), line, font=fb, fill=(214, 224, 236, 255))
        y += 30

    if chips:
        y += 14
        cx = x
        for chip in chips:
            used = draw_chip(draw, (cx, y), chip, fc)
            cx += used
            if cx > W - 180:
                cx = x
                y += 44

    out = Image.alpha_composite(rgba, layer)
    return out.convert("RGB")


SLIDES = [
    {
        "id": "fragment",
        "bg": "fragment",
        "kicker": "The real world",
        "title": "Portfolios still fly blind.",
        "body": "Decks, spreadsheets, email gates, and five tools that never agree.",
        "chips": ["Excel RAG", "Late packs", "No live pulse"],
    },
    {
        "id": "command",
        "bg": "command",
        "kicker": "iProjectX",
        "title": "One command center.",
        "body": "From Strategic Alignment to the work item — one data model. No drift.",
        "chips": ["Agile + Waterfall", "White-label", "One truth"],
    },
    {
        "id": "spine",
        "bg": "spine",
        "kicker": "The spine",
        "title": "Strategy to work item.",
        "body": "Strategic Alignment, programs, functional areas, projects, streams, work.",
        "chips": [
            "Strategic Alignment",
            "Program",
            "Area",
            "Project",
            "Stream",
            "Work item",
        ],
    },
    {
        "id": "health",
        "bg": "health",
        "kicker": "Intelligence",
        "title": "Health is calculated. Pulse is live.",
        "body": "Eight dimensions. Week-over-week change leaders can act on — before the board pack.",
        "chips": ["Project Health", "Portfolio Pulse", "Explainable KPIs"],
    },
    {
        "id": "cockpit",
        "bg": "cockpit",
        "kicker": "Command Center",
        "title": "Executive Cockpit. Live, not a slideshow.",
        "body": "Steering, financials, health mix, what-ifs — filterable, drillable, one truth.",
        "chips": ["Cockpit", "Intelligence", "30-day outlook"],
    },
    {
        "id": "money",
        "bg": "money",
        "kicker": "Financials",
        "title": "Budget. Plan. Forecast. Demand. Actual.",
        "body": "Explainable money. Benefits from business case to realisation. EVM when you need it.",
        "chips": ["Budget", "Plan", "Forecast", "Demand", "Actual"],
    },
    {
        "id": "govern",
        "bg": "govern",
        "kicker": "Governance",
        "title": "Gates with evidence. RAID on the same spine.",
        "body": "Approvals that audit. Risks, actions, issues, decisions tied to delivery — not a forgotten file.",
        "chips": ["Stage gates", "RAID", "Forums", "Cadence"],
    },
    {
        "id": "delivery",
        "bg": "delivery",
        "kicker": "Delivery",
        "title": "Work items. Capacity. Timesheets.",
        "body": "The board, the timeline, Jira when you want it. People hours that match the plan.",
        "chips": ["Work items", "Resources", "Timesheets", "Jira"],
    },
    {
        "id": "trust",
        "bg": "trust",
        "kicker": "Trust",
        "title": "Security enterprises can buy.",
        "body": "Mandatory MFA. IP allowlisting. Bring Your Own Database. Isolation. In-house AI.",
        "chips": ["MFA", "IP allowlist", "BYOD", "RLS", "In-house AI"],
    },
    {
        "id": "close",
        "bg": None,
        "kicker": "",
        "title": "Stop flying blind.",
        "body": "Plan. Execute. Deliver.",
        "wordmark": True,
    },
]


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


def render_slides(mark_x: Path) -> list[Path]:
    WORK.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for i, spec in enumerate(SLIDES):
        bg = BACKGROUNDS.get(spec["bg"]) if spec.get("bg") else None
        img = compose_slide(
            bg,
            spec["kicker"],
            spec["title"],
            spec["body"],
            spec.get("chips"),
            mark_x if spec.get("wordmark") else None,
        )
        dest = WORK / f"slide_{i:02d}.png"
        img.save(dest, "PNG", optimize=True)
        paths.append(dest)
        print("slide", dest.name, spec["title"])
    return paths


def encode_visual(slides: list[Path]) -> Path:
    clips: list[Path] = []
    for i, png in enumerate(slides):
        clip = WORK / f"clip_{i:02d}.mp4"
        # Static hold — no zoompan. That filter was the flicker.
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
                f"{HOLD}",
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

    n = len(clips)
    inputs: list[str] = []
    for c in clips:
        inputs += ["-i", str(c)]
    parts = []
    last = "[0:v]"
    offset = HOLD - FADE
    for i in range(1, n):
        out = f"[x{i}]" if i < n - 1 else "[vout]"
        parts.append(
            f"{last}[{i}:v]xfade=transition=fade:duration={FADE}:offset={offset:.3f}{out}"
        )
        last = out
        offset += HOLD - FADE
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


LINES: list[tuple[float, str]] = [
    (0.55, "Portfolios still run on decks, spreadsheets, and disconnected tools."),
    (6.10, "iProjectX is one command center — from Strategic Alignment to the work item."),
    (11.80, "One spine — strategy to work. Agile and Waterfall."),
    (17.40, "Health is calculated. Pulse tells leaders what changed this week."),
    (22.90, "The Executive Cockpit is live intelligence — not a slideshow."),
    (28.50, "Five money layers. Explainable forecast. Benefits that score."),
    (34.00, "Stage gates with evidence. RAID on the same spine as delivery."),
    (39.50, "Work items, capacity, timesheets. Jira when you need it."),
    (45.10, "Mandatory MFA. IP allowlisting. Bring your own database."),
    (51.40, "Stop flying blind."),
]


async def synth_all() -> list[tuple[float, Path]]:
    placed: list[tuple[float, Path]] = []
    for i, (start, text) in enumerate(LINES):
        dest = WORK / f"vo_{i:02d}.mp3"
        communicate = edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH)
        await communicate.save(str(dest))
        dur = ffprobe_duration(dest)
        print(f"  VO {start:5.2f} +{dur:4.2f}  {text}")
        placed.append((start, dest))
    return placed


def env_exp(n: int, attack: float, release: float) -> np.ndarray:
    a = max(1, int(attack * SR))
    r = max(1, int(release * SR))
    e = np.ones(n, dtype=np.float64)
    e[: min(a, n)] = np.linspace(0.0, 1.0, min(a, n))
    if r < n:
        e[-r:] *= np.linspace(1.0, 0.0, r)
    return e


def music_bed(seconds: float) -> np.ndarray:
    n = int(seconds * SR)
    t = np.arange(n) / SR
    left = np.zeros(n)
    right = np.zeros(n)

    def pad(freq: float, amp: float, t0: float, t1: float, pan: float) -> None:
        i0, i1 = int(t0 * SR), min(n, int(t1 * SR))
        if i1 <= i0:
            return
        tt = t[i0:i1] - t0
        wave = np.sin(2 * math.pi * freq * tt) + 0.35 * np.sin(2 * math.pi * freq * 1.003 * tt)
        wave += 0.18 * np.sin(2 * math.pi * freq * 2 * tt)
        e = env_exp(i1 - i0, 1.1, 1.6) * (0.84 + 0.16 * np.sin(2 * math.pi * 0.06 * tt))
        sig = amp * e * wave
        ang = (pan + 1) * math.pi / 4
        left[i0:i1] += sig * math.cos(ang)
        right[i0:i1] += sig * math.sin(ang)

    pad(65.41, 0.10, 0.0, 18.0, -0.2)
    pad(98.00, 0.07, 0.4, 18.0, 0.25)
    pad(130.81, 0.05, 1.0, 18.5, 0.0)
    pad(87.31, 0.09, 16.5, seconds, -0.15)
    pad(130.81, 0.07, 17.0, seconds, 0.2)
    pad(196.00, 0.04, 18.0, seconds, 0.05)
    pad(164.81, 0.05, 44.0, seconds, 0.1)
    pad(196.00, 0.05, 44.5, seconds, -0.1)
    pad(261.63, 0.035, 45.0, seconds, 0.15)
    rng = np.random.default_rng(3)
    shimmer = rng.standard_normal(n) * 0.006 * (0.55 + 0.45 * np.sin(2 * math.pi * 0.04 * t))
    left += shimmer
    right += shimmer * 0.92
    left *= env_exp(n, 0.3, 2.0)
    right *= env_exp(n, 0.3, 2.0)
    peak = max(float(np.max(np.abs(left))), float(np.max(np.abs(right))), 1e-6)
    g = 0.26 / peak
    return np.stack([left * g, right * g], axis=1)


def wav_write(path: Path, stereo: np.ndarray) -> None:
    pcm = (np.clip(stereo, -0.99, 0.99) * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def mix_audio(placed: list[tuple[float, Path]], seconds: float, dest: Path) -> None:
    n = int(seconds * SR)
    mix = np.zeros((n, 2), dtype=np.float64)
    bed = music_bed(seconds + 0.4)
    m = min(n, len(bed))
    mix[:m] += bed[:m] * 0.50
    vo = np.zeros(n)
    for start, path in placed:
        pcm = WORK / f"{path.stem}.wav"
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
                str(pcm),
            ]
        )
        with wave.open(str(pcm), "rb") as w:
            buf = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32767.0
        i0 = int(start * SR)
        i1 = min(n, i0 + len(buf))
        vo[i0:i1] += buf[: i1 - i0]
    win = int(0.045 * SR)
    mag = np.convolve(np.abs(vo), np.ones(win) / win, mode="same")
    duck = 1.0 - 0.78 * np.clip(mag / 0.07, 0.0, 1.0)
    mix[:, 0] *= duck
    mix[:, 1] *= duck
    mix[:, 0] += vo * 0.80
    mix[:, 1] += vo * 0.80
    wav_write(dest, mix)


def mux(visual: Path, audio: Path) -> None:
    vdur = ffprobe_duration(visual)
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
            f"[1:a]apad,atrim=0:{vdur:.3f},loudnorm=I=-15:TP=-2.0:LRA=11,volume=-0.6dB,"
            "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a]",
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
            "160k",
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
            "7.2",
            "-i",
            str(OUT_MP4),
            "-frames:v",
            "1",
            "-q:v",
            "4",
            str(OUT_POSTER),
        ]
    )


def resolve_mark() -> Path:
    LOGO_DIR.mkdir(parents=True, exist_ok=True)
    dest = LOGO_DIR / "mark-x.png"
    srcs = [dest, ASSETS / "iprojectx-mark-x.png"]
    src = next((p for p in srcs if p.exists()), None)
    if not src:
        sys.exit("Missing mark")
    if src != dest:
        shutil.copy2(src, dest)
    return dest


async def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    missing = [k for k, p in BACKGROUNDS.items() if not p.exists()]
    if missing:
        sys.exit(f"Missing background stills: {missing}")
    mark_x = resolve_mark()
    print("== slides")
    slides = render_slides(mark_x)
    print("== picture")
    visual = encode_visual(slides)
    dur = ffprobe_duration(visual)
    print("visual", dur)
    print("== voice")
    placed = await synth_all()
    print("== mix")
    mixed = WORK / "mix.wav"
    mix_audio(placed, dur + 0.2, mixed)
    print("== mux")
    mux(visual, mixed)
    print("done", ffprobe_duration(OUT_MP4), OUT_MP4.stat().st_size)


if __name__ == "__main__":
    asyncio.run(main())
