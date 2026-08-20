import {
  GATE_APPROVAL_STATUSES,
  normalizeGateStatus,
} from "@/lib/stage-gate-approval";
import { GATE_STATUS_COLORS } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";

type GateOpt = {
  id?: string;
  gate_name?: string | null;
  status?: string | null;
};

/** Dropdown of delivery-method gates plus a status control for the selected gate. */
export function StageGateApprovalSelect({
  gates,
  gateId,
  onGateId,
  onStatus,
  canEdit = true,
  disabled = false,
  compact = false,
}: {
  gates: GateOpt[];
  gateId: string;
  onGateId: (id: string) => void;
  onStatus?: (gateId: string, status: string) => void;
  canEdit?: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  const selected = gates.find((g) => g.id === gateId);
  const status = normalizeGateStatus(selected?.status);
  const inputClass = compact ? "st-input !py-0.5 !text-xs" : "st-input";

  if (!canEdit) {
    if (!selected) return <span className="text-xs text-muted-foreground">—</span>;
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-medium">{selected.gate_name}</span>
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ background: GATE_STATUS_COLORS[status], color: "#0f172a" }}
        >
          {status}
        </span>
      </span>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5")}>
      <select
        className={inputClass}
        aria-label="Stage gate approval"
        value={gateId}
        disabled={disabled}
        onChange={(e) => onGateId(e.target.value)}
      >
        <option value="">— Stage gate approval —</option>
        {gates.map((g) =>
          g.id ? (
            <option key={g.id} value={g.id}>
              {g.gate_name}
            </option>
          ) : null,
        )}
      </select>
      {gateId && selected?.id && onStatus ? (
        <select
          className={cn(inputClass, "max-w-[10rem]")}
          aria-label="Stage gate status"
          value={status}
          disabled={disabled}
          onChange={(e) => onStatus(selected.id!, e.target.value)}
          style={{ borderColor: GATE_STATUS_COLORS[status] }}
        >
          {GATE_APPROVAL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
