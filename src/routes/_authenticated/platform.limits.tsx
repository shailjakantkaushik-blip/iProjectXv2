import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useState, useEffect, useMemo } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";

export const Route = createFileRoute("/_authenticated/platform/limits")({
  component: LimitsPage,
});

type Row = {
  id: string;
  name: string;
  plan_name: string | null;
  max_users: number | null;
  max_projects: number | null;
  override_max_users: number | null;
  override_max_projects: number | null;
  users_used: number;
  projects_used: number;
};

function LimitsPage() {
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["platform_limits"],
    queryFn: async (): Promise<Row[]> => {
      const [orgsRes, subsRes, plansRes, urRes, projRes] = await Promise.all([
        supabase.from("organizations").select("id,name,override_max_users,override_max_projects").order("name"),
        supabase.from("subscriptions").select("org_id,plan_id,status").in("status", ["active", "trialing", "past_due"]),
        supabase.from("billing_plans").select("id,name,max_users,max_projects"),
        supabase.from("user_roles").select("org_id,user_id"),
        supabase.from("projects").select("org_id"),
      ]);
      const orgs = orgsRes.data ?? [];
      const planById = new Map((plansRes.data ?? []).map((p: any) => [p.id, p]));
      const subByOrg = new Map((subsRes.data ?? []).map((s: any) => [s.org_id, s]));
      const usersByOrg = new Map<string, Set<string>>();
      for (const ur of urRes.data ?? []) {
        if (!ur.org_id) continue;
        if (!usersByOrg.has(ur.org_id)) usersByOrg.set(ur.org_id, new Set());
        usersByOrg.get(ur.org_id)!.add(ur.user_id);
      }
      const projByOrg = new Map<string, number>();
      for (const p of projRes.data ?? []) {
        if (!p.org_id) continue;
        projByOrg.set(p.org_id, (projByOrg.get(p.org_id) ?? 0) + 1);
      }
      return orgs.map((o: any) => {
        const sub: any = subByOrg.get(o.id);
        const plan: any = sub ? planById.get(sub.plan_id) : null;
        return {
          id: o.id,
          name: o.name,
          plan_name: plan?.name ?? null,
          max_users: plan?.max_users ?? null,
          max_projects: plan?.max_projects ?? null,
          override_max_users: o.override_max_users,
          override_max_projects: o.override_max_projects,
          users_used: usersByOrg.get(o.id)?.size ?? 0,
          projects_used: projByOrg.get(o.id) ?? 0,
        };
      });
    },
  });

  const save = useMutation({
    mutationFn: async ({ id, override_max_users, override_max_projects }: any) => {
      const { error } = await supabase
        .from("organizations")
        .update({ override_max_users, override_max_projects })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Overrides saved"); qc.invalidateQueries({ queryKey: ["platform_limits"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const columns: ColumnarColumn<Row>[] = useMemo(
    () => [
      { key: "name", label: "Organization" },
      { key: "plan_name", label: "Plan", getValue: (r) => r.plan_name || "" },
      {
        key: "users",
        label: "Users (used / limit)",
        getValue: (r) => {
          const eff = r.override_max_users ?? r.max_users;
          return `${r.users_used} / ${eff ?? "∞"}`;
        },
      },
      {
        key: "projects",
        label: "Projects (used / limit)",
        getValue: (r) => {
          const eff = r.override_max_projects ?? r.max_projects;
          return `${r.projects_used} / ${eff ?? "∞"}`;
        },
      },
      {
        key: "override_max_users",
        label: "Override users",
        getValue: (r) => r.override_max_users ?? "",
      },
      {
        key: "override_max_projects",
        label: "Override projects",
        getValue: (r) => r.override_max_projects ?? "",
      },
      { key: "actions", label: "", filterable: false, sortable: false },
    ],
    [],
  );
  const table = useColumnarTable(rows, columns);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Plan Limits & Usage</h1>
        <p className="text-sm text-muted-foreground">
          Enforced at the database. Users/projects insert is blocked when the effective limit is reached.
          Set a per-org override to grant custom capacity above (or below) the plan default.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {table.rows.length}
            {table.rows.length !== table.total ? ` of ${table.total}` : ""} organizations
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <ColumnarToolbar
            globalQ={table.globalQ}
            onGlobalQ={table.setGlobalQ}
            shown={table.rows.length}
            total={table.total}
            onClear={table.clearAll}
            placeholder="Search limits…"
          />
          <table className="st-table w-full min-w-[900px]">
            <thead>
              <tr>
                {columns.map((col) => (
                  <ColumnarTh
                    key={col.key}
                    column={col}
                    filter={table.filters[col.key]}
                    onFilter={(v) => table.setColumnFilter(col.key, v)}
                    sortKey={table.sortKey}
                    sortDir={table.sortDir}
                    onToggleSort={table.toggleSort}
                    className="text-left"
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Loading…</td></tr>
              ) : table.total === 0 ? (
                <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No organizations</td></tr>
              ) : table.rows.length === 0 ? (
                <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No matching organizations</td></tr>
              ) : table.rows.map((r) => <LimitRow key={r.id} row={r} onSave={save.mutate} />)}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function LimitRow({ row, onSave }: { row: Row; onSave: (v: any) => void }) {
  const [ou, setOu] = useState<string>(row.override_max_users?.toString() ?? "");
  const [op, setOp] = useState<string>(row.override_max_projects?.toString() ?? "");
  useEffect(() => {
    setOu(row.override_max_users?.toString() ?? "");
    setOp(row.override_max_projects?.toString() ?? "");
  }, [row.override_max_users, row.override_max_projects]);

  const effU = row.override_max_users ?? row.max_users;
  const effP = row.override_max_projects ?? row.max_projects;
  const userBad = effU != null && row.users_used >= effU;
  const projBad = effP != null && row.projects_used >= effP;
  const dirty = (ou || "") !== (row.override_max_users?.toString() ?? "") ||
                (op || "") !== (row.override_max_projects?.toString() ?? "");

  return (
    <tr>
      <td className="font-medium">{row.name}</td>
      <td>{row.plan_name ?? <span className="text-muted-foreground">— no plan —</span>}</td>
      <td>
        <span className={userBad ? "text-red-600 font-semibold" : ""}>
          {row.users_used} / {effU ?? "∞"}
        </span>
        {userBad ? <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-red-600" /> : effU != null && <CheckCircle2 className="ml-1 inline h-3.5 w-3.5 text-emerald-500" />}
      </td>
      <td>
        <span className={projBad ? "text-red-600 font-semibold" : ""}>
          {row.projects_used} / {effP ?? "∞"}
        </span>
        {projBad ? <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-red-600" /> : effP != null && <CheckCircle2 className="ml-1 inline h-3.5 w-3.5 text-emerald-500" />}
      </td>
      <td>
        <Input value={ou} onChange={(e) => setOu(e.target.value)} placeholder={row.max_users?.toString() ?? "unlimited"} className="h-8 w-24" inputMode="numeric" />
      </td>
      <td>
        <Input value={op} onChange={(e) => setOp(e.target.value)} placeholder={row.max_projects?.toString() ?? "unlimited"} className="h-8 w-24" inputMode="numeric" />
      </td>
      <td>
        <Button
          size="sm"
          disabled={!dirty}
          onClick={() => onSave({
            id: row.id,
            override_max_users: ou === "" ? null : Math.max(0, parseInt(ou, 10) || 0),
            override_max_projects: op === "" ? null : Math.max(0, parseInt(op, 10) || 0),
          })}
        >
          Save
        </Button>
      </td>
    </tr>
  );
}
