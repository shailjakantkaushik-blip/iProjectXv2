/**
 * Stage-gate flow counts for Roadmap × Governance.
 * Each delivery method has its own gate template — never mix them on one axis.
 */
import { matchPhase } from "@/lib/project-phase";
import {
  defaultGatesForMethodCode,
  findDeliveryMethod,
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
