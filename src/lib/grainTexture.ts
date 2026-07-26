// Two SVG feTurbulence noise textures used for the background's animated
// film grain effect (see AestheticPanel + the site layout). Colour is the
// default (fractalNoise's RGB channels drift independently, reading as
// classic "coloured static"); mono runs the same noise through a
// feColorMatrix desaturate so it reads as traditional black-and-white grain.
export const GRAIN_TEXTURE_COLOR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export const GRAIN_TEXTURE_MONO =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch' result='noise'/%3E%3CfeColorMatrix in='noise' type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export function grainTexture(monochrome: boolean | undefined): string {
  return monochrome ? GRAIN_TEXTURE_MONO : GRAIN_TEXTURE_COLOR;
}
