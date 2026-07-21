import { useState, type ReactNode } from "react";
import {
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Plus,
  Trash2,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_NAV_GROUPS,
  addNavGroup,
  defaultNavigationConfig,
  flattenNavItems,
  mergeNavigationConfig,
  moveInList,
  moveItemToGroup,
  removeNavGroup,
  renameNavGroup,
  type NavGroupDef,
  type NavigationConfig,
} from "@/lib/navigation-config";
import { cn } from "@/lib/utils";

type Props = {
  value: NavigationConfig;
  onChange: (next: NavigationConfig) => void;
  /** Limit editor to these groups (defaults to full platform catalog). */
  catalog?: NavGroupDef[];
  /**
   * Platform admin: add/remove/rename section headers and move items between sections.
   * Org admin editors keep reorder + hide only unless enabled.
   */
  structureEditable?: boolean;
};

export function NavSequenceEditor({
  value,
  onChange,
  catalog = DEFAULT_NAV_GROUPS,
  structureEditable = false,
}: Props) {
  const nav = mergeNavigationConfig(value, catalog);
  const allItems = flattenNavItems(catalog);
  const catalogHeadings = new Set(catalog.map((g) => g.heading));
  const allowPlatform = catalogHeadings.has("Platform");

  const groupOrder = (() => {
    const cleaned = nav.group_order.filter((h) => allowPlatform || h !== "Platform");
    for (const g of catalog) {
      if (!cleaned.includes(g.heading)) cleaned.push(g.heading);
    }
    return cleaned;
  })();

  const hidden = new Set(nav.hidden);
  const [newSection, setNewSection] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

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

  const addSection = () => {
    const name = newSection.trim();
    if (!allowPlatform && /^platform$/i.test(name)) return;
    const next = addNavGroup(nav, name);
    if (next === nav) return;
    onChange(next);
    setNewSection("");
  };

  const startRename = (heading: string) => {
    setRenaming(heading);
    setRenameValue(heading);
  };

  const commitRename = () => {
    if (!renaming) return;
    const name = renameValue.trim();
    if (!allowPlatform && /^platform$/i.test(name)) return;
    onChange(renameNavGroup(nav, renaming, name));
    setRenaming(null);
    setRenameValue("");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {structureEditable
            ? "Add or remove section headers, move links between sections, reorder, and hide items."
            : "Reorder sidebar groups and items. Hidden items stay reachable by URL if authorized."}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset to default
        </Button>
      </div>

      {structureEditable && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed px-3 py-3">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              New section header
            </label>
            <Input
              value={newSection}
              onChange={(e) => setNewSection(e.target.value)}
              placeholder="e.g. Reports"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSection();
                }
              }}
            />
          </div>
          <Button type="button" size="sm" onClick={addSection} disabled={!newSection.trim()}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add section
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Section sequence
        </div>
        {groupOrder.map((heading, gi) => (
          <div
            key={heading}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-border/80 bg-surface/80 px-3 py-2"
          >
            {renaming === heading ? (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="h-8"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                />
                <Button type="button" size="sm" onClick={commitRename}>
                  Save
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <span className="min-w-0 flex-1 text-sm font-medium">{heading}</span>
            )}
            {structureEditable && renaming !== heading && (
              <>
                <IconBtn label={`Rename ${heading}`} onClick={() => startRename(heading)}>
                  <Pencil className="h-4 w-4" />
                </IconBtn>
                <IconBtn
                  label={`Remove ${heading}`}
                  disabled={groupOrder.length <= 1 || heading === "Platform"}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Remove section “${heading}”? Its links move to the previous section.`,
                      )
                    ) {
                      return;
                    }
                    const fallback = groupOrder[gi - 1] ?? groupOrder[gi + 1];
                    onChange(removeNavGroup(nav, heading, fallback));
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </IconBtn>
              </>
            )}
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
        const order = (() => {
          const base = nav.item_order[heading] ?? [];
          return base.filter((p) => allItems.has(p));
        })();

        return (
          <div key={heading} className="rounded-xl border border-border/80 bg-secondary/20 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {heading} · {order.length} item{order.length === 1 ? "" : "s"}
            </div>
            {order.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Empty section — move links here from another section
                {structureEditable ? " or leave it as a reserved header." : "."}
              </p>
            ) : (
              <div className="space-y-1.5">
                {order.map((path, ii) => {
                  const item = allItems.get(path);
                  if (!item) return null;
                  const isHidden = hidden.has(path);
                  return (
                    <div
                      key={path}
                      className={cn(
                        "flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors",
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
                      {structureEditable && (
                        <Select
                          value={heading}
                          onValueChange={(to) => {
                            if (to !== heading) onChange(moveItemToGroup(nav, path, heading, to));
                          }}
                        >
                          <SelectTrigger className="h-8 w-[140px] text-xs">
                            <SelectValue placeholder="Move to…" />
                          </SelectTrigger>
                          <SelectContent>
                            {groupOrder.map((h) => (
                              <SelectItem key={h} value={h}>
                                {h}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
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
            )}
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
