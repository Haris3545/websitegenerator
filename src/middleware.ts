import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
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

  // Generated artist sites: /s/<slug>/... — the primary gate is the shared
  // "artist name + 2026" password (see /s/[slug]/gate and artistAccess.ts),
  // which sets a cookie once entered correctly. A real Supabase-authenticated
  // user (the old per-account /login flow) is still accepted as an
  // alternative, but data fetching for the site no longer depends on RLS —
  // see the service-role client used in layout.tsx/page.tsx/media/page.tsx.
  const siteMatch = path.match(/^\/s\/([^/]+)(\/.*)?$/);
  if (siteMatch) {
    const [, slug, rest] = siteMatch;
    const isSiteLogin = rest === "/login";
    const isSiteGate = rest === "/gate";
    const hasArtistAccess = request.cookies.get(`artist_access_${slug}`)?.value === "granted";

    if (!isSiteLogin && !isSiteGate && !user && !hasArtistAccess) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = `/s/${slug}/gate`;
      redirectUrl.searchParams.set("next", path);
      return NextResponse.redirect(redirectUrl);
    }

    if (isSiteGate && (user || hasArtistAccess)) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = `/s/${slug}`;
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }

    if (isSiteLogin && user) {
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
