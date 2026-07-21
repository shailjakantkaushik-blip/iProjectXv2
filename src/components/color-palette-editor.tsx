import {
  DARK_ON_LIGHT_FONT_KEYS,
  LIGHT_ON_DARK_FONT_KEYS,
  PALETTE_KEY_HINTS,
  PALETTE_KEY_LABELS,
  PALETTE_PRESETS,
  SURFACE_PALETTE_KEYS,
  type LandingPalette,
  type LandingThemeMode,
} from "@/lib/landing-config";
import {
  applyOrgPalettePreset,
  type OrgColorTheme,
} from "@/lib/org-theme";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SectionFrame, SectionTitle } from "@/components/streamlit";

type Props = {
  value: OrgColorTheme;
  onChange: (next: OrgColorTheme) => void;
  /** Show light/dark mode toggle (default true). */
  showThemeToggle?: boolean;
  className?: string;
};

function ColorField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs font-semibold uppercase tracking-wide">{label}</Label>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      <div className="mt-1.5 flex items-center gap-2">
        <Input
          type="color"
          value={value}
          className="h-10 w-14 shrink-0 p-1"
          onChange={(e) => onChange(e.target.value)}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-xs uppercase"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

export function ColorPaletteEditor({
  value,
  onChange,
  showThemeToggle = true,
  className,
}: Props) {
  const patchPalette = (patch: Partial<LandingPalette>) => {
    onChange({
      ...value,
      enabled: true,
      palette_preset: "custom",
      palette: { ...value.palette, ...patch },
    });
  };

  const setTheme = (theme: LandingThemeMode) => {
    onChange({ ...value, enabled: true, theme, palette_preset: "custom" });
  };

  return (
    <div className={className ?? "space-y-4"}>
      {showThemeToggle && (
        <SectionFrame exportable={false}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <SectionTitle>Theme mode</SectionTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Light or dark base. Template and custom colours still apply within the mode.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">Light</span>
              <Switch
                checked={value.theme === "dark"}
                onCheckedChange={(dark) => setTheme(dark ? "dark" : "light")}
              />
              <span className="text-xs font-medium text-muted-foreground">Dark</span>
            </div>
          </div>
        </SectionFrame>
      )}

      <SectionFrame exportable={false}>
        <SectionTitle>Palette templates</SectionTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick an industry template, then fine-tune any colour with hex codes below.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {PALETTE_PRESETS.map((preset) => {
            const active = value.palette_preset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onChange(applyOrgPalettePreset(value, preset.id))}
                className={`rounded-lg border p-3 text-left transition hover:border-primary ${
                  active ? "border-primary ring-2 ring-primary/20" : ""
                }`}
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
                <div className="mt-0.5 text-xs text-muted-foreground">{preset.description}</div>
              </button>
            );
          })}
        </div>
      </SectionFrame>

      <SectionFrame exportable={false}>
        <SectionTitle>Custom colour codes</SectionTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Edit any swatch with the picker or paste a hex code (e.g. <code>#1d4ed8</code>).
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {SURFACE_PALETTE_KEYS.map((k) => (
            <ColorField
              key={k}
              label={PALETTE_KEY_LABELS[k]}
              hint={PALETTE_KEY_HINTS[k]}
              value={value.palette[k]}
              onChange={(v) => patchPalette({ [k]: v })}
            />
          ))}
        </div>
      </SectionFrame>

      <SectionFrame exportable={false}>
        <SectionTitle>Font colours</SectionTitle>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border p-4">
            <div className="mb-3 text-sm font-semibold">Dark text on light</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {DARK_ON_LIGHT_FONT_KEYS.map((k) => (
                <ColorField
                  key={k}
                  label={PALETTE_KEY_LABELS[k]}
                  value={value.palette[k]}
                  onChange={(v) => patchPalette({ [k]: v })}
                />
              ))}
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="mb-3 text-sm font-semibold">Light text on dark / accent</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {LIGHT_ON_DARK_FONT_KEYS.map((k) => (
                <ColorField
                  key={k}
                  label={PALETTE_KEY_LABELS[k]}
                  value={value.palette[k]}
                  onChange={(v) => patchPalette({ [k]: v })}
                />
              ))}
            </div>
          </div>
        </div>
      </SectionFrame>

      <SectionFrame exportable={false}>
        <SectionTitle>Live preview</SectionTitle>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div
            className="rounded-lg border p-4"
            style={{ background: value.palette.surface, color: value.palette.textBody }}
          >
            <div className="text-sm font-bold" style={{ color: value.palette.textHeading }}>
              Surface card
            </div>
            <p className="mt-1 text-xs" style={{ color: value.palette.textMuted }}>
              Muted supporting copy
            </p>
            <button
              type="button"
              className="mt-3 rounded-md px-3 py-1.5 text-xs font-semibold"
              style={{
                background: value.palette.accent,
                color: value.palette.textOnAccent,
              }}
            >
              Primary CTA
            </button>
          </div>
          <div
            className="rounded-lg border p-4"
            style={{ background: value.palette.navy, color: value.palette.textOnDark }}
          >
            <div className="text-sm font-bold">Sidebar / dark</div>
            <p className="mt-1 text-xs opacity-80">Navigation chrome sample</p>
            <div
              className="mt-3 rounded-md px-2 py-1 text-xs font-medium"
              style={{
                background: value.palette.accent,
                color: value.palette.textOnAccent,
              }}
            >
              Active link
            </div>
          </div>
          <div
            className="rounded-lg border p-4"
            style={{ background: value.theme === "dark" ? value.palette.navyLight : "#fff" }}
          >
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["Danger", value.palette.danger],
                  ["Warning", value.palette.warning],
                  ["Success", value.palette.success],
                ] as const
              ).map(([label, color]) => (
                <span
                  key={label}
                  className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                  style={{ background: color }}
                >
                  {label}
                </span>
              ))}
            </div>
            <p
              className="mt-3 text-xs"
              style={{
                color: value.theme === "dark" ? value.palette.textOnDark : value.palette.textMuted,
              }}
            >
              Status tokens used across the workspace
            </p>
          </div>
        </div>
      </SectionFrame>
    </div>
  );
}
