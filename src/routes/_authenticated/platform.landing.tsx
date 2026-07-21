import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Save, RefreshCw, ExternalLink } from "lucide-react";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-context";
import {
  DEFAULT_LANDING,
  FONT_PALETTE_KEYS,
  PALETTE_KEY_LABELS,
  PALETTE_PRESETS,
  SURFACE_PALETTE_KEYS,
  applyPalettePreset,
  fetchLandingConfig,
  saveLandingConfig,
  type LandingConfig,
  type LandingItem,
  type LandingLogo,
  type LandingPalette,
  type LandingStat,
  type LandingThemeMode,
} from "@/lib/landing-config";

export const Route = createFileRoute("/_authenticated/platform/landing")({
  component: LandingConfigPage,
});

function LandingConfigPage() {
  const { user } = useAuth();
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

  if (!cfg) return <div className="p-8 text-sm text-muted-foreground">Loading landing config…</div>;

  const patch = <K extends keyof LandingConfig>(k: K, v: Partial<LandingConfig[K]>) =>
    setCfg({ ...cfg, [k]: { ...(cfg[k] as any), ...v } });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          title="Landing Page Configuration"
          subtitle="Configure the public marketing site — logo, palette, hero, comparison, capabilities and client logos."
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

      <Tabs defaultValue="brand">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="brand">Brand & Logo</TabsTrigger>
          <TabsTrigger value="palette">Color Palette</TabsTrigger>
          <TabsTrigger value="hero">Hero</TabsTrigger>
          <TabsTrigger value="comparison">Without / With</TabsTrigger>
          <TabsTrigger value="sections">Product Sections</TabsTrigger>
          <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
          <TabsTrigger value="stats">Stats</TabsTrigger>
          <TabsTrigger value="trusted">Trusted-by Logos</TabsTrigger>
          <TabsTrigger value="footer">Final CTA & Footer</TabsTrigger>
        </TabsList>

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
              <Field
                label="iProjectX logo URL (https://…)"
                hint="Paste a hosted PNG/SVG. Leave blank to keep the built-in diamond mark."
              >
                <Input
                  value={cfg.brand.logo_url}
                  placeholder="https://cdn.example.com/iprojectx-logo.svg"
                  onChange={(e) => patch("brand", { logo_url: e.target.value })}
                />
              </Field>
              <div className="flex items-center justify-center rounded border bg-[#0f1b3d] p-6">
                {cfg.brand.logo_url ? (
                  <img
                    src={cfg.brand.logo_url}
                    alt="Logo preview"
                    className="max-h-16 max-w-full object-contain"
                  />
                ) : (
                  <span className="text-sm text-white/60">No logo — using built-in mark</span>
                )}
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Per-organisation white-label logos are configured separately under{" "}
              <b>Branding &amp; White Label</b>.
            </p>
          </SectionFrame>
        </TabsContent>

        {/* PALETTE */}
        <TabsContent value="palette">
          <div className="space-y-4">
            <SectionFrame>
              <SectionTitle>Theme</SectionTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose light or dark mode for the public landing page. Predefined palettes also set
                a matching theme.
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
            </SectionFrame>

            <SectionFrame>
              <SectionTitle>Predefined palettes</SectionTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Apply a ready-made brand palette (includes surface colours and font colours). You
                can still tweak colours after applying.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                        ].map((c, i) => (
                          <span
                            key={i}
                            className="h-6 w-6 rounded border"
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                      <div className="text-sm font-semibold">{preset.name}</div>
                      <div className="text-xs text-muted-foreground">{preset.description}</div>
                      <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {preset.theme} theme
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
                    onChange={(v) =>
                      setCfg({
                        ...cfg,
                        palette_preset: "custom",
                        palette: { ...cfg.palette, [k]: v },
                      })
                    }
                  />
                ))}
              </div>
            </SectionFrame>

            <SectionFrame>
              <SectionTitle>Font colours</SectionTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Colours used for headings, body copy, muted labels, and text on dark / accent
                surfaces.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {FONT_PALETTE_KEYS.map((k) => (
                  <PaletteColorField
                    key={k}
                    label={PALETTE_KEY_LABELS[k]}
                    value={cfg.palette[k]}
                    onChange={(v) =>
                      setCfg({
                        ...cfg,
                        palette_preset: "custom",
                        palette: { ...cfg.palette, [k]: v },
                      })
                    }
                    previewText={k.startsWith("textOn") ? "Aa" : "Sample text"}
                    previewBg={
                      k === "textOnDark"
                        ? cfg.palette.navy
                        : k === "textOnAccent"
                          ? cfg.palette.accent
                          : undefined
                    }
                  />
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                {(Object.keys(cfg.palette) as (keyof LandingPalette)[]).map((k) => (
                  <div key={k} className="flex items-center gap-2 rounded border p-2 text-xs">
                    <div
                      className="h-8 w-8 rounded border"
                      style={{ background: cfg.palette[k] }}
                    />
                    <div>
                      <div className="font-semibold">{PALETTE_KEY_LABELS[k]}</div>
                      <div className="text-muted-foreground">{cfg.palette[k]}</div>
                    </div>
                  </div>
                ))}
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
  value,
  onChange,
  previewText,
  previewBg,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  previewText?: string;
  previewBg?: string;
}) {
  return (
    <Field label={label}>
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
