/**
 * `DASHBOARD_CARD_KEYS` — the canonical, ordered list of every card the
 * Dashboard (`app/(dashboard)/page.tsx`) renders today.
 *
 * Ownership (phase-4c-technical-design.md §3.5): **Dashboard**, not Settings,
 * owns this list — Settings only stores preferences *about* an enumeration it
 * doesn't itself define. `features/settings/server/service.ts`'s
 * `getDashboardCardPreferences` imports this constant to perform its
 * row-absence materialization; `app/(dashboard)/page.tsx` is free to import it
 * too if a future pass wants the page itself to iterate this list rather than
 * hardcode its render order a second time. Mirrors
 * `features/categories/default-categories.ts`'s `DEFAULT_CATEGORIES` — a
 * single source of truth, imported by whoever needs "what exists," never
 * hardcoded a second time.
 *
 * `key` is a plain, kebab-case `String` (matching this codebase's URL-slug
 * convention, naming-standards.md's "kebab-case searchParam values" rule) —
 * deliberately NOT a Prisma enum, since customization.md explicitly frames the
 * card set as "expected to grow slightly over time as new phases ship";
 * adding a card here is meant to be a one-line array append, never a schema
 * migration (the identical String-not-enum reasoning already applied to
 * `UserPreference.accentColor`/`currencyDisplay` and `FeatureFlag.key`, per
 * phase-4c-technical-design.md §3.4/§3.5).
 *
 * This list must stay in sync with `app/(dashboard)/page.tsx`'s actual render
 * order — it is read directly from that file's current implementation
 * (Phase 1 stat cards, Budgeting's Budget Health Score, the three Phase 1
 * charts, Phase 3b's Net Worth History chart, and Phase 4a's Financial Health
 * Score badge / Monthly Summary card). If a future phase adds, removes, or
 * reorders a Dashboard card, this array is the one place that changes —
 * `DashboardCardPreference` rows referencing a since-removed key are ignored
 * gracefully at read time (risk-register.md #36), never thrown.
 */
export interface DashboardCardKey {
  key: string
  label: string
}

export const DASHBOARD_CARD_KEYS: DashboardCardKey[] = [
  { key: "net-worth", label: "Net Worth" },
  { key: "monthly-income", label: "Monthly Income" },
  { key: "monthly-expenses", label: "Monthly Expenses" },
  { key: "remaining-budget", label: "Remaining Budget" },
  { key: "cash-flow", label: "Cash Flow" },
  { key: "savings-rate", label: "Savings Rate" },
  { key: "budget-health-score", label: "Budget Health Score" },
  { key: "financial-health-score", label: "Financial Health Score" },
  { key: "spending-by-category-chart", label: "Spending by Category" },
  { key: "income-vs-expense-chart", label: "Income vs. Expense" },
  { key: "monthly-trends-chart", label: "Monthly Trends" },
  { key: "net-worth-history-chart", label: "Net Worth History" },
  { key: "monthly-summary", label: "Monthly Summary" },
]
