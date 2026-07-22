import { z } from "zod"

import type { CitedFigure } from "@/lib/ai/types"

import type { BudgetCategoryLine, BudgetHealthScore, BudgetMonthTotals } from "../types"

// The Zod structured-output schema, prompt-input DTO, and client-safe return
// shape for the AI Budget Advisor (docs/product/ai-features.md Feature 2,
// docs/architecture/ai-features-design.md §4.1/§4.3). Per
// docs/architecture/naming-standards.md's Phase 4a convention, this
// `-schema.ts` suffix is reserved exclusively for the shape an AI call must
// return -- ordinary Server-Action *input* validation (the `{ month }` input
// to the `refreshBudgetAdvisor` Server Action) lives in `./validation.ts`,
// never here.

// ---------------------------------------------------------------------------
// Prompt-input DTO (ai-features-design.md §4.1, Security Architect Finding 2)
// ---------------------------------------------------------------------------

/**
 * One budgeted category's figures, exactly as already shown on the same
 * Budgeting page row (`BudgetCategoryLine`) -- `categoryName` is
 * user-authored/untrusted text (expected to already be `redactText()`-
 * sanitized by the caller before this DTO is built, same discipline as
 * `CategorizationPromptInput.merchant`); every other field is a plain number
 * this product already computed, never re-derived here.
 */
export interface BudgetAdvisorCategoryInput {
  categoryName: string
  allocated: number
  spent: number
  remaining: number
  /** Rounded to the nearest whole percent before it ever reaches the model
   * (see `buildAdvisorPromptContext` below) -- keeps the figure the model is
   * told to cite exactly matching the whole-number form a narrative sentence
   * naturally states ("92%"), so `verify-narrative-safety.ts`'s tight
   * (0.01) epsilon check doesn't spuriously reject an ordinary rounding
   * difference between an unrounded percentage and the model's prose. */
  percentUsed: number
  isOverBudget: boolean
}

/**
 * The narrow, explicit prompt-input DTO for this feature -- the ONLY shape
 * `advisor.ts` is ever allowed to pass into `lib/ai/prompts/build-prompt.ts`.
 * Built field-by-field from an already-fetched `BudgetMonthView`/
 * `BudgetHealthScore` (via `buildAdvisorPromptContext`); the Prisma-derived
 * `BudgetCategoryLine[]` itself is never spread or passed in directly.
 * Deliberately scoped to *budgeted* categories only (`allocated !== null`) --
 * an unbudgeted category has no plan to measure adherence against, so it is
 * out of scope for "how is my month going against my plan" advice (Feature
 * 2's own framing), and `uncategorizedSpent` is likewise omitted as outside
 * that same scope.
 */
export interface BudgetAdvisorPromptInput {
  month: string
  categories: BudgetAdvisorCategoryInput[]
  totals: BudgetMonthTotals
  /** `null` when the Budget Health Score is itself undefined for this month
   * (zero budgeted categories) -- structurally unreachable here in practice,
   * since `advisor.ts` never calls this feature's generation path at all in
   * that case (Edge Case: "zero categories... the advisor card does not
   * render"), but typed as nullable rather than assumed-always-present so
   * this DTO stays honest about `getBudgetHealthScore`'s own return type. */
  budgetHealthScore: BudgetHealthScore | null
}

// ---------------------------------------------------------------------------
// AI structured-output schema (ai-features-design.md §4.3)
// ---------------------------------------------------------------------------

/** api-contracts.md's own stated ceiling for this feature's narrative field:
 * "a `~500`-character ceiling for a 1-4 sentence Budget Advisor
 * recommendation." Every narrative field must be explicitly bounded, never
 * unbounded (Security Architect Finding 1a) -- an over-length response is
 * itself an invalid-output failure under `generate-structured-output.ts`'s
 * existing retry-once-then-degrade path (§3), not something this schema
 * needs to handle specially. */
const RECOMMENDATION_TEXT_MAX_LENGTH = 500

const CitedFigureShape = z.object({
  label: z.string(),
  value: z.number(),
})

/**
 * The model's structured output: 1-3 recommendations (Feature 2 AC2), each a
 * bounded narrative string plus the `citedFigures` array
 * `lib/ai/verify-grounding.ts` checks against the caller's own
 * `groundingData` map (§4.3). No `z.union`/`z.record` anywhere, per
 * ai-features-design.md §1's Gemini structured-output constraint -- every
 * shape here is built only from `z.object`/`z.array`/`z.string`/`z.number`.
 */
