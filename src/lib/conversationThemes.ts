import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ConversationTheme, WordCloudEntry } from "@/lib/database.types";

const STALE_AFTER_MS = 12 * 60 * 60 * 1000; // 12 hours

type ThemeDef = { name: string; keywords: string[] };

// Deliberately NOT the same taxonomy commentCategorizer.ts uses for
// individual YouTube comments (that one clusters by topic — visuals vs
// sound vs lyrics). This one characterizes the overall conversation's
// tone/subject matter across Wikipedia, YouTube, and press coverage
// combined — broader "vibe" buckets rather than specific discussion
// topics. Deliberately not Gemini-based either, so it costs nothing and
// never depends on the daily quota. Keywords stay away from generic
// structural phrases ("music video", "sounds like") that describe format
// rather than an actual theme. No dynamic per-artist "release buzz" theme
// here anymore — it just became a near-empty, hard-to-interpret bucket
// ("<project title> buzz") on artists with little actual album chatter.
// Colors live in conversationThemeColors.ts (name -> color only), kept
// separate so the client-side chart component doesn't need this file's
// server-only Supabase import just to look up a color.
const BASE_THEMES: ThemeDef[] = [
  {
    name: "Nostalgia",
    keywords: [
      "nostalgia", "nostalgic", "throwback", "takes me back", "old school", "remember when",
      "childhood", "brings back memories", "back in the day", "growing up", "years ago",
      "early career", "debut era", "day one fan",
    ],
  },
  {
    name: "Musical",
    keywords: [
      "production", "instrumental", "melody", "melodies", "vocals", "songwriting", "composition",
      "arrangement", "sound design", "sonics", "mixing", "mastering", "genre", "harmonies",
      "musicality", "chord progression", "vocal performance",
    ],
  },
  {
    name: "Icon",
    keywords: [
      "icon", "iconic", "legend", "legendary", "goat", "greatest of all time", "generational talent",
      "legacy", "trailblazer", "pioneer", "influential artist", "cultural icon", "pop icon",
    ],
  },
  {
    name: "Emotional",
    keywords: [
      "emotional", "cried", "crying", "heartbroken", "healing", "therapeutic", "relate to this",
      "touched me", "moved me", "vulnerable", "raw emotion", "brought me to tears", "comfort",
    ],
  },
  {
    name: "Hype & Anticipation",
    keywords: [
      "can't wait", "cant wait", "hype", "anticipation", "so excited", "counting down",
      "coming soon", "next era", "finally here", "been waiting", "so hyped",
    ],
  },
  {
    name: "Criticism",
    keywords: [
      "overrated", "disappointing", "disappointed", "flop", "boring", "worst", "let down",
      "backlash", "controversy", "criticized", "criticised", "polarizing", "divisive",
    ],
  },
  {
    name: "Cultural",
    keywords: [
      "cultural impact", "influence on", "generation", "zeitgeist", "representation", "cultural moment",
      "movement", "impact on culture", "shaped a generation", "defined a generation", "pop culture",
    ],
  },
  {
    name: "Discovery",
    keywords: [
      "just found", "new fan", "first time hearing", "discovered this artist", "algorithm brought me",
      "randomly found", "just discovered", "getting into", "new to her music", "new to his music",
      "new to their music", "never heard of",
    ],
  },
  {
    name: "Humour",
    keywords: ["lol", "lmao", "hilarious", "so funny", "comedic", "meme", "😂", "💀", "the joke"],
  },
];

function keywordHits(lowerText: string, keywords: string[]): boolean {
  return keywords.some((k) => lowerText.includes(k));
}

/** Up to `max` distinct-enough excerpts from the snippets that matched a
 * theme, so "Criticism" (etc.) shows what people are actually saying
 * instead of just an abstract bucket count — deduped on their first ~60
 * characters since near-duplicate comments are common ("this flopped so
 * hard", "ngl this flopped"), and trimmed to a readable quote length. */
function pickExamples(matches: string[], max = 3): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of matches) {
    const text = raw.trim();
    if (!text) continue;
    const key = text.slice(0, 60).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text.length > 220 ? `${text.slice(0, 220)}…` : text);
    if (out.length >= max) break;
  }
  return out;
}

/** Scores combined free text against the fixed theme taxonomy. `count` is
 * the number of distinct snippets that matched (not raw keyword-occurrence
 * count) — a single comment hitting two keywords is still one instance of
 * that theme in the conversation, which is what the UI's "% of discussion"
 * framing needs as its denominator. Only themes that matched anything are
 * returned, ranked highest first. */
export function scoreConversationThemes(snippets: string[]): ConversationTheme[] {
  const cleaned = snippets.map((s) => s.trim()).filter(Boolean);

  return BASE_THEMES.map((theme) => {
    const matches = cleaned.filter((s) => keywordHits(s.toLowerCase(), theme.keywords));
    if (!matches.length) return null;
    return { name: theme.name, count: matches.length, examples: pickExamples(matches) };
  })
    .filter((t): t is ConversationTheme => t !== null)
    .sort((a, b) => b.count - a.count);
}

