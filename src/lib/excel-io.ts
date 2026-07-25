/**
 * Excel read/write via maintained packages (replaces vulnerable `xlsx`).
 * - write-excel-file/browser
 * - read-excel-file/browser
 */
import writeXlsxFile, { type CellObject, type SheetData } from "write-excel-file/browser";
import readXlsxFile, { readSheet } from "read-excel-file/browser";

type Dict = Record<string, unknown>;

function toValue(value: unknown): string | number | boolean | Date {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value;
  return String(value);
}

/** Cell value wrapper for write-excel-file row arrays. */
function cells(values: unknown[]): CellObject[] {
  return values.map((value) => ({ value: toValue(value) }));
}

async function downloadWorkbook(
  sheets: Array<{ sheet: string; data: SheetData }>,
  fileName: string,
) {
  await writeXlsxFile(sheets).toFile(fileName);
}

/** Write a multi-sheet workbook from object rows per sheet. */
export async function writeObjectSheets(
  sheets: Array<{ name: string; headers: string[]; rows: Dict[] }>,
  fileName: string,
) {
  const payload = sheets.map((s) => {
    const body = s.rows.map((row) => cells(s.headers.map((h) => row[h] ?? "")));
    return {
      sheet: s.name.slice(0, 31),
      data: [cells(s.headers), ...body] as SheetData,
    };
  });
  await downloadWorkbook(payload, fileName);
}

/** Write README-style two-column rows + additional object sheets. */
export async function writeReadmeAndSheets(
  readmePairs: Array<[string, string]>,
  sheets: Array<{ name: string; headers: string[]; rows: Dict[] }>,
  fileName: string,
) {
  const readmeData = readmePairs.map(([a, b]) => cells([a, b])) as SheetData;
  const rest = sheets.map((s) => {
    const body = s.rows.map((row) => cells(s.headers.map((h) => row[h] ?? "")));
    return {
      sheet: s.name.slice(0, 31),
      data: [cells(s.headers), ...body] as SheetData,
    };
  });
  await downloadWorkbook([{ sheet: "README", data: readmeData }, ...rest], fileName);
}

export async function listSheetNames(file: File): Promise<string[]> {
  const sheets = await readXlsxFile(file);
  return sheets.map((s) => s.sheet);
}

/** Read a sheet into objects using the first row as headers. */
export async function sheetToObjects(file: File, sheetName: string): Promise<Dict[]> {
  const rows = await readSheet(file, sheetName);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h ?? "").trim());
  const out: Dict[] = [];
  for (let i = 1; i < rows.length; i++) {
    const line = rows[i];
    const obj: Dict = {};
    let any = false;
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      const v = line[c];
      if (v != null && v !== "") any = true;
      obj[key] = v ?? null;
    }
    if (any) out.push(obj);
  }
  return out;
}
