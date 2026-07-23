"use server"

import { getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { ok, fail, type ApiResult } from "@/lib/api-response"
import type { AiFeatureResult } from "@/lib/ai/types"

import type { SpendingInsight } from "../types"
import { refreshSpendingInsights as refreshSpendingInsightsForUser } from "./insights"
import {
  DismissSubscriptionCandidateSchema,
  RefreshSpendingInsightsSchema,
  UndismissSubscriptionMerchantSchema,
} from "./validation"

/**
 * Analytics' mutating Server Actions, per
 * docs/architecture/api-contracts.md's Analytics section: dismissing (and,
 * per the bugfix below, reversing the dismissal of) a false-positive
 * Subscription Cost Detection candidate, plus (Phase 4a) Spending Insights'
 * "Refresh insights" action below. Every other Analytics metric is read-only
 * (Server Component direct calls to `server/*.ts`), so these are this
 * module's only `actions.ts` exports.
 */

/**
 * Dismisses a detected subscription candidate as "not a subscription"
 * (analytics.md's "User override"), per api-contracts.md's
 * `dismissSubscriptionCandidate` contract. Upserts (never a plain `create`):
 * re-dismissing an already-dismissed merchant is an idempotent no-op, not a
 * second row — `DismissedSubscriptionMerchant`'s own
 * `@@unique([userId, normalizedMerchantName])` constraint is what this
 * upsert relies on, matching the schema's own doc comment ("re-dismissing
 * the same merchant is an idempotent no-op (upsert), not a second row").
 *
 * No existence check against a currently-detected candidate: a dismissal is
 * a durable, standing exclusion rule ("this merchant is not a subscription,
 * for this user, from now on," per the schema's own design note), so
 * dismissing a merchant that isn't presently detected (e.g. a race with a
 * concurrent detection change, or a merchant whose pattern hasn't recurred
 * yet) is harmless — it simply pre-empts that merchant from ever being
 * flagged in the future, which is the feature's intended behavior either
 * way.
 */
export async function dismissSubscriptionCandidate(
  input: unknown,
): Promise<ApiResult<{ normalizedMerchantName: string }>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = DismissSubscriptionCandidateSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid dismissal request")
  }
  const { normalizedMerchantName } = parsed.data

  await db.dismissedSubscriptionMerchant.upsert({
    where: { userId_normalizedMerchantName: { userId: user.id, normalizedMerchantName } },
    create: { userId: user.id, normalizedMerchantName },
    update: {},
  })

  return ok({ normalizedMerchantName })
}

/**
 * Reverses a prior `dismissSubscriptionCandidate` call (bugfix:
 * docs/testing/bug-reports/
 * subscription-dismissal-normalized-name-collision.md's "minimum viable
 * fix" — a dismissal must be recoverable, not a silent, permanent
 * exclusion). Deletes the caller's own `DismissedSubscriptionMerchant` row
 * for this `normalizedMerchantName`; the next `getSubscriptionCandidates`
 * call for this user will then re-evaluate that merchant's transaction
 * history from scratch (whether that's the original dismissed pattern
 * re-surfacing, or, per the bug report's actual scenario, a genuinely
 * different later merchant that happened to collide under normalization).
 *
 * Uses `deleteMany` (not `delete`) scoped by both `userId` and
 * `normalizedMerchantName` — `delete`'s unique-constraint `where` shape
 * would work equally well given the `@@unique([userId,
 * normalizedMerchantName])` constraint, but `deleteMany` additionally makes
 * "already not dismissed" (0 rows deleted) a harmless idempotent no-op
 * rather than a thrown `RecordNotFound`, matching this action's sibling
 * `dismissSubscriptionCandidate`'s own upsert-based idempotency.
 */
export async function undismissSubscriptionMerchant(
  input: unknown,
): Promise<ApiResult<{ normalizedMerchantName: string }>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = UndismissSubscriptionMerchantSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid undismiss request")
  }
  const { normalizedMerchantName } = parsed.data

  await db.dismissedSubscriptionMerchant.deleteMany({
    where: { userId: user.id, normalizedMerchantName },
  })

  return ok({ normalizedMerchantName })
}

// ---------------------------------------------------------------------------
// Spending Insights (Phase 4a) -- per docs/architecture/api-contracts.md's
// Feature 4 section and docs/architecture/ai-features-design.md.
// AI-generation logic lives in `./insights.ts`; this is the thin Server
// Action wrapper that authenticates, validates input, and maps a rate-limit
// rejection to an ordinary `ApiResult` failure -- the same division of
// responsibility `features/budgeting/server/actions.ts`'s
// `refreshBudgetAdvisor` already established for the Budget Advisor's own
// on-demand path.
// ---------------------------------------------------------------------------

/**
 * Explicit "Refresh insights" action (Feature 4 AC4). Never regenerates with
 * fewer than the minimum viable candidate count -- `./insights.ts`'s
 * `refreshSpendingInsights` enforces this as its own structural safety net
 * regardless of what this action is called with.
 *
 * Rate-limited by `./insights.ts`'s atomic per-key cooldown check plus the
 * shared cross-feature `reasoningModel` rate limit (never a read-then-write
 * race, per ai-features-design.md §2 Finding 6b) -- a rejected attempt is an
 * ordinary request-level rejection, surfaced as an outer `ApiResult`
 * failure, never expressed through the inner `AiFeatureResult` (matching
 * `refreshBudgetAdvisor`'s identical convention).
 */
export async function refreshSpendingInsights(
  input: unknown,
): Promise<ApiResult<AiFeatureResult<SpendingInsight[]>>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = RefreshSpendingInsightsSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid request")
  }

  const outcome = await refreshSpendingInsightsForUser(user.id, parsed.data.period)
  if (outcome.rateLimited) {
    return fail("Please wait before refreshing insights again for this period")
  }

  return ok(outcome.result)
}
