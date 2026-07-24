import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isPlatformAdmin } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, Save, Trash2, Palette, Copy, ExternalLink } from "lucide-react";
import { LogoSizeControls } from "@/components/logo-size-controls";
import {
  clampLogoCustom,
  normalizeLogoSize,
  type LogoCustomDims,
  type LogoDisplaySize,
} from "@/lib/landing-config";
import { ColorPaletteEditor } from "@/components/color-palette-editor";
import {
  defaultOrgColorTheme,
  normalizeOrgColorTheme,
  type OrgColorTheme,
} from "@/lib/org-theme";
import { OrgStyleThemeEditor, StyleThemePicker } from "@/components/style-theme-picker";
import {
  normalizeOrgStyleTheme,
  writeCachedOrgStyleTheme,
  STYLE_THEME_CHANGE_EVENT,
  type OrgStyleThemeConfig,
  type StyleThemeId,
  isStyleThemeId,
} from "@/lib/style-theme";
import {
  fetchLandingConfig,
  saveLandingConfig,
  type LandingConfig,
} from "@/lib/landing-config";

export const Route = createFileRoute("/_authenticated/platform/branding")({
  beforeLoad: () => {
    // client-only guard, actual RLS enforced server-side
  },
  component: PlatformBrandingPage,
});

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

type OrgUiConfig = {
  navigation?: unknown;
  focus_mode?: boolean;
  branding?: {
    logo_size_auth?: LogoDisplaySize;
    logo_custom_auth?: LogoCustomDims;
    logo_size_app?: LogoDisplaySize;
    logo_custom_app?: LogoCustomDims;
  };
  color_theme?: OrgColorTheme;
  style_theme?: OrgStyleThemeConfig;
  project_visibility?: unknown;
  [key: string]: unknown;
};
type Org = {
  id: string;
  name: string;
  slug: string | null;
  plan: string | null;
  brand_name: string | null;
  primary_color: string | null;
  accent_color: string | null;
  logo_url: string | null;
  palette: unknown;
  ui_config: OrgUiConfig | null;
};

function PlatformBrandingPage() {
  const { roles, user } = useAuth();
  const qc = useQueryClient();
  const isPlat = isPlatformAdmin(roles);

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ["platform-orgs-branding"],
    enabled: isPlat,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id,name,slug,plan,brand_name,primary_color,accent_color,logo_url,palette,ui_config")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Org[];
    },
  });

  const { data: landing } = useQuery({
    queryKey: ["landing-config"],
    enabled: isPlat,
    queryFn: fetchLandingConfig,
  });

  const [platformStyleId, setPlatformStyleId] = useState<StyleThemeId>("simple");
  const [savingPlatformStyle, setSavingPlatformStyle] = useState(false);
  useEffect(() => {
    if (landing?.style_theme_id && isStyleThemeId(landing.style_theme_id)) {
      setPlatformStyleId(landing.style_theme_id);
    }
  }, [landing?.style_theme_id]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedId && orgs.length) setSelectedId(orgs[0].id);
  }, [orgs, selectedId]);

  const selected = useMemo(() => orgs.find((o) => o.id === selectedId) ?? null, [orgs, selectedId]);

  if (!isPlat) {
    return <div className="p-6 text-sm text-muted-foreground">Platform admin access required.</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Palette className="h-7 w-7" /> White Label & Branding
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage display name, logo, colour palette, and style themes for each organisation
          (platform admin only). Style themes change look &amp; feel — tables, surfaces, buttons,
          motion — not just colours.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">General style theme (platform default)</CardTitle>
          <CardDescription>
            Fallback when an organisation has not set its own style theme. Current baseline is
            called <strong>Simple</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <StyleThemePicker value={platformStyleId} onChange={setPlatformStyleId} />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={savingPlatformStyle || !landing}
              onClick={async () => {
                if (!landing) return;
                setSavingPlatformStyle(true);
                try {
                  const next: LandingConfig = { ...landing, style_theme_id: platformStyleId };
                  await saveLandingConfig(next, user?.id);
                  toast.success("Platform style theme saved");
                  void qc.invalidateQueries({ queryKey: ["landing-config"] });
                } catch (e: any) {
                  toast.error(e?.message ?? "Failed to save");
                } finally {
                  setSavingPlatformStyle(false);
                }
              }}
            >
              <Save className="mr-2 h-4 w-4" />
              {savingPlatformStyle ? "Saving…" : "Save general style theme"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Organisations</CardTitle></CardHeader>
          <CardContent className="p-2">
            {isLoading && <div className="text-xs text-muted-foreground p-2">Loading…</div>}
            <div className="space-y-1 max-h-[70vh] overflow-auto">
              {orgs.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setSelectedId(o.id)}
                  className={`w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-muted flex items-center gap-2 ${selectedId === o.id ? "bg-muted font-semibold" : ""}`}
                >
                  <span
                    className="inline-block h-4 w-4 rounded border shrink-0"
                    style={{
                      background:
                        (o.ui_config as OrgUiConfig | null)?.color_theme?.palette?.accent ||
                        o.primary_color ||
                        "#e5e7eb",
                    }}
                  />
                  <span className="truncate">{o.brand_name || o.name}</span>
                </button>
              ))}
              {!isLoading && !orgs.length && (
                <div className="text-xs text-muted-foreground p-2">No organisations found.</div>
              )}
            </div>
          </CardContent>
        </Card>

        {selected && (
          <BrandingEditor
            key={selected.id}
            org={selected}
            onSaved={() => qc.invalidateQueries({ queryKey: ["platform-orgs-branding"] })}
          />
        )}
      </div>
    </div>
  );
}

