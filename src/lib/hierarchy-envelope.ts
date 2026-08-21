/**
 * Top-down envelopes at Strategic Alignment and Program.
 *
 * Project approved funding is still the project envelope.
 * FY Allocation is still a year slice of that project envelope.
 * These pots are optional parent constraints: when set, the sum of child
 * project approved funding should stay inside them.
 */

import { projectApprovedFunding, type ProjectFinanceLike } from "@/lib/project-finance";

export const HIERARCHY_ENVELOPE_LAYERS = ["alignment", "program"] as const;
export type HierarchyEnvelopeLayer = (typeof HIERARCHY_ENVELOPE_LAYERS)[number];

export type HierarchyEnvelopeRow = {
  id?: string;
  org_id?: string;
  layer: HierarchyEnvelopeLayer;
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

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function normalizeHierarchyName(name: unknown): string {
  const s = String(name ?? "").trim();
  return s || "Unassigned";
}

export function envelopeLookupKey(layer: HierarchyEnvelopeLayer, name: string): string {
  return `${layer}:${normalizeHierarchyName(name).toLowerCase()}`;
}

export function indexHierarchyEnvelopes(
  rows: HierarchyEnvelopeRow[] | null | undefined,
): Map<string, HierarchyEnvelopeRow> {
  const m = new Map<string, HierarchyEnvelopeRow>();
  for (const row of rows ?? []) {
    if (!row?.layer || !row.name) continue;
    m.set(envelopeLookupKey(row.layer, row.name), row);
  }
  return m;
}

export function lookupHierarchyEnvelope(
  index: Map<string, HierarchyEnvelopeRow>,
  layer: HierarchyEnvelopeLayer,
  name: string,
): number | null {
  const row = index.get(envelopeLookupKey(layer, name));
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
  projects: Array<
    ProjectFinanceLike & { portfolio?: string | null; program?: string | null }
  >,
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

export type ParentEnvelopeContext = {
  envelopes: Map<string, HierarchyEnvelopeRow>;
  alignmentApproved: Map<string, number>;
  programApproved: Map<string, number>;
};

export function parentEnvelopeContext(
  projects: Array<
    ProjectFinanceLike & { portfolio?: string | null; program?: string | null }
  >,
  envelopes: HierarchyEnvelopeRow[] | Map<string, HierarchyEnvelopeRow>,
): ParentEnvelopeContext {
  return {
    envelopes: envelopes instanceof Map ? envelopes : indexHierarchyEnvelopes(envelopes),
    alignmentApproved: childApprovedByLayer(projects, "alignment"),
    programApproved: childApprovedByLayer(projects, "program"),
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

/** Sum of set program envelopes (unset programs are skipped). */
export function programPotsAllocated(
  programNames: string[],
  envelopes: Map<string, HierarchyEnvelopeRow>,
): number {
  let sum = 0;
  for (const name of programNames) {
    const v = lookupHierarchyEnvelope(envelopes, "program", name);
    if (v != null && v > 0) sum += v;
  }
  return sum;
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
  const progEnv = lookupHierarchyEnvelope(envelopes, "program", program);
  if (progEnv != null && progEnv > 0) {
    out.push({
      layer: "program",
      name: program,
      envelope: progEnv,
      childApproved: programApproved.get(program) ?? 0,
    });
  }
  return out;
}
