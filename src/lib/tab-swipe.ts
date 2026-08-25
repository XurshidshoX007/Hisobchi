/**
 * Pure swipe calculation and boundary decision helpers for the TabSwipe gesture.
 * Used on the /plans page across To‘lovlar ⇄ Daromad ⇄ Pul oqimi sections.
 *
 * Spec reference: docs/PLANS-TAB-SWIPE.md
 */

/** Horizontal distance (px) after which a touch gesture claims horizontal intent. */
export const LOCK_PX = 6;

/** Touch dead zone (px) from viewport edges to prevent conflicting with OS gestures. */
export const EDGE_ZONE = 24;

/** Fast swipe distance threshold in px. */
export const FLICK_PX = 20;

/** Max duration in ms for a fast swipe to count as a flick. */
export const FLICK_MS = 250;

/** Fraction of container/viewport width required to commit the swipe on release without a flick. */
export const COMMIT_RATIO = 0.28;

/** Rubber-band resistance factor when dragging past boundary tabs. */
export const RUBBER_BAND_FACTOR = 0.3;

/** Maximum rubber-band displacement in px. */
export const RUBBER_BAND_MAX = 60;

/** Settle transition duration in ms. */
export const RESET_DURATION = 280;

/** House bezier easing curve for gesture settle animations. */
export const RESET_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Resolves the adjacent target tab based on current tab, order list, and drag displacement dx.
 * dx < 0 means swiping left (finger moving left), revealing the next tab in order.
 * dx > 0 means swiping right (finger moving right), revealing the previous tab in order.
 * Returns null if at boundary (rubber-band zone) or if dx === 0.
 */
export function swipeTarget<T extends string>(
  current: T,
  order: readonly T[],
  dx: number,
): T | null {
  if (dx === 0) return null;
  const index = order.indexOf(current);
  if (index === -1) return null;

  if (dx < 0) {
    return index < order.length - 1 ? order[index + 1] : null;
  }
  return index > 0 ? order[index - 1] : null;
}

export type SwipeCommitParams = {
  dx: number;
  width: number;
  elapsedMs?: number;
  vx?: number;
};

/**
 * Determines whether a swipe gesture should commit to the adjacent tab or spring back.
 * Commits if:
 * 1. Elapsed time <= FLICK_MS and displacement >= FLICK_PX (flick).
 * 2. Velocity vx >= FLICK_PX / FLICK_MS and displacement >= LOCK_PX.
 * 3. Displacement >= width * COMMIT_RATIO (distance threshold).
 */
export function decideSwipeCommit({
  dx,
  width,
  elapsedMs,
  vx,
}: SwipeCommitParams): boolean {
  if (width <= 0) return false;
  const absDx = Math.abs(dx);

  if (elapsedMs !== undefined && elapsedMs <= FLICK_MS && absDx >= FLICK_PX) {
    return true;
  }
  if (vx !== undefined && Math.abs(vx) >= FLICK_PX / FLICK_MS && absDx >= LOCK_PX) {
    return true;
  }

  return absDx >= width * COMMIT_RATIO;
}

/**
 * Calculates rubber-band damped displacement when pulling past tab boundaries.
 */
export function rubberBandDisplacement(
  dx: number,
  factor = RUBBER_BAND_FACTOR,
  max = RUBBER_BAND_MAX,
): number {
  const displacement = dx * factor;
  if (Math.abs(displacement) > max) {
    return Math.sign(displacement) * max;
  }
  return displacement;
}

/**
 * Detects if a touch target is inside a horizontally scrollable element that can
 * still scroll in the gesture direction dx.
 */
export function canScrollHorizontally(
  target: Element | null,
  root: Element | null,
  dx: number,
): boolean {
  if (!target) return false;
  if (target.closest("[data-tab-swipe-ignore], [data-segmented-scroll]")) {
    return true;
  }
  let current: Element | null = target;
  while (current && current !== root && current !== document.body) {
    if (current.scrollWidth > current.clientWidth) {
      try {
        const style = window.getComputedStyle(current);
        const ox = style.overflowX;
        if (ox === "auto" || ox === "scroll") {
          // Swiping left (dx < 0) scrolls content right
          if (dx < 0 && current.scrollLeft < current.scrollWidth - current.clientWidth - 1) {
            return true;
          }
          // Swiping right (dx > 0) scrolls content left
          if (dx > 0 && current.scrollLeft > 1) {
            return true;
          }
        }
      } catch {
        /* noop in test / SSR environments */
      }
    }
    current = current.parentElement;
  }
  return false;
}
