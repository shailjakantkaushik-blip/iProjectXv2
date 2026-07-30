/**
 * Critical Path Method (CPM) on work items + FS/SS/FF/SF links.
 */

export type CpmLinkType = "FS" | "SS" | "FF" | "SF";

export type CpmWorkItem = {
  id: string;
  title: string;
  project_id: string;
  planned_start?: string | null;
  planned_end?: string | null;
  estimate_hours?: number | null;
  status?: string | null;
  wbs_code?: string | null;
};

export type CpmLink = {
  predecessor_id: string;
  successor_id: string;
  link_type?: string | null;
  lag_days?: number | null;
};

export type CpmNode = {
  id: string;
  title: string;
  project_id: string;
  wbs_code: string | null;
  status: string | null;
  durationDays: number;
  es: number; // earliest start (day offset from network start)
  ef: number;
  ls: number;
  lf: number;
  float: number;
  critical: boolean;
  planned_start: string | null;
  planned_end: string | null;
};

const HOURS_PER_DAY = 8;

function parseDay(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function durationDays(wi: CpmWorkItem): number {
  const a = parseDay(wi.planned_start);
  const b = parseDay(wi.planned_end);
  if (a != null && b != null && b >= a) return Math.max(1, b - a + 1);
  const hrs = Number(wi.estimate_hours) || 0;
  if (hrs > 0) return Math.max(1, Math.ceil(hrs / HOURS_PER_DAY));
  return 1;
}

function normalizeLink(t: string | null | undefined): CpmLinkType {
  const u = String(t || "FS").toUpperCase();
  if (u === "SS" || u === "FF" || u === "SF" || u === "FS") return u;
  if (u.includes("START") && u.includes("START")) return "SS";
  if (u.includes("FINISH") && u.includes("FINISH")) return "FF";
  if (u.includes("START") && u.includes("FINISH")) return "SF";
  return "FS";
}

/**
 * Forward / backward pass CPM. Day offsets are relative (0 = network start).
 * Returns nodes sorted by ES then title. Critical = total float ≈ 0.
 */
export function computeCriticalPath(
  items: CpmWorkItem[],
  links: CpmLink[],
): { nodes: CpmNode[]; projectEnd: number; criticalIds: string[] } {
  const byId = new Map(items.map((i) => [i.id, i]));
  const ids = items.map((i) => i.id);
  const dur = new Map(items.map((i) => [i.id, durationDays(i)]));

  const preds = new Map<string, { id: string; type: CpmLinkType; lag: number }[]>();
  const succs = new Map<string, { id: string; type: CpmLinkType; lag: number }[]>();
  for (const id of ids) {
    preds.set(id, []);
    succs.set(id, []);
  }
  for (const l of links) {
    if (!byId.has(l.predecessor_id) || !byId.has(l.successor_id)) continue;
    if (l.predecessor_id === l.successor_id) continue;
    const type = normalizeLink(l.link_type);
    const lag = Number(l.lag_days) || 0;
    preds.get(l.successor_id)!.push({ id: l.predecessor_id, type, lag });
    succs.get(l.predecessor_id)!.push({ id: l.successor_id, type, lag });
  }

  // Kahn topological order; break cycles by ignoring back-edges
  const indeg = new Map(ids.map((id) => [id, preds.get(id)!.length]));
  const queue = ids.filter((id) => (indeg.get(id) || 0) === 0);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const s of succs.get(id) || []) {
      indeg.set(s.id, (indeg.get(s.id) || 1) - 1);
      if ((indeg.get(s.id) || 0) === 0) queue.push(s.id);
    }
  }
  // Orphans from cycles
  for (const id of ids) if (!order.includes(id)) order.push(id);

  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  for (const id of order) {
    let start = 0;
    for (const p of preds.get(id) || []) {
      const pEs = es.get(p.id) ?? 0;
      const pEf = ef.get(p.id) ?? durationDays(byId.get(p.id)!);
      const d = dur.get(id) || 1;
      let cand = 0;
      switch (p.type) {
        case "FS":
          cand = pEf + p.lag;
          break;
        case "SS":
          cand = pEs + p.lag;
          break;
        case "FF":
          cand = pEf + p.lag - d;
          break;
        case "SF":
          cand = pEs + p.lag - d;
          break;
      }
      start = Math.max(start, cand);
    }
    es.set(id, start);
    ef.set(id, start + (dur.get(id) || 1));
  }

  const projectEnd = Math.max(0, ...[...ef.values()]);
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();

  for (const id of [...order].reverse()) {
    const d = dur.get(id) || 1;
    const succ = succs.get(id) || [];
    if (!succ.length) {
      lf.set(id, projectEnd);
      ls.set(id, projectEnd - d);
      continue;
    }
    let finish = projectEnd;
    for (const s of succ) {
      const sLs = ls.get(s.id) ?? projectEnd;
      const sLf = lf.get(s.id) ?? projectEnd;
      let cand = projectEnd;
      switch (s.type) {
        case "FS":
          cand = sLs - s.lag;
          break;
        case "SS":
          cand = sLs - s.lag + d;
          break;
        case "FF":
          cand = sLf - s.lag;
          break;
        case "SF":
          cand = sLf - s.lag + d;
          break;
      }
      finish = Math.min(finish, cand);
    }
    lf.set(id, finish);
    ls.set(id, finish - d);
  }

  const nodes: CpmNode[] = items.map((wi) => {
    const id = wi.id;
    const d = dur.get(id) || 1;
    const esV = es.get(id) ?? 0;
    const efV = ef.get(id) ?? d;
    const lsV = ls.get(id) ?? esV;
    const lfV = lf.get(id) ?? efV;
    const flt = Math.round((lsV - esV) * 100) / 100;
    return {
      id,
      title: wi.title,
      project_id: wi.project_id,
      wbs_code: wi.wbs_code || null,
      status: wi.status || null,
      durationDays: d,
      es: esV,
      ef: efV,
      ls: lsV,
      lf: lfV,
      float: flt,
      critical: Math.abs(flt) < 0.01,
      planned_start: wi.planned_start || null,
      planned_end: wi.planned_end || null,
    };
  });

  nodes.sort((a, b) => a.es - b.es || a.title.localeCompare(b.title));
  const criticalIds = nodes.filter((n) => n.critical).map((n) => n.id);
  return { nodes, projectEnd, criticalIds };
}
