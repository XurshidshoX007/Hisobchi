"use client";
/* eslint-disable react-hooks/set-state-in-effect -- window.name is only defined after hydration */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useFinance } from "./providers";

/**
 * Demo-only device preview.
 *
 * The product is a Telegram Mini App, so the mobile layout is the primary
 * surface — but a desktop browser shows the wide layout (sidebar). This small
 * control frames the app in a phone viewport so the mobile design can be
 * reviewed directly in the preview, without resizing the window.
 *
 * Safety rails:
 *  - Renders only for the demo user (`state.user.isDemo`), so production
 *    Telegram users never see it.
 *  - Recursion guard via `window.name`: the phone frame is opened with a
 *    dedicated window name, and the app inside that frame skips rendering the
 *    control. Window names survive client-side navigation, so the nested app
 *    stays clean while the user moves between pages. (We intentionally do NOT
 *    check `window.self === window.top` — the preview panel itself embeds the
 *    app in an iframe, and the toggle must still be visible there.)
 *  - The frame is a real iframe, so `position: fixed`, `100dvh`, safe-area
 *    insets and bottom navigation all behave exactly as on a device.
 */

/** Window name given to the phone frame; the nested app hides its toggle. */
const DEVICE_FRAME_NAME = "hisobchi-device-frame";

export function PreviewDevice() {
  const { state } = useFinance();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [deviceFrame, setDeviceFrame] = useState(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDeviceFrame(window.name === DEVICE_FRAME_NAME);
  }, []);

  const isDemo = Boolean(state?.user.isDemo);
  if (!mounted || !isDemo || deviceFrame) return null;

  const href = `${pathname || "/"}${window.location.search}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setMobile((value) => !value)}
        aria-pressed={mobile}
        className="fixed right-3 top-3 z-[1000] inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[12px] font-semibold text-fg-soft shadow-lg shadow-black/10 transition-colors hover:border-line-strong hover:text-fg active:bg-surface-3 touch-manipulation sm:right-4 sm:top-4"
      >
        <span aria-hidden="true">{mobile ? "🖥️" : "📱"}</span>
        {mobile ? "Desktop" : "Mobil ko‘rinish"}
      </button>

      {mobile ? (
        <div className="fixed inset-0 z-[990] flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm sm:p-6">
          <div
            className="relative flex h-[min(844px,96dvh)] w-[390px] max-w-full flex-col overflow-hidden rounded-[44px] border-[10px] border-[#0a0a0f] bg-[#0a0a0f] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)]"
            role="dialog"
            aria-label="Mobil qurilma ko‘rinishi"
          >
            {/* status bar + dynamic island */}
            <div className="relative flex h-8 shrink-0 items-center justify-center bg-[#0a0a0f]">
              <div className="absolute left-4 flex items-center gap-1 text-[10px] font-semibold text-white/80">
                <span aria-hidden="true">9:41</span>
              </div>
              <div className="h-[22px] w-[92px] rounded-full bg-black ring-1 ring-white/10" aria-hidden="true" />
              <div className="absolute right-4 flex items-center gap-1 text-[10px] text-white/80" aria-hidden="true">
                <span>●●●</span>
              </div>
            </div>
            {/* home indicator */}
            <div className="flex h-5 shrink-0 items-end justify-center bg-[#0a0a0f] pb-1.5">
              <div className="h-1 w-28 rounded-full bg-white/25" aria-hidden="true" />
            </div>
            <iframe
              key={href}
              name={DEVICE_FRAME_NAME}
              src={href}
              title="Mobil qurilma ko‘rinishi"
              className="h-full w-full flex-1 border-0 bg-bg"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
