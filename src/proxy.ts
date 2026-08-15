import { NextResponse, type NextRequest } from "next/server";

/**
 * Fail-closed admin boundary.
 *
 * This release intentionally ships no admin API. The namespace is blocked at
 * the earliest request layer so a future route cannot become public by
 * accident. Replace this with verified admin session + MFA/RBAC middleware
 * before implementing any `/api/admin/*` route.
 */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/admin/")) {
    return NextResponse.json(
      { error: "Not found", code: "not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/admin/:path*"],
};
