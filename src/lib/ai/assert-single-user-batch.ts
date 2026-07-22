// Cross-user isolation as a stated security invariant, not just a
// performance decision (docs/architecture/ai-features-design.md §4.5,
// Security Architect Finding 3):
//
//   A single `generateStructuredOutput` call's data payload must never
//   contain rows belonging to more than one user, under any future
//   optimization.
//
// Stated once, here, as shared `lib/ai/` infrastructure rather than
// duplicated per feature: §4.5/§6 name this exact invariant as applying to
// every one of this phase's cron-driven batch jobs (Transaction
// Auto-Categorization's `categorize-transactions` cron, and — per §6's own
// text — the future Monthly Summary and Financial Health Score snapshot
// cron jobs' "same [Finding 3] single-user-per-payload invariant"), so a
// single, always-on assertion lives here rather than being re-implemented,
// possibly with subtly different behavior, in each feature's own
// batch-prompt-building step.
//
// This is a pure, dependency-free function deliberately: it must be safely
// importable (and unit-testable) from any feature-owned server file without
// pulling in that feature's own Prisma/service import graph.

/**
 * Throws (fails loudly, never silently drops rows) if any row in `rows`
 * belongs to a `userId` other than `expectedUserId`. Called by a feature's
 * batch-prompt-building step immediately before constructing a prompt
 * payload, on both the candidate-record list AND any reference/lookup list
 * (e.g. categorization's candidate categories) placed into that same call.
 *
 * This is the concrete guard that keeps a future "parallelize the cron
 * loop across users" optimization safe to review: a reviewer changing the
 * loop's concurrency model still has this assertion in the payload-
 * construction path catching any accidental cross-user batch, rather than
 * relying on independently rediscovering that this was ever a security
 * requirement (ai-features-design.md §4.5's own framing).
 */
export function assertSingleUserBatch(
  rows: { userId: string }[],
  expectedUserId: string,
): void {
  for (const row of rows) {
    if (row.userId !== expectedUserId) {
      throw new Error(
        `Cross-user AI batch payload detected: expected every row to belong to userId ${expectedUserId}, found a row belonging to ${row.userId}. This must never happen -- see ai-features-design.md §4.5.`,
      )
    }
  }
}
