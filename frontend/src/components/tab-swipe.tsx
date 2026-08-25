/* eslint-disable react-hooks/set-state-in-effect -- ghost state is reset when the committed value changes externally */


import { useEffect, useRef, useState, type ReactNode } from "react";
import { lightImpact } from "@/components/swipe-actions";
import {
  canScrollHorizontally,
  decideSwipeCommit,
  EDGE_ZONE,
  LOCK_PX,
  RESET_DURATION,
  RESET_EASING,
  rubberBandDisplacement,
  swipeTarget,
} from "@/lib/tab-swipe";

export type TabSwipeProps<T extends string> = {
  value: T;
  order: readonly T[];
  onChange: (next: T) => void;
  render: (tab: T) => ReactNode;
  className?: string;
};

/**
 * High-performance horizontal swipe navigation for section tabs.
 *
 * Built with the ghost-pane rendering model:
 * - Active tab pane stays in normal document flow.
 * - During horizontal drag, the adjacent tab is mounted as an absolutely positioned ghost pane.
 * - Both translate 1:1 with touch displacement via direct style.transform writes.
 * - Inactive panes remain unmounted at rest.
 * - Axis lock (6px) keeps vertical scrolling 100% native.
 * - 24px screen-edge dead zones prevent OS navigation gesture conflicts.
 * - Respects prefers-reduced-motion: instant tab commit without drag transforms.
 *
 * Spec reference: docs/PLANS-TAB-SWIPE.md
 */
