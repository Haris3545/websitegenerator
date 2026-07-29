// Cobalt (https://github.com/imputnet/cobalt) — an open-source media
// downloader whose backend resolves the stream URL on its own
// infrastructure, not this deployment's. The specific public instance to
// use was given directly: https://cobalt.meowing.de/.
//
// Self-hosted cobalt deployments commonly split into two separate services
// — a web frontend (serves the UI, GET-only at "/") and a JSON API backend
// (POST "/", used here) — sometimes on the same host, sometimes on a
// different subdomain (api.<domain>, <name>-api.<domain>, capi.<domain>,
// etc.). A 405 on POST / to the given host is exactly what happens when
// that host is actually the frontend rather than the API, so this tries
// several derived candidates rather than assuming the exact one given is
// also the API host.
const COBALT_BASE_HOST = "cobalt.meowing.de";

function deriveApiCandidates(host: string): string[] {
  const withoutPrefix = host.replace(/^cobalt[.-]?/, "");
  // The bare host and its /api/json path both consistently 405 (confirmed
  // live — that host is the GET-only web frontend, not the API), so
  // they're dropped rather than re-tried every request. cobalt-api.<domain>
  // is the strongest remaining lead: it returned a real HTTP 400 rather
  // than 404/405/520, meaning something there actually parsed the request
  // as JSON and rejected its contents — that's a genuine API handler, just
  // one that didn't like this specific payload (see the detailed error
  // body logging below, added to find out why).
  return [`https://api.${withoutPrefix}`, `https://cobalt-api.${withoutPrefix}`, `https://capi.${withoutPrefix}`];
}

const COBALT_API_CANDIDATES = deriveApiCandidates(COBALT_BASE_HOST);

const MAX_HEIGHT = 1080;

type CobaltPickerItem = { url?: string; type?: string };

type CobaltResponse = {
  status?: "tunnel" | "redirect" | "picker" | "local-processing" | "error" | "stream"; // "stream" is the older (v7) API's success status
  url?: string;
  picker?: CobaltPickerItem[];
  error?: { code?: string } | string;
  text?: string; // older API's error message field
};

async function fetchFromCandidate(base: string, videoId: string): Promise<{ url: string; headers: Record<string, string> }> {
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

    // A non-JSON body (an HTML error page, a frontend's index page) means
    // this candidate isn't actually the API. A JSON body on a non-2xx
    // response, though, is cobalt's own validation error — that used to
    // get discarded in favor of a bare "HTTP 400", throwing away the one
    // piece of information (which field it didn't like, or why) that
    // would actually explain what's wrong instead of just that something
    // is.
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new Error(`HTTP ${res.status}, non-JSON response (${contentType || "no content-type"}) — wrong endpoint`);
    }

    const data: CobaltResponse = await res.json();

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} — body: ${JSON.stringify(data).slice(0, 500)}`);
    }

    // "tunnel"/"redirect"/"stream" all carry a single ready-to-fetch url;
    // "picker" is cobalt's own multi-option response (e.g. separate video/
    // audio choices) — take the first playable one, same as picking a
    // format ourselves in the other resolvers.
    if ((data.status === "tunnel" || data.status === "redirect" || data.status === "stream") && data.url) {
      return { url: data.url, headers: {} };
    }
    if (data.status === "picker" && data.picker?.length) {
      const first = data.picker.find((p) => p.url)?.url;
      if (first) return { url: first, headers: {} };
    }

    const errorDetail =
      typeof data.error === "string" ? data.error : data.error?.code ?? data.text ?? "unknown";
    throw new Error(data.status === "error" ? `error response (${errorDetail})` : "unexpected response shape");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${base}: ${message}`);
  }
}

/** Resolves a direct, playable stream URL for downloadYoutubeClip's ffmpeg
 * trim step via a public Cobalt instance — Cobalt's own backend does the
 * YouTube-facing resolution on its infrastructure, not this deployment's,
 * same reasoning as the now-removed Piped/Invidious attempts (both proved
 * to be dead ends: every instance either didn't resolve at all or actively
 * returned 401/403/500 from the third party's own server). Tries several
 * derived API-endpoint shapes for the one instance actually specified,
 * since which exact path/subdomain serves the real JSON API isn't
 * something that can be confirmed without hitting it live. */
export async function resolveYoutubeFormatViaCobalt(
  videoId: string
): Promise<{ url: string; headers: Record<string, string> }> {
  const attempts = COBALT_API_CANDIDATES.map((base) => fetchFromCandidate(base, videoId));

  try {
    return await Promise.any(attempts);
  } catch (aggregate) {
    const reasons =
      aggregate instanceof AggregateError
        ? aggregate.errors.map((e) => (e instanceof Error ? e.message : String(e))).join(" | ")
        : String(aggregate);
    throw new Error(`All Cobalt endpoint candidates failed — ${reasons}`);
  }
}
