import { Checkbox } from "@/components/ui/checkbox";
import { EFFORT_UNITS, type EffortUnit } from "@/lib/resource-capacity";

/** Mutually exclusive Hours / Days / Weeks checkboxes. */
export function EffortUnitCheckboxes({
  value,
  onChange,
}: {
  value: EffortUnit;
  onChange: (next: EffortUnit) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <span className="font-medium text-muted-foreground">Show as</span>
      {EFFORT_UNITS.map((u) => (
        <label key={u.id} className="inline-flex cursor-pointer items-center gap-1.5">
          <Checkbox checked={value === u.id} onCheckedChange={() => onChange(u.id)} />
          {u.label}
        </label>
      ))}
      <span className="text-muted-foreground">(8h day · 5-day week)</span>
    </div>
  );
}
