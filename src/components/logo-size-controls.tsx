import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LOGO_SIZE_OPTIONS,
  clampLogoCustom,
  logoSizeDims,
  type LogoCustomDims,
  type LogoDisplaySize,
} from "@/lib/landing-config";

type LogoSizeControlsProps = {
  label: string;
  hint?: string;
  size: LogoDisplaySize;
  custom: LogoCustomDims;
  previewUrl?: string;
  onSizeChange: (size: LogoDisplaySize) => void;
  onCustomChange: (custom: LogoCustomDims) => void;
};

export function LogoSizeControls({
  label,
  hint,
  size,
  custom,
  previewUrl,
  onSizeChange,
  onCustomChange,
}: LogoSizeControlsProps) {
  const dims = logoSizeDims(size, custom);
  return (
    <div className="rounded-lg border p-3">
      <div className="text-sm font-medium">{label}</div>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {LOGO_SIZE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSizeChange(opt.value)}
            className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
              size === opt.value
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {size === "custom" && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px]">Height (px)</Label>
            <Input
              type="number"
              min={16}
              max={160}
              value={custom.heightPx}
              className="mt-1 h-8"
              onChange={(e) =>
                onCustomChange(
                  clampLogoCustom({
                    ...custom,
                    heightPx: Number(e.target.value) || custom.heightPx,
                  }),
                )
              }
            />
          </div>
          <div>
            <Label className="text-[11px]">Max width (px)</Label>
            <Input
              type="number"
              min={40}
              max={640}
              value={custom.maxWidthPx}
              className="mt-1 h-8"
              onChange={(e) =>
                onCustomChange(
                  clampLogoCustom({
                    ...custom,
                    maxWidthPx: Number(e.target.value) || custom.maxWidthPx,
                  }),
                )
              }
            />
          </div>
        </div>
      )}
      <div className="mt-3 flex h-16 items-center justify-center rounded border bg-muted/40 px-3">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            className="object-contain"
            style={{ height: dims.heightPx, maxWidth: dims.maxWidthPx }}
          />
        ) : (
          <span className="text-[11px] text-muted-foreground">
            {dims.heightPx}×{dims.maxWidthPx}px · upload a logo to preview
          </span>
        )}
      </div>
    </div>
  );
}
