import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "org_admin" | "bu_lead" | "pm" | "executive" | "platform_admin";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  org_id: string | null;
  must_change_password?: boolean;
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

  const loadProfile = async (userId: string) => {
    const { data: p } = await supabase
      .from("profiles")
      .select("id,email,full_name,org_id,must_change_password")
      .eq("id", userId)
      .maybeSingle();
    setProfile((p as Profile) ?? null);


    // Load ALL roles for this user (platform_admin may have no org)
    const { data: allRoles } = await supabase.from("user_roles").select("role,org_id").eq("user_id", userId);
    const roleList = (allRoles ?? []).map((r) => r.role as AppRole);
    setRoles(roleList);

    if (p?.org_id) {
      const { data: org } = await supabase.from("organizations").select("id,name,slug,plan,brand_name,logo_url,primary_color,accent_color,fy_start_month,ui_config").eq("id", p.org_id).maybeSingle();
      setOrganization((org as Organization) ?? null);
    } else {
      setOrganization(null);
    }
  };

  const refresh = async () => {
    if (session?.user) await loadProfile(session.user.id);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setProfile(null);
        setOrganization(null);
        setRoles([]);
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
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
