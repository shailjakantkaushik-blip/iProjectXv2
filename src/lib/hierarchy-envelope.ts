/**
 * Top-down envelopes at Strategic Alignment and Program.
 *
 * Project approved funding is still the project envelope.
 * FY Allocation is still a year slice of that project envelope.
 * These pots are optional parent constraints: when set, the sum of child
 * project approved funding should stay inside them.
 *
 * Program pots are scoped under a Strategic Alignment (parent_name).
 */

import { projectApprovedFunding, type ProjectFinanceLike } from "@/lib/project-finance";

export const HIERARCHY_ENVELOPE_LAYERS = ["alignment", "program"] as const;
export type HierarchyEnvelopeLayer = (typeof HIERARCHY_ENVELOPE_LAYERS)[number];

export type HierarchyEnvelopeRow = {
  id?: string;
  org_id?: string;
  layer: HierarchyEnvelopeLayer;
  /** Strategic Alignment name for program rows; empty for alignment rows. */
  parent_name?: string | null;
  name: string;
  envelope: number | null;
  notes?: string | null;
};

export type ParentEnvelopeStatus = {
  constrained: boolean;
  envelope: number;
  allocated: number;
  remaining: number;
  overBy: number;
  usedPct: number;
  rag: "Green" | "Amber" | "Red" | "none";
};

export type ParentEnvelopeWatch = {
  layer: HierarchyEnvelopeLayer;
  name: string;
  envelope: number;
  childApproved: number;
};

export type HierarchyProjectLike = ProjectFinanceLike & {
  portfolio?: string | null;
  program?: string | null;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function normalizeHierarchyName(name: unknown): string {
  const s = String(name ?? "").trim();
  return s || "Unassigned";
}

export function programApprovedKey(alignment: unknown, program: unknown): string {
  return `${normalizeHierarchyName(alignment)}|||${normalizeHierarchyName(program)}`;
}

export function envelopeLookupKey(
  layer: HierarchyEnvelopeLayer,
  name: string,
  parentName: string = "",
): string {
  if (layer === "program") {
    return `program:${normalizeHierarchyName(parentName).toLowerCase()}|${normalizeHierarchyName(name).toLowerCase()}`;
  }
  return `alignment:${normalizeHierarchyName(name).toLowerCase()}`;
}

export function indexHierarchyEnvelopes(
  rows: HierarchyEnvelopeRow[] | null | undefined,
): Map<string, HierarchyEnvelopeRow> {
  const m = new Map<string, HierarchyEnvelopeRow>();
  for (const row of rows ?? []) {
    if (!row?.layer || !row.name) continue;
    m.set(envelopeLookupKey(row.layer, row.name, row.parent_name ?? ""), row);
  }
  return m;
}

export function lookupHierarchyEnvelope(
  index: Map<string, HierarchyEnvelopeRow>,
  layer: HierarchyEnvelopeLayer,
  name: string,
  parentName: string = "",
): number | null {
  const row = index.get(envelopeLookupKey(layer, name, parentName));
  if (!row) return null;
  const v = row.envelope;
  if (v == null || !Number.isFinite(Number(v))) return null;
  return Number(v);
}

/** Compare an optional parent pot to the sum of child project approved funding. */
export function parentEnvelopeStatus(
  envelope: number | null | undefined,
  childApproved: number,
): ParentEnvelopeStatus {
  const env = num(envelope);
  const allocated = Math.max(0, num(childApproved));
  if (!(env > 0)) {
    return {
      constrained: false,
      envelope: 0,
      allocated,
      remaining: 0,
      overBy: 0,
      usedPct: 0,
      rag: "none",
    };
  }
  const remaining = env - allocated;
  const overBy = Math.max(0, allocated - env);
  const usedPct = allocated / env;
  const rag: ParentEnvelopeStatus["rag"] =
    overBy > env * 0.1 ? "Red" : overBy > 0 || usedPct >= 0.9 ? "Amber" : "Green";
  return { constrained: true, envelope: env, allocated, remaining, overBy, usedPct, rag };
}

export function childApprovedByLayer(
  projects: HierarchyProjectLike[],
  layer: HierarchyEnvelopeLayer,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of projects) {
    const name =
      layer === "alignment"
        ? normalizeHierarchyName(p.portfolio)
        : normalizeHierarchyName(p.program);
    m.set(name, (m.get(name) ?? 0) + projectApprovedFunding(p));
  }
  return m;
}

/** Project approved funding keyed by SA + program (not a global program name). */
export function childApprovedByProgram(projects: HierarchyProjectLike[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of projects) {
    const k = programApprovedKey(p.portfolio, p.program);
    m.set(k, (m.get(k) ?? 0) + projectApprovedFunding(p));
  }
  return m;
}

