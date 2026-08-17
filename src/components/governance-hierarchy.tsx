import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SectionFrame, SectionTitle } from "@/components/streamlit";
import {
  type AlignmentGovernanceBucket,
  type ForumMemberView,
  type ForumNode,
  type GovernanceProject,
  buildGovernanceHierarchy,
  forumPeopleLine,
  loadGovernanceChannels,
  projectOptionsLabel,
  scopeLabel,
} from "@/lib/governance-forums";

function ForumCard({ node }: { node: ForumNode }) {
  const c = node.channel;
  return (
    <div className="rounded-md border border-border/70 bg-background px-3 py-2 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{c.name}</span>
        <span className="text-[11px] text-muted-foreground">
          {c.cadence || "—"}
          {c.next_meeting ? ` · next ${c.next_meeting}` : ""}
          {c.last_meeting ? ` · prev ${c.last_meeting}` : ""}
        </span>
      </div>
      <p className="mt-1 text-[12px] text-muted-foreground">
        <span className="font-medium text-foreground">Members: </span>
        {forumPeopleLine(node)}
      </p>
      {c.purpose ? <p className="mt-0.5 text-[11px] text-muted-foreground">{c.purpose}</p> : null}
    </div>
  );
}

function ForumList({ forums, empty }: { forums: ForumNode[]; empty: string }) {
  if (!forums.length) {
    return <p className="text-xs text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="space-y-2">
      {forums.map((n) => (
        <ForumCard key={n.channel.id} node={n} />
      ))}
    </div>
  );
}

export function GovernanceBucketTree({
  buckets,
  orgWide,
  showOrgWide = false,
}: {
  buckets: AlignmentGovernanceBucket[];
  orgWide?: ForumNode[];
  showOrgWide?: boolean;
}) {
  if (!buckets.length && !(showOrgWide && orgWide?.length)) {
    return (
      <p className="text-sm text-muted-foreground">
        No governance forums for the current Strategic Alignment / program / project set.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {buckets.map((sa) => (
        <section key={sa.portfolio} className="rounded-lg border border-border bg-surface p-4">
          <header className="mb-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {scopeLabel("strategic_alignment")}
            </p>
            <h3 className="text-base font-semibold">{sa.portfolio}</h3>
          </header>
          <ForumList
            forums={sa.forums}
            empty="No Strategic Alignment forum yet — org admin can add one, or it is created with the first project in this bucket."
          />
          <div className="mt-4 space-y-4">
            {sa.programs.map((prog) => (
              <section
                key={prog.program}
                className="ml-0 rounded-md border border-border/60 p-3 sm:ml-3"
              >
                <header className="mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {scopeLabel("program")}
                  </p>
                  <h4 className="text-sm font-semibold">{prog.program}</h4>
                </header>
                <ForumList
                  forums={prog.forums}
                  empty="No program forum yet — created with the first project in this program."
                />
                <div className="mt-3 space-y-3">
                  {prog.projects.map((pb) => (
                    <section key={pb.project.id} className="rounded-md bg-background/60 p-3">
                      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                            Project
                          </p>
                          <h5 className="text-sm font-semibold">
                            {projectOptionsLabel(pb.project)}
                          </h5>
                        </div>
                        <Link
                          to="/app/projects/$id"
                          params={{ id: pb.project.id }}
                          search={{ tab: "governance" }}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Open RAID
                        </Link>
                      </header>
                      <ForumList
                        forums={pb.forums}
                        empty="No project forums yet — they are created when the project is saved."
                      />
                    </section>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      ))}
      {showOrgWide && orgWide && orgWide.length > 0 && (
        <section className="rounded-lg border border-dashed border-border p-4">
          <header className="mb-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Organisation
            </p>
            <h3 className="text-base font-semibold">Not tied to a Strategic Alignment</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Leftover org-wide forums. They are not part of the project → program → Strategic
              Alignment buckets.
            </p>
          </header>
          <ForumList forums={orgWide} empty="" />
        </section>
      )}
    </div>
  );
}

export function ProjectGovernanceChain({
  project,
  buckets,
}: {
  project: GovernanceProject;
  buckets: AlignmentGovernanceBucket[];
}) {
  const sa = buckets.find((b) => b.portfolio === (project.portfolio || "").trim());
  if (!sa) {
    return (
      <p className="text-sm text-muted-foreground">
        This project has no Strategic Alignment value, so it is not in a governance bucket yet.
      </p>
    );
  }
  const prog = sa.programs.find((p) => p.program === (project.program || "").trim());
  const pb = prog?.projects.find((x) => x.project.id === project.id);
  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Escalates to
        </p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>
            <span className="font-medium">{scopeLabel("strategic_alignment")}: </span>
            {sa.portfolio}
          </li>
          {project.program ? (
            <li>
              <span className="font-medium">Program: </span>
              {project.program}
            </li>
          ) : null}
          <li>
            <span className="font-medium">Project: </span>
            {projectOptionsLabel(project)}
          </li>
        </ol>
      </div>
      <ForumList forums={sa.forums} empty="No Strategic Alignment forum." />
      {prog ? <ForumList forums={prog.forums} empty="No program forum." /> : null}
      {pb ? <ForumList forums={pb.forums} empty="No project forums." /> : null}
    </div>
  );
}

export function ProjectGovernanceForums({
  project,
  orgId,
}: {
  project: GovernanceProject;
  orgId: string;
}) {
  const { data: channels = [] } = useQuery({
    queryKey: ["governance_channels", orgId],
    queryFn: async () => (await loadGovernanceChannels()).channels,
    enabled: !!orgId,
  });

  const { data: resources = [] } = useQuery({
    queryKey: ["governance_channel_resources", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("resources").select("id,name").order("name");
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
    enabled: !!orgId,
  });

  const { data: members = [] } = useQuery({
    queryKey: ["governance_forum_members", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("governance_forum_members")
        .select("id,channel_id,resource_id,role");
      if (error) {
        if (/governance_forum_members|schema cache/i.test(error.message)) return [];
        throw error;
      }
      return (data || []) as {
        id: string;
        channel_id: string;
        resource_id: string;
        role: string;
      }[];
    },
    enabled: !!orgId,
  });

  const memberViews: ForumMemberView[] = members.map((m) => ({
    channel_id: m.channel_id,
    resource_id: m.resource_id,
    role: m.role,
    name: resources.find((r) => r.id === m.resource_id)?.name || "Unknown",
  }));
  const buckets = buildGovernanceHierarchy([project], channels, memberViews);

  return (
    <SectionFrame>
      <div className="mb-2 flex items-center justify-between gap-2">
        <SectionTitle>Governance forums</SectionTitle>
        <Link
          to="/app/governance-channels"
          className="text-xs font-medium text-primary hover:underline"
        >
          My hierarchy
        </Link>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        This project&apos;s forums, plus the program and Strategic Alignment forums it escalates to,
        with members at each level.
      </p>
      <ProjectGovernanceChain project={project} buckets={buckets} />
    </SectionFrame>
  );
}
