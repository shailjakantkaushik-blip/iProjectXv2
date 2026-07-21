import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isPlatformAdmin } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, Save, Trash2, Plus, X, Palette, Copy, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/platform/branding")({
  beforeLoad: () => {
    // client-only guard, actual RLS enforced server-side
  },
  component: PlatformBrandingPage,
});

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

type Swatch = { name: string; hex: string };
type Org = {
  id: string;
  name: string;
  slug: string | null;
  plan: string | null;
  brand_name: string | null;
  primary_color: string | null;
  accent_color: string | null;
  logo_url: string | null;
  palette: Swatch[] | null;
};

function PlatformBrandingPage() {
  const { roles } = useAuth();
  const qc = useQueryClient();
  const isPlat = isPlatformAdmin(roles);

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ["platform-orgs-branding"],
    enabled: isPlat,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id,name,slug,plan,brand_name,primary_color,accent_color,logo_url,palette")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Org[];
    },
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedId && orgs.length) setSelectedId(orgs[0].id);
  }, [orgs, selectedId]);

  const selected = useMemo(() => orgs.find((o) => o.id === selectedId) ?? null, [orgs, selectedId]);

  if (!isPlat) {
    return <div className="p-6 text-sm text-muted-foreground">Platform admin access required.</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Palette className="h-7 w-7" /> White Label & Branding
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage the display name, logo and colour palette for each organisation. Share each org’s
          dedicated sign-in link so login shows their white-label branding.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Organisations</CardTitle></CardHeader>
          <CardContent className="p-2">
            {isLoading && <div className="text-xs text-muted-foreground p-2">Loading…</div>}
            <div className="space-y-1 max-h-[70vh] overflow-auto">
              {orgs.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setSelectedId(o.id)}
                  className={`w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-muted flex items-center gap-2 ${selectedId === o.id ? "bg-muted font-semibold" : ""}`}
                >
                  <span
                    className="inline-block h-4 w-4 rounded border shrink-0"
                    style={{ background: o.primary_color || "#e5e7eb" }}
                  />
                  <span className="truncate">{o.brand_name || o.name}</span>
                </button>
              ))}
              {!isLoading && !orgs.length && (
                <div className="text-xs text-muted-foreground p-2">No organisations found.</div>
              )}
            </div>
          </CardContent>
        </Card>

        {selected && <BrandingEditor key={selected.id} org={selected} onSaved={() => qc.invalidateQueries({ queryKey: ["platform-orgs-branding"] })} />}
      </div>
    </div>
  );
}

