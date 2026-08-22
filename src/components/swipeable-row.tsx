"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface SwipeableRowProps {
  children: ReactNode;
  /** Called when edit action is triggered */
  onEdit?: () => void;
  /** Called when delete action is triggered */
  onDelete?: () => void;
  /** Disable edit button (e.g. debt operations) */
  editDisabled?: boolean;
  /** Disable delete button (e.g. debt creation) */
  deleteDisabled?: boolean;
  /** External control: whether this row is currently open */
  isOpen?: boolean;
  /** Notify parent when open state should change */
  onOpenChange?: (open: boolean) => void;
  /** Optional aria labels */
  editLabel?: string;
  deleteLabel?: string;
}

/**
 * Modern iOS-style swipe-to-reveal row.
 * Swipe left (finger moves left) reveals actions on the right.
 * High-precision gesture handling with spring physics, safe for lists.
 * Does not interfere with vertical scrolling.
 */
export function SwipeableRow({
  children,
  onEdit,
  onDelete,
  editDisabled = false,
  deleteDisabled = false,
  isOpen: controlledOpen,
  onOpenChange,
  editLabel = "Tahrirlash",
  deleteLabel = "O‘chirish",
}: SwipeableRowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  // Internal state when uncontrolled
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  // Gesture refs (never cause re-render)
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const isDragging = useRef(false);
  const hasMoved = useRef(false);
  const lockedAxis = useRef<"x" | "y" | null>(null);

  const ACTION_WIDTH = 88; // px — each button ~44px + gap, total ~88px
  const THRESHOLD = 0.35; // fraction of ACTION_WIDTH to snap open

  const setOpen = useCallback(
    (open: boolean) => {
      if (isControlled) {
        onOpenChange?.(open);
      } else {
        setInternalOpen(open);
      }
    },
    [isControlled, onOpenChange]
  );

  // Smoothly animate content to target offset
  const animateTo = useCallback((targetX: number, duration = 280) => {
    const content = contentRef.current;
    if (!content) return;

    content.style.transition = `transform ${duration}ms cubic-bezier(0.32, 0.72, 0, 1)`;
    content.style.transform = `translateX(${targetX}px)`;

    // Clean up transition after animation
    const cleanup = () => {
      if (content) {
        content.style.transition = "";
      }
    };
    setTimeout(cleanup, duration + 20);
  }, []);

  // Close this row
  const close = useCallback(() => {
    animateTo(0);
    setOpen(false);
  }, [animateTo, setOpen]);

  // Open this row (reveal actions)
  const open = useCallback(() => {
    animateTo(-ACTION_WIDTH);
    setOpen(true);
  }, [animateTo, setOpen]);

  // Sync external controlled state
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    if (isOpen) {
      content.style.transition = "transform 280ms cubic-bezier(0.32, 0.72, 0, 1)";
      content.style.transform = `translateX(-${ACTION_WIDTH}px)`;
    } else {
      content.style.transition = "transform 280ms cubic-bezier(0.32, 0.72, 0, 1)";
      content.style.transform = `translateX(0px)`;
    }
  }, [isOpen]);

  // Handle click outside to close (only when open)
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const container = containerRef.current;
      if (container && !container.contains(e.target as Node)) {
        close();
      }
    };

    // Also close on any scroll (list scrolling)
    const handleScroll = () => {
      if (isOpen) close();
    };

    document.addEventListener("mousedown", handleClickOutside, { passive: true });
    document.addEventListener("touchstart", handleClickOutside, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true, capture: true });

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [isOpen, close]);

  // Touch gesture handlers
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;

    startX.current = touch.clientX;
    startY.current = touch.clientY;
    currentX.current = touch.clientX;
    isDragging.current = true;
    hasMoved.current = false;
    lockedAxis.current = null;

    // Cancel any existing transition
    const content = contentRef.current;
    if (content) {
      content.style.transition = "none";
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;

    const touch = e.touches[0];
    if (!touch) return;

    const dx = touch.clientX - startX.current;
    const dy = touch.clientY - startY.current;

    // Lock axis on first significant movement
    if (!lockedAxis.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;

      if (Math.abs(dy) > Math.abs(dx) * 1.3) {
        // Vertical gesture — abort swipe entirely
        lockedAxis.current = "y";
        isDragging.current = false;
        const content = contentRef.current;
        if (content) {
          content.style.transition = "";
          content.style.transform = isOpen ? `translateX(-${ACTION_WIDTH}px)` : "translateX(0)";
        }
        return;
      }
      lockedAxis.current = "x";
    }

    if (lockedAxis.current !== "x") return;

    // Only allow leftward swipe (negative dx)
    const clampedDx = Math.max(Math.min(dx, 0), -ACTION_WIDTH * 1.15);

    const content = contentRef.current;
    if (content) {
      content.style.transform = `translateX(${clampedDx}px)`;
    }

    currentX.current = touch.clientX;
    hasMoved.current = true;

    // Prevent page scroll while swiping horizontally
    if (Math.abs(clampedDx) > 4) {
      e.preventDefault();
    }
  }, [isOpen]);

  const onTouchEnd = useCallback(() => {
    if (!isDragging.current || !hasMoved.current) {
      isDragging.current = false;
      return;
    }

    isDragging.current = false;
    lockedAxis.current = null;

    const content = contentRef.current;
    if (!content) return;

    const dx = currentX.current - startX.current;
    const shouldOpen = dx < -ACTION_WIDTH * THRESHOLD;

    if (shouldOpen && !isOpen) {
      // Snap open
      animateTo(-ACTION_WIDTH);
      setOpen(true);
    } else if (!shouldOpen && isOpen) {
      // Snap closed
      animateTo(0);
      setOpen(false);
    } else if (isOpen) {
      // Stay open
      animateTo(-ACTION_WIDTH, 120);
    } else {
      // Stay closed
      animateTo(0, 120);
    }
  }, [animateTo, setOpen, isOpen]);

  // Action handlers
  const handleEdit = useCallback(() => {
    if (editDisabled || !onEdit) return;
    close();
    // Small delay so swipe animation finishes before sheet opens
    setTimeout(() => {
      onEdit();
    }, 180);
  }, [editDisabled, onEdit, close]);

  const handleDelete = useCallback(() => {
    if (deleteDisabled || !onDelete) return;
    close();
    setTimeout(() => {
      onDelete();
    }, 180);
  }, [deleteDisabled, onDelete, close]);

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden touch-pan-y select-none"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => {
        isDragging.current = false;
        const content = contentRef.current;
        if (content) {
          content.style.transition = "transform 200ms cubic-bezier(0.32, 0.72, 0, 1)";
          content.style.transform = isOpen
            ? `translateX(-${ACTION_WIDTH}px)`
            : "translateX(0)";
        }
      }}
    >
      {/* Main content that translates */}
      <div
        ref={contentRef}
        className="relative z-10 flex min-w-0 items-center gap-2.5 bg-surface py-3 pr-1 transition-transform will-change-transform"
        style={{
          transform: isOpen ? `translateX(-${ACTION_WIDTH}px)` : "translateX(0)",
        }}
      >
        {children}
      </div>

      {/* Action buttons — revealed on right when swiped */}
      <div
        ref={actionsRef}
        className="absolute right-0 top-0 bottom-0 z-20 flex items-center overflow-hidden rounded-r-2xl"
        style={{ width: ACTION_WIDTH }}
      >
        <div className="flex h-full w-full items-center bg-surface-2">
          {/* Edit button */}
          <button
            type="button"
            onClick={handleEdit}
            disabled={editDisabled}
            aria-label={editLabel}
            className="flex h-full w-1/2 flex-col items-center justify-center gap-0.5 bg-accent/90 active:bg-accent text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
            <span className="text-[9.5px] font-medium tracking-[-0.2px]">Tahrir</span>
          </button>

          {/* Delete button */}
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteDisabled}
            aria-label={deleteLabel}
            className="flex h-full w-1/2 flex-col items-center justify-center gap-0.5 bg-negative active:bg-[#b71c1c] text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <span className="text-[9.5px] font-medium tracking-[-0.2px]">O‘chir</span>
          </button>
        </div>
      </div>
    </div>
  );
}
