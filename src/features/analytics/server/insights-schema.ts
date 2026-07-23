import { z } from "zod"

import type { SpendingInsightSourceMetric } from "../types"
import type { SpendingInsightCandidate } from "./insights-candidates"

// The Zod structured-output schema, prompt-input DTO, and grounding-data
// builder for Spending Insights (docs/product/ai-features.md Feature 4,
// docs/architecture/ai-features-design.md §4.1/§4.3). Per
// docs/architecture/naming-standards.md's Phase 4a convention, this
// `-schema.ts` suffix is reserved exclusively for the shape an AI call must
// return -- ordinary Server-Action *input* validation (the `{ period }`
// input to the `refreshSpendingInsights` Server Action) lives in
// `./validation.ts`, never here. Mirrors
// `features/budgeting/server/advisor-schema.ts`'s exact structure -- this
// feature's closest reference implementation.
//
// Unlike `advisor-schema.ts`/`monthly-summary-schema.ts`, the client-safe
// return shape (`SpendingInsight`) is NOT defined in this file -- per
// folder-tree.md's explicit Phase 4a note ("types.ts ... [Phase 4a ADDS:
// SpendingInsight]"), it lives in `../types.ts` instead, since (unlike those
// two sibling features) there is no pre-existing name collision in this
// module forcing it into the AI-schema file.

// ---------------------------------------------------------------------------
// Prompt-input DTO (ai-features-design.md §4.1, Security Architect Finding 2)
// ---------------------------------------------------------------------------

/**
 * One candidate observation as the model sees it -- exactly
 * `SpendingInsightCandidate` (`insights-candidates.ts`) minus its internal-
 * only `magnitude` ranking key, which is never sent to the model (it exists
 * purely for `insights.ts`'s own pre-sort/truncation, per that file's own
 * doc comment).
 */
export interface SpendingInsightCandidateInput {
  sourceMetric: SpendingInsightSourceMetric
  subjectName: string
  observationType: string
  figures: { label: string; value: number }[]
}

/**
 * The narrow, explicit prompt-input DTO for this feature -- the ONLY shape
 * `insights.ts` is ever allowed to pass into `lib/ai/prompts/build-prompt.ts`.
 * Built field-by-field from `insights.ts`'s already-ranked, already-truncated
 * candidate list (via `buildInsightsPromptContext` below) -- no Prisma entity
 * or Analytics metric's own return type is ever spread or passed in directly.
 */
export interface SpendingInsightsPromptInput {
  candidates: SpendingInsightCandidateInput[]
}

// ---------------------------------------------------------------------------
// AI structured-output schema (ai-features-design.md §4.3)
// ---------------------------------------------------------------------------

/** api-contracts.md's own stated ceiling for this feature's narrative field:
 * "a `~150`-character ceiling for a single Spending Insight." Every
 * narrative field must be explicitly bounded, never unbounded (Security
 * Architect Finding 1a) -- an over-length response is itself an
 * invalid-output failure under `generate-structured-output.ts`'s existing
 * retry-once-then-degrade path (§3), not something this schema needs to
 * handle specially. */
const INSIGHT_TEXT_MAX_LENGTH = 150

/** Feature 4 AC1: "between 2 and 4 concise, natural-language observations
 * per refresh." `insights.ts` never even attempts generation with fewer than
 * `MIN_INSIGHTS` viable candidates available (its own
 * `MIN_CANDIDATES_TO_ATTEMPT` gate) -- see that file's doc comments for why
 * this floor is enforced before the model is ever called, not left for the
 * model to somehow satisfy from too little real data. */
const MIN_INSIGHTS = 2
const MAX_INSIGHTS = 4

const CitedFigureShape = z.object({
  label: z.string(),
  value: z.number(),
})

/** Feature 4's own closed six-metric set, duplicated here (rather than
 * imported as a value) only because `z.enum` requires a literal tuple, not a
 * type -- `satisfies readonly SpendingInsightSourceMetric[]` keeps this
 * tuple compile-time-checked against `../types.ts`'s exported union, so the
 * two can never silently drift apart. */
const SOURCE_METRICS = [
  "categoryTrends",
  "topMerchants",
  "largestPurchases",
  "subscriptionDetection",
  "dailySpendingHeatmap",
  "savingsGrowth",
] as const satisfies readonly SpendingInsightSourceMetric[]

/**
 * The model's structured output: 2-4 insights, each a bounded narrative
 * string plus the `citedFigures` array `lib/ai/verify-grounding.ts` checks
 * against the caller's own `groundingData` map (§4.3), and a `sourceMetric`
 * naming which of the six Analytics metrics this insight is drawn from (for
 * traceability/click-through, per api-contracts.md's Feature 4 section). No
 * `z.union`/`z.record` anywhere, per ai-features-design.md §1's Gemini
 * structured-output constraint -- every shape here is built only from
 * `z.object`/`z.array`/`z.string`/`z.number`/`z.enum`.
 */
export const SpendingInsightsSchema = z.object({
  insights: z
    .array(
      z.object({
        text: z.string().max(INSIGHT_TEXT_MAX_LENGTH),
        citedFigures: z.array(CitedFigureShape),
        sourceMetric: z.enum(SOURCE_METRICS),
      }),
    )
    .min(MIN_INSIGHTS)
    .max(MAX_INSIGHTS),
})

export type SpendingInsightsOutput = z.infer<typeof SpendingInsightsSchema>

// ---------------------------------------------------------------------------
// Prompt-input + grounding-data builder
// ---------------------------------------------------------------------------

/**
 * Builds this call's `SpendingInsightsPromptInput` DTO and its matching
 * `groundingData` map from `insights.ts`'s already-ranked, already-truncated
 * candidate list -- the single place both are assembled, so this feature's
 * two call sites (implicit generate-on-first-view, explicit refresh) can
 * never build them differently.
 *
 * `groundingData` keys are candidate-and-figure-index-prefixed
 * (`candidate_${i}_figure_${j}`) rather than label-keyed, mirroring
 * `advisor-schema.ts`'s `buildAdvisorPromptContext` reasoning exactly: two
 * candidates could in principle share a figure label (or collide after
 * `redactText`'s truncation of a `subjectName` embedded in a label) --
 * `verify-grounding.ts`/`verify-narrative-safety.ts` both match by numeric
 * *value*, never by key, so the key scheme only needs to avoid same-call
 * collisions, never to be human-readable or stable across calls.
 */
export function buildInsightsPromptContext(candidates: SpendingInsightCandidate[]): {
  promptInput: SpendingInsightsPromptInput
  groundingData: Record<string, number>
} {
  const promptCandidates: SpendingInsightCandidateInput[] = candidates.map((candidate) => ({
    sourceMetric: candidate.sourceMetric,
    subjectName: candidate.subjectName,
    observationType: candidate.observationType,
    figures: candidate.figures,
  }))

  const groundingData: Record<string, number> = {}
  candidates.forEach((candidate, candidateIndex) => {
    candidate.figures.forEach((figure, figureIndex) => {
      groundingData[`candidate_${candidateIndex}_figure_${figureIndex}`] = figure.value
    })
  })

  return { promptInput: { candidates: promptCandidates }, groundingData }
}
