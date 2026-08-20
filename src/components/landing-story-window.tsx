import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import type { LandingConfig } from "@/lib/landing-config";

/**
 * Overlay copy is always light-on-dark. Global `h1–h6` rules set
 * `color: var(--color-heading)` (navy), which made titles unreadable
 * on the hero. Do not use heading tags here.
 */
const TYPE: CSSProperties = {
  fontFamily: "'Sora', system-ui, sans-serif",
  color: "#F8FAFC",
};
const CAPTION: CSSProperties = {
  fontFamily: "'Manrope', system-ui, sans-serif",
  color: "#E8EEF8",
};

const VIDEO_SRC = "/landing/ipx-pitch.mp4";
const POSTER_SRC = "/landing/ipx-pitch-poster.jpg";

const INTRO_S = 2.85;
const FILM_S = 37.766667;
const SCENE_S = FILM_S / 8;

type Beat = {
  start: number;
  kicker: string;
  title: string;
  body: string;
  tone: "problem" | "pitch" | "trust";
  captions: boolean;
};

/** Selling-pitch beats, aligned to intro + film + wordmark end card. */
const BEATS: Beat[] = [
  {
    start: 0,
    captions: false,
    kicker: "iProjectX",
    tone: "pitch",
    title: "Plan. Execute. Deliver.",
    body: "The PMO command center for live portfolio truth.",
  },
  {
    start: INTRO_S,
    captions: true,
    kicker: "The real world",
    tone: "problem",
    title: "Your board is still flying blind.",
    body: "Packs land late. RAG is typed by hand. Pressure stays invisible until it is already a crisis.",
  },
  {
    start: INTRO_S + SCENE_S,
    captions: true,
    kicker: "The real world",
    tone: "problem",
    title: "The money shock always comes too late.",
    body: "Overruns surface at year-end recon. Nobody saw the forecast drift while there was still time to act.",
  },
  {
    start: INTRO_S + SCENE_S * 2,
    captions: true,
    kicker: "The real world",
    tone: "problem",
    title: "Gates live in inboxes. RAID lives nowhere.",
    body: "Stage gates get rubber-stamped in email. Risks sit in a spreadsheet nobody owns.",
  },
  {
    start: INTRO_S + SCENE_S * 3,
    captions: true,
    kicker: "The real world",
    tone: "problem",
    title: "And security is an open door.",
    body: "Shared logins. No MFA. Vendors and operators can see the whole portfolio.",
  },
  {
    start: INTRO_S + SCENE_S * 4,
    captions: true,
    kicker: "The pitch",
    tone: "pitch",
    title: "iProjectX is the command center they do not have.",
    body: "One intelligence layer over delivery — health, pulse, money, gates, and RAID on the same spine.",
  },
  {
    start: INTRO_S + SCENE_S * 5,
    captions: true,
    kicker: "How you win",
    tone: "pitch",
    title: "Health is calculated. Pulse is live.",
    body: "Eight dimensions. Week-over-week change. Leaders act before the board pack is late.",
  },
  {
    start: INTRO_S + SCENE_S * 6,
    captions: true,
    kicker: "Why they can trust it",
    tone: "trust",
    title: "MFA. IP allowlisting. Bring Your Own Database.",
    body: "Authenticator is mandatory. Lock the organisation to your network. Keep tenant registers on your database.",
  },
  {
    start: INTRO_S + SCENE_S * 7,
    captions: true,
    kicker: "The close",
    tone: "trust",
    title: "Your data stays yours. Stop flying blind.",
    body: "Row-level isolation. Platform ops never see tenant PMO. Security is in the product — not on a slide.",
  },
  {
    start: INTRO_S + FILM_S,
    captions: false,
    kicker: "iProjectX",
    tone: "trust",
    title: "Plan. Execute. Deliver.",
    body: "Stop flying blind.",
  },
];

function formatClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function beatAt(time: number) {
  let idx = 0;
  for (let i = 0; i < BEATS.length; i++) {
    if (time >= BEATS[i].start) idx = i;
  }
  return idx;
}

