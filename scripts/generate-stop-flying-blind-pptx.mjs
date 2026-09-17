#!/usr/bin/env node
/**
 * iProjectX — "Stop Flying Blind" illustrated sales story (16:9).
 * Images live in docs/sales/story-images/. Covers every shipped workspace feature.
 *
 *   node scripts/generate-stop-flying-blind-pptx.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const PptxGenJS = require("pptxgenjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const IMG = path.join(ROOT, "docs", "sales", "story-images");
const OUT = path.join(ROOT, "docs", "iProjectX-Stop-Flying-Blind.pptx");

const NAVY = "0F1B3D";
const NAVY2 = "162544";
const ACCENT = "3B6FA0";
const ICE = "E8EEF6";
const WHITE = "FFFFFF";
const INK = "1A2744";
const MUTED = "5A6A80";
const LINE = "D4DDE8";
const GREEN = "2E7D4F";
const AMBER = "B8860B";
const RED = "B42318";

const FONT = "Calibri";
const W = 13.333;
const H = 7.5;
const TOTAL = 28;

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "WIDE", width: W, height: H });
pptx.layout = "WIDE";
pptx.author = "iProjectX";
pptx.title = "iProjectX — Stop Flying Blind";
pptx.subject = "Illustrated product story and full feature pack";
pptx.company = "iProjectX";

function img(name) {
  const p = path.join(IMG, name);
  if (!fs.existsSync(p)) throw new Error("Missing image: " + p);
  return p;
}

function footer(slide, page) {
  slide.addShape("rect", { x: 0, y: 7.22, w: W, h: 0.28, fill: { color: NAVY } });
  slide.addText("iProjectX  ·  Stop Flying Blind  ·  Confidential", {
    x: 0.4,
    y: 7.24,
    w: 9.2,
    h: 0.24,
    fontFace: FONT,
    fontSize: 10,
    color: "A8B8D0",
    margin: 0,
  });
  slide.addText(`${page}  /  ${TOTAL}`, {
    x: 11.2,
    y: 7.24,
    w: 1.7,
    h: 0.24,
    fontFace: FONT,
    fontSize: 10,
    color: "A8B8D0",
    align: "right",
    margin: 0,
  });
}

function notes(slide, text) {
  slide.addNotes(text);
}

/** Full-bleed story image + spoken line. */
function story(page, file, spoken, note) {
  const s = pptx.addSlide();
  s.addImage({ path: img(file), x: 0, y: 0, w: W, h: 6.55 });
  s.addShape("rect", { x: 0, y: 6.55, w: W, h: 0.67, fill: { color: NAVY } });
  s.addText(spoken, {
    x: 0.4,
    y: 6.62,
    w: 12.5,
    h: 0.52,
    fontFace: FONT,
    fontSize: 18,
    bold: true,
    color: WHITE,
    valign: "middle",
    margin: 0,
  });
  footer(s, page);
  notes(s, note);
}

function catalog(page, eyebrow, title, subtitle, items, note) {
  const s = pptx.addSlide();
  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } });
  s.addShape("rect", { x: 0, y: 0, w: W, h: 0.08, fill: { color: ACCENT } });
  s.addText(eyebrow, {
    x: 0.4,
    y: 0.22,
    w: 12.5,
    h: 0.26,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: ACCENT,
    margin: 0,
  });
  s.addText(title, {
    x: 0.4,
    y: 0.5,
    w: 12.5,
    h: 0.42,
    fontFace: FONT,
    fontSize: 24,
    bold: true,
    color: NAVY,
    margin: 0,
  });
  if (subtitle) {
    s.addText(subtitle, {
      x: 0.4,
      y: 0.94,
      w: 12.5,
      h: 0.32,
      fontFace: FONT,
      fontSize: 13,
      color: MUTED,
      margin: 0,
    });
  }
  const top = subtitle ? 1.38 : 1.08;
  const cols = items.length > 8 ? 3 : 2;
  const rows = Math.ceil(items.length / cols);
  const cw = cols === 3 ? 4.15 : 6.3;
  const ch = Math.min(1.05, (5.65 - top) / rows);
  items.forEach((it, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 0.4 + col * (cw + 0.15);
    const y = top + row * (ch + 0.08);
    s.addShape("roundRect", {
      x,
      y,
      w: cw,
      h: ch,
      fill: { color: ICE },
      rectRadius: 0.08,
    });
    s.addText(it.t, {
      x: x + 0.14,
      y: y + 0.08,
      w: cw - 0.28,
      h: 0.26,
      fontFace: FONT,
      fontSize: 13,
      bold: true,
      color: NAVY,
      margin: 0,
    });
    s.addText(it.d, {
      x: x + 0.14,
      y: y + 0.34,
      w: cw - 0.28,
      h: ch - 0.42,
      fontFace: FONT,
      fontSize: 11,
      color: INK,
      margin: 0,
    });
  });
  footer(s, page);
  notes(s, note);
}

