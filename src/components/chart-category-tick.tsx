/** Recharts category tick that wraps the last word so long labels stay visible. */
export function CategoryTick({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) {
  const raw = String(payload?.value || "");
  const words = raw.split(/\s+/).filter(Boolean);
  const lines = words.length <= 1 ? [raw] : [words.slice(0, -1).join(" "), words[words.length - 1]];
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text textAnchor="middle" fill="#64748b" fontSize={10}>
        {lines.map((line, i) => (
          <tspan key={`${line}-${i}`} x={0} dy={i === 0 ? 12 : 12}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}
