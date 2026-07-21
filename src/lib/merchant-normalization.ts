/**
 * Pure, framework-agnostic merchant-name normalization, per
 * docs/architecture/Architecture.md's "Reusable utilities added in Phase 3b"
 * section: shared by Analytics' Top Merchants (Pass 1) and Subscription Cost
 * Detection (Pass 2) so "NETFLIX.COM" and "Netflix" group into the same
 * merchant bucket (docs/product/analytics.md's own example).
 *
 * Deliberately **not** merged with `features/transactions/server/import.ts`'s
 * private CSV-dedup `buildDedupeKey` normalization (see Architecture.md for
 * the full reasoning) — that helper wants a *stricter* match (avoid
 * discarding a legitimate transaction as a false duplicate), while this one
 * deliberately wants a *fuzzier* match (grouping near-identical merchant
 * strings into one analytics bucket is a low-severity mistake if it
 * over-groups, unlike CSV dedup silently dropping a real transaction).
 *
 * No Prisma, no `lib/db.ts`/`lib/auth.ts` import — pure string transformation,
 * unit-testable with fixture strings alone, same testability bar as
 * `features/debt/payoff-math.ts`.
 */

// Corporate-entity suffix words stripped only when they trail the merchant
// name as their own word (never mid-word — "coinbase" must never become
// "inbase" by matching a bare "co"). The exact list is an implementation
// detail (per Architecture.md's note), not an architectural decision.
const TRAILING_ENTITY_SUFFIXES = new Set([
  "inc",
  "llc",
  "corp",
  "corporation",
  "co",
  "company",
  "ltd",
  "llp",
  "plc",
])

// Common top-level-domain-style suffixes attached directly to the merchant
// name with no separating space (e.g. "netflix.com", "hulu.net") — stripped
// before punctuation removal, since the removal step below would otherwise
// destroy the "." that identifies this pattern.
const TRAILING_DOMAIN_SUFFIX_PATTERN = /\.(com|net|org|io|co)$/i

/**
 * Normalizes a raw `Transaction.merchant` string into a stable grouping key.
 *
 * Steps (in order — each depends on the previous having already run):
 * 1. Trim and case-fold, so casing differences never split one merchant into
 *    two buckets.
 * 2. Strip a single trailing domain-style suffix (".com", ".net", etc.)
 *    attached directly to the name, before punctuation is stripped generally
 *    (order matters: this regex needs the "." still present).
 * 3. Strip stray punctuation characters point-of-sale systems commonly
 *    append (periods, commas, asterisks, hashes) and collapse internal
 *    whitespace down to single spaces.
 * 4. Strip a trailing corporate-entity suffix *word* (never more than one —
 *    a merchant name is never itself just an entity suffix, guarded by the
 *    `words.length > 1` check so a merchant literally named "Company" isn't
 *    reduced to an empty string).
 *
 * Not chased to 100% accuracy this phase — per analytics.md's own Edge
 * Cases: "a merchant name that varies more than normalization can reconcile
 * ... may fail to group correctly and simply won't be detected — an
 * acknowledged limitation, not a bug."
 */
export function normalizeMerchantName(raw: string): string {
  let name = raw.trim().toLowerCase()

  name = name.replace(TRAILING_DOMAIN_SUFFIX_PATTERN, "")
  name = name.replace(/[.,*#]/g, "")
  name = name.replace(/\s+/g, " ").trim()

  const words = name.split(" ").filter(Boolean)
  if (words.length > 1 && TRAILING_ENTITY_SUFFIXES.has(words[words.length - 1])) {
    words.pop()
  }

  return words.join(" ")
}
