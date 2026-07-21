import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  cancelPurgeNotice,
  createPurgeNotice,
  executeProjectPurge,
  listPlatformPurgeOverview,
  type PurgeOrgSummary,
} from "@/lib/project-purge.functions";

export const Route = createFileRoute("/_authenticated/platform/project-purge")({
  component: PlatformProjectPurgePage,
});

function PlatformProjectPurgePage() {
  const qc = useQueryClient();
  const listOverview = useServerFn(listPlatformPurgeOverview);
  const notifyFn = useServerFn(createPurgeNotice);
  const cancelFn = useServerFn(cancelPurgeNotice);
  const purgeFn = useServerFn(executeProjectPurge);

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["platform_project_purge"],
    queryFn: async () => listOverview(),
  });

  const [graceDays, setGraceDays] = useState(14);
  const [filter, setFilter] = useState("");
  const [busyOrg, setBusyOrg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (o) =>
        o.org_name.toLowerCase().includes(q) ||
        o.org_slug.toLowerCase().includes(q),
    );
  }, [data, filter]);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["platform_project_purge"] });
    await refetch();
  };

  const notify = useMutation({
    mutationFn: async (org: PurgeOrgSummary) =>
      notifyFn({
        data: {
          org_id: org.org_id,
          grace_days: graceDays,
        },
      }),
    onSuccess: (res) => {
      toast.success(`Org admins notified (${res.notified_admins}). Grace: ${graceDays} days.`);
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: async (noticeId: string) => cancelFn({ data: { notice_id: noticeId } }),
    onSuccess: () => {
      toast.success("Notice cancelled");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const purge = useMutation({
    mutationFn: async (org: PurgeOrgSummary) =>
      purgeFn({ data: { org_id: org.org_id, confirm: true } }),
    onSuccess: (res) => {
      toast.success(`Purged ${res.purged} project(s)`);
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const run = async (orgId: string, fn: () => Promise<unknown>) => {
    setBusyOrg(orgId);
    try {
      await fn();
    } finally {
      setBusyOrg(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeading
        title="Closed project purge"
        subtitle="Notify organisation admins to remove Completed/Cancelled projects older than 1 year. After the grace period, platform admins can purge."
      />

      <SectionFrame>
        <SectionTitle>Policy</SectionTitle>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Eligible: status Completed or Cancelled, closed more than 1 year ago (actual end → end → planned end → last update).</li>
          <li>Step 1 — Notify org admins and give them time to review and purge.</li>
          <li>Step 2 — After grace ends, use Purge if the organisation has not acted.</li>
          <li>Deletes cascade to related project data (RAID, financials, gates, etc.).</li>
        </ul>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="grace">Default grace (days)</Label>
            <Input
              id="grace"
              type="number"
              min={1}
              max={90}
              className="mt-1 w-28"
              value={graceDays}
              onChange={(e) => setGraceDays(Math.min(90, Math.max(1, Number(e.target.value) || 14)))}
            />
          </div>
          <div className="min-w-[200px] flex-1">
            <Label htmlFor="filter">Filter organisations</Label>
            <Input
              id="filter"
              className="mt-1"
              placeholder="Name or slug…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        </div>
      </SectionFrame>

      <SectionFrame>
        <SectionTitle>
          Organisations with eligible projects
          {!isLoading && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({filtered.length})
            </span>
          )}
        </SectionTitle>

        {isLoading ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No organisations currently have closed projects older than 1 year.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {filtered.map((org) => {
              const notice = org.pending_notice;
              const gracePassed =
                !!notice && new Date(notice.grace_until).getTime() <= Date.now();
              const busy = busyOrg === org.org_id;
              return (
                <div
                  key={org.org_id}
                  className="rounded-md border border-border bg-surface p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-foreground">{org.org_name}</div>
                      <div className="text-xs text-muted-foreground">{org.org_slug}</div>
                      <div className="mt-1 text-sm">
                        <span className="font-medium tabular-nums">{org.candidate_count}</span>{" "}
                        eligible project{org.candidate_count === 1 ? "" : "s"}
                      </div>
                      {notice ? (
                        <div className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                          Pending notice · grace until{" "}
                          <strong>{new Date(notice.grace_until).toLocaleString()}</strong>
                          {gracePassed ? " · grace ended — platform may purge" : " · waiting on org admin"}
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-muted-foreground">
                          No active notice — notify org admins before platform purge.
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!notice && org.candidate_count > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || notify.isPending}
                          onClick={() =>
                            void run(org.org_id, () => notify.mutateAsync(org))
                          }
                        >
                          Notify org admin
                        </Button>
                      )}
                      {notice && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || cancel.isPending}
                          onClick={() =>
                            void run(org.org_id, () => cancel.mutateAsync(notice.id))
                          }
                        >
                          Cancel notice
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy || !gracePassed || org.candidate_count === 0 || purge.isPending}
                        title={
                          !notice
                            ? "Notify first"
                            : !gracePassed
                              ? "Wait until grace ends"
                              : "Permanently delete eligible projects"
                        }
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Permanently delete ${org.candidate_count} closed project(s) in ${org.org_name}? This cannot be undone.`,
                            )
                          ) {
                            return;
                          }
                          void run(org.org_id, () => purge.mutateAsync(org));
                        }}
                      >
                        Purge now
                      </Button>
                    </div>
                  </div>
                  {org.candidates.length > 0 && (
                    <div className="mt-3 max-h-40 overflow-auto rounded border border-border/60">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-muted/40 text-muted-foreground">
                          <tr>
                            <th className="px-2 py-1">Code</th>
                            <th className="px-2 py-1">Name</th>
                            <th className="px-2 py-1">Status</th>
                            <th className="px-2 py-1">Closed</th>
                          </tr>
                        </thead>
                        <tbody>
                          {org.candidates.map((p) => (
                            <tr key={p.id} className="border-t border-border/50">
                              <td className="px-2 py-1 font-mono">{p.project_code || "—"}</td>
                              <td className="px-2 py-1">{p.name}</td>
                              <td className="px-2 py-1">{p.status}</td>
                              <td className="px-2 py-1 tabular-nums">{p.closed_on}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {org.candidate_count > org.candidates.length && (
                        <div className="border-t px-2 py-1 text-[11px] text-muted-foreground">
                          Showing {org.candidates.length} of {org.candidate_count}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionFrame>
    </div>
  );
}
