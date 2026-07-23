import type {
  CategoryTrend,
  DailySpendingHeatmapPoint,
  LargestPurchase,
  ReportingPeriodRange,
  SavingsGrowthPoint,
  SpendingInsightSourceMetric,
  SubscriptionCandidate,
  TopMerchant,
} from "../types"
import { formatDateKey } from "./period"

// PURE candidate-selection logic for Spending Insights (ai-features.md
// Feature 4, docs/architecture/ai-features-design.md). No Prisma, no
// `lib/db.ts`/`lib/auth.ts` import -- every function below is a plain,
// side-effect-free reduction over an already-fetched Analytics metric's
// result array, fully unit-testable with fixture data, mirroring
// `subscription-detection.ts`'s "PURE... stays under server/" precedent
// exactly (nothing client-side ever calls this directly; `insights.ts`'s
// Prisma-touching orchestration is this file's only caller).
//
// This is the deterministic half of Feature 4 AC3 ("insights prioritize
// what's most notable... rather than a fixed list"): every builder below
// computes a `magnitude` (a percent or dollar swing, never sent to the
// model) so `insights.ts` can rank every candidate across all six source
// metrics and hand the model only the most notable ones, already
// pre-filtered -- the model's own job is narrower (pick 2-4 of what it's
// given and phrase them), not independently deciding what counts as
// "notable" from a shapeless full data dump. This keeps the actual
// prioritization a plain, testable, non-AI computation, not an LLM judgment
// call.

/** One candidate observation, scored for ranking (`magnitude`) but otherwise
 * exactly the fields `insights-schema.ts`'s prompt DTO needs (minus
 * `magnitude`, which never leaves this file — see `insights.ts`'s
 * `gatherInsightCandidates`, the only place this type is consumed). */
export interface SpendingInsightCandidate {
  sourceMetric: SpendingInsightSourceMetric
  /** Redacted, already-sanitized display name this candidate is about (a
   * category or merchant name) -- empty string when not applicable (the
   * day-of-week and savings-behavior candidates have no single subject). */
  subjectName: string
  /** Fixed, developer-authored description of what KIND of observation this
   * is (e.g. "this month vs. trailing average") -- never itself user-
   * controlled, so the model always has a clear, safe frame for what
   * `figures` represents independent of `subjectName`'s untrusted content. */
  observationType: string
  figures: { label: string; value: number }[]
  /** Internal-only ranking key (an absolute percent or dollar swing) --
   * never serialized into the model's prompt input; used solely by
   * `insights.ts` to sort/truncate the full candidate list before it ever
   * reaches `generateStructuredOutput`. */
  magnitude: number
}

/** Number of trailing months averaged for a "this month vs. recent average"
 * comparison (category trend change, savings behavior) -- matches
 * `ai-features.md`'s own example phrasing ("compared to your 3-month
 * average"). */
const TRAILING_MONTHS_FOR_AVERAGE = 3

/** Minimum consecutive increasing months to call out a "N months in a row"
 * multi-month trend (ai-features.md's own example: "increased for 3 months
 * in a row"). */
const MIN_STREAK_LENGTH = 3

const WEEKEND_DAYS = new Set([0, 6])

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/** Rounds to 2 decimal places -- shared by every dollar figure and percent
 * figure below (a percent doesn't need currency rounding semantics, but the
 * same 2-decimal-place rounding is a reasonable, consistent display
 * precision for both, and keeps every figure's rounding behavior uniform
 * across candidate types). */
