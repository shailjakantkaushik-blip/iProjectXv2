#!/usr/bin/env python3
"""Build the iProjectX advert: logos, Australian voiceover, original music bed."""

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

ROOT = Path(__file__).resolve().parents[1]
WORK = Path("/tmp/ipx-ad")
OUT_MP4 = ROOT / "public/landing/ipx-pitch.mp4"
OUT_POSTER = ROOT / "public/landing/ipx-pitch-poster.jpg"
LOGO_DIR = ROOT / "public/landing/logos"

VOICE = "en-AU-WilliamMultilingualNeural"
RATE = "-6%"
PITCH = "-3Hz"
SR = 44100

INTRO_S = 2.85
OUTRO_S = 5.15
FILM_S = 37.766667
TOTAL_S = INTRO_S + FILM_S + OUTRO_S

# Voice cues on the finished timeline (intro + film + outro).
LINES: list[tuple[float, str]] = [
    (0.55, "iProjectX."),
    (3.15, "Your board is still flying blind."),
    (7.85, "The money shock always comes too late."),
    (12.55, "Gates live in inboxes. RAID lives nowhere."),
    (17.25, "And security is an open door."),
    (21.95, "iProjectX is the command center they do not have."),
    (26.70, "Health is calculated. Pulse is live."),
    (31.10, "Mandatory MFA. IP allowlisting."),
    (35.20, "Bring your own database."),
    (37.50, "Your data stays yours."),
    (41.20, "Plan. Execute. Deliver."),
    (44.15, "Stop flying blind."),
]


def run(cmd: list[str]) -> None:
    print("+", " ".join(str(c) for c in cmd[:10]), "..." if len(cmd) > 10 else "")
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


async def synth_line(text: str, dest: Path) -> None:
    communicate = edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH)
    await communicate.save(str(dest))


async def synth_all_lines() -> list[tuple[float, Path, float]]:
    placed: list[tuple[float, Path, float]] = []
    for i, (start, text) in enumerate(LINES):
        dest = WORK / f"vo_{i:02d}.mp3"
        await synth_line(text, dest)
        dur = ffprobe_duration(dest)
        placed.append((start, dest, dur))
        print(f"  VO {start:5.2f}s +{dur:4.2f}s  {text}")
    return placed


def wav_write(path: Path, stereo: np.ndarray) -> None:
    stereo = np.clip(stereo, -0.99, 0.99)
    pcm = (stereo * 32767.0).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def env_exp(n: int, attack: float, release: float) -> np.ndarray:
    a = max(1, int(attack * SR))
    r = max(1, int(release * SR))
    e = np.ones(n, dtype=np.float64)
    e[: min(a, n)] = np.linspace(0.0, 1.0, min(a, n))
    if r < n:
        e[-r:] *= np.linspace(1.0, 0.0, r)
    return e


def tone(freq: float, t: np.ndarray, detune: float = 0.0) -> np.ndarray:
    return np.sin(2 * math.pi * (freq * (1.0 + detune)) * t)


