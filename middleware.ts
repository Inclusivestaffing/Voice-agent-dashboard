import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key || !url.startsWith("http")) {
      return NextResponse.next();
    }

    const { createServerClient } = await import("@supabase/ssr");
    let response = NextResponse.next({ request });

    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    const path = request.nextUrl.pathname;
    const isApp = path.startsWith("/w/") || path.startsWith("/workspaces");

    if (isApp && !user) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("next", path);
      return NextResponse.redirect(redirectUrl);
    }

    return response;
  } catch (err) {
    console.error("Middleware execution skipped:", err);
    return NextResponse.next();
  }
}

export const config = {
  // Only guard workspace and app routes; public, demo and static routes bypass middleware entirely
  matcher: ["/w/:path*", "/workspaces/:path*"],
};
