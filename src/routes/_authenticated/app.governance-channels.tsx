import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth, isAdmin } from "@/lib/auth-context";
import { PageHeading, SectionFrame, SectionTitle, KpiCard } from "@/components/streamlit";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useColumnarTable, type ColumnarColumn } from "@/hooks/use-columnar-table";
import { ColumnarTh } from "@/components/columnar-table-header";
import { ColumnarToolbar } from "@/components/columnar-toolbar";
import { GOVERNANCE_CADENCES } from "@/lib/ops-enhancements";
import { GovernanceBucketTree } from "@/components/governance-hierarchy";
import {
  type ForumMemberView,
  type GovernanceChannel,
  type GovernanceProject,
  type GovernanceScopeLevel,
  GOVERNANCE_SCOPE_LABEL,
  GOVERNANCE_SCOPE_LEVELS,
  buildGovernanceHierarchy,
  canManageGovernanceChannel,
  channelsForProjects,
  filterGovernanceChannels,
  forumPeopleLine,
  isMissingCadenceWindowColumn,
  loadGovernanceChannels,
  orgWideForums,
  projectOptionsLabel,
  resolveCadenceWindow,
  resolveMyProjectIds,
  scopeLabel,
  withCadenceWindowDates,
  expandCadenceMeetings,
} from "@/lib/governance-forums";

export const Route = createFileRoute("/_authenticated/app/governance-channels")({
  component: GovernanceChannelsPage,
});

type Channel = GovernanceChannel;

type ForumMember = {
  id: string;
  channel_id: string;
  resource_id: string;
  role: string;
};

type ForumTemplate = {
  id: string;
  org_id: string;
  name: string;
  cadence: string | null;
  scope_level: string;
  purpose: string | null;
  audience: string | null;
  default_chair: string | null;
  sort_order: number;
  is_active: boolean;
};

type ResourceOpt = {
  id: string;
  name: string;
  role: string | null;
  status: string | null;
  user_id?: string | null;
};

const CADENCES = [...GOVERNANCE_CADENCES];
const STATUSES = ["Active", "Paused", "Retired"];

