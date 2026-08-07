import { useMemo, useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { compareProjectsByCodeName } from "@/lib/project-options";
import { fyOf, projectScheduleEnd, projectScheduleStart } from "@/lib/project-dates";

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

export type ApplyFiltersOptions = {
  /**
   * `current` (default): phase matches `projects.current_phase`.
   * `ignore`: leave phase filtering to the page (e.g. stage-gate spend windows).
   */
  phaseMode?: "current" | "ignore";
};

export function applyFilters<T extends Record<string, any>>(
  rows: T[],
  f: PortfolioFilterState,
  opts?: ApplyFiltersOptions,
): T[] {
  const q = f.search.trim().toLowerCase();
  const idSet = f.projectIds.length ? new Set(f.projectIds) : null;
  const phaseMode = opts?.phaseMode ?? "current";
  return rows.filter((p) => {
    if (idSet && !idSet.has(p.id)) return false;
    if (f.portfolio !== "All" && (p.portfolio || "Unassigned") !== f.portfolio) return false;
    if (f.program !== "All" && (p.program || "Unassigned") !== f.program) return false;
    if (f.sponsor !== "All" && (p.sponsor || "—") !== f.sponsor) return false;
    if (f.rag !== "All" && (p.rag || "Green") !== f.rag) return false;
    if (
      phaseMode === "current" &&
      f.phase !== "All" &&
      (p.current_phase || "—") !== f.phase
    ) {
      return false;
    }
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

type PanelPos = { top: number; left: number; width: number; maxHeight: number; openUp: boolean };

/**
 * Multi-select project filter. Panel is portaled to document.body so it is never
 * clipped by .section-frame overflow scrollports.
 */
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
  const [pos, setPos] = useState<PanelPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const updatePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 320);
    const gap = 6;
    const spaceBelow = window.innerHeight - r.bottom - gap - 16;
    const spaceAbove = r.top - gap - 16;
    // Prefer opening downward unless clearly cramped
    const openUp = spaceBelow < 260 && spaceAbove > spaceBelow;
    const available = openUp ? spaceAbove : spaceBelow;
    const maxHeight = Math.min(440, Math.max(240, available));
    let left = r.left;
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
    if (left < 8) left = 8;
    setPos({
      top: openUp ? r.top - gap : r.bottom + gap,
      left,
      width,
      maxHeight,
      openUp,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => updatePos();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const main = document.querySelector<HTMLElement>(".shell-main");
    window.addEventListener("resize", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    main?.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
      main?.removeEventListener("scroll", onScroll);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, updatePos]);

  const items = useMemo(() => {
    const s = q.toLowerCase();
    return [...projects]
      .filter((p) => !s || `${p.project_code ?? ""} ${p.name ?? ""}`.toLowerCase().includes(s))
      .sort(compareProjectsByCodeName)
      .slice(0, 300);
  }, [projects, q]);

  const label =
    selected.length === 0
      ? "All projects"
      : `${selected.length} project${selected.length > 1 ? "s" : ""}`;

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const panel =
    open &&
    pos &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={panelRef}
        role="listbox"
        aria-multiselectable
        className="ui-popover fixed z-[200] rounded-md border border-border bg-surface p-2 shadow-lg"
        style={{
          top: pos.openUp ? undefined : pos.top,
          bottom: pos.openUp ? window.innerHeight - pos.top : undefined,
          left: pos.left,
          width: pos.width,
          maxHeight: pos.maxHeight,
        }}
      >
        <input
          autoFocus
          className="mb-2 h-8 w-full rounded border border-border bg-background px-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="Search projects…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
          <button type="button" className="hover:underline" onClick={() => onChange(items.map((p) => p.id))}>
            Select all
          </button>
          <button type="button" className="hover:underline" onClick={() => onChange([])}>
            Clear
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: Math.max(120, pos.maxHeight - 96) }}>
          {items.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-[12px] hover:bg-muted"
            >
              <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{p.project_code}</span>
              <span className="min-w-0 truncate">{p.name}</span>
            </label>
          ))}
          {items.length === 0 && (
            <div className="p-2 text-center text-[11px] text-muted-foreground">No matches</div>
          )}
        </div>
      </div>,
      document.body,
    );

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="ui-btn h-8 rounded-md border border-border bg-surface px-2 text-[12px] shadow-sm hover:bg-muted"
      >
        {label} ▾
      </button>
      {panel}
    </div>
  );
}

/**
 * Multi-select fiscal year picker (empty = all years). Portaled like ProjectPicker.
 */
