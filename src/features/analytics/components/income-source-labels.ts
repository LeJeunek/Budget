import type { IncomeSourceType } from "../types"

/**
 * Human-readable labels for `IncomeSourceType` (the six real `IncomeType`
 * values plus Analytics' own `"UNTRACKED"` residual bucket — analytics.md
 * AC13/AC14's "Untracked/Other" bucket). Shared by `IncomeGrowthChart` and
 * `IncomeSourcesChart`, the two components that both render this same union.
 *
 * Deliberately its own copy rather than importing
 * `features/recurring-income/components/income-stream-form.tsx`'s
 * `INCOME_TYPE_LABELS` — per folder-tree.md's module boundary rule,
 * `features/<domain>/components` isn't a shared cross-domain import target
 * (same precedent `features/debt/components/debt-card.tsx` documents for its
 * own duplicated `formatMonthLabel`), and that map doesn't have an
 * `"UNTRACKED"` entry to extend anyway.
 */
export const INCOME_SOURCE_TYPE_LABELS: Record<IncomeSourceType, string> = {
  SALARY: "Salary",
  SIDE_HUSTLE: "Side Hustle",
  DIVIDEND: "Dividend",
  RENTAL: "Rental",
  BONUS: "Bonus",
  OTHER: "Other",
  UNTRACKED: "Untracked/Other",
}
