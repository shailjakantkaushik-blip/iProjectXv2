/** Stable project list order: project code (numeric-aware), then name. */

export type ProjectCodeName = {
  project_code?: string | null;
  name?: string | null;
};

export function compareProjectsByCodeName(a: ProjectCodeName, b: ProjectCodeName) {
  const code = String(a.project_code || "").localeCompare(String(b.project_code || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (code !== 0) return code;
  return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
}

export function sortProjectsByCodeName<T extends ProjectCodeName>(projects: T[]): T[] {
  return [...projects].sort(compareProjectsByCodeName);
}
