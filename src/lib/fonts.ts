// Curated fallback list of open-source Google Fonts families, used when
// GOOGLE_FONTS_API_KEY isn't configured. Every name here is a real Google
// Fonts family and can be loaded via the same CSS API URL builder below.
export const CURATED_FONTS = [
  "Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Oswald",
  "Raleway", "Nunito", "Nunito Sans", "Work Sans", "Rubik", "Mulish", "Karla",
  "Manrope", "Sora", "Outfit", "Space Grotesk", "DM Sans", "Plus Jakarta Sans",
  "Figtree", "Urbanist", "Lexend", "Barlow", "Barlow Condensed", "Archivo",
  "Archivo Narrow", "Archivo Black", "Bebas Neue", "Anton", "Teko",
  "Fjalla One", "Saira", "Saira Condensed", "Saira Extra Condensed", "Staatliches",
  "League Spartan", "Big Shoulders Display", "Big Shoulders Text",
  "Playfair Display", "Merriweather", "Lora", "PT Serif", "Source Serif 4",
  "Crimson Text", "Crimson Pro", "Libre Baskerville", "Cormorant",
  "Cormorant Garamond", "EB Garamond", "Bitter", "Domine", "Vollkorn",
  "Spectral", "Noto Serif", "Zilla Slab", "Cardo", "Frank Ruhl Libre",
  "IBM Plex Sans", "IBM Plex Serif", "IBM Plex Mono", "JetBrains Mono",
  "Fira Code", "Fira Sans", "Source Code Pro", "Space Mono", "Roboto Mono",
  "Roboto Slab", "Roboto Condensed", "Roboto Flex", "Inconsolata",
  "Chivo", "Chivo Mono", "Syne", "Unbounded", "Bricolage Grotesque",
  "Instrument Sans", "Geist", "Onest", "Schibsted Grotesk", "General Sans",
  "Epilogue", "Hanken Grotesk", "Public Sans", "Red Hat Display",
  "Red Hat Text", "Overpass", "Prompt", "Kanit", "Josefin Sans",
  "Josefin Slab", "Cabin", "Quicksand", "Comfortaa", "Baloo 2",
  "Signika", "Signika Negative", "Muli", "Titillium Web", "Assistant",
  "Heebo", "Varela Round", "Dosis", "Catamaran", "Hind", "Hind Siliguri",
  "Mukta", "Khand", "Rajdhani", "Orbitron", "Exo", "Exo 2", "Michroma",
  "Audiowide", "Righteous", "Bungee", "Bungee Inline", "Bungee Shade",
  "Passion One", "Alfa Slab One", "Abril Fatface", "Ultra", "Bevan",
  "Bowlby One", "Bowlby One SC", "Fredoka", "Baloo Bhai 2", "Patua One",
  "Yeseva One", "Rammetto One", "Luckiest Guy", "Permanent Marker",
  "Shadows Into Light", "Caveat", "Kalam", "Indie Flower", "Dancing Script",
  "Pacifico", "Sacramento", "Great Vibes", "Satisfy", "Courgette",
  "Lobster", "Lobster Two", "Amatic SC", "Gloria Hallelujah", "Handlee",
  "Architects Daughter", "Neucha", "Marck Script", "Comforter",
  "Cinzel", "Cinzel Decorative", "Marcellus", "Prata", "Forum",
  "Bodoni Moda", "Fraunces", "Newsreader", "Libre Caslon Text",
  "Petrona", "Alegreya", "Alegreya Sans", "Arvo", "Bree Serif",
  "Aleo", "Slabo 27px", "Rokkitt", "Josefin Sans", "Yanone Kaffeesatz",
  "Amiri", "Vazirmatn", "Noto Sans", "Noto Sans JP", "Noto Sans KR",
  "Noto Sans SC", "M PLUS Rounded 1c", "Zen Kaku Gothic New",
  "Space Grotesk", "Syncopate", "Coda", "Monoton", "Aldrich",
  "Electrolize", "Iceland", "Wallpoet", "Turret Road", "Vast Shadow",
  "Silkscreen", "Press Start 2P", "VT323", "Share Tech Mono",
  "Special Elite", "Rye", "Sancreek", "Bangers", "Chewy",
  "Kranky", "Nosifer", "Creepster", "Eater", "Butcherman",
] as const;

export function googleFontsCssUrl(family: string, weights = [400, 500, 600, 700]) {
  const encoded = family.trim().replace(/\s+/g, "+");
  const weightSpec = weights.join(";");
  return `https://fonts.googleapis.com/css2?family=${encoded}:wght@${weightSpec}&display=swap`;
}

let cachedLiveCatalog: string[] | null = null;

/** Full live Google Fonts catalog (1,800+ families) when an API key is
 * configured; otherwise the curated fallback above. */
export async function getFontCatalog(): Promise<string[]> {
  const apiKey = process.env.GOOGLE_FONTS_API_KEY;
  if (!apiKey) return [...CURATED_FONTS];

  if (cachedLiveCatalog) return cachedLiveCatalog;

  try {
    const res = await fetch(
      `https://www.googleapis.com/webfonts/v1/webfonts?key=${apiKey}&sort=popularity`,
      { next: { revalidate: 60 * 60 * 24 } }
    );
    if (!res.ok) return [...CURATED_FONTS];
    const data = (await res.json()) as { items: { family: string }[] };
    cachedLiveCatalog = data.items.map((i) => i.family);
    return cachedLiveCatalog;
  } catch {
    return [...CURATED_FONTS];
  }
}
