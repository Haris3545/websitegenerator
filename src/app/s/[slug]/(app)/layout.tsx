import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSiteArtist } from "@/lib/getSiteArtist";
import { refreshMediaForArtist, refreshMediaIfStale, getTickerArticles } from "@/lib/media";
import { resolveContent } from "@/lib/contentOverrides";
import { googleFontsCssUrl } from "@/lib/fonts";
import { withThemeDefaults, themeToCssVars } from "@/lib/theme";
import { SiteHeader } from "@/components/site/SiteHeader";
import { NewsTicker } from "@/components/site/NewsTicker";
import { NavPills } from "@/components/site/NavPills";
import { PageTransition } from "@/components/site/PageTransition";
import { EditModeProvider } from "@/components/site/EditModeContext";
import { AestheticPanel } from "@/components/site/AestheticPanel";

// "Refresh Everything" (a Server Action invoked from a page under this
// layout) fans out to several external APIs plus multiple Gemini calls —
// even parallelized, that can run well past Vercel's default serverless
// timeout. Raised here since a layout's maxDuration governs every action
// invoked from any page nested under it.
export const maxDuration = 300;

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
  // Cached per-request so the page rendering alongside this layout reuses
  // the same fetch instead of querying the artist row a second time.
  const artist = await getSiteArtist(slug);

  let tickerArticles = await getTickerArticles(artist.id, slug);

  if (!tickerArticles.length) {
    // Nothing cached at all yet (a brand-new artist) — worth the wait so
    // the very first visit isn't just empty. Once anything's cached, stay
    // fast: refresh staleness in the background instead (see below). This
    // one-time re-query goes straight to Supabase rather than through the
    // (still briefly stale) cache, since it just wrote the very rows it
    // needs to see immediately.
    try {
      await refreshMediaForArtist(artist.id, artist.name);
      const { data } = await supabase
        .from("media_articles")
        .select("*")
        .eq("artist_id", artist.id)
        .order("published_at", { ascending: false })
        .limit(6);
      tickerArticles = data ?? [];
    } catch (err) {
      console.error(`Initial media fetch failed for ${slug}:`, err);
    }
  } else {
    after(() => refreshMediaIfStale(artist.id, artist.name));
  }

  const { grain_intensity = 0, tint_opacity = 0, blur = 0, vignette = 0 } =
    artist.aesthetic_params ?? {};
  const theme = withThemeDefaults(artist.theme_overrides);
  const isBackgroundVideo = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(artist.background_image_url ?? "");

  return (
    <EditModeProvider editingAllowed={!process.env.PINNED_ARTIST_SLUG}>
    <div
      id="site-root"
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
        {artist.background_image_url &&
          (isBackgroundVideo ? (
            <video
              src={artist.background_image_url}
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
          ))}
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

      <SiteHeader projectTitle={artist.project_title} tagline={artist.tagline} />
      <NewsTicker
        articles={tickerArticles ?? []}
        artistId={artist.id}
        emptyMessage={resolveContent(
          artist.content_overrides,
          "ticker.empty_state",
          "No coverage cached yet — this fills in automatically once articles are found."
        )}
      />
      {/* Keying on the tab list itself forces a full remount (resetting
          NavPills' local drag-order state to match) whenever enabled_tabs
          changes from anywhere — including the Dashboard's KPI grid, a
          sibling component under this same layout with its own local copy
          of the same underlying order — rather than needing an effect to
          sync props into state. */}
      <NavPills
        key={artist.enabled_tabs.join(",")}
        slug={slug}
        artistId={artist.id}
        enabledTabs={artist.enabled_tabs}
      />

      <main className="px-6 pb-16 sm:px-10">
        <PageTransition>{children}</PageTransition>
      </main>

      <AestheticPanel
        artistId={artist.id}
        initial={{
          primary_color: artist.primary_color,
          accent_color: artist.accent_color,
          font_family: artist.font_family,
          theme_overrides: artist.theme_overrides,
        }}
      />
    </div>
    </EditModeProvider>
  );
}