export function FyPicker({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const updatePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 200);
    const gap = 4;
    const spaceBelow = window.innerHeight - r.bottom - gap - 12;
    const spaceAbove = r.top - gap - 12;
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(280, Math.max(140, openUp ? spaceAbove : spaceBelow));
    let left = r.left;
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
    if (left < 8) left = 8;
    setPos({
      top: openUp ? r.top - gap : r.bottom + gap,
      left,
      width,
      maxHeight,
      openUp,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => updatePos();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const main = document.querySelector<HTMLElement>(".shell-main");
    window.addEventListener("resize", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    main?.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
      main?.removeEventListener("scroll", onScroll);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, updatePos]);

  const label =
    selected.length === 0
      ? "FY: All"
      : selected.length === 1
        ? `FY: ${selected[0]}`
        : `FY: ${selected.length} years`;

  const toggle = (fy: string) =>
    onChange(selected.includes(fy) ? selected.filter((x) => x !== fy) : [...selected, fy].sort());

  const panel =
    open &&
    pos &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={panelRef}
        role="listbox"
        aria-multiselectable
        className="ui-popover fixed z-[200] rounded-md border border-border bg-surface p-2 shadow-lg"
        style={{
          top: pos.openUp ? undefined : pos.top,
          bottom: pos.openUp ? window.innerHeight - pos.top : undefined,
          left: pos.left,
          width: pos.width,
          maxHeight: pos.maxHeight,
        }}
      >
        <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
          <button type="button" className="hover:underline" onClick={() => onChange([...options])}>
            Select all
          </button>
          <button type="button" className="hover:underline" onClick={() => onChange([])}>
            Clear
          </button>
        </div>
        <div className="overflow-auto" style={{ maxHeight: Math.max(80, pos.maxHeight - 40) }}>
          {options.map((fy) => (
            <label
              key={fy}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[12px] hover:bg-muted"
            >
              <input type="checkbox" checked={selected.includes(fy)} onChange={() => toggle(fy)} />
              <span className="font-medium tabular-nums">{fy}</span>
            </label>
          ))}
          {options.length === 0 && (
            <div className="p-2 text-center text-[11px] text-muted-foreground">No fiscal years</div>
          )}
        </div>
      </div>,
      document.body,
    );

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="ui-btn h-8 rounded-md border border-border bg-surface px-2 text-[12px] shadow-sm hover:bg-muted"
      >
        {label} ▾
      </button>
      {panel}
    </div>
  );
}

