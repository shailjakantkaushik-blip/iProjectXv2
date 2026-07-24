import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ExternalLink, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/legal")({
  component: LegalPage,
});

const CATEGORY_ORDER = [
  "Legal",
  "Security & Compliance",
  "Customer Information",
  "Notices",
] as const;

function LegalPage() {
  const { data: policies = [], isLoading } = useQuery({
    queryKey: ["published_policies"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("legal_policies")
        .select("slug,title,category,sort_order,updated_at")
        .eq("published", true)
        .order("category")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as {
        slug: string;
        title: string;
        category: string;
        sort_order: number;
        updated_at: string;
      }[];
    },
  });

  const byCategory: Record<string, typeof policies> = {};
  for (const p of policies) {
    if (!byCategory[p.category]) byCategory[p.category] = [];
    byCategory[p.category].push(p);
  }

  const orderedCategories = [
    ...CATEGORY_ORDER.filter((c) => byCategory[c]?.length),
    ...Object.keys(byCategory).filter(
      (c) => !(CATEGORY_ORDER as readonly string[]).includes(c),
    ),
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Legal & Policies</h1>
        <p className="text-sm text-muted-foreground">
          Platform legal documents, compliance policies, and notices.
        </p>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : policies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground">No published policies yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {orderedCategories.map((category) => (
            <section key={category}>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {category}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {byCategory[category]?.map((pol) => (
                  <PolicyCard key={pol.slug} policy={pol} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function PolicyCard({
  policy,
}: {
  policy: { slug: string; title: string; category: string; updated_at: string };
}) {
  return (
    <Link
      to="/legal/$slug"
      params={{ slug: policy.slug }}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center justify-between rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/5 hover:border-accent/40"
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
          <FileText className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="font-medium leading-snug">{policy.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Updated{" "}
            {new Date(policy.updated_at).toLocaleDateString("en-AU", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
      </div>
      <ExternalLink className="ml-3 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent" />
    </Link>
  );
}
