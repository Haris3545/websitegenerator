import type { SocialComment, SocialCommentCategory } from "@/lib/database.types";

type TaxonomyEntry = { name: string; keywords: string[] };
type TaxonomyCategory = { name: string; subcategories: TaxonomyEntry[] };

// A fixed, hand-built taxonomy rather than anything derived per-artist —
// deliberately generic across musical artists (the kinds of things fans
// actually comment about don't vary that much: how it looks, how it
// sounds, what's coming next, how they feel about it, what it reminds them
// of, seeing it live), so this works reasonably out of the box without
// costing a single Gemini request. Keyword lists lean deliberately broad,
// including common internet-vernacular hype phrases and emoji, so real
// generic praise ("🔥🔥🔥", "she ate", "not me crying") lands in Reactions'
// own "General reactions" bucket instead of the true last-resort fallback —
// keeping that fallback rare rather than the dumping ground it'd otherwise
// become given how much of any real comment section is short, generic hype.
const TAXONOMY: TaxonomyCategory[] = [
  {
    name: "Visuals & aesthetic",
    subcategories: [
      {
        name: "Music video & visuals",
        keywords: [
          "music video", "visuals", "cinematography", "the video", "video is", "editing", "color grading",
          "colour grading", "art direction", "cover art", "artwork", "album cover", "cgi", "vfx",
          "camera work", "the visuals", "video was", "this video",
        ],
      },
      {
        name: "Style & era",
        keywords: [
          "outfit", "fashion", "styling", "aesthetic", "era", "hair", "makeup", "photoshoot",
          "the look", "her look", "his look", "their look", "wardrobe", "styled", "the fits",
          "the fit", "outfits", "glow up",
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
          "bass line", "sound design", "synths", "synth", "drums", "the drop", "808", "the production",
          "beats are", "the instrumental", "arrangement", "the arrangement",
        ],
      },
      {
        name: "Vocals",
        keywords: [
          "vocals", "her voice", "his voice", "their voice", "singing", "sing", "vocal performance",
          "falsetto", "belting", "vocal range", "the vocals", "voice is", "runs are", "vocal runs",
        ],
      },
      {
        name: "Lyrics & meaning",
        keywords: [
          "lyrics", "lyric", "the meaning", "relatable", "relate to", "the story", "this verse",
          "the hook", "wordplay", "the bridge", "these lines", "this line", "the lyricism", "songwriting",
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
          "need more", "give us more", "more music please", "another album",
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
          "underrated", "she ate", "he ate", "they ate", "no because", "the way she", "the way he",
          "the way they", "this is everything", "flawless", "unmatched", "queen", "mother is",
          "album of the year", "song of the year", "on repeat", "can't stop listening",
          "cant stop listening", "been playing this", "instant classic",
        ],
      },
      {
        name: "Criticism",
        keywords: [
          "overrated", "disappointed", "disappointing", "boring", "mid", "flop", "skip", "worst",
          "not it", "cringe", "annoying", "overproduced", "not her best", "not his best", "let down",
          "expected more", "meh",
        ],
      },
      {
        name: "General reactions",
        // A deliberately generous catch-all for the short, non-specific
        // enthusiasm that makes up a large share of any real comment
        // section — not a specific opinion about sound/visuals/lyrics, just
        // pure reaction. Kept last so anything more specific above still
        // wins the scoring in classify().
        keywords: [
          "🔥", "😭", "❤️", "🥹", "💀", "literally", "omg", "wow", "yes ", "im-", "i'm-", "not me",
          "the way i", "im obsessed", "i'm obsessed", "so obsessed", "can't even", "cant even",
          "speechless", "chef's kiss", "chefs kiss", "sobbing", "screaming", "crying",
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
          "remember when", "childhood", "brings back memories", "back in the day", "growing up",
          "old me", "high school", "middle school", "years ago",
        ],
      },
      {
        name: "Comparisons",
        keywords: [
          "sounds like", "compared to", "better than", "reminds me of", "similar to", " vs ", "versus",
          "same energy as",
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
          "the show was", "saw them live", "saw her live", "saw him live", "at the show", "the setlist",
          "opening act", "general admission", "floor tickets",
        ],
      },
    ],
  },
];

// Only reached when a comment matches literally nothing above, including
// "Reactions"'s own deliberately generous keyword list — routing it into
// Reactions rather than a separate "Uncategorized" bucket, since a short,
// non-specific comment (an emoji Unicode variant not listed, "this", a
// single word) is still, functionally, a reaction.
const FALLBACK_CATEGORY = "Reactions";
const FALLBACK_SUBCATEGORY = "General reactions";

/** Scores every taxonomy subcategory against a comment's text by counting
 * keyword hits, and returns whichever one scored highest — ties keep
 * whatever the taxonomy declared first. Comments matching nothing at all
 * fall back to Reactions' own general bucket rather than being dropped,
 * same principle as the Gemini-based categorizer this replaces: never let
 * a categorization miss make a real comment disappear from the UI. */
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

  // Keeps the taxonomy's declared order — reads more intentional than
  // whatever order a Map happened to fill in.
  const orderedNames = TAXONOMY.map((c) => c.name);

  return orderedNames
    .filter((name) => grouped.has(name))
    .map((name) => {
      const subMap = grouped.get(name)!;
      const taxonomyCategory = TAXONOMY.find((c) => c.name === name)!;
      const subOrder = taxonomyCategory.subcategories.map((s) => s.name);
      return {
        name,
        subcategories: subOrder
          .filter((subName) => subMap.has(subName))
          .map((subName) => ({ name: subName, comments: subMap.get(subName)! })),
      };
    });
}
