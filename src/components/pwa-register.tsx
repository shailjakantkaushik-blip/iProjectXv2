import { useEffect } from "react";

function isPublicMarketingPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/contact") ||
    pathname.startsWith("/legal") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/o/") ||
    pathname.startsWith("/mfa") ||
    pathname.startsWith("/reset") ||
    pathname.startsWith("/force-password-change")
  );
}

/** Registers the lightweight service worker for the workspace only — not the public landing. */
export function PwaRegister() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement("link");
      link.rel = "manifest";
      link.href = "/manifest.webmanifest";
      document.head.appendChild(link);
    }
    const theme = document.querySelector('meta[name="theme-color"]');
    if (!theme) {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.content = "#0ea5e9";
      document.head.appendChild(meta);
    }
    if (!("serviceWorker" in navigator)) return;

    const path = window.location.pathname;
    if (isPublicMarketingPath(path)) {
      void (async () => {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          const keys = typeof caches !== "undefined" ? await caches.keys() : [];
          if (!regs.length && !keys.length) return;
          await Promise.all(regs.map((r) => r.unregister()));
          await Promise.all(keys.map((k) => caches.delete(k)));
        } catch {
          /* ignore — SW optional */
        }
      })();
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* ignore — SW optional */
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
