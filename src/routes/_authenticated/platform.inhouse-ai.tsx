import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles, ShieldAlert } from "lucide-react";
import {
  listOrgInhouseAiSettings,
  setOrgInhouseAiModelEnabled,
} from "@/lib/inhouse-ai.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/platform/inhouse-ai")({
  component: PlatformInhouseAiPage,
});

function PlatformInhouseAiPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listOrgInhouseAiSettings);
  const setFn = useServerFn(setOrgInhouseAiModelEnabled);
  const [filter, setFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["platform_inhouse_ai_settings"],
    queryFn: async () => listFn(),
  });

  const save = useMutation({
    mutationFn: async ({ orgId, enabled }: { orgId: string; enabled: boolean }) =>
      setFn({ data: { orgId, enabled } }),
    onSuccess: (_res, vars) => {
      toast.success(
        vars.enabled
          ? "Approved model enabled for this organisation"
          : "Approved model disabled — local engine only",
      );
      qc.invalidateQueries({ queryKey: ["platform_inhouse_ai_settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const orgs = data?.orgs ?? [];
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.slug.toLowerCase().includes(q) ||
        o.plan.toLowerCase().includes(q),
    );
  }, [orgs, filter]);

  const enabledCount = orgs.filter((o) => o.enabled).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">In-house AI · approved model</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          By default every organisation stays on the <strong>local engine</strong> — portfolio
          data never leaves the app for model inference. Enable the approved model only for
          organisations that explicitly need it. Requires server{" "}
          <code className="text-xs">INHOUSE_AI_*</code> configuration.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Platform endpoint
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.platformConfigured ? (
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <Sparkles className="h-4 w-4" />
                Configured
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
                <ShieldAlert className="h-4 w-4" />
                Not configured
              </div>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {data?.platformConfigured
                ? `${data.label}${data.model ? ` · ${data.model}` : ""}`
                : "Set INHOUSE_AI_BASE_URL / MODEL / API_KEY on the server first."}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Orgs with model on
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {enabledCount}
              <span className="text-sm font-normal text-muted-foreground"> / {orgs.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Default</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="secondary">Off · local engine</Badge>
            <p className="mt-2 text-xs text-muted-foreground">
              New organisations never send context to a model until you enable them here.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Organisation access</CardTitle>
          <Input
            className="h-8 max-w-xs text-xs"
            placeholder="Filter organisations…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-5 py-8 text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-8 text-sm text-muted-foreground">No organisations match.</div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((org) => (
                <div
                  key={org.id}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{org.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {org.slug} · {org.plan}
                      {org.enabled ? (
                        <span className="text-emerald-700"> · approved model on</span>
                      ) : (
                        <span> · local only</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={org.enabled}
                      disabled={save.isPending || !data?.platformConfigured}
                      onCheckedChange={(next) =>
                        save.mutate({ orgId: org.id, enabled: next })
                      }
                    />
                    <span className="text-sm">{org.enabled ? "Enabled" : "Disabled"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {!data?.platformConfigured ? (
        <p className="text-xs text-amber-800">
          Toggles are disabled until the platform endpoint is configured. Organisations remain on
          the local engine either way — no customer context is sent out.
        </p>
      ) : null}
    </div>
  );
}
