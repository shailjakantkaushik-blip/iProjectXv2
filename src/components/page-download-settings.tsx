import { Switch } from "@/components/ui/switch";
import {
  defaultPageDownloadConfig,
  normalizePageDownloadConfig,
  pageDownloadCatalog,
  type PageDownloadConfig,
} from "@/lib/page-download";

/**
 * Checklist of workspace pages — allow/deny Download page (PDF/PPT/PNG).
 * Used by Org Admin and Platform Settings.
 */
export function PageDownloadSettings({
  value,
  onChange,
}: {
  value: PageDownloadConfig;
  onChange: (next: PageDownloadConfig) => void;
}) {
  const catalog = pageDownloadCatalog();
  const pages = { ...defaultPageDownloadConfig().pages, ...normalizePageDownloadConfig(value).pages };

  // Include Home explicitly
  const rows = [{ path: "/app", label: "Home", group: "Command Center" }, ...catalog.filter((p) => p.path !== "/app")];

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = groups.get(row.group) ?? [];
    list.push(row);
    groups.set(row.group, list);
  }

  const setPath = (path: string, enabled: boolean) => {
    onChange({
      pages: {
        ...pages,
        [path]: enabled,
      },
    });
  };

  const enableAll = () => {
    const next: Record<string, boolean> = {};
    for (const r of rows) next[r.path] = true;
    onChange({ pages: next });
  };

  const disableAll = () => {
    const next: Record<string, boolean> = {};
    for (const r of rows) next[r.path] = false;
    onChange({ pages: next });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="text-xs font-medium text-primary hover:underline"
          onClick={enableAll}
        >
          Allow all
        </button>
        <span className="text-xs text-muted-foreground">·</span>
        <button
          type="button"
          className="text-xs font-medium text-primary hover:underline"
          onClick={disableAll}
        >
          Disallow all
        </button>
      </div>
      {[...groups.entries()].map(([group, items]) => (
        <div key={group}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {group}
          </div>
          <div className="divide-y rounded-lg border border-border/70">
            {items.map((item) => (
              <label
                key={item.path}
                className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-muted/30"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{item.label}</div>
                  <div className="truncate font-mono text-[10px] text-muted-foreground">
                    {item.path}
                  </div>
                </div>
                <Switch
                  checked={pages[item.path] !== false}
                  onCheckedChange={(v) => setPath(item.path, v)}
                />
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
