import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import type { LandingConfig } from "@/lib/landing-config";

export const LANDING_NAV_OPEN_ID = "landing-nav-open";

const HEADING = { fontFamily: "'Sora', system-ui, sans-serif" as const };

type LandingMobileMenuPanelProps = {
  cfg: LandingConfig;
  signupEnabled: boolean;
  links: readonly (readonly [string, string])[];
};

function closeLandingMenu() {
  const box = document.getElementById(LANDING_NAV_OPEN_ID);
  if (box instanceof HTMLInputElement) box.checked = false;
}

/**
 * Native checkbox drawer. Must stay in the first HTML so the three-line
 * control works before (and without) React hydrate — Sign in is an <a>,
 * the menu has to be the same class of control.
 */
export function LandingMobileMenuToggle({
  borderColor,
  color,
}: {
  borderColor: string;
  color: string;
}) {
  return (
    <label
      htmlFor={LANDING_NAV_OPEN_ID}
      data-landing-menu-toggle
      className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md border md:hidden"
      style={{ borderColor, color, touchAction: "manipulation" }}
      aria-label="Open menu"
    >
      <Menu className="landing-menu-icon-open h-5 w-5" />
      <X className="landing-menu-icon-close h-5 w-5" />
    </label>
  );
}

export function LandingMobileMenuPanel({
  cfg,
  signupEnabled,
  links,
}: LandingMobileMenuPanelProps) {
  const p = cfg.palette;

  return (
    <div
      data-landing-mobile-drawer
      id="landing-mobile-menu"
      role="dialog"
      aria-label="Menu"
    >
      <label
        htmlFor={LANDING_NAV_OPEN_ID}
        aria-label="Close menu"
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.45)" }}
      />
      <div
        className="relative flex min-h-full w-full flex-col overflow-y-auto"
        style={{ background: cfg.theme === "dark" ? p.navy : "#ffffff" }}
      >
        <div className="flex h-16 items-center justify-end px-5">
          <label
            htmlFor={LANDING_NAV_OPEN_ID}
            className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border"
            style={{ borderColor: p.surface, color: p.textHeading }}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </label>
        </div>
        <div className="flex flex-col gap-1 px-5 pb-8">
          {links.map(([href, label]) => (
            <a
              key={href}
              href={href}
              onClick={closeLandingMenu}
              className="rounded-md px-3 py-3 text-sm font-semibold"
              style={{ color: p.textHeading }}
            >
              {label}
            </a>
          ))}
          <Link
            to="/contact"
            onClick={closeLandingMenu}
            className="rounded-md px-3 py-3 text-sm font-semibold"
            style={{ color: p.textHeading }}
          >
            Contact us
          </Link>
          <div className="mt-4 flex flex-col gap-2 border-t pt-4" style={{ borderColor: p.surface }}>
            <Link
              to="/auth"
              onClick={closeLandingMenu}
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
                onClick={closeLandingMenu}
                style={{ ...HEADING, background: p.navy, color: p.textOnDark }}
                className="rounded-md px-3 py-3 text-center text-sm font-bold"
              >
                Get started
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
