import { cn } from "@/lib/utils";
import {
  STYLE_THEMES,
  type OrgStyleThemeConfig,
  type StyleThemeId,
} from "@/lib/style-theme";
import { CARTOONS, type CartoonId } from "@/lib/cartoons";
import { CartoonGuide } from "@/components/cartoon-mascots";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type PickerProps = {
  value: StyleThemeId;
  onChange: (id: StyleThemeId) => void;
  className?: string;
  /** Compact chips for header picker */
  compact?: boolean;
};

export function StyleThemePicker({ value, onChange, className, compact }: PickerProps) {
  return (
    <div
      className={cn(
        compact ? "grid grid-cols-2 gap-2 sm:grid-cols-3" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {STYLE_THEMES.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              "rounded-lg border text-left transition",
              compact ? "p-2" : "p-3",
              active
                ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                : "border-border bg-background hover:border-primary/40",
            )}
          >
            <div className="mb-2 flex gap-1">
              {t.swatches.map((c) => (
                <span
                  key={c}
                  className="h-3 w-3 rounded-full border border-black/10"
                  style={{ background: c }}
                />
              ))}
            </div>
            <div className={cn("font-semibold", compact ? "text-xs" : "text-sm")}>
              {t.name}
            </div>
            {!compact && (
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                {t.description}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}

type OrgEditorProps = {
  value: OrgStyleThemeConfig;
  onChange: (next: OrgStyleThemeConfig) => void;
};

type CartoonPickerProps = {
  value: CartoonId;
  onChange: (id: CartoonId) => void;
  className?: string;
  compact?: boolean;
};

/** Grid of cartoon characters for Platform Settings / Landing. */
export function CartoonPicker({ value, onChange, className, compact }: CartoonPickerProps) {
  return (
    <div
      className={cn(
        compact
          ? "grid grid-cols-2 gap-2 sm:grid-cols-3"
          : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {CARTOONS.map((c) => {
        const active = value === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            className={cn(
              "rounded-lg border text-left transition",
              compact ? "p-2" : "p-3",
              active
                ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                : "border-border bg-background hover:border-primary/40",
            )}
          >
            <div className={cn("mb-1 flex items-center justify-center", compact ? "h-14" : "h-20")}>
              <CartoonGuide
                size={compact ? "sm" : "md"}
                variant={c.id}
                interactive={false}
                mood={active ? "wave" : "idle"}
              />
            </div>
            <div className={cn("font-semibold", compact ? "text-xs" : "text-sm")}>
              {c.name}
            </div>
            {!compact && (
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                {c.description}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Platform branding: org style theme + user-choice toggle. */
export function OrgStyleThemeEditor({ value, onChange }: OrgEditorProps) {
  return (
    <div className="space-y-3">
      <StyleThemePicker
        value={value.theme_id}
        onChange={(theme_id) => onChange({ ...value, theme_id })}
      />
      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2.5">
        <div className="min-w-0">
          <Label className="text-sm">Allow users to choose style theme</Label>
          <p className="text-[11px] text-muted-foreground">
            Inactive: only platform admins set the theme. Active: users can pick their own
            (user choice takes precedence).
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Switch
            checked={value.user_choice_enabled}
            onCheckedChange={(user_choice_enabled) =>
              onChange({ ...value, user_choice_enabled })
            }
          />
          <span className="text-xs font-medium">
            {value.user_choice_enabled ? "Active" : "Inactive"}
          </span>
        </div>
      </div>
    </div>
  );
}
