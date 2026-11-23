/**
 * iProjectX executive demo deck (widescreen 16:9).
 * Run: node scripts/generate-demo-pptx.mjs
 */
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const PptxGenJS = require("pptxgenjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const NAVY = "0F1B3D";
const NAVY_LIGHT = "1E3A5F";
const ACCENT = "3B6FA0";
const SURFACE = "E8EDF3";
const WHITE = "FFFFFF";
const MUTED = "64748B";
const BODY = "1E3A5F";
const GREEN = "15803D";
const AMBER = "B45309";
const RED = "DC2626";

const W = 13.333;
const H = 7.5;

const MARK = path.join(ROOT, "public/brand/iprojectx-mark.webp");
const hasMark = fs.existsSync(MARK);

function addFooter(slide, page, total) {
  slide.addShape("rect", {
    x: 0,
    y: 7.18,
    w: W,
    h: 0.32,
    fill: { color: NAVY },
  });
  slide.addText("iProjectX  ·  Portfolio Intelligence Platform  ·  Confidential — demo use", {
    x: 0.4,
    y: 7.18,
    w: 10.2,
    h: 0.32,
    fontSize: 10,
    color: "C5D0DE",
    fontFace: "Calibri",
    valign: "middle",
  });
  slide.addText(`${page}  /  ${total}`, {
    x: 11.2,
    y: 7.18,
    w: 1.7,
    h: 0.32,
    fontSize: 10,
    color: "C5D0DE",
    fontFace: "Calibri",
    align: "right",
    valign: "middle",
  });
}

function addHeaderBar(slide, eyebrow) {
  slide.addShape("rect", { x: 0, y: 0, w: W, h: 0.08, fill: { color: ACCENT } });
  if (hasMark) {
    slide.addImage({ path: MARK, x: 0.4, y: 0.22, w: 0.38, h: 0.38 });
  }
  slide.addText("iProjectX", {
    x: hasMark ? 0.88 : 0.4,
    y: 0.2,
    w: 3.2,
    h: 0.42,
    fontSize: 16,
    bold: true,
    color: NAVY,
    fontFace: "Calibri",
    valign: "middle",
  });
  if (eyebrow) {
    slide.addText(eyebrow, {
      x: 6.4,
      y: 0.2,
      w: 6.5,
      h: 0.42,
      fontSize: 12,
      color: MUTED,
      fontFace: "Calibri",
      align: "right",
      valign: "middle",
    });
  }
}

function titleBlock(slide, title, subtitle) {
  slide.addText(title, {
    x: 0.45,
    y: 0.72,
    w: 12.4,
    h: 0.55,
    fontSize: 26,
    bold: true,
    color: NAVY,
    fontFace: "Calibri",
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.45,
      y: 1.24,
      w: 12.4,
      h: 0.38,
      fontSize: 14,
      color: BODY,
      fontFace: "Calibri",
    });
  }
}

function card(slide, x, y, w, h, opts = {}) {
  slide.addShape("roundRect", {
    x,
    y,
    w,
    h,
    fill: { color: opts.fill || WHITE },
    rectRadius: 0.08,
    shadow: opts.shadow === false ? undefined : { type: "outer", color: "0F1B3D", blur: 8, opacity: 0.08, offset: 2 },
    line: { color: opts.line || SURFACE, pt: 1 },
  });
  if (opts.accent) {
    slide.addShape("rect", { x, y, w: 0.08, h, fill: { color: opts.accent } });
  }
}

