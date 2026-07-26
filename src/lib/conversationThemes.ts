import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ConversationTheme } from "@/lib/database.types";

const STALE_AFTER_MS = 12 * 60 * 60 * 1000; // 12 hours

type ThemeDef = { name: string; color: string; keywords: string[] };

// Deliberately NOT the same taxonomy commentCategorizer.ts uses for
// individual YouTube comments (that one clusters by topic — visuals vs
// sound vs lyrics). This one characterizes the overall conversation's
// tone/subject matter across Wikipedia, YouTube, and press coverage
// combined — broader "vibe" buckets rather than specific discussion
// topics. Deliberately not Gemini-based either, so it costs nothing and
// never depends on the daily quota. Keywords stay away from generic
// structural phrases ("music video", "sounds like") that describe format
// rather than an actual theme.
const BASE_THEMES: ThemeDef[] = [
  {
    name: "Nostalgia",
    color: "#a78bfa",
    keywords: [
      "nostalgia", "nostalgic", "throwback", "takes me back", "old school", "remember when",
      "childhood", "brings back memories", "back in the day", "growing up", "years ago",
      "early career", "debut era", "day one fan",
    ],
  },
  {
    name: "Musical",
    color: "#2dd4bf",
    keywords: [
      "production", "instrumental", "melody", "melodies", "vocals", "songwriting", "composition",
      "arrangement", "sound design", "sonics", "mixing", "mastering", "genre", "harmonies",
      "musicality", "chord progression", "vocal performance",
    ],
  },
  {
    name: "Icon",
    color: "#facc15",
    keywords: [
      "icon", "iconic", "legend", "legendary", "goat", "greatest of all time", "generational talent",
      "legacy", "trailblazer", "pioneer", "influential artist", "cultural icon", "pop icon",
    ],
  },
  {
    name: "Emotional",
    color: "#f472b6",
    keywords: [
      "emotional", "cried", "crying", "heartbroken", "healing", "therapeutic", "relate to this",
      "touched me", "moved me", "vulnerable", "raw emotion", "brought me to tears", "comfort",
    ],
  },
  {
    name: "Hype & Anticipation",
    color: "#34d399",
    keywords: [
      "can't wait", "cant wait", "hype", "anticipation", "so excited", "counting down",
      "coming soon", "next era", "finally here", "been waiting", "so hyped",
    ],
  },
  {
    name: "Criticism",
    color: "#9ca3af",
    keywords: [
      "overrated", "disappointing", "disappointed", "flop", "boring", "worst", "let down",
      "backlash", "controversy", "criticized", "criticised", "polarizing", "divisive",
    ],
  },
  {
    name: "Cultural",
    color: "#60a5fa",
    keywords: [
      "cultural impact", "influence on", "generation", "zeitgeist", "representation", "cultural moment",
      "movement", "impact on culture", "shaped a generation", "defined a generation", "pop culture",
    ],
  },
  {
    name: "Discovery",
    color: "#22d3ee",
    keywords: [
      "just found", "new fan", "first time hearing", "discovered this artist", "algorithm brought me",
      "randomly found", "just discovered", "getting into", "new to her music", "new to his music",
      "new to their music", "never heard of",
    ],
  },
  {
    name: "Humour",
    color: "#38bdf8",
    keywords: ["lol", "lmao", "hilarious", "so funny", "comedic", "meme", "😂", "💀", "the joke"],
  },
];

const RELEASE_COLOR = "#fb923c";

function countHits(lowerText: string, keywords: string[]): number {
  let hits = 0;
  for (const keyword of keywords) {
    if (lowerText.includes(keyword)) hits += 1;
  }
  return hits;
}

/** Scores combined free text against the fixed theme taxonomy plus one
 * dynamic release-specific theme folded in per artist (their actual
 * project/album name can't be a fixed keyword list the way the others
 * are). Only themes that actually matched anything are returned, ranked
 * highest first — matching the reference "Conversation themes" bar chart,
 * which only shows themes genuinely present in the data. */
