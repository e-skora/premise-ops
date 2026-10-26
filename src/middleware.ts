import { NextRequest, NextResponse } from "next/server";
import { SANDBOX_COOKIE, isPublicDemo } from "@/lib/demo-mode";

/**
 * Public demo: give each new visitor a sandbox id before the page and its first
 * API calls run, so parallel first requests all land in the same sandbox.
 */
export function middleware(req: NextRequest) {
  if (!isPublicDemo() || req.cookies.get(SANDBOX_COOKIE)) {
    return NextResponse.next();
  }

  const id = crypto.randomUUID();
  // Forward the new cookie on this request so server code already sees it
  req.cookies.set(SANDBOX_COOKIE, id);
  const res = NextResponse.next({ request: { headers: req.headers } });
  res.cookies.set(SANDBOX_COOKIE, id, {
    path: "/",
    maxAge: 24 * 60 * 60,
    httpOnly: true,
    sameSite: "lax",
    secure: req.headers.get("x-forwarded-proto") === "https",
  });
  return res;
}

export const config = {
  matcher: ["/demo", "/api/:path*"],
};
