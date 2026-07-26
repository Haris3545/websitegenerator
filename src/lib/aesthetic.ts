import { Type } from "@google/genai";
import { generateContentThrottled } from "@/lib/gemini";
import type { AestheticParams } from "@/lib/database.types";

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    grain_intensity: { type: Type.NUMBER },
    tint_opacity: { type: Type.NUMBER },
    blur: { type: Type.NUMBER },
    vignette: { type: Type.NUMBER },
    chromatic_aberration: { type: Type.NUMBER },
  },
  required: ["grain_intensity", "tint_opacity", "blur", "vignette", "chromatic_aberration"],
};

/**
 * Turns free text like "film grain overlay, 30%, slight vignette" into the
 * structured 0..1 params the site shell renders the background effect with.
 * This is the edge-case fallback for requests that don't fit the builder's
 * manual sliders (see AestheticPanel) — most common adjustments (grain,
 * tint, blur, vignette, chromatic aberration) should just use those instead
 * of round-tripping through Gemini.
 */
export async function parseAestheticPrompt(prompt: string): Promise<AestheticParams> {
  if (!prompt.trim()) {
    return { grain_intensity: 0, tint_opacity: 0, blur: 0, vignette: 0, chromatic_aberration: 0 };
  }

  try {
    const response = await generateContentThrottled({
      model: "gemini-2.5-flash-lite",
      contents:
        "Translate this art-direction note for a dashboard's background photo into " +
        "0..1 intensity values. grain_intensity = animated film grain / noise texture " +
        "strength. tint_opacity = how strongly a color overlay tints the photo. blur = " +
        "background blur strength. vignette = darkened-edges strength. " +
        "chromatic_aberration = red/blue channel-split lens-fringing strength. Default any " +
        "unmentioned effect to 0. A bare percentage with no named effect applies to " +
        "grain_intensity.\n\n" +
        `Note: "${prompt}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const parsed = JSON.parse(response.text ?? "{}");
    return {
      grain_intensity: clamp01(parsed.grain_intensity),
      tint_opacity: clamp01(parsed.tint_opacity),
      blur: clamp01(parsed.blur),
      vignette: clamp01(parsed.vignette),
      chromatic_aberration: clamp01(parsed.chromatic_aberration),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Gemini aesthetic parsing failed: ${message}`);
  }
}

// Gemini's JSON schema mode constrains type/shape but not numeric range, so
// clamp at this external-API boundary rather than trusting it outright.
function clamp01(value: unknown): number {
  const n = typeof value === "number" ? value : 0;
  return Math.min(1, Math.max(0, n));
}
