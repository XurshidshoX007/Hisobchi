"use client";

import { useState } from "react";
import { Button, ContextualBottomSheet } from "./ui";
import { Icon } from "@/components/icon";

/**
 * ONE grammar for "what can I do with this row?".
 *
 * A list row shows at most one primary action; everything else lives behind
 * "•••" and opens this sheet. Before this existed, Accounts, Budgets and Debts
 * each lined up two to four equal-weight pills on their own line — nothing said
 * which one mattered, and "O‘chirish" carried exactly as much visual weight as
 * "Tahrir".
 *
 * Destructive actions confirm IN PLACE rather than opening a second sheet:
 * stacking modals to ask one question is heavier than the question deserves,
 * and the row's own name stays visible in the header while you decide.
 */
export type RowAction = {
  id: string;
  label: string;
  icon: string;
  description?: string;
  tone?: "default" | "danger";
  /** Present ⇒ the action asks before it runs. */
  confirm?: {
    title: string;
    body: string;
    /** Label of the confirming button, e.g. "O‘chirish". */
    verb: string;
    busyVerb: string;
  };
};

export function RowActionsSheet({
  open,
  onClose,
  title,
  eyebrow,
  icon = "more",
  iconTone = "neutral",
  actions,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  icon?: string;
  iconTone?: "positive" | "negative" | "accent" | "gold" | "neutral";
  actions: RowAction[];
  /** Runs after confirmation when the action needs one. */
  onSelect: (id: string) => void | Promise<unknown>;
}) {
  const [pending, setPending] = useState<RowAction | null>(null);
  const [busy, setBusy] = useState(false);

  // A reopened sheet always starts on the list, never mid-confirmation. Adjusted
  // during render (React's documented pattern for reacting to a prop change)
  // rather than in an effect, which would render the stale step once first.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPending(null);
      setBusy(false);
    }
  }

  async function run(action: RowAction) {
    if (busy) return;
    setBusy(true);
    try {
      await onSelect(action.id);
    } finally {
      setBusy(false);
      setPending(null);
      onClose();
    }
  }

  const confirming = pending?.confirm;

  return (
    <ContextualBottomSheet
      open={open}
      onClose={() => {
        if (busy) return;
        // Step back to the list rather than closing the whole sheet.
        if (pending) {
          setPending(null);
          return;
        }
        onClose();
      }}
      title={confirming ? confirming.title : title}
      subtitle={confirming ? title : undefined}
      icon={confirming ? "warning" : icon}
      iconTone={confirming ? "negative" : iconTone}
      eyebrow={confirming ? undefined : eyebrow}
      footer={
        confirming ? (
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setPending(null)} disabled={busy}>
              Qaytish
            </Button>
            <Button variant="danger" className="flex-[2]" onClick={() => pending && run(pending)} disabled={busy}>
              {busy ? confirming.busyVerb : confirming.verb}
            </Button>
          </>
        ) : undefined
      }
    >
      {confirming ? (
        <p className="text-[13px] leading-relaxed text-muted">{confirming.body}</p>
      ) : (
        <div className="min-w-0 space-y-2">
          {actions.map((action) => {
            const danger = action.tone === "danger";
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => (action.confirm ? setPending(action) : run(action))}
                className={`flex min-h-12 w-full min-w-0 max-w-full items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-2 text-left text-[14px] font-medium transition-colors hover:border-line-strong hover:bg-surface-3 active:bg-surface-3 touch-manipulation ${
                  danger ? "text-negative-text" : ""
                }`}
              >
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                  style={
                    danger
                      ? { background: "var(--tint-red)", color: "var(--red)" }
                      : { background: "var(--tint-neutral)", color: "var(--fg-soft)" }
                  }
                  aria-hidden="true"
                >
                  <Icon name={action.icon} size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words leading-tight">{action.label}</span>
                  {action.description ? (
                    <span className="mt-0.5 block break-words text-[11.5px] font-normal leading-snug text-muted">
                      {action.description}
                    </span>
                  ) : null}
                </span>
                <Icon name="chevron-right" size={13} className="shrink-0 text-text-4" />
              </button>
            );
          })}
        </div>
      )}
    </ContextualBottomSheet>
  );
}

/** The trailing "•••" control every list row uses to reach the sheet above. */
export function RowActionsButton({
  label,
  onClick,
  comfortable = false,
}: {
  label: string;
  onClick: () => void;
  /** Opt-in 44px touch target for rows whose primary action uses that height. */
  comfortable?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} — boshqa amallar`}
      className={`grid shrink-0 place-items-center rounded-full border border-line bg-surface text-fg-soft transition-colors hover:border-line-strong hover:text-fg active:bg-surface-3 touch-manipulation ${comfortable ? "h-11 w-11" : "h-9 w-9"}`}
    >
      <Icon name="more" size={16} />
    </button>
  );
}
