import { Link } from "@tanstack/react-router";
import { useState, type ChangeEvent, type ReactNode } from "react";
import { ArrowLeft, BarChart3, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { StableBrandLogo } from "@/components/stable-brand-logo";
import {
  logoSizeDims,
  type LogoCustomDims,
  type LogoDisplaySize,
} from "@/lib/landing-config";

export type AuthBrand = {
  name: string;
  logo_url?: string;
  tagline?: string;
  logo_size_auth?: LogoDisplaySize;
  logo_custom_auth?: LogoCustomDims;
};

export type AuthOrgBrand = {
  name: string;
  logo_url?: string;
  slug?: string;
  logo_size_auth?: LogoDisplaySize;
  logo_custom_auth?: LogoCustomDims;
} | null;

type AuthLayoutProps = {
  platform: AuthBrand;
  org?: AuthOrgBrand;
  /** When true, org white-label was requested via ?org= (even if still resolving). */
  orgRequested?: boolean;
  /**
   * When false, brand logo/name are skeleton placeholders so a pending route
   * never paints a stale mark that then swaps to the live one.
   */
  brandReady?: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

function LogoMark({
  name,
  logoUrl,
  size = "md",
  custom,
}: {
  name: string;
  logoUrl?: string;
  size?: LogoDisplaySize;
  custom?: LogoCustomDims | null;
}) {
  const dims = logoSizeDims(size, custom);
  const box =
    size === "xl" || (size === "custom" && dims.heightPx >= 48)
      ? "h-14 w-14"
      : size === "lg" || (size === "custom" && dims.heightPx >= 36)
        ? "h-12 w-12"
        : size === "sm" || (size === "custom" && dims.heightPx <= 24)
          ? "h-8 w-8"
          : "h-10 w-10";
  const icon =
    size === "xl" || size === "lg" || dims.heightPx >= 36
      ? "h-6 w-6"
      : size === "sm" || dims.heightPx <= 24
        ? "h-4 w-4"
        : "h-5 w-5";

  if (logoUrl) {
    return (
      <StableBrandLogo
        src={logoUrl}
        alt={`${name} logo`}
        heightPx={dims.heightPx}
        maxWidthPx={dims.maxWidthPx}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground",
        box,
      )}
    >
      <BarChart3 className={icon} />
    </div>
  );
}

export function AuthLayout({
  platform,
  org = null,
  orgRequested = false,
  brandReady = true,
  title,
  description,
  children,
  footer,
  className,
}: AuthLayoutProps) {
  // White-label only when the dedicated org login link was used (?org=).
  const useOrg = Boolean(brandReady && orgRequested && org);
  const displayName = useOrg && org ? org.name : platform.name;
  const displayLogo =
    brandReady && useOrg && org?.logo_url
      ? org.logo_url
      : brandReady
        ? platform.logo_url
        : undefined;
  const tagline = platform.tagline || "Enterprise PMO Command Center";
  const logoSize: LogoDisplaySize =
    useOrg && org?.logo_size_auth
      ? org.logo_size_auth
      : (platform.logo_size_auth ?? "lg");
  const logoCustom =
    useOrg && org?.logo_custom_auth
      ? org.logo_custom_auth
      : platform.logo_custom_auth;
  const mobileDims = logoSizeDims(logoSize, logoCustom);
  const mobileSize: LogoDisplaySize =
    logoSize === "custom"
      ? "custom"
      : logoSize === "xl"
        ? "lg"
        : logoSize === "lg"
          ? "md"
          : logoSize;
  const mobileCustom =
    logoSize === "custom"
      ? {
          heightPx: Math.max(20, Math.round(mobileDims.heightPx * 0.75)),
          maxWidthPx: Math.max(60, Math.round(mobileDims.maxWidthPx * 0.75)),
        }
      : logoCustom;

  const BrandIdentity = ({
    onDark,
    size,
    custom,
  }: {
    onDark?: boolean;
    size: LogoDisplaySize;
    custom?: LogoCustomDims | null;
  }) => {
    if (!brandReady) {
      return (
        <div className="flex items-center gap-3" aria-hidden>
          <div
            className={cn(
              "shrink-0 rounded-xl",
              onDark ? "bg-white/15" : "bg-muted",
              size === "sm" ? "h-8 w-8" : size === "lg" || size === "xl" ? "h-12 w-12" : "h-10 w-10",
            )}
          />
          <div className="min-w-0 space-y-2">
            <div
              className={cn(
                "h-5 w-36 rounded",
                onDark ? "bg-white/20" : "bg-muted",
              )}
            />
            <div
              className={cn(
                "h-3 w-48 rounded",
                onDark ? "bg-white/10" : "bg-muted/80",
              )}
            />
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-3">
        <LogoMark name={displayName} logoUrl={displayLogo} size={size} custom={custom} />
        <div className="min-w-0">
          <div
            className={cn(
              "truncate text-2xl font-semibold tracking-tight",
              onDark ? "text-white" : "text-foreground",
            )}
          >
            {displayName}
          </div>
          {useOrg ? (
            <div
              className={cn(
                "mt-0.5 flex items-center gap-1.5 text-xs",
                onDark ? "text-white/70" : "text-muted-foreground",
              )}
            >
              <span>powered by</span>
              <span className={cn("font-medium", onDark ? "text-white/90" : "text-foreground")}>
                {platform.name}
              </span>
            </div>
          ) : (
            <div className={cn("mt-0.5 text-sm", onDark ? "text-white/75" : "text-muted-foreground")}>
              {tagline}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={cn("flex min-h-screen bg-background", className)}>
      {/* Brand panel — desktop */}
      <aside
        className="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden px-10 py-10 lg:flex xl:w-[46%]"
        style={{
          // Dedicated auth-panel tokens (not --primary) so reload / Cloudflare
          // challenge delays never flash the default app accent blue.
          background:
            "linear-gradient(165deg, color-mix(in srgb, var(--auth-panel-accent) 88%, var(--auth-panel-navy)) 0%, color-mix(in srgb, var(--auth-panel-accent) 42%, var(--auth-panel-navy)) 48%, var(--auth-panel-deep) 100%)",
          color: "#ffffff",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 80% 60% at 20% 10%, rgba(255,255,255,0.18), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 80%, rgba(255,255,255,0.08), transparent 50%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="relative z-10">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-white/80 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to site
          </Link>
        </div>

        <div className="relative z-10 space-y-6">
          <BrandIdentity onDark size={logoSize} custom={logoCustom} />
          {brandReady ? (
            <p className="max-w-sm text-base leading-relaxed text-white/80">
              {useOrg && org
                ? `Sign in to ${org.name} to manage portfolio delivery, governance, and financials.`
                : "Sign in to your portfolio cockpit — projects, gates, risk, and financials in one place."}
            </p>
          ) : (
            <div className="max-w-sm space-y-2" aria-hidden>
              <div className="h-3 w-full rounded bg-white/10" />
              <div className="h-3 w-5/6 rounded bg-white/10" />
              <div className="h-3 w-4/6 rounded bg-white/10" />
            </div>
          )}
        </div>

        <div className="relative z-10 text-xs text-white/55">
          {brandReady ? `${platform.name} · Secure access` : "Secure access"}
        </div>
      </aside>

      {/* Form panel */}
      <div className="relative flex min-h-screen flex-1 flex-col">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 100% 0%, color-mix(in srgb, var(--auth-panel-accent) 12%, transparent), transparent 55%), radial-gradient(ellipse 50% 40% at 0% 100%, color-mix(in srgb, var(--secondary) 70%, transparent), transparent 50%)",
          }}
        />

        <div className="relative z-10 flex items-center justify-between border-b border-border/60 px-4 py-3 lg:hidden">
          {brandReady ? (
            <Link to="/" className="flex min-w-0 items-center gap-2">
              <LogoMark
                name={displayName}
                logoUrl={displayLogo}
                size={mobileSize}
                custom={mobileCustom}
              />
              <span className="truncate text-sm font-semibold text-foreground">
                {displayName}
              </span>
            </Link>
          ) : (
            <div className="flex min-w-0 items-center gap-2" aria-hidden>
              <div className="h-8 w-8 shrink-0 rounded-lg bg-muted" />
              <div className="h-4 w-28 rounded bg-muted" />
            </div>
          )}
          <Link
            to="/"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Home
          </Link>
        </div>

        <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
          <div
            className={cn(
              "w-full max-w-[400px]",
              brandReady && "animate-in fade-in-0 slide-in-from-bottom-2 duration-500",
            )}
          >
            {useOrg && org && (
              <div className="mb-5 hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
                <span>Organization</span>
                <span className="font-medium text-foreground">{org.name}</span>
              </div>
            )}

            <div className="mb-6">
              {brandReady ? (
                <>
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.65rem]">
                    {title}
                  </h1>
                  {description ? (
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {description}
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="space-y-2" aria-hidden>
                  <div className="h-8 w-48 rounded bg-muted" />
                  <div className="h-4 w-full rounded bg-muted/80" />
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border/80 bg-card/80 p-5 shadow-sm backdrop-blur-sm sm:p-6">
              {children}
            </div>

            {footer && brandReady ? (
              <div className="mt-5 text-center text-sm text-muted-foreground">
                {footer}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  name,
  autoComplete,
  required,
  minLength,
  disabled,
  placeholder,
}: {
  id: string;
  label: string;
  value?: string;
  onChange?: (v: string) => void;
  name?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-foreground"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          {...(onChange != null
            ? { value: value ?? "", onChange: (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value) }
            : {})}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          disabled={disabled}
          placeholder={placeholder}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-1 pr-10 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="button"
          tabIndex={-1}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
