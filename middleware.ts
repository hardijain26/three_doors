import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/", "/login", "/privacy", "/auth/callback"];

// CSP Configuration: This is the "Security Guard" for the browser
const CSP_HEADER = `
  default-src 'self'; 
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.supabase.co; 
  style-src 'self' 'unsafe-inline'; 
  img-src 'self' blob: data: https://*.supabase.co; 
  connect-src 'self' https://*.supabase.co; 
  font-src 'self' data:; 
  frame-ancestors 'none'; 
  form-action 'self';
`.replace(/\s{2,}/g, ' ').trim();

export async function middleware(req: NextRequest) {
  const p0 = req.nextUrl.pathname;

  // 1. API Protection (CORS)
  if (p0.startsWith("/api/") && req.method !== "GET") {
    const origin = req.headers.get("origin");
    const json = (req.headers.get("content-type") || "").startsWith("application/json");
    if (!json || (origin && origin !== req.nextUrl.origin)) {
      return NextResponse.json({ error: "forbidden", message: "Cross-site request refused." }, { status: 403 });
    }
  }

  let res = NextResponse.next({ request: req });

  // 2. APPLY THE SECURITY SHIELD (CSP)
  res.headers.set("Content-Security-Policy", CSP_HEADER);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await sb.auth.getUser();
  const p = req.nextUrl.pathname;

  if (!data.user && !PUBLIC.includes(p) && !p.startsWith("/api/")) {
    const url = req.nextUrl.clone(); 
    url.pathname = "/login"; 
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
