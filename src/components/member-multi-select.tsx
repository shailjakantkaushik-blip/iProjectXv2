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
import { memberLabel, type OrgMember } from "@/lib/decision-approval";

type Props = {
  members: OrgMember[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

/** Searchable multi-select for org members / work-item team assignment. */
export function MemberMultiSelect({
  members,
  value,
  onChange,
  placeholder = "Select team members…",
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => new Set(value), [value]);
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

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
        ? value.map((id) => memberLabel(byId.get(id) || { id, full_name: null, email: null })).join(", ")
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
            <CommandInput placeholder="Search people…" className="h-9" />
            <CommandList>
              <CommandEmpty>No matching people.</CommandEmpty>
              <CommandGroup>
                {members.map((m) => {
                  const checked = selected.has(m.id);
                  return (
                    <CommandItem
                      key={m.id}
                      value={`${memberLabel(m)} ${m.email || ""}`}
                      onSelect={() => toggle(m.id)}
                    >
                      <Check
                        className={cn("mr-2 h-3.5 w-3.5", checked ? "opacity-100" : "opacity-0")}
                      />
                      <span className="truncate">{memberLabel(m)}</span>
                      {m.email ? (
                        <span className="ml-auto truncate pl-2 text-[10px] text-muted-foreground">
                          {m.email}
                        </span>
                      ) : null}
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
            const m = byId.get(id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px]"
              >
                {memberLabel(m || { id, full_name: null, email: null })}
                {!disabled && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Remove"
                    onClick={() => toggle(id)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