export function PortfolioFilters({
  projects,
  value,
  onChange,
  phaseOptions,
  phaseAllLabel = "All phases",
}: {
  projects: any[];
  value: PortfolioFilterState;
  onChange: (v: PortfolioFilterState) => void;
  /** When set, phase dropdown uses these labels (e.g. org stage-gate names). */
  phaseOptions?: string[];
  phaseAllLabel?: string;
}) {
  const portfolios = useMemo(
    () => Array.from(new Set(projects.map((p) => p.portfolio || "Unassigned"))).sort(),
    [projects],
  );
  const programs = useMemo(
    () => Array.from(new Set(projects.map((p) => p.program || "Unassigned"))).sort(),
    [projects],
  );
  const sponsors = useMemo(
    () => Array.from(new Set(projects.map((p) => p.sponsor || "—"))).sort(),
    [projects],
  );
  const phases = useMemo(() => {
    if (phaseOptions?.length) {
      // Preserve configured stage-gate order (do not alphabetise).
      const seen = new Set<string>();
      const ordered: string[] = [];
      for (const name of phaseOptions) {
        const label = (name || "").trim();
        if (!label || seen.has(label)) continue;
        seen.add(label);
        ordered.push(label);
      }
      return ordered;
    }
    return Array.from(new Set(projects.map((p) => p.current_phase || "—")))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [projects, phaseOptions]);

  const set = (k: keyof PortfolioFilterState, v: any) => onChange({ ...value, [k]: v });

  const box =
    "h-8 rounded-md border border-border bg-surface px-2 text-[12px] shadow-sm outline-none focus:ring-2 focus:ring-primary/30";

  const hasActive =
    value.portfolio !== "All" ||
    value.program !== "All" ||
    value.sponsor !== "All" ||
    value.rag !== "All" ||
    value.phase !== "All" ||
    !!value.search ||
    value.projectIds.length > 0;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface/60 p-2">
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
        {programs.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <select className={box} value={value.sponsor} onChange={(e) => set("sponsor", e.target.value)}>
        <option value="All">All sponsors</option>
        {sponsors.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <select className={box} value={value.rag} onChange={(e) => set("rag", e.target.value)}>
        <option value="All">All RAG</option>
        <option>Green</option>
        <option>Amber</option>
        <option>Red</option>
      </select>
      <select className={box} value={value.phase} onChange={(e) => set("phase", e.target.value)}>
        <option value="All">{phaseAllLabel}</option>
        {phases.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      {hasActive && (
        <button
          type="button"
          className="ui-btn h-8 rounded-md border border-border bg-surface px-2 text-[12px] hover:bg-muted"
          onClick={() => onChange(emptyFilters)}
        >
          Reset
        </button>
      )}
    </div>
  );
}

/**
 * Executive Dashboard filter set — Project, Portfolio, Program, Sponsor,
 * Priority, Status, Fiscal Year. Shared with Portfolio Pulse for parity.
 */
export type ExecutivePortfolioFilterState = {
  portfolio: string;
  program: string;
  sponsor: string;
  priority: string;
  status: string;
  projectIds: string[];
  /** Empty = all fiscal years. */
  fySelected: string[];
};

export const emptyExecutiveFilters: ExecutivePortfolioFilterState = {
  portfolio: "All",
  program: "All",
  sponsor: "All",
  priority: "All",
  status: "All",
  projectIds: [],
  fySelected: [],
};

export function executiveFiltersActive(f: ExecutivePortfolioFilterState): boolean {
  return (
    f.projectIds.length > 0 ||
    f.portfolio !== "All" ||
    f.program !== "All" ||
    f.sponsor !== "All" ||
    f.priority !== "All" ||
    f.status !== "All" ||
    f.fySelected.length > 0
  );
}

/** Stable scope key for filtered pulse snapshots (like-for-like week deltas). */
export function executiveFilterScopeKey(f: ExecutivePortfolioFilterState): string {
  if (!executiveFiltersActive(f)) return "all";
  return [
    f.portfolio,
    f.program,
    f.sponsor,
    f.priority,
    f.status,
    [...f.projectIds].sort().join(","),
    [...f.fySelected].sort().join(","),
  ].join("|");
}

export function applyExecutivePortfolioFilters<T extends Record<string, any>>(
  projects: T[],
  f: ExecutivePortfolioFilterState,
  fyStartMonth: number,
): T[] {
  const idSet = f.projectIds.length ? new Set(f.projectIds) : null;
  const fySet = f.fySelected.length ? new Set(f.fySelected) : null;
  return projects.filter((p) => {
    if (idSet && !idSet.has(p.id)) return false;
    if (f.portfolio !== "All" && (p.portfolio || "Unassigned") !== f.portfolio) return false;
    if (f.program !== "All" && p.program !== f.program) return false;
    if (f.sponsor !== "All" && p.sponsor !== f.sponsor) return false;
    if (f.priority !== "All" && p.priority !== f.priority) return false;
    if (f.status !== "All" && p.status !== f.status) return false;
    if (fySet) {
      const a = fyOf(projectScheduleStart(p), fyStartMonth);
      const b = fyOf(projectScheduleEnd(p), fyStartMonth);
      if ((!a || !fySet.has(a)) && (!b || !fySet.has(b))) return false;
    }
    return true;
  });
}

export function ExecutivePortfolioFilters({
  projects,
  value,
  onChange,
  fyStartMonth = 4,
  title = "Portfolio filters",
}: {
  projects: any[];
  value: ExecutivePortfolioFilterState;
  onChange: (v: ExecutivePortfolioFilterState) => void;
  fyStartMonth?: number;
  title?: string;
}) {
  const opts = useCallback(
    (col: string) =>
      Array.from(new Set(projects.map((p: any) => p[col]).filter(Boolean))).sort() as string[],
    [projects],
  );

  const portfolioOpts = useMemo(
    () =>
      Array.from(
        new Set(projects.map((p: any) => p.portfolio || "Unassigned").filter(Boolean)),
      ).sort() as string[],
    [projects],
  );

  const fyOptions = useMemo(() => {
    const s = new Set<string>();
    projects.forEach((p: any) => {
      const a = fyOf(projectScheduleStart(p), fyStartMonth);
      const b = fyOf(projectScheduleEnd(p), fyStartMonth);
      if (a) s.add(a);
      if (b) s.add(b);
    });
    return Array.from(s).sort();
  }, [projects, fyStartMonth]);

  const set = <K extends keyof ExecutivePortfolioFilterState>(
    key: K,
    next: ExecutivePortfolioFilterState[K],
  ) => onChange({ ...value, [key]: next });

  const selects: {
    label: string;
    key: keyof ExecutivePortfolioFilterState;
    options: string[];
  }[] = [
    { label: "Portfolio", key: "portfolio", options: portfolioOpts },
    { label: "Program", key: "program", options: opts("program") },
    { label: "Sponsor", key: "sponsor", options: opts("sponsor") },
    { label: "Priority", key: "priority", options: opts("priority") },
    { label: "Status", key: "status", options: opts("status") },
  ];

  return (
    <div>
      {title ? <div className="mb-3 page-heading text-base font-semibold">{title}</div> : null}
      <div className="relative z-30 flex flex-wrap items-center gap-2">
        <ProjectPicker
          projects={projects}
          selected={value.projectIds}
          onChange={(v) => set("projectIds", v)}
        />
        {selects.map(({ label, key, options }) => (
          <select
            key={label}
            value={String(value[key])}
            onChange={(e) => set(key, e.target.value as ExecutivePortfolioFilterState[typeof key])}
            className="ui-btn rounded-md border border-border bg-surface px-2 py-1 text-xs"
          >
            <option value="All">{label}: All</option>
            {options.map((o) => (
              <option key={o} value={o}>
                {label}: {o}
              </option>
            ))}
          </select>
        ))}
        <FyPicker
          options={fyOptions}
          selected={value.fySelected}
          onChange={(v) => set("fySelected", v)}
        />
        {executiveFiltersActive(value) && (
          <button
            type="button"
            className="ui-btn rounded-md border border-border bg-surface px-2 py-1 text-xs hover:bg-muted"
            onClick={() => onChange(emptyExecutiveFilters)}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