export function TabSwipe<T extends string>({
  value,
  order,
  onChange,
  render,
  className,
}: TabSwipeProps<T>) {
  const [ghostTab, setGhostTab] = useState<T | null>(null);
  const [ghostDirection, setGhostDirection] = useState<"next" | "prev">("next");

  const rootRef = useRef<HTMLDivElement | null>(null);
  const activePaneRef = useRef<HTMLDivElement | null>(null);
  const ghostPaneRef = useRef<HTMLDivElement | null>(null);

  // Latest-value refs: touch listeners attach once and read current props
  const valueRef = useRef(value);
  const orderRef = useRef(order);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    valueRef.current = value;
    orderRef.current = order;
    onChangeRef.current = onChange;
  });

  // Reset any ghost state if committed value changes externally
  const animatingRef = useRef(false);
  useEffect(() => {
    if (!animatingRef.current) {
      setGhostTab(null);
      if (activePaneRef.current) {
        activePaneRef.current.style.transform = "";
        activePaneRef.current.style.transition = "";
        activePaneRef.current.style.willChange = "";
      }
    }
  }, [value]);

  // Gesture state in refs for 60fps tracking without React re-renders
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startTimeRef = useRef(0);
  const currentDxRef = useRef(0);
  const trackingRef = useRef(false);
  const lockedRef = useRef(false);
  const draggedRef = useRef(false);
  const targetTabRef = useRef<T | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setGhostPaneEl = (el: HTMLDivElement | null) => {
    ghostPaneRef.current = el;
    if (el && lockedRef.current) {
      el.style.transition = "none";
      el.style.willChange = "transform";
      el.style.transform = `translateX(${currentDxRef.current}px)`;
    }
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    function onTouchStart(e: TouchEvent) {
      if (animatingRef.current) return;
      if (document.body.hasAttribute("data-sheet-open") || document.body.dataset.sheetOpen === "1") return;

      const touch = e.touches[0];
      if (!touch) return;

      // Safe margin for OS navigation gestures (iOS back edge, Android navigation)
      if (touch.clientX < EDGE_ZONE || touch.clientX > window.innerWidth - EDGE_ZONE) {
        return;
      }

      const target = e.target as HTMLElement | null;
      if (target?.closest?.("[data-tab-swipe-ignore], [data-segmented-scroll]")) {
        return;
      }

      startXRef.current = touch.clientX;
      startYRef.current = touch.clientY;
      startTimeRef.current = Date.now();
      currentDxRef.current = 0;
      trackingRef.current = true;
      lockedRef.current = false;
      draggedRef.current = false;
      targetTabRef.current = null;
    }

    function onTouchMove(e: TouchEvent) {
      if (!trackingRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;

      const dx = touch.clientX - startXRef.current;
      const dy = touch.clientY - startYRef.current;

      if (!lockedRef.current) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < LOCK_PX) return;

        // Vertical scroll intent — release gesture immediately to native scrolling
        if (Math.abs(dy) > Math.abs(dx)) {
          trackingRef.current = false;
          return;
        }

        // Horizontal scroll container inside content (e.g. chart strip)
        const target = e.target as HTMLElement | null;
        if (canScrollHorizontally(target, rootRef.current, dx)) {
          trackingRef.current = false;
          return;
        }

        lockedRef.current = true;
        draggedRef.current = true;

        const targetTab = swipeTarget(valueRef.current, orderRef.current, dx);
        targetTabRef.current = targetTab;

        const isReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (!isReducedMotion) {
          document.body.setAttribute("data-tab-swipe", "");
          if (targetTab) {
            setGhostTab(targetTab);
            setGhostDirection(dx < 0 ? "next" : "prev");
          } else {
            setGhostTab(null);
          }
          if (activePaneRef.current) {
            activePaneRef.current.style.transition = "none";
            activePaneRef.current.style.willChange = "transform";
          }
        }
      }

      e.preventDefault();
      const isReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (isReducedMotion) return;

      const targetTab = targetTabRef.current;
      if (targetTab) {
        currentDxRef.current = dx;
        if (activePaneRef.current) {
          activePaneRef.current.style.transform = `translateX(${dx}px)`;
        }
        if (ghostPaneRef.current) {
          ghostPaneRef.current.style.transform = `translateX(${dx}px)`;
        }
      } else {
        const rx = rubberBandDisplacement(dx);
        currentDxRef.current = rx;
        if (activePaneRef.current) {
          activePaneRef.current.style.transform = `translateX(${rx}px)`;
        }
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (!trackingRef.current) return;
      trackingRef.current = false;

      if (!lockedRef.current) return;
      lockedRef.current = false;

      const touch = e.changedTouches[0];
      const dx = touch ? touch.clientX - startXRef.current : currentDxRef.current;
      const elapsedMs = Date.now() - startTimeRef.current;
      const width = rootRef.current?.clientWidth || window.innerWidth;

      const targetTab = targetTabRef.current;
      const committed = targetTab !== null && decideSwipeCommit({ dx, width, elapsedMs });

      const isReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (isReducedMotion) {
        if (committed && targetTab) {
          lightImpact();
          onChangeRef.current(targetTab);
        }
        return;
      }

      animatingRef.current = true;

      const activeEl = activePaneRef.current;
      const ghostEl = ghostPaneRef.current;

      if (committed && targetTab) {
        lightImpact();
        const targetX = dx < 0 ? -width : width;
        if (activeEl) {
          activeEl.style.transition = `transform ${RESET_DURATION}ms ${RESET_EASING}`;
          activeEl.style.transform = `translateX(${targetX}px)`;
        }
        if (ghostEl) {
          ghostEl.style.transition = `transform ${RESET_DURATION}ms ${RESET_EASING}`;
          ghostEl.style.transform = `translateX(${targetX}px)`;
        }

        settleTimerRef.current = setTimeout(() => {
          settleTimerRef.current = null;
          onChangeRef.current(targetTab);
          if (activeEl) {
            activeEl.style.transition = "";
            activeEl.style.transform = "";
            activeEl.style.willChange = "";
          }
          if (ghostEl) {
            ghostEl.style.transition = "";
            ghostEl.style.transform = "";
            ghostEl.style.willChange = "";
          }
          setGhostTab(null);
          document.body.removeAttribute("data-tab-swipe");
          animatingRef.current = false;
        }, RESET_DURATION);
      } else {
        // Spring back
        if (activeEl) {
          activeEl.style.transition = `transform ${RESET_DURATION}ms ${RESET_EASING}`;
          activeEl.style.transform = "translateX(0px)";
        }
        if (ghostEl) {
          ghostEl.style.transition = `transform ${RESET_DURATION}ms ${RESET_EASING}`;
          ghostEl.style.transform = "translateX(0px)";
        }

        settleTimerRef.current = setTimeout(() => {
          settleTimerRef.current = null;
          if (activeEl) {
            activeEl.style.transition = "";
            activeEl.style.transform = "";
            activeEl.style.willChange = "";
          }
          if (ghostEl) {
            ghostEl.style.transition = "";
            ghostEl.style.transform = "";
            ghostEl.style.willChange = "";
          }
          setGhostTab(null);
          document.body.removeAttribute("data-tab-swipe");
          animatingRef.current = false;
        }, RESET_DURATION);
      }
    }

    function onTouchCancel() {
      if (!trackingRef.current) return;
      trackingRef.current = false;
      if (!lockedRef.current) return;
      lockedRef.current = false;

      const isReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (isReducedMotion) return;

      animatingRef.current = true;
      const activeEl = activePaneRef.current;
      const ghostEl = ghostPaneRef.current;
      if (activeEl) {
        activeEl.style.transition = `transform ${RESET_DURATION}ms ${RESET_EASING}`;
        activeEl.style.transform = "translateX(0px)";
      }
      if (ghostEl) {
        ghostEl.style.transition = `transform ${RESET_DURATION}ms ${RESET_EASING}`;
        ghostEl.style.transform = "translateX(0px)";
      }
      settleTimerRef.current = setTimeout(() => {
        settleTimerRef.current = null;
        if (activeEl) {
          activeEl.style.transition = "";
          activeEl.style.transform = "";
          activeEl.style.willChange = "";
        }
        if (ghostEl) {
          ghostEl.style.transition = "";
          ghostEl.style.transform = "";
          ghostEl.style.willChange = "";
        }
        setGhostTab(null);
        document.body.removeAttribute("data-tab-swipe");
        animatingRef.current = false;
      }, RESET_DURATION);
    }

    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    root.addEventListener("touchend", onTouchEnd, { passive: true });
    root.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("touchcancel", onTouchCancel);
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      document.body.removeAttribute("data-tab-swipe");
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={className ? `relative min-w-0 w-full overflow-visible ${className}` : "relative min-w-0 w-full overflow-visible"}
      style={{ touchAction: "pan-y" }}
      onClickCapture={(event) => {
        if (draggedRef.current) {
          draggedRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <div ref={activePaneRef} className="w-full">
        {render(value)}
      </div>

      {ghostTab !== null ? (
        <div
          ref={setGhostPaneEl}
          aria-hidden="true"
          className="absolute top-0 w-full"
          style={{
            left: ghostDirection === "next" ? "100%" : "-100%",
            pointerEvents: "none",
          }}
        >
          {render(ghostTab)}
        </div>
      ) : null}
    </div>
  );
}