export const BudgetAdvisorRecommendationsSchema = z.object({
  recommendations: z
    .array(
      z.object({
        text: z.string().max(RECOMMENDATION_TEXT_MAX_LENGTH),
        citedFigures: z.array(CitedFigureShape),
      }),
    )
    .min(1)
    .max(3),
})

export type BudgetAdvisorRecommendationsOutput = z.infer<
  typeof BudgetAdvisorRecommendationsSchema
>

// ---------------------------------------------------------------------------
// Client-safe return shape (api-contracts.md's Feature 2 section)
// ---------------------------------------------------------------------------

export interface BudgetAdvisorRecommendation {
  text: string
  citedFigures: CitedFigure[]
}

/** Return shape of `advisor.getBudgetAdvisorRecommendations`'s `"ok"` data --
 * matches api-contracts.md's `BudgetAdvisorRecommendations` shape exactly.
 * Also the shape persisted (as the `recommendations` array alone) into
 * `BudgetAdvisorCache.recommendations`'s opaque `Json?` column -- validated
 * back against `BudgetAdvisorRecommendationsSchema` on every read via
 * `advisor.ts`'s own cache-row parsing, so a historical shape drift can never
 * silently reach a caller as malformed data. */
export interface BudgetAdvisorRecommendations {
  recommendations: BudgetAdvisorRecommendation[]
  generatedAt: string
}

// ---------------------------------------------------------------------------
// Prompt-input + grounding-data builder
// ---------------------------------------------------------------------------

/**
 * Builds this call's `BudgetAdvisorPromptInput` DTO and its matching
 * `groundingData` map from already-fetched, already-filtered budgeted
 * `BudgetCategoryLine[]` -- the single place both are assembled, so
 * `advisor.ts`'s two call sites (implicit generate-on-first-view, explicit
 * refresh) can never build them differently.
 *
 * `percentUsed` is rounded to the nearest whole percent here (not left as
 * the page's own unrounded float) for the reason documented on
 * `BudgetAdvisorCategoryInput.percentUsed` above -- every other figure is
 * passed through exactly as computed by `service.ts`'s `buildCategoryLine`,
 * never re-derived.
 *
 * `categoryName` is expected to already be `redactText()`-sanitized by the
 * caller (`advisor.ts`) before it reaches here, mirroring
 * `categorization.ts`'s own "redact before building the DTO" call order.
 *
 * `groundingData` keys are index-prefixed (`category_${index}_...`) rather
 * than name-keyed, since two categories could in principle share a name (or
 * collide after `redactText`'s truncation) -- `verify-grounding.ts` and
 * `verify-narrative-safety.ts` both match by numeric *value*, never by key
 * (see those files' own doc comments), so the key scheme only needs to keep
 * every legitimate figure's own object-key slot from colliding with
 * another's, never to be human-readable or stable across calls.
 */
export function buildAdvisorPromptContext(
  month: string,
  redactedBudgetedCategories: (BudgetCategoryLine & {
    allocated: number
    remaining: number
    percentUsed: number
  })[],
  totals: BudgetMonthTotals,
  budgetHealthScore: BudgetHealthScore | null,
): {
  promptInput: BudgetAdvisorPromptInput
  groundingData: Record<string, number>
} {
  const categories: BudgetAdvisorCategoryInput[] = redactedBudgetedCategories.map(
    (line) => ({
      categoryName: line.categoryName,
      allocated: line.allocated,
      spent: line.spent,
      remaining: line.remaining,
      percentUsed: Math.round(line.percentUsed),
      isOverBudget: line.isOverBudget,
    }),
  )

  const groundingData: Record<string, number> = {
    totalAllocated: totals.totalAllocated,
    totalSpent: totals.totalSpent,
    totalRemaining: totals.totalRemaining,
  }
  categories.forEach((category, index) => {
    groundingData[`category_${index}_allocated`] = category.allocated
    groundingData[`category_${index}_spent`] = category.spent
    groundingData[`category_${index}_remaining`] = category.remaining
    groundingData[`category_${index}_percentUsed`] = category.percentUsed
  })
  if (budgetHealthScore) {
    groundingData.budgetHealthScore = budgetHealthScore.score
  }

  return {
    promptInput: { month, categories, totals, budgetHealthScore },
    groundingData,
  }
}
