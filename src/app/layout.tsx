import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { headers } from "next/headers";
import { Manrope, Sora } from "next/font/google";
import "./globals.css";
import { FinanceProvider } from "@/components/providers";
import { AppShell } from "@/components/app-shell";

/**
 * Two families with strictly separated roles: Manrope carries the interface,
 * Sora carries every amount and percentage. Tabular figures in a distinct face
 * are what makes a column of sums read as a ledger instead of as prose. The
 * variables below are consumed in globals.css — --font-manrope by --font-sans,
 * --font-sora by the `.num` class that every Money value already carries.
 *
 * next/font downloads and self-hosts both families at build time, so nothing is
 * fetched from Google at runtime and the `font-src 'self'` CSP in src/proxy.ts
 * stays untouched.
 */
const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-manrope",
});

const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
  variable: "--font-sora",
});

export const metadata: Metadata = {
  title: "Hisobchi — Shaxsiy moliya",
  description: "Balans, daromad, xarajat, reja va prognoz — Telegram bot va Mini App.",
};

/**
 * Every page is rendered per request so the CSP nonce generated in
 * src/proxy.ts is stamped onto each framework script. A statically
 * prerendered shell would ship nonce-less inline scripts that a nonce-aware
 * browser must block. The pages are thin client shells (all data arrives via
 * /api/state on the client), so per-request rendering costs microseconds.
 */
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  // Matches --bg in globals.css for each theme. Dark is the product default.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0c10" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

/**
 * Theme resolution runs BEFORE first paint, so a light-mode user never sees a
 * dark flash (and vice versa). FinanceProvider re-applies exactly the same
 * classes after hydration; this script only removes the gap in between. It
 * mirrors the provider's contract: dark is the default palette, `.light` is the
 * opt-in class, and `pfos-theme` is the stored preference.
 */
const THEME_INIT = `(function(){try{
var m=localStorage.getItem("pfos-theme")||"system";
var d=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
var r=document.documentElement;
r.classList.toggle("light",!d);
r.classList.toggle("dark",d);
r.style.colorScheme=d?"dark":"light";
}catch(e){}})();`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  /**
   * Next stamps its own scripts with the per-request nonce from src/proxy.ts,
   * but not a hand-written inline <script>. Production CSP carries a nonce, and
   * a nonce-aware browser ignores the 'unsafe-inline' fallback, so without this
   * the theme script would simply be blocked.
   */
  const nonce = (await headers()).get("content-security-policy")?.match(/'nonce-([^']+)'/)?.[1];

  return (
    <html lang="uz" className={`${manrope.variable} ${sora.variable}`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-dvh bg-bg font-sans text-fg antialiased">
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <FinanceProvider>
          <AppShell>{children}</AppShell>
        </FinanceProvider>
      </body>
    </html>
  );
}
