import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

function buildApiCorsHeaders(request: NextRequest) {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Requested-With, apikey",
    "Access-Control-Allow-Credentials": "true"
  });
  const origin = request.headers.get("origin");

  if (origin && isAllowedCorsOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }

  return headers;
}

function isAllowedCorsOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1" ||
      url.hostname === "[::1]" ||
      url.hostname.startsWith("192.168.")
    );
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  if (
    request.method === "OPTIONS" &&
    (request.nextUrl.pathname === "/api" || request.nextUrl.pathname.startsWith("/api/"))
  ) {
    return new NextResponse(null, {
      status: 204,
      headers: buildApiCorsHeaders(request)
    });
  }

  if (request.nextUrl.pathname === "/api" || request.nextUrl.pathname.startsWith("/api/")) {
    const response = NextResponse.next();
    const headers = buildApiCorsHeaders(request);
    headers.forEach((value, key) => {
      response.headers.set(key, value);
    });
    return response;
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/api/:path*",
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};
