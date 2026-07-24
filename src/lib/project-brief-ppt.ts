import pptxgen from "pptxgenjs";

/** Green PMO template colors */
const GREEN = "1E5631";
const LIGHT_GREEN = "E2EFDA";
const ACCENT = "8CC152";

type Money = number | null | undefined;
const fmt = (v: Money) => (v == null ? "—" : `$${Math.round(Number(v)).toLocaleString()}`);
const dt = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString() : "—");

export type ProjectBriefInput = {
  project: {
    project_code?: string | null;
    name: string;
    portfolio?: string | null;
    workstream?: string | null;
    sponsor_name?: string | null;
    business_owner?: string | null;
    business_solution_manager?: string | null;
    strategic_alignment?: string | null;
    approved_budget?: Money;
    actual_spend?: Money;
    forecast_at_completion?: Money;
    expected_benefit?: Money;
    planned_start_date?: string | null;
    planned_end_date?: string | null;
    actual_start_date?: string | null;
    actual_end_date?: string | null;
    target_go_live?: string | null;
    priority?: string | null;
    rag_overall?: string | null;
    program?: string | null;
    status?: string | null;
    brief?: any;
  };
  milestones?: Array<{ name: string; planned_date?: string | null; status?: string | null; owner?: string | null }>;
  risks?: Array<{ description: string; category?: string | null; residual_rating?: string | null; mitigation_plan?: string | null; owner?: string | null }>;
  dependencies?: Array<{ from_project?: string | null; to_project?: string | null; dependency_type?: string | null; status?: string | null; description?: string | null }>;
  timelineImage?: string | null;
  /** Delivery streams (when enabled) for the delivery-plan slide */
  streams?: Array<{
    name: string;
    code?: string | null;
    planned_start_date?: string | null;
    planned_end_date?: string | null;
    actual_start_date?: string | null;
    actual_end_date?: string | null;
    budget?: Money;
    rag?: string | null;
    gates?: Array<{ gate_name: string; planned_date?: string | null; actual_date?: string | null; status?: string | null }>;
  }>;
  /** Resource allocations for delivery-plan heatmap */
  resourcePlan?: Array<{
    name: string;
    role?: string | null;
    stream_name?: string | null;
    months: Array<{ key: string; label: string; pct: number }>;
  }>;
  monthlySpend?: Array<{ label: string; planned: number; actual: number; forecast: number }>;
  benefitsSummary?: Array<{ title: string; target?: Money; realised?: Money }>;
};

function bandTitle(slide: pptxgen.Slide, text: string, y = 0.25) {
  slide.addShape("rect", { x: 0.3, y, w: 9.6, h: 0.55, fill: { color: GREEN }, line: { color: GREEN } });
  slide.addText(text, { x: 0.4, y, w: 9.5, h: 0.55, color: "FFFFFF", bold: true, fontSize: 16, valign: "middle" });
  slide.addShape("rect", { x: 10.0, y, w: 3.0, h: 0.55, fill: { color: LIGHT_GREEN }, line: { color: LIGHT_GREEN } });
}

function sectionHeader(slide: pptxgen.Slide, y: number, text: string, w = 12.7) {
  slide.addShape("rect", { x: 0.3, y, w, h: 0.35, fill: { color: GREEN }, line: { color: GREEN } });
  slide.addText(text, { x: 0.4, y, w: w - 0.2, h: 0.35, color: "FFFFFF", bold: true, fontSize: 12, valign: "middle" });
}

function labelBox(slide: pptxgen.Slide, x: number, y: number, w: number, h: number, label: string, value: string) {
  slide.addShape("rect", { x, y, w: 1.5, h, fill: { color: "111111" }, line: { color: "111111" } });
  slide.addText(label, { x: x + 0.05, y, w: 1.4, h, color: "FFFFFF", bold: true, fontSize: 10, valign: "middle" });
  slide.addShape("rect", { x: x + 1.5, y, w: w - 1.5, h, fill: { color: "FFFFFF" }, line: { color: "CCCCCC" } });
  slide.addText(value || "—", { x: x + 1.55, y, w: w - 1.6, h, color: "111111", fontSize: 10, valign: "middle" });
}

