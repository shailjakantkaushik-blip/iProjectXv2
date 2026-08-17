import { supabase } from "@/integrations/supabase/client";

/** Governance forum scope: project, program, or Strategic Alignment (DB key `portfolio`). */

export const GOVERNANCE_SCOPE_LEVELS = ["project", "program", "strategic_alignment"] as const;
export type GovernanceScopeLevel = (typeof GOVERNANCE_SCOPE_LEVELS)[number];

export const GOVERNANCE_SCOPE_LABEL: Record<GovernanceScopeLevel, string> = {
  project: "Project",
  program: "Program",
  strategic_alignment: "Strategic Alignment",
};

export function scopeLabel(level: string | null | undefined) {
  if (level === "project" || level === "program" || level === "strategic_alignment") {
    return GOVERNANCE_SCOPE_LABEL[level];
  }
  return "Strategic Alignment";
}

export type GovernanceChannel = {
  id: string;
  org_id: string;
  name: string;
  cadence: string | null;
  audience: string | null;
  purpose: string | null;
  chair: string | null;
  next_meeting: string | null;
  last_meeting: string | null;
  cadence_start: string | null;
  cadence_end: string | null;
  parent_channel_id: string | null;
  status: string | null;
  scope_level?: string | null;
  project_id?: string | null;
  program?: string | null;
  portfolio?: string | null;
};

export type GovernanceProject = {
  id: string;
  name: string;
  project_code?: string | null;
  program?: string | null;
  portfolio?: string | null;
  pm_user_id?: string | null;
  planned_end_date?: string | null;
};

export type GovernanceStream = {
  id: string;
  project_id: string;
  name: string;
};

export const GOVERNANCE_CHANNELS_SELECT_MIN = [
  "id",
  "org_id",
  "name",
  "cadence",
  "audience",
  "purpose",
  "chair",
  "next_meeting",
  "last_meeting",
  "parent_channel_id",
  "status",
].join(",");

/** Scoped forums, without cadence start/end (older DBs). */
export const GOVERNANCE_CHANNELS_SELECT_SCOPED = [
  GOVERNANCE_CHANNELS_SELECT_MIN,
  "scope_level",
  "project_id",
  "program",
  "portfolio",
].join(",");

export const GOVERNANCE_CHANNELS_SELECT = [
  GOVERNANCE_CHANNELS_SELECT_SCOPED,
  "cadence_start",
  "cadence_end",
].join(",");

export function isMissingGovernanceScopeColumn(error: { message?: string } | null | undefined) {
  const msg = String(error?.message || "");
  return /scope_level/i.test(msg) || /Could not find the 'scope_level'/i.test(msg);
}

export function isMissingCadenceWindowColumn(error: { message?: string } | null | undefined) {
  const msg = String(error?.message || "");
  return /cadence_start|cadence_end/i.test(msg);
}

export function normalizeChannel(row: GovernanceChannel): GovernanceChannel {
  return {
    ...row,
    cadence_start: row.cadence_start ?? null,
    cadence_end: row.cadence_end ?? null,
    scope_level: row.scope_level || "strategic_alignment",
    project_id: row.project_id ?? null,
    program: row.program ?? null,
    portfolio: row.portfolio ?? null,
  };
}

export function channelScopeKey(c: GovernanceChannel) {
  const level = c.scope_level || "strategic_alignment";
  if (level === "project") return c.project_id || "";
  if (level === "program") return (c.program || "").trim();
  return (c.portfolio || "").trim();
}

/**
 * A forum belongs to a project only through the same buckets used elsewhere:
 * project row → program name → Strategic Alignment (`projects.portfolio`).
 * Org-wide forums (SA with no portfolio) are not mixed into every project.
 */
export function inheritedForProject(c: GovernanceChannel, project: GovernanceProject | undefined) {
  if (!project) return false;
  const level = c.scope_level || "strategic_alignment";
  if (level === "project") return c.project_id === project.id;
  if (level === "program") {
    return Boolean(project.program) && c.program === project.program;
  }
  return Boolean(project.portfolio) && c.portfolio === project.portfolio;
}

export function channelsForProjects(channels: GovernanceChannel[], projects: GovernanceProject[]) {
  if (!projects.length) return [];
  return channels.filter((c) => projects.some((p) => inheritedForProject(c, p)));
}

