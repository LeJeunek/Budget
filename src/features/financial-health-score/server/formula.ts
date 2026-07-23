import type {
  FinancialHealthScoreComponentKey,
  FinancialHealthScoreComponents,
  FinancialHealthScoreLabel,
} from "../types"

/**
 * The Financial Health Score's pure deterministic math (`docs/product/
 * ai-features.md` Feature 5, CTO-resolved 2026-07-22) — no Prisma, no I/O,
 * unit-tested directly (`formula.test.ts`) without mocking the database.
 * Split out of `service.ts` (which owns the DB-touching gathering of each
 * component's raw inputs) purely for single-responsibility/file-size reasons
 * — this module has no reads/writes of its own and is never imported by
 * anything outside this feature, mirroring `features/financial-goals/server/
 * progress-math.ts`'s identical "extract the pure calculation into its own
 * file" precedent.
 */

// ---------------------------------------------------------------------------
// Formula thresholds — every number below is the CTO-resolved figure from
// ai-features.md's "Resolved (CTO, 2026-07-22)" section, restated here as a
// single named constant per threshold so the functions below can reference
// them by name instead of a bare magic number.
// ---------------------------------------------------------------------------

/** Debt-to-Income: 100 at this ratio or better (≤ 15%). */
const DEBT_TO_INCOME_RATIO_AT_SCORE_100 = 0.15
/** Debt-to-Income: 0 at this ratio or worse (≥ 50%). */
const DEBT_TO_INCOME_RATIO_AT_SCORE_0 = 0.5

/** Savings Rate: 0 at this rolling-average rate or worse (≤ 0%). */
const SAVINGS_RATE_AT_SCORE_0 = 0
/** Savings Rate: 100 at this rolling-average rate or better (≥ 20%). */
const SAVINGS_RATE_AT_SCORE_100 = 0.2

/** Net Worth Trend: 0 at this percent-of-trailing-income or worse (≤ -15%).
 * **Provisional** per the CTO's own Resolved-section note — "recalibrate it
 * against real fixture/production data during 4a's review gate if it proves
 * too tight or too loose." */
const NET_WORTH_TREND_PERCENT_AT_SCORE_0 = -0.15
/** Net Worth Trend: 100 at this percent-of-trailing-income or better
 * (≥ +15%). Also provisional — see the constant above. */
const NET_WORTH_TREND_PERCENT_AT_SCORE_100 = 0.15

/** Budget Health Score's own banded-label thresholds (`budgeting.md` AC12,
 * reused verbatim here per Feature 5, Reasoning point 6 / AC3 — "reuses the
 * identical bands and labels the Budget Health Score already established"). */
const LABEL_GOOD_THRESHOLD = 70
const LABEL_FAIR_THRESHOLD = 40

const ALL_COMPONENT_KEYS: readonly FinancialHealthScoreComponentKey[] = [
  "debtToIncome",
  "savingsRate",
  "budgetAdherence",
  "netWorthTrend",
]

/**
 * Maps `value` onto a 0–100 integer score via linear interpolation between
 * `(scoreZeroAt, 0)` and `(scoreHundredAt, 100)`, clamped at both ends —
 * the one shared shape every one of this formula's three linear bands
 * follows (`ai-features.md` Feature 5's "declining linearly... floored at 0",
 * "linear between", "linear between" — Debt-to-Income, Savings Rate, and Net
 * Worth Trend respectively). `scoreZeroAt` may be greater OR less than
 * `scoreHundredAt` — Debt-to-Income's band is *decreasing* (100 at the
 * smaller ratio, 0 at the larger one), while Savings Rate's and Net Worth
 * Trend's are *increasing*; both directions fall out of the same formula
 * with no separate branch, since the interpolation fraction naturally
 * inverts when the denominator is negative.
 */
export function linearInterpolateScore(
  value: number,
  scoreZeroAt: number,
  scoreHundredAt: number,
): number {
  const fraction = (value - scoreZeroAt) / (scoreHundredAt - scoreZeroAt)
  const clampedFraction = Math.min(1, Math.max(0, fraction))
  return Math.round(clampedFraction * 100)
}

/** Budget Health Score's own banded-label rule (`budgeting.md` AC12),
 * reused verbatim per Feature 5 AC1/AC3 — 70–100 Good, 40–69 Fair, 0–39
 * Needs attention. */
export function deriveFinancialHealthScoreLabel(
  score: number,
): FinancialHealthScoreLabel {
  if (score >= LABEL_GOOD_THRESHOLD) return "Good"
  if (score >= LABEL_FAIR_THRESHOLD) return "Fair"
  return "Needs attention"
}

/**
 * Debt-to-Income component (`ai-features.md` Feature 5, formula item 1).
 * `totalMinimumPayments <= 0` scores 100 unconditionally — "a user with zero
 * active debts scores 100 on this component (no debt burden) rather than
 * 'undefined'" — checked BEFORE the income guard below, so a debt-free user
 * with also-zero income this period still scores 100, never `null`.
 * Otherwise `null` ("no income data at all") when `totalMonthlyIncome <= 0` —
 * the CTO's undefined-component trigger, extended here (a documented,
 * deliberate judgment call — see `service.ts`'s own top-of-file "Deliberately
 * does NOT..." note for the sibling Net Worth Trend judgment call this
 * mirrors) to also cover "income data exists but this period's
 * actual-received total happens to be exactly $0" identically, since a ratio
 * cannot be computed against a $0 denominator either way.
 */
