import { notFound } from "next/navigation";
import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { refreshMediaIfStale } from "@/lib/media";
import { googleFontsCssUrl } from "@/lib/fonts";
import { withThemeDefaults, themeToCssVars } from "@/lib/theme";
import { SiteHeader } from "@/components/site/SiteHeader";
import { NewsTicker } from "@/components/site/NewsTicker";
import { NavPills } from "@/components/site/NavPills";
import { PageTransition } from "@/components/site/PageTransition";

export default async function ArtistSiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createServiceRoleClient();

  // Authorization already happened in middleware.ts (password cookie or a
  // Supabase session) — this is a plain lookup, not an RLS-scoped one.
  const { data: artist } = await supabase.from("artists").select("*").eq("slug", slug).single();
  if (!artist) notFound();

  // Don't block the page on a live Google News fetch — the cron job (see
  // vercel.json) keeps this warm on a schedule; here we just kick a refresh
  // in the background if it's stale, after the response has already gone out.
  after(() => refreshMediaIfStale(artist.id, artist.name));

  const { data: tickerArticles } = await supabase
    .from("media_articles")
    .select("*")
    .eq("artist_id", artist.id)
    .order("published_at", { ascending: false })
    .limit(6);

  const { grain_intensity = 0, tint_opacity = 0, blur = 0, vignette = 0 } =
    artist.aesthetic_params ?? {};
  const theme = withThemeDefaults(artist.theme_overrides);

  return (
    <div
      className="relative min-h-screen text-white"
      style={
        {
          "--primary": artist.primary_color,
          "--secondary": artist.secondary_color,
          "--accent": artist.accent_color,
          fontFamily: `"${artist.font_family}", sans-serif`,
          ...themeToCssVars(artist.theme_overrides),
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
              filter: `blur(${blur * 12}px) contrast(${theme.bg_contrast}) saturate(${theme.bg_saturate})`,
              objectPosition: `${theme.bg_position_x}% ${theme.bg_position_y}%`,
              transform: `scale(${theme.bg_zoom})`,
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
                filter: `blur(${blur * 12}px) contrast(${theme.bg_contrast}) saturate(${theme.bg_saturate})`,
                objectPosition: `${theme.bg_position_x}% ${theme.bg_position_y}%`,
                transform: `scale(${theme.bg_zoom})`,
              }}
            />
          )
        )}
        {/* Fixed dark scrim: always on (strength set via the builder's visual
            editor), independent of the aesthetic tint, so text stays readable
            and the photo reads as punchy rather than washed out. */}
        <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${theme.bg_scrim_opacity})` }} />
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

      <main className="px-6 pb-16 sm:px-10">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
