/** Converts a "#rrggbb" (or shorthand "#rgb") hex string to an rgba() CSS
 * value at the given alpha — falls back to black if the input isn't a
 * recognisable hex colour, so a stray malformed value never breaks the
 * whole page's background. */
export function hexToRgba(hex: string, alpha: number): string {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h.split("").map((c) => c + c).join("");
  }
  const match = /^([0-9a-f]{6})$/i.exec(h);
  if (!match) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
