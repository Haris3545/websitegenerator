/** The generated site's client-facing password: the artist's name, lowercased
 * with punctuation/spaces stripped, followed by "2026" — e.g. "Spandau
 * Ballet" -> "spandauballet2026". Deliberately simple and shareable (matches
 * the reference dashboards), not a secret-grade credential. */
export function computeArtistPassword(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}2026`;
}

export function artistAccessCookieName(slug: string): string {
  return `artist_access_${slug}`;
}
