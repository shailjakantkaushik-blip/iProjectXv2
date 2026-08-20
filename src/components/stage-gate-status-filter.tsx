import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  GATE_APPROVAL_STATUSES,
  gateStatusFilterActive,
  type GateStatusFilter,
} from "@/lib/stage-gate-approval";
import { cn } from "@/lib/utils";

export function StageGateStatusFilter({
  gateNames,
  value,
  onChange,
}: {
  gateNames: string[];
  value: GateStatusFilter;
  onChange: (next: GateStatusFilter) => void;
}) {
  const names = gateNames.filter(Boolean);
  if (!names.length) return null;

  const toggle = (gate: string, status: string) => {
    const cur = new Set(value[gate] || []);
    if (cur.has(status)) cur.delete(status);
    else cur.add(status);
    const next = { ...value, [gate]: Array.from(cur) };
    if (!next[gate].length) delete next[gate];
    onChange(next);
  };

  const clearGate = (gate: string) => {
    const next = { ...value };
    delete next[gate];
    onChange(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-semibold text-muted-foreground">Stage gate</span>
      {names.map((name) => {
        const selected = value[name] || [];
        const on = selected.length > 0;
        return (
          <HoverCard key={name} openDelay={120} closeDelay={160}>
            <HoverCardTrigger asChild>
              <button
                type="button"
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  on
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-surface text-foreground hover:bg-muted",
                )}
              >
                {name}
                {on ? ` · ${selected.length}` : ""}
              </button>
            </HoverCardTrigger>
            <HoverCardContent className="z-[80] w-56 p-3" align="start" side="bottom">
              <div className="mb-2 text-xs font-semibold">
                {name} — status
                <span className="mt-0.5 block font-normal text-muted-foreground">
                  Multi-select. Empty means this gate is not filtering.
                </span>
              </div>
              <div className="space-y-1.5">
                {GATE_APPROVAL_STATUSES.map((status) => (
                  <label key={status} className="flex cursor-pointer items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      checked={selected.includes(status)}
                      onChange={() => toggle(name, status)}
                    />
                    {status}
                  </label>
                ))}
              </div>
              {on ? (
                <button
                  type="button"
                  className="mt-2 text-[11px] text-muted-foreground hover:underline"
                  onClick={() => clearGate(name)}
                >
                  Clear {name}
                </button>
              ) : null}
            </HoverCardContent>
          </HoverCard>
        );
      })}
      {gateStatusFilterActive(value) ? (
        <button
          type="button"
          className="text-[11px] text-muted-foreground hover:underline"
          onClick={() => onChange({})}
        >
          Clear gates
        </button>
      ) : null}
    </div>
  );
}
