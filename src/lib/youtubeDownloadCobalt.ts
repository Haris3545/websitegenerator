// Cobalt (https://github.com/imputnet/cobalt) — another open-source media
// downloader with public instances, same category as Piped/Invidious
// (youtubeDownloadPiped.ts / youtubeDownloadInvidious.ts): its own backend
// resolves the stream URL on its own infrastructure, not this deployment's.
// Only one instance configured for now (the one actually asked for) — add
// more here the same way the other two files list several, if this one
// instance turns out to be unreliable on its own.
const COBALT_API_INSTANCES = ["https://cobalt.meowing.de"];

const MAX_HEIGHT = 1080;

type CobaltPickerItem = { url?: string; type?: string };

type CobaltResponse = {
  status?: "tunnel" | "redirect" | "picker" | "local-processing" | "error";
  url?: string;
  picker?: CobaltPickerItem[];
  error?: { code?: string };
};

async function fetchFromInstance(base: string, videoId: string): Promise<{ url: string; headers: Record<string, string> }> {
  try {
    const res = await fetch(base, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        url: `https://www.youtube.com/watch?v=${videoId}`,
        videoQuality: String(MAX_HEIGHT),
        downloadMode: "auto",
        disableMetadata: true,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data: CobaltResponse = await res.json();

    // "tunnel"/"redirect" both carry a single ready-to-fetch url; "picker"
    // is cobalt's own multi-option response (e.g. separate video/audio
    // choices) — take the first playable one, same as picking a format
    // ourselves in the other resolvers.
    if ((data.status === "tunnel" || data.status === "redirect") && data.url) {
      return { url: data.url, headers: {} };
    }
    if (data.status === "picker" && data.picker?.length) {
      const first = data.picker.find((p) => p.url)?.url;
      if (first) return { url: first, headers: {} };
    }

    throw new Error(
      data.status === "error" ? `error response (${data.error?.code ?? "unknown"})` : `unexpected response shape`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${base}: ${message}`);
  }
}

/** Same idea as resolveYoutubeFormatViaPiped/Invidious — a third open-source
 * project's public instance(s) resolving the stream URL on its own
 * infrastructure rather than this deployment's IP. Kept as its own module
 * (rather than folded into Piped's) so youtubeDownload.ts can race all
 * three pools together. */
export async function resolveYoutubeFormatViaCobalt(
  videoId: string
): Promise<{ url: string; headers: Record<string, string> }> {
  const attempts = COBALT_API_INSTANCES.map((base) => fetchFromInstance(base, videoId));

  try {
    return await Promise.any(attempts);
  } catch (aggregate) {
    const reasons =
      aggregate instanceof AggregateError
        ? aggregate.errors.map((e) => (e instanceof Error ? e.message : String(e))).join(" | ")
        : String(aggregate);
    throw new Error(`All Cobalt instances failed — ${reasons}`);
  }
}
