/**
 * Stage-gate flow counts for Roadmap × Governance.
 * Each delivery method has its own gate template — never mix them on one axis.
 */
import { matchPhase } from "@/lib/project-phase";
import {
  defaultGatesForMethodCode,
  findDeliveryMethod,
  methodUsesStageGates,
  type DeliveryMethodRow,
} from "@/lib/delivery-methods";

export type StageGateDefLike = {
  gate_name?: string | null;
  delivery_method_id?: string | null;
  sort_order?: number | null;
};

export type StageGateFlowProject = {
  status?: string | null;
  current_phase?: string | null;
  delivery_method?: string | null;
  delivery_method_id?: string | null;
};

export type MethodStageFlow = {
  methodId: string;
  methodName: string;
  methodCode: string;
  usesSprints: boolean;
  stages: string[];
  rows: { stage: string; count: number }[];
  activeCount: number;
};

export function isInFlightProject(status?: string | null) {
  const s = String(status || "").trim();
  return s !== "Completed" && s !== "Cancelled";
}

export function projectBelongsToMethod(
  project: StageGateFlowProject,
  method: Pick<DeliveryMethodRow, "id" | "name" | "code">,
  methods: DeliveryMethodRow[],
) {
  if (project.delivery_method_id) return project.delivery_method_id === method.id;
  const found = findDeliveryMethod(methods, project.delivery_method);
  return found?.id === method.id;
}

function orderedGateNames(defs: StageGateDefLike[], methodId: string | null) {
  return defs
    .filter((d) => (d.delivery_method_id || null) === methodId)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((d) => String(d.gate_name || "").trim())
    .filter(Boolean);
}

function countPhases(projects: StageGateFlowProject[], stages: string[]) {
  const counts = new Map(stages.map((s) => [s, 0]));
  for (const p of projects) {
    const matched = matchPhase(p.current_phase, stages);
    if (matched) counts.set(matched, (counts.get(matched) || 0) + 1);
  }
  return stages.map((stage) => ({ stage, count: counts.get(stage) || 0 }));
}

/**
 * One flow series per delivery method that uses stage gates.
 * Falls back to a single Waterfall-shaped series when methods are not seeded.
 */
export function buildStageGateFlows(
  methods: DeliveryMethodRow[],
  gateDefs: StageGateDefLike[],
  projects: StageGateFlowProject[],
): MethodStageFlow[] {
  const active = projects.filter((p) => isInFlightProject(p.status));

  if (methods.length === 0) {
    const unscoped = orderedGateNames(gateDefs, null);
    const allNamed = gateDefs
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((d) => String(d.gate_name || "").trim())
      .filter(Boolean);
    const fallback =
      unscoped.length > 0
        ? unscoped
        : allNamed.length > 0
          ? allNamed
          : [...defaultGatesForMethodCode("waterfall")];
    return [
      {
        methodId: "legacy",
        methodName: "Stage gates",
        methodCode: "waterfall",
        usesSprints: false,
        stages: fallback,
        rows: countPhases(active, fallback),
        activeCount: active.length,
      },
    ];
  }

  return methods
    .map((method) => {
      const fromDefs = orderedGateNames(gateDefs, method.id);
      const stages = fromDefs.length > 0 ? fromDefs : [...defaultGatesForMethodCode(method.code)];
      const methodProjects = active.filter((p) => projectBelongsToMethod(p, method, methods));
      return {
        methodId: method.id,
        methodName: method.name,
        methodCode: method.code,
        usesSprints: Boolean(method.uses_sprints),
        stages,
        rows: countPhases(methodProjects, stages),
        activeCount: methodProjects.length,
      };
    })
    .filter((flow) => flow.stages.length > 0);
}

export const GATE_DIST_STATUSES = [
  "Approved",
  "In Review",
  "Pending",
  "On Hold",
  "Rejected",
] as const;

export type GateDistStatus = (typeof GATE_DIST_STATUSES)[number];

export type GateDistributionRow = {
  gate: string;
  Approved: number;
  "In Review": number;
  Pending: number;
  "On Hold": number;
  Rejected: number;
  __total: number;
};

export type MethodGateDistribution = {
  methodId: string;
  methodName: string;
  methodCode: string;
  rows: GateDistributionRow[];
  gateCount: number;
};

type GateDistGate = {
  project_id?: string | null;
  gate_name?: string | null;
  status?: string | null;
};

type GateDistProject = {
  id: string;
  delivery_method?: string | null;
  delivery_method_id?: string | null;
};

function emptyDistRow(gate: string): GateDistributionRow {
  return {
    gate,
    Approved: 0,
    "In Review": 0,
    Pending: 0,
    "On Hold": 0,
    Rejected: 0,
    __total: 0,
  };
}

function tallyGateDistribution(
  names: string[],
  methodGates: GateDistGate[],
): GateDistributionRow[] {
  return names.map((n) => {
    const row = emptyDistRow(n);
    for (const g of methodGates) {
      if (String(g.gate_name || "").trim() !== n) continue;
      const raw = String(g.status || "Pending");
      const status = (GATE_DIST_STATUSES as readonly string[]).includes(raw)
        ? (raw as GateDistStatus)
        : "Pending";
      row[status] += 1;
    }
    row.__total = GATE_DIST_STATUSES.reduce((sum, s) => sum + row[s], 0);
    return row;
  });
}

/**
 * One Gate Distribution series per delivery method that uses stage gates.
 * Gate names stay on that method's template — never mixed on one axis.
 */
export function buildGateDistributions(
  methods: DeliveryMethodRow[],
  gateDefs: StageGateDefLike[],
  projects: GateDistProject[],
  gates: GateDistGate[],
): MethodGateDistribution[] {
  const build = (
    methodId: string,
    methodName: string,
    methodCode: string,
    methodProjects: GateDistProject[],
    templateNames: string[],
  ): MethodGateDistribution => {
    const ids = new Set(methodProjects.map((p) => p.id));
    const methodGates = gates.filter((g) => g.project_id && ids.has(g.project_id));
    const extra = Array.from(
      new Set(methodGates.map((g) => String(g.gate_name || "").trim()).filter(Boolean)),
    );
    const names = [...templateNames];
    for (const n of extra) if (!names.includes(n)) names.push(n);
    return {
      methodId,
      methodName,
      methodCode,
      rows: tallyGateDistribution(names, methodGates),
      gateCount: methodGates.length,
    };
  };

  if (methods.length === 0) {
    const names = Array.from(
      new Set(gates.map((g) => String(g.gate_name || "").trim()).filter(Boolean)),
    );
    const rows = tallyGateDistribution(names, gates);
    return rows.length
      ? [
          {
            methodId: "legacy",
            methodName: "Stage gates",
            methodCode: "waterfall",
            rows,
            gateCount: gates.length,
          },
        ]
      : [];
  }

  return methods
    .filter((method) => methodUsesStageGates(method, method.name))
    .map((method) => {
      const fromDefs = orderedGateNames(gateDefs, method.id);
      const stages = fromDefs.length > 0 ? fromDefs : [...defaultGatesForMethodCode(method.code)];
      const methodProjects = projects.filter((p) => projectBelongsToMethod(p, method, methods));
      return build(method.id, method.name, method.code, methodProjects, stages);
    })
    .filter((d) => d.rows.length > 0);
}