// ─── 1 Cover ────────────────────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addImage({ path: img("01-stop-flying-blind.png"), x: 0, y: 0, w: W, h: H });
  s.addShape("rect", { x: 0, y: 5.85, w: W, h: 1.65, fill: { color: NAVY } });
  s.addText("iProjectX  ·  Illustrated sales story", {
    x: 0.5,
    y: 5.98,
    w: 12,
    h: 0.28,
    fontFace: FONT,
    fontSize: 13,
    color: "8FB4D4",
    margin: 0,
  });
  s.addText("Stop flying blind.", {
    x: 0.5,
    y: 6.28,
    w: 12,
    h: 0.5,
    fontFace: FONT,
    fontSize: 28,
    bold: true,
    color: WHITE,
    margin: 0,
  });
  s.addText("Give the board one truth — then walk every feature in the product.", {
    x: 0.5,
    y: 6.8,
    w: 12,
    h: 0.32,
    fontFace: FONT,
    fontSize: 14,
    color: "C5D4E8",
    margin: 0,
  });
  notes(
    s,
    "Open on the title. Do not rush. Ask: “When did you last walk into a steering committee without a second spreadsheet?” Pause. Then: this story is why iProjectX exists.",
  );
}

// ─── 2 Five systems ─────────────────────────────────────────────────────────
story(
  2,
  "02-five-systems-fog.png",
  "Flying blind looks like this: five systems, one story that never matches.",
  "Point at each box. Ask which one they live in this week. Spreadsheets, ERP, timesheets, email, and the slide deck are the usual five. None of them share a formula.",
);

// ─── 3 Sunday rebuild ───────────────────────────────────────────────────────
story(
  3,
  "03-sunday-rebuild.png",
  "Someone rebuilds the pack on Sunday. By Monday the numbers have already moved.",
  "This is the human cost. Do not invent hours saved. Ask what that Sunday is worth to them. The product’s answer is a live pack — Executive Reports — not another rebuild.",
);

// ─── 4 What it means ────────────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } });
  s.addShape("rect", { x: 0, y: 0, w: W, h: 0.08, fill: { color: RED } });
  s.addText("WHAT “FLYING BLIND” MEANS IN THE ROOM", {
    x: 0.4,
    y: 0.28,
    w: 12.5,
    h: 0.28,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: RED,
    margin: 0,
  });
  s.addText("Four questions nobody can answer from one screen.", {
    x: 0.4,
    y: 0.6,
    w: 12.5,
    h: 0.42,
    fontFace: FONT,
    fontSize: 24,
    bold: true,
    color: NAVY,
    margin: 0,
  });
  const qs = [
    { r: "PMO", q: "Is this RAG real — or did someone type the colour?" },
    { r: "CFO", q: "Does the forecast match the invoice and the timesheet?" },
    { r: "CIO", q: "Is there one system of record for the change portfolio?" },
    { r: "CISO", q: "If audit asks, can we replay who saw what?" },
  ];
  qs.forEach((item, i) => {
    const y = 1.25 + i * 1.35;
    s.addShape("roundRect", {
      x: 0.4,
      y,
      w: 12.5,
      h: 1.22,
      fill: { color: ICE },
      rectRadius: 0.1,
    });
    s.addShape("roundRect", {
      x: 0.6,
      y: y + 0.32,
      w: 1.5,
      h: 0.55,
      fill: { color: NAVY },
      rectRadius: 0.08,
    });
    s.addText(item.r, {
      x: 0.6,
      y: y + 0.32,
      w: 1.5,
      h: 0.55,
      fontFace: FONT,
      fontSize: 16,
      bold: true,
      color: WHITE,
      align: "center",
      valign: "middle",
      margin: 0,
    });
    s.addText(item.q, {
      x: 2.35,
      y: y + 0.28,
      w: 10.2,
      h: 0.66,
      fontFace: FONT,
      fontSize: 20,
      color: INK,
      valign: "middle",
      margin: 0,
    });
  });
  footer(s, 4);
  notes(s, "Read the four questions slowly. The rest of the deck is how iProjectX answers each one.");
}

