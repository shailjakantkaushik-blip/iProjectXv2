import { SectionFrame, SectionTitle } from "@/components/streamlit";

export type ColumnGlossaryItem = {
  name: string;
  description: string;
};

/** End-of-page reference for register / sheet column headers. */
export function ColumnGlossary({
  title = "Column reference",
  subtitle = "What each column means on this page.",
  items,
}: {
  title?: string;
  subtitle?: string;
  items: ColumnGlossaryItem[];
}) {
  if (!items.length) return null;
  return (
    <SectionFrame>
      <SectionTitle>{title}</SectionTitle>
      {subtitle ? <p className="mb-3 text-[11px] text-muted-foreground">{subtitle}</p> : null}
      <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.name} className="min-w-0 border-b border-border/60 pb-2 last:border-b-0 sm:last:border-b">
            <dt className="text-xs font-semibold text-foreground">{item.name}</dt>
            <dd className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{item.description}</dd>
          </div>
        ))}
      </dl>
    </SectionFrame>
  );
}
