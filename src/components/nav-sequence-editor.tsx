import { useState, type ReactNode } from "react";
import { Eye, EyeOff, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_NAV_GROUPS,
  defaultNavigationConfig,
  mergeNavigationConfig,
  moveInList,
  type NavGroupDef,
  type NavigationConfig,
} from "@/lib/navigation-config";
import { cn } from "@/lib/utils";

type Props = {
  value: NavigationConfig;
  onChange: (next: NavigationConfig) => void;
  /** Limit editor to these groups (defaults to full platform catalog). */
  catalog?: NavGroupDef[];
};

export function NavSequenceEditor({
  value,
  onChange,
  catalog = DEFAULT_NAV_GROUPS,
}: Props) {
  const nav = mergeNavigationConfig(value, catalog);
  const groupOrder = (() => {
    const known = new Set(catalog.map((g) => g.heading));
    const ordered = nav.group_order.filter((h) => known.has(h));
    for (const g of catalog) if (!ordered.includes(g.heading)) ordered.push(g.heading);
    return ordered;
  })();

  const hidden = new Set(nav.hidden);

  const setGroups = (group_order: string[]) => onChange({ ...nav, group_order });

  const setItemOrder = (heading: string, paths: string[]) =>
    onChange({
      ...nav,
      item_order: { ...nav.item_order, [heading]: paths },
    });

  const toggleHidden = (path: string) => {
    const next = new Set(hidden);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    onChange({ ...nav, hidden: Array.from(next) });
  };

  const reset = () => onChange(defaultNavigationConfig(catalog));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Reorder sidebar groups and items. Hidden items stay reachable by URL if the user is
          authorized.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset to default
        </Button>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Group sequence
        </div>
        {groupOrder.map((heading, gi) => (
          <div
            key={heading}
            className="flex items-center gap-2 rounded-lg border border-border/80 bg-surface/80 px-3 py-2"
          >
            <span className="min-w-0 flex-1 text-sm font-medium">{heading}</span>
            <IconBtn
              label={`Move ${heading} up`}
              disabled={gi === 0}
              onClick={() => setGroups(moveInList(groupOrder, gi, -1))}
            >
              <ChevronUp className="h-4 w-4" />
            </IconBtn>
            <IconBtn
              label={`Move ${heading} down`}
              disabled={gi === groupOrder.length - 1}
              onClick={() => setGroups(moveInList(groupOrder, gi, 1))}
            >
              <ChevronDown className="h-4 w-4" />
            </IconBtn>
          </div>
        ))}
      </div>

      {groupOrder.map((heading) => {
        const group = catalog.find((g) => g.heading === heading);
        if (!group) return null;
        const order = (() => {
          const base = nav.item_order[heading] ?? group.items.map((i) => i.to);
          const known = new Set(group.items.map((i) => i.to));
          const ordered = base.filter((p) => known.has(p));
          for (const i of group.items) if (!ordered.includes(i.to)) ordered.push(i.to);
          return ordered;
        })();
        const byPath = new Map(group.items.map((i) => [i.to, i]));

        return (
          <div key={heading} className="rounded-xl border border-border/80 bg-secondary/20 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {heading} items
            </div>
            <div className="space-y-1.5">
              {order.map((path, ii) => {
                const item = byPath.get(path);
                if (!item) return null;
                const isHidden = hidden.has(path);
                return (
                  <div
                    key={path}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors",
                      isHidden
                        ? "border-dashed border-border/60 bg-muted/30 opacity-60"
                        : "border-border/70 bg-surface",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{item.label}</div>
                      <div className="truncate font-mono text-[10px] text-muted-foreground">
                        {path}
                      </div>
                    </div>
                    <IconBtn
                      label={isHidden ? `Show ${item.label}` : `Hide ${item.label}`}
                      onClick={() => toggleHidden(path)}
                    >
                      {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </IconBtn>
                    <IconBtn
                      label={`Move ${item.label} up`}
                      disabled={ii === 0}
                      onClick={() => setItemOrder(heading, moveInList(order, ii, -1))}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn
                      label={`Move ${item.label} down`}
                      disabled={ii === order.length - 1}
                      onClick={() => setItemOrder(heading, moveInList(order, ii, 1))}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </IconBtn>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  disabled,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}
