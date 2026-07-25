import type { SocialComment, SocialCommentCategory } from "@/lib/database.types";

type TaxonomyEntry = { name: string; keywords: string[] };
type TaxonomyCategory = { name: string; subcategories: TaxonomyEntry[] };

// A fixed, hand-built taxonomy rather than anything derived per-artist —
// deliberately generic across musical artists (the kinds of things fans
// actually comment about don't vary that much: how it looks, how it
// sounds, what's coming next, how they feel about it, what it reminds them
// of, seeing it live), so this works reasonably out of the box without
// costing a single Gemini request. Keyword lists are intentionally broad
// and lowercase; matching is substring-based so plurals/tenses still hit
// without needing per-form entries.
const TAXONOMY: TaxonomyCategory[] = [
  {
    name: "Visuals & aesthetic",
    subcategories: [
      {
        name: "Music video & visuals",
        keywords: [
          "music video", "visuals", "cinematography", "the video", "video is", "editing", "color grading",
          "colour grading", "art direction", "cover art", "artwork", "album cover", "cgi", "vfx",
        ],
      },
      {
        name: "Style & era",
        keywords: [
          "outfit", "fashion", "styling", "aesthetic", "era", "hair", "makeup", "photoshoot",
          "the look", "her look", "his look", "their look", "wardrobe",
        ],
      },
    ],
  },
  {
    name: "Sound & production",
    subcategories: [
      {
        name: "Production & mixing",
        keywords: [
          "production", "produced", "the beat", "instrumental", " mix ", "mixing", "mastering", "bassline",
          "bass line", "sound design", "synths", "synth", "drums", "the drop", "808",
        ],
      },
      {
        name: "Vocals",
        keywords: [
          "vocals", "her voice", "his voice", "their voice", "singing", "sing", "vocal performance",
          "falsetto", "belting", "vocal range",
        ],
      },
      {
        name: "Lyrics & meaning",
        keywords: [
          "lyrics", "lyric", "the meaning", "relatable", "relate to", "the story", "this verse",
          "the hook", "wordplay", "the bridge", "these lines", "this line",
        ],
      },
    ],
  },
  {
    name: "Future releases",
    subcategories: [
      {
        name: "Unreleased & leaks",
        keywords: [
          "unreleased", "leak", "leaked", "snippet", "demo version", "b-side", "bside", "b side",
          "deluxe", "bonus track", "unreleased song",
        ],
      },
      {
        name: "What's next",
        keywords: [
          "next album", "new album", "next era", "when is the album", "release date", "can't wait for",
          "cant wait for", "hope she drops", "hope they drop", "hope he drops", "new music soon",
        ],
      },
    ],
  },
  {
    name: "Reactions",
    subcategories: [
      {
        name: "Praise",
        keywords: [
          "love this", "i love", "obsessed", "amazing", "masterpiece", "favorite", "favourite",
          "best song", "best album", "iconic", "slay", "goat", "so good", "perfect", "incredible",
          "underrated",
        ],
      },
      {
        name: "Criticism",
        keywords: [
          "overrated", "disappointed", "disappointing", "boring", "mid", "flop", "skip", "worst",
          "not it", "cringe", "annoying", "overproduced",
        ],
      },
    ],
  },
  {
    name: "Nostalgia & comparisons",
    subcategories: [
      {
        name: "Nostalgia",
        keywords: [
          "nostalgia", "nostalgic", "throwback", "reminds me of when", "takes me back", "old school",
          "remember when", "childhood", "brings back memories", "back in the day",
        ],
      },
      {
        name: "Comparisons",
        keywords: [
          "sounds like", "compared to", "better than", "reminds me of", "similar to", " vs ", "versus",
        ],
      },
    ],
  },
  {
    name: "Live & touring",
    subcategories: [
      {
        name: "Concerts & tour",
        keywords: [
          "concert", "the tour", "live performance", "tickets", "front row", "meet and greet",
          "the show was", "saw them live", "saw her live", "saw him live", "at the show",
        ],
      },
    ],
  },
];

const FALLBACK_CATEGORY = "General discussion";
const FALLBACK_SUBCATEGORY = "Uncategorized";

/** Scores every taxonomy subcategory against a comment's text by counting
 * keyword hits, and returns whichever one scored highest — ties keep
 * whatever the taxonomy declared first. Comments matching nothing at all
 * fall back to one flat bucket rather than being dropped, same principle
 * as the Gemini-based categorizer this replaces: never let a categorization
 * miss make a real comment disappear from the UI. */
function classify(text: string): { category: string; subcategory: string } {
  const lower = ` ${text.toLowerCase()} `;
  let best: { category: string; subcategory: string; score: number } | null = null;

  for (const category of TAXONOMY) {
    for (const sub of category.subcategories) {
      let score = 0;
      for (const keyword of sub.keywords) {
        if (lower.includes(keyword)) score += 1;
      }
      if (score > 0 && (!best || score > best.score)) {
        best = { category: category.name, subcategory: sub.name, score };
      }
    }
  }

  return best
    ? { category: best.category, subcategory: best.subcategory }
    : { category: FALLBACK_CATEGORY, subcategory: FALLBACK_SUBCATEGORY };
}

/** Groups comments into the same category -> subcategory -> comments tree
 * shape the zoomable map expects, using local keyword matching instead of
 * a Gemini call — free, instant, and immune to the free-tier daily quota
 * that made the old Gemini-based categorizer unreliable under real use. */
export function categorizeCommentsLocally(comments: SocialComment[]): SocialCommentCategory[] {
  const grouped = new Map<string, Map<string, SocialComment[]>>();

  for (const comment of comments) {
    const { category, subcategory } = classify(comment.text);
    if (!grouped.has(category)) grouped.set(category, new Map());
    const subMap = grouped.get(category)!;
    if (!subMap.has(subcategory)) subMap.set(subcategory, []);
    subMap.get(subcategory)!.push(comment);
  }

  // Keeps the taxonomy's declared order for categories that matched
  // anything, then appends the fallback bucket last if it was used —
  // reads more intentional than whatever order a Map happened to fill in.
  const orderedNames = [...TAXONOMY.map((c) => c.name), FALLBACK_CATEGORY];

  return orderedNames
    .filter((name) => grouped.has(name))
    .map((name) => {
      const subMap = grouped.get(name)!;
      const taxonomyCategory = TAXONOMY.find((c) => c.name === name);
      const subOrder = [...(taxonomyCategory?.subcategories.map((s) => s.name) ?? []), FALLBACK_SUBCATEGORY];
      return {
        name,
        subcategories: subOrder
          .filter((subName) => subMap.has(subName))
          .map((subName) => ({ name: subName, comments: subMap.get(subName)! })),
      };
    });
}
