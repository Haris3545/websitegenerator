import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSiteArtist } from "@/lib/getSiteArtist";
import { refreshMediaForArtist, refreshMediaIfStale, getTickerArticles } from "@/lib/media";
import { resolveContent } from "@/lib/contentOverrides";
import { googleFontsCssUrl } from "@/lib/fonts";
import { withThemeDefaults, themeToCssVars } from "@/lib/theme";
import { grainTexture } from "@/lib/grainTexture";
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

  const {
    grain_intensity = 0,
    grain_monochrome = false,
    tint_opacity = 0,
    blur = 0,
    vignette = 0,
    chromatic_aberration = 0,
  } = artist.aesthetic_params ?? {};
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
          "--bg-blur": `${blur * 12}px`,
          "--bg-tint-opacity": tint_opacity * 0.65,
          "--bg-vignette": vignette,
          "--bg-grain-opacity": grain_intensity,
          "--bg-grain-image": grainTexture(grain_monochrome),
          fontFamily: `"${artist.font_family}", sans-serif`,
          ...themeToCssVars(artist.theme_overrides),
        } as React.CSSProperties
      }
    >
      <link rel="stylesheet" href={googleFontsCssUrl(artist.font_family)} />

      {/* Chromatic aberration: splits the background into its red/blue
          channels, offsets them in opposite directions, then screen-blends
          them back together. The two feOffset dx values (0 at rest) are the
          only thing AestheticPanel's live preview needs to touch. */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <filter id="chroma-filter">
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="red"
          />
          <feOffset id="chroma-offset-r" in="red" dx={chromatic_aberration * 8} dy="0" result="redOffset" />
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="blue"
          />
          <feOffset id="chroma-offset-b" in="blue" dx={chromatic_aberration * -8} dy="0" result="blueOffset" />
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="green"
          />
          <feBlend mode="screen" in="redOffset" in2="blueOffset" result="rb" />
          <feBlend mode="screen" in="rb" in2="green" />
        </filter>
      </svg>

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
                filter: `blur(var(--bg-blur)) contrast(${theme.bg_contrast}) saturate(${theme.bg_saturate}) url(#chroma-filter)`,
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
                filter: `blur(var(--bg-blur)) contrast(${theme.bg_contrast}) saturate(${theme.bg_saturate}) url(#chroma-filter)`,
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
        {/* These three stay mounted (opacity/shadow driven by CSS vars that
            default to 0) rather than conditionally rendering, so the
            AestheticPanel sliders can preview them live without a re-render. */}
        <div
          className="absolute inset-0"
          style={{ backgroundColor: artist.primary_color, opacity: "var(--bg-tint-opacity, 0)" }}
        />
        <div
          className="absolute inset-0"
          style={{
            boxShadow:
              "inset 0 0 calc(var(--bg-vignette, 0) * 260px) rgba(0,0,0,calc(var(--bg-vignette, 0) * 1.3))",
          }}
        />
        <div
          className="animate-grain absolute inset-0 mix-blend-overlay"
          style={{
            opacity: "var(--bg-grain-opacity, 0)",
            backgroundImage: "var(--bg-grain-image)",
            backgroundSize: "160% 160%",
          }}
        />
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
          aesthetic_params: artist.aesthetic_params,
        }}
      />
    </div>
    </EditModeProvider>
  );
}
