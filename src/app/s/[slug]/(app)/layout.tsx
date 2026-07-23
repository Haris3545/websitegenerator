import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { refreshMediaIfStale } from "@/lib/media";
import { googleFontsCssUrl } from "@/lib/fonts";
import { SiteHeader } from "@/components/site/SiteHeader";
import { NewsTicker } from "@/components/site/NewsTicker";
import { NavPills } from "@/components/site/NavPills";

export default async function ArtistSiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  // RLS scopes this to builder admins and members of this specific artist —
  // a non-member authenticated user gets no row back, hence notFound().
  const { data: artist } = await supabase.from("artists").select("*").eq("slug", slug).single();
  if (!artist) notFound();

  await refreshMediaIfStale(artist.id, artist.name);

  const { data: tickerArticles } = await supabase
    .from("media_articles")
    .select("*")
    .eq("artist_id", artist.id)
    .order("published_at", { ascending: false })
    .limit(6);

  const { grain_intensity = 0, tint_opacity = 0, blur = 0, vignette = 0 } =
    artist.aesthetic_params ?? {};

  return (
    <div
      className="relative min-h-screen text-white"
      style={
        {
          "--primary": artist.primary_color,
          "--secondary": artist.secondary_color,
          "--accent": artist.accent_color,
          fontFamily: `"${artist.font_family}", sans-serif`,
        } as React.CSSProperties
      }
    >
      <link rel="stylesheet" href={googleFontsCssUrl(artist.font_family)} />

      <div className="fixed inset-0 -z-20" style={{ backgroundColor: artist.secondary_color }}>
        {artist.landing_video_url ? (
          <video
            src={artist.landing_video_url}
            autoPlay
            muted
            loop
            playsInline
            className="h-full w-full object-cover"
            style={{
              filter: `blur(${blur * 12}px) contrast(1.15) saturate(1.1)`,
            }}
          />
        ) : (
          artist.background_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={artist.background_image_url}
              alt=""
              className="h-full w-full object-cover"
              style={{
                filter: `blur(${blur * 12}px) contrast(1.15) saturate(1.1)`,
              }}
            />
          )
        )}
        {/* Fixed dark scrim: always on, independent of the aesthetic tint, so
            text stays readable and the photo reads as punchy rather than washed out. */}
        <div className="absolute inset-0 bg-black/45" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-black/70" />
        {tint_opacity > 0 && (
          <div
            className="absolute inset-0"
            style={{ backgroundColor: artist.primary_color, opacity: tint_opacity * 0.65 }}
          />
        )}
        {vignette > 0 && (
          <div
            className="absolute inset-0"
            style={{
              boxShadow: `inset 0 0 ${vignette * 260}px rgba(0,0,0,${Math.min(1, vignette * 1.3)})`,
            }}
          />
        )}
        {grain_intensity > 0 && (
          <div
            className="absolute inset-0 mix-blend-overlay"
            style={{
              opacity: grain_intensity,
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            }}
          />
        )}
      </div>

      <SiteHeader
        projectTitle={artist.project_title}
        tagline={artist.tagline}
        artistName={artist.name}
      />
      <NewsTicker articles={tickerArticles ?? []} />
      <NavPills slug={slug} enabledTabs={artist.enabled_tabs} />

      <main className="px-6 pb-16 sm:px-10">{children}</main>
    </div>
  );
}
