"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import type { CategoryView } from "@/lib/finance";
import {
  DEFAULT_TRANSACTION_FILTER_STATE,
  localTransactionFilterCount,
  transactionCategoryOptions,
  type TransactionFilterState,
} from "@/lib/transaction-filters";
import { ChevronDownIcon, ChevronRightIcon } from "./icons";
import { FilterButton, FilterRadioGroup, FilterSection } from "./filter-controls";
import { ContextualBottomSheet, TextInput } from "./ui";

type FlatCategory = Omit<CategoryView, "children">;

export type TransactionFilterContext = {
  key: "plan" | "income";
  label: "Reja" | "Daromad";
  name: string;
  clearHref: string;
};

const TYPE_OPTIONS: ReadonlyArray<{ value: TransactionFilterState["type"]; label: string }> = [
  { value: "all", label: "Hammasi" },
  { value: "income", label: "Daromad" },
  { value: "expense", label: "Xarajat" },
  { value: "transfer", label: "Transfer" },
];

export function TransactionFilter({
  filters,
  onChange,
  categories,
  contexts,
}: {
  filters: TransactionFilterState;
  onChange: (filters: TransactionFilterState) => void;
  categories: readonly FlatCategory[];
  contexts: readonly TransactionFilterContext[];
}) {
  const [open, setOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryQuery, setCategoryQuery] = useState("");
  const contentId = useId();
  const categoryListId = useId();
  const categoryRadioName = useId();
  // Route-owned plan/income scope has its own visible chips. The trigger count
  // intentionally reflects only the local filters that this sheet can reset.
  const localCount = localTransactionFilterCount(filters);

  const options = useMemo(() => transactionCategoryOptions(categories, filters.type), [categories, filters.type]);
  const filteredOptions = useMemo(() => {
    const query = categoryQuery.toLowerCase();
    return query ? options.filter((category) => category.name.toLowerCase().includes(query)) : options;
  }, [categoryQuery, options]);
  const selectedCategory = filters.categoryId
    ? categories.find((category) => String(category.id) === filters.categoryId) ?? null
    : null;

  function close() {
    setOpen(false);
    setCategoryOpen(false);
    setCategoryQuery("");
  }

  function changeType(type: TransactionFilterState["type"]) {
    const categoryCompatible =
      !selectedCategory || type === "all" || (type !== "transfer" && selectedCategory.type === type);
    onChange({ ...filters, type, categoryId: categoryCompatible ? filters.categoryId : "" });
    if (type === "transfer") {
      setCategoryOpen(false);
      setCategoryQuery("");
    }
  }

  function selectCategory(categoryId: string) {
    onChange({ ...filters, categoryId });
    setCategoryOpen(false);
    setCategoryQuery("");
  }

  return (
    <>
      <FilterButton
        onClick={() => setOpen(true)}
        open={open}
        ariaLabel="Filtrlar"
        status={localCount || undefined}
        controlsId={contentId}
        floating
      />

      <ContextualBottomSheet open={open} onClose={close} title="Tarixni filtrlash">
        <div id={contentId} className="min-w-0 space-y-4">
          <FilterSection label="Operatsiya turi">
            <FilterRadioGroup
              label="Operatsiya turi"
              name={`${contentId}-type`}
              value={filters.type}
              options={TYPE_OPTIONS}
              onChange={changeType}
            />
          </FilterSection>

          <FilterSection label="Kategoriya">
            <button
              type="button"
              onClick={() => setCategoryOpen((current) => !current)}
              disabled={filters.type === "transfer"}
              aria-expanded={categoryOpen}
              aria-controls={categoryListId}
              className="flex min-h-12 w-full min-w-0 items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 text-left text-[14px] transition-colors hover:border-line-strong hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-60 touch-manipulation"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-3" aria-hidden="true">
                {filters.type === "transfer" ? "↔" : selectedCategory?.icon ?? "◎"}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {filters.type === "transfer"
                  ? "Transfer uchun kategoriya yo‘q"
                  : selectedCategory
                    ? `${selectedCategory.name}${selectedCategory.isActive ? "" : " (nofaol)"}`
                    : "Barcha kategoriyalar"}
              </span>
              {filters.type !== "transfer" ? (
                <span className="shrink-0 text-muted" aria-hidden="true">
                  {categoryOpen ? <ChevronDownIcon size={15} /> : <ChevronRightIcon size={15} />}
                </span>
              ) : null}
            </button>

            {categoryOpen && filters.type !== "transfer" ? (
              <div id={categoryListId} className="min-w-0 space-y-2 rounded-xl border border-line bg-surface-2 p-2">
                <label htmlFor={categoryListId + "-search"} className="sr-only">
                  Kategoriya qidirish
                </label>
                <TextInput
                  id={categoryListId + "-search"}
                  value={categoryQuery}
                  onChange={(event) => setCategoryQuery(event.target.value)}
                  placeholder="Kategoriya qidirish"
                  autoComplete="off"
                />
                <div role="radiogroup" aria-label="Kategoriya" className="max-h-56 min-w-0 space-y-1 overflow-y-auto overflow-x-hidden overscroll-contain">
                  {!categoryQuery ? (
                    <CategoryOption
                      name={categoryRadioName}
                      value=""
                      label="Barcha kategoriyalar"
                      icon="◎"
                      selected={!filters.categoryId}
                      onSelect={selectCategory}
                    />
                  ) : null}
                  {filteredOptions.map((category) => (
                    <CategoryOption
                      key={category.id}
                      name={categoryRadioName}
                      value={String(category.id)}
                      label={category.name}
                      icon={category.icon}
                      selected={String(category.id) === filters.categoryId}
                      onSelect={selectCategory}
                    />
                  ))}
                  {filteredOptions.length === 0 ? (
                    <p className="px-3 py-3 text-[12.5px] text-muted">Faol kategoriya topilmadi.</p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </FilterSection>

          {contexts.length ? (
            <FilterSection label="Kontekst">
              <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface-2">
                {contexts.map((context) => (
                  <div key={context.key} className="flex min-h-11 min-w-0 items-center gap-2 px-3.5 py-2 text-[13px]">
                    <span className="shrink-0 text-muted">{context.label}:</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{context.name}</span>
                    <Link
                      href={context.clearHref}
                      onClick={close}
                      aria-label={`${context.label} kontekstini olib tashlash`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-fg touch-manipulation"
                    >
                      ✕
                    </Link>
                  </div>
                ))}
              </div>
            </FilterSection>
          ) : null}

          {localCount ? (
            <button
              type="button"
              onClick={() => {
                onChange({ ...DEFAULT_TRANSACTION_FILTER_STATE });
                setCategoryOpen(false);
                setCategoryQuery("");
              }}
              className="min-h-11 w-full rounded-xl text-[13px] font-semibold text-negative-text transition-colors hover:bg-negative-soft touch-manipulation"
            >
              Filtrlarni tozalash
            </button>
          ) : null}
        </div>
      </ContextualBottomSheet>
    </>
  );
}

function CategoryOption({
  name,
  value,
  label,
  icon,
  selected,
  onSelect,
}: {
  name: string;
  value: string;
  label: string;
  icon: string;
  selected: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <label
      className={`flex min-h-11 min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-3 text-[13.5px] transition-colors touch-manipulation ${
        selected ? "bg-accent-soft font-semibold text-accent-text ring-2 ring-inset ring-accent" : "hover:bg-surface-3"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={selected}
        onClick={() => {
          if (selected) onSelect(value);
        }}
        onChange={() => onSelect(value)}
        className="h-4 w-4 shrink-0 accent-accent"
      />
      <span className="shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </label>
  );
}
