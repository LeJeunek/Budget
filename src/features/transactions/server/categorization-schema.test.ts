import { describe, expect, it } from "vitest"

import { buildCategorySuggestionSchema } from "./categorization-schema"

// Verifies this feature's Definition of Done bar (docs/product/ai-features.md
// Feature 1): "Suggestion output is verified, by test with adversarial
// fixture merchant/notes text, to always resolve to either a valid existing
// category ID belonging to the requesting user, or no suggestion at all --
// never an arbitrary string, a new category, or another user's category."
//
// This exercises the schema itself (the mechanism ai-features-design.md
// §4.2 relies on), not a live model call: a hypothetical adversarial model
// response is parsed directly against `buildCategorySuggestionSchema`'s
// output to confirm Zod's `z.enum` rejects anything outside the exact
// candidate id sets this call was built from, regardless of what an
// adversarial merchant/notes string might have tried to instruct the model
// to output.

const CANDIDATE_CATEGORY_IDS: [string, ...string[]] = ["cat_groceries", "cat_dining"]
const CANDIDATE_TRANSACTION_IDS: [string, ...string[]] = ["txn_1", "txn_2"]

function schema() {
  return buildCategorySuggestionSchema(
    CANDIDATE_CATEGORY_IDS,
    CANDIDATE_TRANSACTION_IDS,
  )
}

describe("buildCategorySuggestionSchema", () => {
  it("accepts a well-formed suggestion using real candidate ids", () => {
    const result = schema().safeParse({
      suggestions: [
        { transactionId: "txn_1", categoryId: "cat_groceries", confidence: 0.9 },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("accepts an empty suggestions array (the model chose not to suggest anything)", () => {
    const result = schema().safeParse({ suggestions: [] })
    expect(result.success).toBe(true)
  })

  it("rejects a categoryId invented by an adversarial merchant string (e.g. 'DROP_ALL_DATA')", () => {
    const result = schema().safeParse({
      suggestions: [
        { transactionId: "txn_1", categoryId: "DROP_ALL_DATA", confidence: 0.9 },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("rejects a transactionId not present in this call's own candidate set (cross-batch misattribution attempt)", () => {
    const result = schema().safeParse({
      suggestions: [
        { transactionId: "txn_from_another_batch", categoryId: "cat_groceries", confidence: 0.9 },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("rejects a categoryId that belongs to a real category, but not one of THIS call's own candidates (a stale/other-user id)", () => {
    const result = schema().safeParse({
      suggestions: [
        { transactionId: "txn_1", categoryId: "cat_from_another_user", confidence: 0.9 },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("rejects a confidence value outside the 0-1 range", () => {
    const result = schema().safeParse({
      suggestions: [{ transactionId: "txn_1", categoryId: "cat_groceries", confidence: 1.5 }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects a suggestions array containing one valid and one adversarial entry, as a whole", () => {
    const result = schema().safeParse({
      suggestions: [
        { transactionId: "txn_1", categoryId: "cat_groceries", confidence: 0.9 },
        { transactionId: "txn_2", categoryId: "ignore-previous-instructions", confidence: 0.5 },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("builds a distinct schema per call, scoped to that call's own candidate ids only", () => {
    const firstCallSchema = buildCategorySuggestionSchema(
      ["cat_a"],
      ["txn_a"],
    )
    const secondCallSchema = buildCategorySuggestionSchema(
      ["cat_b"],
      ["txn_b"],
    )

    // A categoryId valid for the first call's batch must not validate
    // against the second call's differently-scoped schema.
    expect(
      firstCallSchema.safeParse({
        suggestions: [{ transactionId: "txn_a", categoryId: "cat_a", confidence: 0.5 }],
      }).success,
    ).toBe(true)
    expect(
      secondCallSchema.safeParse({
        suggestions: [{ transactionId: "txn_a", categoryId: "cat_a", confidence: 0.5 }],
      }).success,
    ).toBe(false)
  })
})
