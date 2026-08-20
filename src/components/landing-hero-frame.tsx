import type { ReactNode } from "react";

/** Shared matte around the landing hero film or illustration. */
export function LandingHeroFrame({
  children,
  accent,
  navy,
}: {
  children: ReactNode;
  accent: string;
  navy: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: navy,
        border: "1px solid rgba(226, 244, 255, 0.28)",
        boxShadow: `
          0 0 0 1px rgba(8, 14, 32, 0.88),
          0 0 0 8px ${navy},
          0 0 0 9px ${accent}55,
          0 24px 64px rgba(0, 0, 0, 0.45)
        `,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 z-[1] rounded-2xl"
        style={{
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.22), inset 0 0 0 1px rgba(255,255,255,0.06)",
        }}
        aria-hidden
      />
      {children}
    </div>
  );
}