// ─── 5 One cockpit ──────────────────────────────────────────────────────────
story(
  5,
  "04-one-cockpit.png",
  "iProjectX is the cockpit: health, money, people, and the calendar on one picture.",
  "This is the turn in the story. From here we walk the product — not a brochure of modules, a journey from idea to board pack.",
);

// ─── 6 Four verbs ───────────────────────────────────────────────────────────
story(
  6,
  "05-see-explain-govern-trust.png",
  "The whole product is four verbs: See. Explain. Govern. Trust.",
  "See = Pulse, Cockpit, Dashboard, Infographic, Timeline. Explain = Health Engine + Explain chips on RAG and money. Govern = gates, RAID, decisions, reports. Trust = MFA, RLS, optional SSO/BYOD, audit.",
);

// ─── 7 Demand ───────────────────────────────────────────────────────────────
story(
  7,
  "06-demand-funnel.png",
  "The story starts before the project exists — an idea enters Demand.",
  "Demand Pipeline stages: Idea → Screening → Business Case → Approved / Rejected / On Hold. Admin can convert an approved case into a project. Jira and a signed webhook can drop work into Demand or Work Items.",
);

// ─── 8 Portfolio catalog ────────────────────────────────────────────────────
catalog(
  8,
  "THE STORY  ·  PORTFOLIO",
  "From idea to a living register",
  "Every item below is a real page in the product.",
  [
    { t: "Demand Pipeline", d: "Idea, screening, case, approve / reject / hold." },
    { t: "New Project Wizard", d: "Seven steps: project, streams, gates, FY, work, governance, review." },
    { t: "Project Register", d: "The inventory. Filters, KPIs, charts. One code per project." },
    { t: "Project workspace", d: "Overview, streams, decisions, work, RAID, finance — one record." },
    { t: "Programs", d: "Roll-up health and money across a programme." },
    { t: "Project Infographic", d: "One-page visual brief. PDF and PPT export." },
    { t: "Segmentation", d: "Cluster the portfolio — budget × value, not a flat list." },
    { t: "Prioritisation", d: "Rank by ROI, priority, benefits, and funding pressure." },
    { t: "Movements", d: "Gate slip and change-request movement this period." },
    { t: "Portfolio Scenarios", d: "Include / exclude projects under a funding cap." },
    { t: "Business Units", d: "The org shape the register reports against." },
    { t: "Home + My Work", d: "Role-aware start. Your approvals and assigned work." },
  ],
  "Do not tour every page. Pick Demand → one project → Infographic. The rest is “and the register already has…”",
);

// ─── 9 Spine ────────────────────────────────────────────────────────────────
story(
  9,
  "07-agile-waterfall-spine.png",
  "Agile sprints and Waterfall gates share one spine. No second system.",
  "Delivery Methods & Gates lets the org configure Waterfall (default 9 gates) and Agile (default 6). Work Items link to a gate or a sprint. Work Board is the kanban. Agile page shows velocity. One project can be hybrid.",
);