function longBox(slide: pptxgen.Slide, x: number, y: number, w: number, h: number, title: string, value: string) {
  sectionHeader(slide, y, title, w);
  slide.addShape("rect", { x, y: y + 0.35, w, h: h - 0.35, fill: { color: "FFFFFF" }, line: { color: "CCCCCC" } });
  slide.addText(value || "—", { x: x + 0.1, y: y + 0.4, w: w - 0.2, h: h - 0.45, color: "222222", fontSize: 10, valign: "top" });
}

export async function downloadProjectBriefPPT(input: ProjectBriefInput) {
  const { project, milestones = [], risks = [], dependencies = [], timelineImage } = input;
  const brief = project.brief ?? {};
  const s1 = brief.section1 ?? {};
  const s2 = brief.section2 ?? {};

  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5

  // ============ SLIDE 1 — Section 1: Business Owner ============
  const slide1 = pres.addSlide();
  slide1.background = { color: "F5F5F5" };
  bandTitle(slide1, `PROJECT BRIEF — ${project.name || "<Initiative Name>"}`, 0.25);
  slide1.addText("Section 1: Business Owner to complete in\nconjunction with Business Solution Manager", {
    x: 10.05, y: 0.28, w: 2.9, h: 0.5, fontSize: 9, italic: true, color: GREEN, align: "center",
  });

  // Metadata strip
  const stripY = 0.95;
  labelBox(slide1, 0.3, stripY, 3.0, 0.4, "Portfolio /\nWorkstream", `${project.portfolio ?? ""} ${project.workstream ? "/ " + project.workstream : ""}`.trim());
  labelBox(slide1, 3.4, stripY, 2.6, 0.4, "Sponsor", project.sponsor_name ?? "");
  labelBox(slide1, 6.1, stripY, 2.8, 0.4, "Business Owner", project.business_owner ?? "");
  labelBox(slide1, 9.0, stripY, 2.4, 0.4, "Business Solution Mgr", project.business_solution_manager ?? "");
  labelBox(slide1, 11.5, stripY, 1.5, 0.4, "Strategic Align.", project.strategic_alignment ?? "");

  // Two-column body
  longBox(slide1, 0.3, 1.5, 12.7, 1.2, "Background and Context", s1.background_context ?? "");
  longBox(slide1, 0.3, 2.8, 12.7, 1.2, "Opportunity / Problem Statement", s1.opportunity_problem ?? "");
  longBox(slide1, 0.3, 4.1, 6.2, 1.7, "Objective", s1.objective ?? "");
  longBox(slide1, 6.7, 4.1, 6.3, 1.7, "Assumptions & Constraints", s1.assumptions_constraints ?? "");
  longBox(slide1, 0.3, 5.9, 6.2, 1.4, "Project Scope", `${s1.scope_in ? "In Scope:\n" + s1.scope_in + "\n\n" : ""}${s1.scope_out ? "Out of Scope:\n" + s1.scope_out : ""}`.trim());
  longBox(slide1, 6.7, 5.9, 6.3, 1.4, "Key Metrics / Success Measures", s1.success_measures ?? "");

  // ============ SLIDE 2 — Section 2: Solution Manager ============
  const slide2 = pres.addSlide();
  slide2.background = { color: "F5F5F5" };
  bandTitle(slide2, `PROJECT BRIEF — ${project.name || "<Initiative Name>"}`, 0.25);
  slide2.addText("Section 2: Business Solution Manager to complete in\nconjunction with Business Owner", {
    x: 10.05, y: 0.28, w: 2.9, h: 0.5, fontSize: 9, italic: true, color: GREEN, align: "center",
  });

  // Left column — Approval / Funding / Estimates
  sectionHeader(slide2, 0.95, "Approval Ask", 6.2);
  const rows = [
    ["Approval Type", s2.approval_type ?? "—"],
    ["Funding Ask", s2.funding_ask ?? "—"],
    ["Funding Source", s2.funding_source ?? "—"],
    ["Resource Ask", s2.resource_ask ?? "—"],
  ];
  rows.forEach((r, i) => {
    const y = 1.3 + i * 0.35;
    slide2.addShape("rect", { x: 0.3, y, w: 1.8, h: 0.35, fill: { color: "111111" }, line: { color: "111111" } });
    slide2.addText(r[0], { x: 0.35, y, w: 1.75, h: 0.35, color: "FFFFFF", bold: true, fontSize: 9, valign: "middle" });
    slide2.addShape("rect", { x: 2.1, y, w: 4.4, h: 0.35, fill: { color: "FFFFFF" }, line: { color: "CCCCCC" } });
    slide2.addText(r[1], { x: 2.15, y, w: 4.35, h: 0.35, color: "111111", fontSize: 9, valign: "middle" });
  });

  longBox(slide2, 0.3, 2.75, 6.2, 1.5, "Estimate Summary and Funding Schedule",
    `Approved: ${fmt(project.approved_budget)}   Actual: ${fmt(project.actual_spend)}   FAC: ${fmt(project.forecast_at_completion)}\n\n${s2.estimate_commentary ?? ""}`);
  longBox(slide2, 0.3, 4.35, 6.2, 3.0, "Project P&L / Benefits",
    `Expected Benefit: ${fmt(project.expected_benefit)}\n\n${s2.benefits_commentary ?? ""}`);

  // Right column — Milestones / Risks / Dependencies
  const cell = (t: string, bold = false) => {
    const options: any = { bold, fontSize: 9, color: bold ? "FFFFFF" : "111111" };
    if (bold) options.fill = { color: GREEN };
    return { text: String(t ?? ""), options };
  };
  sectionHeader(slide2, 0.95, "Summary of Delivery Milestones", 6.3);
  const msRows = [
    [cell("Milestone", true), cell("Status", true), cell("Date", true)],
    ...milestones.slice(0, 5).map((m) => [cell(m.name ?? ""), cell(m.status ?? "—"), cell(dt(m.planned_date))]),
  ];
  slide2.addTable(msRows, {
    x: 6.7, y: 1.3, w: 6.3, colW: [3.3, 1.4, 1.6],
    fontSize: 9, border: { pt: 0.5, color: "CCCCCC" },
    rowH: 0.28,
  });

  sectionHeader(slide2, 3.4, "Project Risks", 6.3);
  const rkRows = [
    [cell("Description", true), cell("Rating", true), cell("Owner", true)],
    ...risks.slice(0, 5).map((r) => [cell(r.description ?? ""), cell(r.residual_rating ?? "—"), cell(r.owner ?? "—")]),
  ];
  slide2.addTable(rkRows, {
    x: 6.7, y: 3.75, w: 6.3, colW: [3.5, 1.2, 1.6],
    fontSize: 9, border: { pt: 0.5, color: "CCCCCC" }, rowH: 0.28,
  });

  sectionHeader(slide2, 5.55, "Dependencies", 6.3);
  const depRows = [
    [cell("From → To", true), cell("Type", true), cell("Status", true)],
    ...dependencies.slice(0, 4).map((d) => [cell(`${d.from_project ?? "—"} → ${d.to_project ?? "—"}`), cell(d.dependency_type ?? "—"), cell(d.status ?? "—")]),
  ];
  slide2.addTable(depRows, {
    x: 6.7, y: 5.9, w: 6.3, colW: [3.5, 1.2, 1.6],
    fontSize: 9, border: { pt: 0.5, color: "CCCCCC" }, rowH: 0.28,
  });

  // ============ SLIDE 3 — Timeline (if image supplied) ============
  if (timelineImage && typeof timelineImage === "string" && timelineImage.length > 100) {
    const slide3 = pres.addSlide();
    slide3.background = { color: "F5F5F5" };
    bandTitle(slide3, `PROJECT TIMELINE — ${project.name}`, 0.25);
    slide3.addText(`Planned: ${dt(project.planned_start_date)} → ${dt(project.planned_end_date)}    Actual: ${dt(project.actual_start_date)} → ${dt(project.actual_end_date)}`,
      { x: 0.3, y: 0.9, w: 12.7, h: 0.35, fontSize: 11, color: "333333" });
    // Ensure a proper data URI (pptxgenjs accepts "data:image/png;base64,..." or "image/png;base64,...")
    const imgData = timelineImage.startsWith("data:") ? timelineImage : `data:image/png;base64,${timelineImage}`;
    slide3.addImage({ data: imgData, x: 0.3, y: 1.3, w: 12.7, h: 6.0 });
  }


  // ============ SLIDE — Delivery Plan (streams + resources + finance) ============
  addDeliveryPlanSlide(pres, input, cell);

  // ============ SLIDE — Key Data ============
  const slideKey = pres.addSlide();
  slideKey.background = { color: "F5F5F5" };
  bandTitle(slideKey, `KEY DATA — ${project.name}`, 0.25);

  sectionHeader(slideKey, 0.95, "Header", 12.7);
  const kv: [string, string][] = [
    ["Project Code", project.project_code ?? "—"],
    ["Program", project.program ?? "—"],
    ["Priority", project.priority ?? "—"],
    ["Overall RAG", project.rag_overall ?? "—"],
    ["Approved Budget", fmt(project.approved_budget)],
    ["Actual Spend", fmt(project.actual_spend)],
    ["Forecast at Completion", fmt(project.forecast_at_completion)],
    ["Expected Benefit", fmt(project.expected_benefit)],
    ["Planned Start", dt(project.planned_start_date)],
    ["Planned End", dt(project.planned_end_date)],
    ["Actual Start", dt(project.actual_start_date)],
    ["Actual End", dt(project.actual_end_date)],
  ];
  slideKey.addTable(
    [
      [cell("Field", true), cell("Value", true)],
      ...kv.map(([k, v]) => [cell(k), cell(v)]),
    ],
    { x: 0.3, y: 1.35, w: 12.7, colW: [4.0, 8.7], fontSize: 11, border: { pt: 0.5, color: "CCCCCC" }, rowH: 0.35, fill: { color: "FFFFFF" } }
  );

  // pptxgenjs 3.12/4.x has a Content_Types bug: it writes one <Override> per slide
  // for /ppt/slideMasters/slideMasterN.xml but only ever emits slideMaster1.xml,
  // which makes PowerPoint refuse to open the file with a "sorry, we can't read it"
  // repair prompt. Post-process the generated ZIP to keep only the master overrides
  // whose files actually exist, then trigger the download ourselves.
  const fileName = `Project-Brief-${(project.project_code ?? project.name ?? "Project").replace(/\s+/g, "_")}.pptx`;
  const rawBlob = (await (pres as any).write({ outputType: "blob" })) as Blob;
  const fixedBlob = await sanitizeContentTypes(rawBlob);
  triggerDownload(fixedBlob, fileName);
}

