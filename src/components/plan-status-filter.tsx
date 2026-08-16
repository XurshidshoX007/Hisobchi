"use client";

import { useId, useState } from "react";
import type { PlanListTab } from "@/lib/finance";
import { Sheet } from "./ui";

const STATUS_OPTIONS: Array<{ value: PlanListTab; label: string }> = [
  { value: "open", label: "Faol" },
  { value: "paused", label: "Pauza" },
  { value: "completed", label: "Yakunlangan" },
  { value: "cancelled", label: "Bekor qilingan" },
];

export function PlanStatusFilter({
  value,
  onChange,
  kind,
}: {
  value: PlanListTab;
  onChange: (value: PlanListTab) => void;
  kind: "payments" | "income";
}) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const filtered = value !== "open";
  const selectedLabel = STATUS_OPTIONS.find((option) => option.value === value)?.label ?? "Faol";
  const title = kind === "payments" ? "To‘lovlarni filtrlash" : "Daromadlarni filtrlash";

  function select(next: PlanListTab) {
    onChange(next);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={title}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={contentId}
        className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-[12px] font-medium transition-colors touch-manipulation ${
          filtered
            ? "border-accent bg-accent-soft text-accent-text"
            : "border-line bg-surface text-muted hover:border-line-strong hover:text-fg"
        }`}
      >
        <FunnelIcon />
        <span>{filtered ? `Filtr · ${selectedLabel}` : "Filtr"}</span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <div id={contentId} role="radiogroup" aria-label={title} className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {STATUS_OPTIONS.map((option) => {
            const selected = option.value === value;
            return (
              <label
                key={option.value}
                className="flex min-h-12 cursor-pointer items-center gap-3 bg-surface px-4 text-left text-[14px] font-medium transition-colors hover:bg-surface-2 active:bg-surface-3 touch-manipulation"
              >
                <input
                  type="radio"
                  name={`${contentId}-status`}
                  value={option.value}
                  checked={selected}
                  onClick={() => {
                    if (selected) setOpen(false);
                  }}
                  onChange={() => select(option.value)}
                  className="h-5 w-5 shrink-0 accent-accent"
                />
                <span className="flex-1">{option.label}</span>
              </label>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}

function FunnelIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M4 5h16l-6.4 7.2v5.3l-3.2 1.5v-6.8L4 5Z" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
