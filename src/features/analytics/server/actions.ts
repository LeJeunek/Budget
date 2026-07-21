"use server"

import { getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { ok, fail, type ApiResult } from "@/lib/api-response"

import { DismissSubscriptionCandidateSchema } from "./validation"

/**
 * Analytics' one mutating Server Action, per
 * docs/architecture/api-contracts.md's Analytics section: dismissing a
 * false-positive Subscription Cost Detection candidate. Every other
 * Analytics metric is read-only (Server Component direct calls to
 * `server/*.ts`), so this is the module's only `actions.ts` export.
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