export type ParentEnvelopeContext = {
  envelopes: Map<string, HierarchyEnvelopeRow>;
  alignmentApproved: Map<string, number>;
  programApproved: Map<string, number>;
};

export function parentEnvelopeContext(
  projects: HierarchyProjectLike[],
  envelopes: HierarchyEnvelopeRow[] | Map<string, HierarchyEnvelopeRow>,
): ParentEnvelopeContext {
  return {
    envelopes: envelopes instanceof Map ? envelopes : indexHierarchyEnvelopes(envelopes),
    alignmentApproved: childApprovedByLayer(projects, "alignment"),
    programApproved: childApprovedByProgram(projects),
  };
}

const RAG_RANK: Record<"Green" | "Amber" | "Red", number> = { Green: 0, Amber: 1, Red: 2 };

export function worseRag(a: string, b: string): "Green" | "Amber" | "Red" {
  const na = normalizeRag(a);
  const nb = normalizeRag(b);
  return RAG_RANK[na] >= RAG_RANK[nb] ? na : nb;
}

function normalizeRag(v: string): "Green" | "Amber" | "Red" {
  const s = String(v || "").toLowerCase();
  if (s === "red") return "Red";
  if (s === "amber") return "Amber";
  return "Green";
}

/** Escalate a rolled child RAG when the parent pot is Amber/Red. Does not change project scores. */
export function overlayParentEnvelopeRag(
  childRag: string,
  status: ParentEnvelopeStatus,
): "Green" | "Amber" | "Red" {
  const child = normalizeRag(childRag);
  if (!status.constrained || status.rag === "none") return child;
  return worseRag(child, status.rag);
}

/** Sum of set program envelopes under one Strategic Alignment (unset programs skipped). */
export function programPotsAllocated(
  alignmentName: string,
  programNames: string[],
  envelopes: Map<string, HierarchyEnvelopeRow>,
): number {
  let sum = 0;
  for (const name of programNames) {
    const v = lookupHierarchyEnvelope(envelopes, "program", name, alignmentName);
    if (v != null && v > 0) sum += v;
  }
  return sum;
}

export function collectAlignmentNames(
  projects: HierarchyProjectLike[],
  rows: HierarchyEnvelopeRow[] | null | undefined,
  extras: string[] = [],
): string[] {
  const s = new Set<string>();
  for (const extra of extras) s.add(normalizeHierarchyName(extra));
  for (const p of projects) s.add(normalizeHierarchyName(p.portfolio));
  for (const row of rows ?? []) {
    if (row.layer === "alignment") s.add(normalizeHierarchyName(row.name));
    else if (row.parent_name) s.add(normalizeHierarchyName(row.parent_name));
  }
  return [...s].sort((a, b) => a.localeCompare(b));
}

export function collectProgramNames(
  projects: HierarchyProjectLike[],
  rows: HierarchyEnvelopeRow[] | null | undefined,
  alignmentName: string,
): string[] {
  const sa = normalizeHierarchyName(alignmentName);
  const s = new Set<string>();
  for (const p of projects) {
    if (normalizeHierarchyName(p.portfolio) === sa) s.add(normalizeHierarchyName(p.program));
  }
  for (const row of rows ?? []) {
    if (row.layer !== "program") continue;
    if (normalizeHierarchyName(row.parent_name) !== sa) continue;
    s.add(normalizeHierarchyName(row.name));
  }
  return [...s].sort((a, b) => a.localeCompare(b));
}

export function parentWatchesForProject(
  project: { portfolio?: string | null; program?: string | null },
  envelopes: Map<string, HierarchyEnvelopeRow>,
  alignmentApproved: Map<string, number>,
  programApproved: Map<string, number>,
): ParentEnvelopeWatch[] {
  const out: ParentEnvelopeWatch[] = [];
  const alignment = normalizeHierarchyName(project.portfolio);
  const program = normalizeHierarchyName(project.program);
  const saEnv = lookupHierarchyEnvelope(envelopes, "alignment", alignment);
  if (saEnv != null && saEnv > 0) {
    out.push({
      layer: "alignment",
      name: alignment,
      envelope: saEnv,
      childApproved: alignmentApproved.get(alignment) ?? 0,
    });
  }
  const progEnv = lookupHierarchyEnvelope(envelopes, "program", program, alignment);
  if (progEnv != null && progEnv > 0) {
    out.push({
      layer: "program",
      name: program,
      envelope: progEnv,
      childApproved: programApproved.get(programApprovedKey(alignment, program)) ?? 0,
    });
  }
  return out;
}