export function LandingStoryWindow({ cfg }: { cfg: LandingConfig }) {
  const p = cfg.palette;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [userPlaying, setUserPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [inView, setInView] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (reduced) setUserPlaying(false);
  }, [reduced]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => setInView(e.isIntersecting)),
      { threshold: 0.28 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    if (userPlaying && inView) {
      void video.play().catch(() => setUserPlaying(false));
    } else {
      video.pause();
    }
  }, [userPlaying, inView, muted]);

  const beat = BEATS[beatAt(time)] ?? BEATS[0];
  const kickerColor =
    beat.tone === "problem" ? "#FCA5A5" : beat.tone === "trust" ? "#86EFAC" : "#93C5FD";

  const seekToBeat = (index: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = BEATS[index]?.start ?? 0;
    setTime(video.currentTime);
    setUserPlaying(true);
  };

  const playWithSound = () => {
    setMuted(false);
    setUserPlaying(true);
    const video = videoRef.current;
    if (video) {
      video.muted = false;
      void video.play().catch(() => {});
    }
  };

  return (
    <div
      ref={rootRef}
      className="overflow-hidden rounded-xl border shadow-2xl shadow-black/30"
      role="region"
      aria-label="iProjectX advertisement"
      style={{
        borderColor: "rgba(255,255,255,0.12)",
        background: "#080e20",
      }}
    >
      <div
        className="flex items-center justify-between gap-3 border-b px-3 py-2.5 sm:px-4"
        style={{ borderColor: "rgba(255,255,255,0.08)", color: "#F8FAFC" }}
      >
        <div className="flex items-center gap-2" aria-hidden>
          <span className="h-2 w-2 rounded-full" style={{ background: p.danger }} />
          <span className="h-2 w-2 rounded-full" style={{ background: p.warning }} />
          <span className="h-2 w-2 rounded-full" style={{ background: p.success }} />
        </div>
        <div
          className="min-w-0 truncate text-[10px] font-bold uppercase tracking-[0.16em]"
          style={{ color: "#F8FAFC", opacity: 0.62 }}
        >
          iProjectX · advertisement
        </div>
        <div
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
          style={{ color: "#F8FAFC", opacity: 0.55 }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: userPlaying && inView ? "#F87171" : "transparent",
            }}
          />
          {userPlaying && inView ? "Playing" : reduced ? "Still" : "Paused"}
        </div>
      </div>

      <div className="relative aspect-video overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          src={VIDEO_SRC}
          poster={POSTER_SRC}
          muted={muted}
          playsInline
          loop
          preload="metadata"
          aria-label="iProjectX product advertisement"
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration || 0);
            setTime(e.currentTarget.currentTime);
          }}
        />

        {beat.captions ? (
          <>
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, rgba(8,14,32,0.92) 0%, rgba(8,14,32,0.55) 38%, rgba(8,14,32,0.12) 62%, transparent 78%)",
              }}
            />
            <div className="absolute inset-x-0 bottom-0 p-3 sm:p-5">
              <div
                className="mb-2 inline-flex rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em]"
                style={{
                  color: kickerColor,
                  background: "rgba(8,14,32,0.72)",
                  border: `1px solid ${kickerColor}66`,
                  textShadow: "0 1px 8px rgba(0,0,0,0.55)",
                }}
              >
                {beat.kicker}
              </div>
              <p
                className="max-w-2xl text-lg font-bold leading-tight tracking-tight sm:text-2xl"
                style={{
                  ...TYPE,
                  textShadow: "0 2px 18px rgba(0,0,0,0.85)",
                }}
              >
                {beat.title}
              </p>
              <p
                className="mt-1.5 max-w-2xl text-sm leading-relaxed sm:text-[15px]"
                style={{
                  ...CAPTION,
                  opacity: 0.94,
                  textShadow: "0 1px 12px rgba(0,0,0,0.9)",
                }}
              >
                {beat.body}
              </p>
            </div>
          </>
        ) : null}

        {muted && userPlaying ? (
          <button
            type="button"
            onClick={playWithSound}
            className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold"
            style={{
              background: "rgba(8,14,32,0.82)",
              color: "#F8FAFC",
              border: "1px solid rgba(248,250,252,0.28)",
            }}
          >
            <Volume2 className="h-3.5 w-3.5" />
            Play with sound
          </button>
        ) : null}
      </div>

      <div
        className="flex items-center gap-3 border-t px-3 py-2.5 sm:px-4"
        style={{ borderColor: "rgba(255,255,255,0.08)", color: "#F8FAFC" }}
      >
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ background: p.accent, color: p.textOnAccent || "#F8FAFC" }}
          aria-label={userPlaying ? "Pause advertisement" : "Play advertisement"}
          onClick={() => setUserPlaying((v) => !v)}
        >
          {userPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <div className="flex min-w-0 flex-1 gap-1" role="group" aria-label="Advertisement chapters">
          {BEATS.map((b, i) => {
            const start = b.start;
            const end = BEATS[i + 1]?.start ?? Math.max(duration, start + 1);
            const local = Math.min(end - start, Math.max(0, time - start));
            const filled = end > start ? (local / (end - start)) * 100 : 0;
            return (
              <button
                key={`${b.start}-${b.title}`}
                type="button"
                className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full"
                style={{ background: "rgba(255,255,255,0.16)" }}
                aria-label={b.title}
                aria-current={beat.start === b.start ? "true" : undefined}
                onClick={() => seekToBeat(i)}
              >
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${filled}%`, background: "#F8FAFC" }}
                />
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ background: "rgba(255,255,255,0.1)", color: "#F8FAFC" }}
          aria-label={muted ? "Unmute advertisement" : "Mute advertisement"}
          onClick={() => (muted ? playWithSound() : setMuted(true))}
        >
          {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
        <span
          className="w-16 shrink-0 text-right text-[10px] font-bold tabular-nums"
          style={{ color: "#F8FAFC", opacity: 0.7 }}
        >
          {formatClock(time)} / {formatClock(duration)}
        </span>
      </div>
    </div>
  );
}
