// Shared helper for the "no unbounded per-request fan-out" constraint
// (docs/architecture/ai-features-design.md §2/§6), covering the pure,
// feature-agnostic math behind two distinct mechanisms every on-demand
// generate/refresh/reconsider action must apply, in addition to the
// batch-size cap constant the categorization cron job uses.
//
// **Revision (Phase 4a follow-up):** this file's header previously claimed it
// "intentionally holds no Prisma/persistence code of its own -- none of
// `lib/ai/` owns a database table." That is no longer true for one narrow,
// deliberately-scoped exception: `checkReasoningModelRateLimit`/
// `recordReasoningModelCall` below own the read/write access to
// `ReasoningModelCallLog` (`prisma/schema.prisma`'s own model, added
// specifically to back these two functions -- see that model's full header
// comment and docs/database/er-diagram.md's "Design notes (Phase 4a
// follow-up)" section for the complete reasoning). That table's own comment
// explicitly left "whether `lib/ai/rate-limit.ts` should own the shared
// check-and-record function... or whether each feature queries it directly"
// open as an AI Engineer module-boundary call; the former was chosen here
// specifically because all four `reasoningModel`-backed features (Budget
// Advisor, Monthly Summaries -- both shipped; Spending Insights, Health
// Score narrative -- not yet built) need the identical two rolling-window
// checks against the identical table, and a single shared implementation
// means the two not-yet-built features get this rate limit "for free" by
// calling the same function everyone else does, rather than each
// reimplementing (and risking subtly diverging) the same two `count()`
// queries. Every OTHER function in this file remains a pure, database-free
// predicate exactly as before -- this exception is intentionally narrow and
// confined to the one cross-feature mechanism that has no other reasonable
// home (a per-feature cache/history table, unlike `ReasoningModelCallLog`,
// is and remains each feature's own server file's concern, per the doc
// comments on `canRefreshNow` below).

import { db } from "@/lib/db"

/**
 * (a) Per-key minimum-interval check, per naming-standards.md's exact
 * required name/signature. Returns `true` when enough time has elapsed
 * since `lastGeneratedAt` (or when there is no prior generation at all --
 * `null` means "never generated, always allowed").
 *
 * [Finding 6b] For a cache row shared across potentially-concurrent writers
 * (the Budget Advisor/Spending Insights refresh cache, keyed by
 * `(userId, month)`/`(userId, period)`), this predicate is meant to be
 * evaluated as *part of* a single atomic conditional `UPDATE ... SET
 * generatedAt = now() WHERE generatedAt < cutoff` and inspecting
 * rows-affected -- never a separate read-then-compare-then-write -- so two
 * near-simultaneous refresh requests cannot both observe a stale timestamp
 * and both proceed. This function itself is a pure, stateless predicate; it
 * is the caller's job to run it against the correct atomic-update pattern
 * for its own persistence shape. For a row/action whose concurrency profile
 * is narrower ("one authenticated user acting on one of their own rows
 * within milliseconds of themselves" -- the same profile
 * `prisma/schema.prisma`'s own `CategorySuggestion` comment uses to justify
 * an app-level-only guard for its `MANUAL_RECONSIDER` path), a plain
 * read-then-check against this predicate is an accepted, documented
 * exception -- see `features/transactions/server/actions.ts`'s
 * `requestCategorySuggestion` for that exact case.
 */
export function canRefreshNow(
  lastGeneratedAt: Date | null,
  minIntervalMs: number,
  now: Date = new Date(),
): boolean {
  if (lastGeneratedAt === null) {
    return true
  }
  return now.getTime() - lastGeneratedAt.getTime() >= minIntervalMs
}

/**
 * Returns the earliest `createdAt`/`generatedAt` timestamp that still
 * counts toward a rolling-window call cap, for `windowMs` milliseconds
 * ending at `now`. Callers use this as the `gte` bound of their own
 * "how many calls has this user/key made recently" count query (e.g.
 * `db.categorySuggestion.count({ where: { ..., createdAt: { gte:
 * rollingWindowStart(ONE_HOUR_MS) } } })`) -- kept here so the "what counts
 * as 'recent'" math is defined once, not re-derived per call site.
 */
export function rollingWindowStart(
  windowMs: number,
  now: Date = new Date(),
): Date {
  return new Date(now.getTime() - windowMs)
}

