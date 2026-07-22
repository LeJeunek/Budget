import { z } from "zod"

// The Zod structured-output schema for Transaction Auto-Categorization
// (docs/architecture/ai-features-design.md §4.2). Per
// docs/architecture/naming-standards.md's Phase 4a conventions, this
// `-schema.ts` suffix is reserved exclusively for the shape an AI call must
// return -- ordinary Server-Action *input* validation for this feature
// still lives in `./validation.ts`, never here.

/**
 * The narrow, explicit prompt-input DTO for this feature
 * (ai-features-design.md §4.1, Security Architect Finding 2). This is the
 * ONLY shape `categorization.ts` is ever allowed to pass into
 * `lib/ai/prompts/build-prompt.ts` -- it is constructed explicitly,
 * field-by-field, from an already-fetched Transaction/Category record; the
 * Prisma entity itself (or any `include`-relation object) is never spread or
 * passed in directly. `merchant`/`notes` are expected to already be
 * `redactText()`-sanitized by the caller before this DTO is built.
 */
export interface CategorizationPromptInput {
  transactionId: string
  merchant: string
  notes: string
  candidateCategories: { id: string; name: string }[]
}

/**
 * Builds the per-request Zod schema the model's structured output must
 * match. Both `transactionId` and `categoryId` are built as `z.enum`s over
 * the EXACT candidate ids sent in this specific call -- the schema itself
 * is the closed set, so an out-of-set value (whether from adversarial
 * merchant/notes text or an ordinary model mistake) simply cannot parse as
 * valid data, independent of what the model was told to do
 * (ai-features-design.md §4.2).
 *
 * [Finding 4] `transactionId` was originally left as a bare `z.string()`
 * while `categoryId` was already closed-set -- an asymmetry that, in a
 * batch call covering several of the same user's transactions, left room
 * for adversarial text to misattribute a (still-valid) `categoryId` to the
 * wrong `transactionId` within the same batch. Both are now `z.enum`s,
 * closed over this call's own candidate id sets only, applying the exact
 * same "schema is the closed set" technique symmetrically to both fields.
 *
 * Building this dynamically per request (rather than a single static
 * exported constant) is this feature's one deliberate exception to
 * naming-standards.md's usual "PascalCase + Schema" static-constant
 * convention -- hence the `build<Concept>Schema` function name, per that
 * file's own note on why this builder's dynamic-per-call nature must be
 * visible from its name alone.
 */
export function buildCategorySuggestionSchema(
  candidateCategoryIds: [string, ...string[]],
  candidateTransactionIds: [string, ...string[]],
) {
  return z.object({
    suggestions: z.array(
      z.object({
        transactionId: z.enum(candidateTransactionIds),
        categoryId: z.enum(candidateCategoryIds),
        confidence: z.number().min(0).max(1),
      }),
    ),
  })
}

export type CategorySuggestionBatchOutput = z.infer<
  ReturnType<typeof buildCategorySuggestionSchema>
>

export type CategorySuggestionOutputItem =
  CategorySuggestionBatchOutput["suggestions"][number]
