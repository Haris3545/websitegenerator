import type { AestheticParams } from "@/lib/database.types";

// Shared default for AestheticParams (background grain/tint/blur/vignette/
// chromatic-aberration) — previously only defined inline inside
// AestheticPanel.tsx (the live site's Edit Mode panel); pulled out here so
// the builder's own copy of these same controls (ThemeEditor.tsx) can use
// an identical default instead of drifting out of sync with it.
export const DEFAULT_AESTHETIC_PARAMS: Required<AestheticParams> = {
  grain_intensity: 0,
  grain_monochrome: false,
  tint_color: "#000000", // callers typically override with the artist's own primary color
  tint_opacity: 0,
  blur: 0,
  vignette: 0,
  chromatic_aberration: 0,
};