/**
 * (b) The secondary, per-user (or, per §6.1's Gemini-swap addition, a future
 * project-wide) rolling-window call cap: given how many qualifying calls
 * already happened within the current window (a count the caller obtains by
 * querying its own persistence with `rollingWindowStart`'s cutoff above),
 * returns `true` once that count has reached or exceeded `maxCallsPerWindow`
 * -- i.e. `true` means "no more calls allowed this window."
 *
 * Deliberately takes a plain `callCountInWindow: number` rather than an
 * array of timestamps: every current call site can obtain this count
 * directly from an indexed `db.<table>.count({ where: { ..., createdAt: {
 * gte } } })` query (cheaper than fetching every row), so this predicate
 * stays a trivial, pure comparison rather than re-deriving a count from a
 * timestamp array it would otherwise need to be handed.
 *
 * This same generic shape is reused below by `checkReasoningModelRateLimit`
 * for the project-wide `reasoningModel` cap (ai-features-design.md §6.1,
 * Finding `[Gemini swap, c]`) -- only the query supplying `callCountInWindow`
 * differs there (scoped by a fixed sentinel instead of `userId`). Transaction
 * Auto-Categorization uses `fastModel`, whose free-tier quota needs no such
 * project-wide cap per §6.1's own analysis, so only the per-user cap is wired
 * up for that feature (`features/transactions/server/actions.ts`'s
 * `RECONSIDER_MAX_CALLS_PER_ROLLING_WINDOW`).
 */
export function hasReachedRollingWindowCap(
  callCountInWindow: number,
  maxCallsPerWindow: number,
): boolean {
  return callCountInWindow >= maxCallsPerWindow
}

// ---------------------------------------------------------------------------
// `reasoningModel` cross-feature rolling-window rate limit (Phase 4a
// follow-up). Backed by `ReasoningModelCallLog` (see that model's own header
// comment in prisma/schema.prisma, and docs/database/er-diagram.md's "Design
// notes (Phase 4a follow-up)" section, for the full reasoning this section
// only summarizes).
//
// Shared by every `reasoningModel`-backed feature (Budget Advisor, Monthly
// Summaries -- both call this today; Spending Insights, Health Score
// narrative -- expected to call this too once built) via the two functions
// below, so the two rolling-window `count()` queries the design doc requires
// are written once, not once per feature.
// ---------------------------------------------------------------------------

/**
 * ai-features-design.md §6.1's Gemini-swap addendum: the binding Gemini
 * free-tier constraint for `reasoningModel` is its *daily* request count, not
 * a per-minute one, so both caps below use a rolling **day**, not the rolling
 * hour a `fastModel` cap (e.g. the "reconsider" cap above) might use. Kept
 * `export`ed so tests and either call site can reference the exact window
 * this module enforces without re-deriving it.
 */
