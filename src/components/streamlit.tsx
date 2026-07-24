import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DownloadMenu } from "@/components/page-export";

/* Streamlit visual primitives — thin wrappers over CSS classes in styles.css */

export function SectionFrame({
  children, className, id, exportName, exportTitle, exportable = true,
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
  return (
    <div id={id} ref={ref} className={cn("section-frame relative group", className)}>
      {exportable && (
        <div className="absolute right-2 top-2 z-10 opacity-100 transition-opacity print:hidden md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
          <DownloadMenu targetRef={ref} name={name} title={exportTitle} label="" variant="ghost" />
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
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="kpi-card min-w-0" style={accent ? { borderTopColor: accent, borderTopWidth: 3 } : undefined}>
      <div className="kpi-label truncate">{label}</div>
      <div className="kpi-value break-words" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="mt-1 text-[11px] text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}

export function RagChip({ rag, label }: { rag?: string | null; label?: ReactNode }) {
  const v = (rag || "").toLowerCase();
  const cls = v === "green" ? "rag-green" : v === "amber" ? "rag-amber" : v === "red" ? "rag-red" : "";
  if (!cls) return <span className="text-xs text-muted-foreground">—</span>;
  return <span className={`rag-chip ${cls}`}>{label ?? rag}</span>;
}

export function ComingSoon({ page, notes }: { page: string; notes?: string }) {
  return (
    <div>
      <PageHeading>{page}</PageHeading>
      <div className="text-sm text-muted-foreground mb-4">
        Mirrors the Streamlit page. Being ported in the next phase.
      </div>
      <SectionFrame>
        <SectionTitle>Preview</SectionTitle>
        <div className="py-12 text-center text-sm text-muted-foreground">
          {notes ?? "This page is scheduled in the port. The Streamlit equivalent's logic and visuals will be reproduced here."}
        </div>
      </SectionFrame>
    </div>
  );
}