def music_bed(seconds: float) -> np.ndarray:
    n = int(seconds * SR)
    t = np.arange(n) / SR
    left = np.zeros(n)
    right = np.zeros(n)

    def add_pad(freq: float, amp: float, t0: float, t1: float, pan: float = 0.0) -> None:
        i0 = int(t0 * SR)
        i1 = min(n, int(t1 * SR))
        if i1 <= i0:
            return
        sl = slice(i0, i1)
        tt = t[sl] - t0
        wave = (
            tone(freq, tt)
            + 0.45 * tone(freq, tt, 0.003)
            + 0.22 * tone(freq * 2, tt)
            + 0.08 * tone(freq * 3, tt)
        )
        e = env_exp(i1 - i0, 0.9, 1.4)
        e *= 0.82 + 0.18 * np.sin(2 * math.pi * 0.07 * tt)
        sig = amp * e * wave
        ang = (pan + 1.0) * math.pi / 4.0
        left[sl] += sig * math.cos(ang)
        right[sl] += sig * math.sin(ang)

    # Problem act: dark D minor
    add_pad(73.42, 0.11, 0.0, 22.5, -0.2)
    add_pad(110.00, 0.08, 0.4, 22.5, 0.25)
    add_pad(146.83, 0.05, 1.0, 22.5, 0.0)
    add_pad(174.61, 0.035, 8.0, 22.0, 0.35)

    # Product lift
    add_pad(98.00, 0.10, 21.6, seconds, -0.15)
    add_pad(146.83, 0.07, 21.8, seconds, 0.2)
    add_pad(196.00, 0.045, 22.2, seconds, 0.05)
    add_pad(246.94, 0.03, 26.5, seconds, 0.4)

    # Outro resolve
    add_pad(130.81, 0.09, 40.6, seconds, -0.1)
    add_pad(164.81, 0.06, 40.8, seconds, 0.15)
    add_pad(196.00, 0.05, 41.0, seconds, 0.0)
    add_pad(261.63, 0.04, 41.2, seconds, 0.2)

    pulse_hz = 80.0 / 60.0
    pulse = (np.sin(2 * math.pi * 46.0 * t) ** 9) * (
        0.5 + 0.5 * np.sin(2 * math.pi * pulse_hz * t)
    )
    pulse *= 0.035 * env_exp(n, 0.2, 1.2)
    fade = np.ones(n)
    outro_i = int(40.5 * SR)
    if outro_i < n:
        fade[outro_i:] = np.linspace(1.0, 0.15, n - outro_i)
    left += pulse * fade * 0.85
    right += pulse * fade * 0.75

    add_pad(392.00, 0.04, 0.15, 2.6, 0.1)
    add_pad(523.25, 0.025, 0.35, 2.4, -0.1)

    rng = np.random.default_rng(7)
    shimmer = rng.standard_normal(n) * 0.008 * (0.6 + 0.4 * np.sin(2 * math.pi * 0.05 * t))
    left += shimmer
    right += shimmer * 0.9

    left *= env_exp(n, 0.25, 1.8)
    right *= env_exp(n, 0.25, 1.8)
    peak = max(float(np.max(np.abs(left))), float(np.max(np.abs(right))), 1e-6)
    gain = 0.28 / peak
    return np.stack([left * gain, right * gain], axis=1)


def mix_voiceover(placed: list[tuple[float, Path, float]], music_wav: Path, out_wav: Path) -> None:
    n = int(TOTAL_S * SR)
    mix = np.zeros((n, 2), dtype=np.float64)
    with wave.open(str(music_wav), "rb") as w:
        mus = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32767.0
        mus = mus.reshape(-1, 2)
    m = min(n, len(mus))
    mix[:m] += mus[:m] * 0.48

    vo_mono = np.zeros(n, dtype=np.float64)
    for start, path, _dur in placed:
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
        vo_mono[i0:i1] += buf[: i1 - i0]

    win = int(0.04 * SR)
    mag = np.convolve(np.abs(vo_mono), np.ones(win) / win, mode="same")
    duck = 1.0 - 0.78 * np.clip(mag / 0.07, 0.0, 1.0)
    mix[:, 0] *= duck
    mix[:, 1] *= duck
    mix[:, 0] += vo_mono * 0.78
    mix[:, 1] += vo_mono * 0.78
    wav_write(out_wav, mix)


