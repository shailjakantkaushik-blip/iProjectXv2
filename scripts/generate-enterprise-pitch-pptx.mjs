/**
 * iProjectX enterprise sales pitch (widescreen 16:9).
 * Run: node scripts/generate-enterprise-pitch-pptx.mjs
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
const RED = "DC2626";

const W = 13.333;
const H = 7.5;

const MARK = path.join(ROOT, "public/brand/iprojectx-mark.webp");
const hasMark = fs.existsSync(MARK);

function addFooter(slide, page, total) {
  slide.addShape("rect", { x: 0, y: 7.18, w: W, h: 0.32, fill: { color: NAVY } });
  slide.addText("iProjectX  ·  Enterprise product pitch  ·  Confidential", {
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
      x: 6.2,
      y: 0.2,
      w: 6.7,
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
    y: 0.7,
    w: 12.4,
    h: 0.58,
    fontSize: 24,
    bold: true,
    color: NAVY,
    fontFace: "Calibri",
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.45,
      y: 1.26,
      w: 12.4,
      h: 0.4,
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
  pres.title = "iProjectX — Enterprise Product Pitch";
  pres.subject = "Selling portfolio intelligence to enterprise PMOs";
  pres.company = "iProjectX";

  const TOTAL = 14;
  let n = 0;
  const next = () => ++n;

  // 1 Title
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: NAVY } });
    slide.addShape("rect", { x: 0, y: 0, w: 0.16, h: H, fill: { color: ACCENT } });
    slide.addShape("ellipse", { x: 9.4, y: -1.6, w: 6.4, h: 6.4, fill: { color: NAVY_LIGHT } });
    slide.addText("FOR ENTERPRISE PMO  ·  CIO  ·  CFO  ·  CISO", {
      x: 0.7,
      y: 1.7,
      w: 11,
      h: 0.32,
      fontSize: 13,
      bold: true,
      color: ACCENT,
      fontFace: "Calibri",
      charSpacing: 1.6,
    });
    slide.addText("Stop flying blind.", {
      x: 0.7,
      y: 2.15,
      w: 12,
      h: 0.7,
      fontSize: 40,
      bold: true,
      color: WHITE,
      fontFace: "Calibri",
    });
    slide.addText("Give the board one truth — calculated, explained, governed.", {
      x: 0.7,
      y: 2.9,
      w: 11.5,
      h: 0.55,
      fontSize: 20,
      color: "D6DEE8",
      fontFace: "Calibri",
    });
    slide.addText(
      "iProjectX is the portfolio intelligence platform for enterprises that have outgrown\nspreadsheets, status decks, and static registers.",
      {
        x: 0.7,
        y: 3.65,
        w: 11.2,
        h: 0.85,
        fontSize: 16,
        color: "A8B8C8",
        fontFace: "Calibri",
      },
    );
    slide.addText("Product pitch  ·  Confidential", {
      x: 0.7,
      y: 5.55,
      w: 6,
      h: 0.3,
      fontSize: 13,
      color: WHITE,
      bold: true,
      fontFace: "Calibri",
    });
    slide.addText("www.iprojectx.com", {
      x: 0.7,
      y: 5.88,
      w: 6,
      h: 0.28,
      fontSize: 13,
      color: "8FA0B3",
      fontFace: "Calibri",
    });
    slide.addNotes(
      "Open with the buyer, not the product. Name the four seats in the room. Then one sentence: calculated health, explained numbers, governed gates, enterprise tenancy.",
    );
    addFooter(slide, p, TOTAL);
  }

  // 2 Who it's for
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "F7F9FB" } });
    addHeaderBar(slide, "Ideal customer");
    titleBlock(
      slide,
      "Built for organisations that run a real portfolio",
      "If delivery is still reconciled in PowerPoint the night before the board, this is for you.",
    );
    const buyers = [
      ["PMO / Portfolio Director", "Need a single operating picture across programs — not 40 project packs."],
      ["CIO / COO", "Need Agile and Waterfall on one spine, with Jira in, not another silo."],
      ["CFO / Investment office", "Need FAC, FY, and benefits with a trail — before year-end surprise."],
      ["CISO / Risk & Audit", "Need MFA, tenancy, residency options, and evidence — not a shared login."],
    ];
    buyers.forEach((b, i) => {
      const x = 0.45 + (i % 2) * 6.4;
      const y = 1.85 + Math.floor(i / 2) * 2.4;
      card(slide, x, y, 6.15, 2.2, { accent: ACCENT });
      slide.addText(b[0], {
        x: x + 0.28,
        y: y + 0.28,
        w: 5.65,
        h: 0.5,
        fontSize: 18,
        bold: true,
        color: NAVY,
        fontFace: "Calibri",
      });
      slide.addText(b[1], {
        x: x + 0.28,
        y: y + 0.9,
        w: 5.65,
        h: 1.0,
        fontSize: 15,
        color: BODY,
        fontFace: "Calibri",
      });
    });
    slide.addNotes("Qualify: multi-project, mixed methods, board reporting, security review. If they have 3 projects and no audit, this is a later conversation.");
    addFooter(slide, p, TOTAL);
  }

  // 3 Cost of status quo
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "F7F9FB" } });
    addHeaderBar(slide, "The enterprise cost");
    titleBlock(
      slide,
      "The register is cheap. The decisions it delays are not.",
      "We do not invent ROI percentages. These are the costs your organisation already pays.",
    );
    const costs = [
      ["Late overruns", "Budget pressure found at reconciliation — when recovery options are gone."],
      ["Board-pack labour", "PMO weeks spent assembling a story the numbers already knew."],
      ["Talent collision", "Critical people booked on five programs; nobody sees it until a gate slips."],
      ["Audit friction", "Approvals in email. RAID in a personal workbook. No evidence pack."],
      ["Tool sprawl", "Jira + Excel + slides + a PPM no one logs into. Three truths, one argument."],
      ["Data exposure", "Copilots and shared drives leaking portfolio detail outside the tenant."],
    ];
    costs.forEach((c, i) => {
      const x = 0.45 + (i % 3) * 4.2;
      const y = 1.85 + Math.floor(i / 3) * 2.4;
      card(slide, x, y, 4.0, 2.2, { accent: RED });
      slide.addText(c[0], {
        x: x + 0.22,
        y: y + 0.22,
        w: 3.55,
        h: 0.5,
        fontSize: 16,
        bold: true,
        color: NAVY,
        fontFace: "Calibri",
      });
      slide.addText(c[1], {
        x: x + 0.22,
        y: y + 0.8,
        w: 3.55,
        h: 1.15,
        fontSize: 13,
        color: BODY,
        fontFace: "Calibri",
      });
    });
    slide.addNotes("Ask them which two they felt last quarter. Do not quote fake $ savings. The close is ‘we stop paying these in operating time and surprise.’");
    addFooter(slide, p, TOTAL);
  }

  // 4 Competitive frame
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "F7F9FB" } });
    addHeaderBar(slide, "What you are comparing");
    titleBlock(slide, "Three alternatives. One job to be done.", "The job is not ‘store projects’. It is ‘put the next decision in front of leaders’.");

    const cols = [
      ["Spreadsheets & decks", "Flexible. Fragile. No tenancy. No explain trail. Breaks at 20 projects."],
      ["A static register / PPM", "Stores the past. RAG is typed. Integrations become another sync job."],
      ["iProjectX", "Calculates health. Explains money and RAG. Governs gates. Isolates tenants. Optional BYOD."],
    ];
    cols.forEach((c, i) => {
      const x = 0.45 + i * 4.2;
      const fill = i === 2 ? NAVY : WHITE;
      const titleC = i === 2 ? WHITE : NAVY;
      const bodyC = i === 2 ? "D6DEE8" : BODY;
      card(slide, x, 1.9, 4.0, 4.85, { fill, line: i === 2 ? NAVY : SURFACE, shadow: i !== 2 });
      slide.addText(c[0], {
        x: x + 0.25,
        y: 2.15,
        w: 3.5,
        h: 1.1,
        fontSize: 18,
        bold: true,
        color: titleC,
        fontFace: "Calibri",
      });
      slide.addText(c[1], {
        x: x + 0.25,
        y: 3.35,
        w: 3.5,
        h: 2.9,
        fontSize: 15,
        color: bodyC,
        fontFace: "Calibri",
      });
    });
    slide.addNotes("Do not trash named competitors. Frame the category. If they name a PPM, ask: is RAG calculated or typed? Can the CFO click Explain?");
    addFooter(slide, p, TOTAL);
  }

  // 5 The offer
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "F7F9FB" } });
    addHeaderBar(slide, "The offer");
    titleBlock(slide, "An intelligence layer over delivery — not another register", "");
    slide.addText(
      "One multi-tenant command center for live portfolio KPIs, calculated project health, explainable financials, stage-gate governance, RAID, resources, and benefits — Agile and Waterfall on the same truth.",
      {
        x: 0.45,
        y: 1.7,
        w: 12.4,
        h: 1.15,
        fontSize: 16,
        color: BODY,
        fontFace: "Calibri",
      },
    );
    const pillars = [
      ["See", "Pulse and Cockpit on this week’s movement — not last month’s pack."],
      ["Explain", "Every material RAG and $ figure has drivers the board can read."],
      ["Govern", "Gates, RAID, and approvals leave evidence. Escalations do not wait for a meeting."],
      ["Trust", "MFA for every user. RLS. Optional SSO, IP allowlists, and BYOD residency."],
    ];
    pillars.forEach((c, i) => {
      const x = 0.45 + i * 3.15;
      card(slide, x, 3.05, 3.0, 3.7, { accent: ACCENT });
      slide.addText(c[0], {
        x: x + 0.2,
        y: 3.25,
        w: 2.6,
        h: 0.55,
        fontSize: 22,
        bold: true,
        color: NAVY,
        fontFace: "Calibri",
      });
      slide.addText(c[1], {
        x: x + 0.2,
        y: 3.9,
        w: 2.6,
        h: 2.5,
        fontSize: 14,
        color: BODY,
        fontFace: "Calibri",
      });
    });
    slide.addNotes("This is the only slide you must land. See / Explain / Govern / Trust. Then pick the pillar the room cares about.");
    addFooter(slide, p, TOTAL);
  }

  // 6 Outcomes by persona
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "F7F9FB" } });
    addHeaderBar(slide, "Value by seat");
    titleBlock(slide, "What each buyer can take to their next meeting", "Outcomes, not feature lists.");
    const rows = [
      ["PMO", "One operating picture. Health that is calculated. Escalations that fire without a chase email."],
      ["CFO", "FAC vs funding, FY view, GST-ready invoices, benefits vs case — with Explain, not a sidebar."],
      ["CIO", "Jira into demand. Timesheets into capacity. Agile and Waterfall without a second system."],
      ["CISO", "Mandatory TOTP MFA, tenant isolation, optional SSO / IP / BYOD, audit Excel packs."],
    ];
    rows.forEach((r, i) => {
      const y = 1.8 + i * 1.2;
      card(slide, 0.45, y, 12.4, 1.08, { accent: ACCENT });
      slide.addText(r[0], {
        x: 0.7,
        y,
        w: 1.8,
        h: 1.08,
        fontSize: 18,
        bold: true,
        color: NAVY,
        fontFace: "Calibri",
        valign: "middle",
      });
      slide.addText(r[1], {
        x: 2.6,
        y,
        w: 9.95,
        h: 1.08,
        fontSize: 15,
        color: BODY,
        fontFace: "Calibri",
        valign: "middle",
      });
    });
    slide.addNotes("Speak to the most senior person first. If CISO is present, jump to Trust after this slide.");
    addFooter(slide, p, TOTAL);
  }

  // 7 Health + explain
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "F7F9FB" } });
    addHeaderBar(slide, "The differentiator");
    titleBlock(
      slide,
      "Health and RAG that can stand in front of the board",
      "Green ≥ 80   ·   Amber 65–79   ·   Red below 65   on a weighted 0–100 score.",
    );
    const left = [
      ["Schedule 20%", "Slip, gates, milestones"],
      ["Financial 20%", "FAC, spend, remaining"],
      ["Delivery 15%", "Work and throughput"],
      ["Scope 10%", "Change and creep"],
    ];
    const right = [
      ["Resource 10%", "Capacity vs load"],
      ["Risk 10%", "Open RAID pressure"],
      ["Dependencies 10%", "Critical path in"],
      ["Benefits 5%", "Promised vs realised"],
    ];
    [...left, ...right].forEach((d, i) => {
      const col = i < 4 ? 0 : 1;
      const row = i % 4;
      const x = 0.45 + col * 4.15;
      const y = 1.85 + row * 1.2;
      card(slide, x, y, 3.95, 1.08);
      slide.addText(d[0], {
        x: x + 0.2,
        y,
        w: 3.55,
        h: 0.5,
        fontSize: 15,
        bold: true,
        color: NAVY,
        fontFace: "Calibri",
        valign: "middle",
      });
      slide.addText(d[1], {
        x: x + 0.2,
        y: y + 0.48,
        w: 3.55,
        h: 0.5,
        fontSize: 13,
        color: MUTED,
        fontFace: "Calibri",
      });
    });
    card(slide, 8.75, 1.85, 4.15, 4.85, { fill: NAVY, line: NAVY, shadow: false });
    slide.addText("Explain This", {
      x: 9.0,
      y: 2.1,
      w: 3.7,
      h: 0.45,
      fontSize: 18,
      bold: true,
      color: WHITE,
      fontFace: "Calibri",
    });
    slide.addText(
      "The same control on $ KPIs and on RAG.\n\nScore, weights, drivers, 30-day outlook.\n\nThe question ‘why is this Amber?’ is answered on the chip — not in a side email after the meeting.",
      {
        x: 9.0,
        y: 2.65,
        w: 3.7,
        h: 3.7,
        fontSize: 14,
        color: "D6DEE8",
        fontFace: "Calibri",
      },
    );
    slide.addNotes("This is the sales wedge vs every typed-RAG PPM. Offer a 3-minute live click if they doubt it.");
    addFooter(slide, p, TOTAL);
  }

  // 8 Leadership system
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "F7F9FB" } });
    addHeaderBar(slide, "For the executive table");
    titleBlock(slide, "From this week’s pulse to the next investment decision", "");
    const boxes = [
      ["Portfolio Pulse", "Six areas. Week-over-week digest. What deteriorated, improved, or became overdue."],
      ["Executive Cockpit", "Live KPIs, RAG heatmap, FY budget & forecast, filterable to the question in the room."],
      ["Executive Intelligence", "Delay cascades, capacity gaps, funding what-ifs, dependency criticality, ranking."],
      ["Reports & download", "Board-ready views. Page download. One invoice template for issued and new bills."],
    ];
    boxes.forEach((b, i) => {
      const x = 0.45 + (i % 2) * 6.4;
      const y = 1.8 + Math.floor(i / 2) * 2.45;
      card(slide, x, y, 6.15, 2.25, { accent: ACCENT });
      slide.addText(b[0], {
        x: x + 0.28,
        y: y + 0.25,
        w: 5.65,
        h: 0.45,
        fontSize: 18,
        bold: true,
        color: NAVY,
        fontFace: "Calibri",
      });
      slide.addText(b[1], {
        x: x + 0.28,
        y: y + 0.8,
        w: 5.65,
        h: 1.15,
        fontSize: 14,
        color: BODY,
        fontFace: "Calibri",
      });
    });
    slide.addNotes("CFO/CIO care about Cockpit + Intelligence. PMO cares about Pulse. Don’t tour every screen.");
    addFooter(slide, p, TOTAL);
  }

  // 9 Operate
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "F7F9FB" } });
    addHeaderBar(slide, "Run the portfolio");
    titleBlock(slide, "Delivery, money, and RAID on one operating rhythm", "");
    const ops = [
      ["Timeline & gates", "FY Gantt, TODAY line, slip badges, checklist evidence on every hold / pass / reject."],
      ["Financials", "Monthly, FY, phase, EVM, benefits. Explain on forecast, spend, remaining."],
      ["RAID spine", "Risks, actions, issues, decisions tied to the project and the gate. Auto-escalation + email digests."],
      ["People", "Capacity heatmaps. Weekly timesheets with approval. Actuals feed health."],
      ["Demand", "Jira (and extensible connectors) into the pipeline. Encrypted tokens."],
      ["Excel-native", "Import / export with upsert on project code — the on-ramp from the register you have today."],
    ];
    ops.forEach((o, i) => {
      const x = 0.45 + (i % 3) * 4.2;
      const y = 1.8 + Math.floor(i / 3) * 2.45;
      card(slide, x, y, 4.0, 2.25);
      slide.addText(o[0], {
        x: x + 0.2,
        y: y + 0.2,
        w: 3.6,
        h: 0.5,
        fontSize: 16,
        bold: true,
        color: NAVY,
        fontFace: "Calibri",
      });
      slide.addText(o[1], {
        x: x + 0.2,
        y: y + 0.78,
        w: 3.6,
        h: 1.25,
        fontSize: 13,
        color: BODY,
        fontFace: "Calibri",
      });
    });
    slide.addNotes("Excel-native is the commercial on-ramp: they do not have to boil the ocean to start.");
    addFooter(slide, p, TOTAL);
  }

  // 10 Trust
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "F7F9FB" } });
    addHeaderBar(slide, "Enterprise buying criteria");
    titleBlock(
      slide,
      "Designed for how enterprises actually buy software",
      "SOC 2 and ISO 27001 readiness — we do not claim certification we do not hold.",
    );
    const secs = [
      ["Identity", "TOTP MFA required for every user. Optional per-org SAML SSO."],
      ["Tenancy", "Row-level security. Page ACL. Project visibility. No shared-login culture."],
      ["Network", "Optional IP / CIDR allowlists per organisation."],
      ["Residency", "Optional BYOD — tenant registers on your PostgREST-compatible database."],
      ["Brand", "White-label logos, palette, auth, and themes per organisation."],
      ["AI posture", "In-house AI on live org data by default. Approved Open AI only if you request it."],
      ["Sessions", "PKCE, hardened browser sessions — not JWTs dumped in localStorage."],
      ["Evidence", "Admin audit, security events, one-click Excel packs for auditors."],
    ];
    secs.forEach((s, i) => {
      const x = 0.4 + (i % 4) * 3.2;
      const y = 1.85 + Math.floor(i / 4) * 2.45;
      card(slide, x, y, 3.05, 2.25, { accent: GREEN });
      slide.addText(s[0], {
        x: x + 0.18,
        y: y + 0.18,
        w: 2.7,
        h: 0.5,
        fontSize: 15,
        bold: true,
        color: NAVY,
        fontFace: "Calibri",
      });
      slide.addText(s[1], {
        x: x + 0.18,
        y: y + 0.75,
        w: 2.7,
        h: 1.3,
        fontSize: 12,
        color: BODY,
        fontFace: "Calibri",
      });
    });
    slide.addNotes("If procurement is in the room: offer the security pack and BYOD brief. Never say ‘we are certified’.");
    addFooter(slide, p, TOTAL);
  }

  // 11 Land in weeks
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "F7F9FB" } });
    addHeaderBar(slide, "How enterprises start");
    titleBlock(slide, "A scoped workspace this quarter — not an 18-month programme", "");
    const steps = [
      ["1", "Expression of Interest", "Confirm scope, tenancy model, and whether SSO / BYOD are in."],
      ["2", "Pilot workspace", "Load a slice of the portfolio via Excel. White-label their brand."],
      ["3", "Operate", "PMO runs Pulse + one program live. Security review in parallel."],
      ["4", "Scale", "Remaining portfolios, Jira connector, optional BYOD cutover."],
    ];
    steps.forEach((s, i) => {
      const x = 0.45 + i * 3.2;
      card(slide, x, 1.9, 3.05, 4.85, { accent: ACCENT });
      slide.addText(s[0], {
        x: x + 0.2,
        y: 2.1,
        w: 2.65,
        h: 0.7,
        fontSize: 32,
        bold: true,
        color: ACCENT,
        fontFace: "Calibri",
      });
      slide.addText(s[1], {
        x: x + 0.2,
        y: 2.9,
        w: 2.65,
        h: 1.1,
        fontSize: 16,
        bold: true,
        color: NAVY,
        fontFace: "Calibri",
      });
      slide.addText(s[2], {
        x: x + 0.2,
        y: 4.1,
        w: 2.65,
        h: 2.2,
        fontSize: 14,
        color: BODY,
        fontFace: "Calibri",
      });
    });
    slide.addNotes("Do not promise a date you cannot keep. ‘This quarter’ is the frame. Pilot on their extract is the ask.");
    addFooter(slide, p, TOTAL);
  }

  // 12 Commercial
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "F7F9FB" } });
    addHeaderBar(slide, "Commercial engagement");
    titleBlock(
      slide,
      "Plans fit the organisation — we do not pitch a price in the room",
      "Licensing, limits, and invoices are administered on the platform. GST and document chrome follow the live template.",
    );
    const comm = [
      ["What we sell", "Organisation workspace. Users under MFA. Optional SSO, BYOD, and white-label as provisioned."],
      ["What we do not do here", "No list price on this slide. No invented discount. Procurement gets a written proposal after EOI."],
      ["What you can see now", "Live product. Security posture. Invoice and license administration. Evidence packs."],
      ["The ask today", "Expression of Interest, or a dated workshop on one portfolio extract."],
    ];
    comm.forEach((c, i) => {
      const x = 0.45 + (i % 2) * 6.4;
      const y = 1.9 + Math.floor(i / 2) * 2.35;
      card(slide, x, y, 6.15, 2.15, { accent: i === 3 ? GREEN : ACCENT });
      slide.addText(c[0], {
        x: x + 0.28,
        y: y + 0.25,
        w: 5.65,
        h: 0.45,
        fontSize: 16,
        bold: true,
        color: NAVY,
        fontFace: "Calibri",
      });
      slide.addText(c[1], {
        x: x + 0.28,
        y: y + 0.8,
        w: 5.65,
        h: 1.1,
        fontSize: 14,
        color: BODY,
        fontFace: "Calibri",
      });
    });
    slide.addNotes("If they press on price: ‘we size to users, tenancy, and SSO/BYOD — proposal follows EOI.’ Do not guess a number.");
    addFooter(slide, p, TOTAL);
  }

  // 13 Risk of inaction
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: "F7F9FB" } });
    addHeaderBar(slide, "Decision");
    titleBlock(slide, "The cost of waiting another board cycle", "");
    const waits = [
      ["Another pack assembled by hand", "The numbers will have moved. The story will be late again."],
      ["Another typed RAG", "A Red project will sit Amber because nobody wanted the conversation."],
      ["Another audit scramble", "Evidence will still live in inboxes."],
      ["Another tool conversation", "Jira, Excel, and slides will still disagree."],
    ];
    waits.forEach((w, i) => {
      const y = 1.8 + i * 1.2;
      card(slide, 0.45, y, 12.4, 1.08, { accent: RED });
      slide.addText(w[0], {
        x: 0.7,
        y,
        w: 4.4,
        h: 1.08,
        fontSize: 16,
        bold: true,
        color: NAVY,
        fontFace: "Calibri",
        valign: "middle",
      });
      slide.addText(w[1], {
        x: 5.2,
        y,
        w: 7.4,
        h: 1.08,
        fontSize: 15,
        color: BODY,
        fontFace: "Calibri",
        valign: "middle",
      });
    });
    slide.addNotes("Use only if the room is lukewarm. Then go straight to the close. Do not stack fear.");
    addFooter(slide, p, TOTAL);
  }

  // 14 Close
  {
    const slide = pres.addSlide();
    const p = next();
    slide.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: NAVY } });
    slide.addShape("rect", { x: 0, y: 0, w: 0.16, h: H, fill: { color: ACCENT } });
    slide.addText("Give leaders one truth\nbefore the pack is late.", {
      x: 0.7,
      y: 1.2,
      w: 12,
      h: 1.55,
      fontSize: 32,
      bold: true,
      color: WHITE,
      fontFace: "Calibri",
    });
    slide.addText(
      "Calculated health. Explained numbers. Governed gates.\nEnterprise MFA, tenancy, optional SSO and BYOD. Your brand on the shell.",
      {
        x: 0.7,
        y: 2.95,
        w: 11.5,
        h: 0.95,
        fontSize: 16,
        color: "C5D0DE",
        fontFace: "Calibri",
      },
    );
    card(slide, 0.7, 4.2, 5.7, 2.15, { fill: ACCENT, line: ACCENT, shadow: false });
    slide.addText("Primary ask", {
      x: 0.95,
      y: 4.4,
      w: 5.25,
      h: 0.32,
      fontSize: 12,
      bold: true,
      color: WHITE,
      fontFace: "Calibri",
    });
    slide.addText("Expression of Interest\n+ a scoped pilot on your extract", {
      x: 0.95,
      y: 4.75,
      w: 5.25,
      h: 1.3,
      fontSize: 18,
      bold: true,
      color: WHITE,
      fontFace: "Calibri",
    });
    slide.addText("www.iprojectx.com\nSecurity pack and BYOD brief on request", {
      x: 6.8,
      y: 4.4,
      w: 5.7,
      h: 1.85,
      fontSize: 16,
      color: WHITE,
      fontFace: "Calibri",
      valign: "middle",
    });
    slide.addNotes("One ask. Book the date before you leave. Thank them. Stop.");
    addFooter(slide, p, TOTAL);
  }

  const outDir = path.join(ROOT, "docs");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "iProjectX-Enterprise-Pitch.pptx");
  await pres.writeFile({ fileName: outFile });

  const artifacts = "/opt/cursor/artifacts";
  fs.mkdirSync(artifacts, { recursive: true });
  fs.copyFileSync(outFile, path.join(artifacts, "iProjectX-Enterprise-Pitch.pptx"));
  console.log("Wrote", outFile);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
