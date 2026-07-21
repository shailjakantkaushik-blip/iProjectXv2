import type { LandingConfig, LandingPalette, LandingThemeMode } from "@/lib/landing-config";

const APP_THEME_STYLE_ID = "platform-app-theme-vars";

/** CSS custom properties written onto :root for login + app chrome. */
export function paletteToAppCssVars(
  palette: LandingPalette,
  theme: LandingThemeMode,
): Record<string, string> {
  const isDark = theme === "dark";
  const bg = isDark ? palette.navy : "#f5f6f8";
  const surface = isDark ? palette.navyLight : "#ffffff";
  const sidebar = isDark ? palette.navy : palette.surface;
  const border = isDark ? "#475569" : "#d1d5db";
  const secondary = isDark ? palette.navyLight : palette.surface;

  return {
    "--background": bg,
    "--surface": surface,
    "--foreground": palette.textBody,
    "--heading": palette.textHeading,
    "--muted-foreground": palette.textMuted,
    "--border": border,
    "--input": border,
    "--ring": palette.accent,

    "--card": surface,
    "--card-foreground": palette.textBody,
    "--popover": surface,
    "--popover-foreground": palette.textBody,

    "--primary": palette.accent,
    "--primary-foreground": palette.textOnAccent,
    "--secondary": secondary,
    "--secondary-foreground": palette.textHeading,
    "--muted": secondary,
    "--accent": palette.accent,
    "--accent-foreground": palette.textOnAccent,
    "--accent2": palette.success,

    "--destructive": palette.danger,
    "--destructive-foreground": palette.textOnDark,

    "--sidebar": sidebar,
    "--sidebar-foreground": isDark ? palette.textOnDark : palette.textHeading,
    "--sidebar-primary": palette.accent,
    "--sidebar-primary-foreground": palette.textOnAccent,
    "--sidebar-accent": isDark ? palette.navyLight : "#dbe3ec",
    "--sidebar-accent-foreground": isDark ? palette.textOnDark : palette.textHeading,
    "--sidebar-border": border,
    "--sidebar-ring": palette.accent,

    /* Streamlit helper tokens used across app pages */
    "--st-accent": palette.accent,
    "--st-muted": palette.textMuted,
    "--st-danger": palette.danger,
    "--st-warning": palette.warning,
    "--st-success": palette.success,
  };
}

export function applyPlatformThemeToDocument(
  cfg: Pick<LandingConfig, "theme" | "palette" | "apply_theme_to_auth" | "apply_theme_to_app">,
  opts: { forAuth: boolean; forApp: boolean },
) {
  if (typeof document === "undefined") return;

  const shouldApply =
    (opts.forAuth && cfg.apply_theme_to_auth !== false) ||
    (opts.forApp && cfg.apply_theme_to_app !== false);

  const root = document.documentElement;

  if (!shouldApply) {
    clearPlatformThemeFromDocument();
    return;
  }

  root.classList.toggle("dark", cfg.theme === "dark");
  root.dataset.appTheme = cfg.theme;

  let styleEl = document.getElementById(APP_THEME_STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = APP_THEME_STYLE_ID;
    document.head.appendChild(styleEl);
  }

  const vars = paletteToAppCssVars(cfg.palette, cfg.theme);
  const body = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  // Apply to both :root and .dark so platform palette wins over the static
  // light/dark presets in styles.css while still enabling Tailwind dark: variants.
  styleEl.textContent = `:root, .dark {\n${body}\n}`;
}

export function clearPlatformThemeFromDocument() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove("dark");
  delete document.documentElement.dataset.appTheme;
  document.getElementById(APP_THEME_STYLE_ID)?.remove();
}
