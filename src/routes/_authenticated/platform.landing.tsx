import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Save, RefreshCw, ExternalLink, Upload, Sparkles, UserPlus } from "lucide-react";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth-context";
import { CartoonSettingsPreview } from "@/components/cartoon-mascots";
import { NavSequenceEditor } from "@/components/nav-sequence-editor";
import {
  DEFAULT_LANDING,
  defaultNavigationConfig,
  DARK_ON_LIGHT_FONT_KEYS,
  LIGHT_ON_DARK_FONT_KEYS,
  PALETTE_KEY_HINTS,
  PALETTE_KEY_LABELS,
  PALETTE_PRESETS,
  SURFACE_PALETTE_KEYS,
  applyElegantFontContrast,
  applyPalettePreset,
  fetchLandingConfig,
  saveLandingConfig,
  type LandingConfig,
  type LandingItem,
  type LandingLogo,
  type LandingPalette,
  type LandingPersonCard,
  type LandingStat,
  type LandingThemeMode,
  type LogoCustomDims,
  type LogoDisplaySize,
} from "@/lib/landing-config";
import { LogoSizeControls } from "@/components/logo-size-controls";
import { PageLoading } from "@/components/page-loading";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const MAX_PHOTO_BYTES = 1024 * 1024;

export const Route = createFileRoute("/_authenticated/platform/landing")({
  component: LandingConfigPage,
});

