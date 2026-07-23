import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { AestheticParams } from "@/lib/database.types";

const AestheticParamsSchema = z.object({
  grain_intensity: z.number().min(0).max(1),
  tint_opacity: z.number().min(0).max(1),
  blur: z.number().min(0).max(1),
  vignette: z.number().min(0).max(1),
});

const client = new Anthropic();

/**
 * Turns free text like "film grain overlay, 30%, slight vignette" into the
 * structured 0..1 params the site shell renders the background effect with.
 */
export async function parseAestheticPrompt(prompt: string): Promise<AestheticParams> {
  if (!prompt.trim()) {
    return { grain_intensity: 0, tint_opacity: 0, blur: 0, vignette: 0 };
  }

  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content:
          "Translate this art-direction note for a dashboard's background photo into " +
          "0..1 intensity values. grain_intensity = film grain / noise texture strength. " +
          "tint_opacity = how strongly a color overlay tints the photo. blur = background " +
          "blur strength. vignette = darkened-edges strength. Default any unmentioned " +
          "effect to 0. A bare percentage with no named effect applies to grain_intensity.\n\n" +
          `Note: "${prompt}"`,
      },
    ],
    output_config: {
      effort: "low",
      format: zodOutputFormat(AestheticParamsSchema),
    },
  });

  return response.parsed_output as AestheticParams;
}
