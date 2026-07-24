import pptxgen from "pptxgenjs";

/** Green PMO template colors */
const GREEN = "1E5631";
const LIGHT_GREEN = "E2EFDA";
const SLIDE_W = 13.33;
const SLIDE_H = 7.5;
const MARGIN = 0.3;
const CONTENT_BOTTOM = SLIDE_H - 0.2;

type Money = number | null | undefined;
const fmt = (v: Money) => (v == null ? "—" : `$${Math.round(Number(v)).toLocaleString()}`);
const dt = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString() : "—");

/** Truncate long text so body copy stays inside fixed longBox heights. */
function fitText(value: string | null | undefined, maxChars: number): string {
  const s = (value ?? "").trim() || "—";
  if (s.length <= maxChars) return s;
  return `${s.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

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
};

function bandTitle(slide: pptxgen.Slide, text: string, y = 0.25) {
  slide.addShape("rect", { x: 0.3, y, w: 9.6, h: 0.55, fill: { color: GREEN }, line: { color: GREEN } });
  slide.addText(fitText(text, 72), {
    x: 0.4, y, w: 9.5, h: 0.55, color: "FFFFFF", bold: true, fontSize: 14, valign: "middle",
  });
  slide.addShape("rect", { x: 10.0, y, w: 3.0, h: 0.55, fill: { color: LIGHT_GREEN }, line: { color: LIGHT_GREEN } });
}

function sectionHeader(slide: pptxgen.Slide, y: number, text: string, w = 12.7) {
  slide.addShape("rect", { x: 0.3, y, w, h: 0.32, fill: { color: GREEN }, line: { color: GREEN } });
  slide.addText(text, { x: 0.4, y, w: w - 0.2, h: 0.32, color: "FFFFFF", bold: true, fontSize: 11, valign: "middle" });
}

function labelBox(slide: pptxgen.Slide, x: number, y: number, w: number, h: number, label: string, value: string) {
  slide.addShape("rect", { x, y, w: 1.5, h, fill: { color: "111111" }, line: { color: "111111" } });
  slide.addText(label, { x: x + 0.05, y, w: 1.4, h, color: "FFFFFF", bold: true, fontSize: 9, valign: "middle" });
  slide.addShape("rect", { x: x + 1.5, y, w: w - 1.5, h, fill: { color: "FFFFFF" }, line: { color: "CCCCCC" } });
  slide.addText(fitText(value, 48) || "—", {
    x: x + 1.55, y, w: w - 1.6, h, color: "111111", fontSize: 9, valign: "middle",
  });
}

function longBox(slide: pptxgen.Slide, x: number, y: number, w: number, h: number, title: string, value: string) {
  // Keep shape inside slide; never paint past CONTENT_BOTTOM.
  const maxH = Math.max(0.55, CONTENT_BOTTOM - y);
  const boxH = Math.min(h, maxH);
  sectionHeader(slide, y, title, w);
  const bodyH = Math.max(0.2, boxH - 0.32);
  slide.addShape("rect", { x, y: y + 0.32, w, h: bodyH, fill: { color: "FFFFFF" }, line: { color: "CCCCCC" } });
  // ~55 chars/line at 9pt in a 6" column; clamp so text cannot overflow the shape.
  const lines = Math.max(2, Math.floor(bodyH / 0.18));
  const cols = Math.max(40, Math.floor((w / 6.2) * 55));
  slide.addText(fitText(value, lines * cols), {
    x: x + 0.08,
    y: y + 0.36,
    w: w - 0.16,
    h: Math.max(0.15, bodyH - 0.08),
    color: "222222",
    fontSize: 9,
    valign: "top",
    wrap: true,
  });
}

export async function downloadProjectBriefPPT(input: ProjectBriefInput) {
  const { project, milestones = [], risks = [], dependencies = [], timelineImage } = input;
  const brief = project.brief ?? {};
  const s1 = brief.section1 ?? {};
  const s2 = brief.section2 ?? {};

  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
  void SLIDE_W;
  void MARGIN;

  // ============ SLIDE 1 — Section 1: Business Owner ============
  const slide1 = pres.addSlide();
  slide1.background = { color: "F5F5F5" };
  bandTitle(slide1, `PROJECT BRIEF — ${project.name || "<Initiative Name>"}`, 0.2);
  slide1.addText("Section 1: Business Owner to complete in\nconjunction with Business Solution Manager", {
    x: 10.05, y: 0.22, w: 2.9, h: 0.5, fontSize: 8, italic: true, color: GREEN, align: "center",
  });

  const stripY = 0.85;
  labelBox(slide1, 0.3, stripY, 3.0, 0.38, "Portfolio /\nWorkstream", `${project.portfolio ?? ""} ${project.workstream ? "/ " + project.workstream : ""}`.trim());
  labelBox(slide1, 3.4, stripY, 2.6, 0.38, "Sponsor", project.sponsor_name ?? "");
  labelBox(slide1, 6.1, stripY, 2.8, 0.38, "Business Owner", project.business_owner ?? "");
  labelBox(slide1, 9.0, stripY, 2.4, 0.38, "Business Solution Mgr", project.business_solution_manager ?? "");
  labelBox(slide1, 11.5, stripY, 1.5, 0.38, "Strategic Align.", project.strategic_alignment ?? "");

  // Tighter stack that ends above slide bottom (7.5").
  longBox(slide1, 0.3, 1.35, 12.7, 1.05, "Background and Context", s1.background_context ?? "");
  longBox(slide1, 0.3, 2.5, 12.7, 1.05, "Opportunity / Problem Statement", s1.opportunity_problem ?? "");
  longBox(slide1, 0.3, 3.65, 6.2, 1.55, "Objective", s1.objective ?? "");
  longBox(slide1, 6.7, 3.65, 6.3, 1.55, "Assumptions & Constraints", s1.assumptions_constraints ?? "");
  const scopeText = `${s1.scope_in ? "In Scope:\n" + s1.scope_in + "\n\n" : ""}${s1.scope_out ? "Out of Scope:\n" + s1.scope_out : ""}`.trim();
  longBox(slide1, 0.3, 5.3, 6.2, 1.9, "Project Scope", scopeText);
  longBox(slide1, 6.7, 5.3, 6.3, 1.9, "Key Metrics / Success Measures", s1.success_measures ?? "");

  // ============ SLIDE 2 — Section 2: Solution Manager ============
  const slide2 = pres.addSlide();
  slide2.background = { color: "F5F5F5" };
  bandTitle(slide2, `PROJECT BRIEF — ${project.name || "<Initiative Name>"}`, 0.2);
  slide2.addText("Section 2: Business Solution Manager to complete in\nconjunction with Business Owner", {
    x: 10.05, y: 0.22, w: 2.9, h: 0.5, fontSize: 8, italic: true, color: GREEN, align: "center",
  });

  sectionHeader(slide2, 0.85, "Approval Ask", 6.2);
  const rows = [
    ["Approval Type", s2.approval_type ?? "—"],
    ["Funding Ask", s2.funding_ask ?? "—"],
    ["Funding Source", s2.funding_source ?? "—"],
    ["Resource Ask", s2.resource_ask ?? "—"],
  ];
  rows.forEach((r, i) => {
    const y = 1.2 + i * 0.32;
    slide2.addShape("rect", { x: 0.3, y, w: 1.8, h: 0.32, fill: { color: "111111" }, line: { color: "111111" } });
    slide2.addText(r[0], { x: 0.35, y, w: 1.75, h: 0.32, color: "FFFFFF", bold: true, fontSize: 8, valign: "middle" });
    slide2.addShape("rect", { x: 2.1, y, w: 4.4, h: 0.32, fill: { color: "FFFFFF" }, line: { color: "CCCCCC" } });
    slide2.addText(fitText(r[1], 80), { x: 2.15, y, w: 4.35, h: 0.32, color: "111111", fontSize: 8, valign: "middle" });
  });

  longBox(
    slide2,
    0.3,
    2.55,
    6.2,
    1.35,
    "Estimate Summary and Funding Schedule",
    `Approved: ${fmt(project.approved_budget)}   Actual: ${fmt(project.actual_spend)}   FAC: ${fmt(project.forecast_at_completion)}\n\n${s2.estimate_commentary ?? ""}`,
  );
  longBox(
    slide2,
    0.3,
    4.0,
    6.2,
    3.2,
    "Project P&L / Benefits",
    `Expected Benefit: ${fmt(project.expected_benefit)}\n\n${s2.benefits_commentary ?? ""}`,
  );

  const cell = (t: string, bold = false) => {
    const options: any = { bold, fontSize: 8, color: bold ? "FFFFFF" : "111111" };
    if (bold) options.fill = { color: GREEN };
    return { text: fitText(t, bold ? 40 : 60), options };
  };
  sectionHeader(slide2, 0.85, "Summary of Delivery Milestones", 6.3);
  const msRows = [
    [cell("Milestone", true), cell("Status", true), cell("Date", true)],
    ...milestones.slice(0, 4).map((m) => [cell(m.name ?? ""), cell(m.status ?? "—"), cell(dt(m.planned_date))]),
  ];
  slide2.addTable(msRows, {
    x: 6.7, y: 1.2, w: 6.3, colW: [3.3, 1.4, 1.6],
    fontSize: 8, border: { pt: 0.5, color: "CCCCCC" },
    rowH: 0.26,
  });

  sectionHeader(slide2, 3.15, "Project Risks", 6.3);
  const rkRows = [
    [cell("Description", true), cell("Rating", true), cell("Owner", true)],
    ...risks.slice(0, 4).map((r) => [cell(r.description ?? ""), cell(r.residual_rating ?? "—"), cell(r.owner ?? "—")]),
  ];
  slide2.addTable(rkRows, {
    x: 6.7, y: 3.5, w: 6.3, colW: [3.5, 1.2, 1.6],
    fontSize: 8, border: { pt: 0.5, color: "CCCCCC" }, rowH: 0.26,
  });

  sectionHeader(slide2, 5.2, "Dependencies", 6.3);
  const depRows = [
    [cell("From → To", true), cell("Type", true), cell("Status", true)],
    ...dependencies.slice(0, 4).map((d) => [cell(`${d.from_project ?? "—"} → ${d.to_project ?? "—"}`), cell(d.dependency_type ?? "—"), cell(d.status ?? "—")]),
  ];
  slide2.addTable(depRows, {
    x: 6.7, y: 5.55, w: 6.3, colW: [3.5, 1.2, 1.6],
    fontSize: 8, border: { pt: 0.5, color: "CCCCCC" }, rowH: 0.26,
  });

  void timelineImage;

  const fileName = `Project-Brief-${(project.project_code ?? project.name ?? "Project").replace(/\s+/g, "_")}.pptx`;
  const rawBlob = (await (pres as any).write({ outputType: "blob" })) as Blob;
  const fixedBlob = await sanitizeContentTypes(rawBlob);
  triggerDownload(fixedBlob, fileName);
}

async function sanitizeContentTypes(blob: Blob): Promise<Blob> {
  try {
    const JSZipMod: any = await import("jszip");
    const JSZip = JSZipMod.default ?? JSZipMod;
    const zip = await JSZip.loadAsync(blob);
    const ctFile = zip.file("[Content_Types].xml");
    if (!ctFile) return blob;
    let xml: string = await ctFile.async("string");
    xml = xml.replace(
      /<Override[^>]*PartName="\/ppt\/slideMasters\/slideMaster(\d+)\.xml"[^>]*\/>/g,
      (match, n) => (zip.file(`ppt/slideMasters/slideMaster${n}.xml`) ? match : ""),
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