/** Projects the signed-in person is actually on: PM, allocated resource, or stakeholder. */
export function resolveMyProjectIds(opts: {
  userId?: string | null;
  projects: Array<{ id: string; pm_user_id?: string | null }>;
  myResourceIds: string[];
  allocationProjectIds: string[];
  stakeholderProjectIds: string[];
}) {
  const ids = new Set<string>();
  const uid = opts.userId || "";
  for (const p of opts.projects) {
    if (uid && p.pm_user_id === uid) ids.add(p.id);
  }
  for (const id of opts.allocationProjectIds) if (id) ids.add(id);
  for (const id of opts.stakeholderProjectIds) if (id) ids.add(id);
  return [...ids];
}

export type ForumMemberView = {
  channel_id: string;
  resource_id: string;
  role: string;
  name: string;
};

export type ForumNode = {
  channel: GovernanceChannel;
  members: ForumMemberView[];
};

export type ProjectGovernanceBucket = {
  project: GovernanceProject;
  forums: ForumNode[];
};

export type ProgramGovernanceBucket = {
  program: string;
  forums: ForumNode[];
  projects: ProjectGovernanceBucket[];
};

export type AlignmentGovernanceBucket = {
  portfolio: string;
  forums: ForumNode[];
  programs: ProgramGovernanceBucket[];
};

function nodesFor(channels: GovernanceChannel[], membersByChannel: Map<string, ForumMemberView[]>) {
  return [...channels]
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .map((channel) => ({
      channel,
      members: membersByChannel.get(channel.id) || [],
    }));
}

