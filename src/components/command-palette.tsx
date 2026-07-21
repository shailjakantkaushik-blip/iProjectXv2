import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import type { NavGroupDef } from "@/lib/navigation-config";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: NavGroupDef[];
};

export function CommandPalette({ open, onOpenChange, groups }: Props) {
  const navigate = useNavigate();
  const flat = useMemo(
    () =>
      groups.flatMap((g) =>
        g.items.map((i) => ({
          ...i,
          group: g.heading,
        })),
      ),
    [groups],
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Jump to a page… (type to filter)" />
      <CommandList>
        <CommandEmpty>No matching pages.</CommandEmpty>
        {groups.map((g) => {
          const items = flat.filter((i) => i.group === g.heading);
          if (!items.length) return null;
          return (
            <CommandGroup key={g.heading} heading={g.heading}>
              {items.map((item) => (
                <CommandItem
                  key={item.to}
                  value={`${item.label} ${item.to} ${g.heading}`}
                  onSelect={() => {
                    onOpenChange(false);
                    void navigate({ to: item.to as any });
                  }}
                >
                  <span className="truncate">{item.label}</span>
                  <CommandShortcut className="hidden sm:inline">{item.to}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}

/** Global ⌘K / Ctrl+K listener helper. */
export function useCommandPaletteHotkey(onOpen: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen]);
}
