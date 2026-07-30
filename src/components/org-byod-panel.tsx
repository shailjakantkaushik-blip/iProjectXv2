import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Database,
  EyeOff,
  Loader2,
  PlugZap,
  Save,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  clearOrgByodSecret,
  getOrgByodStatus,
  setOrgByodActiveState,
  testOrgByodConnection,
  upsertOrgByodConnection,
} from "@/lib/byod.functions";
import type { ByodPublicStatus } from "@/lib/byod-types";

function statusLabel(s: ByodPublicStatus["status"]) {
  switch (s) {
    case "active":
      return "Active — customer DB";
    case "tested":
      return "Tested — ready to activate";
    case "configured":
      return "Configured — test required";
    case "error":
      return "Error";
    default:
      return "Not configured";
  }
}

function statusClass(s: ByodPublicStatus["status"]) {
  switch (s) {
    case "active":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "tested":
      return "bg-sky-50 text-sky-800 border-sky-200";
    case "error":
      return "bg-red-50 text-red-800 border-red-200";
    case "configured":
      return "bg-amber-50 text-amber-900 border-amber-200";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function OrgByodPanel({
  orgId,
  orgName,
}: {
  orgId: string;
  orgName: string;
}) {
  const qc = useQueryClient();
  const getStatus = useServerFn(getOrgByodStatus);
  const upsert = useServerFn(upsertOrgByodConnection);
  const clearSecret = useServerFn(clearOrgByodSecret);
  const testConn = useServerFn(testOrgByodConnection);
  const setActive = useServerFn(setOrgByodActiveState);

  const { data, isLoading, error } = useQuery({
    queryKey: ["org-byod", orgId],
    queryFn: () => getStatus({ data: { org_id: orgId } }),
  });

  const [url, setUrl] = useState("");
  const [publishable, setPublishable] = useState("");
  const [secret, setSecret] = useState("");
  const [notes, setNotes] = useState("");
  const [replaceSecret, setReplaceSecret] = useState(false);

  useEffect(() => {
    if (!data) return;
    setUrl(data.supabase_url ?? "");
    setPublishable("");
    setSecret("");
    setNotes(data.notes ?? "");
    setReplaceSecret(false);
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => {
      const shouldSendSecret = Boolean(
        secret.trim() && (replaceSecret || !data?.secret_configured),
      );
      return upsert({
        data: {
          org_id: orgId,
          supabase_url: url,
          publishable_key: publishable.trim() ? publishable.trim() : undefined,
          service_role_secret: shouldSendSecret ? secret.trim() : undefined,
          notes,
          enabled: data?.enabled ?? false,
        },
      });
    },
    onSuccess: (row) => {
      toast.success("BYOD connection saved");
      setSecret("");
      setReplaceSecret(false);
      void qc.setQueryData(["org-byod", orgId], row);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMut = useMutation({
    mutationFn: () => testConn({ data: { org_id: orgId } }),
    onSuccess: (row) => {
      if (row.status === "tested") toast.success("Connection test passed");
      else toast.error(row.last_error || "Connection test failed");
      void qc.setQueryData(["org-byod", orgId], row);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeMut = useMutation({
    mutationFn: (active: boolean) => setActive({ data: { org_id: orgId, active } }),
    onSuccess: (row) => {
      toast.success(row.byod_active ? "BYOD activated for this organisation" : "BYOD deactivated");
      void qc.setQueryData(["org-byod", orgId], row);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearMut = useMutation({
    mutationFn: () => clearSecret({ data: { org_id: orgId } }),
    onSuccess: (row) => {
      toast.success("Secret cleared");
      setSecret("");
      setReplaceSecret(false);
      void qc.setQueryData(["org-byod", orgId], row);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading BYOD settings…
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">
          {(error as Error)?.message ??
            "Could not load BYOD settings. Apply migration 20260729120000_org_byod_connections.sql."}
        </CardContent>
      </Card>
    );
  }

  const canActivate = data.secret_configured && (data.status === "tested" || data.status === "active");
  const showSecretInput = !data.secret_configured || replaceSecret;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4" />
          Customer-hosted database (BYOD)
        </CardTitle>
        <CardDescription>
          Optional for <strong>{orgName}</strong>. By default, organisations use the shared
          iProjectX data plane. When active, portfolio screens route tenant REST through a
          same-origin proxy to this customer-hosted database URL (any HTTPS
          Postgres/PostgREST-compatible API — including self-hosted or third-party hosts, not
          only one vendor). Auth, billing, SSO config, and white-label stay on iProjectX.
          Apply the same schema migrations on the customer DB before relying on portfolio features.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!data.kek_configured && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Set server env <code className="font-mono">BYOD_SECRETS_KEK</code> (≥32 characters)
              before saving secrets. Never prefix with <code className="font-mono">VITE_</code>.
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusClass(data.status)}`}
          >
            {statusLabel(data.status)}
          </span>
          {data.byod_active && (
            <span className="text-[11px] font-medium text-emerald-700">Routing flag: on</span>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor={`byod-url-${orgId}`}>Customer database URL</Label>
            <Input
              id={`byod-url-${orgId}`}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://db.customer.example.com  or  https://xxxx.supabase.co"
              className="font-mono text-xs"
              autoComplete="off"
            />
            <p className="text-[11px] text-muted-foreground">
              HTTPS endpoint for the customer database API (PostgREST-compatible). Not limited to
              a Supabase hostname.
            </p>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor={`byod-anon-${orgId}`}>API publishable key (optional)</Label>
            <Input
              id={`byod-anon-${orgId}`}
              value={publishable}
              onChange={(e) => setPublishable(e.target.value)}
              placeholder={
                data.publishable_key_configured
                  ? "Configured — paste to replace"
                  : "Publishable / anon API key if your host requires one"
              }
              className="font-mono text-xs"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`byod-secret-${orgId}`}>Service role / admin secret</Label>
              {data.secret_configured && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <EyeOff className="h-3 w-3" />
                  Stored {data.secret_hint ?? "••••"} — never shown again
                </span>
              )}
            </div>
            {showSecretInput ? (
              <Input
                id={`byod-secret-${orgId}`}
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Paste service-role / admin API secret (write-only)"
                className="font-mono text-xs"
                autoComplete="new-password"
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setReplaceSecret(true)}
                >
                  Replace secret
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={clearMut.isPending}
                  onClick={() => {
                    if (confirm("Clear the stored secret and disable BYOD for this org?")) {
                      clearMut.mutate();
                    }
                  }}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Clear secret
                </Button>
              </div>
            )}
            {replaceSecret && data.secret_configured && (
              <button
                type="button"
                className="text-[11px] text-primary hover:underline"
                onClick={() => {
                  setReplaceSecret(false);
                  setSecret("");
                }}
              >
                Cancel replace
              </button>
            )}
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor={`byod-notes-${orgId}`}>Notes (optional)</Label>
            <Input
              id={`byod-notes-${orgId}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Customer region, ticket ref, schema version…"
            />
          </div>
        </div>

        {data.last_error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {data.last_error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={saveMut.isPending || !data.kek_configured}
              onClick={() => {
                if ((replaceSecret || !data.secret_configured) && !secret.trim()) {
                  toast.error("Paste the service role secret to save.");
                  return;
                }
                if (!url.trim()) {
                  toast.error("Customer database URL is required.");
                  return;
                }
                saveMut.mutate();
              }}
            >
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {saveMut.isPending ? "Saving…" : "Save connection"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={testMut.isPending || !data.secret_configured}
              onClick={() => testMut.mutate()}
            >
              <PlugZap className="mr-1.5 h-3.5 w-3.5" />
              {testMut.isPending ? "Testing…" : "Test connection"}
            </Button>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Use customer DB</span>
            <Switch
              checked={data.byod_active}
              disabled={activeMut.isPending || (!data.byod_active && !canActivate)}
              onCheckedChange={(v) => activeMut.mutate(v)}
            />
          </label>
        </div>

        <p className="text-[11px] text-muted-foreground">
          The customer database must receive iProjectX schema migrations before portfolio data will
          work. Until then, Test connection only verifies URL + admin credentials.
          {data.last_tested_at
            ? ` Last tested ${new Date(data.last_tested_at).toLocaleString()}.`
            : ""}
        </p>
      </CardContent>
    </Card>
  );
}
