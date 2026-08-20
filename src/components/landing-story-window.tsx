import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import type { LandingConfig } from "@/lib/landing-config";

const VIDEO_SRC = "/landing/ipx-pitch.mp4";
const POSTER_SRC = "/landing/ipx-pitch-poster.jpg";

/**
 * Lightweight advert player. Captions are burned into the MP4 so this
 * component does not re-render on every timeupdate (that janked landing scroll).
 * One female narrator. Opening X mark top-right. Close: wordmark on a light plate.
 */
export function LandingStoryWindow({ cfg }: { cfg: LandingConfig }) {
  const p = cfg.palette;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [userPlaying, setUserPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
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
    const root = rootRef.current;
    if (!video || !root) return;

    const sync = (inView: boolean) => {
      video.muted = muted;
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
  }, [userPlaying, muted, reduced]);

  const playWithSound = () => {
    setMuted(false);
    setUserPlaying(true);
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    void video.play().catch(() => {});
  };

  return (
    <div
      ref={rootRef}
      className="overflow-hidden rounded-xl border"
      role="region"
      aria-label="iProjectX advertisement"
      style={{
        borderColor: "rgba(255,255,255,0.12)",
        background: "#070b18",
        contain: "layout paint style",
      }}
    >
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
          disablePictureInPicture
          aria-label="iProjectX product advertisement"
          style={{ transform: "translateZ(0)" }}
        />
        {muted && userPlaying && !reduced ? (
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
        <p
          className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-wide"
          style={{ color: "#E8EEF8" }}
        >
          Stop flying blind — from strategy to delivery
        </p>
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ background: "rgba(255,255,255,0.1)", color: "#F8FAFC" }}
          aria-label={muted ? "Unmute advertisement" : "Mute advertisement"}
          onClick={() => (muted ? playWithSound() : setMuted(true))}
        >
          {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
