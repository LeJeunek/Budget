import { z } from "zod"

import type { CitedFigure } from "@/lib/ai/types"

// The Zod structured-output schema, prompt-input DTO, and client-safe return
// shape for Automatic Monthly Summaries (docs/product/ai-features.md Feature
// 3, docs/architecture/ai-features-design.md §4.1/§4.3). Per
// docs/architecture/naming-standards.md's Phase 4a convention, this
// `-schema.ts` suffix is reserved exclusively for the shape an AI call must
// return -- ordinary Server-Action *input* validation (the `{ month }` input
// to the `regenerateMonthlySummary` Server Action) lives in `./validation.ts`,
// never here. Mirrors `features/budgeting/server/advisor-schema.ts`'s exact
// structure -- this feature's closest reference implementation.

// ---------------------------------------------------------------------------
// Prompt-input DTO (ai-features-design.md §4.1, Security Architect Finding 2)
// ---------------------------------------------------------------------------

/**
 * One top-spending-category callout, sourced from Analytics' existing
 * Expense Distribution metric (`features/analytics/server/expense-breakdown.ts`'s
 * `getExpenseDistribution`) for this exact month -- never recomputed here.
 * `categoryName` is user-authored/untrusted text, expected to already be
 * `redactText()`-sanitized by the caller before this DTO is built (same
 * discipline as `BudgetAdvisorCategoryInput.categoryName`).
 */
export interface MonthlySummaryCategoryInput {
  categoryName: string
  amount: number
}

/**
 * The single largest individual purchase of the month, sourced from
 * Analytics' existing Largest Purchases metric
 * (`getLargestPurchases`) -- optional per Feature 3's "What This
 * Summarizes" section ("optionally, the single largest individual
 * purchase"). `merchant`/`categoryName` are untrusted text, expected to
 * already be `redactText()`-sanitized by the caller.
 */
export interface MonthlySummaryLargestPurchaseInput {
  merchant: string
  categoryName: string
  amount: number
}

/**
 * The narrow, explicit prompt-input DTO for this feature -- the ONLY shape
 * `monthly-summary.ts` is ever allowed to pass into
 * `lib/ai/prompts/build-prompt.ts`. Built field-by-field from already-fetched
 * Dashboard/Analytics/Net-Worth-Snapshot data (via
 * `buildMonthlySummaryPromptContext` below); no Prisma entity is ever spread
 * or passed in directly.
 *
 * `isPartialMonth` and `hasActivity` are both deterministic facts computed by
 * `monthly-summary.ts`'s own code (never left to the model to infer) --
 * included here only so the model's narrative can *mention* them in prose;
 * neither is ever part of the model's own structured output (see
 * `MonthlySummaryNarrativeSchema` below, which has no `isPartialMonth`/
 * `hasActivity` field of its own).
 */
export interface MonthlySummaryPromptInput {
  month: string
  isPartialMonth: boolean
  hasActivity: boolean
  income: number
  expenses: number
  cashFlow: number
  /** `null` when income is $0 for the month (Dashboard's own
   * `computeSavingsRate` sentinel, carried through unmodified -- see
   * `dashboard/server/service.ts`). */
  savingsRate: number | null
  /** `null` when there isn't a Net Worth Snapshot on both sides of this
   * month's boundary yet (e.g. a user's first tracked month, or a gap in
   * snapshot history) -- omitted from the narrative/grounding data entirely
   * in that case, per Cross-Cutting Requirement #2's "no fabricated
   * figures": this feature never estimates a net worth change it cannot
   * derive from two real, already-captured snapshots. */
  netWorthChange: number | null
  /** Top 1-2 spending categories by amount this month (Feature 3's "top 1-2
   * spending categories" scope), sourced from Analytics' Expense
   * Distribution. Empty when the month has no expense activity at all. */
  topCategories: MonthlySummaryCategoryInput[]
  /** `null` when the month has no expense transactions at all. */
  largestPurchase: MonthlySummaryLargestPurchaseInput | null
}

// ---------------------------------------------------------------------------
// AI structured-output schema (ai-features-design.md §4.3)
// ---------------------------------------------------------------------------

/** api-contracts.md's own stated ceiling for this feature's narrative field:
 * "a `~800`-character ceiling for a Monthly Summary narrative." Every
 * narrative field must be explicitly bounded, never unbounded (Security
 * Architect Finding 1a) -- an over-length response is itself an
 * invalid-output failure under `generate-structured-output.ts`'s existing
 * retry-once-then-degrade path (§3), not something this schema needs to
 * handle specially. */
const NARRATIVE_MAX_LENGTH = 800

const CitedFigureShape = z.object({
  label: z.string(),
  value: z.number(),
})