// ─── 10 Gates ───────────────────────────────────────────────────────────────
story(
  10,
  "08-stage-gates.png",
  "A gate can say no. The checklist must be complete before Approve.",
  "Stage Gates: approve / hold / reject. Checklists are enforced. Roadmap × Governance overlays the plan on the gate flow. Governance Channels name the forum and the decision rights. This is govern — not a status meeting.",
);

// ─── 11 Delivery catalog ────────────────────────────────────────────────────
catalog(
  11,
  "THE STORY  ·  DELIVERY",
  "How the work actually moves",
  "Layman version: the board, the calendar, the path, and the people.",
  [
    { t: "Work Items", d: "The WBS / tasks. Linked to a gate or a sprint." },
    { t: "Work Board", d: "Kanban with drag-and-drop. Filter by project and sprint." },
    { t: "Timeline", d: "FY Gantt, TODAY line, planned vs actual, gate markers." },
    { t: "Schedule CPM", d: "Critical path. FS / SS / FF / SF links with lag." },
    { t: "Dependencies", d: "Cross-project waits. Needed-by dates. Criticality." },
    { t: "Agile / Sprints", d: "Velocity and backlog on the same spine as gates." },
    { t: "Roadmap × Governance", d: "The plan drawn on top of the gate flow." },
    { t: "Roadmap Analytics", d: "Investment mix + Monte Carlo cost (2,000 runs)." },
    { t: "Risk Roadmap", d: "Risks on a timeline. P×I heatmap. Critical ≥ 15." },
    { t: "Governance Channels", d: "Forums, cadence, who may decide." },
    { t: "Delivery Methods", d: "Configure Waterfall, Agile, Hybrid and gate templates." },
    { t: "Latest Updates", d: "What moved. Manual status with an overall RAG." },
  ],
  "Show Timeline with the TODAY line if you only have one delivery click.",
);

// ─── 12 People ──────────────────────────────────────────────────────────────
story(
  12,
  "12-people-hours.png",
  "People are not a side spreadsheet. Hours hit the same picture as money.",
  "Resources = plan vs actual, skill heat, utilisation. Health Engine treats 70–95% as the healthy band; >110% is overload. Timesheets: draft → PM → resource manager → approved. Calendar or grid. Billable and non-billable. Capacity gaps also appear in Executive Intelligence.",
);

// ─── 13 Money ───────────────────────────────────────────────────────────────
story(
  13,
  "09-money-line.png",
  "Plan, actual, forecast, invoice — one conversation. Not four files.",
  "Financials = monthly CapEx/OpEx plan vs actual vs forecast. FY Allocation splits by financial year (default FY starts April). Phase Financials by stream. EVM: PV, EV, AC, SPI, CPI, EAC. Cost vs Benefit. Benefits Realisation feeds the 5% health weight. Org invoices use the live template — including already-issued bills.",
);

// ─── 14 Finance catalog ─────────────────────────────────────────────────────
catalog(
  14,
  "THE STORY  ·  MONEY",
  "Every finance page the CFO can open",
  "If it is about dollars, it sits on this line.",
  [
    { t: "Financials", d: "Monthly plan / actual / forecast. Variance with Explain." },
    { t: "FY Allocation", d: "Split by financial year. Default FY start: April." },
    { t: "Phase Financials", d: "Spend by phase or stream — not only by project." },
    { t: "Earned Value (EVM)", d: "SPI = EV/PV. CPI = EV/AC. EAC from the engine." },
    { t: "Cost vs Benefit", d: "What it costs versus what it returns." },
    { t: "Benefits Realisation", d: "Target vs realised. 5% of the health score." },
    { t: "Billing & Invoices", d: "Org subscription invoices. Live chrome/template." },
    { t: "Timesheets → $", d: "Approved hours are not a separate product." },
  ],
  "Open one project and stay there: plan, actual, forecast, an invoice. Do not hop tenants.",
);