export function computeDebtToIncomeScore(
  totalMinimumPayments: number,
  totalMonthlyIncome: number,
): number | null {
  if (totalMinimumPayments <= 0) {
    return 100
  }
  if (totalMonthlyIncome <= 0) {
    return null
  }

  const ratio = totalMinimumPayments / totalMonthlyIncome
  return linearInterpolateScore(
    ratio,
    DEBT_TO_INCOME_RATIO_AT_SCORE_0,
    DEBT_TO_INCOME_RATIO_AT_SCORE_100,
  )
}

/**
 * Savings Rate component (`ai-features.md` Feature 5, formula item 2):
 * averages whichever of the (already fewer-than-3-qualifying-months-checked
 * by the caller) monthly rates are non-`null` — a `null` monthly rate means
 * that month had $0 income (`dashboard.service`'s own `computeSavingsRate`
 * sentinel), excluded from the average rather than counted as a 0%
 * month, mirroring `financial-goals.server.progress-math
 * .computeRollingSavingsRateAverage`'s identical rule (duplicated here per
 * this codebase's "features/<domain>/server modules don't cross-import each
 * other's internals" convention). Returns `null` ("not enough data yet")
 * when every month in the window is excluded (all-$0-income window) — the
 * caller separately returns `null` without ever reaching this function when
 * the window itself has fewer than 3 calendar months at all (account too
 * new).
 */
export function computeSavingsRateScore(
  monthlyRates: ReadonlyArray<number | null>,
): number | null {
  const qualifyingRates = monthlyRates.filter(
    (rate): rate is number => rate !== null,
  )
  if (qualifyingRates.length === 0) {
    return null
  }

  const average =
    qualifyingRates.reduce((sum, rate) => sum + rate, 0) / qualifyingRates.length
  return linearInterpolateScore(average, SAVINGS_RATE_AT_SCORE_0, SAVINGS_RATE_AT_SCORE_100)
}

/**
 * Net Worth Trend component (`ai-features.md` Feature 5, formula item 4 —
 * CTO-corrected 2026-07-22). `priorNetWorth: null` means fewer than 3 months
 * of `NetWorthSnapshot` history exist yet (the formula's own stated
 * undefined trigger) — checked first, before ever looking at income.
 * `trailingIncome <= 0` also yields `null`: the corrected formula normalizes
 * against trailing income, so a $0 denominator cannot produce a meaningful
 * percentage, the same "cannot divide by a $0 denominator" reasoning
 * `computeDebtToIncomeScore` above applies (a documented, deliberate
 * judgment call — see `service.ts`'s own top-of-file note; the product
 * spec's own undefined-trigger list for this component only names
 * insufficient snapshot history, not a $0 trailing income, but the two
 * components now share the identical income-relative denominator by the
 * CTO's own explicit design, so they share this same edge-case rule for
 * internal consistency).
 */
export function computeNetWorthTrendScore(params: {
  priorNetWorth: number | null
  currentNetWorth: number
  trailingIncome: number
}): number | null {
  if (params.priorNetWorth === null) {
    return null
  }
  if (params.trailingIncome <= 0) {
    return null
  }

  const change = params.currentNetWorth - params.priorNetWorth
  const percentOfTrailingIncome = change / params.trailingIncome
  return linearInterpolateScore(
    percentOfTrailingIncome,
    NET_WORTH_TREND_PERCENT_AT_SCORE_0,
    NET_WORTH_TREND_PERCENT_AT_SCORE_100,
  )
}

/**
 * The Final Score aggregate (`ai-features.md` Feature 5: "round(average of
 * whichever components are computable)") plus its derived
 * `undefinedComponents` list and banded `label` — the one place both are
 * computed, shared by `service.getFinancialHealthScore` and
 * `./snapshot.ts`'s capture job (so a snapshot's persisted `totalScore`/
 * `label` are always derived identically to a live read's).
 *
 * `score`/`label` are `null` together exactly when `components` has zero
 * non-`null` entries — Feature 5's own "never a misleading 0" rule (AC4).
 */
export function aggregateFinancialHealthScore(components: FinancialHealthScoreComponents): {
  score: number | null
  label: FinancialHealthScoreLabel | null
  undefinedComponents: FinancialHealthScoreComponentKey[]
} {
  const undefinedComponents = ALL_COMPONENT_KEYS.filter((key) => components[key] === null)

  const definedValues = ALL_COMPONENT_KEYS.map((key) => components[key]).filter(
    (value): value is number => value !== null,
  )

  if (definedValues.length === 0) {
    return { score: null, label: null, undefinedComponents }
  }

  const score = Math.round(
    definedValues.reduce((sum, value) => sum + value, 0) / definedValues.length,
  )

  return { score, label: deriveFinancialHealthScoreLabel(score), undefinedComponents }
}
