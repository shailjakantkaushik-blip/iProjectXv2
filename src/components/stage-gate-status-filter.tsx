import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  GATE_APPROVAL_STATUSES,
  gateStatusFilterActive,
  type GateStatusFilter,
} from "@/lib/stage-gate-approval";
import { cn } from "@/lib/utils";

/**
 * Nested multi-select: Stage gate ▸ statuses.
 * Empty statuses for a gate means that gate is not filtering.
 */
export function StageGateStatusFilter({
  gateNames,
  value,
  onChange,
  triggerClassName,
}: {
  gateNames: string[];
  value: GateStatusFilter;
  onChange: (next: GateStatusFilter) => void;
  triggerClassName?: string;
}) {
  const names = gateNames.filter(Boolean);
  if (!names.length) return null;

  const activeCount = names.filter((n) => (value[n] || []).length > 0).length;
  const selectedStatusCount = Object.values(value).reduce(
    (n, statuses) => n + (statuses?.length || 0),
    0,
  );

  const toggle = (gate: string, status: string) => {
    const cur = new Set(value[gate] || []);
    if (cur.has(status)) cur.delete(status);
    else cur.add(status);
    const next = { ...value, [gate]: Array.from(cur) };
    if (!next[gate].length) delete next[gate];
    onChange(next);
  };

  const setGateStatuses = (gate: string, statuses: string[]) => {
    const next = { ...value };
    if (!statuses.length) delete next[gate];
    else next[gate] = statuses;
    onChange(next);
  };

  const label =
    activeCount === 0
      ? "Stage gate: All"
      : activeCount === 1
        ? `Stage gate: ${names.find((n) => (value[n] || []).length) || "1"}`
        : `Stage gate: ${activeCount} gates`;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "ui-btn h-8 rounded-md border border-border bg-surface px-2 text-[12px] shadow-sm hover:bg-muted",
            gateStatusFilterActive(value) && "border-primary bg-primary/10 text-primary",
            triggerClassName,
          )}
          aria-label="Stage gate approval filter"
        >
          {label}
          {selectedStatusCount > 0 ? ` · ${selectedStatusCount}` : ""} ▾
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[80] w-64" collisionPadding={8}>
        <DropdownMenuLabel className="text-xs font-semibold">
          Stage gate
          <span className="mt-0.5 block font-normal text-muted-foreground">
            Open a gate, then multi-select approval statuses.
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {names.map((name) => {
          const selected = value[name] || [];
          const allOn = GATE_APPROVAL_STATUSES.every((s) => selected.includes(s));
          return (
            <DropdownMenuSub key={name}>
              <DropdownMenuSubTrigger className="text-xs">
                <span className="min-w-0 flex-1 truncate">{name}</span>
                {selected.length ? (
                  <span className="mr-1 shrink-0 text-[10px] font-semibold text-primary">
                    {selected.length}
                  </span>
                ) : null}
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="z-[90] w-52" collisionPadding={8}>
                  <DropdownMenuLabel className="text-xs font-semibold">{name}</DropdownMenuLabel>
                  <DropdownMenuCheckboxItem
                    className="text-xs"
                    checked={allOn}
                    onCheckedChange={() =>
                      setGateStatuses(name, allOn ? [] : [...GATE_APPROVAL_STATUSES])
                    }
                    onSelect={(e) => e.preventDefault()}
                  >
                    All statuses
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  {GATE_APPROVAL_STATUSES.map((status) => (
                    <DropdownMenuCheckboxItem
                      key={status}
                      className="text-xs"
                      checked={selected.includes(status)}
                      onCheckedChange={() => toggle(name, status)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {status}
                    </DropdownMenuCheckboxItem>
                  ))}
                  {selected.length ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-xs text-muted-foreground"
                        onSelect={(e) => {
                          e.preventDefault();
                          setGateStatuses(name, []);
                        }}
                      >
                        Clear {name}
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          );
        })}
        {gateStatusFilterActive(value) ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs text-muted-foreground" onSelect={() => onChange({})}>
              Clear all stage gates
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
