import type {
  FinancialGoal as PrismaFinancialGoalRow,
  FinancialGoalType,
  MeasurementBasis,
} from "@prisma/client"

// Re-export the Prisma-generated enums so consumers of this feature (hooks,
// and later the UI Component Engineer's components) never need to import
// from "@prisma/client" directly — Prisma stays an implementation detail
// behind features/financial-goals/server, per folder-tree.md's module
// boundary (matches features/debt/types.ts's `DebtType` re-export and
// features/accounts/types.ts's `AccountType` re-export exactly).
export type { FinancialGoalType, MeasurementBasis }

/**
 * Client-safe representation of a `FinancialGoal` row.
 *
 * Prisma's `Decimal` (`startingBalance`, `targetAmount`, `targetPercent`) is a
 * decimal.js class instance, not a plain serializable value — passing it
 * as-is across the Server Component / Client Component boundary or through a
 * Server Action's response is unsafe. `server/service.ts` always converts
 * Decimal -> number before returning data (see `toFinancialGoal`), mirroring
 * `features/debt/types.ts`'s `Debt`/`toDebt()` pattern exactly.
 *
 * All three type-specific fields (`linkedDebtId`/`startingBalance`,
 * `targetAmount`/`measurementBasis`, `targetPercent`/`targetDate`) are
 * nullable on every row per the schema's flat-table-with-nullable-columns
 * design (prisma/schema.prisma's `FinancialGoal` comment) — exactly one
 * type's fields are populated per row, selected by `type`. This bare
 * `FinancialGoal` type does not encode that discrimination at the TypeScript
 * level (nor does the Prisma-generated type it wraps); `FinancialGoalWithProgress`
 * below is where the type-specific *derived* fields are actually optional/
 * discriminated, which is the shape every real consumer of this feature
 * reads (see that type's own JSDoc).
 */
export type FinancialGoal = Omit<
  PrismaFinancialGoalRow,
  "startingBalance" | "targetAmount" | "targetPercent"
> & {
  startingBalance: number | null
  targetAmount: number | null
  targetPercent: number | null
}

/**
 * Options for `service.getFinancialGoals`. Same non-union toggle semantics as
 * every other archive/unarchive domain in this codebase
 * (`features/accounts/types.ts`'s `GetAccountsOptions`, `features/debt/types.ts`'s
 * `GetDebtsOptions`, `features/goals/types.ts`'s `GetGoalsOptions`):
 * `includeArchived` false/omitted (default) returns only active goals;
 * `true` returns only archived goals — never a combined view.
 */
export interface GetFinancialGoalsOptions {
  includeArchived?: boolean
}

/**
 * One point of a `NET_WORTH_SAVINGS_TARGET` (TOTAL_NET_WORTH basis) goal's
 * optional mini trend line — a thin re-shaping of
 * `dashboard.getNetWorthHistory`'s own `NetWorthHistoryPoint` down to just
 * the two fields this feature's trend line needs (financial-goals.md's Type
 * 2: "may optionally show a mini trend line reusing the existing Net Worth
 * Snapshot history... toward the target").
 */
export interface FinancialGoalTrendPoint {
  date: string
  value: number
}

/**
 * `FinancialGoal` plus every progress/completion field computed at read time
 * in `server/service.ts`, per docs/architecture/api-contracts.md's Financial
 * Goals section — **never stored** (see prisma/schema.prisma's `FinancialGoal`
 * comment: "Deliberately no `completedAt`/`progress`/`percentComplete` column
 * ... anywhere on this model"). This is the feature's entire reason for
 * existing as a model distinct from `SavingsGoal`'s manual-contribution
 * `GoalWithProgress` (docs/product/financial-goals.md's Boundary section).
 *
 * Every field below except `accountIds`/`isCompleted` is discriminated on
 * `type` — only the fields relevant to a given goal's type are ever
 * populated (`undefined` for the other two types' fields), matching
 * api-contracts.md's shape exactly. Consumers should switch on `type` before
 * reading any of these, the same discriminated-access pattern the rest of
 * this codebase already uses for `Debt.type`/`IncomeStream.type`.
 */
export type FinancialGoalWithProgress = FinancialGoal & {
  /**
   * `NET_WORTH_SAVINGS_TARGET` (`ACCOUNT_SUBSET` basis) goals only: the
   * Account ids currently in this goal's measurement subset, read from the
   * `FinancialGoalAccount` join table. Always `[]` for every other goal
   * (including `TOTAL_NET_WORTH`, where a subset is meaningless) — not part
   * of api-contracts.md's abbreviated field list, but required so an edit
   * form can pre-populate the current subset selection per AC3's "editable
   * at any time," without this module inventing a second read function just
   * to fetch it.
   */
  accountIds: string[]

  // ---- DEBT_PAYOFF -------------------------------------------------------
  /** Live, via `debt.service.getDebtById` — the linked Debt's
   * `effectiveBalance` at read time (never copied). */
  currentEffectiveBalance?: number
  /** `(startingBalance - currentEffectiveBalance) / startingBalance`, as a
   * 0-100 percentage, clamped to `[0, 100]` — see `progress-math.ts`'s
   * `computeDebtPayoffPercent` for the full clamping rationale (the
   * "balance increased since the goal began" edge case). */
  percentPaidOff?: number
  /** `true` when the linked Debt is archived (but not necessarily Paid
   * Off) — per the Edge Cases' "progress calculation freezes at its
   * last-known value... cannot auto-complete unless the Debt is unarchived."
   * This flag exists purely so the UI can surface that frozen state; the
   * freezing itself requires no special-cased math (an archived Debt's row,
   * and its `effectiveBalance`, is never deleted — see Architecture.md's
   * Phase 3b Financial Goals section). */
  linkedDebtArchived?: boolean

  // ---- NET_WORTH_SAVINGS_TARGET -------------------------------------------
  /** Live: `dashboard.service.getNetWorth(userId).total` (TOTAL_NET_WORTH
   * basis), or the live, sign-adjusted sum of the selected Account subset
   * (ACCOUNT_SUBSET basis). */
  currentMeasuredValue?: number
  /** `targetAmount - currentMeasuredValue` — may be negative, shown plainly
   * per the Edge Cases' "never hide a negative number" convention. */
  distanceToTarget?: number
  /** Only present when `measurementBasis === "TOTAL_NET_WORTH"` — reuses
   * `dashboard.getNetWorthHistory`. Omitted (never a fabricated partial
   * series) for `ACCOUNT_SUBSET`, per the spec's own stated constraint
   * (`NetWorthSnapshot` only ever stores the aggregate total). */
  trend?: FinancialGoalTrendPoint[]

  // ---- SAVINGS_RATE_TARGET -------------------------------------------------
  /** The trailing-3-calendar-month average of
   * `dashboard.service.getMonthlySummary(...).savingsRate`, expressed on the
   * same 0-100 scale as `targetPercent` (not the 0-1 fraction scale
   * `getMonthlySummary` itself returns) — see `progress-math.ts`'s
   * `computeRollingSavingsRateAverage`. `null` = "not enough data yet"
   * (fewer than 3 qualifying calendar months since signup, or every month in
   * the window had $0 income). Deliberately **not** a 0-100% fill-bar-style
   * field alongside a `percentComplete` — per the spec's own resolved
   * decision, this and `targetPercent` are shown side by side as two plain
   * figures, never a progress bar. */
  currentRollingAverageRate?: number | null

  // ---- Shared across all three types --------------------------------------
  /** Auto-detected completion, per-type rule documented above; never a
   * manually-set flag or stored column. */
  isCompleted?: boolean
}