def build_visuals(film: Path, mark_x: Path, wordmark: Path) -> Path:
    intro = WORK / "intro.mp4"
    outro = WORK / "outro.mp4"
    film_logo = WORK / "film_logo.mp4"
    bug = WORK / "mark-bug.png"

    run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(mark_x),
            "-vf",
            "colorkey=0x000000:0.16:0.28,scale=128:-1:flags=lanczos,format=rgba",
            str(bug),
        ]
    )
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
            str(mark_x),
            "-t",
            f"{INTRO_S}",
            "-vf",
            "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,"
            "zoompan=z='min(1.0+0.0007*on,1.07)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
            f"d={int(INTRO_S * 30)}:s=1280x720:fps=30,"
            f"fade=t=in:st=0:d=0.45,fade=t=out:st={INTRO_S - 0.35}:d=0.35,format=yuv420p",
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            str(intro),
        ]
    )
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
            str(wordmark),
            "-t",
            f"{OUTRO_S}",
            "-vf",
            "scale=1080:-1:force_original_aspect_ratio=decrease,"
            "pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,"
            f"fade=t=in:st=0:d=0.5,fade=t=out:st={OUTRO_S - 0.7}:d=0.7,format=yuv420p",
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            str(outro),
        ]
    )
    run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(film),
            "-loop",
            "1",
            "-i",
            str(bug),
            "-filter_complex",
            "[1:v]format=rgba,fade=t=in:st=0.35:d=0.6:alpha=1[logo];"
            "[0:v][logo]overlay=W-w-16:12:shortest=1:format=auto,format=yuv420p",
            "-t",
            f"{FILM_S}",
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            str(film_logo),
        ]
    )
    visual = WORK / "visual.mp4"
    run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(intro),
            "-i",
            str(film_logo),
            "-i",
            str(outro),
            "-filter_complex",
            "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]",
            "-map",
            "[v]",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-an",
            str(visual),
        ]
    )
    return visual


def mux(visual: Path, audio: Path, dest: Path) -> None:
    tmp = WORK / "final.mp4"
    vdur = ffprobe_duration(visual)
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
            f"[1:a]apad,atrim=0:{vdur:.3f},loudnorm=I=-14:TP=-1.5:LRA=11,"
            "volume=-1.2dB,"
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
            "20",
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
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(tmp, dest)


def resolve_logos() -> tuple[Path, Path]:
    LOGO_DIR.mkdir(parents=True, exist_ok=True)
    mark_x = LOGO_DIR / "mark-x.png"
    wordmark = LOGO_DIR / "wordmark.png"
    candidates_x = [
        mark_x,
        Path("/opt/cursor/artifacts/assets/iprojectx-mark-x.png"),
    ]
    candidates_w = [
        wordmark,
        Path("/opt/cursor/artifacts/assets/iprojectx-wordmark.png"),
    ]
    src_x = next((p for p in candidates_x if p.exists()), None)
    src_w = next((p for p in candidates_w if p.exists()), None)
    if not src_x or not src_w:
        sys.exit("Missing iProjectX mark/wordmark logo files")
    if src_x != mark_x:
        shutil.copy2(src_x, mark_x)
    if src_w != wordmark:
        shutil.copy2(src_w, wordmark)
    return mark_x, wordmark


async def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    mark_x, wordmark = resolve_logos()
    repo_film = ROOT / "public/landing/ipx-pitch.mp4"
    if not repo_film.exists():
        sys.exit(f"Missing film {repo_film}")
    silent = WORK / "film-silent.mp4"
    if not silent.exists():
        shutil.copy2(repo_film, silent)
        # If repo film already has audio from a previous run, strip it
        probe = subprocess.check_output(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "a",
                "-show_entries",
                "stream=codec_type",
                "-of",
                "csv=p=0",
                str(silent),
            ],
            text=True,
        ).strip()
        if probe:
            stripped = WORK / "film-silent-v.mp4"
            run(
                [
                    "ffmpeg",
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    str(silent),
                    "-an",
                    "-c:v",
                    "copy",
                    str(stripped),
                ]
            )
            silent = stripped

    print("== voice")
    placed = await synth_all_lines()
    print("== music")
    bed = WORK / "music.wav"
    wav_write(bed, music_bed(TOTAL_S + 0.4))
    print("== mix")
    mixed = WORK / "mix.wav"
    mix_voiceover(placed, bed, mixed)
    print("== picture")
    visual = build_visuals(silent, mark_x, wordmark)
    print("== mux")
    mux(visual, mixed, OUT_MP4)
    run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            "1.4",
            "-i",
            str(OUT_MP4),
            "-frames:v",
            "1",
            "-q:v",
            "3",
            str(OUT_POSTER),
        ]
    )
    print("duration", ffprobe_duration(OUT_MP4), "->", OUT_MP4, "bytes", OUT_MP4.stat().st_size)


if __name__ == "__main__":
    asyncio.run(main())
