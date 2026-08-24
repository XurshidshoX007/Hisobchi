import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import "./globals.css";
import { FinanceProvider } from "@/components/providers";
import { AppShell } from "@/components/app-shell";

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f19" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="uz" suppressHydrationWarning>
      <body className="min-h-dvh bg-bg font-sans text-fg antialiased">
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <FinanceProvider>
          <AppShell>{children}</AppShell>
        </FinanceProvider>
      </body>
    </html>
  );
}
