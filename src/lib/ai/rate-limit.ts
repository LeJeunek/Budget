// Shared helper for the "no unbounded per-request fan-out" constraint
// (docs/architecture/ai-features-design.md §2/§6), covering the pure,
// feature-agnostic math behind two distinct mechanisms every on-demand
// generate/refresh/reconsider action must apply, in addition to the
// batch-size cap constant the categorization cron job uses.
//
// This file intentionally holds no Prisma/persistence code of its own --
// none of `lib/ai/` owns a database table (§2's own module-boundary list).
// Each feature's own server file is the one that reads its own cache row /
// suggestion table and performs whatever write is needed; the functions
// below are the pure predicates that decide, given data the feature already
// queried, whether a call is currently allowed.

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
 * This same generic shape is what a future project-wide `reasoningModel`
 * cap (ai-features-design.md §6.1, Finding [Gemini swap, c]) would reuse --
 * only the query supplying `callCountInWindow` differs (scoped by a fixed
 * sentinel instead of `userId`). Transaction Auto-Categorization uses
 * `fastModel`, whose free-tier quota needs no such project-wide cap per
 * §6.1's own analysis, so only the per-user cap is wired up by this
 * dispatch.
 */
export function hasReachedRollingWindowCap(
  callCountInWindow: number,
  maxCallsPerWindow: number,
): boolean {
  return callCountInWindow >= maxCallsPerWindow
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
