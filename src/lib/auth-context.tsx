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

export type AppRole = "admin" | "org_admin" | "bu_lead" | "pm" | "executive" | "platform_admin";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  org_id: string | null;
  must_change_password?: boolean;
  is_active?: boolean;
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
        mode: "all" | "programs" | "projects";
        programs?: string[];
        project_ids?: string[];
      }>;
      user_rules?: Array<{
        user_id: string;
        mode: "all" | "programs" | "projects";
        programs?: string[];
        project_ids?: string[];
      }>;
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

  const loadProfile = async (userId: string) => {
    if (inflightProfileRef.current?.userId === userId) {
      return inflightProfileRef.current.promise;
    }

    const promise = (async () => {
      const { data: p } = await supabase
        .from("profiles")
        .select("id,email,full_name,org_id,must_change_password,is_active")
        .eq("id", userId)
        .maybeSingle();

      const rolesPromise = supabase
        .from("user_roles")
        .select("role,org_id")
        .eq("user_id", userId);

      const orgPromise = p?.org_id
        ? supabase
            .from("organizations")
            .select(
              "id,name,slug,plan,brand_name,logo_url,primary_color,accent_color,fy_start_month,ui_config",
            )
            .eq("id", p.org_id)
            .maybeSingle()
        : Promise.resolve({ data: null as Organization | null });

      const [{ data: allRoles }, { data: orgRow }] = await Promise.all([
        rolesPromise,
        orgPromise,
      ]);

      const nextProfile = (p as Profile) ?? null;
      const nextRoles = (allRoles ?? []).map((r) => r.role as AppRole);
      const nextOrg = (orgRow as Organization) ?? null;

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

    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      setSession(s);
      if (s?.user) {
        const sameUser = loadedUserIdRef.current === s.user.id;
        if (evt === "TOKEN_REFRESHED") return;
        if (evt === "INITIAL_SESSION") return;
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

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      const s = data.session;
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
        await loadProfile(s.user.id);
        if (!cancelled) setLoading(false);
      } else {
        clearCachedAuthChrome();
        setProfile(null);
        setOrganization(null);
        setRoles([]);
        setLoading(false);
      }
      if (!cancelled) setSessionChecked(true);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
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
