"use client";
/**
 * iOS-style swipe-back gesture for mobile sub-pages.
 *
 * Detects a horizontal swipe starting from the left edge of the screen.
 * While swiping, the wrapped content translates right and a back-arrow
 * indicator fades in. On release, if the swipe exceeds the threshold
 * (~35% of viewport width) the browser navigates back; otherwise the
 * page springs back to its original position.
 *
 * Only fires on touch devices within the safe left-edge zone (first 24 px)
 * so it never competes with horizontal scroll or swipeable controls (such as
 * History row swipe-actions or the /plans TabSwipe gesture).
 */

import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef } from "react";

const EDGE_ZONE = 24; // px — touch must start within this distance from left
const THRESHOLD = 0.28; // fraction of viewport width required to trigger back
const MAX_TRANSLATE = 260; // px — maximum page translation during swipe
const RESET_DURATION = 280;

/**
 * While the page is translated, the document must not gain horizontal
 * overflow (that shifts the underlying Menu). `globals.css` scopes
 * `overflow-x: clip` to this attribute so the clip exists ONLY during the
 * gesture and its exit animation — never permanently, where it would conceal
 * page-width bugs.
 */
const SWIPE_ATTR = "data-swipe-back";

export function SwipeBack({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const arrowRef = useRef<HTMLDivElement | null>(null);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs for touch state — never cause re-renders during gesture tracking.
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const swipingRef = useRef(false);
  const lockedRef = useRef(false);

  const finish = useCallback(
    (triggerBack: boolean) => {
      const el = containerRef.current;
      if (!el) return;
      el.style.transition = "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)";
      el.style.transform = triggerBack ? "translateX(100vw)" : "translateX(0)";
      if (arrowRef.current) {
        arrowRef.current.style.transition =
          "opacity 280ms cubic-bezier(0.22, 1, 0.36, 1)";
        arrowRef.current.style.opacity = "0";
      }
      if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = setTimeout(() => {
        releaseTimerRef.current = null;
        if (triggerBack) {
          // Let the exit animation finish before changing the route. Navigating
          // halfway through it leaves the shell with a stale horizontal
          // transform and makes the Menu cards appear shifted on return.
          // The attribute stays on until the route-change cleanup below runs,
          // so the translated frame never widens the document.
          router.back();
        } else {
          document.body.removeAttribute(SWIPE_ATTR);
        }
      }, RESET_DURATION);
    },
    [router],
  );

  useEffect(() => {
    if (!enabled) return;
    // Capture the container node once per effect run: the cleanup must reset
    // the SAME element the gesture animated, not whatever the ref points to
    // after a route change (react-hooks/exhaustive-deps ref guidance).
    const container = containerRef.current;

    function onTouchStart(e: TouchEvent) {
      // Don't interfere when a sheet is open
      if (document.body.hasAttribute("data-sheet-open")) return;
      const touch = e.touches[0];
      if (!touch) return;
      if (touch.clientX > EDGE_ZONE) return;

      startXRef.current = touch.clientX;
      startYRef.current = touch.clientY;
      swipingRef.current = true;
      lockedRef.current = false;
    }

    function onTouchMove(e: TouchEvent) {
      if (!swipingRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;

      const dx = touch.clientX - startXRef.current;
      const dy = touch.clientY - startYRef.current;

      // A leftward gesture from the edge is not a back gesture. In
      // particular, never apply a negative transform: that creates page
      // overflow and makes the underlying Menu jump sideways.

      // On the first significant move, decide whether this is horizontal or vertical.
      if (!lockedRef.current) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        lockedRef.current = true;
        if (Math.abs(dy) > Math.abs(dx)) {
          // Vertical gesture — abort swipe-back entirely.
          swipingRef.current = false;
          return;
        }
      }

      // Only block default for rightward horizontal swipes. A leftward move
      // must remain completely native and must not touch the page transform.
      if (dx <= 0) {
        swipingRef.current = false;
        // The gesture may have already translated the page on earlier frames —
        // release the overflow clip and any residual transform immediately.
        document.body.removeAttribute(SWIPE_ATTR);
        if (containerRef.current) {
          containerRef.current.style.transform = "";
          containerRef.current.style.transition = "";
        }
        return;
      }
      e.preventDefault();

      const el = containerRef.current;
      if (!el) return;

      const clamped = Math.min(dx, MAX_TRANSLATE);
      const ratio = clamped / MAX_TRANSLATE;

      // The page is about to be translated — clip horizontal overflow for the
      // duration of the gesture only (see SWIPE_ATTR).
      document.body.setAttribute(SWIPE_ATTR, "");

      el.style.transition = "none";
      el.style.transform = `translateX(${clamped}px)`;

      // Create arrow indicator if needed
      if (!arrowRef.current) {
        const arrow = document.createElement("div");
        arrow.style.cssText =
          "position:fixed;left:8px;top:50%;transform:translateY(-50%);z-index:999;opacity:0;transition:none;pointer-events:none;";
        arrow.innerHTML =
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
        document.body.appendChild(arrow);
        arrowRef.current = arrow;
      }
      arrowRef.current.style.opacity = String(Math.min(1, ratio * 2.5));
      arrowRef.current.style.transform = `translateY(-50%) scale(${0.8 + ratio * 0.2})`;
    }

    function onTouchEnd(e: TouchEvent) {
      if (!swipingRef.current) return;
      swipingRef.current = false;

      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - startXRef.current;

      finish(dx > window.innerWidth * THRESHOLD);
    }

    function onTouchCancel() {
      if (!swipingRef.current) return;
      swipingRef.current = false;
      finish(false);
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
      // Always restore inline state as well as removing the indicator. This is
      // important when the route changes without completing a gesture.
      if (releaseTimerRef.current) {
        clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = null;
      }
      document.body.removeAttribute(SWIPE_ATTR);
      if (container) {
        container.style.transform = "";
        container.style.transition = "";
      }
      if (arrowRef.current?.isConnected) {
        arrowRef.current.remove();
        arrowRef.current = null;
      }
    };
  }, [enabled, finish]);

  return (
    <div ref={containerRef} style={{ willChange: "transform" }}>
      {children}
    </div>
  );
}
