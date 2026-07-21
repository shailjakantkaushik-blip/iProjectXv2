import { Link } from "@tanstack/react-router";
import { useState, type ChangeEvent, type ReactNode } from "react";
import { ArrowLeft, BarChart3, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export type AuthBrand = {
  name: string;
  logo_url?: string;
  tagline?: string;
};

export type AuthOrgBrand = {
  name: string;
  logo_url?: string;
  slug?: string;
} | null;

type AuthLayoutProps = {
  platform: AuthBrand;
  org?: AuthOrgBrand;
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
}: {
  name: string;
  logoUrl?: string;
  size?: "sm" | "md" | "lg";
}) {
  const box =
    size === "lg" ? "h-12 w-12" : size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const icon = size === "lg" ? "h-6 w-6" : size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const img =
    size === "lg"
      ? "h-10 max-w-[160px]"
      : size === "sm"
        ? "h-7 max-w-[120px]"
        : "h-9 max-w-[140px]";

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${name} logo`}
        className={cn("w-auto object-contain", img)}
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
  title,
  description,
  children,
  footer,
  className,
}: AuthLayoutProps) {
  const displayName = org?.name || platform.name;
  const displayLogo = org?.logo_url || platform.logo_url;
  const tagline = platform.tagline || "Enterprise PMO Command Center";

  return (
    <div className={cn("flex min-h-screen bg-background", className)}>
      {/* Brand panel — desktop */}
      <aside
        className="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden px-10 py-10 lg:flex xl:w-[46%]"
        style={{
          background:
            "linear-gradient(165deg, color-mix(in srgb, var(--primary) 88%, #0f1b3d) 0%, color-mix(in srgb, var(--primary) 42%, #0f1b3d) 48%, #0b1428 100%)",
          color: "var(--primary-foreground)",
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
          <div className="flex items-center gap-3">
            <LogoMark name={displayName} logoUrl={displayLogo} size="lg" />
            <div className="min-w-0">
              <div className="truncate text-2xl font-semibold tracking-tight text-white">
                {displayName}
              </div>
              {org ? (
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-white/70">
                  <span>powered by</span>
                  <span className="font-medium text-white/90">{platform.name}</span>
                </div>
              ) : (
                <div className="mt-0.5 text-sm text-white/75">{tagline}</div>
              )}
            </div>
          </div>
          <p className="max-w-sm text-base leading-relaxed text-white/80">
            {org
              ? `Sign in to ${org.name} to manage portfolio delivery, governance, and financials.`
              : "Sign in to your portfolio cockpit — projects, gates, risk, and financials in one place."}
          </p>
        </div>

        <div className="relative z-10 text-xs text-white/55">
          {platform.name} · Secure access
        </div>
      </aside>

      {/* Form panel */}
      <div className="relative flex min-h-screen flex-1 flex-col">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 100% 0%, color-mix(in srgb, var(--primary) 12%, transparent), transparent 55%), radial-gradient(ellipse 50% 40% at 0% 100%, color-mix(in srgb, var(--secondary) 70%, transparent), transparent 50%)",
          }}
        />

        <div className="relative z-10 flex items-center justify-between border-b border-border/60 px-4 py-3 lg:hidden">
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <LogoMark name={displayName} logoUrl={displayLogo} size="sm" />
            <span className="truncate text-sm font-semibold text-foreground">
              {displayName}
            </span>
          </Link>
          <Link
            to="/"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Home
          </Link>
        </div>

        <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
          <div className="w-full max-w-[400px] animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
            {org && (
              <div className="mb-5 hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
                <span>Organization</span>
                <span className="font-medium text-foreground">{org.name}</span>
              </div>
            )}

            <div className="mb-6">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.65rem]">
                {title}
              </h1>
              {description ? (
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-border/80 bg-card/80 p-5 shadow-sm backdrop-blur-sm sm:p-6">
              {children}
            </div>

            {footer ? (
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
