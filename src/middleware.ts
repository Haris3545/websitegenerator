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

  // Generated artist sites: /s/<slug>/... — RLS on the `artists` table (see
  // migrations/001_init.sql) does the actual per-artist authorization once
  // logged in; this just gates "must be signed in as *someone*".
  const siteMatch = path.match(/^\/s\/([^/]+)(\/.*)?$/);
  if (siteMatch) {
    const [, slug, rest] = siteMatch;
    const isSiteLogin = rest === "/login";

    if (!isSiteLogin && !user) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = `/s/${slug}/login`;
      redirectUrl.searchParams.set("next", path);
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