// ─── 15 Health formula ──────────────────────────────────────────────────────
story(
  15,
  "10-health-formula.png",
  "Health is a formula — eight weights. Not a colour someone typed.",
  "Published weights: Schedule 20, Financial 20, Delivery 15, Scope 10, Resource 10, Risk 10, Dependencies 10, Benefits 5. Same engine on Infographic, Cockpit, and Pulse. Manual RAG still exists on the register; calculated health is what you defend.",
);

// ─── 16 RAG bands ───────────────────────────────────────────────────────────
story(
  16,
  "11-rag-bands.png",
  "Green ≥ 80. Amber 65–79. Red < 65. Same bands in every tenant.",
  "Click a RAG chip. Explain opens the drivers. Pulse uses six areas (Financial, Delivery, Resources, Risk, Benefits, Dependencies) and flags a move if the score shifts by 3 or more. Early warnings: FTE gap, slip, overrun, critical risks, util >110%, gates ≥15 days late. 30-day predictive health with confidence 50–92%.",
);

// ─── 17 RAID ────────────────────────────────────────────────────────────────
story(
  17,
  "13-raid-tower.png",
  "RAID is the control tower: Risks, Issues, Actions, Decisions — plus who owns them.",
  "Severity = probability × impact. Critical ≥ 15. Auto-escalation fields. Decisions have an approval workflow (Pending / In Review / Approved / Rejected / On Hold). Actions have owners and dates. Stakeholders map influence. Lessons stay on the project. Release & Change Register is the change-request book. Alert emails: approvals, overdue RAID, escalation, pulse — when the platform has mail on.",
);

// ─── 18 Governance catalog ──────────────────────────────────────────────────
catalog(
  18,
  "THE STORY  ·  GOVERN",
  "Evidence, not folklore",
  "If audit asked tomorrow, these pages are the replay.",
  [
    { t: "Risks", d: "P×I score. Critical ≥ 15. Escalation timestamp." },
    { t: "Issues", d: "Blockers and defects on the same spine." },
    { t: "Actions", d: "Owner, date, done or not. No inbox archaeology." },
    { t: "Decisions", d: "Log + approval. Awaiting my approval on My Work." },
    { t: "Stakeholders", d: "Influence / interest. Sponsor can be a login." },
    { t: "Lessons Learned", d: "Kept on the project, not in a forgotten folder." },
    { t: "Release & Change", d: "Change requests that move the baseline." },
    { t: "Stage Gates", d: "Hold / reject / pass. Checklist first." },
    { t: "Executive Reports", d: "The board pack: 7 tabs, Print/PDF, Excel." },
    { t: "Report Builder", d: "Save your own metric snapshot." },
    { t: "Audit Log", d: "Privileged actions. Excel pack ≤ 10,000 rows." },
    { t: "Alert emails", d: "Digest and escalation — org can opt channels." },
  ],
  "Executive Reports is the board pack. Do not call it a module that does not exist.",
);

// ─── 19 Cascade ─────────────────────────────────────────────────────────────
story(
  19,
  "14-delay-cascade.png",
  "A delay is a row of dominoes. What-if lets you touch the first one on purpose.",
  "Executive Intelligence: delay cascade through depends-on → dependent; resource capacity gaps (flag >0.5 FTE); resource optimisation; dependency criticality; change-control impact; investment ranking; funding what-if; decision backlog; benefits narrative; governance cadence tasks. This is See + Explain before the overrun.",
);

// ─── 20 Command catalog ─────────────────────────────────────────────────────
catalog(
  20,
  "THE STORY  ·  COMMAND",
  "What leaders open on Monday",
  "Six Pulse areas. One cockpit. A dashboard. An intelligence bench. An in-house AI.",
  [
    { t: "Portfolio Pulse", d: "Six areas + week-over-week. Snapshot ~every 6 days." },
    { t: "Executive Cockpit", d: "Live snapshot: money, delivery, benefits, health table." },
    { t: "Executive Dashboard", d: "Full cockpit + timelines + Generate PDF." },
    { t: "Executive Intelligence", d: "What-if, capacity, funding, decisions, benefits story." },
    { t: "In-house AI", d: "Ask the portfolio in English. Data stays in the tenant." },
    { t: "Explain This", d: "On RAG chips and money KPIs — drivers, not folklore." },
    { t: "Download page", d: "PDF / PPT / PNG of the page you are on." },
    { t: "Command palette", d: "⌘K / Ctrl+K to any page you are allowed to see." },
  ],
  "Demo path: Pulse → one red → Explain → Intelligence what-if. Twelve minutes.",
);

