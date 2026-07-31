import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link2, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import {
  listOrgIntegrations,
  syncJiraIssues,
  testOrgIntegration,
  upsertOrgIntegration,
} from "@/lib/integration.functions";
import { INTEGRATION_PROVIDERS, type IntegrationPublicStatus } from "@/lib/integration-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = { orgId: string };

export function OrgIntegrationsPanel({ orgId }: Props) {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["org_integrations", orgId],
    queryFn: () => listOrgIntegrations({ data: { org_id: orgId } }),
    enabled: !!orgId,
  });

  const jira = rows.find((r) => r.provider === "jira") ?? null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading integrations…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Connect external systems so portfolio work can flow into iProjectX. Jira import lands in{" "}
        <strong>Demand Pipeline</strong> (linked by issue key). API tokens are encrypted server-side
        and never shown again.
      </div>
      {INTEGRATION_PROVIDERS.map((p) => (
        <Card key={p.id}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4" />
              {p.label}
              {!p.available && (
                <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Coming soon
                </span>
              )}
            </CardTitle>
            <CardDescription>{p.description}</CardDescription>
          </CardHeader>
          <CardContent>
            {p.id === "jira" && p.available ? (
              <JiraForm orgId={orgId} data={jira} onSaved={() => qc.invalidateQueries({ queryKey: ["org_integrations", orgId] })} />
            ) : (
              <p className="text-xs text-muted-foreground">
                Placeholder — enable when your organisation is ready. Architecture supports multiple
                providers via <code className="font-mono">org_integrations</code>.
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function JiraForm({
  orgId,
  data,
  onSaved,
}: {
  orgId: string;
  data: IntegrationPublicStatus | null;
  onSaved: () => void;
}) {
  const [site, setSite] = useState(data?.config?.site_url ?? "");
  const [email, setEmail] = useState(data?.config?.email ?? "");
  const [keys, setKeys] = useState((data?.config?.project_keys ?? []).join(", "));
  const [token, setToken] = useState("");
  const [jql, setJql] = useState(data?.config?.jql ?? "");

  useEffect(() => {
    setSite(data?.config?.site_url ?? "");
    setEmail(data?.config?.email ?? "");
    setKeys((data?.config?.project_keys ?? []).join(", "));
    setJql(data?.config?.jql ?? "");
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () =>
      upsertOrgIntegration({
        data: {
          org_id: orgId,
          provider: "jira",
          display_name: "Jira",
          config: {
            site_url: site.trim(),
            email: email.trim(),
            project_keys: keys
              .split(",")
              .map((k) => k.trim())
              .filter(Boolean),
            jql: jql.trim() || undefined,
            map_to: "demand_pipeline",
            sync_mode: "manual",
          },
          api_token: token.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Jira connection saved");
      setToken("");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMut = useMutation({
    mutationFn: () => testOrgIntegration({ data: { org_id: orgId, provider: "jira" } }),
    onSuccess: (row) => {
      if (row.status === "tested" || row.status === "active") toast.success("Jira connection OK");
      else toast.error(row.last_error || "Test failed");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncMut = useMutation({
    mutationFn: () => syncJiraIssues({ data: { org_id: orgId, max_results: 50 } }),
    onSuccess: (r) => {
      toast.success(`Imported ${r.created} new issues (${r.linked} already linked)`);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      {!data?.kek_configured && (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Set <code className="font-mono">INTEGRATIONS_SECRETS_KEK</code> or{" "}
          <code className="font-mono">BYOD_SECRETS_KEK</code> (≥32 chars) before saving tokens.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded-full border px-2 py-0.5 font-semibold">
          Status: {data?.status ?? "not_configured"}
        </span>
        {data?.secret_configured && (
          <span className="text-muted-foreground">Token {data.secret_hint}</span>
        )}
        {data?.last_synced_at && (
          <span className="text-muted-foreground">
            Last sync {new Date(data.last_synced_at).toLocaleString()}
          </span>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <Label>Jira site URL</Label>
          <Input
            value={site}
            onChange={(e) => setSite(e.target.value)}
            placeholder="https://your-domain.atlassian.net"
            className="font-mono text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Atlassian account email</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        </div>
        <div className="space-y-1.5">
          <Label>API token (write-only)</Label>
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={data?.secret_configured ? "Configured — paste to replace" : "Atlassian API token"}
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Project keys (comma-separated)</Label>
          <Input
            value={keys}
            onChange={(e) => setKeys(e.target.value)}
            placeholder="IPX, PMO"
            className="font-mono text-xs"
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Custom JQL (optional)</Label>
          <Input
            value={jql}
            onChange={(e) => setJql(e.target.value)}
            placeholder='e.g. project = IPX AND statusCategory != Done ORDER BY updated DESC'
            className="font-mono text-xs"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={saveMut.isPending}
          onClick={() => saveMut.mutate()}
        >
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={testMut.isPending || !data?.secret_configured}
          onClick={() => testMut.mutate()}
        >
          Test connection
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={
            syncMut.isPending ||
            !data ||
            (data.status !== "tested" && data.status !== "active")
          }
          onClick={() => syncMut.mutate()}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Sync issues → Demand
        </Button>
      </div>
      {data?.last_error && (
        <p className="text-xs text-red-600">{data.last_error}</p>
      )}
    </div>
  );
}
