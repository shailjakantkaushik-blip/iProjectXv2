/**
 * Style themes — full look-and-feel presets (layout, tables, buttons, motion),
 * not just colour palettes. Applied via data-style-theme on <html>.
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
  /** Short preview swatches for the picker UI */
  swatches: [string, string, string];
};

export const STYLE_THEMES: StyleThemeDef[] = [
  {
    id: "simple",
    name: "Simple",
    description: "Clean, minimal tables and flat surfaces — the original utilitarian layout.",
    swatches: ["#f3f5f8", "#ffffff", "#1d4ed8"],
  },
  {
    id: "standard",
    name: "Standard",
    description: "Polished enterprise shell with softer cards, refined tables, and subtle motion.",
    swatches: ["#eef2f7", "#ffffff", "#0f4c81"],
  },
  {
    id: "space",
    name: "Space",
    description: "Deep cosmic surfaces, cyan accents, and soft glow — mission-control atmosphere.",
    swatches: ["#070b16", "#121a2e", "#38bdf8"],
  },
  {
    id: "racing",
    name: "Racing",
    description: "Charcoal speed aesthetic with crimson accents and high-contrast data surfaces.",
    swatches: ["#0c0c0e", "#1a1a1f", "#e11d48"],
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

/** Apply theme attribute without leaving a stale previous theme on the document. */
export function applyStyleThemeToDocument(themeId: StyleThemeId) {
  if (typeof document === "undefined") return;
  const id = isStyleThemeId(themeId) ? themeId : "simple";
  const root = document.documentElement;
  // Remove dark class when leaving space/racing unless colour theme owns it —
  // style themes that are dark set .dark themselves via CSS + attribute.
  root.setAttribute("data-style-theme", id);
  if (id === "space" || id === "racing") {
    root.classList.add("dark");
  } else {
    // Only clear dark if it was style-theme driven; org colour theme may re-add.
    // Use a marker attribute so we don't fight OrgThemeProvider.
    if (root.getAttribute("data-style-theme-dark") === "1") {
      root.classList.remove("dark");
    }
  }
  root.setAttribute("data-style-theme-dark", id === "space" || id === "racing" ? "1" : "0");
}

export function getStyleThemeBootScript(): string {
  // Runs before paint. Uses cached org/user/platform values to avoid a flash.
  return `(function(){try{var p=location.pathname||"";if(p==="/"||p.indexOf("/auth")===0||p.indexOf("/legal")===0||p.indexOf("/contact")===0||p.indexOf("/o/")===0)return;var platform="simple";try{var lc=JSON.parse(localStorage.getItem("pmo.landingConfig.v2")||"null");if(lc&&typeof lc.style_theme_id==="string")platform=lc.style_theme_id;}catch(e){}var orgId=null,orgTheme=null,userChoice=false;try{var oc=JSON.parse(localStorage.getItem(${JSON.stringify(ORG_STYLE_THEME_CACHE_KEY)})||"null");if(oc){orgId=oc.orgId||null;if(typeof oc.theme_id==="string")orgTheme=oc.theme_id;userChoice=oc.user_choice_enabled===true;}}catch(e){}var user=null;try{var uc=JSON.parse(localStorage.getItem(${JSON.stringify(USER_STYLE_THEME_CACHE_KEY)})||"null");if(uc&&typeof uc.theme_id==="string"&&(!orgId||!uc.orgId||uc.orgId===orgId))user=uc.theme_id;}catch(e){}var allowed=["simple","standard","space","racing"];var id=(userChoice&&user&&allowed.indexOf(user)>=0)?user:(orgTheme&&allowed.indexOf(orgTheme)>=0)?orgTheme:(allowed.indexOf(platform)>=0?platform:"simple");var r=document.documentElement;r.setAttribute("data-style-theme",id);if(id==="space"||id==="racing"){r.classList.add("dark");r.setAttribute("data-style-theme-dark","1");}else{r.setAttribute("data-style-theme-dark","0");}}catch(e){}})();`;
}

export function styleThemeLabel(id: StyleThemeId | string) {
  return STYLE_THEMES.find((t) => t.id === id)?.name ?? id;
}
