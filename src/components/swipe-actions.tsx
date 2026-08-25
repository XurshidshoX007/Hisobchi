"use client";
/**
 * Swipe-to-reveal row actions — used by the History list.
 *
 * At rest a row's actions (Tahrirlash / Bekor qilish) are completely hidden:
 * they live in an underlay pinned to the row's right edge, covered by the
 * opaque foreground. A right-to-left horizontal drag slides the foreground
 * aside and reveals them. Releasing past the snap threshold (or with a fast
 * flick) keeps the row open; otherwise it springs back. An open row closes
 * when:
 *   - its foreground is tapped,
 *   - a rightward drag/flick pushes past the threshold,
 *   - one of its actions is tapped, or
 *   - the user starts swiping another row (its `open` prop flips to false).
 *
 * Desktop: touch gestures never fire, so the same reveal is declarative CSS —
 * :hover (pointer-gated) and :focus-within translate the foreground by the
 * same reveal width (globals.css). The buttons stay in the tab order, so
 * keyboard users reach them and focus-within keeps them visible.
 *
 * Gesture mechanics deliberately mirror <SwipeBack>: raw touch listeners,
 * per-frame state in refs, direct style writes, and re-renders only when the
 * committed `open` boolean changes. `touch-action: pan-y` keeps vertical
 * scrolling native; once a drag locks horizontal, move events are
 * preventDefaulted so the page cannot scroll mid-swipe. No coordination with
 * <SwipeBack> or <TabSwipe> is needed: that gesture is edge-gated and stays
 * disabled on the /transactions tab, while tab swipe is scoped to /plans
 * (see lib/navigation.ts and docs/PLANS-TAB-SWIPE.md).
 */

import { type ReactNode, useEffect, useRef } from "react";

/**
 * Reveal width in px: two 36px action buttons + one 2px gap + 4px inset on
 * each side (`gap-0.5 px-1` in the underlay). Keep in sync with
 * --swipe-actions-reveal in globals.css.
 */
export const SWIPE_ACTIONS_WIDTH = 82;

/** Horizontal distance after which a drag claims the touch. */
const LOCK_PX = 6;
/** Fast short release that commits by direction instead of distance. */
const FLICK_PX = 20;
const FLICK_MS = 250;
/** Fraction of the reveal width past which a release keeps the row open. */
const SNAP_RATIO = 0.45;

/**
 * One open row at a time without round-tripping through React mid-gesture:
 * the moment a drag locks horizontal, every OTHER open row animates closed.
 * The payload is the dragging row's identity, not its data id, so rows with
 * colliding data ids could never close each other.
 */
const ACTIVATE_EVENT = "hisobchi:swipe-row-activate";

export function lightImpact() {
  // Telegram WebView only: a soft mechanical tick when a row snaps open.
  // Optional everywhere and never fatal outside Telegram.
  try {
    const tg = (
      window as unknown as {
        Telegram?: { WebApp?: { HapticFeedback?: { impactOccurred?: (style: string) => void } } };
      }
    ).Telegram?.WebApp;
    tg?.HapticFeedback?.impactOccurred?.("light");
  } catch {
    /* noop */
  }
}

