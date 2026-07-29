import ExcelJS from "exceljs";
import { createServiceRoleClient } from "@/lib/supabase/server";

export type ParsedRow = {
  category: string | null;
  statement: string;
  segment: string;
  universe: number | null;
  responses: number | null;
  column_pct: number | null;
  row_pct: number | null;
  index_value: number | null;
};

// GWI-style exports use varying header wording depending on the export
// template — match a handful of common synonyms per field rather than one
// exact name.
const HEADER_SYNONYMS: Record<keyof ParsedRow, string[]> = {
  category: ["category", "topic", "section"],
  statement: ["statement", "question", "attribute", "attitude"],
  segment: ["segment", "audience", "base", "group"],
  universe: ["universe", "universeestimate", "population"],
  responses: ["responses", "sample", "n", "respondents"],
  column_pct: ["columnpct", "column", "colpct", "verticalpct"],
  row_pct: ["rowpct", "row", "horizontalpct"],
  index_value: ["index", "indexvalue", "affinityindex"],
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[%,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export type ParseResult =
  | { ok: true; rows: ParsedRow[]; headersFound: string[] }
  | { ok: false; error: string; headersFound: string[] };

/** Parses an uploaded audience research export (CSV or XLSX) into rows
 * matching the audience_statements table. Column matching is fuzzy (see
 * HEADER_SYNONYMS) since GWI-style exports vary in exact header wording. */
export async function parseAudienceFile(
  buffer: ArrayBuffer,
  filename: string
): Promise<ParseResult> {
  if (/\.csv$/i.test(filename)) {
    const text = Buffer.from(buffer).toString("utf-8");
    return parseDelimitedText(text);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return { ok: false, error: "The file has no readable sheet.", headersFound: [] };

  const rows: unknown[][] = [];
  worksheet.eachRow((row) => {
    // ExcelJS's row.values is 1-indexed (values[0] is always empty) — drop
    // that leading slot so column indices line up with the CSV path below.
    rows.push((row.values as unknown[]).slice(1));
  });

  return rowsToStatements(rows);
}

/** Hand-rolled CSV parser (no embedded commas/quotes support) — simpler and
 * more predictable here than exceljs's CSV reader, which expects a stream
 * rather than an in-memory buffer. Covers the common case for these exports. */
function parseDelimitedText(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows = lines.map((line) => line.split(","));
  return rowsToStatements(rows);
}

function rowsToStatements(rows: unknown[][]): ParseResult {
  if (rows.length < 2) {
    return {
      ok: false,
      error: "The file needs a header row plus at least one data row.",
      headersFound: [],
    };
  }

  const headerRow = rows[0].map((h) => String(h ?? "").trim());
  const headersFound = headerRow.filter(Boolean);

  const columnIndex: Partial<Record<keyof ParsedRow, number>> = {};
  headerRow.forEach((header, i) => {
    const normalized = normalizeHeader(header);
    for (const [field, synonyms] of Object.entries(HEADER_SYNONYMS) as [keyof ParsedRow, string[]][]) {
      if (columnIndex[field] === undefined && synonyms.includes(normalized)) {
        columnIndex[field] = i;
      }
    }
  });

  if (columnIndex.statement === undefined || columnIndex.segment === undefined) {
    return {
      ok: false,
      error:
        `Couldn't find "statement" and "segment" columns — found headers: ${headersFound.join(", ") || "(none)"}. ` +
        'Rename the relevant columns to include the words "statement" and "segment" (or "audience").',
      headersFound,
    };
  }

  const parsed: ParsedRow[] = [];
  for (const row of rows.slice(1)) {
    const statement = String(row[columnIndex.statement] ?? "").trim();
    const segment = String(row[columnIndex.segment] ?? "").trim();
    if (!statement || !segment) continue;

    parsed.push({
      category:
        columnIndex.category !== undefined ? String(row[columnIndex.category] ?? "").trim() || null : null,
      statement,
      segment,
      universe: columnIndex.universe !== undefined ? toNumber(row[columnIndex.universe]) : null,
      responses: columnIndex.responses !== undefined ? toNumber(row[columnIndex.responses]) : null,
      column_pct: columnIndex.column_pct !== undefined ? toNumber(row[columnIndex.column_pct]) : null,
      row_pct: columnIndex.row_pct !== undefined ? toNumber(row[columnIndex.row_pct]) : null,
      index_value: columnIndex.index_value !== undefined ? toNumber(row[columnIndex.index_value]) : null,
    });
  }

  if (!parsed.length) {
    return { ok: false, error: "No data rows had both a statement and a segment value.", headersFound };
  }

  return { ok: true, rows: parsed, headersFound };
}

export async function storeAudienceUpload(
  artistId: string,
  filename: string,
  rows: ParsedRow[]
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const supabase = createServiceRoleClient();

  const { data: upload, error: uploadError } = await supabase
    .from("audience_uploads")
    .insert({ artist_id: artistId, filename })
    .select()
    .single();

  if (uploadError) return { ok: false, error: uploadError.message };

  const { error: statementsError } = await supabase
    .from("audience_statements")
    .insert(rows.map((row) => ({ ...row, artist_id: artistId, upload_id: upload.id })));

  if (statementsError) return { ok: false, error: statementsError.message };
  return { ok: true, count: rows.length };
}
