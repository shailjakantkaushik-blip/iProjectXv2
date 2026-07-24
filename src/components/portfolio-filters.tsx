import { useMemo, useState, useRef, useEffect } from "react";

export type PortfolioFilterState = {
  portfolio: string;
  program: string;
  sponsor: string;
  rag: string;
  phase: string;
  search: string;
  projectIds: string[]; // empty = all
};

export const emptyFilters: PortfolioFilterState = {
  portfolio: "All",
  program: "All",
  sponsor: "All",
  rag: "All",
  phase: "All",
  search: "",
  projectIds: [],
};

export function applyFilters<T extends Record<string, any>>(rows: T[], f: PortfolioFilterState): T[] {
  const q = f.search.trim().toLowerCase();
  const idSet = f.projectIds.length ? new Set(f.projectIds) : null;
  return rows.filter((p) => {
    if (idSet && !idSet.has(p.id)) return false;
    if (f.portfolio !== "All" && (p.portfolio || "Unassigned") !== f.portfolio) return false;
    if (f.program !== "All" && (p.program || "Unassigned") !== f.program) return false;
    if (f.sponsor !== "All" && (p.sponsor || "—") !== f.sponsor) return false;
    if (f.rag !== "All" && (p.rag || "Green") !== f.rag) return false;
    if (f.phase !== "All" && (p.current_phase || "—") !== f.phase) return false;
    if (
      q &&
      !(`${p.name ?? ""} ${p.project_code ?? ""} ${p.portfolio ?? ""} ${p.program ?? ""} ${p.sponsor ?? ""}`)
        .toLowerCase()
        .includes(q)
    ) {
      return false;
    }
    return true;
  });
}

export function ProjectPicker({
  projects,
  selected,
  onChange,
}: {
  projects: any[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const items = useMemo(() => {
    const s = q.toLowerCase();
    return projects
      .filter((p) => !s || `${p.project_code ?? ""} ${p.name ?? ""}`.toLowerCase().includes(s))
      .slice(0, 300);
  }, [projects, q]);
  const label = selected.length === 0 ? "All projects" : `${selected.length} project${selected.length > 1 ? "s" : ""}`;
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-8 rounded-md border bg-white px-2 text-[12px] shadow-sm hover:bg-muted"
      >
        📌 {label} ▾
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-72 rounded-md border bg-white p-2 shadow-lg">
          <input
            autoFocus
            className="mb-2 h-8 w-full rounded border px-2 text-[12px] outline-none"
            placeholder="Search projects…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <button className="hover:underline" onClick={() => onChange(items.map((p) => p.id))}>Select all</button>
            <button className="hover:underline" onClick={() => onChange([])}>Clear</button>
          </div>
          <div className="max-h-64 overflow-auto">
            {items.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[12px] hover:bg-muted">
                <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                <span className="font-mono text-[10px] text-muted-foreground">{p.project_code}</span>
                <span className="truncate">{p.name}</span>
              </label>
            ))}
            {items.length === 0 && <div className="p-2 text-center text-[11px] text-muted-foreground">No matches</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export function PortfolioFilters({
  projects,
  value,
  onChange,
}: {
  projects: any[];
  value: PortfolioFilterState;
  onChange: (v: PortfolioFilterState) => void;
}) {
  const portfolios = useMemo(
    () => Array.from(new Set(projects.map((p) => p.portfolio || "Unassigned"))).sort(),
    [projects],
  );
  const programs = useMemo(() => Array.from(new Set(projects.map((p) => p.program || "Unassigned"))).sort(), [projects]);
  const sponsors = useMemo(() => Array.from(new Set(projects.map((p) => p.sponsor || "—"))).sort(), [projects]);
  const phases = useMemo(() => Array.from(new Set(projects.map((p) => p.current_phase || "—"))).sort(), [projects]);

  const set = (k: keyof PortfolioFilterState, v: any) => onChange({ ...value, [k]: v });

  const box =
    "h-8 rounded-md border bg-white px-2 text-[12px] shadow-sm outline-none focus:ring-2 focus:ring-primary/30";

  const hasActive =
    value.portfolio !== "All" ||
    value.program !== "All" ||
    value.sponsor !== "All" ||
    value.rag !== "All" ||
    value.phase !== "All" ||
    !!value.search ||
    value.projectIds.length > 0;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-white/60 p-2">
      <span className="text-[11px] font-semibold text-muted-foreground">Filters:</span>
      <input
        className={box + " w-40"}
        placeholder="Search…"
        value={value.search}
        onChange={(e) => set("search", e.target.value)}
      />
      <ProjectPicker projects={projects} selected={value.projectIds} onChange={(v) => set("projectIds", v)} />
      <select className={box} value={value.portfolio} onChange={(e) => set("portfolio", e.target.value)}>
        <option value="All">All portfolios</option>
        {portfolios.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <select className={box} value={value.program} onChange={(e) => set("program", e.target.value)}>
        <option value="All">All programs</option>
        {programs.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select className={box} value={value.sponsor} onChange={(e) => set("sponsor", e.target.value)}>
        <option value="All">All sponsors</option>
        {sponsors.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select className={box} value={value.rag} onChange={(e) => set("rag", e.target.value)}>
        <option value="All">All RAG</option>
        <option>Green</option><option>Amber</option><option>Red</option>
      </select>
      <select className={box} value={value.phase} onChange={(e) => set("phase", e.target.value)}>
        <option value="All">All phases</option>
        {phases.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      {hasActive && (
        <button
          className="h-8 rounded-md border bg-white px-2 text-[12px] hover:bg-muted"
          onClick={() => onChange(emptyFilters)}
        >Reset</button>
      )}
    </div>
  );
}