function BrandingEditor({ org, onSaved }: { org: Org; onSaved: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [brandName, setBrandName] = useState(org.brand_name ?? org.name ?? "");
  const [primary, setPrimary] = useState(org.primary_color ?? "#2563eb");
  const [accent, setAccent] = useState(org.accent_color ?? "#7c3aed");
  const [logoUrl, setLogoUrl] = useState<string | null>(org.logo_url ?? null);
  const [palette, setPalette] = useState<Swatch[]>(
    Array.isArray(org.palette) ? org.palette : [],
  );

  const handleLogoPick = (file: File) => {
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Logo must be under 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("organizations")
        .update({
          brand_name: brandName || null,
          primary_color: primary,
          accent_color: accent,
          logo_url: logoUrl,
          palette: palette as any,
        })
        .eq("id", org.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Branding saved"); onSaved(); },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  const addSwatch = () =>
    setPalette((p) => [...p, { name: `Color ${p.length + 1}`, hex: "#64748b" }]);
  const updateSwatch = (i: number, patch: Partial<Swatch>) =>
    setPalette((p) => p.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const removeSwatch = (i: number) =>
    setPalette((p) => p.filter((_, idx) => idx !== i));

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const loginPath = org.slug ? `/o/${encodeURIComponent(org.slug)}/login` : "";
  const loginUrl = org.slug ? `${origin}${loginPath}` : "";
  const authQueryPath = org.slug ? `/auth?org=${encodeURIComponent(org.slug)}` : "";

  const copyLoginLink = async () => {
    if (!loginUrl) {
      toast.error("Set an organisation slug before sharing a login link.");
      return;
    }
    try {
      await navigator.clipboard.writeText(loginUrl);
      toast.success("White-label login link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{org.name}</CardTitle>
        <CardDescription>Slug: {org.slug ?? "—"} · Plan: {org.plan ?? "—"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <Label className="text-xs font-semibold uppercase tracking-wide">
            White-label sign-in link
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Share this URL with the organisation. It opens the sign-in page with their logo and
            brand name. Canonical equivalent:{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              {authQueryPath || "/auth?org=&lt;slug&gt;"}
            </code>
          </p>
          {org.slug ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input readOnly value={loginUrl} className="font-mono text-xs" />
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void copyLoginLink()}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
                </Button>
                <Button type="button" variant="ghost" size="sm" asChild>
                  <a href={loginPath} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
              This organisation has no slug yet. Set a slug under Organisations &amp; Users to enable
              a dedicated login link.
            </p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Brand display name</Label>
            <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder={org.name} />
            <p className="text-xs text-muted-foreground mt-1">Shown in the sidebar header instead of the legal org name.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Primary colour</Label>
              <div className="flex items-center gap-2">
                <Input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-10 w-14 p-1" />
                <Input value={primary} onChange={(e) => setPrimary(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Accent colour</Label>
              <div className="flex items-center gap-2">
                <Input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-10 w-14 p-1" />
                <Input value={accent} onChange={(e) => setAccent(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div>
          <Label>Organisation logo</Label>
          <div className="mt-2 flex items-center gap-4 rounded-lg border p-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-lg border bg-muted overflow-hidden">
              {logoUrl
                ? <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" />
                : <span className="text-xs text-muted-foreground text-center">No logo</span>}
            </div>
            <div className="flex-1 space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoPick(f); }}
              />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" /> Upload logo
                </Button>
                {logoUrl && (
                  <Button variant="ghost" size="sm" onClick={() => setLogoUrl(null)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">PNG / JPG / SVG / WebP · max 5 MB · square works best.</p>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label>Colour palette</Label>
            <Button size="sm" variant="outline" onClick={addSwatch}><Plus className="mr-1 h-3.5 w-3.5" /> Add colour</Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1 mb-2">
            Additional brand colours the org can reference in exports, reports and charts. Each swatch has a name and hex code.
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {palette.length === 0 && (
              <div className="text-xs text-muted-foreground rounded-md border p-3 md:col-span-2">
                No swatches yet. Add a colour to build the palette.
              </div>
            )}
            {palette.map((s, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border p-2">
                <Input type="color" value={s.hex} onChange={(e) => updateSwatch(i, { hex: e.target.value })} className="h-9 w-12 p-1" />
                <Input value={s.name} onChange={(e) => updateSwatch(i, { name: e.target.value })} placeholder="Name" className="h-9" />
                <Input value={s.hex} onChange={(e) => updateSwatch(i, { hex: e.target.value })} placeholder="#RRGGBB" className="h-9 font-mono text-xs" />
                <Button variant="ghost" size="icon" onClick={() => removeSwatch(i)} className="h-8 w-8 shrink-0"><X className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border p-4 bg-muted/30">
          <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Sidebar preview</div>
          <div className="flex items-center gap-3 rounded-md border bg-background p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md overflow-hidden" style={{ background: primary }}>
              {logoUrl
                ? <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" />
                : <span className="text-white text-sm font-bold">{(brandName || org.name || "?").slice(0, 2).toUpperCase()}</span>}
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: primary }}>{brandName || org.name}</div>
              <div className="text-[11px] text-muted-foreground">{org.plan ?? "free"} plan</div>
            </div>
          </div>
          {palette.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {palette.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded border bg-background px-2 py-1 text-[11px]">
                  <span className="inline-block h-3 w-3 rounded" style={{ background: s.hex }} />
                  <span className="font-medium">{s.name}</span>
                  <span className="text-muted-foreground font-mono">{s.hex}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            <Save className="mr-2 h-4 w-4" /> {mut.isPending ? "Saving…" : "Save branding"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
