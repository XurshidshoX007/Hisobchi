import { NextResponse, type NextRequest } from "next/server";

/**
 * Request-layer security boundary (Next.js proxy/middleware).
 *
 * 1. Fail-closed admin namespace — this release intentionally ships no admin
 *    API. The namespace is blocked at the earliest request layer so a future
 *    route cannot become public by accident. Replace with verified admin
 *    session + MFA/RBAC middleware before implementing any `/api/admin/*`
 *    route.
 *
 * 2. Per-request CSP nonce — production HTML is rendered dynamically (see the
 *    root layout) and every framework script carries this nonce, so inline
 *    script injection is blocked in all nonce-aware browsers. `'unsafe-inline'`
 *    stays ONLY as the standards-mandated fallback for legacy browsers:
 *    CSP2+/CSP3 engines ignore it whenever a nonce is present, and Telegram's
 *    in-app webviews are all modern engines. Removing the keyword entirely
 *    would break nothing modern but would hard-fail pre-CSP2 browsers, so we
 *    follow the standard nonce + fallback pattern instead.
 */

const isProd = process.env.NODE_ENV === "production";

function buildCsp(nonce: string | null): string {
  return [
    "default-src 'self'",
    // Telegram SDK + Next runtime. With a nonce present, modern browsers
    // ignore 'unsafe-inline' and enforce the nonce; https://telegram.org
    // remains a host allowlist entry for the external SDK script.
    nonce
      ? `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' https://telegram.org`
      : "script-src 'self' 'unsafe-inline' https://telegram.org",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.telegram.org",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Telegram Web may embed the Mini App; arbitrary origins may not.
    "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
    isProd ? "upgrade-insecure-requests" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/admin/")) {
    return NextResponse.json(
      { error: "Not found", code: "not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Nonce only in production: the dev server keeps the permissive policy so
  // HMR/dev tooling behaviour is unchanged. Only the exact production runtime
  // gets the stricter contract, and it is verified by `next build && next start`.
  const nonce = isProd ? Buffer.from(crypto.randomUUID()).toString("base64") : null;
  const csp = buildCsp(nonce);

  // Next.js reads the request CSP header during dynamic rendering and stamps
  // the nonce onto every script it emits (including `next/script`).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Everything except build-time static assets (they are plain JS/CSS/image
  // files — CSP is a document-level policy and next.config.ts still applies
  // the remaining security headers globally). /api/* stays matched so the
  // admin block above keeps guarding the namespace.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
