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
 * matching the audience_statements table. Two shapes are understood: GWI's
 * actual raw "Crosstab Export" download (see findCrosstabHeader/
 * parseCrosstabExport below — detected first, since it has a distinctive
 * Name/Metric header pair rather than a flat header row) and a simpler flat
 * spreadsheet with one row per statement, whose column matching is fuzzy
 * (see HEADER_SYNONYMS) since hand-simplified exports vary in exact header
 * wording. */
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

type NumericParsedField = "universe" | "responses" | "column_pct" | "row_pct" | "index_value";

const CROSSTAB_METRIC_FIELD: Record<string, NumericParsedField> = {
  universe: "universe",
  responses: "responses",
  "column %": "column_pct",
  "row %": "row_pct",
  index: "index_value",
};

/** GWI's raw "Crosstab Export" download (as opposed to a hand-simplified
 * CSV) isn't a flat table at all — it opens with a metadata preamble
 * (Source/Base/Countries/Waves/Export date), then a two-row header where
 * one column is literally "Name" immediately followed by "Metric", and
 * every (category, statement) pair spans five data rows — Universe,
 * Responses, Column %, Row %, Index — one column per audience plus a
 * leading "Totals" (baseline population) column. Detecting that exact
 * "Name" → "Metric" adjacency, wherever it falls in the first ~40 rows,
 * is what tells a real crosstab export apart from the flat single-header-row
 * shape the rest of this file expects. */
function findCrosstabHeader(rows: unknown[][]): { headerRowIndex: number; nameCol: number; metricCol: number } | null {
  const scanLimit = Math.min(rows.length, 40);
  for (let r = 0; r < scanLimit; r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < row.length - 1; c++) {
      if (String(row[c] ?? "").trim() === "Name" && String(row[c + 1] ?? "").trim() === "Metric") {
        return { headerRowIndex: r, nameCol: c, metricCol: c + 1 };
      }
    }
  }
  return null;
}

/** GWI's crosstab cells store Column %/Row % as raw fractions (0.516, not
 * "51.6" or "51.6%") since they're plain numeric cells formatted as a
 * percentage by Excel — a display-only formatting layer this parser never
 * sees. A cell that already arrives as a "51.6%" string (e.g. from a CSV
 * export of the same crosstab) is left alone; only bare numbers get scaled,
 * since Column %/Row % are mathematically bounded to [0,1] as fractions. */
function toPercentValue(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "string" && raw.includes("%")) {
    const n = Number(raw.replace(/[%,]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  const n = toNumber(raw);
  return n === null ? null : n * 100;
}

function parseCrosstabExport(
  rows: unknown[][],
  header: { headerRowIndex: number; nameCol: number; metricCol: number }
): ParseResult {
  const { headerRowIndex, nameCol, metricCol } = header;
  const categoryCol = nameCol - 1;
  const headerRow = rows[headerRowIndex];

  // Column immediately after "Metric" is always the "Totals" baseline
  // population — every real audience column GWI defines comes after it.
  const segmentCols: { col: number; name: string }[] = [];
  for (let c = metricCol + 2; c < headerRow.length; c++) {
    const name = String(headerRow[c] ?? "").trim();
    if (name) segmentCols.push({ col: c, name });
  }

  if (!segmentCols.length) {
    return {
      ok: false,
      error:
        "This looks like a GWI crosstab export, but it only has the \"Totals\" baseline column — " +
        "add at least one audience to the crosstab in GWI before exporting.",
      headersFound: ["Name", "Metric", "Totals"],
    };
  }

  const parsed: ParsedRow[] = [];
  let currentCategory: string | null = null;
  let currentStatement: string | null = null;
  let accum: Record<string, Partial<ParsedRow>> = {};

  function flush() {
    if (currentStatement && currentStatement !== "Totals") {
      for (const seg of segmentCols) {
        const acc = accum[seg.name];
        if (!acc) continue;
        parsed.push({
          category: currentCategory,
          statement: currentStatement,
          segment: seg.name,
          universe: acc.universe ?? null,
          responses: acc.responses ?? null,
          column_pct: acc.column_pct ?? null,
          row_pct: acc.row_pct ?? null,
          index_value: acc.index_value ?? null,
        });
      }
    }
    accum = {};
  }

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    const rawCategory = String(row[categoryCol] ?? "").trim();
    const rawName = String(row[nameCol] ?? "").trim();
    const rawMetric = String(row[metricCol] ?? "")
      .trim()
      .toLowerCase();

    if (rawName) {
      flush();
      currentStatement = rawName;
    }
    if (rawCategory) currentCategory = rawCategory;

    const field = CROSSTAB_METRIC_FIELD[rawMetric];
    if (!field) continue;

    for (const seg of segmentCols) {
      const value = field === "column_pct" || field === "row_pct" ? toPercentValue(row[seg.col]) : toNumber(row[seg.col]);
      if (value === null) continue;
      if (!accum[seg.name]) accum[seg.name] = {};
      accum[seg.name][field] = value;
    }
  }
  flush();

  // Trim the redundant "(Category)" suffix GWI appends to every statement
  // name, now that both live in the file separately.
  for (const row of parsed) {
    const suffix = row.category ? `(${row.category})` : null;
    if (suffix && row.statement.endsWith(suffix)) {
      row.statement = row.statement.slice(0, row.statement.length - suffix.length).trimEnd();
    }
  }

  if (!parsed.length) {
    return {
      ok: false,
      error: "Found a GWI crosstab shape, but no usable statement rows under it.",
      headersFound: ["Name", "Metric", ...segmentCols.map((s) => s.name)],
    };
  }

  return { ok: true, rows: parsed, headersFound: ["Name", "Metric", "Totals", ...segmentCols.map((s) => s.name)] };
}

function rowsToStatements(rows: unknown[][]): ParseResult {
  const crosstabHeader = findCrosstabHeader(rows);
  if (crosstabHeader) return parseCrosstabExport(rows, crosstabHeader);

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

/** Every upload adds to the existing set of statements rather than replacing
 * it (see storeAudienceUpload) — useful for combining a few small exports,
 * but with no way to see what's already been imported, re-uploading a
 * corrected file (or the wrong file) just keeps piling on top of what's
 * already there instead of replacing it. This lists each upload's filename,
 * date, and how many statements it contributed, so the builder can show
 * that and offer a way to remove one. */
export async function listAudienceUploads(
  artistId: string
): Promise<{ id: string; filename: string; uploadedAt: string; count: number }[]> {
  const supabase = createServiceRoleClient();
  const { data: uploads } = await supabase
    .from("audience_uploads")
    .select("id, filename, uploaded_at")
    .eq("artist_id", artistId)
    .order("uploaded_at", { ascending: false });
  if (!uploads?.length) return [];

  return Promise.all(
    uploads.map(async (u) => {
      const { count } = await supabase
        .from("audience_statements")
        .select("id", { count: "exact", head: true })
        .eq("upload_id", u.id);
      return { id: u.id, filename: u.filename, uploadedAt: u.uploaded_at, count: count ?? 0 };
    })
  );
}

/** Deleting the audience_uploads row cascades to every audience_statements
 * row it contributed (see migrations/001_init.sql) — nothing else to clean
 * up here. Scoped by artist_id as well as id so one artist's upload id
 * can't be used to delete another's. */
export async function deleteAudienceUpload(
  uploadId: string,
  artistId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("audience_uploads")
    .delete()
    .eq("id", uploadId)
    .eq("artist_id", artistId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
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
