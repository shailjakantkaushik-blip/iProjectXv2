import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import type { LandingConfig } from "@/lib/landing-config";

const VIDEO_SRC = "/landing/ipx-pitch.mp4";
const POSTER_SRC = "/landing/ipx-pitch-poster.jpg";

/** Conversational default — the file is already loudnormed; 1.0 feels too hot. */
const DEFAULT_VOLUME = 0.52;

export function LandingStoryWindow({ cfg }: { cfg: LandingConfig }) {
  const p = cfg.palette;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [userPlaying, setUserPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [reduced, setReduced] = useState(false);

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
    const video = videoRef.current;
    if (video) video.volume = volume;
  }, [volume]);

  useEffect(() => {
    const video = videoRef.current;
    const root = rootRef.current;
    if (!video || !root) return;

    const sync = (inView: boolean) => {
      video.muted = muted;
      video.volume = volume;
      if (userPlaying && inView && !reduced) {
        void video.play().catch(() => setUserPlaying(false));
      } else {
        video.pause();
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.some((e) => e.isIntersecting);
        sync(vis);
      },
      { threshold: 0.2, rootMargin: "0px" },
    );
    io.observe(root);
    sync(true);
    return () => io.disconnect();
  }, [userPlaying, muted, reduced, volume]);

  const playWithSound = () => {
    setMuted(false);
    setUserPlaying(true);
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    video.volume = volume;
    void video.play().catch(() => {});
  };

  const onVolume = (next: number) => {
    const v = Math.min(1, Math.max(0, next));
    setVolume(v);
    if (v > 0 && muted) setMuted(false);
    if (v === 0) setMuted(true);
    const video = videoRef.current;
    if (video) {
      video.volume = v;
      video.muted = v === 0;
    }
  };

  return (
    <div
      ref={rootRef}
      className="relative w-full overflow-hidden"
      role="region"
      aria-label="iProjectX advertisement"
      style={{
        aspectRatio: "16 / 9",
        background: "#0b1224",
        contain: "layout paint style",
      }}
    >
      <video
        ref={videoRef}
        className={`absolute inset-0 h-full w-full object-cover ${reduced ? "" : "lp-pitch-zoom"}`}
        src={VIDEO_SRC}
        poster={POSTER_SRC}
        muted={muted}
        playsInline
        loop
        preload="metadata"
        disablePictureInPicture
        aria-label="iProjectX product advertisement"
      />
      <style>{`
        @keyframes lp-pitch-zoom {
          from { transform: scale(1.02); }
          to { transform: scale(1.09); }
        }
        .lp-pitch-zoom {
          transform-origin: 50% 42%;
          will-change: transform;
          animation: lp-pitch-zoom 22s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite alternate;
        }
        @media (prefers-reduced-motion: reduce) {
          .lp-pitch-zoom { animation: none !important; }
        }
      `}</style>
      {muted && userPlaying && !reduced ? (
        <button
          type="button"
          onClick={playWithSound}
          className="absolute right-3 top-3 z-20 inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-bold sm:right-4 sm:top-4 sm:px-3 sm:py-1.5 sm:text-xs"
          style={{
            background: "rgba(8,14,32,0.82)",
            color: "#F8FAFC",
            border: "1px solid rgba(248,250,252,0.28)",
          }}
        >
          <Volume2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          Play with sound
        </button>
      ) : null}

      <div
        className="absolute bottom-3 right-3 z-20 flex items-center gap-2 rounded-full px-2 py-1.5 sm:bottom-4 sm:right-4"
        style={{ background: "rgba(8,14,32,0.62)", border: "1px solid rgba(248,250,252,0.12)" }}
      >
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full"
          style={{ background: p.accent, color: p.textOnAccent || "#F8FAFC" }}
          aria-label={userPlaying ? "Pause advertisement" : "Play advertisement"}
          onClick={() => setUserPlaying((v) => !v)}
        >
          {userPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full"
          style={{ background: "rgba(255,255,255,0.08)", color: "#F8FAFC" }}
          aria-label={muted ? "Unmute advertisement" : "Mute advertisement"}
          onClick={() => (muted ? playWithSound() : setMuted(true))}
        >
          {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
        <label className="flex items-center gap-2 pr-1">
          <span className="sr-only">Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(e) => onVolume(Number(e.target.value))}
            className="h-1.5 w-20 cursor-pointer appearance-none rounded-full sm:w-28"
            style={{
              background: `linear-gradient(to right, ${p.accent} ${(muted ? 0 : volume) * 100}%, rgba(248,250,252,0.22) ${(muted ? 0 : volume) * 100}%)`,
              accentColor: p.accent,
            }}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((muted ? 0 : volume) * 100)}
            aria-label="Advertisement volume"
          />
        </label>
      </div>
    </div>
  );
}
