import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import type { LandingConfig } from "@/lib/landing-config";

const HEADING = { fontFamily: "'Sora', system-ui, sans-serif" as const };

type LandingMobileMenuProps = {
  open: boolean;
  onClose: () => void;
  cfg: LandingConfig;
  signupEnabled: boolean;
  links: readonly (readonly [string, string])[];
  onSection: (href: `#${string}`) => void;
};

/**
 * Viewport portal — must not render inside the landing <nav>.
 * `backdrop-filter` on the header makes position:fixed children size to the
 * 64px bar, so an in-nav drawer has zero height and looks like a dead tap.
 */
export function LandingMobileMenu({
  open,
  onClose,
  cfg,
  signupEnabled,
  links,
  onSection,
}: LandingMobileMenuProps) {
  const [mounted, setMounted] = useState(false);
  const p = cfg.palette;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      id="landing-mobile-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 300,
        isolation: "isolate",
      }}
    >
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          border: 0,
          padding: 0,
          background: "rgba(0,0,0,0.45)",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          minHeight: "100dvh",
          width: "100%",
          flexDirection: "column",
          overflowY: "auto",
          paddingTop: "env(safe-area-inset-top)",
          background: cfg.theme === "dark" ? p.navy : "#ffffff",
        }}
      >
        <div className="flex h-16 items-center justify-end px-5">
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border"
            style={{ borderColor: p.surface, color: p.textHeading }}
            aria-label="Close menu"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col gap-1 px-5 pb-8">
          {links.map(([href, label]) => (
            <a
              key={href}
              href={href}
              onClick={(e) => {
                e.preventDefault();
                onSection(href);
              }}
              className="rounded-md px-3 py-3 text-sm font-semibold"
              style={{ color: p.textHeading }}
            >
              {label}
            </a>
          ))}
          <Link
            to="/contact"
            onClick={onClose}
            className="rounded-md px-3 py-3 text-sm font-semibold"
            style={{ color: p.textHeading }}
          >
            Contact us
          </Link>
          <div className="mt-4 flex flex-col gap-2 border-t pt-4" style={{ borderColor: p.surface }}>
            <Link
              to="/auth"
              onClick={onClose}
              style={{
                ...HEADING,
                background: signupEnabled ? "transparent" : p.accent,
                color: signupEnabled ? p.textHeading : p.textOnAccent,
                border: signupEnabled ? `1.5px solid ${p.accent}` : "none",
              }}
              className="rounded-md px-3 py-3 text-center text-sm font-bold"
            >
              Sign in
            </Link>
            {signupEnabled ? (
              <Link
                to="/auth"
                onClick={onClose}
                style={{ ...HEADING, background: p.navy, color: p.textOnDark }}
                className="rounded-md px-3 py-3 text-center text-sm font-bold"
              >
                Get started
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
