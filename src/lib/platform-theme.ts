import {
  LANDING_CONFIG_CACHE_KEY,
  type LandingConfig,
  type LandingPalette,
  type LandingThemeMode,
} from "@/lib/landing-config";

export const APP_THEME_STYLE_ID = "platform-app-theme-vars";

/**
 * Inline script for <head> — runs before React paint so login/app pages
 * don't flash the default palette on refresh.
 */
export function getPlatformThemeBootScript(): string {
  // Keep this self-contained (no imports) — it is inlined into HTML.
  return `(function(){try{var k=${JSON.stringify(LANDING_CONFIG_CACHE_KEY)};var raw=localStorage.getItem(k);if(!raw)return;var cfg=JSON.parse(raw);if(!cfg||!cfg.palette)return;var path=location.pathname||"/";if(path==="/")return;var isAuth=path==="/auth"||path==="/reset-password"||path==="/force-password-change";var isApp=path.indexOf("/app")===0||path.indexOf("/platform")===0;if(isAuth&&cfg.apply_theme_to_auth===false)return;if(isApp&&cfg.apply_theme_to_app===false)return;if(!isAuth&&!isApp)return;var p=cfg.palette;var dark=cfg.theme==="dark";var bg=dark?p.navy:"#f5f6f8";var surface=dark?p.navyLight:"#ffffff";var sidebar=dark?p.navy:(p.surface||"#e8edf3");var border=dark?"#475569":"#d1d5db";var secondary=dark?p.navyLight:(p.surface||"#eef2f7");var root=document.documentElement;if(dark)root.classList.add("dark");else root.classList.remove("dark");root.setAttribute("data-app-theme",dark?"dark":"light");var css=":root,.dark{--background:"+bg+";--surface:"+surface+";--foreground:"+(p.textBody||"#334155")+";--heading:"+(p.textHeading||"#0f172a")+";--muted-foreground:"+(p.textMuted||"#64748b")+";--border:"+border+";--input:"+border+";--ring:"+(p.accent||"#3b6fa0")+";--card:"+surface+";--card-foreground:"+(p.textBody||"#334155")+";--popover:"+surface+";--popover-foreground:"+(p.textBody||"#334155")+";--primary:"+(p.accent||"#3b6fa0")+";--primary-foreground:"+(p.textOnAccent||"#fff")+";--secondary:"+secondary+";--secondary-foreground:"+(p.textHeading||"#0f172a")+";--muted:"+secondary+";--accent:"+(p.accent||"#3b6fa0")+";--accent-foreground:"+(p.textOnAccent||"#fff")+";--destructive:"+(p.danger||"#dc2626")+";--sidebar:"+sidebar+";--sidebar-foreground:"+(dark?(p.textOnDark||"#fff"):(p.textHeading||"#0f172a"))+";--sidebar-primary:"+(p.accent||"#3b6fa0")+";--sidebar-primary-foreground:"+(p.textOnAccent||"#fff")+";--sidebar-accent:"+(dark?(p.navyLight||"#1e3a5f"):"#dbe3ec")+";--sidebar-border:"+border+";--st-accent:"+(p.accent||"#3b6fa0")+";--st-muted:"+(p.textMuted||"#64748b")+";}";var s=document.createElement("style");s.id=${JSON.stringify(APP_THEME_STYLE_ID)};s.textContent=css;document.head.appendChild(s);}catch(e){}})();`;
}

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
