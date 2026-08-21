import { useMemo, useState } from "react";
import { SectionFrame, SectionTitle, KpiCard, RagChip } from "@/components/streamlit";
import { HierarchyEnvelopeField } from "@/components/hierarchy-envelope-field";
import { ExistingOrNewName } from "@/components/existing-or-new-name";
import { explainRag } from "@/lib/explain-metric";
import { PORTFOLIO_CATEGORIES } from "@/lib/project-health";
import {
  childApprovedByLayer,
  childApprovedByProgram,
  collectAlignmentNames,
  collectProgramNames,
  lookupHierarchyEnvelope,
  normalizeHierarchyName,
  parentEnvelopeStatus,
  programApprovedKey,
  programPotsAllocated,
  type HierarchyEnvelopeRow,
  type HierarchyProjectLike,
} from "@/lib/hierarchy-envelope";

function money(n: number) {
  return (
    "$" +
    new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0)
  );
}

export function HierarchyEnvelopeBoard({
  projects,
  rows,
  index,
  canEdit,
  onSave,
}: {
  projects: HierarchyProjectLike[];
  rows: HierarchyEnvelopeRow[];
  index: Map<string, HierarchyEnvelopeRow>;
  canEdit: boolean;
  onSave: (
    layer: "alignment" | "program",
    name: string,
    envelope: number | null,
    parentName?: string,
  ) => Promise<void>;
}) {
  const [extraSa, setExtraSa] = useState<string[]>([]);
  const [extraProg, setExtraProg] = useState<Record<string, string[]>>({});
  const [sa, setSa] = useState("");
  const [program, setProgram] = useState("");

  const saNames = useMemo(() => {
    const base = collectAlignmentNames(projects, rows, [...PORTFOLIO_CATEGORIES, ...extraSa]);
    return base;
  }, [projects, rows, extraSa]);

  const programNames = useMemo(() => {
    if (!sa) return [];
    const extras = extraProg[normalizeHierarchyName(sa)] ?? [];
    const base = collectProgramNames(projects, rows, sa);
    return [...new Set([...base, ...extras])].sort((a, b) => a.localeCompare(b));
  }, [projects, rows, sa, extraProg]);

  const saKey = sa ? normalizeHierarchyName(sa) : "";
  const saEnvelope = saKey ? lookupHierarchyEnvelope(index, "alignment", saKey) : null;
  const saApproved = saKey ? childApprovedByLayer(projects, "alignment").get(saKey) ?? 0 : 0;
  const pots = saKey ? programPotsAllocated(saKey, programNames, index) : 0;
  const saVsProjects = parentEnvelopeStatus(saEnvelope, saApproved);
  const saVsPots = parentEnvelopeStatus(saEnvelope, pots);

  const progKey = program ? normalizeHierarchyName(program) : "";
  const progEnvelope =
    saKey && progKey ? lookupHierarchyEnvelope(index, "program", progKey, saKey) : null;
  const progApproved =
    saKey && progKey
      ? childApprovedByProgram(projects).get(programApprovedKey(saKey, progKey)) ?? 0
      : 0;

  const programRows = programNames.map((name) => {
    const envelope = lookupHierarchyEnvelope(index, "program", name, saKey);
    const approved = childApprovedByProgram(projects).get(programApprovedKey(saKey, name)) ?? 0;
    return { name, envelope, approved, status: parentEnvelopeStatus(envelope, approved) };
  });

  const rememberSa = (next: string) => {
    setSa(next);
    setProgram("");
    const n = next.trim();
    if (n && !saNames.includes(normalizeHierarchyName(n))) {
      setExtraSa((prev) => [...new Set([...prev, n])]);
    }
  };

  const rememberProgram = (next: string) => {
    setProgram(next);
    const n = next.trim();
    if (!saKey || !n) return;
    if (!programNames.includes(normalizeHierarchyName(n))) {
      setExtraProg((prev) => ({
        ...prev,
        [saKey]: [...new Set([...(prev[saKey] ?? []), n])],
      }));
    }
  };

  return (
    <SectionFrame>
      <SectionTitle>Hierarchy envelopes</SectionTitle>
      <p className="mb-3 text-xs text-muted-foreground">
        Pick an existing Strategic Alignment, or type a new one. Set that pot first, then allocate
        to programs inside it. Names are a dropdown when they already exist. Project approved
        funding stays the project envelope; FY Allocation stays a year slice of that project
        envelope.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <ExistingOrNewName
          label="Strategic Alignment"
          value={sa}
          options={saNames}
          onChange={rememberSa}
          disabled={!canEdit && saNames.length === 0}
          placeholder="Select alignment"
          newOptionLabel="+ New strategic alignment"
        />
      </div>

      {saKey ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard
              label="SA envelope"
              value={saVsProjects.constrained ? money(saVsProjects.envelope) : "Not set"}
              accent="#1d4ed8"
            />
            <KpiCard label="Project approved" value={money(saApproved)} accent="#3b82f6" />
            <KpiCard label="Program pots" value={money(pots)} accent="#7c3aed" />
            <KpiCard
              label={saVsPots.overBy > 0 ? "Program pots over" : "Left vs program pots"}
              value={
                saVsPots.constrained
                  ? money(saVsPots.overBy > 0 ? saVsPots.overBy : Math.max(0, saVsPots.remaining))
                  : "—"
              }
              accent={saVsPots.overBy > 0 ? "#e11d48" : "#059669"}
            />
          </div>
          <HierarchyEnvelopeField
            layer="alignment"
            name={saKey}
            envelope={saEnvelope}
            childApproved={saApproved}
            canEdit={canEdit}
            onSave={(value) => onSave("alignment", saKey, value)}
            peerLabel="Program pots"
            peerAllocated={pots}
          />

          <div className="mt-4 border-t pt-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Allocate inside {saKey}
            </p>
            <ExistingOrNewName
              label="Program"
              value={program}
              options={programNames}
              onChange={rememberProgram}
              placeholder="Select program"
              newOptionLabel="+ New program"
            />
            {progKey ? (
              <HierarchyEnvelopeField
                layer="program"
                name={progKey}
                envelope={progEnvelope}
                childApproved={progApproved}
                canEdit={canEdit}
                onSave={(value) => onSave("program", progKey, value, saKey)}
              />
            ) : (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Select or add a program to set its share of the alignment envelope.
              </p>
            )}
          </div>

          {programRows.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="st-table text-xs">
                <thead>
                  <tr>
                    <th className="text-left">Program</th>
                    <th className="text-right">Envelope</th>
                    <th className="text-right">Project approved</th>
                    <th className="text-right">Remaining</th>
                    <th>RAG</th>
                  </tr>
                </thead>
                <tbody>
                  {programRows.map((row) => (
                    <tr
                      key={row.name}
                      className={row.name === progKey ? "bg-muted/50" : undefined}
                    >
                      <td>
                        <button
                          type="button"
                          className="font-medium hover:underline"
                          onClick={() => setProgram(row.name)}
                        >
                          {row.name}
                        </button>
                      </td>
                      <td className="text-right tabular-nums">
                        {row.envelope == null ? "—" : Math.round(row.envelope).toLocaleString()}
                      </td>
                      <td className="text-right tabular-nums">
                        {Math.round(row.approved).toLocaleString()}
                      </td>
                      <td
                        className={`text-right tabular-nums ${
                          row.status.overBy > 0 ? "text-red-600" : ""
                        }`}
                      >
                        {row.status.constrained
                          ? Math.round(row.status.remaining).toLocaleString()
                          : "—"}
                      </td>
                      <td>
                        {row.status.constrained ? (
                          <RagChip
                            rag={row.status.rag === "none" ? "Green" : row.status.rag}
                            explain={explainRag({
                              rag: row.status.rag === "none" ? "Green" : row.status.rag,
                              extraBullets: [
                                `Program envelope ${money(row.status.envelope)} under ${saKey}.`,
                                `Child project approved funding ${money(row.status.allocated)}.`,
                              ],
                            })}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Choose a Strategic Alignment to see and set its envelope, then allocate to programs
          inside it.
        </p>
      )}
    </SectionFrame>
  );
}
