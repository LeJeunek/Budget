import { DEMO_CATEGORY_IDS } from "./ids"

/**
 * The demo household's current-month budget allocations — the raw
 * `{ categoryId, amount }` rows `prisma/schema.prisma`'s `BudgetCategory`
 * model stores (row presence = "set," per that model's own "unset vs. $0"
 * modeling comment). Deliberately does **not** include `spent`/`remaining`/
 * `percentUsed`/`isOverBudget` — those are always computed at read time from
 * `transactions.ts`'s data, exactly like the real
 * `features/budgeting/server/service.ts`'s `buildBudgetMonthView` does, by
 * `derive/budget-month.ts`. This keeps Budgeting's "spent" figure and
 * Transactions'/Dashboard's own spend totals from ever silently disagreeing
 * with each other (public-demo-technical-design.md §2.1's "shared
 * computation, not independently authored" guarantee).
 *
 * Eight of the eleven Charter categories have an allocation set this month —
 * Investments/Savings/Misc are deliberately left unset, so
 * `derive/budget-month.ts`'s "unbudgeted category still shows real spend
 * activity" path (Savings' $300 transfer, Misc's small purchases in
 * `transactions.ts`) has something genuine to render (budgeting.md AC9).
 * Allocations are chosen so the derived spend lands with at least one
 * category comfortably under budget and at least one near/over — see
 * `transactions.ts`'s current-month template for the exact figures this is
 * measured against.
 */
export interface DemoBudgetAllocation {
  categoryId: string
  amount: number
}

export function buildDemoBudgetAllocations(): DemoBudgetAllocation[] {
  return [
    { categoryId: DEMO_CATEGORY_IDS.housing, amount: 1800 },
    { categoryId: DEMO_CATEGORY_IDS.utilities, amount: 220 },
    { categoryId: DEMO_CATEGORY_IDS.transportation, amount: 180 },
    { categoryId: DEMO_CATEGORY_IDS.food, amount: 650 },
    { categoryId: DEMO_CATEGORY_IDS.entertainment, amount: 120 },
    { categoryId: DEMO_CATEGORY_IDS.shopping, amount: 200 },
    { categoryId: DEMO_CATEGORY_IDS.healthcare, amount: 100 },
    { categoryId: DEMO_CATEGORY_IDS.insurance, amount: 150 },
  ]
}
