/** The generated site's client-facing password: the artist's slug, lowercased
 * with punctuation/hyphens stripped, followed by "2026" — e.g. slug
 * "spandau-ballet" -> "spandauballet2026". Deliberately simple and shareable
 * (matches the reference dashboards), not a secret-grade credential. Tied to
 * the slug (not the display name) so renaming the slug changes the password
 * too — the two always move together. */
export function computeArtistPassword(slug: string): string {
  return `${slug.toLowerCase().replace(/[^a-z0-9]/g, "")}2026`;
}

export function artistAccessCookieName(slug: string): string {
  return `artist_access_${slug}`;
}
