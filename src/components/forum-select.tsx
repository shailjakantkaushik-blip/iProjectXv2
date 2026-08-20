import {
  forumSelectNames,
  type ForumProjectLike,
  type GovernanceChannel,
} from "@/lib/governance-forums";

type Props = {
  channels: GovernanceChannel[];
  project?: ForumProjectLike | null;
  extra?: Array<string | null | undefined>;
  value: string;
  onChange: (next: string) => void;
  className?: string;
  compact?: boolean;
  allowBlank?: boolean;
  disabled?: boolean;
  id?: string;
};

/** Dropdown of existing governance forums; free-text only when none exist. */
export function ForumSelect({
  channels,
  project,
  extra,
  value,
  onChange,
  className,
  compact,
  allowBlank = true,
  disabled,
  id,
}: Props) {
  const names = forumSelectNames(channels, { project, extra: extra?.length ? extra : [value] });
  const cls = className || (compact ? "st-input !py-0.5 !text-xs" : "st-input");
  if (names.length === 0) {
    return (
      <input
        id={id}
        className={cls}
        placeholder="Forum"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <select
      id={id}
      className={cls}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {allowBlank ? <option value="">— Forum —</option> : null}
      {names.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}
