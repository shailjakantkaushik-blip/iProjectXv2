/**
 * IBCS-style envelope: track = budget, fill = incurred, marker = forecast.
 */

function money(n: number) {
  return (
    "$" +
    new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0)
  );
}

export function EnvelopeBullet({
  budget,
  incurred,
  forecast,
}: {
  budget: number;
  incurred: number;
  forecast: number;
}) {
  const max = Math.max(budget, incurred, forecast, 1);
  const w = (n: number) => `${Math.min(100, (n / max) * 100)}%`;
  return (
    <div className="space-y-2">
      <div className="relative h-10 overflow-hidden rounded-md bg-slate-100">
        <div className="absolute inset-y-0 left-0 bg-blue-200/80" style={{ width: w(budget) }} />
        <div
          className="absolute top-2 bottom-2 left-0 rounded-sm bg-emerald-600"
          style={{ width: w(incurred) }}
        />
        <div className="absolute top-0 bottom-0 w-0.5 bg-amber-500" style={{ left: w(forecast) }} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-blue-200" /> Budget {money(budget)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" /> Incurred {money(incurred)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-0.5 bg-amber-500" /> Forecast {money(forecast)}
        </span>
      </div>
    </div>
  );
}
