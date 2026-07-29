/**
 * Verify PRJ-013 (Claims Straight-Through) finance reconciliation math
 * matches the FY-aligned monthly seed algorithm.
 *
 * Run: node scripts/verify-prj013-finance.mjs
 *
 * Asserts (as of a fixed "today"):
 *  - Σ monthly planned  = project budget (= Σ FY budget)
 *  - Σ monthly forecast = FAC (= Σ FY forecast)
 *  - Σ monthly actual   = capex_incurred + opex_incurred
 *  - FY26/FY27 monthly planned buckets match FY allocations
 *  - Benefits monthly Σ = benefits target / realised
 *  - Late phase windows (Build+) have non-zero planned when schedule covers them
 */
import assert from "node:assert/strict";

const TODAY = new Date("2026-07-29T12:00:00Z");
const FY_START = 4; // April

const PRJ = {
  code: "PRJ-013",
  budget: 3_400_000,
  capexA: 2_700_000,
  capexI: 700_000,
  opexA: 700_000,
  opexI: 160_000,
  fac: 3_500_000,
  benT: 5_500_000,
  benR: 100_000,
  start: "2025-08-01",
  end: "2027-02-28",
};

const CORE_SHARE = 0.58;
const ALT_SHARE = 0.42;

function monthKey(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addMonths(d, n) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

function fyLabel(d, fyStart = FY_START) {
  const y =
    d.getUTCMonth() + 1 >= fyStart
      ? d.getUTCFullYear() + 1
      : d.getUTCFullYear();
  return `FY${String(y).slice(-2)}`;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function monthsBetween(startIso, endIso) {
  const out = [];
  let m = monthKey(new Date(startIso + "T00:00:00Z"));
  const end = monthKey(new Date(endIso + "T00:00:00Z"));
  while (m <= end) {
    out.push(new Date(m));
    m = addMonths(m, 1);
  }
  return out;
}

/** Mirror seed algorithm for one stream share. */
function seedStreamMonthly(share, streamStart, streamEnd) {
  const sBudget = round2(PRJ.budget * share);
  const sCapexA = round2(PRJ.capexA * share);
  const sCapexI = round2(PRJ.capexI * share);
  const sOpexA = round2(PRJ.opexA * share);
  const sOpexI = round2(PRJ.opexI * share);
  const sFac = round2(PRJ.fac * share);
  const sBenT = round2(PRJ.benT * share);
  const sBenR = round2(PRJ.benR * share);
  const capSplit = sCapexA + sOpexA > 0 ? sCapexA / (sCapexA + sOpexA) : 1;
  const opexSplit = 1 - capSplit;

  const months = monthsBetween(streamStart, streamEnd);
  const todayM = monthKey(TODAY);

  const startFy = fyLabel(months[0]);
  const endFy = fyLabel(months[months.length - 1]);
  const splitA = startFy === endFy ? 1 : 0.55;
  const splitB = startFy === endFy ? 0 : 0.45;
  const fyA = startFy;
  const fyB = endFy;

  const monthsFyA = months.filter((m) => fyLabel(m) === fyA).length;
  const monthsFyB = months.filter((m) => fyLabel(m) === fyB).length;
  const monthsPast = months.filter((m) => m <= todayM).length;

  const fyABud = round2(sBudget * splitA);
  const fyAFcst = round2(sFac * splitA);
  const fyBBud = round2(sBudget * splitB);
  const fyBFcst = round2(sFac * splitB);

  let sumCapPa = 0,
    sumOpexPa = 0,
    sumCapFa = 0,
    sumOpexFa = 0;
  let sumCapPb = 0,
    sumOpexPb = 0,
    sumCapFb = 0,
    sumOpexFb = 0;
  let sumCapAct = 0,
    sumOpexAct = 0,
    sumBenP = 0,
    sumBenAct = 0;
  let iA = 0,
    iB = 0,
    iPast = 0;

  const rows = [];
  months.forEach((m, idx) => {
    const label = fyLabel(m);
    let capP = 0,
      opexP = 0,
      capF = 0,
      opexF = 0;

    if (label === fyA && monthsFyA > 0) {
      iA += 1;
      if (iA === monthsFyA) {
        capP = round2(fyABud * capSplit) - sumCapPa;
        opexP = round2(fyABud * opexSplit) - sumOpexPa;
        capF = round2(fyAFcst * capSplit) - sumCapFa;
        opexF = round2(fyAFcst * opexSplit) - sumOpexFa;
      } else {
        capP = round2((fyABud * capSplit) / monthsFyA);
        opexP = round2((fyABud * opexSplit) / monthsFyA);
        capF = round2((fyAFcst * capSplit) / monthsFyA);
        opexF = round2((fyAFcst * opexSplit) / monthsFyA);
        sumCapPa += capP;
        sumOpexPa += opexP;
        sumCapFa += capF;
        sumOpexFa += opexF;
      }
    } else if (label === fyB && monthsFyB > 0) {
      iB += 1;
      if (iB === monthsFyB) {
        capP = round2(fyBBud * capSplit) - sumCapPb;
        opexP = round2(fyBBud * opexSplit) - sumOpexPb;
        capF = round2(fyBFcst * capSplit) - sumCapFb;
        opexF = round2(fyBFcst * opexSplit) - sumOpexFb;
      } else {
        capP = round2((fyBBud * capSplit) / monthsFyB);
        opexP = round2((fyBBud * opexSplit) / monthsFyB);
        capF = round2((fyBFcst * capSplit) / monthsFyB);
        opexF = round2((fyBFcst * opexSplit) / monthsFyB);
        sumCapPb += capP;
        sumOpexPb += opexP;
        sumCapFb += capF;
        sumOpexFb += opexF;
      }
    }

    let capAct = 0,
      opexAct = 0,
      benAct = 0;
    if (m <= todayM && monthsPast > 0) {
      iPast += 1;
      if (iPast === monthsPast) {
        capAct = round2(sCapexI) - sumCapAct;
        opexAct = round2(sOpexI) - sumOpexAct;
        benAct = round2(sBenR) - sumBenAct;
      } else {
        capAct = round2(sCapexI / monthsPast);
        opexAct = round2(sOpexI / monthsPast);
        benAct = round2(sBenR / monthsPast);
        sumCapAct += capAct;
        sumOpexAct += opexAct;
        sumBenAct += benAct;
      }
    }

    let benP;
    if (idx === months.length - 1) {
      benP = round2(sBenT) - sumBenP;
    } else {
      benP = round2(sBenT / months.length);
      sumBenP += benP;
    }

    rows.push({
      month: m.toISOString().slice(0, 10),
      fy: label,
      planned: round2(capP + opexP),
      actual: round2(capAct + opexAct),
      forecast: round2(capF + opexF),
      benP,
      benAct,
      capP,
      opexP,
      capF,
      opexF,
      capAct,
      opexAct,
    });
  });

  return {
    sBudget,
    sFac,
    sCapexI,
    sOpexI,
    sBenT,
    sBenR,
    fyA,
    fyB,
    fyABud,
    fyBBud,
    fyAFcst,
    fyBFcst,
    monthsPast,
    rows,
  };
}

function sum(rows, key) {
  return round2(rows.reduce((s, r) => s + r[key], 0));
}

const core = seedStreamMonthly(CORE_SHARE, "2025-08-01", "2027-02-28");
const alt = seedStreamMonthly(ALT_SHARE, "2025-08-22", "2027-02-28");
const allRows = [...core.rows, ...alt.rows];

const planned = sum(allRows, "planned");
const actual = sum(allRows, "actual");
const forecast = sum(allRows, "forecast");
const benP = sum(allRows, "benP");
const benAct = sum(allRows, "benAct");

const fy26Planned = sum(
  allRows.filter((r) => r.fy === "FY26"),
  "planned",
);
const fy27Planned = sum(
  allRows.filter((r) => r.fy === "FY27"),
  "planned",
);
const fy26Forecast = sum(
  allRows.filter((r) => r.fy === "FY26"),
  "forecast",
);
const fy27Forecast = sum(
  allRows.filter((r) => r.fy === "FY27"),
  "forecast",
);

const latePlanned = sum(
  allRows.filter((r) => r.month >= "2026-05-01"),
  "planned",
);

console.log("PRJ-013 finance reconcile (simulated seed @ 2026-07-29)");
console.log({
  monthsCore: core.rows.length,
  monthsAlt: alt.rows.length,
  planned,
  actual,
  forecast,
  benP,
  benAct,
  fy26Planned,
  fy27Planned,
  fy26Forecast,
  fy27Forecast,
  latePhaseWindowPlanned: latePlanned,
  incurred: PRJ.capexI + PRJ.opexI,
  fac: PRJ.fac,
  budget: PRJ.budget,
});

assert.equal(planned, PRJ.budget, "Σ monthly planned must equal budget");
assert.equal(forecast, PRJ.fac, "Σ monthly forecast must equal FAC");
assert.equal(actual, PRJ.capexI + PRJ.opexI, "Σ monthly actual must equal incurred");
assert.equal(benP, PRJ.benT, "Σ benefits planned must equal target");
assert.equal(benAct, PRJ.benR, "Σ benefits actual must equal realised");
assert.equal(fy26Planned, round2(core.fyABud + alt.fyABud), "FY26 planned = FY26 allocations");
assert.equal(fy27Planned, round2(core.fyBBud + alt.fyBBud), "FY27 planned = FY27 allocations");
assert.equal(fy26Forecast, round2(core.fyAFcst + alt.fyAFcst), "FY26 forecast = FY26 FAC split");
assert.equal(fy27Forecast, round2(core.fyBFcst + alt.fyBFcst), "FY27 forecast = FY27 FAC split");
assert.ok(latePlanned > 0, "Build+ schedule months must have planned spend (not front-loaded zeros)");
assert.ok(core.rows.length >= 19, "Core must cover full Aug25–Feb27 schedule");
assert.ok(core.monthsPast >= 12, "Past months through Jul 2026 should be >= 12");

console.log("OK — PRJ-013 Plan / Actual / Forecast / FY / benefits reconcile.");
