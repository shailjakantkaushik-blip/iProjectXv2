import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
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
  buildMethodGateGroups,
  gateStatusFilterActive,
  methodGateFilterKey,
  type GateStatusFilter,
  type MethodGateGroup,
} from "@/lib/stage-gate-approval";
import {
  deliveryMethodsQueryKey,
  fetchDeliveryMethods,
} from "@/lib/delivery-methods";
import { cn } from "@/lib/utils";

/**
 * Nested multi-select: Delivery method ▸ stage gate ▸ status.
 * Empty statuses for a gate means that gate is not filtering.
 */
export function StageGateStatusFilter({
  gateNames,
  methods: methodsProp,
  value,
  onChange,
  triggerClassName,
}: {
  gateNames?: string[];
  methods?: MethodGateGroup[];
  value: GateStatusFilter;
  onChange: (next: GateStatusFilter) => void;
  triggerClassName?: string;
}) {
  const { organization } = useAuth();
  const orgId = organization?.id;

  const { data: fetchedMethods = [], isFetched } = useQuery({
    queryKey: deliveryMethodsQueryKey(orgId),
    queryFn: () => fetchDeliveryMethods(orgId!, { activeOnly: true }),
    enabled: !!orgId && !methodsProp?.length,
  });

  const { data: defs = [] } = useQuery({
    queryKey: ["stage_gate_definitions", orgId],
    queryFn: async () =>
      (
        await supabase
          .from("stage_gate_definitions")
          .select("gate_name,delivery_method_id,sort_order")
          .eq("org_id", orgId!)
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
      ).data ?? [],
    enabled: !!orgId && !methodsProp?.length,
  });

  const groups = useMemo(() => {
    if (methodsProp?.length) return methodsProp;
    if (orgId && !methodsProp?.length && !isFetched) return [];
    const built = buildMethodGateGroups(fetchedMethods, defs as never);
    if (built.length) return built;
    const names = (gateNames || []).filter(Boolean);
    if (!names.length) return [];
    return [
      {
        methodId: "",
        methodName: "Stage gates",
        methodCode: "",
        gateNames: names,
      },
    ];
  }, [methodsProp, fetchedMethods, defs, gateNames, orgId, isFetched]);

  if (!groups.length) return null;

  const selectedStatusCount = Object.values(value).reduce(
    (n, statuses) => n + (statuses?.length || 0),
    0,
  );
  const activeMethods = groups.filter((g) =>
    g.gateNames.some((name) => (value[methodGateFilterKey(g.methodId, name)] || []).length > 0),
  );

  const toggle = (methodId: string, gate: string, status: string) => {
    const key = methodGateFilterKey(methodId, gate);
    const cur = new Set(value[key] || []);
    if (cur.has(status)) cur.delete(status);
    else cur.add(status);
    const next = { ...value, [key]: Array.from(cur) };
    if (!next[key].length) delete next[key];
    onChange(next);
  };

  const setGateStatuses = (methodId: string, gate: string, statuses: string[]) => {
    const key = methodGateFilterKey(methodId, gate);
    const next = { ...value };
    if (!statuses.length) delete next[key];
    else next[key] = statuses;
    onChange(next);
  };

  const clearMethod = (group: MethodGateGroup) => {
    const next = { ...value };
    for (const name of group.gateNames) {
      delete next[methodGateFilterKey(group.methodId, name)];
    }
    onChange(next);
  };

  const firstActive = (() => {
    for (const g of groups) {
      for (const name of g.gateNames) {
        const key = methodGateFilterKey(g.methodId, name);
        if ((value[key] || []).length) {
          return g.methodId ? `${g.methodName} · ${name}` : name;
        }
      }
    }
    return "";
  })();

  const label =
    selectedStatusCount === 0
      ? "Stage gate: All"
      : activeMethods.length === 1 && firstActive
        ? `Stage gate: ${firstActive}`
        : `Stage gate: ${activeMethods.length} methods`;

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
          Delivery method
          <span className="mt-0.5 block font-normal text-muted-foreground">
            Method → stage gate → approval status.
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {groups.map((group) => {
          const methodCount = group.gateNames.reduce(
            (n, name) => n + (value[methodGateFilterKey(group.methodId, name)] || []).length,
            0,
          );
          return (
            <DropdownMenuSub key={group.methodId || group.methodName}>
              <DropdownMenuSubTrigger className="text-xs">
                <span className="min-w-0 flex-1 truncate">{group.methodName}</span>
                {methodCount ? (
                  <span className="mr-1 shrink-0 text-[10px] font-semibold text-primary">
                    {methodCount}
                  </span>
                ) : null}
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="z-[90] w-60" collisionPadding={8}>
                  <DropdownMenuLabel className="text-xs font-semibold">
                    {group.methodName}
                    <span className="mt-0.5 block font-normal text-muted-foreground">
                      Stage gates
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {group.gateNames.map((name) => {
                    const key = methodGateFilterKey(group.methodId, name);
                    const selected = value[key] || [];
                    const allOn = GATE_APPROVAL_STATUSES.every((s) => selected.includes(s));
                    return (
                      <DropdownMenuSub key={key || name}>
                        <DropdownMenuSubTrigger className="text-xs">
                          <span className="min-w-0 flex-1 truncate">{name}</span>
                          {selected.length ? (
                            <span className="mr-1 shrink-0 text-[10px] font-semibold text-primary">
                              {selected.length}
                            </span>
                          ) : null}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent className="z-[100] w-52" collisionPadding={8}>
                            <DropdownMenuLabel className="text-xs font-semibold">
                              {name}
                            </DropdownMenuLabel>
                            <DropdownMenuCheckboxItem
                              className="text-xs"
                              checked={allOn}
                              onCheckedChange={() =>
                                setGateStatuses(
                                  group.methodId,
                                  name,
                                  allOn ? [] : [...GATE_APPROVAL_STATUSES],
                                )
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
                                onCheckedChange={() => toggle(group.methodId, name, status)}
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
                                    setGateStatuses(group.methodId, name, []);
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
                  {methodCount ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-xs text-muted-foreground"
                        onSelect={(e) => {
                          e.preventDefault();
                          clearMethod(group);
                        }}
                      >
                        Clear {group.methodName}
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