async function main() {
  const pres = new PptxGenJS();
  pres.defineLayout({ name: "WIDE", width: W, height: H });
  pres.layout = "WIDE";
  pres.author = "iProjectX";
  pres.title = "iProjectX — Portfolio Intelligence Platform";
  pres.subject = "Executive product demonstration";
  pres.company = "iProjectX";

  const TOTAL = 16;
  let n = 0;
  const next = () => ++n;

  // ── 1 Title ──────────────────────────────────────────────
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: NAVY } });
    slide.addShape("rect", { x: 0, y: 0, w: 0.16, h: H, fill: { color: ACCENT } });
    slide.addShape("ellipse", {
      x: 9.2,
      y: -1.4,
      w: 6.2,
      h: 6.2,
      fill: { color: NAVY_LIGHT },
    });
    if (hasMark) {
      slide.addImage({ path: MARK, x: 0.7, y: 1.15, w: 0.72, h: 0.72 });
    }
    slide.addText("PORTFOLIO INTELLIGENCE PLATFORM", {
      x: 0.7,
      y: 2.05,
      w: 10,
      h: 0.32,
      fontSize: 13,
      color: ACCENT,
      bold: true,
      fontFace: "Calibri",
      charSpacing: 3,
    });
    slide.addText("iProjectX", {
      x: 0.7,
      y: 2.4,
      w: 11,
      h: 0.85,
      fontSize: 48,
      bold: true,
      color: WHITE,
      fontFace: "Calibri",
    });
    slide.addText("Intelligence, governance, and control — on one truth.", {
      x: 0.7,
      y: 3.3,
      w: 10.5,
      h: 0.5,
      fontSize: 20,
      color: "D6DEE8",
      fontFace: "Calibri",
    });
    slide.addText(
      "Calculated project health  ·  Portfolio Pulse  ·  Explainable KPIs  ·  Stage-gate governance\nEnterprise MFA  ·  Optional SSO & BYOD  ·  White-label  ·  In-house AI",
      {
        x: 0.7,
        y: 4.05,
        w: 11,
        h: 0.85,
        fontSize: 15,
        color: "A8B8C8",
        fontFace: "Calibri",
      },
    );
    slide.addText("Executive demonstration", {
      x: 0.7,
      y: 5.55,
      w: 6,
      h: 0.32,
      fontSize: 14,
      color: WHITE,
      bold: true,
      fontFace: "Calibri",
    });
    slide.addText("Confidential  ·  For invited stakeholders", {
      x: 0.7,
      y: 5.88,
      w: 6,
      h: 0.28,
      fontSize: 12,
      color: "8FA0B3",
      fontFace: "Calibri",
    });
    slide.addNotes(
      "Open with the problem: registers record the past. iProjectX is an intelligence layer over delivery. Do not claim SOC 2 / ISO certification — say readiness. Then walk the live product.",
    );
    addFooter(slide, p, TOTAL);
  }

  // ── 2 Agenda ─────────────────────────────────────────────
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "F7F9FB" } });
    addHeaderBar(slide, "Demonstration agenda");
    titleBlock(slide, "How we will spend the next 30 minutes", "Live product first. Slides only set the frame.");

    const items = [
      ["01", "The problem", "Why a register is not a PMO command center"],
      ["02", "The platform", "Health, Pulse, Explain, gates, finance, RAID"],
      ["03", "Live walkthrough", "Cockpit → project → financials → governance"],
      ["04", "Trust & tenancy", "MFA, RLS, white-label, optional SSO / BYOD"],
      ["05", "Close", "What we can stand up next, and how"],
    ];
    items.forEach((row, i) => {
      const y = 1.85 + i * 0.92;
      card(slide, 0.45, y, 12.4, 0.82, { accent: ACCENT });
      slide.addText(row[0], {
        x: 0.65,
        y,
        w: 0.85,
        h: 0.82,
        fontSize: 20,
        bold: true,
        color: ACCENT,
        fontFace: "Calibri",
        valign: "middle",
      });
      slide.addText(row[1], {
        x: 1.6,
        y,
        w: 3.4,
        h: 0.82,
        fontSize: 18,
        bold: true,
        color: NAVY,
        fontFace: "Calibri",
        valign: "middle",
      });
      slide.addText(row[2], {
        x: 5.1,
        y,
        w: 7.4,
        h: 0.82,
        fontSize: 15,
        color: BODY,
        fontFace: "Calibri",
        valign: "middle",
      });
    });
    slide.addNotes(
      "Keep this slide to 30 seconds. Promise a live walkthrough, not a feature dump. If time is short, skip 4 until questions.",
    );
    addFooter(slide, p, TOTAL);
  }

  // ── 3 Problem ────────────────────────────────────────────
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "F7F9FB" } });
    addHeaderBar(slide, "The problem");
    titleBlock(
      slide,
      "Registers record the past. Leaders need the next decision.",
      "What happens when portfolios still run on decks, spreadsheets, and typed RAG.",
    );
    const fails = [
      ["Register theatre", "RAG is typed by hand while schedule, FAC, and risks tell another story."],
      ["Executives fly blind", "Board packs are weeks old — no pulse, no drivers, no early warning."],
      ["Budget discovered late", "Overruns surface at year-end, with no explain trail."],
      ["Gates skipped", "Approvals in email. Checklists optional. Evidence nowhere."],
      ["RAID in spreadsheets", "Risks, actions, issues, decisions decoupled from delivery."],
      ["Weak control", "Shared logins, no MFA, flat permissions, blurred tenants."],
    ];
    fails.forEach((row, i) => {
      const col = i % 3;
      const rowi = Math.floor(i / 3);
      const x = 0.45 + col * 4.2;
      const y = 1.85 + rowi * 2.4;
      card(slide, x, y, 4.0, 2.2, { accent: RED });
      slide.addText(row[0], {
        x: x + 0.25,
        y: y + 0.22,
        w: 3.55,
        h: 0.5,
        fontSize: 16,
        bold: true,
        color: NAVY,
        fontFace: "Calibri",
      });
      slide.addText(row[1], {
        x: x + 0.25,
        y: y + 0.78,
        w: 3.55,
        h: 1.15,
        fontSize: 13,
        color: BODY,
        fontFace: "Calibri",
      });
    });
    slide.addNotes(
      "Ask: how many of these did you see last quarter? Pause. Then: iProjectX calculates health, explains the number, and puts the next action in front of the PMO.",
    );
    addFooter(slide, p, TOTAL);
  }

  // ── 4 Shift ──────────────────────────────────────────────
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "F7F9FB" } });
    addHeaderBar(slide, "The shift");
    titleBlock(slide, "From a static register to a live intelligence layer", "Same delivery data. Different job.");

    card(slide, 0.45, 1.85, 5.9, 4.95, { fill: WHITE });
    slide.addText("WITHOUT", {
      x: 0.7,
      y: 2.05,
      w: 5.4,
      h: 0.32,
      fontSize: 12,
      bold: true,
      color: RED,
      fontFace: "Calibri",
      charSpacing: 1.5,
    });
    [
      "Manual RAG that disagrees with the numbers",
      "Status decks assembled the night before",
      "Forecast variance with no drivers",
      "Talent double-booked across programs",
      "AI copilots that leak portfolio data",
    ].forEach((t, i) => {
      slide.addText("▸  " + t, {
        x: 0.7,
        y: 2.55 + i * 0.72,
        w: 5.4,
        h: 0.65,
        fontSize: 15,
        color: BODY,
        fontFace: "Calibri",
      });
    });

    card(slide, 6.95, 1.85, 5.9, 4.95, { fill: NAVY, line: NAVY, shadow: false });
    slide.addText("WITH iPROJECTX", {
      x: 7.2,
      y: 2.05,
      w: 5.4,
      h: 0.32,
      fontSize: 12,
      bold: true,
      color: ACCENT,
      fontFace: "Calibri",
      charSpacing: 1.5,
    });
    [
      "Calculated health across eight dimensions",
      "Portfolio Pulse — week-over-week change",
      "Explain This on RAG, forecast, and spend",
      "Governed gates with checklist evidence",
      "In-house AI on live org data by default",
    ].forEach((t, i) => {
      slide.addText("▸  " + t, {
        x: 7.2,
        y: 2.55 + i * 0.72,
        w: 5.4,
        h: 0.65,
        fontSize: 15,
        color: WHITE,
        fontFace: "Calibri",
      });
    });
    slide.addNotes(
      "This is the one-sentence pitch: not another register — an intelligence layer over delivery, with enterprise tenancy.",
    );
    addFooter(slide, p, TOTAL);
  }

  // ── 5 One truth ──────────────────────────────────────────
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "F7F9FB" } });
    addHeaderBar(slide, "Architecture of the product");
    titleBlock(
      slide,
      "One data model. No sync jobs. No drift.",
      "Modules share schedule, finance, RAID, resources, and benefits — Agile and Waterfall on the same spine.",
    );
    const mods = [
      ["Command", "Pulse, Cockpit, Executive Intelligence, In-house AI"],
      ["Portfolio", "Projects, programs, infographic, demand, scenarios"],
      ["Delivery", "Timeline, stage gates, work, resources, timesheets"],
      ["Financials", "Monthly cashflow, FY, phase spend, EVM, benefits"],
      ["Governance", "RAID, decisions, reports, audit evidence packs"],
      ["Control plane", "MFA, roles, white-label, optional SSO / BYOD"],
    ];
    mods.forEach((row, i) => {
      const col = i % 3;
      const rowi = Math.floor(i / 3);
      const x = 0.45 + col * 4.2;
      const y = 1.9 + rowi * 2.35;
      card(slide, x, y, 4.0, 2.15, { accent: ACCENT });
      slide.addText(row[0], {
        x: x + 0.25,
        y: y + 0.28,
        w: 3.55,
        h: 0.45,
        fontSize: 18,
        bold: true,
        color: NAVY,
        fontFace: "Calibri",
      });
      slide.addText(row[1], {
        x: x + 0.25,
        y: y + 0.82,
        w: 3.55,
        h: 1.05,
        fontSize: 14,
        color: BODY,
        fontFace: "Calibri",
      });
    });
    slide.addNotes(
      "In the demo, keep returning to this: change a milestone or a monthly actual and health, pulse, and explain all move. That is the ‘one truth’ moment.",
    );
    addFooter(slide, p, TOTAL);
  }

  // ── 6 Health Engine ──────────────────────────────────────
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "F7F9FB" } });
    addHeaderBar(slide, "Project Health Engine");
    titleBlock(
      slide,
      "Health is calculated — not typed",
      "Weighted 0–100 score. RAG bands: Green ≥ 80  ·  Amber 65–79  ·  Red below 65.",
    );
    const dims = [
      ["Schedule", "20%"],
      ["Financial", "20%"],
      ["Delivery", "15%"],
      ["Scope", "10%"],
      ["Resource", "10%"],
      ["Risk", "10%"],
      ["Dependencies", "10%"],
      ["Benefits", "5%"],
    ];
    dims.forEach((d, i) => {
      const x = 0.45 + (i % 4) * 3.15;
      const y = 1.85 + Math.floor(i / 4) * 1.35;
      card(slide, x, y, 3.0, 1.2);
      slide.addText(d[0], {
        x: x + 0.18,
        y: y + 0.18,
        w: 2.65,
        h: 0.42,
        fontSize: 16,
        bold: true,
        color: NAVY,
        fontFace: "Calibri",
      });
      slide.addText(d[1] + " of overall health", {
        x: x + 0.18,
        y: y + 0.62,
        w: 2.65,
        h: 0.38,
        fontSize: 13,
        color: MUTED,
        fontFace: "Calibri",
      });
    });
    slide.addText(
      "Plus: main drivers  ·  early warnings (delay / cost impact)  ·  30-day predictive outlook  ·  Explain on every RAG chip",
      {
        x: 0.45,
        y: 4.7,
        w: 12.4,
        h: 0.4,
        fontSize: 14,
        color: BODY,
        fontFace: "Calibri",
      },
    );
    card(slide, 0.45, 5.2, 12.4, 1.7, { fill: NAVY, line: NAVY, shadow: false });
    slide.addText("DEMO CUE", {
      x: 0.7,
      y: 5.35,
      w: 2,
      h: 0.28,
      fontSize: 11,
      bold: true,
      color: ACCENT,
      fontFace: "Calibri",
    });
    slide.addText(
      "Open a project infographic → Project Health Engine. Click Explain on overall RAG and on Financial. Show a Red/Amber driver, then the 30-day forecast.",
      {
        x: 0.7,
        y: 5.68,
        w: 11.9,
        h: 0.95,
        fontSize: 15,
        color: WHITE,
        fontFace: "Calibri",
      },
    );
    slide.addNotes(
      "Do not linger on every dimension. Pick one Amber project. Show score → band logic → the driver that pulled the colour. That is the ‘explainable RAG’ wow.",
    );
    addFooter(slide, p, TOTAL);
  }

  // ── 7 Explain ────────────────────────────────────────────
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "F7F9FB" } });
    addHeaderBar(slide, "Explainable KPIs");
    titleBlock(
      slide,
      "Every material number can defend itself",
      "The same Explain control on money KPIs and on RAG status.",
    );
    const cols = [
      ["Financials Explain", "Forecast, incurred, remaining, benefits — FAC vs approved funding, monthly plan vs actual, vendor and FTE drivers."],
      ["RAG Explain", "Score, band logic, dimension weights, the drivers that pulled Green / Amber / Red, and the 30-day outlook."],
      ["Why it matters", "The board no longer asks ‘why is this Amber?’ in a side email. The answer is on the chip."],
    ];
    cols.forEach((c, i) => {
      const x = 0.45 + i * 4.2;
      card(slide, x, 1.9, 4.0, 3.35, { accent: i === 2 ? GREEN : ACCENT });
      slide.addText(c[0], {
        x: x + 0.25,
        y: 2.12,
        w: 3.55,
        h: 0.7,
        fontSize: 18,
        bold: true,
        color: NAVY,
        fontFace: "Calibri",
      });
      slide.addText(c[1], {
        x: x + 0.25,
        y: 2.9,
        w: 3.55,
        h: 2.05,
        fontSize: 14,
        color: BODY,
        fontFace: "Calibri",
      });
    });
    slide.addText("DEMO CUE   Financials page → Forecast KPI → Explain. Then any RAG chip on Cockpit or Infographic.", {
      x: 0.45,
      y: 5.5,
      w: 12.4,
      h: 1.35,
      fontSize: 15,
      color: NAVY,
      fontFace: "Calibri",
    });
    slide.addNotes("Click Explain twice in the live app. Silence after the popover opens — let them read the bullets.");
    addFooter(slide, p, TOTAL);
  }

  // ── 8 Pulse + Exec ───────────────────────────────────────
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "F7F9FB" } });
    addHeaderBar(slide, "Leadership views");
    titleBlock(slide, "Pulse for this week. Intelligence for the next decision.", "");

    card(slide, 0.45, 1.75, 6.1, 5.05);
    slide.addText("Portfolio Pulse", {
      x: 0.7,
      y: 1.95,
      w: 5.6,
      h: 0.4,
      fontSize: 20,
      bold: true,
      color: NAVY,
      fontFace: "Calibri",
    });
    slide.addText(
      "Event-driven health across Financial, Delivery, Resources, Risk, Benefits, and Dependencies. Week-over-week digest: what deteriorated, improved, or became overdue.",
      {
        x: 0.7,
        y: 2.45,
        w: 5.6,
        h: 1.45,
        fontSize: 14,
        color: BODY,
        fontFace: "Calibri",
      },
    );
    ["Area RAG with Explain", "Trend vs last snapshot", "Digest leaders can act on this week"].forEach((t, i) => {
      slide.addText("●   " + t, {
        x: 0.7,
        y: 4.05 + i * 0.5,
        w: 5.6,
        h: 0.45,
        fontSize: 15,
        color: NAVY,
        fontFace: "Calibri",
      });
    });

    card(slide, 6.8, 1.75, 6.1, 5.05);
    slide.addText("Executive Intelligence", {
      x: 7.05,
      y: 1.95,
      w: 5.6,
      h: 0.4,
      fontSize: 20,
      bold: true,
      color: NAVY,
      fontFace: "Calibri",
    });
    slide.addText(
      "What-if delay cascades, capacity gaps, funding scenarios, dependency criticality, investment ranking, and benefits realisation — on live portfolio data.",
      {
        x: 7.05,
        y: 2.45,
        w: 5.6,
        h: 1.45,
        fontSize: 14,
        color: BODY,
        fontFace: "Calibri",
      },
    );
    ["Delay cascade on a seed project", "Funding what-if vs ranked demand", "Benefits RAG vs target"].forEach((t, i) => {
      slide.addText("●   " + t, {
        x: 7.05,
        y: 4.05 + i * 0.5,
        w: 5.6,
        h: 0.45,
        fontSize: 15,
        color: NAVY,
        fontFace: "Calibri",
      });
    });
    slide.addNotes(
      "Demo: Portfolio Pulse first (30 seconds), then Executive Cockpit heatmap, then one what-if on Intelligence. Do not open every widget.",
    );
    addFooter(slide, p, TOTAL);
  }

  // ── 9 Timeline & gates ───────────────────────────────────
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "F7F9FB" } });
    addHeaderBar(slide, "Delivery & governance");
    titleBlock(slide, "Every project. Every gate. One horizon.", "FY-aware timeline plus approvals that leave evidence.");

    const boxes = [
      ["Portfolio Timeline", "Gantt with stage-gate diamonds, TODAY line, planned vs actual, slip badges. View by portfolio, program, health, sponsor."],
      ["Stage-gate governance", "Required checklists. Hold / reject / pass is auditable. Current and next gate sit next to project RAG."],
      ["Agile + Waterfall", "Sprints, velocity, and burndown on the same spine as gates and milestones — one method catalog per org."],
      ["Dependencies", "Cross-project graph with criticality and needed-by dates — feeds health and executive what-ifs."],
    ];
    boxes.forEach((b, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 0.45 + col * 6.4;
      const y = 1.85 + row * 2.4;
      card(slide, x, y, 6.15, 2.2, { accent: ACCENT });
      slide.addText(b[0], {
        x: x + 0.28,
        y: y + 0.22,
        w: 5.65,
        h: 0.45,
        fontSize: 18,
        bold: true,
        color: NAVY,
        fontFace: "Calibri",
      });
      slide.addText(b[1], {
        x: x + 0.28,
        y: y + 0.75,
        w: 5.65,
        h: 1.2,
        fontSize: 14,
        color: BODY,
        fontFace: "Calibri",
      });
    });
    slide.addNotes("Demo cue: Timeline page, point at TODAY and a slipped bar, then Stage Gates table. One gate checklist if time.");
    addFooter(slide, p, TOTAL);
  }

  // ── 10 Financials ────────────────────────────────────────
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "F7F9FB" } });
    addHeaderBar(slide, "Financial control");
    titleBlock(
      slide,
      "Cash, year, phase, and value — with an explain trail",
      "Amount on the invoice is the commercial fact. The template is the document chrome.",
    );
    const fins = [
      ["Monthly financials", "Plan / forecast / actual by month. Variance that Explain can narrate."],
      ["FY allocation", "Budget and forecast by financial year — cockpit-ready."],
      ["Phase spend", "Stage-gate windows with spend vs budget per phase and stream."],
      ["EVM & benefits", "Earned value plus promised vs realised value scored into health."],
      ["Cost vs benefit", "Investment case still visible after the project is live."],
      ["Invoices & GST", "Platform template (logo, GST, layout) applies to existing invoices too."],
    ];
    fins.forEach((f, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 0.45 + col * 4.2;
      const y = 1.9 + row * 2.35;
      card(slide, x, y, 4.0, 2.15);
      slide.addText(f[0], {
        x: x + 0.22,
        y: y + 0.25,
        w: 3.55,
        h: 0.5,
        fontSize: 16,
        bold: true,
        color: NAVY,
        fontFace: "Calibri",
      });
      slide.addText(f[1], {
        x: x + 0.22,
        y: y + 0.82,
        w: 3.55,
        h: 1.1,
        fontSize: 13,
        color: BODY,
        fontFace: "Calibri",
      });
    });
    slide.addNotes(
      "If finance stakeholders are in the room, open Financials Explain on Forecast, then FY Allocation. Mention invoice template now applies to issued invoices.",
    );
    addFooter(slide, p, TOTAL);
  }

  // ── 11 RAID ──────────────────────────────────────────────
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "F7F9FB" } });
    addHeaderBar(slide, "RAID & operating rhythm");
    titleBlock(
      slide,
      "Risks, Actions, Issues, Decisions — one governed spine",
      "Tied to the project, the gate, and the status update — not a side spreadsheet.",
    );
    const raid = [
      ["Auto-escalation", "Critical and overdue items escalate to PMs and admins."],
      ["Email digests", "Daily outbound alerts keep approvals and RAID moving."],
      ["Owners & forums", "Sponsor, approver, and forum tagging on the record."],
      ["Feeds health", "Open RAID pressure is a first-class Health Engine input."],
      ["Evidence", "Decisions and holds stay auditable for the board pack."],
      ["Resources", "Capacity heatmaps plus approved timesheet actuals."],
    ];
    raid.forEach((r, i) => {
      const x = 0.45 + (i % 3) * 4.2;
      const y = 1.9 + Math.floor(i / 3) * 2.35;
      card(slide, x, y, 4.0, 2.15, { accent: AMBER });
      slide.addText(r[0], {
        x: x + 0.25,
        y: y + 0.28,
        w: 3.55,
        h: 0.5,
        fontSize: 17,
        bold: true,
        color: NAVY,
        fontFace: "Calibri",
      });
      slide.addText(r[1], {
        x: x + 0.25,
        y: y + 0.88,
        w: 3.55,
        h: 1.0,
        fontSize: 14,
        color: BODY,
        fontFace: "Calibri",
      });
    });
    slide.addNotes("Show one Red risk on the infographic RAID table, then Actions. Mention auto-escalation; do not configure it live.");
    addFooter(slide, p, TOTAL);
  }

  // ── 12 Security ──────────────────────────────────────────
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "F7F9FB" } });
    addHeaderBar(slide, "Trust");
    titleBlock(
      slide,
      "Protect the portfolio. Still deliver the intelligence.",
      "Built for SOC 2 and ISO 27001 readiness — without overstating certification status.",
    );
    const secs = [
      ["MFA for every user", "TOTP authenticator required. Existing factors challenge; leftover enrollments are cleaned up."],
      ["Optional SSO", "Per-organisation SAML when the plan provisions it."],
      ["Row-level tenancy", "RLS isolates every organisation. Page ACL and project visibility on top."],
      ["Optional BYOD", "Tenant registers on your PostgREST-compatible database. Auth stays on iProjectX."],
      ["White-label", "Logo, palette, auth experience, and themes per organisation."],
      ["In-house AI default", "Answers stay in the org session. Approved Open AI only if the org requests it."],
      ["Network control", "Optional IP / CIDR allowlists per organisation."],
      ["Audit packs", "Admin audit log, security events, one-click Excel evidence."],
    ];
    secs.forEach((s, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = 0.4 + col * 3.2;
      const y = 1.85 + row * 2.45;
      card(slide, x, y, 3.05, 2.25);
      slide.addText(s[0], {
        x: x + 0.16,
        y: y + 0.18,
        w: 2.75,
        h: 0.7,
        fontSize: 14,
        bold: true,
        color: NAVY,
        fontFace: "Calibri",
      });
      slide.addText(s[1], {
        x: x + 0.16,
        y: y + 0.9,
        w: 2.75,
        h: 1.15,
        fontSize: 12,
        color: BODY,
        fontFace: "Calibri",
      });
    });
    slide.addNotes(
      "Do not say ‘we are SOC 2 certified’. Say ‘designed for SOC 2 / ISO 27001 readiness’. Offer to show MFA enroll if a security person is present.",
    );
    addFooter(slide, p, TOTAL);
  }

  // ── 13 Live demo path ────────────────────────────────────
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "F7F9FB" } });
    addHeaderBar(slide, "Live demonstration");
    titleBlock(slide, "Suggested click-path (12–15 minutes)", "Stay on this path unless a question pulls you aside.");

    const steps = [
      ["1", "Sign in", "/auth  →  MFA challenge  →  workspace"],
      ["2", "Pulse", "Portfolio Pulse — this week’s movement"],
      ["3", "Cockpit", "Health heatmap, dimension RAG, Explain"],
      ["4", "Project", "Infographic + Health Engine + RAID"],
      ["5", "Money", "Financials Explain on Forecast / remaining"],
      ["6", "Time", "Timeline TODAY line + a slipped gate"],
      ["7", "Trust", "White-label / landing (if execs) or skip"],
    ];
    steps.forEach((s, i) => {
      const y = 1.78 + i * 0.7;
      slide.addShape("ellipse", {
        x: 0.5,
        y: y + 0.08,
        w: 0.48,
        h: 0.48,
        fill: { color: NAVY },
      });
      slide.addText(s[0], {
        x: 0.5,
        y: y + 0.08,
        w: 0.48,
        h: 0.48,
        fontSize: 14,
        bold: true,
        color: WHITE,
        align: "center",
        valign: "middle",
        fontFace: "Calibri",
      });
      slide.addText(s[1], {
        x: 1.2,
        y,
        w: 2.4,
        h: 0.64,
        fontSize: 16,
        bold: true,
        color: NAVY,
        fontFace: "Calibri",
        valign: "middle",
      });
      slide.addText(s[2], {
        x: 3.7,
        y,
        w: 9.1,
        h: 0.64,
        fontSize: 15,
        color: BODY,
        fontFace: "Calibri",
        valign: "middle",
      });
    });
    slide.addNotes(
      "Pre-open: Pulse, one Amber project infographic, Financials, Timeline. Disable cartoons if they distract. Have a second user tab only if showing permissions.",
    );
    addFooter(slide, p, TOTAL);
  }

  // ── 14 Differentiators ───────────────────────────────────
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "F7F9FB" } });
    addHeaderBar(slide, "Why iProjectX");
    titleBlock(slide, "What buyers remember after the room", "");
    const why = [
      ["Calculated, not decorated", "Health and Pulse are engine output. RAG is explained with band logic and drivers."],
      ["One truth", "Agile and Waterfall, finance and RAID, on one model — no overnight sync."],
      ["Enterprise tenancy", "MFA for all, RLS, optional SSO, IP allowlists, optional BYOD residency."],
      ["Your brand, your data", "White-label shell. In-house AI by default. Open AI only on request."],
      ["Ready for the board", "Cockpit, reports, downloadable pages, invoice documents from one template."],
      ["Operable this quarter", "Excel-native import, demand from Jira, evidence packs — not a 18-month programme."],
    ];
    why.forEach((w, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 0.45 + col * 4.2;
      const y = 1.75 + row * 2.5;
      card(slide, x, y, 4.0, 2.3, { accent: ACCENT });
      slide.addText(w[0], {
        x: x + 0.22,
        y: y + 0.22,
        w: 3.55,
        h: 0.7,
        fontSize: 16,
        bold: true,
        color: NAVY,
        fontFace: "Calibri",
      });
      slide.addText(w[1], {
        x: x + 0.22,
        y: y + 1.0,
        w: 3.55,
        h: 1.05,
        fontSize: 13,
        color: BODY,
        fontFace: "Calibri",
      });
    });
    slide.addNotes("Use this if you cannot do a long live demo. Three cards max spoken aloud.");
    addFooter(slide, p, TOTAL);
  }

  // ── 15 Stats ─────────────────────────────────────────────
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: NAVY } });
    slide.addShape("rect", { x: 0, y: 0, w: W, h: 0.08, fill: { color: ACCENT } });
    slide.addText("At a glance", {
      x: 0.5,
      y: 0.45,
      w: 12,
      h: 0.5,
      fontSize: 28,
      bold: true,
      color: WHITE,
      fontFace: "Calibri",
    });
    const stats = [
      ["8", "Health dimensions"],
      ["6", "Pulse areas"],
      ["100%", "MFA-enforced"],
      ["1", "Truth · Agile & Waterfall"],
    ];
    stats.forEach((s, i) => {
      const x = 0.5 + i * 3.2;
      slide.addText(s[0], {
        x,
        y: 2.1,
        w: 2.95,
        h: 1.3,
        fontSize: 42,
        bold: true,
        color: WHITE,
        fontFace: "Calibri",
        align: "center",
      });
      slide.addText(s[1], {
        x,
        y: 3.4,
        w: 2.95,
        h: 0.7,
        fontSize: 14,
        color: "A8B8C8",
        fontFace: "Calibri",
        align: "center",
      });
    });
    slide.addText(
      "Green ≥ 80   ·   Amber 65–79   ·   Red below 65\nIn-house AI by default  ·  Approved Open AI only if the organisation requests it",
      {
        x: 0.5,
        y: 4.6,
        w: 12.3,
        h: 1.2,
        fontSize: 16,
        color: "C5D0DE",
        fontFace: "Calibri",
        align: "center",
      },
    );
    slide.addNotes("Do not invent customer counts or certifications. These four numbers are product facts.");
    addFooter(slide, p, TOTAL);
  }

  // ── 16 Close ─────────────────────────────────────────────
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: NAVY } });
    slide.addShape("rect", { x: 0, y: 0, w: 0.16, h: H, fill: { color: ACCENT } });
    slide.addText("Turn the portfolio into\nan intelligence advantage.", {
      x: 0.7,
      y: 1.35,
      w: 12,
      h: 1.6,
      fontSize: 32,
      bold: true,
      color: WHITE,
      fontFace: "Calibri",
    });
    slide.addText(
      "White-label ready. Multi-tenant and MFA-enforced. Optional SSO and BYOD.\nDeploy calculated health, Portfolio Pulse, explainable KPIs, and executive intelligence — not another spreadsheet register.",
      {
        x: 0.7,
        y: 3.15,
        w: 11.5,
        h: 1.15,
        fontSize: 16,
        color: "C5D0DE",
        fontFace: "Calibri",
      },
    );
    card(slide, 0.7, 4.55, 5.5, 1.85, { fill: ACCENT, line: ACCENT, shadow: false });
    slide.addText("Next step", {
      x: 0.95,
      y: 4.7,
      w: 5.1,
      h: 0.32,
      fontSize: 12,
      bold: true,
      color: WHITE,
      fontFace: "Calibri",
    });
    slide.addText("Expression of Interest\nor a scoped pilot workspace", {
      x: 0.95,
      y: 5.05,
      w: 5.1,
      h: 1.05,
      fontSize: 18,
      bold: true,
      color: WHITE,
      fontFace: "Calibri",
    });
    slide.addText("www.iprojectx.com\nSign in for the live workspace", {
      x: 6.6,
      y: 4.7,
      w: 5.8,
      h: 1.55,
      fontSize: 18,
      color: WHITE,
      fontFace: "Calibri",
      valign: "middle",
    });
    slide.addNotes(
      "Close with one ask: EOI or a 2-week pilot on their portfolio extract. Offer to stay for security / BYOD questions. Thank them. Stop talking.",
    );
    addFooter(slide, p, TOTAL);
  }

  const outDir = path.join(ROOT, "docs");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "iProjectX-Executive-Demo.pptx");
  await pres.writeFile({ fileName: outFile });

  const artifacts = "/opt/cursor/artifacts";
  if (fs.existsSync(path.dirname(artifacts))) {
    fs.mkdirSync(artifacts, { recursive: true });
    fs.copyFileSync(outFile, path.join(artifacts, "iProjectX-Executive-Demo.pptx"));
  }

  console.log("Wrote", outFile);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