/**
 * The model's structured output: one bounded narrative paragraph plus the
 * `citedFigures` array `lib/ai/verify-grounding.ts` checks against the
 * caller's own `groundingData` map (§4.3). Deliberately does NOT include
 * `month`/`isPartialMonth` -- both are deterministic facts `monthly-summary.ts`
 * already knows before ever calling the model (see
 * `MonthlySummaryPromptInput`'s own doc comment above) and are attached to
 * the persisted/returned shape by that caller, never re-derived from (or
 * trusted from) the model's own output. No `z.union`/`z.record` anywhere,
 * per ai-features-design.md §1's Gemini structured-output constraint --
 * every shape here is built only from `z.object`/`z.array`/`z.string`/
 * `z.number`.
 */
export const MonthlySummaryNarrativeSchema = z.object({
  narrative: z.string().max(NARRATIVE_MAX_LENGTH),
  citedFigures: z.array(CitedFigureShape),
})

export type MonthlySummaryNarrativeOutput = z.infer<
  typeof MonthlySummaryNarrativeSchema
>

// ---------------------------------------------------------------------------
// Client-safe return shape (api-contracts.md's Feature 3 section)
// ---------------------------------------------------------------------------

/**
 * **Naming judgment call, flagged for independent verification:**
 * api-contracts.md's Feature 3 section names this feature's client-safe
 * return shape `MonthlySummary` -- but `features/dashboard/types.ts` already
 * exports an unrelated `MonthlySummary` interface (the plain
 * income/expenses/cashFlow/savingsRate aggregate returned by
 * `service.getMonthlySummary`), and `prisma/schema.prisma`'s own persisted
 * model is ALSO named `MonthlySummary` (the Prisma Client-generated type).
 * Reusing the same TS identifier for a third, differently-shaped concept in
 * this same feature module would either collide at the type-checker level or
 * require every call site to alias one of the three imports -- neither is
 * acceptable per this codebase's "avoid duplication/ambiguity" standard, and
 * silently shadowing the Dashboard's already-shipped `MonthlySummary` type is
 * worse than picking a distinct name. This is named `MonthlyRecap` instead,
 * directly reusing the product spec's own "Your July Recap" language
 * (`ai-features.md` Feature 3's "When It's Generated" section) so the name
 * stays self-explanatory rather than arbitrary. The wire shape itself is
 * unchanged from api-contracts.md's documented fields
 * (`month`/`narrative`/`citedFigures`/`isPartialMonth`) -- only the TS
 * identifier differs from the doc's illustrative name.
 *
 * `narrative`/`citedFigures` are both nullable here, unlike
 * api-contracts.md's simplified illustrative shape block (which shows
 * `narrative: string`, no `| null`) -- this is a second, deliberate judgment
 * call: `prisma/schema.prisma`'s own `MonthlySummary.narrative` column
 * comment states "Null = generation has not yet succeeded for this month
 * ... this is the exact signal the 'Summary not available for [Month]'
 * degraded state reads," and api-contracts.md's own "Get most-recent
 * summary" row confirms "a completed month whose generation failed still
 * returns its persisted row (with enough state for the UI to render
 * 'Summary not available for [Month]')." A non-nullable `narrative: string`
 * cannot represent that reachable, spec-required state, so nullability is
 * preserved here for correctness over the doc's simplified block. Both
 * judgment calls are called out again in `monthly-summary.ts`'s own top-of-file
 * comment.
 */
export interface MonthlyRecap {
  /** `"yyyy-MM"`, always a fully-closed month (Feature 3 AC3). */
  month: string
  narrative: string | null
  citedFigures: CitedFigure[] | null
  isPartialMonth: boolean
}

// ---------------------------------------------------------------------------
// Prompt-input + grounding-data builder
// ---------------------------------------------------------------------------

/** `groundingData` keys are index-prefixed for `topCategories`
 * (`category_${index}_amount`) rather than name-keyed, mirroring
 * `advisor-schema.ts`'s `buildAdvisorPromptContext` reasoning exactly: two
 * categories could share a name (or collide after `redactText`'s
 * truncation), and both `verify-grounding.ts`/`verify-narrative-safety.ts`
 * match by numeric *value*, never by key, so the key scheme only needs to
 * avoid same-call collisions, never to be human-readable or stable across
 * calls. */
export function buildMonthlySummaryPromptContext(
  promptInput: MonthlySummaryPromptInput,
): {
  promptInput: MonthlySummaryPromptInput
  groundingData: Record<string, number>
} {
  const groundingData: Record<string, number> = {
    income: promptInput.income,
    expenses: promptInput.expenses,
    cashFlow: promptInput.cashFlow,
  }

  if (promptInput.savingsRate !== null) {
    groundingData.savingsRate = promptInput.savingsRate
  }
  if (promptInput.netWorthChange !== null) {
    groundingData.netWorthChange = promptInput.netWorthChange
  }
  promptInput.topCategories.forEach((category, index) => {
    groundingData[`category_${index}_amount`] = category.amount
  })
  if (promptInput.largestPurchase !== null) {
    groundingData.largestPurchaseAmount = promptInput.largestPurchase.amount
  }

  return { promptInput, groundingData }
}
