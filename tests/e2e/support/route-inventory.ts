// Single source of truth for "which routes does the Phase 5a Playwright
// suite iterate over" — mirrors docs/product/phase-5a-accessibility-
// responsive.md's own Route/Screen Inventory table (24 numbered rows), per
// docs/architecture/phase-5a-technical-design.md §1.4. Never redefined a
// second time inside any spec file — both accessibility/route-a11y.spec.ts
// and responsive/route-breakpoints.spec.ts loop over this one array.
//
// Route count note: the product spec's own table numbers 24 "screens," but
// six of those 24 numbered rows each describe TWO distinct, separately-
// renderable paths — a list view and a "[dynamic]" detail view (e.g. row 4,
// "`/transactions` ... and `/transactions/[id]`"). A list page and its
// detail page have genuinely different DOM/landmark structure and both need
// independent axe-core/breakpoint coverage (the architecture doc's own
// §1.4: "every detail-route test exercises a genuinely populated page, not
// an empty/not-found state"), so this array expands those six rows into 30
// individually-testable entries rather than collapsing list+detail into one
// row. Every one of the product spec's 24 numbered rows is still
// represented — nothing was added or dropped, six rows were only split into
// their two constituent paths.
//
// Dynamic-route ids: the six detail routes below resolve to real records
// belonging to the dedicated e2e-test@lkbudget.dev fixture account (never a
// placeholder/guessed id), seeded by prisma/seed-e2e-test-user.ts and
// handed off to this file via ./fixture-ids.json — the one file both the
// seed script (writer) and this module (reader) share, per
// phase-5a-technical-design.md §1.4's "a shared constants file... or a
// fixture JSON file... your call, keep it simple." A committed placeholder
// ships in fixture-ids.json (obviously-fake ids) so this file always
// resolves and `npm run typecheck`/a cold checkout never breaks; running
// `npm run seed:e2e` overwrites it with real ids before the Playwright
// suite is run for real.
import fixtureIds from "./fixture-ids.json"

export interface RouteInventoryEntry {
  /** Relative path, passed directly to `page.goto()` against
   * `playwright.config.ts`'s `baseURL`. */
  path: string
  /** Human-readable — used as the generated test's own name. */
  label: string
  /** True for the 6 `/admin/*` routes — selects which of the two
   * `storageState` files (ordinary vs. admin) the generated test runs
   * under. See support/auth.setup.ts. */
  requiresAdmin?: boolean
}

export const ROUTE_INVENTORY: RouteInventoryEntry[] = [
  // ---- Unauthenticated ------------------------------------------------
  { path: "/login", label: "Login (sign-in / sign-up)" },

  // ---- Authenticated — primary ------------------------------------------
  { path: "/", label: "Dashboard Overview" },
  { path: "/accounts", label: "Accounts" },
  { path: "/transactions", label: "Transactions list" },
  { path: `/transactions/${fixtureIds.transactionId}`, label: "Transaction detail" },

  // ---- Authenticated — Planning ------------------------------------------
  { path: "/budgeting", label: "Budgeting" },
  { path: "/goals", label: "Savings Goals list" },
  { path: `/goals/${fixtureIds.goalId}`, label: "Savings Goal detail" },
  { path: "/bills", label: "Bills list" },
  { path: `/bills/${fixtureIds.billId}`, label: "Bill detail" },
  { path: "/income", label: "Recurring Income list" },
  { path: `/income/${fixtureIds.incomeStreamId}`, label: "Income stream detail" },
  { path: "/calendar", label: "Calendar v2" },

  // ---- Authenticated — Wealth ------------------------------------------
  { path: "/debt", label: "Debt Tracker" },
  { path: "/investments", label: "Investments portfolio" },
  { path: `/investments/${fixtureIds.holdingId}`, label: "Holding detail" },
  { path: "/analytics", label: "Analytics suite" },
  { path: "/reports", label: "Reports" },
  { path: "/financial-goals", label: "Financial Goals list" },
  { path: `/financial-goals/${fixtureIds.financialGoalId}`, label: "Financial Goal detail" },
  { path: "/financial-health-score", label: "Financial Health Score detail" },

  // ---- Authenticated — Account ------------------------------------------
  { path: "/settings/notifications", label: "Settings — Notification Preferences" },
  { path: "/settings/appearance", label: "Settings — Appearance" },
  { path: "/settings/preferences", label: "Settings — Preferences" },

  // ---- Admin (own layout tree, ADMIN-tier gated) ------------------------
  { path: "/admin", label: "Admin landing", requiresAdmin: true },
  { path: "/admin/users", label: "Admin — View Users", requiresAdmin: true },
  { path: "/admin/audit-log", label: "Admin — Audit Logs", requiresAdmin: true },
  { path: "/admin/feature-flags", label: "Admin — Feature Flags", requiresAdmin: true },
  { path: "/admin/categories", label: "Admin — Manage Categories", requiresAdmin: true },
  { path: "/admin/demo-data", label: "Admin — Seed Demo Data", requiresAdmin: true },
]