// ─── 21 Board pack ──────────────────────────────────────────────────────────
story(
  21,
  "15-live-board-pack.png",
  "The pack is a live view. Seven tabs. Print, PDF, or Excel — not a Sunday rebuild.",
  "Executive Reports tabs: Overview, Portfolio & RAG, Financials, Risks & Actions, Benefits, Stage Gates, Programs & BU. Project Infographic exports a one-project brief. Page Downloads policy decides which pages may export PDF/PPT/PNG.",
);

// ─── 22 AI ──────────────────────────────────────────────────────────────────
story(
  22,
  "20-inhouse-ai.png",
  "Ask the portfolio a question. The default answer never leaves the house.",
  "In-house AI is the default — RLS-scoped, no external model. An approved Open AI model is optional, off unless the org asks. Do not demo a public chatbot. Show a question about this tenant’s red project.",
);

// ─── 23 Excel ───────────────────────────────────────────────────────────────
story(
  23,
  "18-excel-onramp.png",
  "Bring the register you already have. Excel is the on-ramp, not the prison.",
  "Data Editor: 29 tables, import upserts on project code, async export for large orgs. Needs data_editor / template_upload capability. Jira Cloud/DC imports issues into Work Items or Demand (test connection first; default 50 issues). Custom webhook → Demand. Azure DevOps and ServiceNow are listed, not shipped — do not sell them.",
);

// ─── 24 Atlas ───────────────────────────────────────────────────────────────
story(
  24,
  "16-feature-atlas.png",
  "One product. Neighbourhoods: Command, Portfolio, Delivery, Money, Govern, Admin.",
  "This image is the map. The next slide is the remaining admin and trust streets so nothing is missing from the pack.",
);

// ─── 25 Admin + operate catalog ─────────────────────────────────────────────
catalog(
  25,
  "THE STORY  ·  OPERATE",
  "Admin, integrations, and the rest of the streets",
  "Still the same tenant. Nothing here is a second product.",
  [
    { t: "Team & Users", d: "Invite, roles, activate. admin / org_admin / bu_lead / pm / executive." },
    { t: "Permissions", d: "Page + table + capability matrix. Default deny." },
    { t: "Project data access", d: "Limit which projects a role or user can see." },
    { t: "Navigation sequence", d: "Reorder or hide sidebar items per org." },
    { t: "Page downloads", d: "Allow or deny PDF / PPT / PNG per page." },
    { t: "Integrations", d: "Jira (shipped). Webhook (shipped). ADO / ServiceNow not shipped." },
    { t: "Data Editor", d: "Excel workbook in and out. 29 tables." },
    { t: "Chart Theme + styles", d: "Palette and chrome. Optional cartoons on Home." },
    { t: "Organisation Settings", d: "FY start month, MFA status, notification prefs." },
    { t: "Alert emails", d: "Org channel prefs. Users can opt out where allowed." },
    { t: "Licenses + Billing", d: "Certificates and subscription invoices for the org." },
    { t: "Closed project purge", d: "Completed / cancelled older than one year." },
    { t: "Support + Legal", d: "Tickets to the platform. Published policies in-app." },
    { t: "Onboarding", d: "First-run setup for a new organisation." },
    { t: "Focus mode", d: "Denser chrome. Live sync when the database moves." },
    { t: "White-label login", d: "/o/:slug/login — their name on the door." },
  ],
  "Skip this slide in a 12-minute demo. Keep it in the leave-behind so procurement can see the streets.",
);