export const REASONING_MODEL_ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Per-user cap (ai-features-design.md §2 Finding 6a / §6.1): "a handful of
 * calls per user per rolling day," directional guidance only -- Google AI
 * Studio's dashboard-driven free-tier quota for the live API key is the real
 * source of truth and was not re-confirmed against it for this dispatch (per
 * §6.1's own caveat that the exact numbers "must be confirmed in AI Studio...
 * at implementation time").
 *
 * **Judgment call:** set to 8. Reasoning: this must comfortably cover one
 * user's *legitimate combined* daily usage across all four `reasoningModel`
 * features once all four exist (one Budget Advisor refresh, one Monthly
 * Summary regenerate, one Spending Insights refresh, the automatic Health
 * Score narrative -- roughly 4 "expected" calls/day even on an active day)
 * while still being materially tighter than `MIN_REFRESH_INTERVAL_MS`/
 * `MIN_REGENERATE_INTERVAL_MS`'s own per-key cooldowns would allow on their
 * own (a 4-hour cooldown alone permits up to 6 calls/day against a single
 * key). 8 gives roughly 2x headroom over the 4-feature "expected" baseline --
 * enough that an ordinarily-active user doesn't get blocked mid-session, but
 * still a small, single-digit number per §6.1's "handful" framing, not a
 * number large enough to stop protecting the underlying daily quota. Flagged
 * for sanity-check against the project's actual AI Studio dashboard limits
 * once available, per §6.1's own documented escalation path.
 */
export const REASONING_MODEL_MAX_CALLS_PER_USER_PER_DAY = 8

/**
 * Project-wide cap (§6.1's Gemini-swap addendum, tagged `[Gemini swap, c]` in
 * ai-features-design.md §2): scoped to nothing but the rolling day, since
 * this protects the API key/project's shared quota, not any one user's.
 *
 * **Judgment call:** set to 40 -- five times the per-user cap above. Chosen
 * as a small, explicit multiple (rather than an unrelated round number) so
 * the relationship between the two caps stays legible: it is sized to let
 * roughly 5 distinct users each exhaust their own full per-user daily
 * allowance on the same day without the project-wide cap kicking in first
 * (the single-user/small-team deployment this app is built for today, per
 * §6.1's own "for a genuinely single-user deployment this collapses to the
 * same effective bound" framing) while still existing as its own independent
 * backstop once user count grows, exactly as §6.1 specifies. Flagged
 * alongside the per-user cap above for sanity-check against real AI Studio
 * dashboard limits.
 */
export const REASONING_MODEL_MAX_CALLS_PROJECT_WIDE_PER_DAY = 40

/**
 * The pure decision this rate limit reduces to, given both counts already
 * queried from `ReasoningModelCallLog` -- kept separate from
 * `checkReasoningModelRateLimit` below so the actual cap comparison is
 * unit-testable without a database, mirroring `hasReachedRollingWindowCap`'s
 * own "stays a trivial, pure comparison" precedent.
 */
export function isReasoningModelCallAllowed(
  userCallCountInWindow: number,
  projectCallCountInWindow: number,
): boolean {
  return (
    !hasReachedRollingWindowCap(
      userCallCountInWindow,
      REASONING_MODEL_MAX_CALLS_PER_USER_PER_DAY,
    ) &&
    !hasReachedRollingWindowCap(
      projectCallCountInWindow,
      REASONING_MODEL_MAX_CALLS_PROJECT_WIDE_PER_DAY,
    )
  )
}

/**
 * The shared check-and-record pair every `reasoningModel`-backed feature's
 * generation path calls: this function BEFORE attempting generation,
 * `recordReasoningModelCall` AFTER (success or failure). Runs both of
 * `ReasoningModelCallLog`'s rolling-window `count()` queries (per-user,
 * project-wide) in parallel and reduces them via `isReasoningModelCallAllowed`
 * above.
 *
 * Deliberately independent of, and never combined into the same statement
 * as, a feature's own per-key cooldown claim (`advisor.ts`/
 * `monthly-summary.ts`'s `claimGenerationSlot`) -- these are two distinct
 * mechanisms per ai-features-design.md §2's own "(a)"/"(b)" framing, and
 * `ReasoningModelCallLog`'s own header comment is explicit that both checks
 * run sequentially, never inside one atomic statement together.
 */
export async function checkReasoningModelRateLimit(
  userId: string,
  now: Date = new Date(),
): Promise<{ allowed: boolean }> {
  const windowStart = rollingWindowStart(REASONING_MODEL_ROLLING_WINDOW_MS, now)

  const [userCallCount, projectCallCount] = await Promise.all([
    db.reasoningModelCallLog.count({
      where: { userId, createdAt: { gte: windowStart } },
    }),
    db.reasoningModelCallLog.count({
      where: { createdAt: { gte: windowStart } },
    }),
  ])

  return { allowed: isReasoningModelCallAllowed(userCallCount, projectCallCount) }
}

/**
 * Records one `reasoningModel` call attempt -- called once per attempt,
 * success or failure, matching `ReasoningModelCallLog`'s own "one row per
 * attempt" append-only design (its header comment's explicit parallel to
 * `BudgetAdvisorCache.generatedAt`/`MonthlySummary.generatedAt`'s "every
 * attempt consumes the quota, not just a successful one" rule). `feature`
 * must be the exact same `featureName` string already passed to
 * `generateStructuredOutput` at the same call site (e.g. `"budgeting.advisor"`,
 * `"dashboard.monthlySummary"`) -- see `ReasoningModelCallLog.feature`'s own
 * schema comment for why this is a plain, shared string convention rather
 * than a second, parallel enum.
 */
export async function recordReasoningModelCall(
  userId: string,
  feature: string,
  now: Date = new Date(),
): Promise<void> {
  await db.reasoningModelCallLog.create({
    data: { userId, feature, createdAt: now },
  })
}

/**
 * The batch-size cap for the categorization cron job's automatic path
 * (ai-features-design.md §6): a large CSV import's "hundreds of rows" edge
 * case costs `ceil(rows / CATEGORIZATION_BATCH_SIZE)` model calls, never
 * `rows` calls -- the direct answer to the CTO's "no unbounded per-request
 * fan-out" constraint. Exported from this shared file (rather than defined
 * locally in `categorization.ts`) per §2's own module-boundary list, which
 * explicitly assigns this constant to `rate-limit.ts`.
 */
export const CATEGORIZATION_BATCH_SIZE = 40
