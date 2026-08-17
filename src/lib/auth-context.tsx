import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { clearCachedOrgNavigation } from "@/lib/navigation-config";
import {
  clearCachedAuthChrome,
  readCachedAuthChrome,
  writeCachedAuthChrome,
} from "@/lib/auth-chrome-cache";

export type AppRole =
  | "admin"
  | "org_admin"
  | "bu_lead"
  | "pm"
  | "executive"
  | "platform_admin"
  | (string & {});

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  org_id: string | null;
  must_change_password?: boolean;
  is_active?: boolean;
  notification_prefs?: Record<string, unknown> | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  brand_name?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
  fy_start_month?: number | null;
  /** True when this org uses a customer-hosted Supabase for tenant data (BYOD). */
  byod_active?: boolean | null;
  ui_config?: {
    navigation?: any;
    focus_mode?: boolean;
    branding?: {
      logo_size_auth?: string;
      logo_custom_auth?: { heightPx: number; maxWidthPx: number };
      logo_size_app?: string;
      logo_custom_app?: { heightPx: number; maxWidthPx: number };
    };
    color_theme?: {
      enabled?: boolean;
      theme?: "light" | "dark";
      palette_preset?: string;
      palette?: Record<string, string>;
    };
    style_theme?: {
      theme_id?: string;
      user_choice_enabled?: boolean;
    };
    project_visibility?: {
      rules?: Array<{
        role: string;
        mode: "all" | "programs" | "projects" | "scoped";
        strategic_alignments?: string[];
        programs?: string[];
        functional_areas?: string[];
        program_areas?: Array<{ program: string; functional_area: string }>;
        project_ids?: string[];
        stream_ids?: string[];
      }>;
      user_rules?: Array<{
        user_id: string;
        mode: "all" | "programs" | "projects" | "scoped";
        strategic_alignments?: string[];
        programs?: string[];
        functional_areas?: string[];
        program_areas?: Array<{ program: string; functional_area: string }>;
        project_ids?: string[];
        stream_ids?: string[];
      }>;
    };
    /** Platform → org outbound alert email config (digests + RAID escalation). */
    alert_outbound?: {
      active?: boolean;
      roles?: Record<
        string,
        {
          enabled?: boolean;
          approvals?: boolean;
          overdue_raid?: boolean;
          pulse?: boolean;
          raid_escalation?: boolean;
        }
      >;
    };
    /** Per-page Download page (PDF/PPT/PNG) allow/deny — org override of platform defaults. */
    page_download?: {
      pages?: Record<string, boolean>;
    };
  } | null;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  organization: Organization | null;
  roles: AppRole[];
  /** True until getSession() finishes (localStorage read — usually milliseconds). */
  sessionChecked: boolean;
  /** True while profile/org are fetching and no usable chrome is available yet. */
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

const PROFILE_WITH_ORG_SELECT = `
  id,email,full_name,org_id,must_change_password,is_active,
  organizations (
    id,name,slug,plan,brand_name,logo_url,primary_color,accent_color,fy_start_month,byod_active,ui_config
  )
`.trim();

type ProfileRow = Profile & {
  organizations?: Organization | Organization[] | null;
};

function orgFromEmbed(row: ProfileRow | null): Organization | null {
  const embedded = row?.organizations;
  if (!embedded) return null;
  return Array.isArray(embedded) ? (embedded[0] ?? null) : embedded;
}

