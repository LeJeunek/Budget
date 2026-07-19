/**
 * Client-safe return shapes for `features/budgeting/server/service.ts`, per
 * docs/architecture/api-contracts.md's Budgeting section. Every Decimal
 * field is already converted to a plain number before it reaches these
 * types, mirroring `features/accounts/server/service.ts`'s `toAccount()`
 * convention — no Prisma type ever leaks past `server/service.ts`.
 */

/** One category's row in a month's budget planner. */
export interface BudgetCategoryLine {
  categoryId: string
  categoryName: string
  isSystem: boolean
  /**
   * The planned amount, or `null` when unset for this month —
   * docs/product/budgeting.md AC2: "unset" and "allocated $0" are distinct,
   * valid states, and must never be conflated. This `null` reflects **row
   * presence** (no `BudgetCategory` row for this category+month), not a
   * nullable DB column — see prisma/schema.prisma's Budgeting modeling
   * comment for why.
   */
  allocated: number | null
  /**
   * Sum of this category's expense transactions for the month, including
   * split line items and excluding split *parents* — matches the
   * Transactions/Dashboard accounting convention exactly (AC6/AC10), via
   * `features/transactions/server/aggregations.ts`. Always populated, even
   * when `allocated` is null (AC9: an unbudgeted category still shows real
   * spend activity).
   */
  spent: number
  /** `allocated - spent`, or `null` when `allocated` is null (AC9 — nothing
   * to measure against). May be negative when over budget (AC8). */
  remaining: number | null
  /** `(spent / allocated) * 100`, or `null` when `allocated` is null. See
   * `server/service.ts`'s `buildCategoryLine` for how the `allocated === 0`
   * edge case (a deliberately-set $0 plan, still distinct from "unset") is
   * handled — `percentUsed` is never null there, only when `allocated`
   * itself is null. */
  percentUsed: number | null
  /** `spent > allocated`; always `false` when `allocated` is null (AC9 — no
   * plan means no over-budget signal to show). */
  isOverBudget: boolean
}

/**
 * Month-level totals — AC10: aggregated only across categories that have an
 * allocation set for the month. Unbudgeted category spend (visible on each
 * line's own `spent`) and `uncategorizedSpent` (see `BudgetMonthView`) are
 * deliberately excluded, so a single unallocated category — or spend with
 * no category at all — can never silently make the whole month look over
 * budget.
 */
export interface BudgetMonthTotals {
  totalAllocated: number
  totalSpent: number
  totalRemaining: number
}

/**
 * Return shape of `service.getBudgetMonth` — mirrors
 * docs/architecture/api-contracts.md's Budgeting section exactly (the
 * Solution Architect's contract; not redesigned here).
 */
export interface BudgetMonthView {
  /** `"YYYY-MM"`, echoed back from the requested `month` input. */
  month: string
  /** `false` for past months (AC3) — the current month and every future
   * month are editable. Derived at read time from `month` vs. "today",
   * never stored (same "never persist a derived flag" discipline this
   * app's Phase 2 domains use everywhere else — Goal progress, Bill
   * status). */
  isEditable: boolean
  /**
   * `false` only for a past month with no `Budget` row ever materialized —
   * the explicit "no budget was set this month" empty state (Edge Cases).
   * Always `true` for the current month and every future month, since those
   * are always at least viewable (and carry-forward-eligible) regardless of
   * whether a `Budget` row has been materialized yet.
   */
  hasAnyBudgetData: boolean
  categories: BudgetCategoryLine[]
  totals: BudgetMonthTotals
  /**
   * Spend on transactions with no category at all this month (never
   * assigned one, or their category was since deleted) — informational
   * only, excluded from `totals` (Edge Cases: "Uncategorized spending").
   */
  uncategorizedSpent: number
}

/**
 * Return shape of `service.getBudgetHealthScore` / Dashboard's Budget
 * Health Score card — AC12. The service returns `null` (not this type) when
 * the user has zero categories with an allocation set for the month — the
 * "undefined" state AC12 requires instead of a misleading 0 or 100.
 */
export interface BudgetHealthScore {
  score: number
  label: "Good" | "Fair" | "Needs attention"
}

/**
 * Return shape of `service.getBudgetMonthSummary`, consumed by Dashboard's
 * Remaining Budget stat card (AC11). The service returns `null` (not this
 * type) when the user has zero allocations set for the month — the "no
 * budget set" placeholder condition.
 */
export interface BudgetMonthSummary {
  totalAllocated: number
  totalSpent: number
  totalRemaining: number
}