function BrandingEditor({ org, onSaved }: { org: Org; onSaved: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const existingUi = (org.ui_config && typeof org.ui_config === "object" ? org.ui_config : {}) as OrgUiConfig;
  const existingBranding = existingUi.branding ?? {};
  const [brandName, setBrandName] = useState(org.brand_name ?? org.name ?? "");
  const [logoUrl, setLogoUrl] = useState<string | null>(org.logo_url ?? null);
  const [logoSizeAuth, setLogoSizeAuth] = useState<LogoDisplaySize>(
    normalizeLogoSize(existingBranding.logo_size_auth, "lg"),
  );
  const [logoCustomAuth, setLogoCustomAuth] = useState<LogoCustomDims>(
    clampLogoCustom(existingBranding.logo_custom_auth, { heightPx: 48, maxWidthPx: 220 }),
  );
  const [logoSizeApp, setLogoSizeApp] = useState<LogoDisplaySize>(
    normalizeLogoSize(existingBranding.logo_size_app, "md"),
  );
  const [logoCustomApp, setLogoCustomApp] = useState<LogoCustomDims>(
    clampLogoCustom(existingBranding.logo_custom_app, { heightPx: 32, maxWidthPx: 160 }),
  );
  const [colorTheme, setColorTheme] = useState<OrgColorTheme>(() => {
    const stored = normalizeOrgColorTheme(existingUi.color_theme);
    if (stored.enabled) return stored;
    const seeded = defaultOrgColorTheme();
    if (org.primary_color) seeded.palette.accent = org.primary_color;
    if (org.accent_color) seeded.palette.navyLight = org.accent_color;
    seeded.enabled = true;
    seeded.palette_preset = "custom";
    return seeded;
  });
  const [styleTheme, setStyleTheme] = useState<OrgStyleThemeConfig>(() =>
    normalizeOrgStyleTheme(existingUi.style_theme),
  );

  const handleLogoPick = (file: File) => {
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Logo must be under 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const mut = useMutation({
    mutationFn: async () => {
      const { data: current, error: readErr } = await supabase
        .from("organizations")
        .select("ui_config")
        .eq("id", org.id)
        .maybeSingle();
      if (readErr) throw readErr;
      const prev =
        current?.ui_config && typeof current.ui_config === "object"
          ? (current.ui_config as OrgUiConfig)
          : {};
      const nextTheme: OrgColorTheme = { ...colorTheme, enabled: true };
      const nextStyle = normalizeOrgStyleTheme(styleTheme);
      const nextUi: OrgUiConfig = {
        ...prev,
        branding: {
          ...(prev.branding ?? {}),
          logo_size_auth: logoSizeAuth,
          logo_custom_auth: logoCustomAuth,
          logo_size_app: logoSizeApp,
          logo_custom_app: logoCustomApp,
        },
        color_theme: nextTheme,
        style_theme: nextStyle,
      };
      const { error } = await supabase
        .from("organizations")
        .update({
          brand_name: brandName || null,
          primary_color: nextTheme.palette.accent,
          accent_color: nextTheme.palette.navyLight,
          logo_url: logoUrl,
          ui_config: nextUi as any,
        })
        .eq("id", org.id);
      if (error) throw error;
      writeCachedOrgStyleTheme(org.id, nextStyle);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(STYLE_THEME_CHANGE_EVENT, {
            detail: { themeId: nextStyle.theme_id, source: "org" },
          }),
        );
      }
    },
    onSuccess: () => {
      toast.success("Branding saved");
      onSaved();
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const loginPath = org.slug ? `/o/${encodeURIComponent(org.slug)}/login` : "";
  const loginUrl = org.slug ? `${origin}${loginPath}` : "";
  const authQueryPath = org.slug ? `/auth?org=${encodeURIComponent(org.slug)}` : "";

  const copyLoginLink = async () => {
    if (!loginUrl) {
      toast.error("Set an organisation slug before sharing a login link.");
      return;
    }
    try {
      await navigator.clipboard.writeText(loginUrl);
      toast.success("White-label login link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{org.name}</CardTitle>
        <CardDescription>
          Slug: {org.slug ?? "—"} · Plan: {org.plan ?? "—"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <Label className="text-xs font-semibold uppercase tracking-wide">
            White-label sign-in link
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Share this URL with the organisation. It opens their branded sign-in page and{" "}
            <b>only members of this organisation</b> can sign in. Generic{" "}
            <code className="rounded bg-muted px-1">/auth</code> stays platform-branded with no
            org lock. Canonical:{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              {authQueryPath || "/auth?org=&lt;slug&gt;"}
            </code>
          </p>
          {org.slug ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input readOnly value={loginUrl} className="font-mono text-xs" />
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void copyLoginLink()}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
                </Button>
                <Button type="button" variant="ghost" size="sm" asChild>
                  <a href={loginPath} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
              This organisation has no slug yet. Set a slug under Organisations &amp; Users to enable
              a dedicated login link.
            </p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Brand display name</Label>
            <Input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder={org.name}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Shown in the sidebar header instead of the legal org name.
            </p>
          </div>
        </div>

        <div>
          <Label>Organisation logo</Label>
          <div className="mt-2 flex items-center gap-4 rounded-lg border p-4">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border bg-muted">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-center text-xs text-muted-foreground">No logo</span>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLogoPick(f);
                }}
              />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" /> Upload logo
                </Button>
                {logoUrl && (
                  <Button variant="ghost" size="sm" onClick={() => setLogoUrl(null)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                PNG / JPG / SVG / WebP · max 5 MB · square works best.
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <LogoSizeControls
              label="Sign-in logo size"
              hint="Used on /o/<slug>/login and /auth?org=<slug>"
              size={logoSizeAuth}
              custom={logoCustomAuth}
              previewUrl={logoUrl ?? undefined}
              onSizeChange={setLogoSizeAuth}
              onCustomChange={(c) => {
                setLogoCustomAuth(c);
                setLogoSizeAuth("custom");
              }}
            />
            <LogoSizeControls
              label="App shell logo size"
              hint="Sidebar / mobile header after this org signs in"
              size={logoSizeApp}
              custom={logoCustomApp}
              previewUrl={logoUrl ?? undefined}
              onSizeChange={setLogoSizeApp}
              onCustomChange={(c) => {
                setLogoCustomApp(c);
                setLogoSizeApp("custom");
              }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Organisation colour palette</Label>
          <p className="text-xs text-muted-foreground">
            Templates plus custom hex codes. When set, this organisation&apos;s palette overrides the
            platform theme inside the app.
          </p>
          <ColorPaletteEditor value={colorTheme} onChange={setColorTheme} />
        </div>

        <div className="space-y-2">
          <Label>Style theme</Label>
          <p className="text-xs text-muted-foreground">
            Full look &amp; feel (surfaces, tables, buttons, motion). <strong>Simple</strong> is the
            current utilitarian UI. Enable user choice so org members can pick their own theme —
            their selection takes precedence while Active.
          </p>
          <OrgStyleThemeEditor value={styleTheme} onChange={setStyleTheme} />
        </div>

        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Brand mark preview
          </div>
          <div className="flex items-center gap-3 rounded-md border bg-background p-3">
            <div
              className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md"
              style={{ background: colorTheme.palette.accent }}
            >
              {logoUrl ? (
                <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-sm font-bold" style={{ color: colorTheme.palette.textOnAccent }}>
                  {(brandName || org.name || "?").slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: colorTheme.palette.accent }}>
                {brandName || org.name}
              </div>
              <div className="text-[11px] text-muted-foreground">{org.plan ?? "free"} plan</div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            <Save className="mr-2 h-4 w-4" /> {mut.isPending ? "Saving…" : "Save branding"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
