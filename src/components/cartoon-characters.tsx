import type { ReactNode } from "react";
import type { CartoonId } from "@/lib/cartoons";
import { cn } from "@/lib/utils";

type CharProps = {
  px: number;
  moodClass: string;
  bodyGrad: string;
  screenGrad: string;
};

function Frame({
  px,
  moodClass,
  children,
}: {
  px: number;
  moodClass: string;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 160 160"
      width={px}
      height={px}
      className={cn("cartoon-svg overflow-visible", moodClass)}
      role="img"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function GuideChar({ px, moodClass, bodyGrad, screenGrad }: CharProps) {
  return (
    <Frame px={px} moodClass={moodClass}>
      <defs>
        <linearGradient id={bodyGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id={screenGrad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e8edf3" />
          <stop offset="100%" stopColor="#c5d0de" />
        </linearGradient>
      </defs>
      <ellipse className="cg-shadow" cx="80" cy="148" rx="42" ry="7" fill="currentColor" opacity="0.12" />
      <g className="cg-body">
        <rect x="48" y="70" width="64" height="58" rx="22" fill={`url(#${bodyGrad})`} />
        <rect x="58" y="82" width="44" height="28" rx="8" fill={`url(#${screenGrad})`} />
        <path
          d="M66 102 L74 94 L82 98 L94 88"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="94" cy="88" r="2.5" fill="var(--accent2, #15803d)" />
      </g>
      <g className="cg-head">
        <circle cx="80" cy="48" r="28" fill="#f8fafc" stroke="var(--primary)" strokeWidth="3" />
        <circle className="cg-eye cg-eye-l" cx="70" cy="46" r="3.2" fill="#0f172a" />
        <circle className="cg-eye cg-eye-r" cx="90" cy="46" r="3.2" fill="#0f172a" />
        <path className="cg-mouth" d="M72 58 Q80 64 88 58" fill="none" stroke="#0f172a" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="70" cy="46" r="8" fill="none" stroke="var(--primary)" strokeWidth="2" opacity="0.55" />
        <circle cx="90" cy="46" r="8" fill="none" stroke="var(--primary)" strokeWidth="2" opacity="0.55" />
        <path d="M78 46 H82" stroke="var(--primary)" strokeWidth="2" opacity="0.55" />
      </g>
      <g className="cg-arm-l">
        <path d="M52 88 Q36 96 40 114" fill="none" stroke="var(--primary)" strokeWidth="8" strokeLinecap="round" />
      </g>
      <g className="cg-arm-r">
        <path d="M108 88 Q124 90 118 70" fill="none" stroke="var(--primary)" strokeWidth="8" strokeLinecap="round" />
        <circle cx="116" cy="64" r="6" fill="#f8fafc" stroke="var(--primary)" strokeWidth="2.5" />
      </g>
      <g className="cg-sparkles" fill="var(--accent2, #15803d)">
        <circle cx="28" cy="40" r="2.5" />
        <circle cx="132" cy="52" r="2" />
        <circle cx="138" cy="92" r="1.8" />
      </g>
    </Frame>
  );
}

function TigerChar({ px, moodClass }: CharProps) {
  return (
    <Frame px={px} moodClass={moodClass}>
      <ellipse className="cg-shadow" cx="80" cy="148" rx="44" ry="7" fill="currentColor" opacity="0.12" />
      <g className="cg-body">
        <ellipse cx="80" cy="98" rx="36" ry="30" fill="var(--primary)" opacity="0.92" />
        <ellipse cx="80" cy="102" rx="22" ry="16" fill="#f8fafc" opacity="0.85" />
        <path d="M58 88 Q70 92 58 104" fill="none" stroke="#0f172a" strokeWidth="3.5" opacity="0.35" strokeLinecap="round" />
        <path d="M102 88 Q90 92 102 104" fill="none" stroke="#0f172a" strokeWidth="3.5" opacity="0.35" strokeLinecap="round" />
        <path d="M80 78 V92" fill="none" stroke="#0f172a" strokeWidth="3" opacity="0.28" strokeLinecap="round" />
      </g>
      <g className="cg-head">
        <circle cx="80" cy="52" r="30" fill="var(--primary)" />
        <ellipse cx="80" cy="58" rx="16" ry="12" fill="#f8fafc" opacity="0.9" />
        <path d="M54 34 L48 18 L66 28 Z" fill="var(--primary)" />
        <path d="M106 34 L112 18 L94 28 Z" fill="var(--primary)" />
        <path d="M54 32 L52 22 L62 28 Z" fill="#f8fafc" opacity="0.7" />
        <path d="M106 32 L108 22 L98 28 Z" fill="#f8fafc" opacity="0.7" />
        <path d="M56 48 L66 52" stroke="#0f172a" strokeWidth="2.5" opacity="0.4" strokeLinecap="round" />
        <path d="M104 48 L94 52" stroke="#0f172a" strokeWidth="2.5" opacity="0.4" strokeLinecap="round" />
        <circle className="cg-eye cg-eye-l" cx="70" cy="50" r="3.4" fill="#0f172a" />
        <circle className="cg-eye cg-eye-r" cx="90" cy="50" r="3.4" fill="#0f172a" />
        <ellipse cx="80" cy="60" rx="4" ry="3" fill="#0f172a" opacity="0.75" />
        <path className="cg-mouth" d="M72 68 Q80 74 88 68" fill="none" stroke="#0f172a" strokeWidth="2.2" strokeLinecap="round" />
      </g>
      <g className="cg-arm-r">
        <path d="M112 90 Q128 86 122 68" fill="none" stroke="var(--primary)" strokeWidth="9" strokeLinecap="round" />
        <ellipse cx="120" cy="64" rx="8" ry="6" fill="var(--primary)" />
      </g>
      <g className="cg-sparkles" fill="var(--accent2, #15803d)">
        <circle cx="30" cy="42" r="2.2" />
        <circle cx="134" cy="56" r="1.8" />
      </g>
    </Frame>
  );
}

function AstronautChar({ px, moodClass }: CharProps) {
  return (
    <Frame px={px} moodClass={moodClass}>
      <ellipse className="cg-shadow" cx="80" cy="148" rx="42" ry="7" fill="currentColor" opacity="0.12" />
      <g className="cg-body">
        <rect x="50" y="72" width="60" height="52" rx="18" fill="#e2e8f0" stroke="var(--primary)" strokeWidth="3" />
        <rect x="62" y="84" width="36" height="22" rx="6" fill="#0f172a" opacity="0.85" />
        <circle cx="80" cy="95" r="5" fill="var(--accent2, #38bdf8)" />
        <rect x="44" y="88" width="10" height="18" rx="4" fill="var(--primary)" opacity="0.8" />
        <rect x="106" y="88" width="10" height="18" rx="4" fill="var(--primary)" opacity="0.8" />
      </g>
      <g className="cg-head">
        <circle cx="80" cy="46" r="30" fill="#f1f5f9" stroke="var(--primary)" strokeWidth="3.5" />
        <circle cx="80" cy="48" r="22" fill="#0ea5e9" opacity="0.35" />
        <circle cx="80" cy="48" r="18" fill="#0f172a" opacity="0.55" />
        <ellipse cx="74" cy="42" rx="6" ry="3" fill="#fff" opacity="0.45" />
        <circle className="cg-eye cg-eye-l" cx="72" cy="48" r="2.8" fill="#f8fafc" />
        <circle className="cg-eye cg-eye-r" cx="88" cy="48" r="2.8" fill="#f8fafc" />
        <path className="cg-mouth" d="M74 56 Q80 60 86 56" fill="none" stroke="#f8fafc" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      </g>
      <g className="cg-arm-r">
        <path d="M108 90 Q126 88 122 68" fill="none" stroke="#e2e8f0" strokeWidth="9" strokeLinecap="round" />
        <circle cx="120" cy="64" r="7" fill="#f1f5f9" stroke="var(--primary)" strokeWidth="2.5" />
      </g>
      <g className="cg-sparkles" fill="var(--accent2, #38bdf8)">
        <circle cx="26" cy="36" r="2" />
        <circle cx="136" cy="48" r="1.6" />
        <circle cx="30" cy="70" r="1.4" />
      </g>
    </Frame>
  );
}

function FootballChar({ px, moodClass }: CharProps) {
  return (
    <Frame px={px} moodClass={moodClass}>
      <ellipse className="cg-shadow" cx="80" cy="148" rx="42" ry="7" fill="currentColor" opacity="0.12" />
      <g className="cg-body">
        <rect x="52" y="74" width="56" height="50" rx="14" fill="var(--primary)" />
        <path d="M52 90 H108" stroke="#f8fafc" strokeWidth="4" opacity="0.9" />
        <circle cx="80" cy="102" r="7" fill="#f8fafc" opacity="0.95" />
        <text x="80" y="105" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--primary)">
          10
        </text>
      </g>
      <g className="cg-head">
        <circle cx="80" cy="48" r="26" fill="#f8fafc" stroke="var(--primary)" strokeWidth="3" />
        <path d="M55 40 Q80 28 105 40" fill="var(--primary)" opacity="0.9" />
        <circle className="cg-eye cg-eye-l" cx="70" cy="48" r="3" fill="#0f172a" />
        <circle className="cg-eye cg-eye-r" cx="90" cy="48" r="3" fill="#0f172a" />
        <path className="cg-mouth" d="M72 58 Q80 64 88 58" fill="none" stroke="#0f172a" strokeWidth="2.2" strokeLinecap="round" />
      </g>
      <g className="cg-arm-r">
        <path d="M106 88 Q124 86 118 68" fill="none" stroke="var(--primary)" strokeWidth="8" strokeLinecap="round" />
        <circle cx="116" cy="64" r="10" fill="#f8fafc" stroke="#0f172a" strokeWidth="1.5" />
        <path d="M110 60 L122 68 M116 56 L116 72 M110 68 L122 60" stroke="#0f172a" strokeWidth="1.2" opacity="0.55" />
      </g>
      <g className="cg-sparkles" fill="var(--accent2, #15803d)">
        <circle cx="28" cy="44" r="2" />
        <circle cx="134" cy="70" r="1.6" />
      </g>
    </Frame>
  );
}

function CricketChar({ px, moodClass }: CharProps) {
  return (
    <Frame px={px} moodClass={moodClass}>
      <ellipse className="cg-shadow" cx="80" cy="148" rx="42" ry="7" fill="currentColor" opacity="0.12" />
      <g className="cg-body">
        <rect x="52" y="74" width="56" height="50" rx="14" fill="#f8fafc" stroke="var(--primary)" strokeWidth="3" />
        <path d="M60 86 H100" stroke="var(--primary)" strokeWidth="2.5" opacity="0.5" />
        <path d="M60 98 H100" stroke="var(--primary)" strokeWidth="2.5" opacity="0.35" />
        <circle cx="80" cy="108" r="5" fill="var(--accent2, #15803d)" opacity="0.85" />
      </g>
      <g className="cg-head">
        <circle cx="80" cy="48" r="26" fill="#f8fafc" stroke="var(--primary)" strokeWidth="3" />
        <ellipse cx="80" cy="30" rx="22" ry="10" fill="var(--primary)" />
        <rect x="58" y="28" width="44" height="8" rx="2" fill="var(--primary)" />
        <circle className="cg-eye cg-eye-l" cx="70" cy="48" r="3" fill="#0f172a" />
        <circle className="cg-eye cg-eye-r" cx="90" cy="48" r="3" fill="#0f172a" />
        <path className="cg-mouth" d="M72 58 Q80 63 88 58" fill="none" stroke="#0f172a" strokeWidth="2.2" strokeLinecap="round" />
      </g>
      <g className="cg-arm-r">
        <path d="M106 90 Q122 84 128 62" fill="none" stroke="var(--primary)" strokeWidth="7" strokeLinecap="round" />
        <rect x="124" y="40" width="8" height="28" rx="3" fill="#92400e" transform="rotate(12 128 54)" />
        <ellipse cx="130" cy="38" rx="7" ry="10" fill="#b45309" transform="rotate(12 130 38)" />
      </g>
      <g className="cg-sparkles" fill="var(--accent2, #15803d)">
        <circle cx="30" cy="50" r="2" />
        <circle cx="136" cy="88" r="1.6" />
      </g>
    </Frame>
  );
}

function SantaChar({ px, moodClass }: CharProps) {
  return (
    <Frame px={px} moodClass={moodClass}>
      <ellipse className="cg-shadow" cx="80" cy="148" rx="44" ry="7" fill="currentColor" opacity="0.12" />
      <g className="cg-body">
        <rect x="48" y="76" width="64" height="50" rx="18" fill="#dc2626" />
        <rect x="74" y="76" width="12" height="50" fill="#f8fafc" opacity="0.95" />
        <circle cx="80" cy="108" r="6" fill="#fbbf24" />
        <ellipse cx="80" cy="128" rx="28" ry="8" fill="#f8fafc" />
      </g>
      <g className="cg-head">
        <circle cx="80" cy="52" r="28" fill="#fde68a" stroke="#b45309" strokeWidth="1.5" />
        <path d="M52 40 Q80 8 108 40 L100 48 Q80 28 60 48 Z" fill="#dc2626" />
        <ellipse cx="108" cy="28" rx="7" ry="6" fill="#f8fafc" />
        <path d="M55 62 Q80 78 105 62 Q80 70 55 62 Z" fill="#f8fafc" />
        <circle className="cg-eye cg-eye-l" cx="70" cy="50" r="3" fill="#0f172a" />
        <circle className="cg-eye cg-eye-r" cx="90" cy="50" r="3" fill="#0f172a" />
        <ellipse cx="80" cy="58" rx="3.5" ry="2.5" fill="#ef4444" opacity="0.85" />
        <path className="cg-mouth" d="M72 64 Q80 68 88 64" fill="none" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
      </g>
      <g className="cg-arm-r">
        <path d="M108 90 Q126 86 120 66" fill="none" stroke="#dc2626" strokeWidth="9" strokeLinecap="round" />
        <circle cx="118" cy="62" r="7" fill="#f8fafc" />
      </g>
      <g className="cg-sparkles" fill="#fbbf24">
        <circle cx="28" cy="40" r="2.2" />
        <circle cx="134" cy="54" r="1.8" />
      </g>
    </Frame>
  );
}

function EidChar({ px, moodClass }: CharProps) {
  return (
    <Frame px={px} moodClass={moodClass}>
      <ellipse className="cg-shadow" cx="80" cy="148" rx="42" ry="7" fill="currentColor" opacity="0.12" />
      <g className="cg-body">
        <rect x="48" y="74" width="64" height="52" rx="16" fill="var(--primary)" opacity="0.92" />
        <path d="M56 86 Q80 98 104 86" fill="none" stroke="#fbbf24" strokeWidth="3" opacity="0.85" />
        <path d="M60 100 Q80 112 100 100" fill="none" stroke="#fbbf24" strokeWidth="2.5" opacity="0.55" />
      </g>
      <g className="cg-head">
        <circle cx="80" cy="48" r="26" fill="#fde68a" stroke="#b45309" strokeWidth="1.2" />
        <ellipse cx="80" cy="28" rx="24" ry="12" fill="#0f172a" opacity="0.85" />
        <path d="M56 32 Q80 48 104 32" fill="#0f172a" opacity="0.85" />
        <circle className="cg-eye cg-eye-l" cx="70" cy="48" r="3" fill="#0f172a" />
        <circle className="cg-eye cg-eye-r" cx="90" cy="48" r="3" fill="#0f172a" />
        <path className="cg-mouth" d="M72 58 Q80 64 88 58" fill="none" stroke="#0f172a" strokeWidth="2.2" strokeLinecap="round" />
      </g>
      <g className="cg-arm-r">
        <path d="M108 90 Q126 88 122 68" fill="none" stroke="var(--primary)" strokeWidth="8" strokeLinecap="round" />
        <path d="M118 52 L118 68" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
        <path d="M110 56 Q118 48 126 56 Q118 64 110 56" fill="#f59e0b" opacity="0.9" />
        <circle cx="118" cy="50" r="3" fill="#fbbf24" />
      </g>
      <g className="cg-sparkles" fill="#fbbf24">
        <circle cx="26" cy="42" r="2" />
        <path d="M132 36 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2 z" fill="#fde68a" />
      </g>
    </Frame>
  );
}

function DiwaliChar({ px, moodClass }: CharProps) {
  return (
    <Frame px={px} moodClass={moodClass}>
      <ellipse className="cg-shadow" cx="80" cy="148" rx="42" ry="7" fill="currentColor" opacity="0.12" />
      <g className="cg-body">
        <path d="M50 78 Q80 68 110 78 L104 124 Q80 132 56 124 Z" fill="#db2777" opacity="0.92" />
        <path d="M62 90 Q80 100 98 90" fill="none" stroke="#fbbf24" strokeWidth="2.5" opacity="0.8" />
        <ellipse cx="80" cy="112" rx="14" ry="6" fill="#fbbf24" opacity="0.45" />
      </g>
      <g className="cg-head">
        <circle cx="80" cy="48" r="26" fill="#fde68a" stroke="#b45309" strokeWidth="1.2" />
        <path d="M54 42 Q80 18 106 42" fill="#7c2d12" opacity="0.9" />
        <circle cx="80" cy="30" r="4" fill="#fbbf24" />
        <circle className="cg-eye cg-eye-l" cx="70" cy="48" r="3" fill="#0f172a" />
        <circle className="cg-eye cg-eye-r" cx="90" cy="48" r="3" fill="#0f172a" />
        <circle cx="66" cy="54" r="3" fill="#f472b6" opacity="0.55" />
        <circle cx="94" cy="54" r="3" fill="#f472b6" opacity="0.55" />
        <path className="cg-mouth" d="M72 60 Q80 66 88 60" fill="none" stroke="#0f172a" strokeWidth="2.2" strokeLinecap="round" />
      </g>
      <g className="cg-arm-r">
        <path d="M106 92 Q124 90 120 72" fill="none" stroke="#db2777" strokeWidth="8" strokeLinecap="round" />
        <ellipse cx="118" cy="66" rx="10" ry="6" fill="#92400e" />
        <ellipse cx="118" cy="58" rx="4" ry="7" fill="#fbbf24" />
        <path d="M118 48 Q120 54 118 58 Q116 54 118 48" fill="#f59e0b" />
      </g>
      <g className="cg-sparkles" fill="#fbbf24">
        <circle cx="28" cy="48" r="2" />
        <circle cx="134" cy="40" r="1.8" />
        <circle cx="30" cy="80" r="1.4" />
      </g>
    </Frame>
  );
}

function HoliChar({ px, moodClass }: CharProps) {
  return (
    <Frame px={px} moodClass={moodClass}>
      <ellipse className="cg-shadow" cx="80" cy="148" rx="42" ry="7" fill="currentColor" opacity="0.12" />
      <g className="cg-body">
        <rect x="50" y="74" width="60" height="50" rx="16" fill="#f8fafc" stroke="var(--primary)" strokeWidth="2.5" />
        <circle cx="62" cy="90" r="7" fill="#ef4444" opacity="0.75" />
        <circle cx="90" cy="96" r="9" fill="#3b82f6" opacity="0.7" />
        <circle cx="78" cy="112" r="8" fill="#22c55e" opacity="0.7" />
        <circle cx="100" cy="84" r="5" fill="#eab308" opacity="0.8" />
      </g>
      <g className="cg-head">
        <circle cx="80" cy="48" r="26" fill="#fde68a" stroke="#b45309" strokeWidth="1.2" />
        <circle cx="60" cy="40" r="6" fill="#ec4899" opacity="0.7" />
        <circle cx="98" cy="44" r="7" fill="#8b5cf6" opacity="0.7" />
        <circle cx="86" cy="32" r="5" fill="#06b6d4" opacity="0.65" />
        <circle className="cg-eye cg-eye-l" cx="70" cy="48" r="3" fill="#0f172a" />
        <circle className="cg-eye cg-eye-r" cx="90" cy="48" r="3" fill="#0f172a" />
        <path className="cg-mouth" d="M70 60 Q80 68 90 60" fill="none" stroke="#0f172a" strokeWidth="2.2" strokeLinecap="round" />
      </g>
      <g className="cg-arm-r">
        <path d="M108 90 Q126 86 122 66" fill="none" stroke="var(--primary)" strokeWidth="8" strokeLinecap="round" />
        <circle cx="120" cy="60" r="9" fill="#f472b6" opacity="0.9" />
        <circle cx="116" cy="56" r="3" fill="#fbbf24" />
        <circle cx="124" cy="64" r="2.5" fill="#38bdf8" />
      </g>
      <g className="cg-sparkles">
        <circle cx="26" cy="50" r="2.5" fill="#ef4444" />
        <circle cx="134" cy="42" r="2" fill="#3b82f6" />
        <circle cx="140" cy="80" r="2.2" fill="#22c55e" />
      </g>
    </Frame>
  );
}

function FitnessChar({ px, moodClass }: CharProps) {
  return (
    <Frame px={px} moodClass={moodClass}>
      <ellipse className="cg-shadow" cx="80" cy="148" rx="42" ry="7" fill="currentColor" opacity="0.12" />
      <g className="cg-body">
        <rect x="54" y="74" width="52" height="48" rx="14" fill="var(--primary)" />
        <path d="M64 86 H96" stroke="#f8fafc" strokeWidth="3" opacity="0.85" />
        <path d="M70 98 H90" stroke="#f8fafc" strokeWidth="2.5" opacity="0.55" />
      </g>
      <g className="cg-head">
        <circle cx="80" cy="48" r="26" fill="#fde68a" stroke="#b45309" strokeWidth="1.2" />
        <path d="M58 36 Q80 24 102 36" fill="none" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
        <circle className="cg-eye cg-eye-l" cx="70" cy="48" r="3" fill="#0f172a" />
        <circle className="cg-eye cg-eye-r" cx="90" cy="48" r="3" fill="#0f172a" />
        <path className="cg-mouth" d="M72 58 Q80 64 88 58" fill="none" stroke="#0f172a" strokeWidth="2.2" strokeLinecap="round" />
      </g>
      <g className="cg-arm-r">
        <path d="M104 88 Q128 90 130 70" fill="none" stroke="var(--primary)" strokeWidth="9" strokeLinecap="round" />
        <rect x="118" y="58" width="22" height="8" rx="3" fill="#334155" />
        <circle cx="118" cy="62" r="5" fill="#64748b" />
        <circle cx="140" cy="62" r="5" fill="#64748b" />
      </g>
      <g className="cg-sparkles" fill="var(--accent2, #15803d)">
        <circle cx="28" cy="44" r="2" />
        <circle cx="134" cy="36" r="1.6" />
      </g>
    </Frame>
  );
}

function YogaChar({ px, moodClass }: CharProps) {
  return (
    <Frame px={px} moodClass={moodClass}>
      <ellipse className="cg-shadow" cx="80" cy="148" rx="42" ry="7" fill="currentColor" opacity="0.12" />
      <g className="cg-body">
        <ellipse cx="80" cy="104" rx="28" ry="22" fill="var(--primary)" opacity="0.9" />
        <path d="M58 104 Q80 90 102 104" fill="none" stroke="#f8fafc" strokeWidth="2.5" opacity="0.5" />
        <circle cx="80" cy="108" r="4" fill="#fbbf24" opacity="0.85" />
      </g>
      <g className="cg-head">
        <circle cx="80" cy="50" r="26" fill="#fde68a" stroke="#b45309" strokeWidth="1.2" />
        <path d="M62 36 Q80 22 98 36" fill="none" stroke="#0f172a" strokeWidth="2.5" opacity="0.25" strokeLinecap="round" />
        <circle className="cg-eye cg-eye-l" cx="70" cy="50" r="2.6" fill="#0f172a" />
        <circle className="cg-eye cg-eye-r" cx="90" cy="50" r="2.6" fill="#0f172a" />
        <path className="cg-mouth" d="M74 60 Q80 64 86 60" fill="none" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
      </g>
      <g className="cg-arm-r">
        <path d="M102 92 Q118 70 112 48" fill="none" stroke="var(--primary)" strokeWidth="7" strokeLinecap="round" />
        <circle cx="110" cy="44" r="5" fill="#fde68a" stroke="var(--primary)" strokeWidth="2" />
      </g>
      <g className="cg-arm-l">
        <path d="M58 92 Q42 70 48 48" fill="none" stroke="var(--primary)" strokeWidth="7" strokeLinecap="round" />
        <circle cx="50" cy="44" r="5" fill="#fde68a" stroke="var(--primary)" strokeWidth="2" />
      </g>
      <g className="cg-sparkles" fill="#a78bfa">
        <circle cx="28" cy="56" r="2" />
        <circle cx="134" cy="60" r="1.8" />
      </g>
    </Frame>
  );
}

const RENDERERS: Record<CartoonId, (p: CharProps) => ReactNode> = {
  guide: GuideChar,
  tiger: TigerChar,
  astronaut: AstronautChar,
  football: FootballChar,
  cricket: CricketChar,
  santa: SantaChar,
  eid: EidChar,
  diwali: DiwaliChar,
  holi: HoliChar,
  fitness: FitnessChar,
  yoga: YogaChar,
};

export function CartoonCharacterSvg({
  id,
  px,
  moodClass,
  bodyGrad,
  screenGrad,
}: {
  id: CartoonId;
  px: number;
  moodClass: string;
  bodyGrad: string;
  screenGrad: string;
}) {
  const Comp = RENDERERS[id] ?? GuideChar;
  return <Comp px={px} moodClass={moodClass} bodyGrad={bodyGrad} screenGrad={screenGrad} />;
}