export function SwipeActions({
  open,
  onOpenChange,
  actions,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Buttons rendered in the hidden strip; their own styles are unchanged. */
  actions: ReactNode;
  /** The visible row body. It keeps its own background so the strip never bleeds through. */
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const foregroundRef = useRef<HTMLDivElement | null>(null);

  // Latest-value refs: the gesture listeners attach once, so the props they
  // consult are mirrored post-commit (refs must not be written during
  // render — the writes live in this effect).
  const openRef = useRef(open);
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    openRef.current = open;
    onOpenChangeRef.current = onOpenChange;
  });

  // Gesture state — lives in refs so per-frame moves never re-render.
  const identityRef = useRef<object>({});
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startTimeRef = useRef(0);
  const baseXRef = useRef(0);
  const xRef = useRef(0);
  const trackingRef = useRef(false);
  const lockedRef = useRef(false);
  const draggedRef = useRef(false);

  // Re-apply the committed position when `open` flips from the OUTSIDE (the
  // parent closing this row because another row was grabbed). Our own
  // gesture commits keep xRef in step, so this is idempotent. A row that
  // mounts closed deliberately gets NO inline transform: inline styles would
  // otherwise permanently override the CSS hover/focus reveal.
  const firstEffectRef = useRef(true);
  useEffect(() => {
    if (firstEffectRef.current) {
      firstEffectRef.current = false;
      if (!open) return;
    }
    const foreground = foregroundRef.current;
    if (!foreground) return;
    xRef.current = open ? -SWIPE_ACTIONS_WIDTH : 0;
    foreground.style.transition = "";
    foreground.style.transform = `translateX(${xRef.current}px)`;
  }, [open]);

  // A sibling starting its drag closes this row via its `open` prop.
  useEffect(() => {
    function onActivate(event: Event) {
      if ((event as CustomEvent).detail === identityRef.current) return;
      if (openRef.current) onOpenChangeRef.current(false);
    }
    window.addEventListener(ACTIVATE_EVENT, onActivate);
    return () => window.removeEventListener(ACTIVATE_EVENT, onActivate);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    function commit(nextOpen: boolean, haptic: boolean) {
      const foreground = foregroundRef.current;
      if (!foreground) return;
      const target = nextOpen ? -SWIPE_ACTIONS_WIDTH : 0;
      xRef.current = target;
      foreground.style.transition = "";
      foreground.style.transform = `translateX(${target}px)`;
      if (nextOpen !== openRef.current) {
        if (nextOpen && haptic) lightImpact();
        onOpenChangeRef.current(nextOpen);
      }
    }

    function onTouchStart(event: TouchEvent) {
      const touch = event.touches[0];
      if (!touch) return;
      startXRef.current = touch.clientX;
      startYRef.current = touch.clientY;
      startTimeRef.current = Date.now();
      baseXRef.current = xRef.current;
      trackingRef.current = true;
      lockedRef.current = false;
      draggedRef.current = false;
    }

    function onTouchMove(event: TouchEvent) {
      if (!trackingRef.current) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startXRef.current;
      const dy = touch.clientY - startYRef.current;

      if (!lockedRef.current) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < LOCK_PX) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          // Vertical intent — hand the gesture back to native scrolling
          // without having touched the row at all.
          trackingRef.current = false;
          return;
        }
        if (baseXRef.current === 0 && dx > 0) {
          // A closed row hides nothing on the left; a rightward swipe there
          // belongs to browser/shell gestures, never to this row.
          trackingRef.current = false;
          return;
        }
        lockedRef.current = true;
        draggedRef.current = true;
        const foreground = foregroundRef.current;
        if (foreground) foreground.style.transition = "none";
        window.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: identityRef.current }));
      }

      event.preventDefault();
      const foreground = foregroundRef.current;
      if (!foreground) return;
      const raw = baseXRef.current + dx;
      // Rubber-band past either edge instead of a hard stop; the commit
      // clamps back to 0 / -SWIPE_ACTIONS_WIDTH.
      let next = raw;
      if (raw > 0) next = raw * 0.3;
      else if (raw < -SWIPE_ACTIONS_WIDTH) next = -SWIPE_ACTIONS_WIDTH + (raw + SWIPE_ACTIONS_WIDTH) * 0.3;
      xRef.current = next;
      foreground.style.transform = `translateX(${next}px)`;
    }

    function onTouchEnd(event: TouchEvent) {
      if (!trackingRef.current) return;
      trackingRef.current = false;
      if (!lockedRef.current) return; // a plain tap — the click handlers decide
      lockedRef.current = false;
      const touch = event.changedTouches[0];
      const dx = touch ? touch.clientX - startXRef.current : 0;
      const flick = Date.now() - startTimeRef.current < FLICK_MS && Math.abs(dx) > FLICK_PX;
      const nextOpen = flick ? dx < 0 : Math.abs(xRef.current) > SWIPE_ACTIONS_WIDTH * SNAP_RATIO;
      commit(nextOpen, true);
    }

    function onTouchCancel() {
      if (!trackingRef.current) return;
      trackingRef.current = false;
      lockedRef.current = false;
      commit(openRef.current, false); // back to the last committed state
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
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="swipe-actions relative min-w-0 overflow-hidden"
      onClickCapture={(event) => {
        // Lifting the finger at the end of a drag must not fire a synthetic
        // click on whatever (row body or revealed action) sits under it.
        if (draggedRef.current) {
          draggedRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      {/* Underlay: revealed by the sliding foreground. The wrapper closes the
          row on any (enabled) action tap, so callers keep their original
          button handlers untouched. */}
      <div
        className="absolute inset-y-0 right-0 flex items-center gap-0.5 px-1"
        onClick={() => onOpenChangeRef.current(false)}
      >
        {actions}
      </div>
      <div
        ref={foregroundRef}
        className="swipe-actions-foreground relative bg-bg"
        style={{ touchAction: "pan-y" }}
        onClick={(event) => {
          // Tapping an open row's body only closes it — never acts on the row.
          if (!openRef.current) return;
          event.preventDefault();
          event.stopPropagation();
          onOpenChangeRef.current(false);
        }}
      >
        {children}
      </div>
    </div>
  );
}
