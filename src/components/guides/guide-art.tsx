import type { ReactNode } from "react";

/** Simple picture-book diagrams for About / How money works. */

function Frame({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={`overflow-hidden rounded-xl border border-border bg-gradient-to-b from-sky-50 to-white ${className}`}>
      {title ? (
        <figcaption className="border-b border-border/60 px-4 py-2 text-center text-xs font-semibold text-slate-600">
          {title}
        </figcaption>
      ) : null}
      <div className="px-3 py-4">{children}</div>
    </figure>
  );
}

function Box({
  x,
  y,
  w,
  h,
  fill,
  stroke,
  label,
  sub,
  rx = 10,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  stroke: string;
  label: string;
  sub?: string;
  rx?: number;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={rx} fill={fill} stroke={stroke} strokeWidth="1.5" />
      <text x={x + w / 2} y={sub ? y + h / 2 - 4 : y + h / 2 + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#0f172a">
        {label}
      </text>
      {sub ? (
        <text x={x + w / 2} y={y + h / 2 + 12} textAnchor="middle" fontSize="10" fill="#475569">
          {sub}
        </text>
      ) : null}
    </g>
  );
}

export function BuildingBlocksArt() {
  return (
    <Frame title="How the work is organised">
      <svg viewBox="0 0 640 280" className="mx-auto h-auto w-full max-w-3xl" role="img" aria-label="Organisation down to work items">
        <Box x={200} y={8} w={240} h={40} fill="#dbeafe" stroke="#3b82f6" label="Strategic Alignment" sub="Why we invest" />
        <line x1="320" y1="48" x2="320" y2="68" stroke="#94a3b8" strokeWidth="2" />
        <Box x={40} y={68} w={170} h={44} fill="#ede9fe" stroke="#8b5cf6" label="Program" sub="A family of projects" />
        <Box x={235} y={68} w={170} h={44} fill="#cffafe" stroke="#06b6d4" label="Project" sub="One change to deliver" />
        <Box x={430} y={68} w={170} h={44} fill="#fce7f3" stroke="#ec4899" label="Functional area" sub="Who owns it (IT, HR…)" />
        <line x1="320" y1="112" x2="320" y2="132" stroke="#94a3b8" strokeWidth="2" />
        <Box x={70} y={132} w={200} h={44} fill="#dcfce7" stroke="#22c55e" label="Stream" sub="A delivery lane (Core + extras)" />
        <Box x={370} y={132} w={200} h={44} fill="#ffedd5" stroke="#f97316" label="Work items" sub="The actual tasks" />
        <text x="320" y="210" textAnchor="middle" fontSize="11" fill="#64748b">
          Budget sits on the stream. People and tasks sit on work items. Gates sit on the stream.
        </text>
        <text x="320" y="232" textAnchor="middle" fontSize="11" fill="#64748b">
          The project is the roll-up — one place to see the whole picture.
        </text>
      </svg>
    </Frame>
  );
}

export function MoneyLayersArt() {
  const jars: { label: string; sub: string; color: string; lid: string; x: number }[] = [
    { label: "Budget", sub: "The envelope", color: "#93c5fd", lid: "#1d4ed8", x: 24 },
    { label: "Plan", sub: "How we'll spend", color: "#86efac", lid: "#15803d", x: 144 },
    { label: "Forecast", sub: "What we expect now", color: "#fdba74", lid: "#c2410c", x: 264 },
    { label: "Demand", sub: "Work assigned", color: "#c4b5fd", lid: "#6d28d9", x: 384 },
    { label: "Actual", sub: "What happened", color: "#f9a8d4", lid: "#be185d", x: 504 },
  ];
  return (
    <Frame title="Five money words — keep them separate">
      <svg viewBox="0 0 640 210" className="mx-auto h-auto w-full max-w-3xl" role="img" aria-label="Budget Plan Forecast Demand Actual">
        {jars.map((j) => (
          <g key={j.label} transform={`translate(${j.x},20)`}>
            <ellipse cx="54" cy="28" rx="40" ry="12" fill={j.lid} />
            <rect x="18" y="28" width="72" height="88" rx="8" fill={j.color} />
            <ellipse cx="54" cy="116" rx="36" ry="10" fill={j.lid} opacity="0.35" />
            <circle cx="54" cy="70" r="10" fill="#fff" opacity="0.7" />
            <text x="54" y="148" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0f172a">
              {j.label}
            </text>
            <text x="54" y="166" textAnchor="middle" fontSize="10" fill="#475569">
              {j.sub}
            </text>
          </g>
        ))}
      </svg>
    </Frame>
  );
}

export function PeopleTimeArt() {
  return (
    <Frame title="People: plan → assign → book time">
      <svg viewBox="0 0 640 180" className="mx-auto h-auto w-full max-w-3xl" role="img" aria-label="Planned FTE, demand, timesheets">
        <Box x={20} y={40} w={170} h={70} fill="#dcfce7" stroke="#16a34a" label="1. Plan people" sub="Estimation Planning" />
        <polygon points="200,75 228,75 228,68 250,82 228,96 228,89 200,89" fill="#94a3b8" />
        <Box x={258} y={40} w={170} h={70} fill="#ede9fe" stroke="#7c3aed" label="2. Assign work" sub="Work items = Demand" />
        <polygon points="438,75 466,75 466,68 488,82 466,96 466,89 438,89" fill="#94a3b8" />
        <Box x={496} y={40} w={124} h={70} fill="#fce7f3" stroke="#db2777" label="3. Timesheet" sub="Actual $ " />
        <text x="320" y="150" textAnchor="middle" fontSize="11" fill="#64748b">
          Planned FTE is the team you reserved. Demand is the work you handed them. Actual is the hours they booked.
        </text>
      </svg>
    </Frame>
  );
}

export function GatesArt() {
  const flags = [
    { x: 70, label: "Discovery", color: "#38bdf8" },
    { x: 210, label: "Design", color: "#a78bfa" },
    { x: 350, label: "Build", color: "#34d399" },
    { x: 490, label: "Go live", color: "#f59e0b" },
  ];
  return (
    <Frame title="Stage gates — checkpoints on the road">
      <svg viewBox="0 0 640 170" className="mx-auto h-auto w-full max-w-3xl" role="img" aria-label="Stage gates along a timeline">
        <line x1="40" y1="100" x2="600" y2="100" stroke="#cbd5e1" strokeWidth="8" strokeLinecap="round" />
        {flags.map((f) => (
          <g key={f.label}>
            <line x1={f.x} y1="100" x2={f.x} y2="42" stroke="#334155" strokeWidth="3" />
            <polygon points={`${f.x},42 ${f.x + 48},54 ${f.x},66`} fill={f.color} />
            <circle cx={f.x} cy="100" r="8" fill="#0f172a" />
            <text x={f.x + 8} y="128" textAnchor="middle" fontSize="11" fontWeight="600" fill="#334155">
              {f.label}
            </text>
          </g>
        ))}
      </svg>
    </Frame>
  );
}

export function HouseBudgetArt() {
  return (
    <Frame title="A household picture of the same idea">
      <svg viewBox="0 0 640 200" className="mx-auto h-auto w-full max-w-3xl" role="img" aria-label="House budget analogy">
        <polygon points="80,90 160,40 240,90" fill="#fdba74" stroke="#c2410c" strokeWidth="2" />
        <rect x="100" y="90" width="120" height="80" fill="#fed7aa" stroke="#c2410c" strokeWidth="2" />
        <rect x="148" y="118" width="28" height="52" fill="#7c2d12" />
        <text x="160" y="190" textAnchor="middle" fontSize="11" fill="#475569">
          The house (project)
        </text>
        <text x="400" y="48" fontSize="12" fill="#0f172a">
          Budget = the renovation envelope you were given
        </text>
        <text x="400" y="72" fontSize="12" fill="#0f172a">
          Plan = the quote: people, materials, months
        </text>
        <text x="400" y="96" fontSize="12" fill="#0f172a">
          Forecast = “we still think this is the bill”
        </text>
        <text x="400" y="120" fontSize="12" fill="#0f172a">
          Demand = jobs on the builder’s list this week
        </text>
        <text x="400" y="144" fontSize="12" fill="#0f172a">
          Actual = invoices already paid
        </text>
      </svg>
    </Frame>
  );
}
