import type { CitedFigure } from "./types"

// The anti-fabrication check (docs/architecture/ai-features-design.md §4.3).
//
// Every narrative-producing AI feature schema requires the model to return
// its narrative alongside a structured `citedFigures: CitedFigure[]` array
// naming exactly which already-known figures the narrative draws from. The
// calling feature always supplies a `groundingData: Record<string, number>`
// map built from the real data it already fetched (Budgeting's
// Allocated/Spent/Remaining, Analytics' category-trend percentages, etc.) --
// never invented by the model. This file confirms every entry in
// `citedFigures` matches a real, supplied figure before the result is ever
// treated as valid -- a mismatch is an invalid-output failure, handled
// identically to a Zod validation failure by
// `generate-structured-output.ts`'s retry-once-then-degrade pipeline (§3).
//
// Not exercised by Transaction Auto-Categorization (this feature's output is
// a closed-set enum with no narrative/citedFigures field at all -- §4.2
// already gives it a stronger, structural guarantee than this check can
// provide) -- created now because every one of the next four AI features
// needs it as shared infrastructure, per this module's own boundary list
// (ai-features-design.md §2).

/** Default tolerance for matching a cited figure against a known-good value,
 * to absorb ordinary floating-point/rounding noise (e.g. a model reporting
 * "$1,234.56" when the stored value is `1234.555`) without treating a
 * genuinely fabricated figure as a match. */
const DEFAULT_EPSILON = 0.01

/**
 * Returns `true` only if every entry in `citedFigures` matches (within
 * `epsilon`) at least one value present in `groundingData` -- the caller's
 * own map of every figure legitimately available to that specific call. An
 * empty `citedFigures` array trivially passes (a narrative citing nothing is
 * not itself a grounding failure; `verify-narrative-safety.ts` separately
 * checks the narrative *text* for an unlisted number stated in prose).
 *
 * Matches by numeric value only, not by `label` -- the model's chosen label
 * text is not itself a source of untrusted risk (it can never become a
 * database write or a categoryId the way `ai-features.md`'s Cross-Cutting
 * Requirement #5 worries about), and requiring an exact label-to-key match
 * would make this check brittle against harmless label phrasing
 * differences the model is otherwise free to choose.
 */
export function verifyGrounding(
  citedFigures: CitedFigure[],
  groundingData: Record<string, number>,
  epsilon: number = DEFAULT_EPSILON,
): boolean {
  if (citedFigures.length === 0) {
    return true
  }

  const knownValues = Object.values(groundingData)
  if (knownValues.length === 0) {
    return false
  }

  return citedFigures.every((figure) =>
    knownValues.some((known) => Math.abs(known - figure.value) <= epsilon),
  )
}
