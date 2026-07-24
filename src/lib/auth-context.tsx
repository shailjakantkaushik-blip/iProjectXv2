import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { clearCachedOrgNavigation } from "@/lib/navigation-config";

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
    /** Organisation colour palette — overrides platform theme in /app when enabled. */
    color_theme?: {
      enabled?: boolean;
      theme?: "light" | "dark";
      palette_preset?: string;
      palette?: Record<string, string>;
    };
    /** Style theme (look & feel). user_choice_enabled lets users override. */
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
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  /** Last user we finished loading a profile for — used to ignore tab-focus recoveries. */
  const loadedUserIdRef = useRef<string | null>(null);

  const loadProfile = async (userId: string) => {
    const { data: p } = await supabase
      .from("profiles")
      .select("id,email,full_name,org_id,must_change_password,is_active")
      .eq("id", userId)
      .maybeSingle();

    // Load ALL roles for this user (platform_admin may have no org)
    const { data: allRoles } = await supabase.from("user_roles").select("role,org_id").eq("user_id", userId);
    const roleList = (allRoles ?? []).map((r) => r.role as AppRole);

    // Resolve org before publishing profile — otherwise /app briefly sees
    // profile without organization and redirects to the create-org screen.
    let org: Organization | null = null;
    if (p?.org_id) {
      const { data: orgRow } = await supabase
        .from("organizations")
        .select("id,name,slug,plan,brand_name,logo_url,primary_color,accent_color,fy_start_month,ui_config")
        .eq("id", p.org_id)
        .maybeSingle();
      org = (orgRow as Organization) ?? null;
    }

    setProfile((p as Profile) ?? null);
    setRoles(roleList);
    setOrganization(org);
    loadedUserIdRef.current = userId;
  };

  const refresh = async () => {
    if (session?.user) await loadProfile(session.user.id);
  };

  useEffect(() => {
    let cancelled = false;

    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      setSession(s);
      if (s?.user) {
        // Supabase re-emits SIGNED_IN on every tab focus via _recoverAndRefresh,
        // even when the session never changed. Blocking the UI there caused the
        // "Checking your session…" flash when switching browsers/tabs.
        const sameUser = loadedUserIdRef.current === s.user.id;
        if (evt === "TOKEN_REFRESHED") {
          return;
        }
        // Same user: INITIAL_SESSION can race with getSession(); SIGNED_IN is
        // re-emitted on every tab focus. Neither should block the UI again.
        if (sameUser && (evt === "SIGNED_IN" || evt === "INITIAL_SESSION")) {
          return;
        }

        // Drop stale profile immediately when the user identity changes so the
        // authenticated gate never briefly renders the previous account.
        if (!sameUser) {
          setProfile(null);
          setOrganization(null);
          setRoles([]);
        }

        const blockUi = evt === "SIGNED_IN" || evt === "INITIAL_SESSION";
        if (blockUi) setLoading(true);
        // Defer out of the auth callback (Supabase client lock).
        setTimeout(() => {
          void loadProfile(s.user.id).finally(() => {
            if (!cancelled && blockUi) setLoading(false);
          });
        }, 0);
      } else {
        loadedUserIdRef.current = null;
        setProfile(null);
        setOrganization(null);
        setRoles([]);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    clearCachedOrgNavigation();
    await supabase.auth.signOut();
    // Do not hard-reload here — the authenticated Gate already SPA-navigates
    // to /auth (with org slug when that is how they signed in). A second
    // window.location.assign caused the login page to refresh twice.
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        organization,
        roles,
        loading,
        refresh,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
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
