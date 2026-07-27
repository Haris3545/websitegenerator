import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { googleFontsCssUrl } from "@/lib/fonts";

/** A tiny, publicly-reachable (not password-gated — see middleware.ts)
 * stand-in for "what this artist's dashboard looks like", purpose-built to
 * be screenshotted for the builder's artist-list thumbnail (see
 * src/lib/screenshot.ts). Not a real capture of the actual authenticated
 * Dashboard tab — there's no meaningful data to show immediately after an
 * artist is created anyway — just their real branding (title, tagline,
 * colors, font) laid out like a dashboard so the icon is recognizably
 * *that artist's* site rather than a generic placeholder or a login screen. */
export default async function PreviewSnapshotPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createServiceRoleClient();
  const { data: artist } = await supabase
    .from("artists")
    .select("project_title, tagline, secondary_color, accent_color, font_family")
    .eq("slug", slug)
    .maybeSingle();

  if (!artist) notFound();

  const bg = artist.secondary_color || "#0a0a0a";
  const accent = artist.accent_color || "#eab308";
  const font = artist.font_family || "Inter";

  return (
    <>
      <link rel="stylesheet" href={googleFontsCssUrl(font)} />
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          backgroundColor: bg,
          backgroundImage: `radial-gradient(ellipse at top left, ${accent}22, transparent 60%)`,
          fontFamily: `"${font}", sans-serif`,
          overflow: "hidden",
        }}
      >
          {/* A thin "browser chrome" strip so this reads as a web page
              rather than a plain color card. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: "#ef4444" }} />
            <span style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: "#eab308" }} />
            <span style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: "#22c55e" }} />
            <span
              style={{
                marginLeft: 10,
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.35)",
                fontSize: 11,
                padding: "3px 12px",
              }}
            >
              {slug}
            </span>
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 40px" }}>
            <h1
              style={{
                margin: 0,
                fontSize: 42,
                fontWeight: 700,
                color: accent,
                lineHeight: 1.1,
                maxWidth: "80%",
              }}
            >
              {artist.project_title || "The Recording Studio"}
            </h1>
            {artist.tagline && (
              <p style={{ marginTop: 10, fontSize: 16, color: "rgba(255,255,255,0.55)", maxWidth: "70%" }}>
                {artist.tagline}
              </p>
            )}

            <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: 64,
                    borderRadius: 10,
                    backgroundColor: "rgba(255,255,255,0.04)",
                    border: `1px solid ${accent}33`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
    </>
  );
}


