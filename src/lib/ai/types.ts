// Shared types for `lib/ai/` (Phase 4a), per
// docs/architecture/ai-features-design.md §5 and
// docs/architecture/naming-standards.md's "AI-specific conventions" section.
//
// This is the ONLY place `AiFeatureResult<T>` is defined. Every feature-owned
// AI-generation function (`categorization.ts`, and — in future dispatches —
// `advisor.ts`, `monthly-summary.ts`, `insights.ts`, `health-score-narrative.ts`)
// returns this exact shape, never a thrown exception and never a
// feature-invented parallel union. See `generate-structured-output.ts`'s own
// doc comment for the "why a Result type, not a thrown error" reasoning.

/**
 * The universal AI-feature outcome. `"unavailable"` collapses every one of
 * the product spec's stated degradation triggers (provider down, timeout,
 * output that still fails validation after the one retry) into a single
 * externally-visible state — the specific internal reason is logged by
 * `generate-structured-output.ts` for observability but never surfaced past
 * `lib/ai/`'s boundary (naming-standards.md's `AiFailureReason` note).
 */
export type AiFeatureResult<T> =
  | { status: "ok"; data: T }
  | { status: "unavailable" }

/**
 * One figure a narrative/insight-generating feature cites as support for its
 * text, per ai-features-design.md §4.3's grounding-verification pattern
 * (`verify-grounding.ts`) and §4.3's narrative-safety number-token check
 * (`verify-narrative-safety.ts`). Not used by Transaction Auto-Categorization
 * itself (a closed-set enum output has no narrative text to ground) — defined
 * here now because every one of the next four AI features' structured-output
 * schemas is expected to include a `citedFigures: CitedFigure[]` field of
 * this exact shape (api-contracts.md's Phase 4a section).
 */
export interface CitedFigure {
  label: string
  value: number
}
