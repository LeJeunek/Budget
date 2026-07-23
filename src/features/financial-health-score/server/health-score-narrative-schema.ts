import { z } from "zod"

import type { CitedFigure } from "@/lib/ai/types"

// The Zod structured-output schema, prompt-input DTO, and pure
// prompt-context/delta helpers for the Financial Health Score narrative
// (docs/product/ai-features.md Feature 5, docs/architecture/ai-features-design.md
// §4.1/§4.3). Per docs/architecture/naming-standards.md's Phase 4a convention,
// this `-schema.ts` suffix is reserved exclusively for the shape an AI call
// must return -- this feature has no Server-Action *input* to validate
// separately (there is deliberately no on-demand refresh action for this
// narrative, per api-contracts.md's Feature 5 section), so unlike the other
// three narrative features there is no sibling `validation.ts` this file
// needs to stay distinct from.
//
// Closest reference implementation: `features/dashboard/server/monthly-summary-schema.ts`
// -- reused wherever this feature's shape matches Monthly Summaries' (a single
// bounded narrative + `citedFigures` field, a narrow prompt-input DTO built
// field-by-field from already-computed figures, a `groundingData` builder
// kept alongside its schema). Diverged where Feature 5's own shape genuinely
// differs: there is no untrusted user-authored text anywhere in this
// feature's prompt input at all (every figure is a 0-100 score this
// product's own deterministic formula produced -- see this file's own
// "Data minimization" note below), and this feature additionally grounds its
// narrative in each component's *change* since the prior snapshot, not just
// its current value.
//
// **Module boundary, restated (ai-features-design.md §2's per-feature
// placement table):** this file is a sibling to, and never imported by,
// `features/financial-health-score/server/service.ts` (the deterministic
// formula, Backend Engineer-owned) or `.../snapshot.ts` (the cron capture
// job, Backend Engineer-owned, not yet built at the time this file was
// written). This file depends on neither -- every type below is a narrow,
// self-contained structural shape (`HealthScoreNarrativeComponents`,
// `HealthScoreSnapshotValues`) that Backend Engineer's eventual
// `FinancialHealthScoreBreakdown`/`FinancialHealthScoreSnapshot`-row shapes
// are expected to satisfy structurally (TypeScript's structural typing means
// no import, and no code change here, is required for compatibility once
// those files exist) -- see this feature's own PR/task summary for the exact
// artifact this hands off to Backend Engineer.
//
// **Data minimization (ai-features-design.md §2's `redact.ts` note):** unlike
// every other narrative feature, this feature's prompt input contains ZERO
// untrusted user-authored strings (no merchant/category/debt/goal name
// appears anywhere in a Financial Health Score component -- every one of the
// four components is a 0-100 number this product's own formula computed).
// `redact.ts` is therefore never called by this feature's files, per this
// dispatch's own "minimal need here" scoping note -- there is nothing for it
// to sanitize.

// ---------------------------------------------------------------------------
// Shared component shapes
// ---------------------------------------------------------------------------

/**
 * The four component keys, per `ai-features.md` Feature 5's formula --
 * matches the four `FinancialHealthScoreSnapshot.*Score` column names
 * (`prisma/schema.prisma`) with their `Score` suffix removed, and is expected
 * to match Backend Engineer's own `FinancialHealthScoreBreakdown.components`/
 * `.undefinedComponents` key set exactly (api-contracts.md's Feature 5
 * section) -- defined locally here (rather than imported) only because this
 * file must not depend on a not-yet-built Backend Engineer module; see this
 * file's own top-of-file "Module boundary" note.
 */
export type HealthScoreNarrativeComponentKey =
  | "debtToIncome"
  | "savingsRate"
  | "budgetAdherence"
  | "netWorthTrend"

const COMPONENT_KEYS: readonly HealthScoreNarrativeComponentKey[] = [
  "debtToIncome",
  "savingsRate",
  "budgetAdherence",
  "netWorthTrend",
]

/** Maps each component key to the `groundingData`/prompt-input label used for
 * it -- kept as one small lookup so the naming stays consistent between the
 * current-value key and its `...Delta` sibling below, rather than
 * re-deriving the string per call site. */
const COMPONENT_GROUNDING_KEY: Record<HealthScoreNarrativeComponentKey, string> = {
  debtToIncome: "debtToIncomeScore",
  savingsRate: "savingsRateScore",
  budgetAdherence: "budgetAdherenceScore",
  netWorthTrend: "netWorthTrendScore",
}

/** Reuses the Budget Health Score's own banded labels verbatim
 * (`ai-features.md` Feature 5, Reasoning point 6 / AC3) -- never a new label
 * set. */
export type HealthScoreNarrativeLabel = "Good" | "Fair" | "Needs attention"

/**
 * One snapshot's four component values -- each independently nullable per
 * the formula's own "undefined component, not zero" rule (`ai-features.md`
 * Feature 5's "Undefined-component handling"). Used both for the CURRENT
 * (just-computed) snapshot and, when one exists, the PREVIOUS snapshot this
 * narrative compares against.
 */