// ─── 26 Trust ───────────────────────────────────────────────────────────────
story(
  26,
  "17-trust-stack.png",
  "Trust is built in: MFA for everyone. Isolation. Evidence. Optional SSO and BYOD.",
  "MFA (TOTP) is required for all users. Row-level tenancy. Optional SAML SSO, IP allowlist (max 50), BYOD on a customer PostgREST-compatible database. White-label name, logo, colours. In-house AI default. Audit + security Excel packs. Say readiness for SOC 2 / ISO — never “we are certified” unless Legal confirms.",
);

// ─── 27 How the week changes ────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } });
  s.addShape("rect", { x: 0, y: 0, w: W, h: 0.08, fill: { color: ACCENT } });
  s.addText("THE WEEK, AFTER THE FOG LIFTS", {
    x: 0.4,
    y: 0.28,
    w: 12.5,
    h: 0.26,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: ACCENT,
    margin: 0,
  });
  s.addText("A layperson can tell this story in six beats.", {
    x: 0.4,
    y: 0.58,
    w: 12.5,
    h: 0.4,
    fontFace: FONT,
    fontSize: 24,
    bold: true,
    color: NAVY,
    margin: 0,
  });
  const beats = [
    { n: "01", t: "Monday", d: "Pulse shows what moved. One red is already named." },
    { n: "02", t: "The chip", d: "Explain opens the formula. Amber is 65–79 — not a feeling." },
    { n: "03", t: "The line", d: "Plan, actual, forecast, invoice agree or they don’t — on one project." },
    { n: "04", t: "The people", d: "Resources and timesheets show who is over 110%." },
    { n: "05", t: "The gate", d: "A checklist blocks Approve. A decision is logged with evidence." },
    { n: "06", t: "The pack", d: "Executive Reports print from the tenant. Nobody rebuilt Sunday." },
  ];
  beats.forEach((b, i) => {
    const x = 0.4 + (i % 3) * 4.3;
    const y = 1.2 + Math.floor(i / 3) * 2.8;
    s.addShape("roundRect", {
      x,
      y,
      w: 4.1,
      h: 2.6,
      fill: { color: i === 5 ? NAVY : ICE },
      rectRadius: 0.12,
    });
    s.addText(b.n + "   " + b.t, {
      x: x + 0.22,
      y: y + 0.22,
      w: 3.66,
      h: 0.4,
      fontFace: FONT,
      fontSize: 16,
      bold: true,
      color: i === 5 ? "8FB4D4" : ACCENT,
      margin: 0,
    });
    s.addText(b.d, {
      x: x + 0.22,
      y: y + 0.8,
      w: 3.66,
      h: 1.5,
      fontFace: FONT,
      fontSize: 16,
      color: i === 5 ? WHITE : INK,
      margin: 0,
    });
  });
  footer(s, 27);
  notes(s, "This is the close of the story before the ask. Read the six beats. Then the last image.");
}

// ─── 28 Close ───────────────────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addImage({ path: img("19-clear-sky-close.png"), x: 0, y: 0, w: W, h: 5.7 });
  s.addShape("rect", { x: 0, y: 5.7, w: W, h: 1.8, fill: { color: NAVY } });
  s.addText("Put one red project on the wall.", {
    x: 0.5,
    y: 5.88,
    w: 12.3,
    h: 0.45,
    fontFace: FONT,
    fontSize: 24,
    bold: true,
    color: WHITE,
    margin: 0,
  });
  s.addText(
    "If we cannot explain it, invoice it, and pack it from the same tenant — we have not earned the next meeting.  ·  www.iprojectx.com  ·  Expression of Interest",
    {
      x: 0.5,
      y: 6.4,
      w: 12.3,
      h: 0.7,
      fontFace: FONT,
      fontSize: 14,
      color: "C5D4E8",
      margin: 0,
    },
  );
  notes(
    s,
    "Ask for an Expression of Interest and a scoped pilot on their extract. No list price. No invented ROI. No fake logos. No SOC 2 / ISO badge.",
  );
}

await pptx.writeFile({ fileName: OUT });
console.log("Wrote", OUT);
