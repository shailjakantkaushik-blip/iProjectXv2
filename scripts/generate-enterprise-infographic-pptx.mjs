#!/usr/bin/env node
/**
 * iProjectX — advanced infographic sales pitch (16:9).
 *
 * Visual-first: process arrows, RAG spectrum, dimension bars, hub-and-spoke,
 * journey chevrons. No list price, no invented ROI, no certification claims.
 *
 *   node scripts/generate-enterprise-infographic-pptx.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const PptxGenJS = require("pptxgenjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outPath = path.join(root, "docs", "iProjectX-Enterprise-Infographic.pptx");
const markPath = path.join(root, "public", "brand", "iprojectx-mark.webp");

const NAVY = "0F1B3D";
const NAVY2 = "162544";
const ACCENT = "3B6FA0";
const SKY = "5B8EC4";
const MINT = "7BA3C9";
const ICE = "E8EEF6";
const WHITE = "FFFFFF";
const INK = "1A2744";
const MUTED = "5A6A80";
const LINE = "D4DDE8";
const GREEN = "2E7D4F";
const AMBER = "B8860B";
const RED = "B42318";
const GOLD = "C9A227";

const FONT = "Calibri";
const W = 13.333;
const H = 7.5;

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "WIDE", width: W, height: H });
pptx.layout = "WIDE";
pptx.author = "iProjectX";
pptx.title = "iProjectX — Infographic Sales Pitch";
pptx.subject = "Visual enterprise pitch";
pptx.company = "iProjectX";

const hasMark = fs.existsSync(markPath);

function mark(slide, x, y, w = 0.42) {
  if (!hasMark) return;
  slide.addImage({ path: markPath, x, y, w, h: w });
}

function footer(slide, page, total = 14) {
  slide.addShape("rect", {
    x: 0,
    y: 7.22,
    w: W,
    h: 0.28,
    fill: { color: NAVY },
  });
  slide.addText("iProjectX  ·  Portfolio intelligence  ·  Confidential", {
    x: 0.4,
    y: 7.24,
    w: 8,
    h: 0.24,
    fontFace: FONT,
    fontSize: 10,
    color: "A8B8D0",
    margin: 0,
  });
  slide.addText(`${page}  /  ${total}`, {
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

function chevron(slide, x, y, w, h, color, label, sub) {
  slide.addShape("chevron", {
    x,
    y,
    w,
    h,
    fill: { color },
  });
  slide.addText(label, {
    x: x + 0.12,
    y: y + 0.08,
    w: w - 0.35,
    h: 0.28,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: WHITE,
    margin: 0,
  });
  if (sub) {
    slide.addText(sub, {
      x: x + 0.12,
      y: y + 0.34,
      w: w - 0.35,
      h: 0.22,
      fontFace: FONT,
      fontSize: 10,
      color: "D6E4F5",
      margin: 0,
    });
  }
}

function pill(slide, x, y, w, h, fill, text, color = WHITE, size = 11) {
  slide.addShape("roundRect", {
    x,
    y,
    w,
    h,
    fill: { color: fill },
    rectRadius: 0.08,
  });
  slide.addText(text, {
    x,
    y,
    w,
    h,
    fontFace: FONT,
    fontSize: size,
    bold: true,
    color,
    align: "center",
    valign: "middle",
    margin: 0,
  });
}

function bar(slide, x, y, w, h, fill, label, pct) {
  slide.addText(label, {
    x,
    y,
    w: 2.15,
    h: 0.22,
    fontFace: FONT,
    fontSize: 11,
    color: INK,
    margin: 0,
  });
  slide.addShape("roundRect", {
    x: x + 2.2,
    y: y + 0.04,
    w: 3.4,
    h: 0.16,
    fill: { color: ICE },
    rectRadius: 0.04,
  });
  slide.addShape("roundRect", {
    x: x + 2.2,
    y: y + 0.04,
    w: 3.4 * pct,
    h: 0.16,
    fill: { color: fill },
    rectRadius: 0.04,
  });
  slide.addText(`${Math.round(pct * 20)}%`, {
    x: x + 5.65,
    y,
    w: 0.45,
    h: 0.22,
    fontFace: FONT,
    fontSize: 10,
    color: MUTED,
    margin: 0,
  });
}

// ─── 1 Cover ────────────────────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: NAVY } });
  s.addShape("rect", { x: 0, y: 0, w: 0.18, h: H, fill: { color: ACCENT } });
  s.addShape("rect", { x: 0, y: 6.85, w: W, h: 0.65, fill: { color: "0A1228" } });
  mark(s, 0.55, 0.4, 0.55);
  s.addText("iProjectX", {
    x: 1.25,
    y: 0.48,
    w: 4,
    h: 0.4,
    fontFace: FONT,
    fontSize: 22,
    bold: true,
    color: WHITE,
    margin: 0,
  });
  s.addText("INFOGRAPHIC SALES PITCH", {
    x: 0.55,
    y: 2.15,
    w: 12,
    h: 0.28,
    fontFace: FONT,
    fontSize: 13,
    bold: true,
    color: SKY,
    margin: 0,
  });
  s.addText("See. Explain. Govern.", {
    x: 0.55,
    y: 2.5,
    w: 12,
    h: 0.85,
    fontFace: FONT,
    fontSize: 44,
    bold: true,
    color: WHITE,
    margin: 0,
  });
  s.addText(
    "One operating picture for the portfolio — from the first RAG band to the board pack.",
    {
      x: 0.55,
      y: 3.45,
      w: 10.5,
      h: 0.55,
      fontFace: FONT,
      fontSize: 18,
      color: "C5D4E8",
      margin: 0,
    },
  );

  const chips = [
    [0.55, "Health Engine"],
    [2.85, "Finance + delivery"],
    [5.35, "Board packs"],
    [7.55, "Audit trail"],
    [9.55, "SSO + MFA"],
  ];
  chips.forEach(([x, t]) => pill(s, x, 4.3, 2.1, 0.38, ACCENT, t, WHITE, 11));

  s.addText("Confidential  ·  Buyer conversation  ·  No list price on this deck", {
    x: 0.55,
    y: 7.0,
    w: 10,
    h: 0.28,
    fontFace: FONT,
    fontSize: 12,
    color: "8FA3C0",
    margin: 0,
  });
  notes(
    s,
    "Open on the three verbs. Do not invent customer logos or ROI. Point to a live tenant if available.",
  );
}

// ─── 2 The problem as a broken flow ─────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } });
  s.addShape("rect", { x: 0, y: 0, w: W, h: 0.08, fill: { color: RED } });
  mark(s, 0.4, 0.22, 0.32);
  s.addText("THE WEEK BEFORE THE STEERING COMMITTEE", {
    x: 0.85,
    y: 0.24,
    w: 10,
    h: 0.28,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: RED,
    margin: 0,
  });
  s.addText("Five systems. One story that never quite matches.", {
    x: 0.4,
    y: 0.58,
    w: 12,
    h: 0.4,
    fontFace: FONT,
    fontSize: 24,
    bold: true,
    color: NAVY,
    margin: 0,
  });

  const boxes = [
    { x: 0.4, t: "Spreadsheets", d: "Status by email" },
    { x: 3.0, t: "Finance ERP", d: "Actuals lag weeks" },
    { x: 5.6, t: "Timesheets", d: "Hours without $ " },
    { x: 8.2, t: "Chat / email", d: "Decisions vanish" },
    { x: 10.8, t: "Slide factory", d: "Sunday rebuild" },
  ];
  boxes.forEach((b, i) => {
    s.addShape("roundRect", {
      x: b.x,
      y: 1.3,
      w: 2.15,
      h: 1.35,
      fill: { color: ICE },
      line: { color: LINE, width: 1 },
      rectRadius: 0.1,
    });
    s.addText(String(i + 1).padStart(2, "0"), {
      x: b.x + 0.12,
      y: 1.4,
      w: 1.9,
      h: 0.28,
      fontFace: FONT,
      fontSize: 12,
      bold: true,
      color: ACCENT,
      margin: 0,
    });
    s.addText(b.t, {
      x: b.x + 0.12,
      y: 1.7,
      w: 1.9,
      h: 0.35,
      fontFace: FONT,
      fontSize: 14,
      bold: true,
      color: NAVY,
      margin: 0,
    });
    s.addText(b.d, {
      x: b.x + 0.12,
      y: 2.1,
      w: 1.9,
      h: 0.35,
      fontFace: FONT,
      fontSize: 12,
      color: MUTED,
      margin: 0,
    });
    if (i < boxes.length - 1) {
      s.addShape("rightArrow", {
        x: b.x + 2.18,
        y: 1.82,
        w: 0.38,
        h: 0.28,
        fill: { color: "C5D0DE" },
      });
    }
  });

  s.addShape("roundRect", {
    x: 0.4,
    y: 2.95,
    w: 12.5,
    h: 0.7,
    fill: { color: "F8E8E6" },
    rectRadius: 0.08,
  });
  s.addText(
    "Result →  RAG without a formula   ·   Forecasts that do not match invoices   ·   Board packs that are already stale",
    {
      x: 0.6,
      y: 3.1,
      w: 12.1,
      h: 0.4,
      fontFace: FONT,
      fontSize: 15,
      bold: true,
      color: RED,
      margin: 0,
    },
  );

  const pains = [
    { t: "PMO", d: "Reconciles five sources before every forum." },
    { t: "CFO", d: "Cannot see burn vs invoice vs forecast in one line." },
    { t: "CIO", d: "No single system of record for the change portfolio." },
    { t: "CISO", d: "Exports and shadow IT sit outside the audit trail." },
  ];
  pains.forEach((p, i) => {
    const x = 0.4 + (i % 4) * 3.2;
    s.addShape("roundRect", {
      x,
      y: 3.95,
      w: 3.05,
      h: 1.95,
      fill: { color: WHITE },
      line: { color: LINE, width: 1 },
      rectRadius: 0.1,
    });
    pill(s, x + 0.18, 4.15, 1.15, 0.32, NAVY, p.t);
    s.addText(p.d, {
      x: x + 0.18,
      y: 4.6,
      w: 2.7,
      h: 1.05,
      fontFace: FONT,
      fontSize: 13,
      color: INK,
      margin: 0,
    });
  });
  footer(s, 2);
  notes(s, "Walk the broken chain left to right. Ask which box they live in this week.");
}

// ─── 3 Three verbs as a loop ────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } });
  s.addShape("rect", { x: 0, y: 0, w: W, h: 0.08, fill: { color: ACCENT } });
  mark(s, 0.4, 0.22, 0.32);
  s.addText("THE OPERATING LOOP", {
    x: 0.85,
    y: 0.24,
    w: 10,
    h: 0.28,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: ACCENT,
    margin: 0,
  });
  s.addText("See  →  Explain  →  Govern  →  See again", {
    x: 0.4,
    y: 0.58,
    w: 12,
    h: 0.4,
    fontFace: FONT,
    fontSize: 24,
    bold: true,
    color: NAVY,
    margin: 0,
  });

  chevron(s, 0.4, 1.25, 4.05, 0.85, NAVY, "01   SEE", "One RAG. One money line.");
  chevron(s, 4.15, 1.25, 4.55, 0.85, ACCENT, "02   EXPLAIN", "Formula, not folklore.");
  chevron(s, 8.4, 1.25, 4.5, 0.85, "1E4A7A", "03   GOVERN", "Decision + evidence.");

  const cols = [
    {
      h: "SEE",
      items: [
        "Portfolio RAG on one wall",
        "Plan vs actual vs forecast",
        "Capacity heat next to $",
        "Live board pack, not a rebuild",
      ],
    },
    {
      h: "EXPLAIN",
      items: [
        "Health Engine weights",
        "Band math: 80 / 65",
        "Invoice vs timesheet vs plan",
        "Drill from tile to transaction",
      ],
    },
    {
      h: "GOVERN",
      items: [
        "Decision log + evidence",
        "Exception queue",
        "Export + access audit",
        "SSO, MFA, tenant isolation",
      ],
    },
  ];
  cols.forEach((c, i) => {
    const x = 0.4 + i * 4.3;
    s.addShape("roundRect", {
      x,
      y: 2.4,
      w: 4.1,
      h: 4.45,
      fill: { color: i === 1 ? ICE : WHITE },
      line: { color: LINE, width: 1 },
      rectRadius: 0.12,
    });
    s.addText(c.h, {
      x: x + 0.25,
      y: 2.6,
      w: 3.6,
      h: 0.4,
      fontFace: FONT,
      fontSize: 18,
      bold: true,
      color: NAVY,
      margin: 0,
    });
    c.items.forEach((item, j) => {
      const y = 3.2 + j * 0.8;
      s.addShape("ellipse", {
        x: x + 0.28,
        y: y + 0.06,
        w: 0.22,
        h: 0.22,
        fill: { color: ACCENT },
      });
      s.addText(item, {
        x: x + 0.62,
        y,
        w: 3.2,
        h: 0.55,
        fontFace: FONT,
        fontSize: 15,
        color: INK,
        margin: 0,
      });
    });
  });
  footer(s, 3);
  notes(s, "This is the product story. Demo should hit all three verbs in 12 minutes.");
}

// ─── 4 RAG spectrum infographic ─────────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } });
  s.addShape("rect", { x: 0, y: 0, w: W, h: 0.08, fill: { color: GREEN } });
  mark(s, 0.4, 0.22, 0.32);
  s.addText("HEALTH ENGINE  ·  THE SPECTRUM", {
    x: 0.85,
    y: 0.24,
    w: 10,
    h: 0.28,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: GREEN,
    margin: 0,
  });
  s.addText("Same score. Same bands. Every tenant.", {
    x: 0.4,
    y: 0.58,
    w: 12,
    h: 0.4,
    fontFace: FONT,
    fontSize: 24,
    bold: true,
    color: NAVY,
    margin: 0,
  });

  // Spectrum bar
  s.addShape("roundRect", {
    x: 0.5,
    y: 1.25,
    w: 5.0,
    h: 0.55,
    fill: { color: RED },
    rectRadius: 0.06,
  });
  s.addShape("roundRect", {
    x: 5.5,
    y: 1.25,
    w: 2.4,
    h: 0.55,
    fill: { color: AMBER },
    rectRadius: 0.06,
  });
  s.addShape("roundRect", {
    x: 7.9,
    y: 1.25,
    w: 4.9,
    h: 0.55,
    fill: { color: GREEN },
    rectRadius: 0.06,
  });
  s.addText("RED   < 65", {
    x: 0.5,
    y: 1.32,
    w: 5.0,
    h: 0.42,
    fontFace: FONT,
    fontSize: 16,
    bold: true,
    color: WHITE,
    align: "center",
    valign: "middle",
    margin: 0,
  });
  s.addText("AMBER   65–79", {
    x: 5.5,
    y: 1.32,
    w: 2.4,
    h: 0.42,
    fontFace: FONT,
    fontSize: 14,
    bold: true,
    color: WHITE,
    align: "center",
    valign: "middle",
    margin: 0,
  });
  s.addText("GREEN   ≥ 80", {
    x: 7.9,
    y: 1.32,
    w: 4.9,
    h: 0.42,
    fontFace: FONT,
    fontSize: 16,
    bold: true,
    color: WHITE,
    align: "center",
    valign: "middle",
    margin: 0,
  });

  s.addText("0", {
    x: 0.45,
    y: 1.88,
    w: 0.4,
    h: 0.25,
    fontFace: FONT,
    fontSize: 11,
    color: MUTED,
    margin: 0,
  });
  s.addText("65", {
    x: 5.25,
    y: 1.88,
    w: 0.5,
    h: 0.25,
    fontFace: FONT,
    fontSize: 11,
    bold: true,
    color: INK,
    margin: 0,
  });
  s.addText("80", {
    x: 7.65,
    y: 1.88,
    w: 0.5,
    h: 0.25,
    fontFace: FONT,
    fontSize: 11,
    bold: true,
    color: INK,
    margin: 0,
  });
  s.addText("100", {
    x: 12.4,
    y: 1.88,
    w: 0.55,
    h: 0.25,
    fontFace: FONT,
    fontSize: 11,
    color: MUTED,
    margin: 0,
  });

  const bands = [
    { x: 0.4, c: RED, t: "Intervene", d: "Schedule, cost, or risk is off the formula. Open the exception — do not debate the colour." },
    { x: 4.7, c: AMBER, t: "Watch", d: "One or more dimensions are slipping. Name the owner and the next evidence date." },
    { x: 9.0, c: GREEN, t: "Protect", d: "Keep the cadence. Do not spend the forum on green projects." },
  ];
  bands.forEach((b) => {
    s.addShape("roundRect", {
      x: b.x,
      y: 2.3,
      w: 4.1,
      h: 1.85,
      fill: { color: WHITE },
      line: { color: LINE, width: 1 },
      rectRadius: 0.1,
    });
    s.addShape("rect", {
      x: b.x,
      y: 2.3,
      w: 0.12,
      h: 1.85,
      fill: { color: b.c },
    });
    s.addText(b.t, {
      x: b.x + 0.32,
      y: 2.48,
      w: 3.6,
      h: 0.35,
      fontFace: FONT,
      fontSize: 18,
      bold: true,
      color: NAVY,
      margin: 0,
    });
    s.addText(b.d, {
      x: b.x + 0.32,
      y: 2.9,
      w: 3.6,
      h: 1.05,
      fontFace: FONT,
      fontSize: 13,
      color: INK,
      margin: 0,
    });
  });

  s.addShape("roundRect", {
    x: 0.4,
    y: 4.4,
    w: 12.5,
    h: 2.5,
    fill: { color: ICE },
    rectRadius: 0.1,
  });
  s.addText("WHY THIS MATTERS IN THE ROOM", {
    x: 0.65,
    y: 4.55,
    w: 12,
    h: 0.3,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: ACCENT,
    margin: 0,
  });
  const why = [
    { t: "No folklore", d: "Amber is 65–79. Not “feels amber”." },
    { t: "Comparable", d: "Programme A and B use the same weights." },
    { t: "Explainable", d: "Every chip opens the contributing scores." },
    { t: "Governable", d: "A red without an owner is the exception." },
  ];
  why.forEach((w, i) => {
    const x = 0.65 + i * 3.1;
    s.addText(w.t, {
      x,
      y: 5.0,
      w: 2.9,
      h: 0.35,
      fontFace: FONT,
      fontSize: 16,
      bold: true,
      color: NAVY,
      margin: 0,
    });
    s.addText(w.d, {
      x,
      y: 5.4,
      w: 2.9,
      h: 1.15,
      fontFace: FONT,
      fontSize: 13,
      color: INK,
      margin: 0,
    });
  });
  footer(s, 4);
  notes(s, "Click a live RAG chip. Show 80 and 65. Do not invent a custom threshold unless they ask.");
}

// ─── 5 Eight dimensions as weight bars ──────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } });
  s.addShape("rect", { x: 0, y: 0, w: W, h: 0.08, fill: { color: ACCENT } });
  mark(s, 0.4, 0.22, 0.32);
  s.addText("EIGHT DIMENSIONS  ·  ONE COMPOSITE", {
    x: 0.85,
    y: 0.24,
    w: 10,
    h: 0.28,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: ACCENT,
    margin: 0,
  });
  s.addText("The score is a formula — not a mood.", {
    x: 0.4,
    y: 0.58,
    w: 12,
    h: 0.38,
    fontFace: FONT,
    fontSize: 24,
    bold: true,
    color: NAVY,
    margin: 0,
  });

  const dims = [
    ["Schedule", 0.2, ACCENT],
    ["Financial", 0.2, ACCENT],
    ["Delivery", 0.15, SKY],
    ["Scope", 0.1, SKY],
    ["Resource", 0.1, MINT],
    ["Risk", 0.1, MINT],
    ["Dependencies", 0.1, "4A7FA8"],
    ["Benefits", 0.05, "4A7FA8"],
  ];
  dims.forEach((d, i) => {
    const col = i < 4 ? 0 : 1;
    const row = i % 4;
    bar(s, 0.45 + col * 6.5, 1.2 + row * 0.72, 6.2, 0.55, d[2], d[0], d[1] / 0.2);
  });

  s.addShape("roundRect", {
    x: 0.4,
    y: 4.2,
    w: 12.5,
    h: 2.7,
    fill: { color: NAVY },
    rectRadius: 0.1,
  });
  s.addText("HOW TO READ THIS WITH A BUYER", {
    x: 0.7,
    y: 4.4,
    w: 12,
    h: 0.3,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: SKY,
    margin: 0,
  });
  const reads = [
    { t: "Weights are published", d: "Schedule and cost carry more. That is a product choice you can defend." },
    { t: "A green cost + red schedule", d: "Is still a conversation — the composite will not hide the red." },
    { t: "Capacity is in the score", d: "Not a side spreadsheet. Delivery → Resources feeds the same picture." },
    { t: "Click Explain", d: "The chip opens the contributing dimensions. That is the demo closer." },
  ];
  reads.forEach((r, i) => {
    const x = 0.7 + (i % 4) * 3.05;
    s.addText(r.t, {
      x,
      y: 4.85,
      w: 2.9,
      h: 0.55,
      fontFace: FONT,
      fontSize: 14,
      bold: true,
      color: WHITE,
      margin: 0,
    });
    s.addText(r.d, {
      x,
      y: 5.45,
      w: 2.9,
      h: 1.2,
      fontFace: FONT,
      fontSize: 12,
      color: "C5D4E8",
      margin: 0,
    });
  });
  footer(s, 5);
  notes(
    s,
    "Bars are illustrative of relative weight, not a contractual SLA. Confirm live weights in product if asked.",
  );
}

// ─── 6 Hub and spoke ────────────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } });
  s.addShape("rect", { x: 0, y: 0, w: W, h: 0.08, fill: { color: ACCENT } });
  mark(s, 0.4, 0.22, 0.32);
  s.addText("ONE HUB  ·  THE WORK ALREADY IN THE PRODUCT", {
    x: 0.85,
    y: 0.24,
    w: 11,
    h: 0.28,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: ACCENT,
    margin: 0,
  });
  s.addText("Not a slide about a future platform.", {
    x: 0.4,
    y: 0.55,
    w: 12,
    h: 0.38,
    fontFace: FONT,
    fontSize: 24,
    bold: true,
    color: NAVY,
    margin: 0,
  });

  // Hub
  s.addShape("ellipse", {
    x: 5.15,
    y: 2.55,
    w: 3.0,
    h: 3.0,
    fill: { color: NAVY },
  });
  s.addText("iProjectX\noperating\npicture", {
    x: 5.3,
    y: 3.25,
    w: 2.7,
    h: 1.5,
    fontFace: FONT,
    fontSize: 16,
    bold: true,
    color: WHITE,
    align: "center",
    margin: 0,
  });

  const spokes = [
    { x: 0.4, y: 1.15, t: "Projects & RAID", d: "Register, owners, dates" },
    { x: 3.55, y: 1.15, t: "Finance", d: "Invoice · forecast · actual" },
    { x: 6.7, y: 1.15, t: "Timesheets", d: "Hours that hit the $ line" },
    { x: 9.85, y: 1.15, t: "Resources", d: "Plan vs actual · skills" },
    { x: 0.4, y: 5.7, t: "Health Engine", d: "8 dimensions · 3 bands" },
    { x: 3.55, y: 5.7, t: "Board packs", d: "Live, not rebuilt" },
    { x: 6.7, y: 5.7, t: "Decisions", d: "Log + evidence" },
    { x: 9.85, y: 5.7, t: "Trust", d: "SSO · MFA · audit" },
  ];
  spokes.forEach((sp) => {
    s.addShape("roundRect", {
      x: sp.x,
      y: sp.y,
      w: 2.95,
      h: 1.05,
      fill: { color: ICE },
      rectRadius: 0.1,
    });
    s.addText(sp.t, {
      x: sp.x + 0.15,
      y: sp.y + 0.12,
      w: 2.65,
      h: 0.38,
      fontFace: FONT,
      fontSize: 14,
      bold: true,
      color: NAVY,
      margin: 0,
    });
    s.addText(sp.d, {
      x: sp.x + 0.15,
      y: sp.y + 0.5,
      w: 2.65,
      h: 0.4,
      fontFace: FONT,
      fontSize: 12,
      color: MUTED,
      margin: 0,
    });
  });
  footer(s, 6);
  notes(s, "Click Resources if they say you have no capacity. It is Delivery → Resources.");
}

// ─── 7 Money line ───────────────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } });
  s.addShape("rect", { x: 0, y: 0, w: W, h: 0.08, fill: { color: GOLD } });
  mark(s, 0.4, 0.22, 0.32);
  s.addText("THE MONEY LINE", {
    x: 0.85,
    y: 0.24,
    w: 10,
    h: 0.28,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: GOLD,
    margin: 0,
  });
  s.addText("Plan, actual, forecast, invoice — one conversation.", {
    x: 0.4,
    y: 0.58,
    w: 12,
    h: 0.38,
    fontFace: FONT,
    fontSize: 22,
    bold: true,
    color: NAVY,
    margin: 0,
  });

  chevron(s, 0.35, 1.2, 3.2, 1.05, NAVY, "PLAN", "Baseline $ and hours");
  chevron(s, 3.3, 1.2, 3.3, 1.05, ACCENT, "ACTUAL", "Timesheet + cost");
  chevron(s, 6.35, 1.2, 3.3, 1.05, "1E4A7A", "FORECAST", "Remaining to complete");
  chevron(s, 9.4, 1.2, 3.55, 1.05, "0A3A5C", "INVOICE", "What the client sees");

  const cards = [
    { t: "Variance is a first-class object", d: "Not a cell in a hidden tab. Plan vs actual % sits on the project infographic and the executive view." },
    { t: "Hours become money", d: "Timesheets utilisation is not a separate product. It feeds the same line the CFO reads." },
    { t: "Capacity gaps are visible", d: "Executive Intelligence and Delivery → Resources show heat next to the dollar — not after the overrun." },
    { t: "Templates stay live", d: "Existing invoices pick up the current org template. The pack and the bill do not drift." },
  ];
  cards.forEach((c, i) => {
    const x = 0.4 + (i % 2) * 6.45;
    const y = 2.55 + Math.floor(i / 2) * 2.15;
    s.addShape("roundRect", {
      x,
      y,
      w: 6.25,
      h: 2.0,
      fill: { color: i % 2 === 0 ? ICE : WHITE },
      line: { color: LINE, width: 1 },
      rectRadius: 0.1,
    });
    s.addText(c.t, {
      x: x + 0.25,
      y: y + 0.22,
      w: 5.75,
      h: 0.45,
      fontFace: FONT,
      fontSize: 16,
      bold: true,
      color: NAVY,
      margin: 0,
    });
    s.addText(c.d, {
      x: x + 0.25,
      y: y + 0.75,
      w: 5.75,
      h: 1.0,
      fontFace: FONT,
      fontSize: 14,
      color: INK,
      margin: 0,
    });
  });
  footer(s, 7);
  notes(s, "Open a project with plan, actual, and an invoice. Stay on one record.");
}

// ─── 8 Before / after ───────────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } });
  s.addShape("rect", { x: 0, y: 0, w: W, h: 0.08, fill: { color: ACCENT } });
  mark(s, 0.4, 0.22, 0.32);
  s.addText("BEFORE  /  AFTER", {
    x: 0.85,
    y: 0.24,
    w: 10,
    h: 0.28,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: ACCENT,
    margin: 0,
  });
  s.addText("What changes in the operating week.", {
    x: 0.4,
    y: 0.55,
    w: 12,
    h: 0.38,
    fontFace: FONT,
    fontSize: 24,
    bold: true,
    color: NAVY,
    margin: 0,
  });

  s.addShape("roundRect", {
    x: 0.4,
    y: 1.15,
    w: 5.9,
    h: 5.75,
    fill: { color: "F7F1F0" },
    rectRadius: 0.12,
  });
  s.addShape("roundRect", {
    x: 7.05,
    y: 1.15,
    w: 5.9,
    h: 5.75,
    fill: { color: "E8F2EC" },
    rectRadius: 0.12,
  });
  s.addText("WITHOUT", {
    x: 0.65,
    y: 1.35,
    w: 5.4,
    h: 0.35,
    fontFace: FONT,
    fontSize: 14,
    bold: true,
    color: RED,
    margin: 0,
  });
  s.addText("WITH iProjectX", {
    x: 7.3,
    y: 1.35,
    w: 5.4,
    h: 0.35,
    fontFace: FONT,
    fontSize: 14,
    bold: true,
    color: GREEN,
    margin: 0,
  });

  const left = [
    "RAG is a colour someone typed",
    "Forecast lives in a second file",
    "Board pack is a Sunday rebuild",
    "Decisions sit in email threads",
    "Capacity is a side spreadsheet",
    "Audit starts when someone asks",
  ];
  const right = [
    "RAG is a published formula",
    "Forecast sits on the money line",
    "Board pack is a live view",
    "Decision + evidence in the log",
    "Capacity is Delivery → Resources",
    "Export and access are already logged",
  ];
  left.forEach((t, i) => {
    s.addText("✕   " + t, {
      x: 0.7,
      y: 1.9 + i * 0.75,
      w: 5.35,
      h: 0.6,
      fontFace: FONT,
      fontSize: 15,
      color: INK,
      margin: 0,
    });
  });
  right.forEach((t, i) => {
    s.addText("→   " + t, {
      x: 7.35,
      y: 1.9 + i * 0.75,
      w: 5.35,
      h: 0.6,
      fontFace: FONT,
      fontSize: 15,
      color: INK,
      margin: 0,
    });
  });
  footer(s, 8);
  notes(s, "Do not invent time saved. Ask them which left-hand line is most expensive this quarter.");
}

// ─── 9 Persona strip ────────────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } });
  s.addShape("rect", { x: 0, y: 0, w: W, h: 0.08, fill: { color: ACCENT } });
  mark(s, 0.4, 0.22, 0.32);
  s.addText("ONE PRODUCT  ·  FOUR BUYERS", {
    x: 0.85,
    y: 0.24,
    w: 10,
    h: 0.28,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: ACCENT,
    margin: 0,
  });
  s.addText("Same tenant. Different first screen.", {
    x: 0.4,
    y: 0.55,
    w: 12,
    h: 0.38,
    fontFace: FONT,
    fontSize: 24,
    bold: true,
    color: NAVY,
    margin: 0,
  });

  const personas = [
    { r: "PMO", q: "Can I trust the wall?", a: "Health Engine + RAID + live pack" },
    { r: "CFO", q: "Where did the money go?", a: "Plan · actual · forecast · invoice" },
    { r: "CIO", q: "Is this the system of record?", a: "Portfolio + capacity + decisions" },
    { r: "CISO", q: "Can I defend the tenant?", a: "SSO · MFA · RBAC · audit" },
  ];
  personas.forEach((p, i) => {
    const x = 0.4 + i * 3.23;
    s.addShape("roundRect", {
      x,
      y: 1.2,
      w: 3.08,
      h: 5.7,
      fill: { color: i % 2 === 0 ? NAVY : NAVY2 },
      rectRadius: 0.12,
    });
    s.addText(p.r, {
      x: x + 0.2,
      y: 1.5,
      w: 2.68,
      h: 0.45,
      fontFace: FONT,
      fontSize: 20,
      bold: true,
      color: WHITE,
      margin: 0,
    });
    s.addText("ASKS", {
      x: x + 0.2,
      y: 2.2,
      w: 2.68,
      h: 0.28,
      fontFace: FONT,
      fontSize: 11,
      bold: true,
      color: SKY,
      margin: 0,
    });
    s.addText(p.q, {
      x: x + 0.2,
      y: 2.55,
      w: 2.68,
      h: 1.4,
      fontFace: FONT,
      fontSize: 18,
      bold: true,
      color: WHITE,
      margin: 0,
    });
    s.addText("SHOW", {
      x: x + 0.2,
      y: 4.2,
      w: 2.68,
      h: 0.28,
      fontFace: FONT,
      fontSize: 11,
      bold: true,
      color: SKY,
      margin: 0,
    });
    s.addText(p.a, {
      x: x + 0.2,
      y: 4.55,
      w: 2.68,
      h: 1.8,
      fontFace: FONT,
      fontSize: 16,
      color: "D6E4F5",
      margin: 0,
    });
  });
  footer(s, 9);
  notes(s, "Pick the two personas in the room. Skip the others.");
}

// ─── 10 Trust stack ─────────────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } });
  s.addShape("rect", { x: 0, y: 0, w: W, h: 0.08, fill: { color: NAVY } });
  mark(s, 0.4, 0.22, 0.32);
  s.addText("TRUST STACK  ·  READINESS, NOT CERTIFICATES", {
    x: 0.85,
    y: 0.24,
    w: 11,
    h: 0.28,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: NAVY,
    margin: 0,
  });
  s.addText("Say what the product does. Do not claim a badge.", {
    x: 0.4,
    y: 0.55,
    w: 12,
    h: 0.38,
    fontFace: FONT,
    fontSize: 22,
    bold: true,
    color: NAVY,
    margin: 0,
  });

  const layers = [
    { y: 1.15, c: NAVY, t: "Identity", d: "SSO  ·  MFA enrol + leftover-enroll recovery  ·  session controls" },
    { y: 2.25, c: ACCENT, t: "Authorisation", d: "RBAC  ·  tenant isolation  ·  least privilege on finance and export" },
    { y: 3.35, c: "2A5A86", t: "Evidence", d: "Decision log  ·  export audit  ·  access trail  ·  invoice template lineage" },
    { y: 4.45, c: "3A6E9A", t: "Operations", d: "CSP on the public site  ·  safe logo upload  ·  documented controls" },
    { y: 5.55, c: "4A7FA8", t: "Conversation", d: "SOC 2 / ISO = readiness path. Never “we are certified” unless Legal confirms." },
  ];
  layers.forEach((L) => {
    s.addShape("roundRect", {
      x: 0.4,
      y: L.y,
      w: 12.5,
      h: 0.95,
      fill: { color: L.c },
      rectRadius: 0.08,
    });
    s.addText(L.t, {
      x: 0.65,
      y: L.y + 0.12,
      w: 2.6,
      h: 0.7,
      fontFace: FONT,
      fontSize: 16,
      bold: true,
      color: WHITE,
      valign: "middle",
      margin: 0,
    });
    s.addText(L.d, {
      x: 3.4,
      y: L.y + 0.18,
      w: 9.2,
      h: 0.6,
      fontFace: FONT,
      fontSize: 15,
      color: WHITE,
      valign: "middle",
      margin: 0,
    });
  });
  footer(s, 10);
  notes(s, "If they ask for a certificate, take it as a follow-up. Do not improvise.");
}

// ─── 11 12-minute demo path ─────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } });
  s.addShape("rect", { x: 0, y: 0, w: W, h: 0.08, fill: { color: ACCENT } });
  mark(s, 0.4, 0.22, 0.32);
  s.addText("TWELVE-MINUTE PATH", {
    x: 0.85,
    y: 0.24,
    w: 10,
    h: 0.28,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: ACCENT,
    margin: 0,
  });
  s.addText("Do not tour menus. Follow the exception.", {
    x: 0.4,
    y: 0.55,
    w: 12,
    h: 0.38,
    fontFace: FONT,
    fontSize: 24,
    bold: true,
    color: NAVY,
    margin: 0,
  });

  const steps = [
    { n: "01", t: "Wall", d: "Portfolio RAG. One red." },
    { n: "02", t: "Explain", d: "Open the chip. Show 80 / 65." },
    { n: "03", t: "Money", d: "Plan · actual · invoice." },
    { n: "04", t: "People", d: "Resources utilisation." },
    { n: "05", t: "Decide", d: "Log + evidence." },
    { n: "06", t: "Pack", d: "Board view — live." },
    { n: "07", t: "Trust", d: "SSO / MFA / audit." },
    { n: "08", t: "Close", d: "Pilot scope, not a tour." },
  ];
  steps.forEach((st, i) => {
    const x = 0.4 + (i % 4) * 3.23;
    const y = 1.15 + Math.floor(i / 4) * 2.85;
    s.addShape("roundRect", {
      x,
      y,
      w: 3.08,
      h: 2.65,
      fill: { color: i === 7 ? NAVY : ICE },
      rectRadius: 0.12,
    });
    s.addText(st.n, {
      x: x + 0.2,
      y: y + 0.2,
      w: 2.68,
      h: 0.4,
      fontFace: FONT,
      fontSize: 18,
      bold: true,
      color: i === 7 ? SKY : ACCENT,
      margin: 0,
    });
    s.addText(st.t, {
      x: x + 0.2,
      y: y + 0.7,
      w: 2.68,
      h: 0.5,
      fontFace: FONT,
      fontSize: 22,
      bold: true,
      color: i === 7 ? WHITE : NAVY,
      margin: 0,
    });
    s.addText(st.d, {
      x: x + 0.2,
      y: y + 1.35,
      w: 2.68,
      h: 0.95,
      fontFace: FONT,
      fontSize: 15,
      color: i === 7 ? "C5D4E8" : INK,
      margin: 0,
    });
  });
  footer(s, 11);
  notes(s, "Timebox. If they pull you into config, park it and return to the red project.");
}

// ─── 12 Pilot shape ─────────────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } });
  s.addShape("rect", { x: 0, y: 0, w: W, h: 0.08, fill: { color: ACCENT } });
  mark(s, 0.4, 0.22, 0.32);
  s.addText("PILOT  ·  PROVE THE LOOP", {
    x: 0.85,
    y: 0.24,
    w: 10,
    h: 0.28,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: ACCENT,
    margin: 0,
  });
  s.addText("A bounded programme — not a platform tour.", {
    x: 0.4,
    y: 0.55,
    w: 12,
    h: 0.38,
    fontFace: FONT,
    fontSize: 24,
    bold: true,
    color: NAVY,
    margin: 0,
  });

  const phases = [
    { n: "Week 1", t: "Connect", d: "Tenant, SSO path, one programme, named owners." },
    { n: "Week 2–3", t: "Run", d: "Live RAG, money line, one steering pack from the product." },
    { n: "Week 4", t: "Decide", d: "Keep / expand on evidence — not on a slide rewrite." },
  ];
  phases.forEach((p, i) => {
    const x = 0.4 + i * 4.3;
    s.addShape("roundRect", {
      x,
      y: 1.2,
      w: 4.1,
      h: 3.15,
      fill: { color: i === 2 ? NAVY : ICE },
      rectRadius: 0.12,
    });
    s.addText(p.n, {
      x: x + 0.25,
      y: 1.4,
      w: 3.6,
      h: 0.35,
      fontFace: FONT,
      fontSize: 13,
      bold: true,
      color: i === 2 ? SKY : ACCENT,
      margin: 0,
    });
    s.addText(p.t, {
      x: x + 0.25,
      y: 1.85,
      w: 3.6,
      h: 0.55,
      fontFace: FONT,
      fontSize: 26,
      bold: true,
      color: i === 2 ? WHITE : NAVY,
      margin: 0,
    });
    s.addText(p.d, {
      x: x + 0.25,
      y: 2.55,
      w: 3.6,
      h: 1.5,
      fontFace: FONT,
      fontSize: 16,
      color: i === 2 ? "D6E4F5" : INK,
      margin: 0,
    });
  });

  s.addShape("roundRect", {
    x: 0.4,
    y: 4.6,
    w: 12.5,
    h: 2.3,
    fill: { color: WHITE },
    line: { color: LINE, width: 1.25 },
    rectRadius: 0.1,
  });
  s.addText("SUCCESS LOOKS LIKE", {
    x: 0.65,
    y: 4.8,
    w: 12,
    h: 0.3,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: ACCENT,
    margin: 0,
  });
  const ok = [
    "One red explained in the room",
    "One invoice that matches the forecast story",
    "One pack nobody rebuilt in PowerPoint",
    "One decision with an evidence link",
  ];
  ok.forEach((t, i) => {
    const x = 0.65 + (i % 4) * 3.05;
    s.addText(String(i + 1).padStart(2, "0"), {
      x,
      y: 5.2,
      w: 2.85,
      h: 0.3,
      fontFace: FONT,
      fontSize: 12,
      bold: true,
      color: ACCENT,
      margin: 0,
    });
    s.addText(t, {
      x,
      y: 5.5,
      w: 2.85,
      h: 1.1,
      fontFace: FONT,
      fontSize: 14,
      color: INK,
      margin: 0,
    });
  });
  footer(s, 12);
  notes(s, "Pilot length is a conversation. Do not lock a commercial term on this slide.");
}

// ─── 13 What we will not say ────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } });
  s.addShape("rect", { x: 0, y: 0, w: W, h: 0.08, fill: { color: RED } });
  mark(s, 0.4, 0.22, 0.32);
  s.addText("GUARDRAILS", {
    x: 0.85,
    y: 0.24,
    w: 10,
    h: 0.28,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: RED,
    margin: 0,
  });
  s.addText("The pitch stays true.", {
    x: 0.4,
    y: 0.55,
    w: 12,
    h: 0.38,
    fontFace: FONT,
    fontSize: 24,
    bold: true,
    color: NAVY,
    margin: 0,
  });

  const no = [
    { t: "No list price", d: "Commercials are a separate conversation." },
    { t: "No invented ROI %", d: "Ask what their Sunday rebuild costs." },
    { t: "No fake logos", d: "Do not name customers you cannot reference." },
    { t: "No SOC 2 / ISO badge", d: "Readiness only, unless Legal confirms." },
    { t: "No “we have no capacity”", d: "Resources is in the product. Show it." },
    { t: "No vapour roadmap", d: "Sell the loop that is live today." },
  ];
  no.forEach((n, i) => {
    const x = 0.4 + (i % 3) * 4.3;
    const y = 1.2 + Math.floor(i / 3) * 2.75;
    s.addShape("roundRect", {
      x,
      y,
      w: 4.1,
      h: 2.55,
      fill: { color: ICE },
      rectRadius: 0.1,
    });
    s.addText(n.t, {
      x: x + 0.25,
      y: y + 0.3,
      w: 3.6,
      h: 0.7,
      fontFace: FONT,
      fontSize: 18,
      bold: true,
      color: NAVY,
      margin: 0,
    });
    s.addText(n.d, {
      x: x + 0.25,
      y: y + 1.1,
      w: 3.6,
      h: 1.1,
      fontFace: FONT,
      fontSize: 15,
      color: INK,
      margin: 0,
    });
  });
  footer(s, 13);
  notes(s, "If a question would break a guardrail, write it down and bring Legal or Product.");
}

// ─── 14 Close ───────────────────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: NAVY } });
  s.addShape("rect", { x: 0, y: 0, w: 0.18, h: H, fill: { color: ACCENT } });
  mark(s, 0.55, 0.4, 0.5);
  s.addText("Next conversation", {
    x: 1.2,
    y: 0.48,
    w: 8,
    h: 0.4,
    fontFace: FONT,
    fontSize: 18,
    color: SKY,
    margin: 0,
  });
  s.addText("Put one red project\non the wall.", {
    x: 0.55,
    y: 1.6,
    w: 12,
    h: 1.6,
    fontFace: FONT,
    fontSize: 40,
    bold: true,
    color: WHITE,
    margin: 0,
  });
  s.addText(
    "If we cannot explain it, invoice it, and pack it from the same tenant — we have not earned the next meeting.",
    {
      x: 0.55,
      y: 3.4,
      w: 11.5,
      h: 0.9,
      fontFace: FONT,
      fontSize: 18,
      color: "C5D4E8",
      margin: 0,
    },
  );

  const ctas = [
    { t: "Interactive one-pager", d: "docs/sales/iProjectX-One-Pager.html" },
    { t: "Live tenant", d: "iprojectx.com  ·  book a walkthrough" },
    { t: "This deck", d: "Leave behind  ·  speaker notes on every slide" },
  ];
  ctas.forEach((c, i) => {
    const x = 0.55 + i * 4.15;
    s.addShape("roundRect", {
      x,
      y: 4.6,
      w: 3.95,
      h: 1.55,
      fill: { color: NAVY2 },
      rectRadius: 0.1,
    });
    s.addText(c.t, {
      x: x + 0.2,
      y: 4.8,
      w: 3.55,
      h: 0.45,
      fontFace: FONT,
      fontSize: 16,
      bold: true,
      color: WHITE,
      margin: 0,
    });
    s.addText(c.d, {
      x: x + 0.2,
      y: 5.3,
      w: 3.55,
      h: 0.6,
      fontFace: FONT,
      fontSize: 13,
      color: "A8B8D0",
      margin: 0,
    });
  });
  s.addText("iProjectX  ·  See. Explain. Govern.", {
    x: 0.55,
    y: 6.55,
    w: 12,
    h: 0.35,
    fontFace: FONT,
    fontSize: 14,
    color: "8FA3C0",
    margin: 0,
  });
  notes(s, "Close on a calendar hold for the pilot kickoff, not a brochure drop.");
}

await pptx.writeFile({ fileName: outPath });
console.log("Wrote", outPath);