function LandingConfigPage() {
  const { user } = useAuth();
  const logoFileRef = useRef<HTMLInputElement>(null);
  const authLogoFileRef = useRef<HTMLInputElement>(null);
  const appLogoFileRef = useRef<HTMLInputElement>(null);
  const [cfg, setCfg] = useState<LandingConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void reload();
  }, []);
  async function reload() {
    setCfg(await fetchLandingConfig());
  }

  async function save() {
    if (!cfg) return;
    setSaving(true);
    try {
      await saveLandingConfig(cfg, user?.id);
      toast.success("Landing page updated. Public site refreshed.");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    if (!confirm("Reset the entire landing page to iProjectX defaults?")) return;
    setCfg(structuredClone(DEFAULT_LANDING));
  }

  function handleBrandLogoPick(
    file: File,
    target: "logo_url_landing" | "logo_url_auth" | "logo_url_app",
  ) {
    if (!cfg) return;
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Logo must be under 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setCfg({
        ...cfg,
        brand: {
          ...cfg.brand,
          [target]: reader.result as string,
          // Clear legacy single-logo once surfaces are managed independently.
          logo_url: "",
        },
      });
    reader.readAsDataURL(file);
  }

  if (!cfg) return <PageLoading label="Loading landing config…" fullScreen={false} />;

  const patch = <K extends keyof LandingConfig>(k: K, v: Partial<LandingConfig[K]>) =>
    setCfg({ ...cfg, [k]: { ...(cfg[k] as any), ...v } });

  const patchPalette = (partial: Partial<LandingPalette>) =>
    setCfg({
      ...cfg,
      palette_preset: "custom",
      palette: { ...cfg.palette, ...partial },
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          title="Landing Page Configuration"
          subtitle="Brand the public site, and control signup + interactive cartoons (Access & Cartoons tab)."
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={resetDefaults}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Reset to defaults
          </Button>
          <a href="/" target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm">
              <ExternalLink className="mr-1.5 h-4 w-4" /> Preview site
            </Button>
          </a>
          <Button size="sm" onClick={save} disabled={saving}>
            <Save className="mr-1.5 h-4 w-4" /> {saving ? "Saving…" : "Save & publish"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="experience">
        {/* h-auto + wrap: default TabsList is h-9 and clips the second row behind content below */}
        <TabsList className="relative z-20 mb-1 flex h-auto min-h-9 w-full flex-wrap items-center justify-start gap-1 p-1">
          <TabsTrigger value="experience">Access · Nav · Cartoons</TabsTrigger>
          <TabsTrigger value="brand">Brand & Logo</TabsTrigger>
          <TabsTrigger value="palette">Color Palette</TabsTrigger>
          <TabsTrigger value="hero">Hero</TabsTrigger>
          <TabsTrigger value="comparison">Without / With</TabsTrigger>
          <TabsTrigger value="sections">Product Sections</TabsTrigger>
          <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
          <TabsTrigger value="stats">Stats</TabsTrigger>
          <TabsTrigger value="trusted">Trusted-by Logos</TabsTrigger>
          <TabsTrigger value="ceo">CEO Message</TabsTrigger>
          <TabsTrigger value="testimonials">Testimonials</TabsTrigger>
          <TabsTrigger value="board">iProjectX Board</TabsTrigger>
          <TabsTrigger value="footer">Final CTA & Footer</TabsTrigger>
        </TabsList>

        {/* ACCESS & CARTOONS — most discoverable for platform toggles */}
        <TabsContent value="experience">
          <SectionFrame>
            <SectionTitle>Registration</SectionTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Control public self-service signup. Platform admins can still create users from
              Organizations &amp; Users.
            </p>
            <label className="mt-4 flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
              <div className="flex items-start gap-3">
                <UserPlus className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">Allow public signup</div>
                  <div className="text-xs text-muted-foreground">
                    When off, Sign up is hidden on /auth and marketing “Get started” is removed.
                  </div>
                </div>
              </div>
              <Switch
                checked={cfg.signup_enabled}
                onCheckedChange={(v) => setCfg({ ...cfg, signup_enabled: v })}
              />
            </label>
          </SectionFrame>

          <SectionFrame>
            <SectionTitle>Interactive cartoons</SectionTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Animated guide character on Home and a floating companion in the app. Click for tips.
              Turn off for a strictly corporate UI.
            </p>
            <label className="mt-4 flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">Show animated cartoons in the app</div>
                  <div className="text-xs text-muted-foreground">
                    Save &amp; publish, then open Home (/app) to see the guide. Users can dismiss the
                    floating companion for the session.
                  </div>
                </div>
              </div>
              <Switch
                checked={cfg.cartoons_enabled}
                onCheckedChange={(v) => setCfg({ ...cfg, cartoons_enabled: v })}
              />
            </label>
            <div className="mt-4">
              <CartoonSettingsPreview enabled={cfg.cartoons_enabled} />
            </div>
          </SectionFrame>

          <SectionFrame>
            <SectionTitle>Navigation sequence</SectionTitle>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">
              Add or remove section headers, move links between sections, and reorder
              platform-wide. Save &amp; publish to apply for all users.
            </p>
            <NavSequenceEditor
              value={cfg.navigation ?? defaultNavigationConfig()}
              onChange={(navigation) => setCfg({ ...cfg, navigation })}
              structureEditable
            />
          </SectionFrame>
        </TabsContent>

        {/* BRAND */}
        <TabsContent value="brand">
          <SectionFrame>
            <SectionTitle>iProjectX Brand</SectionTitle>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Brand name">
                <Input
                  value={cfg.brand.name}
                  onChange={(e) => patch("brand", { name: e.target.value })}
                />
              </Field>
              <Field label="Tagline (nav / pill)">
                <Input
                  value={cfg.brand.tagline}
                  onChange={(e) => patch("brand", { tagline: e.target.value })}
                />
              </Field>
            </div>

            <div className="mt-6 space-y-6">
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wide">
                  Logos by screen
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Upload a distinct logo for the public landing page, sign-in screens, and the
                  authenticated app. Each surface is independent.
                </p>
              </div>

              {(
                [
                  {
                    key: "logo_url_landing" as const,
                    label: "Landing page logo",
                    hint: "Public marketing site nav / footer",
                    fileRef: logoFileRef,
                    sizeKey: "logo_size_landing" as const,
                    customKey: "logo_custom_landing" as const,
                  },
                  {
                    key: "logo_url_auth" as const,
                    label: "Sign-in / auth logo",
                    hint: "Login brand panel (platform default when no org link)",
                    fileRef: authLogoFileRef,
                    sizeKey: "logo_size_auth" as const,
                    customKey: "logo_custom_auth" as const,
                  },
                  {
                    key: "logo_url_app" as const,
                    label: "App shell logo",
                    hint: "Sidebar when the organisation has no white-label logo",
                    fileRef: appLogoFileRef,
                    sizeKey: "logo_size_app" as const,
                    customKey: "logo_custom_app" as const,
                  },
                ] as const
              ).map((row) => {
                const url = cfg.brand[row.key] || "";
                const size = cfg.brand[row.sizeKey];
                const custom = cfg.brand[row.customKey];
                return (
                  <div key={row.key} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">{row.label}</div>
                        <p className="text-[11px] text-muted-foreground">{row.hint}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <input
                          ref={row.fileRef}
                          type="file"
                          accept="image/png,image/jpeg,image/svg+xml,image/webp"
                          hidden
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleBrandLogoPick(f, row.key);
                            e.target.value = "";
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => row.fileRef.current?.click()}
                        >
                          <Upload className="mr-2 h-4 w-4" /> Upload
                        </Button>
                        {url && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              patch("brand", { [row.key]: "", logo_url: "" } as Partial<
                                LandingConfig["brand"]
                              >)
                            }
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Remove
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                      <Field label="Or paste logo URL (https://…)">
                        <Input
                          value={url.startsWith("data:") ? "" : url}
                          placeholder="https://cdn.example.com/logo.svg"
                          onChange={(e) =>
                            patch("brand", {
                              [row.key]: e.target.value,
                              logo_url: "",
                            } as Partial<LandingConfig["brand"]>)
                          }
                        />
                        {url.startsWith("data:") && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Using an uploaded file (embedded). Paste a URL to replace it.
                          </p>
                        )}
                      </Field>
                      <div className="flex min-w-[140px] items-center justify-center rounded border bg-[#0f1b3d] p-4">
                        {url ? (
                          <img
                            src={url}
                            alt=""
                            className="max-h-12 max-w-full object-contain"
                          />
                        ) : (
                          <span className="text-center text-[11px] text-white/60">No logo</span>
                        )}
                      </div>
                    </div>
                    <div className="mt-3">
                      <LogoSizeControls
                        label="Size"
                        size={size}
                        custom={custom}
                        previewUrl={url || undefined}
                        onSizeChange={(next) =>
                          patch("brand", { [row.sizeKey]: next } as Partial<LandingConfig["brand"]>)
                        }
                        onCustomChange={(next: LogoCustomDims) =>
                          patch("brand", {
                            [row.customKey]: next,
                            [row.sizeKey]: "custom" as LogoDisplaySize,
                          } as Partial<LandingConfig["brand"]>)
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Per-organisation white-label logos (and their sizes) are configured under{" "}
              <b>Branding &amp; White Label</b>. Share each org’s dedicated sign-in link so only that
              org’s logo appears on login — never from a cached generic session.
            </p>
          </SectionFrame>
        </TabsContent>

        {/* PALETTE */}
        <TabsContent value="palette">
          <div className="space-y-4">
            <SectionFrame>
              <SectionTitle>Theme</SectionTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose light or dark mode. Predefined palettes also set a matching theme. Use the
                scopes below to apply the same look to login and the authenticated app.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(["light", "dark"] as LandingThemeMode[]).map((mode) => (
                  <Button
                    key={mode}
                    type="button"
                    size="sm"
                    variant={cfg.theme === mode ? "default" : "outline"}
                    onClick={() => setCfg({ ...cfg, theme: mode, palette_preset: "custom" })}
                  >
                    {mode === "light" ? "Light" : "Dark"}
                  </Button>
                ))}
                <span className="self-center text-xs text-muted-foreground">
                  Active: <b className="capitalize">{cfg.theme}</b>
                  {cfg.palette_preset && cfg.palette_preset !== "custom"
                    ? ` · preset “${cfg.palette_preset}”`
                    : " · custom palette"}
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-3 text-sm">
                  <div>
                    <div className="font-medium">Apply to login pages</div>
                    <div className="text-xs text-muted-foreground">
                      Sign in, sign up, reset password, force password change
                    </div>
                  </div>
                  <Switch
                    checked={cfg.apply_theme_to_auth !== false}
                    onCheckedChange={(v) => setCfg({ ...cfg, apply_theme_to_auth: v })}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-3 text-sm">
                  <div>
                    <div className="font-medium">Apply to app pages</div>
                    <div className="text-xs text-muted-foreground">
                      Post-login /app shell uses this palette. Platform admin pages always use it.
                      An organisation colour palette (when enabled) still overrides both.
                    </div>
                  </div>
                  <Switch
                    checked={cfg.apply_theme_to_app !== false}
                    onCheckedChange={(v) => setCfg({ ...cfg, apply_theme_to_app: v })}
                  />
                </label>
              </div>
            </SectionFrame>

            <SectionFrame>
              <SectionTitle>Industry palettes</SectionTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                One click applies surfaces, accents, and both font sets (dark text on light + light
                text on dark). Tweak anything afterwards.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {PALETTE_PRESETS.map((preset) => {
                  const active = cfg.palette_preset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setCfg(applyPalettePreset(cfg, preset.id))}
                      className={`rounded-lg border p-3 text-left transition hover:border-primary ${active ? "border-primary ring-2 ring-primary/20" : ""}`}
                    >
                      <div className="mb-2 flex gap-1">
                        {[
                          preset.palette.navy,
                          preset.palette.accent,
                          preset.palette.surface,
                          preset.palette.textHeading,
                          preset.palette.textOnDark,
                        ].map((c, i) => (
                          <span
                            key={i}
                            className="h-6 w-6 rounded border"
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold">{preset.name}</div>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {preset.theme}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {preset.description}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
                        <div
                          className="rounded px-1.5 py-1 font-medium"
                          style={{
                            background: preset.palette.surface,
                            color: preset.palette.textHeading,
                          }}
                        >
                          Dark on light
                        </div>
                        <div
                          className="rounded px-1.5 py-1 font-medium"
                          style={{
                            background: preset.palette.navy,
                            color: preset.palette.textOnDark,
                          }}
                        >
                          Light on dark
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </SectionFrame>

            <SectionFrame>
              <SectionTitle>Surface & status colours</SectionTitle>
              <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {SURFACE_PALETTE_KEYS.map((k) => (
                  <PaletteColorField
                    key={k}
                    label={PALETTE_KEY_LABELS[k]}
                    value={cfg.palette[k]}
                    onChange={(v) => patchPalette({ [k]: v })}
                  />
                ))}
              </div>
            </SectionFrame>

            <SectionFrame>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <SectionTitle>Font colours & contrast</SectionTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Use dark fonts on light sections and light fonts on dark / accent bands. Apply
                    elegant defaults in one click, then fine-tune.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setCfg(applyElegantFontContrast(cfg));
                    toast.success("Elegant font contrast applied");
                  }}
                >
                  <Sparkles className="mr-1.5 h-4 w-4" /> Apply elegant fonts
                </Button>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <div className="mb-1 text-sm font-semibold">Dark text on light backgrounds</div>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Headings, body, and muted labels over white / surface sections.
                  </p>
                  <div
                    className="mb-4 rounded-md border p-3"
                    style={{ background: cfg.palette.surface }}
                  >
                    <div className="text-base font-bold" style={{ color: cfg.palette.textHeading }}>
                      Heading sample
                    </div>
                    <div className="mt-1 text-sm" style={{ color: cfg.palette.textBody }}>
                      Body copy should stay readable on light surfaces.
                    </div>
                    <div className="mt-1 text-xs" style={{ color: cfg.palette.textMuted }}>
                      Muted caption / nav label
                    </div>
                  </div>
                  <div className="grid gap-3">
                    {DARK_ON_LIGHT_FONT_KEYS.map((k) => (
                      <PaletteColorField
                        key={k}
                        label={PALETTE_KEY_LABELS[k]}
                        hint={PALETTE_KEY_HINTS[k]}
                        value={cfg.palette[k]}
                        onChange={(v) => patchPalette({ [k]: v })}
                        previewText="Sample text"
                        previewBg={cfg.palette.surface}
                      />
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border p-4">
                  <div className="mb-1 text-sm font-semibold">Light text on dark backgrounds</div>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Hero, navy bands, and CTA buttons need light (or high-contrast) type.
                  </p>
                  <div
                    className="mb-4 rounded-md border p-3"
                    style={{ background: cfg.palette.navy, color: cfg.palette.textOnDark }}
                  >
                    <div className="text-base font-bold">Hero / dark band</div>
                    <div className="mt-1 text-sm opacity-90">
                      Light type on dark navy keeps the landing elegant.
                    </div>
                    <div
                      className="mt-3 inline-flex rounded px-3 py-1.5 text-xs font-bold"
                      style={{
                        background: cfg.palette.accent,
                        color: cfg.palette.textOnAccent,
                      }}
                    >
                      CTA button text
                    </div>
                  </div>
                  <div className="grid gap-3">
                    {LIGHT_ON_DARK_FONT_KEYS.map((k) => (
                      <PaletteColorField
                        key={k}
                        label={PALETTE_KEY_LABELS[k]}
                        hint={PALETTE_KEY_HINTS[k]}
                        value={cfg.palette[k]}
                        onChange={(v) => patchPalette({ [k]: v })}
                        previewText="Aa sample"
                        previewBg={k === "textOnAccent" ? cfg.palette.accent : cfg.palette.navy}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </SectionFrame>
          </div>
        </TabsContent>

        {/* HERO */}
        <TabsContent value="hero">
          <SectionFrame>
            <SectionTitle>Hero Section</SectionTitle>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Eyebrow (small pill)">
                <Input
                  value={cfg.hero.eyebrow}
                  onChange={(e) => patch("hero", { eyebrow: e.target.value })}
                />
              </Field>
              <Field label="Primary CTA label">
                <Input
                  value={cfg.hero.primary_cta}
                  onChange={(e) => patch("hero", { primary_cta: e.target.value })}
                />
              </Field>
              <Field label="Headline (prefix)">
                <Input
                  value={cfg.hero.title}
                  onChange={(e) => patch("hero", { title: e.target.value })}
                />
              </Field>
              <Field label="Headline accent word">
                <Input
                  value={cfg.hero.title_accent}
                  onChange={(e) => patch("hero", { title_accent: e.target.value })}
                />
              </Field>
              <Field label="Secondary CTA label">
                <Input
                  value={cfg.hero.secondary_cta}
                  onChange={(e) => patch("hero", { secondary_cta: e.target.value })}
                />
              </Field>
              <Field label="Alert banner text" className="md:col-span-2">
                <Textarea
                  rows={2}
                  value={cfg.hero.alert}
                  onChange={(e) => patch("hero", { alert: e.target.value })}
                />
              </Field>
              <Field label="Subtitle" className="md:col-span-2">
                <Textarea
                  rows={3}
                  value={cfg.hero.subtitle}
                  onChange={(e) => patch("hero", { subtitle: e.target.value })}
                />
              </Field>
            </div>
          </SectionFrame>
        </TabsContent>

        {/* COMPARISON */}
        <TabsContent value="comparison">
          <SectionFrame>
            <SectionTitle>Without / With Comparison</SectionTitle>
            <div className="mt-4 grid gap-4">
              <Field label="Section heading">
                <Input
                  value={cfg.comparison.heading}
                  onChange={(e) => patch("comparison", { heading: e.target.value })}
                />
              </Field>
              <Field label="Section subtitle">
                <Textarea
                  rows={2}
                  value={cfg.comparison.subtitle}
                  onChange={(e) => patch("comparison", { subtitle: e.target.value })}
                />
              </Field>
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <ItemList
                title="Without iProjectX (failure modes)"
                items={cfg.comparison.failures}
                onChange={(items) => patch("comparison", { failures: items })}
              />
              <ItemList
                title="With iProjectX (outcomes)"
                items={cfg.comparison.wins}
                onChange={(items) => patch("comparison", { wins: items })}
              />
            </div>
          </SectionFrame>
        </TabsContent>

        {/* PRODUCT SECTIONS */}
        <TabsContent value="sections">
          <div className="space-y-4">
            {(["cockpit", "timeline", "raid"] as const).map((k) => (
              <SectionFrame key={k}>
                <SectionTitle>{k[0].toUpperCase() + k.slice(1)} section</SectionTitle>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Field label="Eyebrow">
                    <Input
                      value={cfg[k].eyebrow}
                      onChange={(e) => patch(k, { eyebrow: e.target.value })}
                    />
                  </Field>
                  <Field label="Title">
                    <Input
                      value={cfg[k].title}
                      onChange={(e) => patch(k, { title: e.target.value })}
                    />
                  </Field>
                  <Field label="Body" className="md:col-span-2">
                    <Textarea
                      rows={3}
                      value={cfg[k].body}
                      onChange={(e) => patch(k, { body: e.target.value })}
                    />
                  </Field>
                  <Field
                    label={k === "raid" ? "Chips (one per line)" : "Bullets (one per line)"}
                    className="md:col-span-2"
                  >
                    <Textarea
                      rows={4}
                      value={(k === "raid" ? cfg.raid.chips : (cfg as any)[k].bullets).join("\n")}
                      onChange={(e) => {
                        const arr = e.target.value
                          .split("\n")
                          .map((s) => s.trim())
                          .filter(Boolean);
                        if (k === "raid") patch("raid", { chips: arr });
                        else patch(k, { bullets: arr } as any);
                      }}
                    />
                  </Field>
                </div>
              </SectionFrame>
            ))}
          </div>
        </TabsContent>

        {/* CAPABILITIES */}
        <TabsContent value="capabilities">
          <SectionFrame>
            <SectionTitle>Capabilities Bento</SectionTitle>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field label="Heading">
                <Input
                  value={cfg.capabilities.heading}
                  onChange={(e) => patch("capabilities", { heading: e.target.value })}
                />
              </Field>
              <Field label="Subtitle">
                <Input
                  value={cfg.capabilities.subtitle}
                  onChange={(e) => patch("capabilities", { subtitle: e.target.value })}
                />
              </Field>
            </div>
            <div className="mt-4">
              <ItemList
                title="Capability cards"
                items={cfg.capabilities.items}
                onChange={(items) => patch("capabilities", { items })}
              />
            </div>
          </SectionFrame>
        </TabsContent>

        {/* STATS */}
        <TabsContent value="stats">
          <SectionFrame>
            <SectionTitle>Stats Strip</SectionTitle>
            <div className="mt-4 space-y-3">
              {cfg.stats.map((s, i) => (
                <div key={i} className="grid grid-cols-1 items-end gap-2 md:grid-cols-12">
                  <div className="md:col-span-2">
                    <Label className="text-xs">Value</Label>
                    <Input
                      type="number"
                      value={s.value}
                      onChange={(e) =>
                        updateArr(cfg.stats, i, { value: Number(e.target.value) || 0 }, (a) =>
                          setCfg({ ...cfg, stats: a }),
                        )
                      }
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Suffix</Label>
                    <Input
                      value={s.suffix ?? ""}
                      placeholder="% / +"
                      onChange={(e) =>
                        updateArr(cfg.stats, i, { suffix: e.target.value }, (a) =>
                          setCfg({ ...cfg, stats: a }),
                        )
                      }
                    />
                  </div>
                  <div className="md:col-span-7">
                    <Label className="text-xs">Label</Label>
                    <Input
                      value={s.label}
                      onChange={(e) =>
                        updateArr(cfg.stats, i, { label: e.target.value }, (a) =>
                          setCfg({ ...cfg, stats: a }),
                        )
                      }
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="md:col-span-1"
                    onClick={() => setCfg({ ...cfg, stats: cfg.stats.filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCfg({
                    ...cfg,
                    stats: [...cfg.stats, { value: 0, label: "New stat" } as LandingStat],
                  })
                }
              >
                <Plus className="mr-1 h-4 w-4" /> Add stat
              </Button>
            </div>
          </SectionFrame>
        </TabsContent>

        {/* TRUSTED */}
        <TabsContent value="trusted">
          <SectionFrame>
            <SectionTitle>Trusted-by / Client Logos</SectionTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Add customer / partner logos to display in the trusted-by band. Paste hosted image
              URLs (SVG or PNG on a transparent or white background).
            </p>
            <div className="mt-4">
              <Field label="Section heading" className="max-w-md">
                <Input
                  value={cfg.trusted.heading}
                  onChange={(e) => patch("trusted", { heading: e.target.value })}
                />
              </Field>
            </div>
            <div className="mt-4 space-y-3">
              {cfg.trusted.logos.map((l, i) => (
                <div key={i} className="grid items-center gap-2 md:grid-cols-12">
                  <div className="md:col-span-3">
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={l.name}
                      onChange={(e) =>
                        updateArr(cfg.trusted.logos, i, { name: e.target.value }, (a) =>
                          patch("trusted", { logos: a }),
                        )
                      }
                    />
                  </div>
                  <div className="md:col-span-6">
                    <Label className="text-xs">Logo URL</Label>
                    <Input
                      value={l.logo_url}
                      placeholder="https://…"
                      onChange={(e) =>
                        updateArr(cfg.trusted.logos, i, { logo_url: e.target.value }, (a) =>
                          patch("trusted", { logos: a }),
                        )
                      }
                    />
                  </div>
                  <div className="md:col-span-2 flex h-12 items-center justify-center rounded border bg-white">
                    {l.logo_url ? (
                      <img
                        src={l.logo_url}
                        alt={l.name}
                        className="max-h-8 max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">preview</span>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="md:col-span-1"
                    onClick={() =>
                      patch("trusted", { logos: cfg.trusted.logos.filter((_, j) => j !== i) })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  patch("trusted", {
                    logos: [...cfg.trusted.logos, { name: "New", logo_url: "" } as LandingLogo],
                  })
                }
              >
                <Plus className="mr-1 h-4 w-4" /> Add logo
              </Button>
            </div>
          </SectionFrame>
        </TabsContent>

        {/* CEO MESSAGE */}
        <TabsContent value="ceo">
          <SectionFrame>
            <SectionTitle>CEO Message</SectionTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Show a featured message with photo on the public landing page. Upload a headshot
              (under 1 MB) or paste an image URL.
            </p>
            <label className="mt-4 flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
              <div>
                <div className="text-sm font-medium">Show CEO message section</div>
                <div className="text-xs text-muted-foreground">Hidden until enabled and message is set.</div>
              </div>
              <Switch
                checked={cfg.ceo_message.enabled}
                onCheckedChange={(v) => patch("ceo_message", { enabled: v })}
              />
            </label>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field label="Title">
                <Input
                  value={cfg.ceo_message.title}
                  onChange={(e) => patch("ceo_message", { title: e.target.value })}
                />
              </Field>
              <Field label="Subtitle">
                <Input
                  value={cfg.ceo_message.subtitle}
                  onChange={(e) => patch("ceo_message", { subtitle: e.target.value })}
                />
              </Field>
              <Field label="Name">
                <Input
                  value={cfg.ceo_message.name}
                  onChange={(e) => patch("ceo_message", { name: e.target.value })}
                />
              </Field>
              <Field label="Role / title">
                <Input
                  value={cfg.ceo_message.role}
                  onChange={(e) => patch("ceo_message", { role: e.target.value })}
                />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Message">
                <Textarea
                  rows={5}
                  value={cfg.ceo_message.message}
                  onChange={(e) => patch("ceo_message", { message: e.target.value })}
                />
              </Field>
            </div>
            <div className="mt-4">
              <PhotoUrlField
                label="Photo"
                url={cfg.ceo_message.photo_url}
                onUrlChange={(photo_url) => patch("ceo_message", { photo_url })}
                onFile={(file) =>
                  readPhotoFile(file, (photo_url) => patch("ceo_message", { photo_url }))
                }
              />
            </div>
          </SectionFrame>
        </TabsContent>

        {/* TESTIMONIALS */}
        <TabsContent value="testimonials">
          <SectionFrame>
            <SectionTitle>Testimonials</SectionTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Add quotes with title, subtitle, message, and photo for each person.
            </p>
            <label className="mt-4 flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
              <div>
                <div className="text-sm font-medium">Show testimonials section</div>
                <div className="text-xs text-muted-foreground">Needs at least one item with a message.</div>
              </div>
              <Switch
                checked={cfg.testimonials.enabled}
                onCheckedChange={(v) => patch("testimonials", { enabled: v })}
              />
            </label>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field label="Section title">
                <Input
                  value={cfg.testimonials.title}
                  onChange={(e) => patch("testimonials", { title: e.target.value })}
                />
              </Field>
              <Field label="Section subtitle">
                <Input
                  value={cfg.testimonials.subtitle}
                  onChange={(e) => patch("testimonials", { subtitle: e.target.value })}
                />
              </Field>
            </div>
            <div className="mt-4 space-y-4">
              {cfg.testimonials.items.map((item, i) => (
                <PersonCardEditor
                  key={i}
                  index={i}
                  item={item}
                  onChange={(partial) =>
                    updateArr(cfg.testimonials.items, i, partial, (a) =>
                      patch("testimonials", { items: a }),
                    )
                  }
                  onRemove={() =>
                    patch("testimonials", {
                      items: cfg.testimonials.items.filter((_, j) => j !== i),
                    })
                  }
                />
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  patch("testimonials", {
                    items: [
                      ...cfg.testimonials.items,
                      emptyPersonCard("New testimonial"),
                    ],
                  })
                }
              >
                <Plus className="mr-1 h-4 w-4" /> Add testimonial
              </Button>
            </div>
          </SectionFrame>
        </TabsContent>

        {/* BOARD */}
        <TabsContent value="board">
          <SectionFrame>
            <SectionTitle>iProjectX Board</SectionTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Important board statements — each with title, subtitle, message, and photo.
            </p>
            <label className="mt-4 flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
              <div>
                <div className="text-sm font-medium">Show iProjectX Board section</div>
                <div className="text-xs text-muted-foreground">Needs at least one statement with a message.</div>
              </div>
              <Switch
                checked={cfg.board_statements.enabled}
                onCheckedChange={(v) => patch("board_statements", { enabled: v })}
              />
            </label>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field label="Section title">
                <Input
                  value={cfg.board_statements.title}
                  onChange={(e) => patch("board_statements", { title: e.target.value })}
                />
              </Field>
              <Field label="Section subtitle">
                <Input
                  value={cfg.board_statements.subtitle}
                  onChange={(e) => patch("board_statements", { subtitle: e.target.value })}
                />
              </Field>
            </div>
            <div className="mt-4 space-y-4">
              {cfg.board_statements.items.map((item, i) => (
                <PersonCardEditor
                  key={i}
                  index={i}
                  item={item}
                  onChange={(partial) =>
                    updateArr(cfg.board_statements.items, i, partial, (a) =>
                      patch("board_statements", { items: a }),
                    )
                  }
                  onRemove={() =>
                    patch("board_statements", {
                      items: cfg.board_statements.items.filter((_, j) => j !== i),
                    })
                  }
                />
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  patch("board_statements", {
                    items: [
                      ...cfg.board_statements.items,
                      emptyPersonCard("Board statement"),
                    ],
                  })
                }
              >
                <Plus className="mr-1 h-4 w-4" /> Add board statement
              </Button>
            </div>
          </SectionFrame>
        </TabsContent>

        {/* FOOTER */}
        <TabsContent value="footer">
          <SectionFrame>
            <SectionTitle>Final CTA & Footer</SectionTitle>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field label="Final CTA title">
                <Input
                  value={cfg.final_cta.title}
                  onChange={(e) => patch("final_cta", { title: e.target.value })}
                />
              </Field>
              <Field label="Final CTA primary">
                <Input
                  value={cfg.final_cta.primary}
                  onChange={(e) => patch("final_cta", { primary: e.target.value })}
                />
              </Field>
              <Field label="Final CTA secondary">
                <Input
                  value={cfg.final_cta.secondary}
                  onChange={(e) => patch("final_cta", { secondary: e.target.value })}
                />
              </Field>
              <Field label="Final CTA body" className="md:col-span-2">
                <Textarea
                  rows={3}
                  value={cfg.final_cta.body}
                  onChange={(e) => patch("final_cta", { body: e.target.value })}
                />
              </Field>
              <Field label="Footer text (blank = auto copyright)">
                <Input
                  value={cfg.footer.text}
                  onChange={(e) => patch("footer", { text: e.target.value })}
                />
              </Field>
            </div>
          </SectionFrame>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs font-semibold uppercase tracking-wide">{label}</Label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function PaletteColorField({
  label,
  hint,
  value,
  onChange,
  previewText,
  previewBg,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  previewText?: string;
  previewBg?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <Input
          type="color"
          value={value}
          className="h-10 w-14 p-1"
          onChange={(e) => onChange(e.target.value)}
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
      {previewText && (
        <div
          className="mt-2 rounded border px-2 py-1.5 text-sm font-medium"
          style={{ color: value, background: previewBg || "transparent" }}
        >
          {previewText}
        </div>
      )}
    </Field>
  );
}

function updateArr<T>(arr: T[], i: number, patchObj: Partial<T>, set: (a: T[]) => void) {
  const next = arr.slice();
  next[i] = { ...(next[i] as any), ...patchObj };
  set(next);
}

function ItemList({
  title,
  items,
  onChange,
}: {
  title: string;
  items: LandingItem[];
  onChange: (a: LandingItem[]) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold">{title}</div>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="grid gap-2 rounded border p-3 md:grid-cols-12">
            <Input
              className="md:col-span-4"
              placeholder="Title"
              value={it.title}
              onChange={(e) => updateArr(items, i, { title: e.target.value }, onChange)}
            />
            <Input
              className="md:col-span-7"
              placeholder="Description"
              value={it.desc}
              onChange={(e) => updateArr(items, i, { desc: e.target.value }, onChange)}
            />
            <Button
              variant="outline"
              size="icon"
              className="md:col-span-1"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-2"
        onClick={() => onChange([...items, { title: "New", desc: "" }])}
      >
        <Plus className="mr-1 h-4 w-4" /> Add item
      </Button>
    </div>
  );
}

function emptyPersonCard(title: string): LandingPersonCard {
  return { title, subtitle: "", message: "", photo_url: "", name: "", role: "" };
}

function readPhotoFile(file: File, onDone: (dataUrl: string) => void) {
  if (file.size > MAX_PHOTO_BYTES) {
    toast.error("Photo must be under 1 MB.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => onDone(reader.result as string);
  reader.readAsDataURL(file);
}

function PhotoUrlField({
  label,
  url,
  onUrlChange,
  onFile,
}: {
  label: string;
  url: string;
  onUrlChange: (url: string) => void;
  onFile: (file: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
          {url ? (
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[10px] text-muted-foreground">No photo</span>
          )}
        </div>
        <div className="min-w-[220px] flex-1 space-y-2">
          <Input
            value={url.startsWith("data:") ? "" : url}
            placeholder="https://… or upload below"
            onChange={(e) => onUrlChange(e.target.value)}
          />
          <div className="flex gap-2">
            <input
              ref={ref}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()}>
              <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload photo
            </Button>
            {url && (
              <Button type="button" variant="ghost" size="sm" onClick={() => onUrlChange("")}>
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PersonCardEditor({
  index,
  item,
  onChange,
  onRemove,
}: {
  index: number;
  item: LandingPersonCard;
  onChange: (partial: Partial<LandingPersonCard>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">Item {index + 1}</div>
        <Button type="button" variant="outline" size="icon" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Title">
          <Input value={item.title} onChange={(e) => onChange({ title: e.target.value })} />
        </Field>
        <Field label="Subtitle">
          <Input value={item.subtitle} onChange={(e) => onChange({ subtitle: e.target.value })} />
        </Field>
        <Field label="Name (optional)">
          <Input value={item.name ?? ""} onChange={(e) => onChange({ name: e.target.value })} />
        </Field>
        <Field label="Role (optional)">
          <Input value={item.role ?? ""} onChange={(e) => onChange({ role: e.target.value })} />
        </Field>
      </div>
      <Field label="Message">
        <Textarea
          rows={3}
          value={item.message}
          onChange={(e) => onChange({ message: e.target.value })}
        />
      </Field>
      <PhotoUrlField
        label="Photo"
        url={item.photo_url}
        onUrlChange={(photo_url) => onChange({ photo_url })}
        onFile={(file) => readPhotoFile(file, (photo_url) => onChange({ photo_url }))}
      />
    </div>
  );
}
