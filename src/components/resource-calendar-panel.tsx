import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isAdmin, useAuth } from "@/lib/auth-context";
import { SectionFrame, SectionTitle } from "@/components/streamlit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  HOLIDAY_ORG_WIDE,
  LEAVE_TYPES,
  canEditResourceLeave,
  holidayAppliesToLocation,
  normalizeLocation,
  type ResourceLeave,
} from "@/lib/resource-calendar";
import { useOrgResourceCalendar } from "@/hooks/use-resource-calendar";

export type CalendarResourceOpt = {
  id: string;
  name: string;
  location?: string | null;
  user_id?: string | null;
  manager_user_id?: string | null;
};

export function OrgHolidaysPanel({ resources }: { resources: CalendarResourceOpt[] }) {
  const { organization, roles } = useAuth();
  const orgId = organization?.id;
  const admin = isAdmin(roles);
  const qc = useQueryClient();
  const { holidays } = useOrgResourceCalendar(orgId);

  const locations = useMemo(() => {
    const set = new Set<string>();
    for (const r of resources) {
      const loc = String(r.location || "").trim();
      if (loc) set.add(loc);
    }
    for (const h of holidays) {
      const loc = normalizeLocation(h.location);
      if (loc && loc !== HOLIDAY_ORG_WIDE) set.add(h.location);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [resources, holidays]);

  const [hLoc, setHLoc] = useState("");
  const [hDate, setHDate] = useState("");
  const [hName, setHName] = useState("");

  const addHoliday = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No organisation");
      const location = normalizeLocation(hLoc) || HOLIDAY_ORG_WIDE;
      const { error } = await supabase.from("org_public_holidays").insert({
        org_id: orgId,
        location,
        holiday_date: hDate,
        name: hName.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Holiday added");
      setHName("");
      qc.invalidateQueries({ queryKey: ["org_public_holidays"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delHoliday = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("org_public_holidays").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org_public_holidays"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SectionFrame>
      <SectionTitle>Public holidays by geography</SectionTitle>
      <p className="mb-3 max-w-3xl text-sm text-muted-foreground">
        Holidays belong to a <strong>geography</strong> (the Location field on the resource). Use{" "}
        <code>*</code> for an org-wide day. Those weekdays drop out of estimation, utilisation,
        demand, and timesheet week-plan.
      </p>
      {admin ? (
        <form
          className="mb-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!hDate || !hName.trim()) return;
            addHoliday.mutate();
          }}
        >
          <label className="min-w-[10rem] flex-1 text-[11px] font-medium text-muted-foreground">
            Location
            <Input
              list="holiday-locations"
              className="mt-1 h-9"
              value={hLoc}
              onChange={(e) => setHLoc(e.target.value)}
              placeholder="Sydney, or * for all"
            />
            <datalist id="holiday-locations">
              <option value="*">All locations</option>
              {locations.map((loc) => (
                <option key={loc} value={loc} />
              ))}
            </datalist>
          </label>
          <label className="text-[11px] font-medium text-muted-foreground">
            Date
            <Input
              type="date"
              className="mt-1 h-9"
              value={hDate}
              onChange={(e) => setHDate(e.target.value)}
              required
            />
          </label>
          <label className="min-w-[12rem] flex-1 text-[11px] font-medium text-muted-foreground">
            Name
            <Input
              className="mt-1 h-9"
              value={hName}
              onChange={(e) => setHName(e.target.value)}
              placeholder="Australia Day"
              required
            />
          </label>
          <Button type="submit" size="sm" disabled={addHoliday.isPending}>
            <Plus className="mr-1 h-4 w-4" />
            Add holiday
          </Button>
        </form>
      ) : (
        <p className="mb-3 text-xs text-muted-foreground">Org admins can add or remove holidays.</p>
      )}
      {holidays.length === 0 ? (
        <p className="text-sm text-muted-foreground">No public holidays yet.</p>
      ) : (
        <HolidayTable holidays={holidays} admin={admin} onDelete={(id) => delHoliday.mutate(id)} />
      )}
    </SectionFrame>
  );
}

export function ApplyLeavePanel({
  resources,
  scope,
}: {
  resources: CalendarResourceOpt[];
  scope: "mine" | "org";
}) {
  const { organization, roles, user } = useAuth();
  const orgId = organization?.id;
  const admin = isAdmin(roles);
  const userId = user?.id ?? null;
  const qc = useQueryClient();
  const { holidays, leaves } = useOrgResourceCalendar(orgId);

  const editable = useMemo(
    () => resources.filter((r) => canEditResourceLeave({ admin, userId, resource: r })),
    [resources, admin, userId],
  );

  const mine = useMemo(
    () => resources.find((r) => r.user_id && r.user_id === userId) || null,
    [resources, userId],
  );

  const chooser = scope === "org" && admin ? resources : editable;
  const [lRes, setLRes] = useState("");
  const selectedId =
    lRes || (scope === "mine" ? mine?.id || chooser[0]?.id || "" : chooser[0]?.id || "");
  const selected = resources.find((r) => r.id === selectedId) || null;
  const canWriteSelected = canEditResourceLeave({ admin, userId, resource: selected });

  const [lType, setLType] = useState<(typeof LEAVE_TYPES)[number]>("Annual");
  const [lStart, setLStart] = useState("");
  const [lEnd, setLEnd] = useState("");
  const [lNotes, setLNotes] = useState("");

  const resourceName = useMemo(() => new Map(resources.map((r) => [r.id, r.name])), [resources]);

  const visibleLeaves = useMemo(() => {
    if (scope === "org" && admin) return leaves;
    const allowed = new Set(editable.map((r) => r.id));
    return leaves.filter((row) => allowed.has(row.resource_id));
  }, [scope, admin, leaves, editable]);

  const locationHolidays = useMemo(
    () => holidays.filter((h) => holidayAppliesToLocation(h.location, selected?.location)),
    [holidays, selected],
  );

  const addLeave = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No organisation");
      const resourceId = selectedId;
      if (!resourceId) throw new Error("Pick a resource");
      const target = resources.find((r) => r.id === resourceId);
      if (!canEditResourceLeave({ admin, userId, resource: target })) {
        throw new Error("You can only apply leave for yourself or people you manage");
      }
      const { error } = await supabase.from("resource_leaves").insert({
        org_id: orgId,
        resource_id: resourceId,
        leave_type: lType,
        start_date: lStart,
        end_date: lEnd || lStart,
        notes: lNotes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Leave recorded");
      setLNotes("");
      qc.invalidateQueries({ queryKey: ["resource_leaves"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delLeave = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("resource_leaves").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resource_leaves"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (chooser.length === 0) {
    return (
      <SectionFrame>
        <SectionTitle>Apply leave</SectionTitle>
        <p className="text-sm text-muted-foreground">
          Your login is not linked to a resource record, so there is nobody to apply leave for. Ask
          an org admin to set <strong>Linked login</strong> on Resources (Timesheets → Resource
          setup).
        </p>
      </SectionFrame>
    );
  }

  return (
    <div className="space-y-4">
      <SectionFrame>
        <SectionTitle>{scope === "org" ? "All resource leave" : "Apply leave"}</SectionTitle>
        <p className="mb-3 max-w-3xl text-sm text-muted-foreground">
          {scope === "org"
            ? "Org admins can add or remove leave for anyone. People apply their own leave on Apply leave; resource managers can apply for their team."
            : "Apply dated leave for yourself, or for people you manage. Weekdays in the range drop out of capacity. Public holidays are managed by org admins."}
        </p>
        {canWriteSelected ? (
          <form
            className="mb-3 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!selectedId || !lStart) return;
              addLeave.mutate();
            }}
          >
            <label className="min-w-[12rem] flex-1 text-[11px] font-medium text-muted-foreground">
              Resource
              <select
                className="st-input mt-1 h-9 w-full"
                value={selectedId}
                onChange={(e) => setLRes(e.target.value)}
                required
              >
                {chooser.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.user_id && r.user_id === userId ? " · you" : ""}
                    {r.location ? ` · ${r.location}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-medium text-muted-foreground">
              Type
              <select
                className="st-input mt-1 h-9"
                value={lType}
                onChange={(e) => setLType(e.target.value as (typeof LEAVE_TYPES)[number])}
              >
                {LEAVE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-medium text-muted-foreground">
              From
              <Input
                type="date"
                className="mt-1 h-9"
                value={lStart}
                onChange={(e) => setLStart(e.target.value)}
                required
              />
            </label>
            <label className="text-[11px] font-medium text-muted-foreground">
              To
              <Input
                type="date"
                className="mt-1 h-9"
                value={lEnd}
                onChange={(e) => setLEnd(e.target.value)}
              />
            </label>
            <label className="min-w-[10rem] flex-1 text-[11px] font-medium text-muted-foreground">
              Notes
              <Input
                className="mt-1 h-9"
                value={lNotes}
                onChange={(e) => setLNotes(e.target.value)}
                placeholder="Optional"
              />
            </label>
            <Button type="submit" size="sm" disabled={addLeave.isPending}>
              <Plus className="mr-1 h-4 w-4" />
              Apply leave
            </Button>
          </form>
        ) : (
          <p className="mb-3 text-xs text-muted-foreground">
            You can view leave but not change it.
          </p>
        )}
        {visibleLeaves.length === 0 ? (
          <p className="text-sm text-muted-foreground">No leave recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Resource</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">From</th>
                  <th className="px-3 py-2">To</th>
                  <th className="px-3 py-2">Notes</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {visibleLeaves.map((row) => {
                  const target = resources.find((r) => r.id === row.resource_id);
                  const canDel = canEditResourceLeave({ admin, userId, resource: target });
                  return (
                    <LeaveRow
                      key={row.id || `${row.resource_id}-${row.start_date}`}
                      row={row}
                      name={resourceName.get(row.resource_id) || "Resource"}
                      canDelete={canDel}
                      onDelete={() => row.id && delLeave.mutate(row.id)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionFrame>
      {scope === "mine" && selected ? (
        <SectionFrame>
          <SectionTitle>
            Public holidays
            {selected.location ? ` · ${selected.location}` : " · org-wide"}
          </SectionTitle>
          <p className="mb-3 text-sm text-muted-foreground">
            These days are already off. Org admins maintain them on{" "}
            <strong>Org holidays & leave</strong>.
          </p>
          {locationHolidays.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No public holidays for this location yet.
            </p>
          ) : (
            <HolidayTable holidays={locationHolidays} admin={false} />
          )}
        </SectionFrame>
      ) : null}
    </div>
  );
}

function HolidayTable({
  holidays,
  admin,
  onDelete,
}: {
  holidays: { id?: string; location: string; holiday_date: string; name?: string | null }[];
  admin: boolean;
  onDelete?: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Location</th>
            <th className="px-3 py-2">Name</th>
            {admin ? <th className="px-3 py-2" /> : null}
          </tr>
        </thead>
        <tbody>
          {holidays.map((h) => (
            <tr key={h.id || `${h.location}-${h.holiday_date}`} className="border-b">
              <td className="px-3 py-2 whitespace-nowrap">{h.holiday_date}</td>
              <td className="px-3 py-2">
                {normalizeLocation(h.location) === HOLIDAY_ORG_WIDE ? "All locations" : h.location}
              </td>
              <td className="px-3 py-2">{h.name}</td>
              {admin ? (
                <td className="px-3 py-2 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => h.id && onDelete?.(h.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeaveRow({
  row,
  name,
  canDelete,
  onDelete,
}: {
  row: ResourceLeave;
  name: string;
  canDelete: boolean;
  onDelete: () => void;
}) {
  return (
    <tr className="border-b">
      <td className="px-3 py-2 font-medium">{name}</td>
      <td className="px-3 py-2">{row.leave_type || "General"}</td>
      <td className="px-3 py-2 whitespace-nowrap">{row.start_date}</td>
      <td className="px-3 py-2 whitespace-nowrap">{row.end_date}</td>
      <td className="px-3 py-2 text-muted-foreground">{row.notes || "—"}</td>
      <td className="px-3 py-2 text-right">
        {canDelete ? (
          <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </td>
    </tr>
  );
}
