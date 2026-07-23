import type { CSSProperties } from "react";

// Fine-tuning values set from the builder's click-to-select visual editor.
// Separate from AestheticParams (database.types.ts), which stays driven by
// the Gemini-parsed free-text box — this is direct manual control instead.
export type ThemeOverrides = {
  card_radius?: number; // px, corner roundedness of KPI/article/board cards
  card_bg_opacity?: number; // 0..1, card background darkness
  card_border_opacity?: number; // 0..1, card border visibility
  card_text_color?: string; // hex, labels/captions/body text inside cards
  header_bold?: boolean; // project title weight
  header_italic?: boolean; // project title style
  bg_contrast?: number; // background photo/video contrast, 0.5..2
  bg_saturate?: number; // background photo/video saturation, 0.5..2
  bg_scrim_opacity?: number; // 0..0.8, fixed dark overlay for legibility
  bg_position_x?: number; // 0..100, object-position X (pan)
  bg_position_y?: number; // 0..100, object-position Y (pan)
  bg_zoom?: number; // 1..2.5, object scale (zoom/resize)
};

export const DEFAULT_THEME_OVERRIDES: Required<ThemeOverrides> = {
  card_radius: 12,
  card_bg_opacity: 0.4,
  card_border_opacity: 0.15,
  card_text_color: "#ffffff",
  header_bold: true,
  header_italic: false,
  bg_contrast: 1.15,
  bg_saturate: 1.1,
  bg_scrim_opacity: 0.45,
  bg_position_x: 50,
  bg_position_y: 50,
  bg_zoom: 1,
};

export function withThemeDefaults(overrides: ThemeOverrides | null | undefined) {
  return { ...DEFAULT_THEME_OVERRIDES, ...(overrides ?? {}) };
}

/** CSS custom properties consumed by SiteHeader, KpiCard, ArticleCard,
 * PlaceholderSection, and EmptyBoardState — set once at the site's root div. */
export function themeToCssVars(overrides: ThemeOverrides | null | undefined): CSSProperties {
  const t = withThemeDefaults(overrides);
  return {
    "--card-radius": `${t.card_radius}px`,
    "--card-bg-opacity": t.card_bg_opacity,
    "--card-border-opacity": t.card_border_opacity,
    "--card-text-color": t.card_text_color,
    "--header-font-weight": t.header_bold ? 700 : 400,
    "--header-font-style": t.header_italic ? "italic" : "normal",
  } as CSSProperties;
}
