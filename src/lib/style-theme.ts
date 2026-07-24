/**
 * Style themes — UI chrome presets (sections, buttons, nav shape, motion).
 * Colour palettes stay with the separate colour-theme system.
 * Applied via data-style-theme on <html>.
 *
 * Resolution (highest wins):
 * 1. User preference — only when org.user_choice_enabled
 * 2. Organisation theme_id
 * 3. Platform default (landing_config.style_theme_id)
 * 4. "simple"
 */

export const STYLE_THEME_IDS = ["simple", "standard", "space", "racing"] as const;
export type StyleThemeId = (typeof STYLE_THEME_IDS)[number];

export type OrgStyleThemeConfig = {
  theme_id: StyleThemeId;
  /** When true, org users may pick their own style theme (user wins). */
  user_choice_enabled: boolean;
};

export type StyleThemeDef = {
  id: StyleThemeId;
  name: string;
  description: string;
  /** Structural preview chips (shape/feel), not colour palettes */
  swatches: [string, string, string];
};

export const STYLE_THEMES: StyleThemeDef[] = [
  {
    id: "simple",
    name: "Simple",
    description:
      "Flat sections, quiet buttons, classic sidebar nav — utilitarian baseline chrome.",
    swatches: ["#e8eaee", "#f5f6f8", "#cbd0d8"],
  },
  {
    id: "standard",
    name: "Standard",
    description:
      "Soft elevated sections, refined buttons, polished nav with clear active states.",
    swatches: ["#dfe4ec", "#f0f3f8", "#a8b3c4"],
  },
  {
    id: "space",
    name: "Space",
    description:
      "Inset panel sections, geometric buttons, mission-control nav — motion without recolouring.",
    swatches: ["#c5cedd", "#e2e8f2", "#8b9bb3"],
  },
  {
    id: "racing",
    name: "Racing",
    description:
      "Angular sections, sharp CTA edges, speed-stripe nav accents and snappy transitions.",
    swatches: ["#d4d4d8", "#ececef", "#9ca3af"],
  },
];

export const ORG_STYLE_THEME_CACHE_KEY = "pmo.styleTheme.org.v1";
export const USER_STYLE_THEME_CACHE_KEY = "pmo.styleTheme.user.v1";
export const STYLE_THEME_CHANGE_EVENT = "pmo:style-theme-change";

export function isStyleThemeId(v: unknown): v is StyleThemeId {
  return typeof v === "string" && (STYLE_THEME_IDS as readonly string[]).includes(v);
}

export function normalizeOrgStyleTheme(raw: unknown): OrgStyleThemeConfig {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    theme_id: isStyleThemeId(o.theme_id) ? o.theme_id : "simple",
    user_choice_enabled: o.user_choice_enabled === true,
  };
}

export function readCachedOrgStyleTheme(): (OrgStyleThemeConfig & { orgId?: string }) | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ORG_STYLE_THEME_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const base = normalizeOrgStyleTheme(parsed);
    return {
      ...base,
      orgId: typeof parsed.orgId === "string" ? parsed.orgId : undefined,
    };
  } catch {
    return null;
  }
}

export function writeCachedOrgStyleTheme(orgId: string, cfg: OrgStyleThemeConfig) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      ORG_STYLE_THEME_CACHE_KEY,
      JSON.stringify({ orgId, ...normalizeOrgStyleTheme(cfg) }),
    );
  } catch {
    /* private mode */
  }
}

export function readUserStyleTheme(orgId?: string | null): StyleThemeId | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_STYLE_THEME_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { orgId?: string; theme_id?: string };
    if (orgId && parsed.orgId && parsed.orgId !== orgId) return null;
    return isStyleThemeId(parsed.theme_id) ? parsed.theme_id : null;
  } catch {
    return null;
  }
}

export function writeUserStyleTheme(orgId: string, themeId: StyleThemeId) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      USER_STYLE_THEME_CACHE_KEY,
      JSON.stringify({ orgId, theme_id: themeId }),
    );
  } catch {
    /* private mode */
  }
  window.dispatchEvent(
    new CustomEvent(STYLE_THEME_CHANGE_EVENT, { detail: { themeId, source: "user" } }),
  );
}

export function clearUserStyleTheme() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(USER_STYLE_THEME_CACHE_KEY);
  } catch {
    /* private mode */
  }
}

export function resolveStyleThemeId(opts: {
  platformThemeId?: string | null;
  orgConfig?: OrgStyleThemeConfig | null;
  userThemeId?: StyleThemeId | null;
}): StyleThemeId {
  const platform = isStyleThemeId(opts.platformThemeId) ? opts.platformThemeId : "simple";
  const org = opts.orgConfig ? normalizeOrgStyleTheme(opts.orgConfig) : null;
  if (org?.user_choice_enabled && opts.userThemeId && isStyleThemeId(opts.userThemeId)) {
    return opts.userThemeId;
  }
  if (org?.theme_id) return org.theme_id;
  return platform;
}

/**
 * Apply chrome theme attribute only — never mutates colour tokens or .dark.
 * Colour themes remain owned by OrgThemeProvider / colour palette system.
 */
export function applyStyleThemeToDocument(themeId: StyleThemeId) {
  if (typeof document === "undefined") return;
  const id = isStyleThemeId(themeId) ? themeId : "simple";
  const root = document.documentElement;
  // Clear legacy style-theme-driven dark from older builds.
  if (root.getAttribute("data-style-theme-dark") === "1") {
    root.classList.remove("dark");
    root.removeAttribute("data-style-theme-dark");
  }
  root.setAttribute("data-style-theme", id);
}

export function getStyleThemeBootScript(): string {
  // Runs before paint. Chrome only — does not touch .dark or colour vars.
  return `(function(){try{var p=location.pathname||"";if(p==="/"||p.indexOf("/auth")===0||p.indexOf("/legal")===0||p.indexOf("/contact")===0||p.indexOf("/o/")===0)return;var platform="simple";try{var lc=JSON.parse(localStorage.getItem("pmo.landingConfig.v2")||"null");if(lc&&typeof lc.style_theme_id==="string")platform=lc.style_theme_id;}catch(e){}var orgId=null,orgTheme=null,userChoice=false;try{var oc=JSON.parse(localStorage.getItem(${JSON.stringify(ORG_STYLE_THEME_CACHE_KEY)})||"null");if(oc){orgId=oc.orgId||null;if(typeof oc.theme_id==="string")orgTheme=oc.theme_id;userChoice=oc.user_choice_enabled===true;}}catch(e){}var user=null;try{var uc=JSON.parse(localStorage.getItem(${JSON.stringify(USER_STYLE_THEME_CACHE_KEY)})||"null");if(uc&&typeof uc.theme_id==="string"&&(!orgId||!uc.orgId||uc.orgId===orgId))user=uc.theme_id;}catch(e){}var allowed=["simple","standard","space","racing"];var id=(userChoice&&user&&allowed.indexOf(user)>=0)?user:(orgTheme&&allowed.indexOf(orgTheme)>=0)?orgTheme:(allowed.indexOf(platform)>=0?platform:"simple");var r=document.documentElement;r.setAttribute("data-style-theme",id);if(r.getAttribute("data-style-theme-dark")==="1"){r.classList.remove("dark");r.removeAttribute("data-style-theme-dark");}}catch(e){}})();`;
}

export function styleThemeLabel(id: StyleThemeId | string) {
  return STYLE_THEMES.find((t) => t.id === id)?.name ?? id;
}