function GovernanceChannelsPage() {
  const { organization, user, profile, roles } = useAuth();
  const admin = isAdmin(roles);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Channel> | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [chairResourceId, setChairResourceId] = useState<string>("");
  const [editingTemplate, setEditingTemplate] = useState<Partial<ForumTemplate> | null>(null);
  const [myProjectsOnly, setMyProjectsOnly] = useState(true);
  const [filterProject, setFilterProject] = useState("all");
  const [filterProgram, setFilterProgram] = useState("all");
  const [filterPortfolio, setFilterPortfolio] = useState("all");
  const [filterStream, setFilterStream] = useState("all");
  const [filterCadence, setFilterCadence] = useState("all");
  const [filterScope, setFilterScope] = useState("all");

  const {
    data: channelState,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["governance_channels", organization?.id],
    queryFn: async () => loadGovernanceChannels(),
    enabled: !!organization,
    retry: 1,
  });

  const channels = useMemo(() => channelState?.channels ?? [], [channelState]);
  const scoped = channelState?.scoped ?? false;

  const { data: projects = [] } = useQuery({
    queryKey: ["governance_channel_projects", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,name,project_code,program,portfolio,pm_user_id,planned_end_date")
        .order("project_code");
      if (error) throw error;
      return (data || []) as GovernanceProject[];
    },
    enabled: !!organization,
  });

  const { data: streams = [] } = useQuery({
    queryKey: ["governance_channel_streams", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_streams")
        .select("id,project_id,name")
        .order("name");
      if (error) throw error;
      return (data || []) as { id: string; project_id: string; name: string }[];
    },
    enabled: !!organization,
  });

  const { data: resources = [] } = useQuery({
    queryKey: ["governance_channel_resources", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resources")
        .select("id,name,role,status,user_id")
        .order("name");
      if (error) throw error;
      return (data || []) as ResourceOpt[];
    },
    enabled: !!organization,
  });

  const myResourceIds = useMemo(
    () => resources.filter((r) => r.user_id && r.user_id === user?.id).map((r) => r.id),
    [resources, user?.id],
  );

  const { data: allocationProjectIds = [] } = useQuery({
    queryKey: ["governance_my_allocations", organization?.id, myResourceIds.join(",")],
    queryFn: async () => {
      if (!myResourceIds.length) return [] as string[];
      const { data, error } = await supabase
        .from("resource_allocations")
        .select("project_id,resource_id")
        .in("resource_id", myResourceIds);
      if (error) throw error;
      return [...new Set((data || []).map((r) => r.project_id).filter(Boolean))];
    },
    enabled: !!organization && myResourceIds.length > 0,
  });

  const { data: stakeholderProjectIds = [] } = useQuery({
    queryKey: ["governance_my_stakeholders", organization?.id, profile?.email],
    queryFn: async () => {
      const email = (profile?.email || "").trim();
      if (!email) return [] as string[];
      const { data, error } = await supabase.from("stakeholders").select("project_id,email");
      if (error) throw error;
      const needle = email.toLowerCase();
      return [
        ...new Set(
          (data || [])
            .filter(
              (s) =>
                String(s.email || "")
                  .trim()
                  .toLowerCase() === needle,
            )
            .map((s) => s.project_id)
            .filter(Boolean),
        ),
      ];
    },
    enabled: !!organization && !!profile?.email,
  });

  const { data: members = [] } = useQuery({
    queryKey: ["governance_forum_members", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("governance_forum_members")
        .select("id,channel_id,resource_id,role");
      if (error) {
        if (/governance_forum_members|schema cache/i.test(error.message))
          return [] as ForumMember[];
        throw error;
      }
      return (data || []) as ForumMember[];
    },
    enabled: !!organization && scoped,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["governance_forum_templates", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("governance_forum_templates")
        .select(
          "id,org_id,name,cadence,scope_level,purpose,audience,default_chair,sort_order,is_active",
        )
        .order("sort_order");
      if (error) {
        if (/governance_forum_templates|schema cache/i.test(error.message))
          return [] as ForumTemplate[];
        throw error;
      }
      return (data || []) as ForumTemplate[];
    },
    enabled: !!organization && scoped && admin,
  });

  const myProjectIds = useMemo(
    () =>
      resolveMyProjectIds({
        userId: user?.id,
        projects,
        myResourceIds,
        allocationProjectIds,
        stakeholderProjectIds,
      }),
    [user?.id, projects, myResourceIds, allocationProjectIds, stakeholderProjectIds],
  );

  const baseProjects = useMemo(() => {
    if (!myProjectsOnly) return projects;
    if (!myProjectIds.length) return [];
    const mine = new Set(myProjectIds);
    return projects.filter((p) => mine.has(p.id));
  }, [projects, myProjectsOnly, myProjectIds]);

  const portfolios = useMemo(
    () => [...new Set(baseProjects.map((p) => p.portfolio).filter(Boolean) as string[])].sort(),
    [baseProjects],
  );
  const programs = useMemo(() => {
    const src =
      filterPortfolio === "all"
        ? baseProjects
        : baseProjects.filter((p) => p.portfolio === filterPortfolio);
    return [...new Set(src.map((p) => p.program).filter(Boolean) as string[])].sort();
  }, [baseProjects, filterPortfolio]);
  const projectChoices = useMemo(() => {
    return baseProjects.filter((p) => {
      if (filterPortfolio !== "all" && p.portfolio !== filterPortfolio) return false;
      if (filterProgram !== "all" && p.program !== filterProgram) return false;
      return true;
    });
  }, [baseProjects, filterPortfolio, filterProgram]);
  const streamNames = useMemo(
    () => [...new Set(streams.map((s) => s.name).filter(Boolean))].sort(),
    [streams],
  );

  const focusProjects = useMemo(() => {
    return baseProjects.filter((p) => {
      if (filterPortfolio !== "all" && p.portfolio !== filterPortfolio) return false;
      if (filterProgram !== "all" && p.program !== filterProgram) return false;
      if (filterProject !== "all" && p.id !== filterProject) return false;
      if (filterStream !== "all") {
        const has = streams.some((s) => s.project_id === p.id && s.name === filterStream);
        if (!has) return false;
      }
      return true;
    });
  }, [baseProjects, filterPortfolio, filterProgram, filterProject, filterStream, streams]);

  const bucketChannels = useMemo(
    () => channelsForProjects(channels, focusProjects),
    [channels, focusProjects],
  );

  const visible = useMemo(
    () =>
      filterGovernanceChannels(
        bucketChannels,
        {
          cadence: filterCadence === "all" ? undefined : filterCadence,
          scope: filterScope === "all" ? undefined : filterScope,
        },
        focusProjects,
        streams,
      ),
    [bucketChannels, filterCadence, filterScope, focusProjects, streams],
  );

  const memberViews: ForumMemberView[] = useMemo(() => {
    const byId = new Map(resources.map((r) => [r.id, r.name]));
    return members.map((m) => ({
      channel_id: m.channel_id,
      resource_id: m.resource_id,
      role: m.role,
      name: byId.get(m.resource_id) || "Unknown",
    }));
  }, [members, resources]);

  const hierarchy = useMemo(
    () => buildGovernanceHierarchy(focusProjects, visible, memberViews),
    [focusProjects, visible, memberViews],
  );
  const leftoverOrgWide = useMemo(
    () => (myProjectsOnly ? [] : orgWideForums(channels, memberViews)),
    [myProjectsOnly, channels, memberViews],
  );

  const manageOpts = { isAdmin: admin, userId: user?.id, projects };
  const canAdd =
    admin || (scoped && projects.some((p) => p.pm_user_id && p.pm_user_id === user?.id));

  const openEdit = (c: Partial<Channel>) => {
    let next = { ...c };
    if (!next.id) {
      const cadence = next.cadence || "Monthly";
      const proj = next.project_id ? projects.find((p) => p.id === next.project_id) : undefined;
      next = withCadenceWindowDates({
        ...next,
        cadence,
        cadence_end: proj?.planned_end_date || next.cadence_end || null,
      });
    } else {
      next = withCadenceWindowDates(next);
    }
    setEditing(next);
    if (next.id) {
      const mine = members.filter((m) => m.channel_id === next.id);
      setMemberIds(mine.map((m) => m.resource_id));
      setChairResourceId(mine.find((m) => m.role === "chair")?.resource_id || "");
    } else {
      setMemberIds([]);
      setChairResourceId("");
      if (!admin) {
        const mine = projects.filter((p) => p.pm_user_id === user?.id);
        const first = mine[0];
        setEditing(
          withCadenceWindowDates({
            ...next,
            scope_level: "project",
            project_id: first?.id || "",
            program: first?.program || null,
            portfolio: first?.portfolio || null,
            cadence_end: first?.planned_end_date || next.cadence_end || null,
          }),
        );
      }
    }
  };

  const saveMembers = async (channelId: string, orgId: string, chairName: string | null) => {
    const { error: delErr } = await supabase
      .from("governance_forum_members")
      .delete()
      .eq("channel_id", channelId);
    if (delErr && !/governance_forum_members|schema cache/i.test(delErr.message)) throw delErr;
    if (!memberIds.length) return;
    const rows = memberIds.map((resource_id) => ({
      org_id: orgId,
      channel_id: channelId,
      resource_id,
      role: resource_id === chairResourceId ? "chair" : "member",
    }));
    if (chairResourceId && !memberIds.includes(chairResourceId)) {
      rows.push({
        org_id: orgId,
        channel_id: channelId,
        resource_id: chairResourceId,
        role: "chair",
      });
    }
    const { error: insErr } = await supabase.from("governance_forum_members").insert(rows);
    if (insErr && !/governance_forum_members|schema cache/i.test(insErr.message)) throw insErr;
    void chairName;
  };

  const save = useMutation({
    mutationFn: async (v: Partial<Channel>) => {
      const scope = (v.scope_level || "strategic_alignment") as GovernanceScopeLevel;
      const proj = projects.find((p) => p.id === v.project_id);
      const chairFromResource = resources.find((r) => r.id === chairResourceId)?.name;
      const synced = withCadenceWindowDates(v);
      const payload: Database["public"]["Tables"]["governance_channels"]["Update"] = {
        name: synced.name!,
        cadence: synced.cadence || null,
        audience: synced.audience || null,
        purpose: synced.purpose || null,
        chair: chairFromResource || synced.chair || null,
        next_meeting: synced.next_meeting || null,
        last_meeting: synced.last_meeting || null,
        cadence_start: synced.cadence_start || null,
        cadence_end: synced.cadence_end || null,
        parent_channel_id: synced.parent_channel_id || null,
        status: synced.status || "Active",
      };
      if (scoped) {
        payload.scope_level = scope;
        payload.project_id = scope === "project" ? synced.project_id || null : null;
        payload.program =
          scope === "program"
            ? synced.program || null
            : scope === "project"
              ? proj?.program || null
              : null;
        payload.portfolio =
          scope === "strategic_alignment"
            ? synced.portfolio || null
            : scope === "project"
              ? proj?.portfolio || null
              : null;
      }
      const withoutWindow = { ...payload };
      delete withoutWindow.cadence_start;
      delete withoutWindow.cadence_end;
      let channelId = synced.id;
      if (synced.id) {
        let { error } = await supabase.from("governance_channels").update(payload).eq("id", synced.id);
        if (error && isMissingCadenceWindowColumn(error)) {
          ({ error } = await supabase
            .from("governance_channels")
            .update(withoutWindow)
            .eq("id", synced.id));
        }
        if (error) throw error;
      } else {
        const insertFull = {
          ...payload,
          org_id: organization!.id,
          name: synced.name!,
        } as Database["public"]["Tables"]["governance_channels"]["Insert"];
        let { data, error } = await supabase
          .from("governance_channels")
          .insert(insertFull)
          .select("id")
          .single();
        if (error && isMissingCadenceWindowColumn(error)) {
          const insertMin = { ...insertFull };
          delete insertMin.cadence_start;
          delete insertMin.cadence_end;
          ({ data, error } = await supabase
            .from("governance_channels")
            .insert(insertMin)
            .select("id")
            .single());
        }
        if (error) throw error;
        if (!data?.id) throw new Error("Forum was not created");
        channelId = data.id;
      }
      if (scoped && channelId) {
        await saveMembers(channelId, organization!.id, payload.chair ?? null);
      }
    },
    onSuccess: () => {
      toast.success("Forum saved");
      qc.invalidateQueries({ queryKey: ["governance_channels"] });
      qc.invalidateQueries({ queryKey: ["governance_forum_members"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("governance_channels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Forum deleted");
      qc.invalidateQueries({ queryKey: ["governance_channels"] });
      qc.invalidateQueries({ queryKey: ["governance_forum_members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveTemplate = useMutation({
    mutationFn: async (v: Partial<ForumTemplate>) => {
      const payload = {
        name: v.name!,
        cadence: v.cadence || null,
        scope_level: v.scope_level || "project",
        purpose: v.purpose || null,
        audience: v.audience || null,
        default_chair: v.default_chair || null,
        sort_order: Number(v.sort_order) || 0,
        is_active: v.is_active !== false,
      };
      if (v.id) {
        const { error } = await supabase
          .from("governance_forum_templates")
          .update(payload)
          .eq("id", v.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("governance_forum_templates")
          .insert({ ...payload, org_id: organization!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Template saved");
      qc.invalidateQueries({ queryKey: ["governance_forum_templates"] });
      setEditingTemplate(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("governance_forum_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template deleted");
      qc.invalidateQueries({ queryKey: ["governance_forum_templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns: ColumnarColumn<Channel>[] = useMemo(
    () => [
      { key: "name", label: "Forum" },
      {
        key: "scope_level",
        label: "Category",
        getValue: (c) => scopeLabel(c.scope_level),
      },
      {
        key: "scope_of",
        label: "Applies to",
        getValue: (c) => channelAppliesTo(c, projects),
      },
      { key: "cadence", label: "Cadence" },
      { key: "cadence_start", label: "Cadence start" },
      { key: "cadence_end", label: "Cadence end" },
      { key: "parent_channel_id", label: "Escalates to" },
      { key: "chair", label: "Chair" },
      {
        key: "members",
        label: "Members",
        getValue: (c) =>
          forumPeopleLine({
            channel: c,
            members: memberViews.filter((m) => m.channel_id === c.id),
          }),
      },
      { key: "last_meeting", label: "Previous meeting" },
      { key: "next_meeting", label: "Next meeting" },
      { key: "status", label: "Status", getValue: (c) => c.status || "Active" },
    ],
    [projects, memberViews],
  );
  const table = useColumnarTable(visible, columns);

  const membersByChannel = useMemo(() => {
    const map = new Map<string, ForumMember[]>();
    for (const m of members) {
      const list = map.get(m.channel_id) || [];
      list.push(m);
      map.set(m.channel_id, list);
    }
    return map;
  }, [members]);

  return (
    <div className="space-y-6">
      <PageHeading
        title="Governance Channels"
        subtitle="Same buckets as the rest of the app: Strategic Alignment → Program → Project. Starts from the projects you are on, with the forum hierarchy and members."
      />

      {isError && (
        <div className="rounded-md border border-border bg-surface px-4 py-3 text-sm" role="status">
          <p className="font-medium text-foreground">Data not available</p>
          <p className="mt-1 text-muted-foreground">
            Governance channels could not be loaded
            {error instanceof Error && error.message ? ` (${error.message})` : ""}. The table may be
            missing or empty after a database change.
          </p>
          <button type="button" className="st-btn-primary mt-3" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard
          label="Active Forums"
          value={visible.filter((c) => (c.status || "Active") === "Active").length}
        />
        <KpiCard
          label="Project Forums"
          value={visible.filter((c) => c.scope_level === "project").length}
        />
        <KpiCard
          label="Program Forums"
          value={visible.filter((c) => c.scope_level === "program").length}
        />
        <KpiCard
          label="Strategic Alignment"
          value={
            visible.filter(
              (c) => (c.scope_level || "strategic_alignment") === "strategic_alignment",
            ).length
          }
        />
      </div>

      <SectionFrame>
        <SectionTitle>Filters</SectionTitle>
        <p className="mb-3 text-xs text-muted-foreground">
          Pick a Strategic Alignment, then a program, then a project — the same buckets used on
          Executive Dashboard. Forums at each level (and their members) follow that tree. Stream
          only narrows which projects are included; it is not a fourth forum layer.
        </p>
        <label className="mb-3 flex items-center gap-2 text-sm">
          <Checkbox
            checked={myProjectsOnly}
            onCheckedChange={(on) => setMyProjectsOnly(Boolean(on))}
          />
          <span>
            Only projects I am on
            {myProjectIds.length ? ` (${myProjectIds.length})` : ""}
            <span className="text-muted-foreground"> — PM, allocated resource, or stakeholder</span>
          </span>
        </label>
        {myProjectsOnly && myProjectIds.length === 0 && (
          <p className="mb-3 text-xs text-muted-foreground">
            You are not listed as PM, allocated resource, or stakeholder on any project yet. Switch
            off the checkbox to see every project you can view.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <FilterSelect
            label="Strategic Alignment"
            value={filterPortfolio}
            onChange={(v) => {
              setFilterPortfolio(v);
              setFilterProgram("all");
              setFilterProject("all");
            }}
            items={portfolios.map((p) => ({ value: p, label: p }))}
          />
          <FilterSelect
            label="Program"
            value={filterProgram}
            onChange={(v) => {
              setFilterProgram(v);
              setFilterProject("all");
            }}
            items={programs.map((p) => ({ value: p, label: p }))}
          />
          <FilterSelect
            label="Project"
            value={filterProject}
            onChange={(v) => {
              setFilterProject(v);
              if (v !== "all") {
                const p = projects.find((x) => x.id === v);
                if (p?.portfolio) setFilterPortfolio(p.portfolio);
                if (p?.program) setFilterProgram(p.program);
              }
            }}
            items={projectChoices.map((p) => ({ value: p.id, label: projectOptionsLabel(p) }))}
          />
          <FilterSelect
            label="Stream"
            value={filterStream}
            onChange={setFilterStream}
            items={streamNames.map((s) => ({ value: s, label: s }))}
          />
          <FilterSelect
            label="Category"
            value={filterScope}
            onChange={setFilterScope}
            items={GOVERNANCE_SCOPE_LEVELS.map((s) => ({
              value: s,
              label: GOVERNANCE_SCOPE_LABEL[s],
            }))}
          />
          <FilterSelect
            label="Cadence"
            value={filterCadence}
            onChange={setFilterCadence}
            items={CADENCES.map((c) => ({ value: c, label: c }))}
          />
        </div>
      </SectionFrame>

      <Tabs defaultValue="hierarchy">
        <TabsList>
          <TabsTrigger value="hierarchy">My hierarchy</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="register">Register</TabsTrigger>
          {admin && scoped && <TabsTrigger value="templates">Templates</TabsTrigger>}
        </TabsList>

        <TabsContent value="hierarchy" className="mt-4">
          <SectionFrame>
            <SectionTitle>Governance hierarchy</SectionTitle>
            <p className="mb-3 text-xs text-muted-foreground">
              Strategic Alignment forum at the top, then the program board, then each project&apos;s
              forums — with chair and members at every level.
            </p>
            <GovernanceBucketTree
              buckets={hierarchy}
              orgWide={leftoverOrgWide}
              showOrgWide={!myProjectsOnly}
            />
          </SectionFrame>
        </TabsContent>

        <TabsContent value="calendar" className="mt-4 space-y-4">
          <SectionFrame>
            <SectionTitle>Cadence calendar</SectionTitle>
            <p className="mb-2 text-xs text-muted-foreground">
              Meetings are generated from cadence start through placeholder end. Weekly stays on the
              start weekday; next meeting is the next date on that series (previous is the one
              before it). Child forums escalate to their parent.
            </p>
            <CadenceMonthCalendar channels={visible} allChannels={channels} />
            <div className="mt-4">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Escalation hierarchy
              </h4>
              <HierarchyList channels={visible} allChannels={channels} projects={projects} />
            </div>
          </SectionFrame>
        </TabsContent>

        <TabsContent value="register" className="mt-4">
          <SectionFrame>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <SectionTitle>Governance Framework</SectionTitle>
              {canAdd && (
                <Button size="sm" onClick={() => openEdit({})}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Forum
                </Button>
              )}
            </div>
            <p className="mt-2 mb-1 text-xs text-muted-foreground">
              Cadence start and placeholder end drive the calendar. Meetings are generated on
              weekdays from the start date through the end date using the forum cadence (Weekly,
              Monthly, and so on). Extend the end date to keep the series going.
            </p>
            <div className="mt-3">
              <ColumnarToolbar
                globalQ={table.globalQ}
                onGlobalQ={table.setGlobalQ}
                shown={table.rows.length}
                total={table.total}
                dirty={table.isDirty}
                onClear={table.clearAll}
                placeholder="Search forums…"
              />
              <div className="overflow-x-auto">
                <table className="st-table">
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
                        />
                      ))}
                      <th className="w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading && (
                      <tr>
                        <td colSpan={columns.length + 1} className="text-center text-muted-foreground p-4">
                          Loading…
                        </td>
                      </tr>
                    )}
                    {!isLoading && table.total === 0 && (
                      <tr>
                        <td colSpan={columns.length + 1} className="text-center text-muted-foreground p-4">
                          No forums match the current filters.
                        </td>
                      </tr>
                    )}
                    {!isLoading && table.total > 0 && table.rows.length === 0 && (
                      <tr>
                        <td colSpan={columns.length + 1} className="text-center text-muted-foreground p-4">
                          No forums match search.
                        </td>
                      </tr>
                    )}
                    {table.rows.map((c) => {
                      const manageable = canManageGovernanceChannel(c, manageOpts);
                      const memberCount = membersByChannel.get(c.id)?.length || 0;
                      return (
                        <tr key={c.id}>
                          <td className="font-medium">
                            {c.name}
                            {memberCount > 0 && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {memberCount} member{memberCount === 1 ? "" : "s"}
                              </span>
                            )}
                          </td>
                          <td>{scopeLabel(c.scope_level)}</td>
                          <td>{channelAppliesTo(c, projects)}</td>
                          <td>{c.cadence || "—"}</td>
                          <td className="whitespace-nowrap">{c.cadence_start || "—"}</td>
                          <td className="whitespace-nowrap">{c.cadence_end || "—"}</td>
                          <td>{channels.find((p) => p.id === c.parent_channel_id)?.name || "—"}</td>
                          <td>{c.chair || "—"}</td>
                          <td className="max-w-xs text-xs">
                            {forumPeopleLine({
                              channel: c,
                              members: memberViews.filter((m) => m.channel_id === c.id),
                            })}
                          </td>
                          <td className="whitespace-nowrap">{c.last_meeting || "—"}</td>
                          <td className="whitespace-nowrap">{c.next_meeting || "—"}</td>
                          <td>
                            <span
                              className={`text-xs px-2 py-0.5 rounded ${
                                c.status === "Retired"
                                  ? "bg-muted text-muted-foreground"
                                  : c.status === "Paused"
                                    ? "bg-amber-500/15 text-amber-600"
                                    : "bg-emerald-500/15 text-emerald-600"
                              }`}
                            >
                              {c.status || "Active"}
                            </span>
                          </td>
                          <td>
                            {manageable ? (
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" onClick={() => openEdit(c)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => {
                                    if (confirm(`Delete "${c.name}"?`)) del.mutate(c.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">View</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </SectionFrame>
        </TabsContent>

        {admin && scoped && (
          <TabsContent value="templates" className="mt-4">
            <SectionFrame>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <SectionTitle>Forum templates</SectionTitle>
                <Button
                  size="sm"
                  onClick={() => setEditingTemplate({ scope_level: "project", is_active: true })}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Template
                </Button>
              </div>
              <p className="mt-2 mb-3 text-xs text-muted-foreground">
                New projects copy active project templates. The first project in a program or
                Strategic Alignment creates the shared forum from those templates. Org admin only.
              </p>
              <div className="overflow-x-auto">
                <table className="st-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Category</th>
                      <th>Cadence</th>
                      <th>Sort</th>
                      <th>Active</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map((t) => (
                      <tr key={t.id}>
                        <td className="font-medium">{t.name}</td>
                        <td>{scopeLabel(t.scope_level)}</td>
                        <td>{t.cadence || "—"}</td>
                        <td>{t.sort_order}</td>
                        <td>{t.is_active ? "Yes" : "No"}</td>
                        <td>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setEditingTemplate(t)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                if (confirm(`Delete template "${t.name}"?`))
                                  delTemplate.mutate(t.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!templates.length && (
                      <tr>
                        <td colSpan={6} className="text-center text-muted-foreground p-4">
                          No templates yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </SectionFrame>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Forum" : "New Governance Forum"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <ChannelForm
              value={editing}
              channels={channels}
              projects={projects}
              resources={resources}
              memberIds={memberIds}
              chairResourceId={chairResourceId}
              onMemberIds={setMemberIds}
              onChairResourceId={setChairResourceId}
              admin={admin}
              userId={user?.id}
              scoped={scoped}
              onChange={setEditing}
              onSubmit={() => save.mutate(editing)}
              submitting={save.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingTemplate} onOpenChange={(o) => !o && setEditingTemplate(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTemplate?.id ? "Edit Template" : "New Template"}</DialogTitle>
          </DialogHeader>
          {editingTemplate && (
            <TemplateForm
              value={editingTemplate}
              onChange={setEditingTemplate}
              onSubmit={() => saveTemplate.mutate(editingTemplate)}
              submitting={saveTemplate.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function channelAppliesTo(c: Channel, projects: GovernanceProject[]) {
  const level = c.scope_level || "strategic_alignment";
  if (level === "project") {
    const p = projects.find((x) => x.id === c.project_id);
    return p ? projectOptionsLabel(p) : "—";
  }
  if (level === "program") return c.program || "—";
  return c.portfolio || "Org-wide";
}

function FilterSelect({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  items: { value: string; label: string }[];
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={`All ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {items.map((it) => (
            <SelectItem key={it.value} value={it.value}>
              {it.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ChannelForm({
  value,
  channels,
  projects,
  resources,
  memberIds,
  chairResourceId,
  onMemberIds,
  onChairResourceId,
  admin,
  userId,
  scoped,
  onChange,
  onSubmit,
  submitting,
}: {
  value: Partial<Channel>;
  channels: Channel[];
  projects: GovernanceProject[];
  resources: ResourceOpt[];
  memberIds: string[];
  chairResourceId: string;
  onMemberIds: (ids: string[]) => void;
  onChairResourceId: (id: string) => void;
  admin: boolean;
  userId?: string;
  scoped: boolean;
  onChange: (v: Partial<Channel>) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const set = (k: keyof Channel, v: unknown) => onChange({ ...value, [k]: v });
  const applyWindow = (patch: Partial<Channel>) => {
    onChange(withCadenceWindowDates({ ...value, ...patch }));
  };
  const scope = (value.scope_level || "strategic_alignment") as GovernanceScopeLevel;
  const editableProjects = admin
    ? projects
    : projects.filter((p) => p.pm_user_id && p.pm_user_id === userId);
  const showMembers = scoped;
  const parentOptions = channels.filter((c) => c.id && c.id !== value.id);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Forum name *</Label>
          <Input value={value.name || ""} onChange={(e) => set("name", e.target.value)} />
        </div>
        {scoped && (
          <>
            <div>
              <Label>Category</Label>
              <Select
                value={scope}
                onValueChange={(v) => {
                  const next = v as GovernanceScopeLevel;
                  const patch: Partial<Channel> = { ...value, scope_level: next };
                  if (next !== "project") patch.project_id = null;
                  if (next !== "program") {
                    if (next === "project") {
                      const p = projects.find((x) => x.id === value.project_id);
                      patch.program = p?.program || null;
                    } else patch.program = null;
                  }
                  onChange(patch);
                }}
                disabled={!admin}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GOVERNANCE_SCOPE_LEVELS.map((s) => (
                    <SelectItem key={s} value={s} disabled={!admin && s !== "project"}>
                      {GOVERNANCE_SCOPE_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {scope === "project" && (
              <div>
                <Label>Project *</Label>
                <Select
                  value={value.project_id || ""}
                  onValueChange={(v) => {
                    const p = projects.find((x) => x.id === v);
                    applyWindow({
                      project_id: v,
                      program: p?.program || null,
                      portfolio: p?.portfolio || null,
                      cadence_end: p?.planned_end_date || value.cadence_end || null,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {editableProjects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {projectOptionsLabel(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {scope === "program" && (
              <div>
                <Label>Program *</Label>
                <Input
                  value={value.program || ""}
                  onChange={(e) => set("program", e.target.value)}
                />
              </div>
            )}
            {scope === "strategic_alignment" && (
              <div>
                <Label>Strategic Alignment</Label>
                <Input
                  value={value.portfolio || ""}
                  onChange={(e) => set("portfolio", e.target.value)}
                  placeholder="Blank = org-wide"
                />
              </div>
            )}
          </>
        )}
        <div className="col-span-2">
          <Label>Escalates to (parent forum)</Label>
          <Select
            value={value.parent_channel_id || "none"}
            onValueChange={(v) => set("parent_channel_id", v === "none" ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="None — top of hierarchy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None — top of hierarchy</SelectItem>
              {parentOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({scopeLabel(c.scope_level)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Cadence</Label>
          <Select
            value={value.cadence || ""}
            onValueChange={(v) => applyWindow({ cadence: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {CADENCES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={value.status || "Active"} onValueChange={(v) => set("status", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Audience</Label>
          <Input value={value.audience || ""} onChange={(e) => set("audience", e.target.value)} />
        </div>
        <div>
          <Label>Chair (text)</Label>
          <Input value={value.chair || ""} onChange={(e) => set("chair", e.target.value)} />
        </div>
        <div>
          <Label>Cadence start</Label>
          <Input
            type="date"
            value={value.cadence_start || ""}
            onChange={(e) => applyWindow({ cadence_start: e.target.value || null })}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            First meeting of the series. Weekly keeps this weekday every 7 days; monthly keeps this
            day of month (weekdays only).
          </p>
        </div>
        <div>
          <Label>Cadence end (placeholder)</Label>
          <Input
            type="date"
            value={value.cadence_end || ""}
            onChange={(e) => applyWindow({ cadence_end: e.target.value || null })}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Planning horizon (defaults to 12 months, or the project planned end). Extend it to keep
            meetings on the calendar.
          </p>
        </div>
        <div className="col-span-2 text-[11px] text-muted-foreground">
          Previous meeting:{" "}
          <span className="font-medium text-foreground">{value.last_meeting || "—"}</span>
          {" · "}
          Next meeting:{" "}
          <span className="font-medium text-foreground">{value.next_meeting || "—"}</span>
          {value.cadence === "Ad-hoc"
            ? " · Ad-hoc is the start date only."
            : " · Next is the next date on this series (from start, by cadence, through end). Previous is the one before it."}
        </div>
      </div>
      <div>
        <Label>Purpose</Label>
        <Textarea
          rows={3}
          value={value.purpose || ""}
          onChange={(e) => set("purpose", e.target.value)}
        />
      </div>
      {showMembers && (
        <div>
          <Label>Members (from resources)</Label>
          <p className="mb-2 text-xs text-muted-foreground">
            Chair plus members from the resource register. Same people list at project, program, and
            Strategic Alignment forums.
          </p>
          <div className="mb-2">
            <Label className="text-xs">Chair (resource)</Label>
            <Select
              value={chairResourceId || "none"}
              onValueChange={(v) => {
                const id = v === "none" ? "" : v;
                onChairResourceId(id);
                if (id && !memberIds.includes(id)) onMemberIds([...memberIds, id]);
                const name = resources.find((r) => r.id === id)?.name;
                if (name) set("chair", name);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {resources.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                    {r.role ? ` · ${r.role}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="max-h-48 overflow-y-auto rounded border border-border p-2 space-y-1">
            {resources.map((r) => {
              const checked = memberIds.includes(r.id);
              return (
                <label key={r.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(on) => {
                      onMemberIds(
                        on ? [...memberIds, r.id] : memberIds.filter((id) => id !== r.id),
                      );
                    }}
                  />
                  <span>
                    {r.name}
                    {r.role ? ` · ${r.role}` : ""}
                    {r.status && r.status !== "Active" ? ` (${r.status})` : ""}
                  </span>
                </label>
              );
            })}
            {!resources.length && (
              <p className="text-xs text-muted-foreground">No resources in this organisation.</p>
            )}
          </div>
        </div>
      )}
      <DialogFooter>
        <Button
          disabled={
            !value.name || submitting || (scoped && scope === "project" && !value.project_id)
          }
          onClick={onSubmit}
        >
          {submitting ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function TemplateForm({
  value,
  onChange,
  onSubmit,
  submitting,
}: {
  value: Partial<ForumTemplate>;
  onChange: (v: Partial<ForumTemplate>) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const set = (k: keyof ForumTemplate, v: unknown) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-3">
      <div>
        <Label>Name *</Label>
        <Input value={value.name || ""} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Category</Label>
          <Select
            value={value.scope_level || "project"}
            onValueChange={(v) => set("scope_level", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GOVERNANCE_SCOPE_LEVELS.map((s) => (
                <SelectItem key={s} value={s}>
                  {GOVERNANCE_SCOPE_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Cadence</Label>
          <Select value={value.cadence || ""} onValueChange={(v) => set("cadence", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {CADENCES.map((c) => (
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
            value={value.sort_order ?? 0}
            onChange={(e) => set("sort_order", Number(e.target.value))}
          />
        </div>
        <div>
          <Label>Active</Label>
          <Select
            value={value.is_active === false ? "no" : "yes"}
            onValueChange={(v) => set("is_active", v === "yes")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Audience</Label>
        <Input value={value.audience || ""} onChange={(e) => set("audience", e.target.value)} />
      </div>
      <div>
        <Label>Purpose</Label>
        <Textarea
          rows={3}
          value={value.purpose || ""}
          onChange={(e) => set("purpose", e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button disabled={!value.name || submitting} onClick={onSubmit}>
          {submitting ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function HierarchyList({
  channels,
  allChannels,
  projects,
}: {
  channels: Channel[];
  allChannels: Channel[];
  projects: GovernanceProject[];
}) {
  const ids = new Set(channels.map((c) => c.id));
  const roots = channels.filter((c) => !c.parent_channel_id || !ids.has(c.parent_channel_id));
  const labelOf = (c: Channel) => {
    const level = c.scope_level || "strategic_alignment";
    let extra = "";
    if (level === "project") {
      const p = projects.find((x) => x.id === c.project_id);
      extra = p ? ` · ${projectOptionsLabel(p)}` : "";
    } else if (level === "program") extra = c.program ? ` · ${c.program}` : "";
    else extra = c.portfolio ? ` · ${c.portfolio}` : " · org-wide";
    return `${c.name} (${c.cadence || "—"}${extra})`;
  };
  const childrenOf = (id: string) => channels.filter((c) => c.parent_channel_id === id);
  return (
    <ul className="text-sm">
      {roots.map((parent) => (
        <li key={parent.id} className="mb-1">
          <strong>{labelOf(parent)}</strong>
          <ul className="ml-5 list-disc">
            {childrenOf(parent.id).map((child) => (
              <li key={child.id}>
                {labelOf(child)}
                {allChannels.find((p) => p.id === child.parent_channel_id) &&
                !ids.has(child.parent_channel_id || "")
                  ? ` → ${allChannels.find((p) => p.id === child.parent_channel_id)?.name}`
                  : ""}
                <ul className="ml-5 list-disc">
                  {childrenOf(child.id).map((gc) => (
                    <li key={gc.id}>{labelOf(gc)}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

const CADENCE_COLORS: Record<string, string> = {
  Daily: "bg-sky-100 text-sky-800",
  Weekly: "bg-indigo-100 text-indigo-800",
  Fortnightly: "bg-violet-100 text-violet-800",
  Monthly: "bg-emerald-100 text-emerald-800",
  Quarterly: "bg-amber-100 text-amber-900",
  "Half-yearly": "bg-orange-100 text-orange-900",
  Annual: "bg-rose-100 text-rose-800",
  "Ad-hoc": "bg-slate-100 text-slate-700",
};

function CadenceMonthCalendar({
  channels,
  allChannels,
}: {
  channels: Channel[];
  allChannels: Channel[];
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const label = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const firstDow = new Date(y, m, 1).getDay();
  const startOffset = firstDow === 0 ? 6 : firstDow - 1;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);

  const monthStart = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const monthEnd = `${y}-${String(m + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const byDay = new Map<string, Channel[]>();
  for (const c of channels) {
    if (c.status === "Retired") continue;
    if (!c.cadence_start && !c.last_meeting && !c.next_meeting) continue;
    const window = resolveCadenceWindow(c);
    const dates = expandCadenceMeetings(window.cadence_start, window.cadence_end, c.cadence, {
      rangeStart: monthStart,
      rangeEnd: monthEnd,
    });
    for (const iso of dates) {
      const list = byDay.get(iso) || [];
      if (!list.some((x) => x.id === c.id)) list.push(c);
      byDay.set(iso, list);
    }
  }

  return (
    <div className="mt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Calendar — {label}
        </h4>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setCursor(new Date(y, m - 1, 1))}
          >
            Prev
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setCursor(new Date(y, m + 1, 1))}
          >
            Next
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[11px]">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-1 py-1 font-semibold text-muted-foreground">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          const iso =
            day != null
              ? `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
              : "";
          const items = iso ? byDay.get(iso) || [] : [];
          return (
            <div
              key={`${iso || "e"}-${i}`}
              className={`min-h-[4.5rem] rounded border border-border p-1 ${
                i % 7 >= 5 ? "bg-muted/40 text-muted-foreground" : "bg-surface"
              }`}
            >
              <div className="mb-1 font-semibold text-muted-foreground">{day || ""}</div>
              {items.map((c) => {
                const parent = allChannels.find((p) => p.id === c.parent_channel_id);
                return (
                  <div
                    key={c.id}
                    className={`mb-0.5 truncate rounded px-1 py-0.5 ${CADENCE_COLORS[c.cadence || ""] || "bg-muted"}`}
                    title={`${c.name} · ${scopeLabel(c.scope_level)} · ${c.cadence || "—"}${parent ? ` · escalates to ${parent.name}` : ""} · ${iso === c.next_meeting ? "next" : iso === c.last_meeting ? "last" : "series"}`}
                  >
                    {c.name}
                    {parent ? ` ↑ ${parent.name}` : ""}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