export interface HealthScoreNarrativeComponents {
  debtToIncome: number | null
  savingsRate: number | null
  budgetAdherence: number | null
  netWorthTrend: number | null
}

/**
 * The full set of already-computed values for one snapshot (current or
 * previous) that this feature's narrative may need. `totalScore`/`label` are
 * nullable together here (mirroring
 * `FinancialHealthScoreSnapshot.totalScore`/`.label`'s own "null exactly when
 * zero components were computable that day" pairing) -- this is the shape a
 * PREVIOUS day's row may be in; the CURRENT snapshot passed to
 * `generateFinancialHealthScoreNarrative` (`./health-score-narrative.ts`) is
 * additionally guarded to only ever attempt generation when its own
 * `totalScore`/`label` are non-null (nothing to narrate otherwise) --see that
 * file's `shouldAttemptNarrativeGeneration`.
 */
export interface HealthScoreSnapshotValues {
  totalScore: number | null
  label: HealthScoreNarrativeLabel | null
  components: HealthScoreNarrativeComponents
}

// ---------------------------------------------------------------------------
// Prompt-input DTO (ai-features-design.md §4.1, Security Architect Finding 2)
// ---------------------------------------------------------------------------

/**
 * The narrow, explicit prompt-input DTO for this feature -- the ONLY shape
 * `health-score-narrative.ts` is ever allowed to pass into
 * `lib/ai/prompts/build-prompt.ts`. Built field-by-field (via
 * `buildHealthScoreNarrativePromptContext` below) from the current, just-
 * computed snapshot values and, when one exists, the previous snapshot's
 * values -- no Prisma entity is ever spread or passed in directly, and
 * neither `totalScore`/`components` here nor any other figure is ever
 * re-derived or recalculated by this file (Cross-Cutting Requirement #2).
 */
export interface HealthScoreNarrativePromptInput {
  totalScore: number
  label: HealthScoreNarrativeLabel
  components: HealthScoreNarrativeComponents
  /** Which component(s), if any, are currently undefined -- included so the
   * model can mention "based on fewer than four factors" honestly, without
   * inventing a value for a component it wasn't given (AC4's own "clearly
   * annotated" partial-score framing). Not part of `groundingData` (it is a
   * list of labels, not a number `verify-grounding.ts`/
   * `verify-narrative-safety.ts` could check). */
  undefinedComponents: HealthScoreNarrativeComponentKey[]
  /** `null` when there is no prior snapshot yet (this user's first-ever
   * captured score) OR the prior snapshot itself had zero computable
   * components. */
  previousTotalScore: number | null
  /** `currentTotalScore - previousTotalScore`, or `null` under the same
   * conditions as `previousTotalScore` -- pre-computed here (never left for
   * the model to subtract itself), per this codebase's standing "never make
   * the model do arithmetic it could get wrong" convention. */
  totalScoreDelta: number | null
  /** Per-component `current - previous`, each independently `null` when
   * either side of that specific component is undefined (mirrors
   * `computeComponentDelta`'s own doc comment). */
  componentDeltas: HealthScoreNarrativeComponents
}

// ---------------------------------------------------------------------------
// AI structured-output schema (ai-features-design.md §4.3)
// ---------------------------------------------------------------------------

/** api-contracts.md's own stated ceiling for this feature's narrative field:
 * "`narrative` is `z.string().max(~400)`." Every narrative field must be
 * explicitly bounded, never unbounded (Security Architect Finding 1a) -- an
 * over-length response is itself an invalid-output failure under
 * `generate-structured-output.ts`'s existing retry-once-then-degrade path
 * (§3), not something this schema needs to handle specially. */
const NARRATIVE_MAX_LENGTH = 400

const CitedFigureShape = z.object({
  label: z.string(),
  value: z.number(),
})

/**
 * The model's structured output: one bounded narrative paragraph plus the
 * `citedFigures` array `lib/ai/verify-grounding.ts` checks against the
 * caller's own `groundingData` map (§4.3). Deliberately does NOT include
 * `totalScore`/`label`/any component value -- every one of those is a
 * deterministic fact `health-score-narrative.ts` already knows before ever
 * calling the model (Feature 5's own "the narrative explains the score but
 * never alters it" rule, ai-features-design.md §3's prompt-injection-defense
 * framing) and is never re-derived from, or trusted from, the model's own
 * output -- the model's ONLY possible effect on this product's data is the
 * text of `narrative` itself, never a number that could be mistaken for (or
 * substituted in place of) the real score. No `z.union`/`z.record` anywhere,
 * per ai-features-design.md §1's Gemini structured-output constraint -- every
 * shape here is built only from `z.object`/`z.array`/`z.string`/`z.number`.
 */
export const FinancialHealthScoreNarrativeSchema = z.object({
  narrative: z.string().max(NARRATIVE_MAX_LENGTH),
  citedFigures: z.array(CitedFigureShape),
})

export type FinancialHealthScoreNarrativeOutput = z.infer<
  typeof FinancialHealthScoreNarrativeSchema
>

// ---------------------------------------------------------------------------
// Pure helpers -- no Prisma, unit-tested directly
// (health-score-narrative-schema.test.ts), mirroring
// `features/dashboard/server/monthly-summary.ts`'s own
// `computeNetWorthChange`-style "extract the pure calculation" precedent.
// ---------------------------------------------------------------------------

