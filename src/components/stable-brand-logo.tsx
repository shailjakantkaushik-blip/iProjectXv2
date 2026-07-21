import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Renders a brand logo only after the image has loaded, and crossfades when
 * the src changes — avoids flashing an old mark before the new one appears.
 */
export function StableBrandLogo({
  src,
  alt,
  heightPx,
  maxWidthPx,
  className,
}: {
  src?: string | null;
  alt: string;
  heightPx: number;
  maxWidthPx: number;
  className?: string;
}) {
  const next = typeof src === "string" && src.trim() ? src.trim() : "";
  const [shown, setShown] = useState(next);
  const [ready, setReady] = useState(() => !next);

  useEffect(() => {
    if (!next) {
      setShown("");
      setReady(true);
      return;
    }
    if (next === shown) {
      setReady(true);
      return;
    }
    setReady(false);
    let cancelled = false;
    const img = new Image();
    const commit = () => {
      if (cancelled) return;
      setShown(next);
      setReady(true);
    };
    img.onload = commit;
    img.onerror = commit;
    img.src = next;
    return () => {
      cancelled = true;
    };
  }, [next, shown]);

  if (!shown) {
    return (
      <span
        aria-hidden
        className={cn("inline-block", className)}
        style={{ height: heightPx, width: Math.min(maxWidthPx, heightPx * 2.5) }}
      />
    );
  }

  return (
    <img
      src={shown}
      alt={alt}
      className={cn(
        "w-auto object-contain transition-opacity duration-200",
        ready ? "opacity-100" : "opacity-0",
        className,
      )}
      style={{ height: heightPx, maxWidth: maxWidthPx }}
      decoding="async"
    />
  );
}
