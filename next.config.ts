import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  // Telegram SDK + Next runtime. `unsafe-inline` is currently required by the
  // Next App Router runtime; move to nonce-based CSP when a nonce middleware
  // is introduced.
  "script-src 'self' 'unsafe-inline' https://telegram.org",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.telegram.org",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Telegram Web may embed the Mini App; arbitrary origins may not.
  // In development the app is embedded by the local preview proxy (and any
  // Telegram web client), so framing is left open; production stays locked down.
  isProd
    ? "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org"
    : "frame-ancestors *",
  isProd ? "upgrade-insecure-requests" : "",
]
  .filter(Boolean)
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  // Preview proxies (e.g. *.e2b.app) may forward requests to the dev server
  // from a non-localhost host; allow them so Next dev does not 403 internal
  // resources. This is a development-only setting and is ignored in production.
  allowedDevOrigins: ["*.e2b.app"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
