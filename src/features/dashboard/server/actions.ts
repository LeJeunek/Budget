"use server"

import { getCurrentUser } from "@/lib/auth"
import { ok, fail, type ApiResult } from "@/lib/api-response"
import type { AiFeatureResult } from "@/lib/ai/types"

import type { MonthlyRecap } from "./monthly-summary-schema"
import { regenerateMonthlySummary as regenerateMonthlySummaryForUser } from "./monthly-summary"
import { RegenerateMonthlySummarySchema } from "./validation"

/**
 * Mutating Server Actions for the Dashboard module (Phase 4a). Per
 * docs/architecture/api-contracts.md's Feature 3 section, this file's one
 * export is Automatic Monthly Summaries' optional "regenerate this summary"
 * action -- AI-generation logic lives in `./monthly-summary.ts`; this is the
 * thin Server Action wrapper that authenticates, validates input, and maps a
 * rate-limit rejection to an ordinary `ApiResult` failure, the same division
 * of responsibility `features/budgeting/server/actions.ts`'s
 * `refreshBudgetAdvisor` already established for the Budget Advisor's own
 * on-demand path.
 *
 * Every action below, per folder-tree.md's rule:
 *   1. Calls getCurrentUser() and fails closed with "UNAUTHENTICATED".
 *   2. Passes only that resolved user's own id into `./monthly-summary.ts` --
 *      never a client-supplied id.
 */

/**
 * The optional "Regenerate this summary" action (Feature 3 Edge Cases: "A
 * user-triggered 'regenerate this summary' action may optionally be offered
 * so this isn't a permanent dead end"). Never regenerates the current,
 * in-progress month (AC3) -- `./monthly-summary.ts`'s
 * `regenerateMonthlySummary` enforces this as its own structural safety net
 * regardless of what this action is called with.
 *
 * Rate-limited by `./monthly-summary.ts`'s atomic per-key cooldown check
 * (never a read-then-write race, per ai-features-design.md §2 Finding 6b) --
 * a rejected attempt is an ordinary request-level rejection, surfaced as an
 * outer `ApiResult` failure, never expressed through the inner
 * `AiFeatureResult` (matching `refreshBudgetAdvisor`'s identical convention).
 */
export async function regenerateMonthlySummary(
  input: unknown,
): Promise<ApiResult<AiFeatureResult<MonthlyRecap>>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = RegenerateMonthlySummarySchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid request")
  }

  const outcome = await regenerateMonthlySummaryForUser(user.id, parsed.data.month)
  if (outcome.rateLimited) {
    return fail("Please wait before regenerating this summary again")
  }

  return ok(outcome.result)
}