function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Category Trend call-out (ai-features.md: "Spending in Dining is up 20%
 * this month compared to your 3-month average"). One candidate per category
 * with at least 2 months of data and at least 1 prior month to compare
 * against; skipped entirely when the change rounds to exactly $0 (nothing to
 * report). Percent change is `null` (falls back to a dollar-magnitude
 * candidate) when the trailing average is $0, avoiding a divide-by-zero --
 * a category that went from $0 to a real amount is still worth surfacing,
 * just by dollar swing rather than an undefined percentage.
 */
export function buildCategoryTrendChangeCandidates(
  trends: CategoryTrend[],
): SpendingInsightCandidate[] {
  const candidates: SpendingInsightCandidate[] = []

  for (const trend of trends) {
    if (trend.points.length < 2) continue

    const current = trend.points[trend.points.length - 1]
    const priorPoints = trend.points.slice(
      Math.max(0, trend.points.length - 1 - TRAILING_MONTHS_FOR_AVERAGE),
      trend.points.length - 1,
    )
    if (priorPoints.length === 0) continue

    const priorAverage = average(priorPoints.map((point) => point.amount))
    const dollarChange = current.amount - priorAverage
    if (roundToTwoDecimals(dollarChange) === 0) continue

    const percentChange = priorAverage > 0 ? (dollarChange / priorAverage) * 100 : null
    const magnitude = percentChange !== null ? Math.abs(percentChange) : Math.abs(dollarChange)

    const figures: { label: string; value: number }[] = [
      { label: `${trend.categoryName} amount this month`, value: roundToTwoDecimals(current.amount) },
      {
        label: `${trend.categoryName} trailing ${TRAILING_MONTHS_FOR_AVERAGE}-month average`,
        value: roundToTwoDecimals(priorAverage),
      },
    ]
    if (percentChange !== null) {
      figures.push({
        label: `${trend.categoryName} percent change vs. trailing average`,
        value: roundToTwoDecimals(percentChange),
      })
    }

    candidates.push({
      sourceMetric: "categoryTrends",
      subjectName: trend.categoryName,
      observationType: "This month's category spending compared to its trailing prior-month average",
      figures,
      magnitude,
    })
  }

  return candidates
}

/**
 * Multi-month trend (ai-features.md: "Groceries spending has increased for 3
 * months in a row"). One candidate per category whose trailing streak of
 * strictly-increasing, positive months reaches `MIN_STREAK_LENGTH`. A month
 * dropping to (or starting from) $0 never counts toward the streak,
 * preventing a trivial "increase" from a zero-spend month being read as a
 * genuine trend.
 */
export function buildCategoryTrendStreakCandidates(
  trends: CategoryTrend[],
): SpendingInsightCandidate[] {
  const candidates: SpendingInsightCandidate[] = []

  for (const trend of trends) {
    const amounts = trend.points.map((point) => point.amount)
    let streakLength = 1
    for (let i = amounts.length - 1; i > 0; i--) {
      if (amounts[i] > amounts[i - 1] && amounts[i - 1] > 0) {
        streakLength += 1
      } else {
        break
      }
    }
    if (streakLength < MIN_STREAK_LENGTH) continue

    const streakPoints = trend.points.slice(trend.points.length - streakLength)
    const dollarIncrease =
      streakPoints[streakPoints.length - 1].amount - streakPoints[0].amount

    candidates.push({
      sourceMetric: "categoryTrends",
      subjectName: trend.categoryName,
      observationType: `Spending in this category has increased for ${streakLength} consecutive months`,
      figures: streakPoints.map((point) => ({
        label: `${trend.categoryName} amount for ${point.month}`,
        value: roundToTwoDecimals(point.amount),
      })),
      magnitude: Math.abs(dollarIncrease),
    })
  }

  return candidates
}

/** Notable merchant spend, "you spent more at X than anywhere else"
 * (ai-features.md) -- at most one candidate, the single highest-spend
 * merchant already ranked first by `getTopMerchants`. */
export function buildTopMerchantCandidates(
  topMerchants: TopMerchant[],
): SpendingInsightCandidate[] {
  const top = topMerchants[0]
  if (!top || top.totalSpend <= 0) return []

  return [
    {
      sourceMetric: "topMerchants",
      subjectName: top.displayName,
      observationType: "Highest total spend at a single merchant this period",
      figures: [
        { label: `${top.displayName} total spend this period`, value: roundToTwoDecimals(top.totalSpend) },
      ],
      magnitude: top.totalSpend,
    },
  ]
}

/** Notable merchant spend, "your highest single spend was $X at Y"
 * (ai-features.md) -- at most one candidate, the single largest purchase
 * already ranked first by `getLargestPurchases`. */
export function buildLargestPurchaseCandidates(
  largestPurchases: LargestPurchase[],
): SpendingInsightCandidate[] {
  const largest = largestPurchases[0]
  if (!largest || largest.amount <= 0) return []

  return [
    {
      sourceMetric: "largestPurchases",
      subjectName: largest.merchant,
      observationType: "Largest single purchase this period",
      figures: [
        { label: `${largest.merchant} purchase amount`, value: roundToTwoDecimals(largest.amount) },
      ],
      magnitude: largest.amount,
    },
  ]
}

/**
 * Subscription change (ai-features.md: "a new recurring charge was
 * detected"/"looks possibly cancelled"). Subscription Cost Detection itself
 * always ignores the reporting period (analytics.md: "needs full history for
 * first/most-recent detection") -- this function is the one place Insights
 * applies a period boundary on top of that all-time detection, per two
 * distinct rules:
 *   - "Possibly Cancelled" is always surfaced regardless of period -- it's an
 *     as-of-now fact ("has this stopped"), not something scoped to a
 *     selected window.
 *   - "Newly detected" is scoped to `period`: only a candidate whose
 *     `firstDetectedDate` falls on/after the period's own start is "new
 *     within this period." Skipped entirely for an open-ended ("All Time")
 *     period, which has no meaningful "since when" boundary to measure
 *     newness against.
 */
export function buildSubscriptionCandidates(
  subscriptions: SubscriptionCandidate[],
  period: ReportingPeriodRange,
): SpendingInsightCandidate[] {
  const candidates: SpendingInsightCandidate[] = []
  const periodStartKey = period.start ? formatDateKey(period.start) : null

  for (const subscription of subscriptions) {
    if (subscription.status === "POSSIBLY_CANCELLED") {
      candidates.push({
        sourceMetric: "subscriptionDetection",
        subjectName: subscription.displayName,
        observationType: "Recurring charge that appears to have stopped landing",
        figures: [
          {
            label: `${subscription.displayName} last known charge amount`,
            value: subscription.averageAmount,
          },
        ],
        magnitude: subscription.estimatedAnnualizedCost,
      })
      continue
    }

    if (
      subscription.status === "ACTIVE" &&
      periodStartKey !== null &&
      subscription.firstDetectedDate >= periodStartKey
    ) {
      candidates.push({
        sourceMetric: "subscriptionDetection",
        subjectName: subscription.displayName,
        observationType: "Newly detected recurring charge within this period",
        figures: [
          {
            label: `${subscription.displayName} monthly-equivalent cost`,
            value: subscription.averageAmount,
          },
        ],
        magnitude: subscription.estimatedAnnualizedCost,
      })
    }
  }

  return candidates
}

/**
 * Day-of-week pattern (ai-features.md: "you tend to spend noticeably more on
 * weekends"). A single candidate comparing the average per-day spend on
 * weekend days (Sat/Sun) vs. weekday days, both averaged only over days with
 * recorded activity (`getDailySpendingHeatmap` omits $0 days entirely, per
 * that function's own convention) -- a documented simplification, not a
 * per-calendar-day average, since the heatmap's own result shape has no
 * zero-day entries to average against.
 */
export function buildHeatmapCandidates(
  heatmap: DailySpendingHeatmapPoint[],
): SpendingInsightCandidate[] {
  const weekendAmounts: number[] = []
  const weekdayAmounts: number[] = []

  for (const point of heatmap) {
    const dayOfWeek = new Date(`${point.date}T00:00:00Z`).getUTCDay()
    if (WEEKEND_DAYS.has(dayOfWeek)) {
      weekendAmounts.push(point.amount)
    } else {
      weekdayAmounts.push(point.amount)
    }
  }

  if (weekendAmounts.length === 0 || weekdayAmounts.length === 0) return []

  const weekendAverage = average(weekendAmounts)
  const weekdayAverage = average(weekdayAmounts)
  if (weekdayAverage <= 0) return []

  const percentDifference = ((weekendAverage - weekdayAverage) / weekdayAverage) * 100
  if (roundToTwoDecimals(percentDifference) === 0) return []

  return [
    {
      sourceMetric: "dailySpendingHeatmap",
      subjectName: "",
      observationType:
        percentDifference > 0
          ? "Average spending on weekend days is higher than on weekdays"
          : "Average spending on weekdays is higher than on weekend days",
      figures: [
        { label: "Average weekend-day spend", value: roundToTwoDecimals(weekendAverage) },
        { label: "Average weekday spend", value: roundToTwoDecimals(weekdayAverage) },
      ],
      magnitude: Math.abs(percentDifference),
    },
  ]
}

/**
 * Savings behavior (ai-features.md: "you saved more this period than your
 * recent average, even after accounting for investment gains"). Compares the
 * most recent month with a known (non-`null`) `actualSavings` figure against
 * the trailing average of up to `TRAILING_MONTHS_FOR_AVERAGE` known prior
 * months -- `$0`-income months are already excluded upstream by
 * `getSavingsGrowth`'s own `null` convention, so this function never needs
 * to special-case them itself.
 */
export function buildSavingsGrowthCandidates(
  points: SavingsGrowthPoint[],
): SpendingInsightCandidate[] {
  const known = points.filter(
    (point): point is { month: string; actualSavings: number } => point.actualSavings !== null,
  )
  if (known.length < 2) return []

  const current = known[known.length - 1]
  const priorPoints = known.slice(
    Math.max(0, known.length - 1 - TRAILING_MONTHS_FOR_AVERAGE),
    known.length - 1,
  )
  if (priorPoints.length === 0) return []

  const priorAverage = average(priorPoints.map((point) => point.actualSavings))
  const dollarChange = current.actualSavings - priorAverage
  if (roundToTwoDecimals(dollarChange) === 0) return []

  return [
    {
      sourceMetric: "savingsGrowth",
      subjectName: "",
      observationType:
        dollarChange > 0
          ? "Saved more this period than the recent trailing average"
          : "Saved less this period than the recent trailing average",
      figures: [
        { label: "Savings this month", value: roundToTwoDecimals(current.actualSavings) },
        {
          label: `Trailing ${TRAILING_MONTHS_FOR_AVERAGE}-month average savings`,
          value: roundToTwoDecimals(priorAverage),
        },
      ],
      magnitude: Math.abs(dollarChange),
    },
  ]
}
