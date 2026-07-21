import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Brand logo that paints immediately on first mount, and only crossfades when
 * the src changes — avoids both “blank then logo” and “old then new” flashes.
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
  // First paint with a known src should be visible immediately (browser cache /
  // data URLs). Opacity fade is only for subsequent src changes.
  const [ready, setReady] = useState(true);

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
    let cancelled = false;
    setReady(false);
    const img = new Image();
    const commit = () => {
      if (cancelled) return;
      setShown(next);
      setReady(true);
    };
    img.onload = commit;
    img.onerror = commit;
    img.src = next;
    if (img.complete) commit();
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
        "w-auto object-contain transition-opacity duration-150",
        ready ? "opacity-100" : "opacity-0",
        className,
      )}
      style={{ height: heightPx, maxWidth: maxWidthPx }}
      decoding="async"
    />
  );
}