/** Dense one-page delivery plan inspired by executive PMO infographics. */
function addDeliveryPlanSlide(
  pres: pptxgen,
  input: ProjectBriefInput,
  cell: (t: string, bold?: boolean) => { text: string; options: any },
) {
  const { project, streams = [], resourcePlan = [], monthlySpend = [], benefitsSummary = [], milestones = [] } = input;
  const slide = pres.addSlide();
  slide.background = { color: "F7F9FC" };

  const NAVY = "0F2744";
  const TEAL = "0D9488";
  const AMBER = "D97706";
  const BLUE = "2563EB";
  const PURPLE = "7C3AED";
  const laneColors = [TEAL, "DC2626", BLUE, PURPLE, AMBER];

  // Header bar
  slide.addShape("rect", { x: 0, y: 0, w: 13.33, h: 0.72, fill: { color: NAVY }, line: { color: NAVY } });
  slide.addText(`${(project.name || "PROJECT").toUpperCase()} — PROJECT DELIVERY PLAN`, {
    x: 0.25, y: 0.08, w: 9.2, h: 0.35, color: "FFFFFF", bold: true, fontSize: 14, fontFace: "Calibri",
  });
  slide.addText(
    `${project.project_code || "—"}  ·  ${project.program || "Program"}  ·  RAG ${project.rag_overall || "—"}  ·  ${project.status || "Active"}`,
    { x: 0.25, y: 0.4, w: 9.2, h: 0.25, color: "CBD5E1", fontSize: 9 },
  );

  const start = project.planned_start_date || project.actual_start_date;
  const end = project.planned_end_date || project.actual_end_date || project.target_go_live;
  let weeks = "—";
  if (start && end) {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (Number.isFinite(ms) && ms > 0) weeks = `${Math.max(1, Math.round(ms / (7 * 86400000)))} wks`;
  }
  const kpiW = 1.7;
  const kpis: [string, string][] = [
    ["Duration", weeks],
    ["Go-Live", dt(project.target_go_live || project.planned_end_date)],
    ["Total Cost", fmt(project.approved_budget ?? project.forecast_at_completion)],
    ["Streams", String(streams.length || 1)],
    ["Roles", String(resourcePlan.length || "—")],
  ];
  kpis.forEach(([label, value], i) => {
    const x = 9.0 + (i % 5) * 0.82;
    // compact KPI chips under header right
    void x;
  });
  // KPI strip under header
  kpis.forEach(([label, value], i) => {
    const x = 0.25 + i * 2.6;
    slide.addShape("roundRect", {
      x, y: 0.85, w: 2.45, h: 0.55,
      fill: { color: "FFFFFF" }, line: { color: "E2E8F0" }, rectRadius: 0.06,
    });
    slide.addText(label, { x: x + 0.1, y: 0.88, w: 2.25, h: 0.2, color: "64748B", fontSize: 8, bold: true });
    slide.addText(value, { x: x + 0.1, y: 1.08, w: 2.25, h: 0.28, color: NAVY, fontSize: 12, bold: true });
  });

  // --- 1. Timeline / streams ---
  slide.addShape("rect", { x: 0.25, y: 1.5, w: 8.0, h: 0.28, fill: { color: NAVY } });
  slide.addText("1. DELIVERY TIMELINE (STREAMS · PLANNED)", {
    x: 0.35, y: 1.5, w: 7.8, h: 0.28, color: "FFFFFF", bold: true, fontSize: 10, valign: "middle",
  });

  const laneSource =
    streams.length > 0
      ? streams
      : [
          {
            name: "Delivery",
            code: null,
            planned_start_date: project.planned_start_date,
            planned_end_date: project.planned_end_date,
            actual_start_date: project.actual_start_date,
            actual_end_date: project.actual_end_date,
            budget: project.approved_budget,
            rag: project.rag_overall,
            gates: milestones.map((m) => ({
              gate_name: m.name,
              planned_date: m.planned_date,
              status: m.status,
            })),
          },
        ];

  const rangeStart = (() => {
    const dates = laneSource
      .flatMap((s) => [s.planned_start_date, s.actual_start_date])
      .concat([project.planned_start_date, project.actual_start_date])
      .filter(Boolean)
      .map((d) => new Date(d as string).getTime());
    return dates.length ? Math.min(...dates) : Date.now();
  })();
  const rangeEnd = (() => {
    const dates = laneSource
      .flatMap((s) => [s.planned_end_date, s.actual_end_date])
      .concat([project.planned_end_date, project.actual_end_date, project.target_go_live])
      .filter(Boolean)
      .map((d) => new Date(d as string).getTime());
    return dates.length ? Math.max(...dates) : rangeStart + 90 * 86400000;
  })();
  const span = Math.max(1, rangeEnd - rangeStart);
  const barX = 2.1;
  const barW = 5.9;
  const maxLanes = Math.min(laneSource.length, 4);
  laneSource.slice(0, maxLanes).forEach((s, i) => {
    const y = 1.9 + i * 0.72;
    const color = laneColors[i % laneColors.length];
    slide.addShape("roundRect", {
      x: 0.25, y, w: 1.75, h: 0.62,
      fill: { color }, line: { color }, rectRadius: 0.05,
    });
    slide.addText(s.name, {
      x: 0.3, y: y + 0.08, w: 1.65, h: 0.28, color: "FFFFFF", bold: true, fontSize: 9, valign: "middle",
    });
    slide.addText(s.code || "Stream", {
      x: 0.3, y: y + 0.34, w: 1.65, h: 0.22, color: "FFFFFF", fontSize: 8,
    });
    slide.addShape("rect", {
      x: barX, y: y + 0.08, w: barW, h: 0.46,
      fill: { color: "EEF2FF" }, line: { color: "E2E8F0" },
    });
    const ps = s.planned_start_date ? new Date(s.planned_start_date).getTime() : rangeStart;
    const pe = s.planned_end_date ? new Date(s.planned_end_date).getTime() : rangeEnd;
    const left = barX + ((ps - rangeStart) / span) * barW;
    const width = Math.max(0.15, ((pe - ps) / span) * barW);
    slide.addShape("roundRect", {
      x: left, y: y + 0.16, w: width, h: 0.3,
      fill: { color: BLUE }, line: { color: BLUE }, rectRadius: 0.04,
    });
    // gate diamonds (planned)
    (s.gates || []).slice(0, 6).forEach((g) => {
      if (!g.planned_date) return;
      const gt = new Date(g.planned_date).getTime();
      if (gt < rangeStart || gt > rangeEnd) return;
      const gx = barX + ((gt - rangeStart) / span) * barW;
      slide.addShape("ellipse", {
        x: gx - 0.06, y: y + 0.22, w: 0.12, h: 0.12,
        fill: { color: "16A34A" }, line: { color: "FFFFFF", width: 0.5 },
      });
    });
    slide.addText(`${dt(s.planned_start_date)} → ${dt(s.planned_end_date)}  ·  ${fmt(s.budget)}`, {
      x: barX, y: y + 0.48, w: barW, h: 0.16, color: "64748B", fontSize: 7,
    });
  });

  // --- 2. Resource plan ---
  slide.addShape("rect", { x: 0.25, y: 4.85, w: 8.0, h: 0.26, fill: { color: NAVY } });
  slide.addText("2. RESOURCE PLAN (BY ROLE · MONTH)", {
    x: 0.35, y: 4.85, w: 7.8, h: 0.26, color: "FFFFFF", bold: true, fontSize: 10, valign: "middle",
  });

  const monthLabels =
    resourcePlan[0]?.months?.map((m) => m.label) ||
    monthlySpend.slice(0, 6).map((m) => m.label) ||
    ["M1", "M2", "M3", "M4", "M5"];
  const resRows = [
    [
      cell("Role / Resource", true),
      cell("Stream", true),
      ...monthLabels.slice(0, 6).map((m) => cell(m, true)),
    ],
    ...resourcePlan.slice(0, 6).map((r) => {
      const pctByLabel = new Map(r.months.map((m) => [m.label, m.pct]));
      return [
        cell(r.role ? `${r.name} (${r.role})` : r.name),
        cell(r.stream_name || "—"),
        ...monthLabels.slice(0, 6).map((lab) => {
          const pct = pctByLabel.get(lab) ?? 0;
          return cell(pct > 0 ? `${Math.round(pct)}%` : "·");
        }),
      ];
    }),
  ];
  if (resourcePlan.length === 0) {
    resRows.push([cell("No allocations yet"), cell("—"), ...monthLabels.slice(0, 6).map(() => cell("—"))]);
  }
  const colW = [2.4, 1.2, ...Array(Math.min(6, monthLabels.length)).fill(4.4 / Math.max(1, Math.min(6, monthLabels.length)))];
  slide.addTable(resRows, {
    x: 0.25, y: 5.18, w: 8.0, colW,
    fontSize: 8, border: { pt: 0.4, color: "E2E8F0" }, rowH: 0.24,
    fill: { color: "FFFFFF" },
  });

  // --- Right column: budget + monthly + benefits ---
  slide.addShape("rect", { x: 8.45, y: 1.5, w: 4.6, h: 0.28, fill: { color: NAVY } });
  slide.addText("3. BUDGET SUMMARY", {
    x: 8.55, y: 1.5, w: 4.4, h: 0.28, color: "FFFFFF", bold: true, fontSize: 10, valign: "middle",
  });

  const budgetRows = [
    [cell("Component", true), cell("Amount", true)],
    [cell("Approved / Budget"), cell(fmt(project.approved_budget))],
    [cell("Actual spend"), cell(fmt(project.actual_spend))],
    [cell("FAC"), cell(fmt(project.forecast_at_completion))],
    [cell("Expected benefit"), cell(fmt(project.expected_benefit))],
    ...laneSource.slice(0, 3).map((s) => [cell(`Stream · ${s.name}`), cell(fmt(s.budget))]),
  ];
  slide.addTable(budgetRows, {
    x: 8.45, y: 1.85, w: 4.6, colW: [2.6, 2.0],
    fontSize: 9, border: { pt: 0.4, color: "E2E8F0" }, rowH: 0.26, fill: { color: "FFFFFF" },
  });

  slide.addShape("rect", { x: 8.45, y: 3.7, w: 4.6, h: 0.28, fill: { color: NAVY } });
  slide.addText("4. MONTHLY SPEND", {
    x: 8.55, y: 3.7, w: 4.4, h: 0.28, color: "FFFFFF", bold: true, fontSize: 10, valign: "middle",
  });
  const spendRows = [
    [cell("Month", true), cell("Plan", true), cell("Actual", true), cell("Fcst", true)],
    ...monthlySpend.slice(0, 5).map((m) => [
      cell(m.label),
      cell(fmt(m.planned)),
      cell(fmt(m.actual)),
      cell(fmt(m.forecast)),
    ]),
  ];
  if (monthlySpend.length === 0) {
    spendRows.push([cell("—"), cell("—"), cell("—"), cell("—")]);
  }
  slide.addTable(spendRows, {
    x: 8.45, y: 4.05, w: 4.6, colW: [1.2, 1.1, 1.15, 1.15],
    fontSize: 8, border: { pt: 0.4, color: "E2E8F0" }, rowH: 0.24, fill: { color: "FFFFFF" },
  });

  slide.addShape("rect", { x: 8.45, y: 5.55, w: 4.6, h: 0.28, fill: { color: NAVY } });
  slide.addText("5. KEY BENEFITS", {
    x: 8.55, y: 5.55, w: 4.4, h: 0.28, color: "FFFFFF", bold: true, fontSize: 10, valign: "middle",
  });
  const benRows = [
    [cell("Benefit", true), cell("Target", true), cell("Realised", true)],
    ...(benefitsSummary.length
      ? benefitsSummary.slice(0, 4).map((b) => [cell(b.title), cell(fmt(b.target)), cell(fmt(b.realised))])
      : [[cell("See Project Brief"), cell(fmt(project.expected_benefit)), cell("—")]]),
  ];
  slide.addTable(benRows, {
    x: 8.45, y: 5.9, w: 4.6, colW: [2.2, 1.2, 1.2],
    fontSize: 8, border: { pt: 0.4, color: "E2E8F0" }, rowH: 0.24, fill: { color: "FFFFFF" },
  });

  slide.addText(
    "Legend: blue bar = planned window · green dots = stage gates / milestones · stream lanes own delivery truth when enabled.",
    { x: 0.25, y: 7.15, w: 12.8, h: 0.25, color: "64748B", fontSize: 8, italic: true },
  );
  void kpiW;
}

async function sanitizeContentTypes(blob: Blob): Promise<Blob> {
  try {
    const JSZipMod: any = await import("jszip");
    const JSZip = JSZipMod.default ?? JSZipMod;
    const zip = await JSZip.loadAsync(blob);
    const ctFile = zip.file("[Content_Types].xml");
    if (!ctFile) return blob;
    let xml: string = await ctFile.async("string");
    // Keep only slideMaster overrides that reference a part that actually exists.
    xml = xml.replace(
      /<Override[^>]*PartName="\/ppt\/slideMasters\/slideMaster(\d+)\.xml"[^>]*\/>/g,
      (match, n) => (zip.file(`ppt/slideMasters/slideMaster${n}.xml`) ? match : "")
    );
    zip.file("[Content_Types].xml", xml);
    return await zip.generateAsync({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
  } catch {
    return blob;
  }
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 200);
}

