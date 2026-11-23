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
  normalizeLocation,
  type ResourceLeave,
} from "@/lib/resource-calendar";
import { useOrgResourceCalendar } from "@/hooks/use-resource-calendar";

type ResourceOpt = { id: string; name: string; location?: string | null };

export function ResourceCalendarPanel({ resources }: { resources: ResourceOpt[] }) {
  const { organization, roles } = useAuth();
  const orgId = organization?.id;
  const admin = isAdmin(roles);
  const qc = useQueryClient();
  const { holidays, leaves } = useOrgResourceCalendar(orgId);

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

  const resourceName = useMemo(() => new Map(resources.map((r) => [r.id, r.name])), [resources]);

  const [hLoc, setHLoc] = useState("");
  const [hDate, setHDate] = useState("");
  const [hName, setHName] = useState("");
  const [lRes, setLRes] = useState("");
  const [lType, setLType] = useState<(typeof LEAVE_TYPES)[number]>("Annual");
  const [lStart, setLStart] = useState("");
  const [lEnd, setLEnd] = useState("");
  const [lNotes, setLNotes] = useState("");

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

  const addLeave = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No organisation");
      const { error } = await supabase.from("resource_leaves").insert({
        org_id: orgId,
        resource_id: lRes,
        leave_type: lType,
        start_date: lStart,
        end_date: lEnd || lStart,
        notes: lNotes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Leave added");
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

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Public holidays belong to a <strong>geography</strong> (the Location field on the resource).
        Use <code>*</code> for an org-wide day. Leave is dated per person (annual, sick, or
        general). Estimation load, planned FTE apply, work-item demand, timesheet week-plan, and
        utilisation treat those weekdays as unavailable.
      </p>

      <SectionFrame>
        <SectionTitle>Public holidays by geography</SectionTitle>
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
          <p className="mb-3 text-xs text-muted-foreground">
            Org admins can add or remove holidays.
          </p>
        )}
        {holidays.length === 0 ? (
          <p className="text-sm text-muted-foreground">No public holidays yet.</p>
        ) : (
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
                      {normalizeLocation(h.location) === HOLIDAY_ORG_WIDE
                        ? "All locations"
                        : h.location}
                    </td>
                    <td className="px-3 py-2">{h.name}</td>
                    {admin ? (
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => h.id && delHoliday.mutate(h.id)}
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
        )}
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>Resource leave</SectionTitle>
        {admin ? (
          <form
            className="mb-3 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!lRes || !lStart) return;
              addLeave.mutate();
            }}
          >
            <label className="min-w-[12rem] flex-1 text-[11px] font-medium text-muted-foreground">
              Resource
              <select
                className="st-input mt-1 h-9 w-full"
                value={lRes}
                onChange={(e) => setLRes(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
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
              Add leave
            </Button>
          </form>
        ) : (
          <p className="mb-3 text-xs text-muted-foreground">Org admins can add or remove leave.</p>
        )}
        {leaves.length === 0 ? (
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
                  {admin ? <th className="px-3 py-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {leaves.map((row) => (
                  <LeaveRow
                    key={row.id || `${row.resource_id}-${row.start_date}`}
                    row={row}
                    name={resourceName.get(row.resource_id) || "Resource"}
                    admin={admin}
                    onDelete={() => row.id && delLeave.mutate(row.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionFrame>
    </div>
  );
}

function LeaveRow({
  row,
  name,
  admin,
  onDelete,
}: {
  row: ResourceLeave;
  name: string;
  admin: boolean;
  onDelete: () => void;
}) {
  return (
    <tr className="border-b">
      <td className="px-3 py-2 font-medium">{name}</td>
      <td className="px-3 py-2">{row.leave_type || "General"}</td>
      <td className="px-3 py-2 whitespace-nowrap">{row.start_date}</td>
      <td className="px-3 py-2 whitespace-nowrap">{row.end_date}</td>
      <td className="px-3 py-2 text-muted-foreground">{row.notes || "—"}</td>
      {admin ? (
        <td className="px-3 py-2 text-right">
          <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </td>
      ) : null}
    </tr>
  );
}