// Common English function words, plus a few filler words that show up
// constantly in comments/press copy without meaning anything on their own
// ("like", "just", "really") — filtered out of both the unigram and phrase
// word-cloud counts so the cloud reads as actual subject matter.
const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "your", "with", "this", "that", "was", "were",
  "have", "has", "had", "from", "they", "them", "their", "what", "when", "where", "who", "will",
  "would", "could", "should", "can", "just", "like", "really", "very", "much", "more", "most",
  "some", "such", "than", "then", "there", "here", "into", "out", "about", "over", "under", "also",
  "its", "it's", "his", "her", "she", "him", "our", "ours", "all", "any", "one", "two", "get", "got",
  "these", "those", "being", "been", "does", "did", "doing", "off", "own", "same", "too", "only",
  "now", "how", "why", "because", "while", "still", "even", "back", "make", "makes", "made", "way",
  "know", "think", "going", "come", "came", "actually", "literally", "song", "songs", "video",
  "videos", "music", "artist", "album", "track",
]);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z']+/g) ?? []).filter((w) => w.length > 2);
}

/** Ranks the most frequent words AND short phrases (2-3 word n-grams)
 * across all the same snippets the themes are scored from, for the Social
 * listening word cloud. Phrases are skipped if they start or end on a
 * stopword ("of the", "the new") since those read as sentence fragments
 * rather than an actual recurring phrase. Words need >=2 occurrences to
 * appear at all — a corpus this size will otherwise be dominated by
 * one-off words that just happened to show up in a single comment. The
 * artist's own name is excluded too — of course it's the most frequent
 * thing in a corpus that's entirely about them, but that tells you nothing
 * the way an actual recurring word or phrase does. */
export function extractWordCloud(snippets: string[], artistName: string, max = 50): WordCloudEntry[] {
  const nameTokens = new Set(tokenize(artistName));
  const unigramCounts = new Map<string, number>();
  const phraseCounts = new Map<string, number>();

  for (const snippet of snippets) {
    const tokens = tokenize(snippet);
    for (const token of tokens) {
      if (STOPWORDS.has(token) || nameTokens.has(token)) continue;
      unigramCounts.set(token, (unigramCounts.get(token) ?? 0) + 1);
    }
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i + n <= tokens.length; i++) {
        const gram = tokens.slice(i, i + n);
        if (STOPWORDS.has(gram[0]) || STOPWORDS.has(gram[gram.length - 1])) continue;
        if (gram.some((word) => nameTokens.has(word))) continue;
        const phrase = gram.join(" ");
        phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
      }
    }
  }

  const entries: WordCloudEntry[] = [
    ...[...phraseCounts.entries()]
      .filter(([, count]) => count >= 2)
      .map(([text, count]) => ({ text, count })),
    ...[...unigramCounts.entries()]
      .filter(([, count]) => count >= 2)
      .map(([text, count]) => ({ text, count })),
  ];

  return entries.sort((a, b) => b.count - a.count).slice(0, max);
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
 * comment text (from social_comment_map), press coverage (title + excerpt
 * from media_articles), and Genius lyric annotations (fragment + fan
 * commentary from genius_annotations) — and scores it against the theme
 * taxonomy above, plus a word/phrase-frequency cloud from the same corpus.
 * Depends on those tables already being populated, so this should run
 * after the refreshes that fill them (see refreshEverything). */
export async function refreshConversationThemesForArtist(
  artistId: string,
  artistName: string
): Promise<{ themes: ConversationTheme[]; wordCloud: WordCloudEntry[] }> {
  const supabase = createServiceRoleClient();

  const [{ data: wikiRow }, { data: commentRow }, { data: articles }, { data: geniusRow }] =
    await Promise.all([
      supabase.from("wikipedia_trends").select("articles").eq("artist_id", artistId).maybeSingle(),
      supabase.from("social_comment_map").select("categories").eq("artist_id", artistId).maybeSingle(),
      supabase.from("media_articles").select("title, excerpt").eq("artist_id", artistId).limit(60),
      supabase.from("genius_annotations").select("annotations").eq("artist_id", artistId).maybeSingle(),
    ]);

  const wikiTitles = (wikiRow?.articles ?? []).map((a) => a.title);
  const wikiExtracts = await Promise.all(wikiTitles.map(fetchWikipediaExtract));

  const commentTexts = (commentRow?.categories ?? []).flatMap((c) =>
    c.subcategories.flatMap((s) => s.comments.map((cm) => cm.text))
  );

  const articleTexts = (articles ?? []).flatMap((a) => [a.title, a.excerpt]);

  const geniusTexts = (geniusRow?.annotations ?? []).flatMap((a) => [a.fragment, a.annotation]);

  const snippets = [...wikiExtracts, ...commentTexts, ...articleTexts, ...geniusTexts].filter(Boolean);

  const themes = scoreConversationThemes(snippets);
  const wordCloud = extractWordCloud(snippets, artistName);

  const { error } = await supabase.from("conversation_themes").upsert({
    artist_id: artistId,
    themes,
    word_cloud: wordCloud,
    computed_at: new Date().toISOString(),
  });
  if (error) throw new Error(`conversation_themes upsert failed: ${error.message}`);

  return { themes, wordCloud };
}

export async function refreshConversationThemesIfStale(artistId: string, artistName: string) {
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
    await refreshConversationThemesForArtist(artistId, artistName);
  } catch (err) {
    console.error(`refreshConversationThemesIfStale failed for artist ${artistId}:`, err);
  }
}
