import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { RagChip } from "@/components/streamlit";
import { explainRag } from "@/lib/explain-metric";
import {
  parentEnvelopeStatus,
  type HierarchyEnvelopeLayer,
} from "@/lib/hierarchy-envelope";

function money(n: number) {
  return (
    "$" +
    new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0)
  );
}

export function HierarchyEnvelopeField({
  layer,
  name,
  envelope,
  childApproved,
  canEdit,
  onSave,
  peerLabel,
  peerAllocated,
}: {
  layer: HierarchyEnvelopeLayer;
  name: string;
  envelope: number | null;
  childApproved: number;
  canEdit: boolean;
  onSave: (value: number | null) => Promise<void>;
  /** Optional second comparison (e.g. sum of program pots vs an SA envelope). */
  peerLabel?: string;
  peerAllocated?: number;
}) {
  const [draft, setDraft] = useState(envelope == null ? "" : String(envelope));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setDraft(envelope == null ? "" : String(envelope));
  }, [envelope]);

  const parsed =
    draft.trim() === "" ? null : Number.isFinite(Number(draft)) ? Number(draft) : envelope;
  const status = parentEnvelopeStatus(parsed, childApproved);
  const peerStatus =
    peerAllocated != null && peerAllocated > 0 ? parentEnvelopeStatus(parsed, peerAllocated) : null;
  const label = layer === "alignment" ? "Alignment envelope" : "Program envelope";

  const commit = async () => {
    if (!canEdit) return;
    const next =
      draft.trim() === ""
        ? null
        : Number.isFinite(Number(draft))
          ? Math.max(0, Number(draft))
          : envelope;
    if (next === envelope || (next == null && envelope == null)) return;
    setBusy(true);
    setErr(null);
    try {
      await onSave(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save envelope");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 rounded-md border border-dashed bg-muted/30 px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {canEdit ? (
          <Input
            type="number"
            min={0}
            step="1000"
            className="h-7 w-32 text-xs tabular-nums"
            placeholder="Optional $"
            value={draft}
            disabled={busy}
            aria-label={label}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
          />
        ) : (
          <span className="text-xs font-semibold tabular-nums">
            {status.constrained ? money(status.envelope) : "Not set"}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground">
          Projects {money(childApproved)}
        </span>
        {status.constrained ? (
          <>
            <span
              className={`text-[10px] font-semibold tabular-nums ${
                status.overBy > 0 ? "text-rose-700" : "text-muted-foreground"
              }`}
            >
              {status.overBy > 0
                ? `${money(status.overBy)} over`
                : `${money(Math.max(0, status.remaining))} left`}
            </span>
            <RagChip
              rag={status.rag === "none" ? "Green" : status.rag}
              explain={explainRag({
                rag: status.rag === "none" ? "Green" : status.rag,
                extraBullets: [
                  `${label} ${money(status.envelope)}.`,
                  `Child project approved funding sums to ${money(status.allocated)}.`,
                  "FY Allocation stays a year slice of each project envelope.",
                ],
              })}
            />
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground">Rollup only</span>
        )}
      </div>
      {peerStatus?.constrained ? (
        <p
          className={`mt-1 text-[10px] ${
            peerStatus.overBy > 0 ? "font-semibold text-rose-700" : "text-muted-foreground"
          }`}
        >
          {peerLabel || "Child pots"} {money(peerStatus.allocated)}
          {peerStatus.overBy > 0
            ? ` · ${money(peerStatus.overBy)} over this envelope`
            : ` · ${money(Math.max(0, peerStatus.remaining))} left vs this envelope`}
        </p>
      ) : null}
      {err ? <p className="mt-1 text-[10px] text-destructive">{err}</p> : null}
    </div>
  );
}
