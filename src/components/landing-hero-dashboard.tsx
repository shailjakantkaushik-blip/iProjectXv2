import type { CSSProperties } from "react";
import type { LandingConfig, LandingPalette } from "@/lib/landing-config";

const HEADING: CSSProperties = { fontFamily: "'Sora', system-ui, sans-serif" };

/** Original static portfolio mock that sat in the landing hero before the film / walkthrough. */
export function LandingHeroDashboard({ cfg }: { cfg: LandingConfig }) {
  const p = cfg.palette;
  return (
    <div className="min-w-0 p-3 sm:p-5" style={{ background: `${p.navy}cc` }}>
      <div
        className="mb-3 flex items-center justify-between border-b px-1 pb-3"
        style={{ borderColor: "rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.danger }} />
          <span className="h-2 w-2 rounded-full" style={{ background: p.warning }} />
          <span className="h-2 w-2 rounded-full" style={{ background: p.success }} />
        </div>
        <div
          className="text-[10px] font-bold uppercase tracking-[0.16em]"
          style={{ color: p.textOnDark, opacity: 0.45 }}
        >
          Portfolio timeline · Live
        </div>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:mb-5 sm:grid-cols-4">
        <MiniKpi p={p} label="Portfolio" value="$42.4M" delta="68% used" tone="ok" />
        <MiniKpi p={p} label="Gate pass" value="92%" delta="+4 pts QoQ" tone="ok" />
        <MiniKpi p={p} label="Capacity" value="114%" delta="Q3 crunch" tone="bad" />
        <MiniKpi p={p} label="Benefits" value="$14.2M" delta="run-rate" tone="mid" />
      </div>
      <div className="relative min-w-0 overflow-x-auto">
        <div
          className="mb-3 flex min-w-[320px] border-b pb-2 sm:min-w-0"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
        >
          <div className="w-24 shrink-0 sm:w-28" />
          <div
            className="flex w-full justify-between text-[9px] font-bold tracking-wider sm:text-[10px]"
            style={{ color: p.textOnDark, opacity: 0.35 }}
          >
            {["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL"].map((m, i) => (
              <span key={m} style={i === 4 ? { color: p.accent, opacity: 1 } : undefined}>
                {i === 4 ? "TODAY" : m}
              </span>
            ))}
          </div>
        </div>
        <div className="min-w-[320px] space-y-3.5 sm:min-w-0">
          <TimelineRow
            p={p}
            name="ERP Migration"
            left="10%"
            width="60%"
            gateAt="right"
            gateColor={p.success}
            status="ON TRACK"
            statusColor={p.success}
          />
          <TimelineRow
            p={p}
            name="Cloud Native"
            left="20%"
            width="45%"
            gateAt="72%"
            gateColor={p.danger}
            status="BLOCKED"
            statusColor={p.danger}
          />
          <TimelineRow
            p={p}
            name="Data Lake 2.0"
            left="5%"
            width="80%"
            gateAt="45%"
            gateColor={p.surface}
            status="INITIATED"
            statusColor="rgba(255,255,255,0.4)"
          />
          <TimelineRow
            p={p}
            name="Customer Portal"
            left="30%"
            width="55%"
            gateAt="60%"
            gateColor={p.warning}
            status="AT RISK"
            statusColor={p.warning}
          />
        </div>
        <div
          className="pointer-events-none absolute inset-y-0 w-px left-[calc(6rem+((100%-6rem)*4/6))] sm:left-[calc(7rem+((100%-7rem)*4/6))]"
          style={{
            background: p.accent,
            opacity: 0.7,
          }}
        />
      </div>
    </div>
  );
}

function MiniKpi({
  p,
  label,
  value,
  delta,
  tone,
}: {
  p: LandingPalette;
  label: string;
  value: string;
  delta: string;
  tone: "ok" | "mid" | "bad";
}) {
  const tc = tone === "ok" ? p.success : tone === "bad" ? p.danger : p.warning;
  return (
    <div
      className="rounded-md border p-2.5"
      style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }}
    >
      <div
        className="text-[9px] font-bold uppercase tracking-widest"
        style={{ color: p.textOnDark, opacity: 0.4 }}
      >
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold" style={{ ...HEADING, color: p.textOnDark }}>
        {value}
      </div>
      <div className="text-[10px] font-semibold" style={{ color: tc }}>
        {delta}
      </div>
    </div>
  );
}

function TimelineRow({
  p,
  name,
  left,
  width,
  gateAt,
  gateColor,
  status,
  statusColor,
}: {
  p: LandingPalette;
  name: string;
  left: string;
  width: string;
  gateAt: string;
  gateColor: string;
  status: string;
  statusColor: string;
}) {
  return (
    <div className="flex min-w-0 items-center">
      <div
        className="w-24 shrink-0 truncate text-[11px] font-semibold sm:w-28 sm:text-xs"
        style={{ color: p.textOnDark, opacity: 0.7 }}
      >
        {name}
      </div>
      <div className="relative h-3 flex-1">
        <div
          className="absolute h-full rounded-sm border"
          style={{
            left,
            width,
            borderColor: `${p.accent}55`,
            background: p.navyLight,
          }}
        >
          <div
            className="absolute -top-1 h-5 w-0.5"
            style={{
              left: gateAt === "right" ? "auto" : gateAt,
              right: gateAt === "right" ? "-1px" : "auto",
              background: gateColor,
            }}
          />
        </div>
      </div>
      <div
        className="ml-3 w-[4.5rem] text-right text-[10px] font-bold tracking-wide"
        style={{ color: statusColor }}
      >
        {status}
      </div>
    </div>
  );
}
