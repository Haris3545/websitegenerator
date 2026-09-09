/** Groups an uploaded audience statement under a display category for the
 * heatmap. A real GWI crosstab export's own `category` column (e.g. "Music
 * Attitudes*", "Music Services: Account Type*") is already a well-formed,
 * per-statement-block topic label — far more reliable than guessing one
 * from the statement's wording — so it's used directly (after stripping the
 * trailing "*" GWI appends to denote a derived variable, and tidying
 * whitespace) whenever a row has one. Keyword matching against the
 * statement text only kicks in as a fallback for the flat/simplified
 * spreadsheet shape, whose rows often have no category column at all. */
export const OTHER_CATEGORY = "Other";

const FALLBACK_CATEGORIES: { name: string; keywords: RegExp[] }[] = [
  {
    name: "Music Discovery",
    keywords: [
      /\bdiscovers?\b.*\bmusic\b/,
      /\bnew (?:artists?|releases?|music)\b/,
      /\bplaylists?\b/,
      /\balgorithm/,
      /\brecommend/,
      /\bspotify\b/,
      /\bapple music\b/,
      /\bsoundcloud\b/,
      /\bshazam\b/,
      /\bradio\b/,
      /\bmusic (?:blogs?|charts?)\b/,
    ],
  },
  {
    name: "Streaming & Listening Habits",
    keywords: [/\bstreams?\b|\bstreaming\b/, /\blistens?\b|\blistening\b/, /\bskips?\b/, /\bpodcasts?\b/, /\brepeats?\b|\breplays?\b/],
  },
  {
    name: "Live Events & Touring",
    keywords: [/\bconcerts?\b/, /\bfestivals?\b/, /\blive shows?\b/, /\btours?\b/, /\bvenues?\b/, /\btickets?\b/, /\bgigs?\b/, /\bvip\b/],
  },
  {
    name: "Merch & Spending",
    keywords: [
      /\bmerch(?:andise)?\b/,
      /\bvinyl\b/,
      /\bcds?\b/,
      /\bpurchas(?:e|es|ed|ing)\b/,
      /\bbuys?\b|\bbuying\b|\bbought\b/,
      /\bspends?\b|\bspending\b/,
      /\bsubscri(?:be|bes|bed|ption)/,
      /\bpatreon\b/,
      /\bfan club\b/,
      /\bpay(?:s|ing)? for\b/,
    ],
  },
  {
    name: "Social Media & Fan Community",
    keywords: [
      /\bsocial media\b/,
      /\binstagram\b/,
      /\btiktok\b/,
      /\btwitter\b|\bx\.com\b/,
      /\bdiscord\b/,
      /\bforums?\b/,
      /\bfollows?\b|\bfollowing\b/,
      /\bposts?\b|\bposting\b/,
      /\bshares?\b|\bsharing\b/,
      /\bcommunity\b/,
      /\bcomments?\b/,
      /\bfacebook\b/,
      /\bsnapchat\b/,
    ],
  },
  {
    name: "Media & Entertainment",
    keywords: [/\btelevision\b|\btv\b/, /\bnetflix\b/, /\bgaming\b|\bvideo games?\b/, /\bmovies?\b|\bcinema\b/, /\bnews\b/, /\bentertainment\b/],
  },
  {
    name: "Shopping & Brand Behaviour",
    keywords: [/\bbrands?\b/, /\badvertis/, /\bsponsor/, /\bendors/, /\bshopping\b/, /\bretail\b/, /\be-?commerce\b/],
  },
  {
    name: "Technology & Devices",
    keywords: [/\bsmartphones?\b/, /\bapps?\b/, /\bdevices?\b/, /\bwearables?\b/, /\bartificial intelligence\b|\bai\b/, /\btechnology\b/, /\bgadgets?\b/],
  },
  {
    name: "Lifestyle & Values",
    keywords: [/\bsustainab/, /\benvironment/, /\bwellbeing\b/, /\bmental health\b/, /\bactivis/, /\bvalues\b/, /\bethical\b/],
  },
  {
    name: "Demographics & Attitudes",
    keywords: [/\battitudes?\b/, /\bpersonality\b/, /\bidentifies?\b/, /\bbelieves?\b/, /\bpolitic/, /\breligio/],
  },
];

function cleanCategoryLabel(category: string | null): string | null {
  if (!category) return null;
  const cleaned = category.replace(/\*+\s*$/, "").replace(/\s+/g, " ").trim();
  return cleaned || null;
}

export function classifyStatement(category: string | null, statement: string): string {
  const raw = cleanCategoryLabel(category);
  if (raw) return raw;

  const haystack = statement.toLowerCase();
  for (const c of FALLBACK_CATEGORIES) {
    if (c.keywords.some((re) => re.test(haystack))) return c.name;
  }
  return OTHER_CATEGORY;
}

/** Alphabetical is the only ordering that makes sense once category names
 * mostly come straight from whatever a real crosstab called them (rather
 * than a fixed list this file controls) — "Other" (the fallback keyword
 * miss, or a statement with no category at all) still always sorts last
 * rather than wherever it happens to fall alphabetically. */
export function sortCategoryNames(names: string[]): string[] {
  return [...names].sort((a, b) => {
    if (a === OTHER_CATEGORY) return b === OTHER_CATEGORY ? 0 : 1;
    if (b === OTHER_CATEGORY) return -1;
    return a.localeCompare(b);
  });
}
