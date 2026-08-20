import { formatStreamLabel } from "@/lib/project-streams";
import { cn } from "@/lib/utils";

export type RaidStreamOption = {
  id: string;
  project_id: string;
  name?: string | null;
  code?: string | null;
  is_default?: boolean | null;
  sort_order?: number | null;
};

export function streamsForProject(streams: RaidStreamOption[], projectId?: string | null) {
  if (!projectId) return [];
  return streams
    .filter((s) => s.project_id === projectId)
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/** Optional stream picker for RAID. Empty value = project-level. */
export function RaidStreamSelect({
  streams,
  projectId,
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  streams: RaidStreamOption[];
  projectId?: string | null;
  value?: string | null;
  onChange: (streamId: string) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const options = streamsForProject(streams, projectId);
  const inputClass = compact ? "st-input !py-0.5 !text-xs" : "st-input";
  const noneLabel = options.length ? "— Project (optional stream) —" : "— Project —";

  return (
    <select
      className={cn(inputClass)}
      aria-label="Stream"
      value={value || ""}
      disabled={disabled || !projectId || options.length === 0}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{noneLabel}</option>
      {options.map((s) => (
        <option key={s.id} value={s.id}>
          {formatStreamLabel(s)}
        </option>
      ))}
    </select>
  );
}
