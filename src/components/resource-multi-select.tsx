import { Check, ChevronsUpDown, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type ResourceOption = {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
  user_id?: string | null;
  status?: string | null;
};

type Props = {
  resources: ResourceOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

function resourceLabel(r: ResourceOption) {
  return r.name?.trim() || r.email || r.id.slice(0, 8);
}

/** Searchable multi-select for org resources (work-item team assignment). */
export function ResourceMultiSelect({
  resources,
  value,
  onChange,
  placeholder = "Select resources…",
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => new Set(value), [value]);
  const byId = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  const label =
    value.length === 0
      ? placeholder
      : value.length <= 2
        ? value
            .map((id) => resourceLabel(byId.get(id) || { id, name: id.slice(0, 8) }))
            .join(", ")
        : `${value.length} selected`;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="h-auto min-h-9 w-full justify-between px-3 py-1.5 text-left text-xs font-normal"
          >
            <span className={cn("truncate", value.length === 0 && "text-muted-foreground")}>
              {label}
            </span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(100vw-2rem,22rem)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search resources…" className="h-9" />
            <CommandList>
              <CommandEmpty>No matching resources.</CommandEmpty>
              <CommandGroup>
                {resources.map((r) => {
                  const checked = selected.has(r.id);
                  return (
                    <CommandItem
                      key={r.id}
                      value={`${resourceLabel(r)} ${r.email || ""} ${r.role || ""}`}
                      onSelect={() => toggle(r.id)}
                    >
                      <Check
                        className={cn("mr-2 h-3.5 w-3.5", checked ? "opacity-100" : "opacity-0")}
                      />
                      <span className="truncate">{resourceLabel(r)}</span>
                      <span className="ml-auto truncate pl-2 text-[10px] text-muted-foreground">
                        {[r.role, r.user_id ? "linked" : "no login"].filter(Boolean).join(" · ")}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((id) => {
            const r = byId.get(id);
            return (
              <button
                key={id}
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px]"
                onClick={() => toggle(id)}
                disabled={disabled}
              >
                {resourceLabel(r || { id, name: id.slice(0, 8) })}
                <X className="h-3 w-3 opacity-60" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
