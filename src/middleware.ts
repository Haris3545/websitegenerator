import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // A standalone per-artist deployment (see src/lib/publish.ts) sets this so
  // the builder — the internal admin tool — isn't reachable on a
  // client-facing site. Doesn't apply to the main multi-tenant deployment,
  // where this env var is unset.
  const pinnedSlug = process.env.PINNED_ARTIST_SLUG;
  if (pinnedSlug && path.startsWith("/builder")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = `/s/${pinnedSlug}`;
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  // Fast path: a password-gated site visit with a valid access cookie needs
  // no Supabase Auth round-trip at all — that network call was previously
  // firing on every single tab navigation, which was the biggest single
  // contributor to the site feeling slow to switch tabs.
  const siteMatch = path.match(/^\/s\/([^/]+)(\/.*)?$/);
  if (siteMatch) {
    const [, slug, rest] = siteMatch;
    const isSiteGate = rest === "/gate";
    const hasArtistAccess = request.cookies.get(`artist_access_${slug}`)?.value === "granted";

    if (!isSiteGate && hasArtistAccess) {
      return NextResponse.next();
    }
  }

  let response = NextResponse.next({ request });

  // A missing/misconfigured Supabase env var used to throw straight out of
  // createServerClient (or the getUser() call below) with no try/catch
  // anywhere above it — on Vercel that surfaces as a hard 500
  // MIDDLEWARE_INVOCATION_FAILED for every single request, taking the whole
  // site down rather than just builder auth. A fresh standalone deployment
  // (see publish.ts) is the likeliest place for that to happen — env vars
  // are attached to the Vercel project at creation time, but there's a
  // window where a request can land before they're actually available to
  // the running function. Falling back to "no user" here means a real env
  // var problem still shows up (as being redirected to /builder/login and
  // failing to sign in) instead of taking the entire site offline.
  let user = null;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseAnonKey) {
    try {
      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value } of cookiesToSet) {
              request.cookies.set(name, value);
            }
            response = NextResponse.next({ request });
            for (const { name, value, options } of cookiesToSet) {
              response.cookies.set(name, value, options);
            }
          },
        },
      });
      const result = await supabase.auth.getUser();
      user = result.data.user;
    } catch (err) {
      console.error("middleware: Supabase auth check failed:", err);
    }
  } else {
    console.error(
      "middleware: NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY not set — builder sign-in will not work until they are."
    );
  }

  const isBuilderRoute = path.startsWith("/builder");
  const isBuilderLogin = path === "/builder/login";

  if (isBuilderRoute && !isBuilderLogin && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/builder/login";
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  if (isBuilderLogin && user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/builder";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  // Generated artist sites: /s/<slug>/... — gated solely by the shared
  // "artist name + 2026" password (see /s/[slug]/gate and artistAccess.ts),
  // which sets a cookie once entered correctly (handled by the fast path
  // above once that cookie exists). Being signed into the builder as an
  // internal admin does NOT grant access here — it's a deliberately
  // separate gate, checked purely on this cookie, not on `user`. Data
  // fetching for the site doesn't depend on RLS either — see the
  // service-role client used in layout.tsx/page.tsx/media/page.tsx.
  if (siteMatch) {
    const [, slug, rest] = siteMatch;
    const isSiteGate = rest === "/gate";
    const hasArtistAccess = request.cookies.get(`artist_access_${slug}`)?.value === "granted";

    if (!isSiteGate && !hasArtistAccess) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = `/s/${slug}/gate`;
      redirectUrl.searchParams.set("next", path);
      return NextResponse.redirect(redirectUrl);
    }

    if (isSiteGate && hasArtistAccess) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = `/s/${slug}`;
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets, so the Supabase session
     * cookie stays fresh everywhere, while skipping expensive work on
     * asset requests.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