export function scoreConversationThemes(
  snippets: string[],
  releaseTheme: { name: string; keywords: string[] } | null
): ConversationTheme[] {
  const combined = ` ${snippets.join(" \n ").toLowerCase()} `;
  const themes: ThemeDef[] = releaseTheme
    ? [...BASE_THEMES, { name: releaseTheme.name, color: RELEASE_COLOR, keywords: releaseTheme.keywords }]
    : BASE_THEMES;

  return themes
    .map((t) => ({ name: t.name, count: countHits(combined, t.keywords) }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function colorForTheme(name: string): string {
  return BASE_THEMES.find((t) => t.name === name)?.color ?? RELEASE_COLOR;
}

type WikiSummary = { extract?: string };

/** Wikipedia's REST summary endpoint returns a plain-text intro paragraph —
 * free, keyless, no rate limit worth worrying about for a handful of
 * already-resolved titles. */
async function fetchWikipediaExtract(title: string): Promise<string> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      { headers: { "User-Agent": "websitegenerator:cultural-intelligence:v1.0" } }
    );
    if (!res.ok) return "";
    const data: WikiSummary = await res.json();
    return data.extract ?? "";
  } catch {
    return "";
  }
}

/** Pulls together everything already fetched for this artist elsewhere —
 * Wikipedia article extracts (titles from wikipedia_trends), YouTube
 * comment text (from social_comment_map), and press coverage (title +
 * excerpt from media_articles) — and scores it against the theme taxonomy
 * above. Depends on those three tables already being populated, so this
 * should run after the refreshes that fill them (see refreshEverything). */
export async function refreshConversationThemesForArtist(
  artistId: string,
  projectTitle: string | null
): Promise<ConversationTheme[]> {
  const supabase = createServiceRoleClient();

  const [{ data: wikiRow }, { data: commentRow }, { data: articles }] = await Promise.all([
    supabase.from("wikipedia_trends").select("articles").eq("artist_id", artistId).maybeSingle(),
    supabase.from("social_comment_map").select("categories").eq("artist_id", artistId).maybeSingle(),
    supabase.from("media_articles").select("title, excerpt").eq("artist_id", artistId).limit(60),
  ]);

  const wikiTitles = (wikiRow?.articles ?? []).map((a) => a.title);
  const wikiExtracts = await Promise.all(wikiTitles.map(fetchWikipediaExtract));

  const commentTexts = (commentRow?.categories ?? []).flatMap((c) =>
    c.subcategories.flatMap((s) => s.comments.map((cm) => cm.text))
  );

  const articleTexts = (articles ?? []).flatMap((a) => [a.title, a.excerpt]);

  const snippets = [...wikiExtracts, ...commentTexts, ...articleTexts].filter(Boolean);

  const releaseTheme = projectTitle?.trim()
    ? {
        name: `${projectTitle.trim()} buzz`,
        keywords: [projectTitle.trim().toLowerCase(), "new album", "new era", "new music", "album drop"],
      }
    : { name: "New release buzz", keywords: ["new album", "new era", "new music", "album drop"] };

  const themes = scoreConversationThemes(snippets, releaseTheme);

  const { error } = await supabase.from("conversation_themes").upsert({
    artist_id: artistId,
    themes,
    computed_at: new Date().toISOString(),
  });
  if (error) throw new Error(`conversation_themes upsert failed: ${error.message}`);

  return themes;
}

export async function refreshConversationThemesIfStale(artistId: string, projectTitle: string | null) {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("conversation_themes")
    .select("computed_at")
    .eq("artist_id", artistId)
    .maybeSingle();

  const isStale =
    !data?.computed_at || Date.now() - new Date(data.computed_at).getTime() > STALE_AFTER_MS;
  if (!isStale) return;

  try {
    await refreshConversationThemesForArtist(artistId, projectTitle);
  } catch (err) {
    console.error(`refreshConversationThemesIfStale failed for artist ${artistId}:`, err);
  }
}
