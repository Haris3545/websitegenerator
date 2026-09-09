/** Buckets an uploaded audience statement into one of a small, fixed set of
 * generic categories — regardless of whatever `category` text that
 * particular GWI crosstab export happened to use. Every crosstab groups its
 * statements under its own topic labels (wording varies export to export,
 * sometimes missing entirely), so the audience heatmap can't group rows by
 * the raw `category` column and expect consistent headers across uploads.
 * Matching keywords against both the raw category and the statement text
 * itself means a statement still lands in the right bucket even when its
 * own crosstab's category label is absent or idiosyncratically worded. */
export const OTHER_CATEGORY = "Other";

const CANONICAL_CATEGORIES: { name: string; keywords: RegExp[] }[] = [
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

export function classifyStatement(category: string | null, statement: string): string {
  const haystack = `${category ?? ""} ${statement}`.toLowerCase();
  for (const c of CANONICAL_CATEGORIES) {
    if (c.keywords.some((re) => re.test(haystack))) return c.name;
  }
  return OTHER_CATEGORY;
}

/** Canonical display order — matched categories keep this order, with any
 * statements that hit no keyword grouped last under "Other" rather than
 * scattered by whatever order rows happened to arrive in. */
export const CATEGORY_DISPLAY_ORDER = [...CANONICAL_CATEGORIES.map((c) => c.name), OTHER_CATEGORY];