/** Strategic Alignment → Program → Project tree for the given project set. */
export function buildGovernanceHierarchy(
  projects: GovernanceProject[],
  channels: GovernanceChannel[],
  members: ForumMemberView[],
): AlignmentGovernanceBucket[] {
  const membersByChannel = new Map<string, ForumMemberView[]>();
  for (const m of members) {
    const list = membersByChannel.get(m.channel_id) || [];
    list.push(m);
    membersByChannel.set(m.channel_id, list);
  }

  const saKeys = [...new Set(projects.map((p) => (p.portfolio || "").trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );

  return saKeys.map((portfolio) => {
    const saProjects = projects.filter((p) => (p.portfolio || "").trim() === portfolio);
    const saForums = channels.filter(
      (c) =>
        (c.scope_level || "strategic_alignment") === "strategic_alignment" &&
        (c.portfolio || "").trim() === portfolio,
    );
    const programKeys = [
      ...new Set(saProjects.map((p) => (p.program || "").trim()).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b));

    const programs: ProgramGovernanceBucket[] = programKeys.map((program) => {
      const progProjects = saProjects.filter((p) => (p.program || "").trim() === program);
      const programForums = channels.filter(
        (c) => (c.scope_level || "") === "program" && (c.program || "").trim() === program,
      );
      const projectBuckets: ProjectGovernanceBucket[] = [...progProjects]
        .sort((a, b) => projectOptionsLabel(a).localeCompare(projectOptionsLabel(b)))
        .map((project) => ({
          project,
          forums: nodesFor(
            channels.filter(
              (c) => (c.scope_level || "") === "project" && c.project_id === project.id,
            ),
            membersByChannel,
          ),
        }));
      return {
        program,
        forums: nodesFor(programForums, membersByChannel),
        projects: projectBuckets,
      };
    });

    const unassigned = saProjects.filter((p) => !(p.program || "").trim());
    if (unassigned.length) {
      programs.push({
        program: "Unassigned program",
        forums: [],
        projects: unassigned
          .sort((a, b) => projectOptionsLabel(a).localeCompare(projectOptionsLabel(b)))
          .map((project) => ({
            project,
            forums: nodesFor(
              channels.filter(
                (c) => (c.scope_level || "") === "project" && c.project_id === project.id,
              ),
              membersByChannel,
            ),
          })),
      });
    }

    return {
      portfolio,
      forums: nodesFor(saForums, membersByChannel),
      programs,
    };
  });
}

export function forumPeopleLine(node: ForumNode) {
  const named = node.members.map((m) => (m.role === "chair" ? `${m.name} (chair)` : m.name));
  if (named.length) return named.join(", ");
  if (node.channel.chair) return `${node.channel.chair} (chair)`;
  return "No members listed";
}

export function orgWideForums(
  channels: GovernanceChannel[],
  members: ForumMemberView[],
): ForumNode[] {
  const membersByChannel = new Map<string, ForumMemberView[]>();
  for (const m of members) {
    const list = membersByChannel.get(m.channel_id) || [];
    list.push(m);
    membersByChannel.set(m.channel_id, list);
  }
  return nodesFor(
    channels.filter(
      (c) =>
        (c.scope_level || "strategic_alignment") === "strategic_alignment" &&
        !(c.portfolio || "").trim(),
    ),
    membersByChannel,
  );
}

export function filterGovernanceChannels(
  channels: GovernanceChannel[],
  filters: {
    projectId?: string;
    program?: string;
    portfolio?: string;
    streamName?: string;
    cadence?: string;
    scope?: string;
  },
  projects: GovernanceProject[],
  streams: GovernanceStream[],
) {
  const projectById = new Map(projects.map((p) => [p.id, p]));
  let streamProjectIds: Set<string> | null = null;
  if (filters.streamName) {
    streamProjectIds = new Set(
      streams.filter((s) => s.name === filters.streamName).map((s) => s.project_id),
    );
  }

  return channels.filter((c) => {
    if (filters.cadence && (c.cadence || "") !== filters.cadence) return false;
    if (filters.scope && (c.scope_level || "strategic_alignment") !== filters.scope) return false;

    if (filters.projectId) {
      const p = projectById.get(filters.projectId);
      if (!inheritedForProject(c, p)) return false;
    }

    if (filters.program) {
      const pids = projects.filter((p) => p.program === filters.program).map((p) => p.id);
      const level = c.scope_level || "strategic_alignment";
      const ok =
        (level === "program" && c.program === filters.program) ||
        (level === "project" && c.project_id && pids.includes(c.project_id)) ||
        (level === "strategic_alignment" &&
          projects.some((p) => p.program === filters.program && c.portfolio === p.portfolio));
      if (!ok) return false;
    }

    if (filters.portfolio) {
      const pids = projects.filter((p) => p.portfolio === filters.portfolio).map((p) => p.id);
      const level = c.scope_level || "strategic_alignment";
      const ok =
        (level === "strategic_alignment" && c.portfolio === filters.portfolio) ||
        (level === "project" && c.project_id && pids.includes(c.project_id)) ||
        (level === "program" &&
          projects.some((p) => p.portfolio === filters.portfolio && p.program === c.program));
      if (!ok) return false;
    }

    if (streamProjectIds) {
      const level = c.scope_level || "strategic_alignment";
      if (level === "project") {
        if (!c.project_id || !streamProjectIds.has(c.project_id)) return false;
      } else {
        const related = projects.filter((p) => streamProjectIds!.has(p.id));
        if (!related.length) return false;
        if (level === "program") {
          if (!related.some((p) => p.program === c.program)) return false;
        } else if (c.portfolio && !related.some((p) => p.portfolio === c.portfolio)) {
          return false;
        }
      }
    }

    return true;
  });
}

export function canManageGovernanceChannel(
  channel: GovernanceChannel,
  opts: { isAdmin: boolean; userId?: string | null; projects: GovernanceProject[] },
) {
  if (opts.isAdmin) return true;
  if ((channel.scope_level || "strategic_alignment") !== "project" || !channel.project_id) {
    return false;
  }
  const p = opts.projects.find((x) => x.id === channel.project_id);
  return Boolean(opts.userId && p?.pm_user_id === opts.userId);
}

export function projectOptionsLabel(p: GovernanceProject) {
  return p.project_code ? `${p.project_code} · ${p.name}` : p.name;
}

/** Local YYYY-MM-DD (no UTC shift). */
export function localTodayIso(now = new Date()): string {
  return formatIsoYmd(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function formatIsoYmd(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function addCalendarDaysIso(iso: string, days: number): string {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return formatIsoYmd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

/** 1 = Monday … 7 = Sunday */
function isoDow(iso: string): number {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  const js = new Date(y, m - 1, d).getDay();
  return js === 0 ? 7 : js;
}

export function isWeekdayIso(iso: string): boolean {
  return isoDow(iso) <= 5;
}

/** Saturday → Friday (back) or Monday (forward); Sunday similarly. */
export function snapToWeekdayIso(iso: string, direction: "back" | "forward"): string {
  let cur = String(iso).slice(0, 10);
  for (let i = 0; i < 7; i++) {
    if (isWeekdayIso(cur)) return cur;
    cur = addCalendarDaysIso(cur, direction === "back" ? -1 : 1);
  }
  return cur;
}

export function addWorkingDaysIso(iso: string, n: number): string {
  if (n === 0) return snapToWeekdayIso(iso, "forward");
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  let cur = String(iso).slice(0, 10);
  while (left > 0) {
    cur = addCalendarDaysIso(cur, step);
    if (isWeekdayIso(cur)) left -= 1;
  }
  return cur;
}

function addCalendarMonthsClamped(iso: string, months: number): string {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  const idx = y * 12 + (m - 1) + months;
  const ny = Math.floor(idx / 12);
  const nm = ((idx % 12) + 12) % 12;
  const lastDay = new Date(ny, nm + 1, 0).getDate();
  return formatIsoYmd(ny, nm + 1, Math.min(d, lastDay));
}

function addCalendarMonthsWeekday(iso: string, months: number): string {
  const next = addCalendarMonthsClamped(iso, months);
  return snapToWeekdayIso(next, months >= 0 ? "forward" : "back");
}

/**
 * Nth meeting of a series that starts on `start` (already a weekday).
 * Weekly / Fortnightly keep the same weekday as start (+7 / +14 calendar days).
 * Monthly+ add months from start (clamp to month-end) then snap to a weekday.
 */
export function cadenceOccurrenceAt(
  start: string | null | undefined,
  cadence: string | null | undefined,
  n: number,
): string | null {
  const from = String(start || "").slice(0, 10);
  if (!from) return null;
  const origin = isWeekdayIso(from) ? from : snapToWeekdayIso(from, n >= 0 ? "forward" : "back");
  switch (cadence) {
    case "Daily":
      return addWorkingDaysIso(origin, n);
    case "Weekly":
      return addCalendarDaysIso(origin, 7 * n);
    case "Fortnightly":
      return addCalendarDaysIso(origin, 14 * n);
    case "Monthly":
      return addCalendarMonthsWeekday(origin, n);
    case "Quarterly":
      return addCalendarMonthsWeekday(origin, 3 * n);
    case "Half-yearly":
      return addCalendarMonthsWeekday(origin, 6 * n);
    case "Annual":
      return addCalendarMonthsWeekday(origin, 12 * n);
    default:
      return n === 0 ? origin : null;
  }
}

/**
 * Daily / Weekly / Fortnightly stay on the same weekday as the given date.
 * Longer cadences add calendar months from that date, then land on a weekday.
 */
export function suggestNextMeetingDate(
  lastMeeting: string | null | undefined,
  cadence: string | null | undefined,
): string | null {
  const last = String(lastMeeting || "").slice(0, 10);
  if (!last) return null;
  return cadenceOccurrenceAt(last, cadence, 1);
}

/** Previous occurrence of this cadence, always a weekday. */
export function defaultLastMeetingDate(
  cadence: string | null | undefined,
  today = localTodayIso(),
): string {
  const anchor = snapToWeekdayIso(today, "back");
  return cadenceOccurrenceAt(anchor, cadence, -1) || addWorkingDaysIso(anchor, -1);
}

export function defaultGovernanceMeetingDates(
  cadence: string | null | undefined,
  today = localTodayIso(),
): { last_meeting: string; next_meeting: string | null } {
  const last_meeting = defaultLastMeetingDate(cadence, today);
  return { last_meeting, next_meeting: suggestNextMeetingDate(last_meeting, cadence) };
}

const MAX_CADENCE_OCCURRENCES = 400;

/** First weekday of a new series (today, snapped forward). */
export function defaultCadenceStart(today = localTodayIso()): string {
  return snapToWeekdayIso(today, "forward");
}

/** Placeholder series end: 12 months after start, on a weekday. */
export function defaultCadenceEnd(start: string | null | undefined): string {
  const from = String(start || "").slice(0, 10) || defaultCadenceStart();
  return addCalendarMonthsWeekday(from, 12);
}

export function resolveCadenceWindow(c: {
  cadence_start?: string | null;
  cadence_end?: string | null;
  last_meeting?: string | null;
  next_meeting?: string | null;
}): { cadence_start: string; cadence_end: string } {
  const rawStart = String(
    c.cadence_start || c.last_meeting || c.next_meeting || defaultCadenceStart(),
  ).slice(0, 10);
  const cadence_start = isWeekdayIso(rawStart) ? rawStart : snapToWeekdayIso(rawStart, "forward");
  const rawEnd = String(c.cadence_end || "").slice(0, 10) || defaultCadenceEnd(cadence_start);
  let cadence_end = isWeekdayIso(rawEnd) ? rawEnd : snapToWeekdayIso(rawEnd, "forward");
  if (cadence_end < cadence_start) cadence_end = defaultCadenceEnd(cadence_start);
  return { cadence_start, cadence_end };
}

/**
 * Expand weekday meetings from cadence start through placeholder end.
 * Dates are counted from start (not chained from last), so next always matches
 * cadence type + start. Ad-hoc is a single meeting on the start date.
 */
export function expandCadenceMeetings(
  start: string | null | undefined,
  end: string | null | undefined,
  cadence: string | null | undefined,
  opts?: { rangeStart?: string; rangeEnd?: string; max?: number },
): string[] {
  const from = String(start || "").slice(0, 10);
  if (!from) return [];
  const origin = isWeekdayIso(from) ? from : snapToWeekdayIso(from, "forward");
  const stop = String(end || defaultCadenceEnd(origin)).slice(0, 10);
  const rangeStart = opts?.rangeStart ? String(opts.rangeStart).slice(0, 10) : "";
  const rangeEnd = opts?.rangeEnd ? String(opts.rangeEnd).slice(0, 10) : "";
  const max = opts?.max ?? MAX_CADENCE_OCCURRENCES;
  const inRange = (iso: string) =>
    (!rangeStart || iso >= rangeStart) && (!rangeEnd || iso <= rangeEnd);

  if (!cadence || cadence === "Ad-hoc") {
    return origin && origin <= stop && inRange(origin) ? [origin] : [];
  }

  const out: string[] = [];
  for (let n = 0; n < max; n++) {
    const cur = cadenceOccurrenceAt(origin, cadence, n);
    if (!cur || cur > stop) break;
    if (rangeEnd && cur > rangeEnd) break;
    if (inRange(cur)) out.push(cur);
  }
  return out;
}

/**
 * Next = first series date on or after today (still <= end).
 * Previous = the occurrence immediately before next (never after start).
 */
export function lastAndNextFromCadence(
  start: string | null | undefined,
  end: string | null | undefined,
  cadence: string | null | undefined,
  today = localTodayIso(),
): { last_meeting: string | null; next_meeting: string | null } {
  const dates = expandCadenceMeetings(start, end, cadence);
  let last_meeting: string | null = null;
  let next_meeting: string | null = null;
  for (const d of dates) {
    if (d >= today) {
      next_meeting = d;
      break;
    }
    last_meeting = d;
  }
  if (!next_meeting && dates.length) last_meeting = dates[dates.length - 1];
  return { last_meeting, next_meeting };
}

/** Fill start/end (with defaults) and derive last/next from the series. */
export function withCadenceWindowDates<T extends Partial<GovernanceChannel>>(
  row: T,
  today = localTodayIso(),
): T {
  const window = resolveCadenceWindow(row);
  const ln = lastAndNextFromCadence(window.cadence_start, window.cadence_end, row.cadence, today);
  return { ...row, ...window, ...ln };
}

export async function loadGovernanceChannels(): Promise<{
  scoped: boolean;
  channels: GovernanceChannel[];
}> {
  const full = await supabase
    .from("governance_channels")
    .select(GOVERNANCE_CHANNELS_SELECT as "*")
    .order("name");
  if (!full.error) {
    return {
      scoped: true,
      channels: ((full.data || []) as unknown as GovernanceChannel[])
        .map(normalizeChannel)
        .map((c) => withCadenceWindowDates(c)),
    };
  }
  if (isMissingCadenceWindowColumn(full.error)) {
    const scoped = await supabase
      .from("governance_channels")
      .select(GOVERNANCE_CHANNELS_SELECT_SCOPED as "*")
      .order("name");
    if (!scoped.error) {
      return {
        scoped: true,
        channels: ((scoped.data || []) as unknown as GovernanceChannel[])
          .map(normalizeChannel)
          .map((c) => withCadenceWindowDates(c)),
      };
    }
    if (!isMissingGovernanceScopeColumn(scoped.error)) throw scoped.error;
  } else if (!isMissingGovernanceScopeColumn(full.error)) {
    throw full.error;
  }
  const min = await supabase
    .from("governance_channels")
    .select(GOVERNANCE_CHANNELS_SELECT_MIN as "*")
    .order("name");
  if (min.error) throw min.error;
  return {
    scoped: false,
    channels: ((min.data || []) as unknown as GovernanceChannel[])
      .map(normalizeChannel)
      .map((c) => withCadenceWindowDates(c)),
  };
}
