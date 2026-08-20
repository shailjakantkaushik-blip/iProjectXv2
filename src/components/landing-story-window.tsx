import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import type { LandingConfig } from "@/lib/landing-config";

const VIDEO_SRC = "/landing/ipx-pitch.mp4";
const POSTER_SRC = "/landing/ipx-pitch-poster.jpg";
const ROOM_SRC = "/landing/hero-room.jpg";

/**
 * The film plays on the whiteboard in a meeting room that sits in the hero.
 * Captions are burned into the MP4 so this component does not re-render on
 * timeupdate (that janked landing scroll).
 *
 * Whiteboard slot is fitted to public/landing/hero-room.jpg (team looking
 * at a blank board). Percentages are of the room photograph, not the video.
 */
const BOARD = {
  left: "19.1%",
  top: "15.3%",
  width: "62.6%",
  height: "45.6%",
};

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
      className="relative w-full overflow-hidden"
      role="region"
      aria-label="iProjectX advertisement playing on the team whiteboard"
      style={{
        aspectRatio: "3 / 2",
        contain: "layout paint style",
      }}
    >
      <img
        src={ROOM_SRC}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-20 sm:w-28"
        style={{
          background: `linear-gradient(to right, ${p.navy} 0%, transparent 100%)`,
        }}
        aria-hidden
      />

      <div
        className="absolute overflow-hidden"
        style={{
          left: BOARD.left,
          top: BOARD.top,
          width: BOARD.width,
          height: BOARD.height,
          background: "#0b1224",
          boxShadow:
            "0 0 0 7px #e8e8ec, 0 0 0 8px #9aa0aa, inset 0 0 18px rgba(0,0,0,0.28), 0 18px 40px rgba(0,0,0,0.35)",
        }}
      >
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
            className="absolute right-2 top-2 inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-bold sm:right-3 sm:top-3 sm:px-3 sm:py-1.5 sm:text-xs"
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
      </div>

      <div className="absolute bottom-[7%] right-[8%] flex items-center gap-2">
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full shadow-lg"
          style={{ background: p.accent, color: p.textOnAccent || "#F8FAFC" }}
          aria-label={userPlaying ? "Pause advertisement" : "Play advertisement"}
          onClick={() => setUserPlaying((v) => !v)}
        >
          {userPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full shadow-lg"
          style={{ background: "rgba(8,14,32,0.72)", color: "#F8FAFC" }}
          aria-label={muted ? "Unmute advertisement" : "Mute advertisement"}
          onClick={() => (muted ? playWithSound() : setMuted(true))}
        >
          {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
