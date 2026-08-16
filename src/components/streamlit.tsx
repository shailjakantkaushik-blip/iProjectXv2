import { lazy, Suspense, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePageDownloadAllowed } from "@/lib/page-download";
import { ExplainThis } from "@/components/explain-this";
import type { MetricExplanation } from "@/lib/explain-metric";

/** Lazy so PPT/PDF/Excel export code is never on the cold-reload critical path. */
const DownloadMenu = lazy(async () => {
  const mod = await import("@/components/page-export");
  return { default: mod.DownloadMenu };
});

/* Streamlit visual primitives — thin wrappers over CSS classes in styles.css */

export function SectionFrame({
  children,
  className,
  id,
  exportName,
  exportTitle,
  exportable = true,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  exportName?: string;
  exportTitle?: string;
  exportable?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const name = exportName ?? id ?? "section";
  const pageDownloadOk = usePageDownloadAllowed();
  const showExport = exportable && pageDownloadOk;
  return (
    <div id={id} ref={ref} className={cn("section-frame relative group", className)}>
      {showExport && (
        <div className="absolute right-2 top-2 z-10 opacity-100 transition-opacity print:hidden md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
          <Suspense fallback={null}>
            <DownloadMenu targetRef={ref} name={name} title={exportTitle} label="" variant="ghost" />
          </Suspense>
        </div>
      )}
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="section-title">{children}</div>;
}

export function PageHeading({
  icon,
  children,
  title,
  subtitle,
  actions,
}: {
  icon?: string;
  children?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="page-heading">
          {icon && <span className="shrink-0">{icon}</span>}
          <span className="truncate">{title ?? children}</span>
        </h1>
        {subtitle && <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>}
      </div>
      {actions && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
          {actions}
        </div>
      )}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  sub,
  accent,
  explain,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
  /** Optional "Explain This" drivers for the KPI value. */
  explain?: MetricExplanation | null;
}) {
  return (
    <div
      className="kpi-card"
      style={accent ? { borderTopColor: accent, borderTopWidth: 3 } : undefined}
    >
      <div className="kpi-head">
        <div className="kpi-label">{label}</div>
        {explain ? <ExplainThis explanation={explain} size="xs" /> : null}
      </div>
      <div className="kpi-value" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function RagChip({
  rag,
  label,
  explain,
}: {
  rag?: string | null;
  label?: ReactNode;
  /** Same Explain control used on financial KPIs — why this colour, with band logic. */
  explain?: MetricExplanation | null;
}) {
  const v = (rag || "").toLowerCase();
  const cls =
    v === "green" ? "rag-green" : v === "amber" ? "rag-amber" : v === "red" ? "rag-red" : "";
  if (!cls) return <span className="text-xs text-muted-foreground">—</span>;
  const chip = <span className={`rag-chip ${cls}`}>{label ?? rag}</span>;
  if (!explain) return chip;
  return (
    <span className="inline-flex items-center gap-1">
      {chip}
      <ExplainThis explanation={explain} size="xs" />
    </span>
  );
}

export function ComingSoon({ page, notes }: { page: string; notes?: string }) {
  return (
    <div>
      <PageHeading>{page}</PageHeading>
      <div className="mb-4 text-sm text-muted-foreground">
        Mirrors the Streamlit page. Being ported in the next phase.
      </div>
      <SectionFrame>
        <SectionTitle>Preview</SectionTitle>
        <div className="py-12 text-center text-sm text-muted-foreground">
          {notes ??
            "This page is scheduled in the port. The Streamlit equivalent's logic and visuals will be reproduced here."}
        </div>
      </SectionFrame>
    </div>
  );
}