function seedFromCache() {
  return readCachedAuthChrome();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const cached = typeof window !== "undefined" ? seedFromCache() : null;
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(() => cached?.profile ?? null);
  const [organization, setOrganization] = useState<Organization | null>(
    () => cached?.organization ?? null,
  );
  const [roles, setRoles] = useState<AppRole[]>(() => cached?.roles ?? []);
  const [sessionChecked, setSessionChecked] = useState(false);
  // With cached chrome we are not "loading" for paint — network refresh is silent.
  const [loading, setLoading] = useState(() => !cached);
  const loadedUserIdRef = useRef<string | null>(cached?.userId ?? null);
  const inflightProfileRef = useRef<{ userId: string; promise: Promise<void> } | null>(null);
  const bootFinishedRef = useRef(false);

  const loadProfile = async (userId: string) => {
    if (inflightProfileRef.current?.userId === userId) {
      return inflightProfileRef.current.promise;
    }

    const promise = (async () => {
      // One RTT pair: profile(+org embed) and roles in parallel — not sequential hops.
      const [profileRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select(PROFILE_WITH_ORG_SELECT).eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role,org_id").eq("user_id", userId),
      ]);

      // Transient PostgREST / schema-cache errors must not wipe chrome or hang the gate.
      if (profileRes.error) {
        console.warn("[auth] profile load failed:", profileRes.error.message);
        return;
      }

      const row = (profileRes.data as ProfileRow | null) ?? null;
      const nextProfile: Profile | null = row
        ? {
            id: row.id,
            email: row.email,
            full_name: row.full_name,
            org_id: row.org_id,
            must_change_password: row.must_change_password,
            is_active: row.is_active,
          }
        : null;

      let nextOrg = orgFromEmbed(row);
      // Embed can be null after schema reloads / RLS edge cases — fetch org directly.
      if (nextProfile?.org_id && !nextOrg) {
        const { data: orgRow, error: orgErr } = await supabase
          .from("organizations")
          .select(
            "id,name,slug,plan,brand_name,logo_url,primary_color,accent_color,fy_start_month,byod_active,ui_config",
          )
          .eq("id", nextProfile.org_id)
          .maybeSingle();
        if (!orgErr && orgRow) {
          nextOrg = orgRow as Organization;
        } else if (orgErr) {
          console.warn("[auth] organization load failed:", orgErr.message);
        }
      }

      // Only home-org roles + global platform_admin — ignore foreign-org leftovers.
      const nextRoles = (rolesRes.error ? [] : (rolesRes.data ?? []))
        .filter((r: { role: string; org_id: string | null }) => {
          if (r.role === "platform_admin") return true;
          if (!nextProfile?.org_id) return false;
          return r.org_id === nextProfile.org_id;
        })
        .map((r: { role: string }) => r.role as AppRole);

      setProfile(nextProfile);
      setRoles(nextRoles);
      setOrganization(nextOrg);
      loadedUserIdRef.current = userId;

      if (nextProfile) {
        writeCachedAuthChrome({
          userId,
          profile: nextProfile,
          organization: nextOrg,
          roles: nextRoles,
        });
      } else {
        // Only clear when the server confirmed there is no profile row.
        clearCachedAuthChrome();
      }
    })();

    inflightProfileRef.current = { userId, promise };
    try {
      await promise;
    } finally {
      if (inflightProfileRef.current?.promise === promise) {
        inflightProfileRef.current = null;
      }
    }
  };

  const refresh = async () => {
    if (session?.user) await loadProfile(session.user.id);
  };

  useEffect(() => {
    let cancelled = false;

    const finishBoot = (s: Session | null) => {
      if (cancelled || bootFinishedRef.current) return;
      bootFinishedRef.current = true;
      setSession(s);

      if (s?.user) {
        const cachedUser = readCachedAuthChrome()?.userId;
        if (cachedUser && cachedUser !== s.user.id) {
          // Stale chrome from another account — don't paint the wrong org.
          clearCachedAuthChrome();
          setProfile(null);
          setOrganization(null);
          setRoles([]);
          setLoading(true);
        } else if (cachedUser === s.user.id) {
          // Chrome already on screen — refresh quietly in the background.
          setLoading(false);
        } else {
          setLoading(true);
        }

        // Unlock the gate immediately — never wait on network profile hydrate.
        setSessionChecked(true);
        void loadProfile(s.user.id).finally(() => {
          if (!cancelled) setLoading(false);
        });
      } else {
        clearCachedAuthChrome();
        setProfile(null);
        setOrganization(null);
        setRoles([]);
        setLoading(false);
        setSessionChecked(true);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      if (evt === "INITIAL_SESSION") {
        // Same local session as getSession — finishBoot is idempotent.
        finishBoot(s);
        return;
      }

      setSession(s);
      if (s?.user) {
        const sameUser = loadedUserIdRef.current === s.user.id;
        if (evt === "TOKEN_REFRESHED") return;
        if (sameUser && evt === "SIGNED_IN") return;

        const switchingUser =
          loadedUserIdRef.current != null && loadedUserIdRef.current !== s.user.id;
        if (switchingUser) {
          clearCachedAuthChrome();
          setProfile(null);
          setOrganization(null);
          setRoles([]);
          setLoading(true);
        }

        const blockUi = switchingUser || loadedUserIdRef.current == null;
        if (blockUi) setLoading(true);
        setTimeout(() => {
          void loadProfile(s.user.id).finally(() => {
            if (!cancelled && blockUi) setLoading(false);
          });
        }, 0);
      } else {
        loadedUserIdRef.current = null;
        clearCachedAuthChrome();
        setProfile(null);
        setOrganization(null);
        setRoles([]);
        setLoading(false);
      }
    });

    // getSession is a local storage read; unlock UI as soon as it returns.
    void supabase.auth.getSession().then(({ data }) => {
      finishBoot(data.session);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      const { recordAuthSecurityEvent } = await import("@/lib/auth-events.functions");
      await recordAuthSecurityEvent({
        data: { eventType: "logout", summary: "User signed out" },
      });
    } catch {
      /* non-blocking — still sign out locally */
    }
    clearCachedOrgNavigation();
    clearCachedAuthChrome();
    await supabase.auth.signOut();
  };

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      organization,
      roles,
      sessionChecked,
      loading,
      refresh,
      signOut,
    }),
    [session, profile, organization, roles, sessionChecked, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function hasAnyRole(roles: AppRole[], required: AppRole[]) {
  return roles.some((r) => required.includes(r));
}

export function canEditProjects(roles: AppRole[]) {
  return hasAnyRole(roles, ["admin", "org_admin", "bu_lead", "pm"]);
}

export function isAdmin(roles: AppRole[]) {
  return hasAnyRole(roles, ["admin", "org_admin"]);
}

export function isPlatformAdmin(roles: AppRole[]) {
  return roles.includes("platform_admin");
}