/**
 * `current - previous`, or `null` when either side is undefined -- the one
 * place this feature computes a component/total-score delta, so every call
 * site (per-component below, and the total score in
 * `buildHealthScoreNarrativePromptContext`) derives it identically. Mirrors
 * `monthly-summary.ts`'s `computeNetWorthChange`'s identical
 * "null-propagates, never estimated" shape.
 */
export function computeComponentDelta(
  current: number | null,
  previous: number | null,
): number | null {
  if (current === null || previous === null) {
    return null
  }
  return current - previous
}

/**
 * Per-component deltas for all four components at once. `previous === null`
 * (no prior snapshot at all -- this user's first-ever score) is handled
 * identically to "every previous component individually undefined": every
 * resulting delta is `null`, never a fabricated "first score's implicit
 * change from zero."
 */
export function computeComponentDeltas(
  current: HealthScoreNarrativeComponents,
  previous: HealthScoreNarrativeComponents | null,
): HealthScoreNarrativeComponents {
  return {
    debtToIncome: computeComponentDelta(current.debtToIncome, previous?.debtToIncome ?? null),
    savingsRate: computeComponentDelta(current.savingsRate, previous?.savingsRate ?? null),
    budgetAdherence: computeComponentDelta(
      current.budgetAdherence,
      previous?.budgetAdherence ?? null,
    ),
    netWorthTrend: computeComponentDelta(current.netWorthTrend, previous?.netWorthTrend ?? null),
  }
}

/**
 * Which component keys are currently `null` (undefined) -- `ai-features.md`
 * Feature 5's own "a component is undefined, NOT zero" rule, restated here as
 * a pure predicate over the four-component shape so both this file's prompt
 * builder and its own test suite share one definition of "undefined."
 */
export function deriveUndefinedComponents(
  components: HealthScoreNarrativeComponents,
): HealthScoreNarrativeComponentKey[] {
  return COMPONENT_KEYS.filter((key) => components[key] === null)
}

/**
 * Builds this call's `HealthScoreNarrativePromptInput` DTO and its matching
 * `groundingData` map from the current snapshot's already-computed
 * total/label/components and, when one exists, the previous snapshot's own
 * values -- the single place both are assembled, mirroring
 * `advisor-schema.ts`'s/`monthly-summary-schema.ts`'s identical
 * `build*PromptContext` precedent, so this feature has exactly one
 * implementation of "what counts as this call's grounding data."
 *
 * `groundingData` keys are plain, fixed strings (`totalScore`,
 * `debtToIncomeScore`, `debtToIncomeScoreDelta`, ...) rather than
 * index-prefixed the way `advisor-schema.ts`'s per-category keys are --
 * there are exactly four fixed, non-repeating components here (never an
 * arbitrary-length list), so there is no same-call collision risk an
 * index prefix would need to guard against.
 *
 * `current.totalScore`/`current.label` are required (non-nullable) params
 * here -- the caller (`health-score-narrative.ts`) is expected to have
 * already confirmed a score exists via `shouldAttemptNarrativeGeneration`
 * before ever reaching this builder, so this function's own signature makes
 * "there is nothing to narrate" unrepresentable rather than silently
 * producing an empty/degenerate prompt for it.
 */
export function buildHealthScoreNarrativePromptContext(
  current: {
    totalScore: number
    label: HealthScoreNarrativeLabel
    components: HealthScoreNarrativeComponents
  },
  previous: HealthScoreSnapshotValues | null,
): {
  promptInput: HealthScoreNarrativePromptInput
  groundingData: Record<string, number>
} {
  const previousComponents = previous?.components ?? null
  const componentDeltas = computeComponentDeltas(current.components, previousComponents)
  const previousTotalScore = previous?.totalScore ?? null
  const totalScoreDelta = computeComponentDelta(current.totalScore, previousTotalScore)
  const undefinedComponents = deriveUndefinedComponents(current.components)

  const groundingData: Record<string, number> = { totalScore: current.totalScore }

  for (const key of COMPONENT_KEYS) {
    const groundingKey = COMPONENT_GROUNDING_KEY[key]
    const value = current.components[key]
    if (value !== null) {
      groundingData[groundingKey] = value
    }
    const delta = componentDeltas[key]
    if (delta !== null) {
      groundingData[`${groundingKey}Delta`] = delta
    }
  }

  if (previousTotalScore !== null) {
    groundingData.previousTotalScore = previousTotalScore
  }
  if (totalScoreDelta !== null) {
    groundingData.totalScoreDelta = totalScoreDelta
  }

  const promptInput: HealthScoreNarrativePromptInput = {
    totalScore: current.totalScore,
    label: current.label,
    components: current.components,
    undefinedComponents,
    previousTotalScore,
    totalScoreDelta,
    componentDeltas,
  }

  return { promptInput, groundingData }
}

/** Re-exported for callers that only need the `CitedFigure` shape without
 * pulling in `@/lib/ai/types` themselves. */
export type { CitedFigure }
