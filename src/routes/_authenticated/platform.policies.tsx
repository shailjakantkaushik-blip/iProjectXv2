import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useState } from "react";
import { Plus, Edit2, Save, X, Eye, EyeOff, ChevronDown, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/platform/policies")({
  component: PoliciesPage,
});

const CATEGORIES = ["Legal", "Security & Compliance", "Customer Information", "Notices"] as const;

type Policy = {
  id: string;
  slug: string;
  title: string;
  category: string;
  body_markdown: string;
  sort_order: number;
  published: boolean;
  updated_at: string;
};

function PoliciesPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Policy>>({});
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({
    slug: "",
    title: "",
    category: "Legal",
    sort_order: "0",
    body_markdown: "# New Policy\n\nPlaceholder content.",
    published: false,
  });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ["platform_legal_policies"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("legal_policies")
        .select("*")
        .order("category")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Policy[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (patch: Partial<Policy> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await (supabase as any)
        .from("legal_policies")
        .update({ ...rest, updated_at: new Date().toISOString(), updated_by: user?.id })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Policy saved");
      setEditing(null);
      setEditForm({});
      qc.invalidateQueries({ queryKey: ["platform_legal_policies"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("legal_policies").insert({
        slug: newForm.slug,
        title: newForm.title,
        category: newForm.category,
        sort_order: parseInt(newForm.sort_order, 10) || 0,
        body_markdown: newForm.body_markdown,
        published: newForm.published,
        updated_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Policy created");
      setShowNew(false);
      setNewForm({
        slug: "",
        title: "",
        category: "Legal",
        sort_order: "0",
        body_markdown: "# New Policy\n\nPlaceholder content.",
        published: false,
      });
      qc.invalidateQueries({ queryKey: ["platform_legal_policies"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, published }: { id: string; published: boolean }) => {
      const { error } = await (supabase as any)
        .from("legal_policies")
        .update({ published, updated_at: new Date().toISOString(), updated_by: user?.id })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { published }) => {
      toast.success(published ? "Policy published" : "Policy unpublished");
      qc.invalidateQueries({ queryKey: ["platform_legal_policies"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function startEdit(p: Policy) {
    setEditing(p.id);
    setEditForm({ ...p });
  }

  function cancelEdit() {
    setEditing(null);
    setEditForm({});
  }

  // Group by category
  const byCategory: Record<string, Policy[]> = {};
  for (const p of policies) {
    if (!byCategory[p.category]) byCategory[p.category] = [];
    byCategory[p.category].push(p);
  }

  const published = policies.filter((p) => p.published).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Legal Policies</h1>
          <p className="text-sm text-muted-foreground">
            Manage platform policies. Published policies are visible to all users at{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">/legal/:slug</code>.
          </p>
        </div>
        <Button onClick={() => setShowNew((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" />
          New policy
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total policies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{policies.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Published</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{published}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Draft</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-muted-foreground">
              {policies.length - published}
            </p>
          </CardContent>
        </Card>
      </div>

      {showNew && (
        <Card>
          <CardHeader>
            <CardTitle>Create new policy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Slug (URL key) *</Label>
                <Input
                  value={newForm.slug}
                  onChange={(e) => setNewForm((f) => ({ ...f, slug: e.target.value }))}
                  placeholder="e.g. privacy-policy"
                  className="mt-1 font-mono"
                />
              </div>
              <div>
                <Label>Title *</Label>
                <Input
                  value={newForm.title}
                  onChange={(e) => setNewForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Privacy Policy"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Category</Label>
                <Select
                  value={newForm.category}
                  onValueChange={(v) => setNewForm((f) => ({ ...f, category: v }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sort order</Label>
                <Input
                  type="number"
                  value={newForm.sort_order}
                  onChange={(e) => setNewForm((f) => ({ ...f, sort_order: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label>Body (Markdown)</Label>
              <Textarea
                value={newForm.body_markdown}
                onChange={(e) => setNewForm((f) => ({ ...f, body_markdown: e.target.value }))}
                rows={10}
                className="mt-1 font-mono text-xs"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending ? "Creating…" : "Create policy"}
              </Button>
              <Button variant="outline" onClick={() => setShowNew(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byCategory).map(([category, items]) => (
            <div key={category}>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {category}
              </h2>
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {items.map((policy) => (
                      <PolicyRow
                        key={policy.id}
                        policy={policy}
                        isEditing={editing === policy.id}
                        editForm={editForm}
                        expanded={!!expanded[policy.id]}
                        onExpand={() =>
                          setExpanded((prev) => ({ ...prev, [policy.id]: !prev[policy.id] }))
                        }
                        onEdit={() => startEdit(policy)}
                        onCancel={cancelEdit}
                        onSave={() => upsert.mutate({ id: policy.id, ...editForm })}
                        onTogglePublish={() =>
                          togglePublish.mutate({ id: policy.id, published: !policy.published })
                        }
                        onEditFormChange={setEditForm}
                        isSaving={upsert.isPending}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PolicyRow({
  policy,
  isEditing,
  editForm,
  expanded,
  onExpand,
  onEdit,
  onCancel,
  onSave,
  onTogglePublish,
  onEditFormChange,
  isSaving,
}: {
  policy: Policy;
  isEditing: boolean;
  editForm: Partial<Policy>;
  expanded: boolean;
  onExpand: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onTogglePublish: () => void;
  onEditFormChange: (v: Partial<Policy>) => void;
  isSaving: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 px-5 py-3">
        <button
          type="button"
          onClick={onExpand}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{policy.title}</span>
            <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              /{policy.slug}
            </code>
            {policy.published ? (
              <Badge className="bg-green-100 text-green-800">Published</Badge>
            ) : (
              <Badge variant="outline">Draft</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Sort: {policy.sort_order} · Updated{" "}
            {new Date(policy.updated_at).toLocaleDateString("en-AU")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={onTogglePublish}
            title={policy.published ? "Unpublish" : "Publish"}
          >
            {policy.published ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
          {isEditing ? (
            <>
              <Button size="sm" onClick={onSave} disabled={isSaving} className="h-7">
                <Save className="mr-1 h-3.5 w-3.5" />
                {isSaving ? "Saving…" : "Save"}
              </Button>
              <Button size="sm" variant="outline" onClick={onCancel} className="h-7">
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={onEdit} className="h-7">
              <Edit2 className="mr-1 h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t bg-muted/20 px-5 py-4">
          {isEditing ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-xs">Title</Label>
                  <Input
                    value={editForm.title ?? ""}
                    onChange={(e) => onEditFormChange({ ...editForm, title: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Category</Label>
                  <Select
                    value={editForm.category ?? "Legal"}
                    onValueChange={(v) => onEditFormChange({ ...editForm, category: v })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Sort order</Label>
                  <Input
                    type="number"
                    value={editForm.sort_order ?? 0}
                    onChange={(e) =>
                      onEditFormChange({
                        ...editForm,
                        sort_order: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Body (Markdown)</Label>
                <Textarea
                  value={editForm.body_markdown ?? ""}
                  onChange={(e) =>
                    onEditFormChange({ ...editForm, body_markdown: e.target.value })
                  }
                  rows={16}
                  className="mt-1 font-mono text-xs"
                />
              </div>
            </div>
          ) : (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
              {policy.body_markdown}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
