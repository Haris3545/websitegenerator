import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// The free tier caps at a strict 20 requests/DAY per model/project — not a
// per-minute burst limit, so once it's hit, retrying can't succeed again
// until Google resets it. Configurable in case this project moves to a paid
// tier with real headroom.
const DAILY_LIMIT = Number(process.env.GEMINI_DAILY_LIMIT) || 20;

export class GeminiQuotaExhaustedError extends Error {
  constructor() {
    super(
      "Gemini's daily free-tier request quota is exhausted for today — this recovers automatically once the quota resets."
    );
    this.name = "GeminiQuotaExhaustedError";
  }
}

function isRateLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("RESOURCE_EXHAUSTED") || message.includes("429");
}

function parseRetryDelayMs(err: unknown): number {
  const message = err instanceof Error ? err.message : String(err);
  const match = message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  return match ? Math.min(Number(match[1]) * 1000 + 500, 6000) : 1500;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function readUsage(supabase: ReturnType<typeof createServiceRoleClient>): Promise<number> {
  const { data } = await supabase
    .from("gemini_usage")
    .select("request_count")
    .eq("usage_date", todayKey())
    .maybeSingle();
  return data?.request_count ?? 0;
}

// Best-effort, not transactional — a lost race under concurrent refreshes
// might undercount by one or two, which is fine for a soft daily throttle;
// it doesn't need to be exact, just close enough to stop burning requests
// well past the point they'd fail anyway.
async function writeUsage(supabase: ReturnType<typeof createServiceRoleClient>, count: number): Promise<void> {
  await supabase.from("gemini_usage").upsert({ usage_date: todayKey(), request_count: count });
}

/** Every direct Gemini call in the app should go through this instead of
 * calling geminiClient.models.generateContent directly. Tracks today's
 * usage in Supabase and refuses to even attempt a call once the configured
 * daily limit is reached — sparing every caller the latency of a doomed
 * request — and retries once on an actual 429 using the delay Google's own
 * error response suggests, in case it's a transient hiccup rather than the
 * hard daily cap. */
export async function generateContentThrottled(
  params: GenerateContentParameters
): Promise<GenerateContentResponse> {
  const supabase = createServiceRoleClient();
  const used = await readUsage(supabase);
  if (used >= DAILY_LIMIT) throw new GeminiQuotaExhaustedError();

  try {
    const res = await geminiClient.models.generateContent(params);
    await writeUsage(supabase, used + 1);
    return res;
  } catch (err) {
    await writeUsage(supabase, used + 1);
    if (!isRateLimitError(err)) throw err;

    await new Promise((resolve) => setTimeout(resolve, parseRetryDelayMs(err)));
    try {
      const res = await geminiClient.models.generateContent(params);
      await writeUsage(supabase, used + 2);
      return res;
    } catch {
      throw new GeminiQuotaExhaustedError();
    }
  }
}
