
import { useId, useState } from "react";
import type { PlanListTab } from "@hisobchi/shared/lib/finance";
import { FilterButton, FilterRadioGroup } from "./filter-controls";
import { ContextualBottomSheet } from "./ui";

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
      <FilterButton
        onClick={() => setOpen(true)}
        open={open}
        ariaLabel={title}
        status={filtered ? selectedLabel : undefined}
        controlsId={contentId}
      />

      <ContextualBottomSheet open={open} onClose={() => setOpen(false)} title={title}>
        <FilterRadioGroup
          id={contentId}
          label={title}
          name={`${contentId}-status`}
          value={value}
          options={STATUS_OPTIONS}
          onChange={select}
        />
      </ContextualBottomSheet>
    </>
  );
}
