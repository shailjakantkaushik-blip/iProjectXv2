import { cn } from "@/lib/utils";

export type ChartLegendItem = {
  name: string;
  value?: number | string;
  color: string;
  /** Optional secondary label, e.g. "3 (18%)" */
  detail?: string;
};

/**
 * HTML legend that wraps cleanly inside chart cards.
 * Prefer this over Recharts <Legend> for pie/donut charts with many slices —
 * Recharts positions legends absolutely and they overflow fixed-height boxes.
 */
export function ChartLegendList({
  items,
  className,
  columns = "auto",
}: {
  items: ChartLegendItem[];
  className?: string;
  /** Force column count; default adapts to item count */
  columns?: 1 | 2 | 3 | "auto";
}) {
  if (!items.length) return null;

  const cols =
    columns === "auto"
      ? items.length <= 3
        ? "grid-cols-1"
        : items.length <= 8
          ? "grid-cols-2"
          : "grid-cols-2 sm:grid-cols-3"
      : columns === 1
        ? "grid-cols-1"
        : columns === 2
          ? "grid-cols-2"
          : "grid-cols-2 sm:grid-cols-3";

  return (
    <ul
      className={cn(
        "mt-2 grid gap-x-3 gap-y-1.5 px-0.5",
        cols,
        className,
      )}
    >
      {items.map((item) => (
        <li
          key={item.name}
          className="flex min-w-0 items-center gap-1.5 text-[11px] leading-tight text-foreground"
          title={
            item.detail
              ? `${item.name} ${item.detail}`
              : item.value != null
                ? `${item.name} ${item.value}`
                : item.name
          }
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: item.color }}
            aria-hidden
          />
          <span className="min-w-0 truncate font-medium">{item.name}</span>
          {(item.detail != null || item.value != null) && (
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {item.detail ?? item.value}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function legendItemsFromCounts(
  data: { name: string; value: number }[],
  colors: string[] | Record<string, string>,
  opts?: { showPercent?: boolean },
): ChartLegendItem[] {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return data.map((d, i) => {
    const color = Array.isArray(colors)
      ? colors[i % colors.length]
      : colors[d.name] || "#64748b";
    const pct = Math.round((d.value / total) * 100);
    return {
      name: d.name,
      value: d.value,
      color,
      detail: opts?.showPercent === false ? String(d.value) : `${d.value} (${pct}%)`,
    };
  });
}
