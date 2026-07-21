import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeading, SectionFrame, SectionTitle } from "@/components/streamlit";
import { Button } from "@/components/ui/button";
import { useAuth, isAdmin } from "@/lib/auth-context";
import {
  cancelPurgeNotice,
  createPurgeNotice,
  executeProjectPurge,
  listOrgPurgeOverview,
} from "@/lib/project-purge.functions";

export const Route = createFileRoute("/_authenticated/app/project-purge")({
  component: OrgProjectPurgePage,
});

function OrgProjectPurgePage() {
  const { organization, roles } = useAuth();
  const admin = isAdmin(roles);
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!admin) navigate({ to: "/app", replace: true });
  }, [admin, navigate]);

  const listOverview = useServerFn(listOrgPurgeOverview);
  const notifyFn = useServerFn(createPurgeNotice);
  const cancelFn = useServerFn(cancelPurgeNotice);
  const purgeFn = useServerFn(executeProjectPurge);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["org_project_purge", organization?.id],
    queryFn: async () => listOverview(),
    enabled: !!organization && admin,
  });

  const [busy, setBusy] = useState(false);
  const [graceDays, setGraceDays] = useState(14);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["org_project_purge"] });
    await refetch();
  };

  const notify = useMutation({
    mutationFn: async () => {
      if (!data?.org_id) throw new Error("No organisation");
      return notifyFn({
        data: { org_id: data.org_id, grace_days: graceDays },
      });
    },
    onSuccess: () => {
      toast.success(`Team notified. Grace period: ${graceDays} days.`);
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
    mutationFn: async () => {
      if (!data?.org_id) throw new Error("No organisation");
      return purgeFn({ data: { org_id: data.org_id, confirm: true } });
    },
    onSuccess: (res) => {
      toast.success(`Purged ${res.purged} project(s)`);
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!admin) return null;

  const candidates = data?.candidates ?? [];
  const pending = data?.pending_notice ?? null;
  const fromPlatform = pending?.initiator_scope === "platform";

  return (
    <div className="space-y-6">
      <PageHeading
        title="Closed project purge"
        subtitle={`Remove Completed/Cancelled projects older than 1 year in ${organization?.name ?? "your organisation"}.`}
      />

      <SectionFrame>
        <SectionTitle>How it works</SectionTitle>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>You can purge eligible projects for this organisation at any time (with confirmation).</li>
          <li>
            Platform admins may send a notice first; please act before the grace deadline — otherwise
            they can purge after it ends.
          </li>
          <li>Optional: schedule your own notice to alert other org admins before you purge.</li>
        </ul>
      </SectionFrame>

      {pending && (
        <SectionFrame className="border-amber-500/40 bg-amber-500/5">
          <SectionTitle>Pending purge notice</SectionTitle>
          <p className="mt-2 text-sm text-foreground">
            {fromPlatform ? "Requested by platform administration" : "Opened by your organisation"} ·
            grace until <strong>{new Date(pending.grace_until).toLocaleString()}</strong>
          </p>
          {pending.message && (
            <p className="mt-2 text-sm text-muted-foreground">{pending.message}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy || cancel.isPending}
              onClick={() => {
                setBusy(true);
                cancel.mutate(pending.id, { onSettled: () => setBusy(false) });
              }}
            >
              Cancel notice
            </Button>
          </div>
        </SectionFrame>
      )}

      <SectionFrame>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionTitle>Eligible projects</SectionTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {isLoading
                ? "Loading…"
                : `${candidates.length} project${candidates.length === 1 ? "" : "s"} closed more than 1 year ago`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!pending && candidates.length > 0 && (
              <>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Grace days
                  <input
                    type="number"
                    min={1}
                    max={90}
                    className="w-16 rounded-md border border-input bg-background px-2 py-1 text-foreground"
                    value={graceDays}
                    onChange={(e) =>
                      setGraceDays(Math.min(90, Math.max(1, Number(e.target.value) || 14)))
                    }
                  />
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || notify.isPending}
                  onClick={() => {
                    setBusy(true);
                    notify.mutate(undefined, { onSettled: () => setBusy(false) });
                  }}
                >
                  Notify other admins
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="destructive"
              disabled={busy || candidates.length === 0 || purge.isPending}
              onClick={() => {
                if (
                  !window.confirm(
                    `Permanently delete ${candidates.length} closed project(s)? Related RAID, financials, and gates will also be removed. This cannot be undone.`,
                  )
                ) {
                  return;
                }
                setBusy(true);
                purge.mutate(undefined, { onSettled: () => setBusy(false) });
              }}
            >
              Purge eligible projects
            </Button>
          </div>
        </div>

        {candidates.length > 0 ? (
          <div className="mt-4 max-h-[min(60vh,520px)] overflow-auto rounded-md border border-border">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="sticky top-0 bg-muted/80 text-xs uppercase text-muted-foreground backdrop-blur">
                <tr>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Closed on</th>
                  <th className="px-3 py-2">Program</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((p) => (
                  <tr key={p.id} className="border-t border-border/60">
                    <td className="px-3 py-2 font-mono text-xs">{p.project_code || "—"}</td>
                    <td className="px-3 py-2 font-medium">{p.name}</td>
                    <td className="px-3 py-2">{p.status}</td>
                    <td className="px-3 py-2 tabular-nums">{p.closed_on}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.program || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !isLoading && (
            <p className="mt-4 text-sm text-muted-foreground">No eligible projects right now.</p>
          )
        )}
      </SectionFrame>

      {(data?.notices?.length ?? 0) > 0 && (
        <SectionFrame>
          <SectionTitle>Recent purge notices</SectionTitle>
          <div className="mt-3 space-y-2">
            {data!.notices.map((n) => (
              <div
                key={n.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 px-3 py-2 text-xs"
              >
                <div>
                  <span className="font-medium capitalize">{n.status}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {n.initiator_scope} · {n.project_count} projects ·{" "}
                    {new Date(n.created_at).toLocaleDateString()}
                  </span>
                </div>
                {n.purged_count != null && (
                  <span className="text-muted-foreground">Purged {n.purged_count}</span>
                )}
              </div>
            ))}
          </div>
        </SectionFrame>
      )}
    </div>
  );
}
