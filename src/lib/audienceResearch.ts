import { Type } from "@google/genai";
import { generateContentThrottled } from "@/lib/gemini";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { storeAudienceUpload, type ParsedRow } from "@/lib/audience";

const AUDIENCE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    found: { type: Type.BOOLEAN },
    statements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          segment: { type: Type.STRING },
          statement: { type: Type.STRING },
        },
        required: ["segment", "statement"],
      },
    },
  },
  required: ["found", "statements"],
};

type ExtractedStatement = { segment?: string; statement?: string };

function safeParseJson(text: string | undefined): Record<string, unknown> {
  try {
    return JSON.parse(text ?? "{}");
  } catch {
    return {};
  }
}

/** One-time Gemini web-search pass for publicly published audience/
 * demographic research — age range, gender split, top countries/cities,
 * listening-platform habits, superfan traits, overlap with other artists'
 * fanbases — the kind of thing that shows up in Spotify for Artists case
 * studies, Chartmetric/Luminate press coverage, YouGov panels, or
 * interviews, for artists with enough public profile for that to exist.
 * Same two-step search-then-extract shape as fetchWebMentionsViaGemini
 * (socialListening.ts) and events.ts's tour-date discovery: a free-text
 * research pass grounded in real search results, then structured
 * extraction from that — same honesty requirement too: cite the real
 * source inline for every statement, and report found: false rather than
 * inventing numbers for a niche artist nobody's published this kind of
 * research on. */
export async function researchAudienceViaGemini(artistName: string): Promise<ParsedRow[]> {
  const searchRes = await generateContentThrottled({
    model: "gemini-2.5-flash-lite",
    contents:
      `Search the web for genuinely published audience/demographic research about the musical ` +
      `artist "${artistName}" — age range, gender split, top countries/cities, listening platform ` +
      "habits, superfan traits, or overlap with other artists' fanbases. Look for things like " +
      "Spotify for Artists case studies, Chartmetric or Luminate coverage, YouGov BrandIndex data, " +
      "press interviews citing real numbers, or similar published sources — not general bio/career " +
      "facts. For each finding, note the specific number/insight and exactly where it came from " +
      "(publication name, and year if given). If this artist doesn't have enough public profile for " +
      "this kind of research to exist, say so plainly rather than guessing or inventing numbers.",
    config: { tools: [{ googleSearch: {} }] },
  });
  const digest = searchRes.text ?? "";
  if (!digest.trim()) return [];

  const extractRes = await generateContentThrottled({
    model: "gemini-2.5-flash-lite",
    contents:
      "Extract genuine audience/demographic findings from this research into structured data. Each " +
      "statement should read as a standalone fact and end with its source in parentheses, e.g. " +
      '"58% of listeners are aged 18-24 (Spotify for Artists, 2024)." Segment is a short label for ' +
      'what kind of finding it is (e.g. "Age", "Gender", "Location", "Platform", "Superfans"). Set ' +
      "found to false and return no statements if the research above didn't turn up real published " +
      `data — don't invent anything to fill the gap.\n\nResearch:\n${digest}`,
    config: { responseMimeType: "application/json", responseSchema: AUDIENCE_SCHEMA },
  });

  const parsed = safeParseJson(extractRes.text);
  if (!parsed.found) return [];
  const extracted: ExtractedStatement[] = Array.isArray(parsed.statements)
    ? (parsed.statements as ExtractedStatement[])
    : [];

  return extracted
    .filter((s): s is Required<ExtractedStatement> => !!s.statement?.trim() && !!s.segment?.trim())
    .map((s) => ({
      category: "Audience research (AI-researched)",
      statement: s.statement.trim(),
      segment: s.segment.trim(),
      universe: null,
      responses: null,
      column_pct: null,
      row_pct: null,
      index_value: null,
    }));
}

/** Runs the research above and stores it exactly once per artist — skips
 * entirely if any audience_statements already exist (a real upload, or a
 * previous run of this same research), so it never overwrites real data or
 * re-spends Gemini calls on every refresh. When nothing publicly findable
 * turns up (a niche artist), stores nothing and leaves the Audience tab's
 * existing empty state exactly as is. */
export async function provisionAudienceResearchIfEmpty(artistId: string, artistName: string): Promise<number> {
  const supabase = createServiceRoleClient();
  const { count } = await supabase
    .from("audience_statements")
    .select("*", { count: "exact", head: true })
    .eq("artist_id", artistId);
  if ((count ?? 0) > 0) return 0;

  const rows = await researchAudienceViaGemini(artistName);
  if (!rows.length) return 0;

  const stored = await storeAudienceUpload(artistId, "AI-researched audience data (Gemini)", rows);
  if (!stored.ok) throw new Error(stored.error);
  return stored.count;
}
