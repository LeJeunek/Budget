import { createGoogleGenerativeAI } from "@ai-sdk/google"
import type { LanguageModel } from "ai"

// THE ONLY file in this codebase that imports `@ai-sdk/google` or reads
// `GOOGLE_GENERATIVE_AI_API_KEY` (docs/architecture/ai-features-design.md §2).
// Every feature reaches the model exclusively through `fastModel`/
// `reasoningModel` below (or, indirectly, through
// `generate-structured-output.ts`, which itself only imports these two
// exports — never the provider package directly). This is the concrete
// implementation of the roadmap's "swappable provider" constraint: a future
// provider change is a change to this one file, never a change to any
// feature — exactly the property that made this design's own
// Anthropic-to-Gemini swap a one-file change before any production code
// existed (ai-features-design.md's provider-swap addendum, §1).
//
// `GOOGLE_GENERATIVE_AI_API_KEY` is the exact env var name the `@ai-sdk/google`
// package itself reads by default — see `.env.example`'s own comment. Read
// explicitly here (rather than relying on the SDK's own implicit fallback)
// so this file's doc comment ("reads GOOGLE_GENERATIVE_AI_API_KEY") stays
// literally true and greppable.
const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
})

/**
 * `gemini-2.5-flash-lite` — Gemini's cheapest/fastest current stable tier.
 *
 * Used for Transaction Auto-Categorization only (ai-features-design.md §1):
 * a closed-set classification task (pick one of the user's existing category
 * ids) running at this phase's highest call volume (every batch of
 * newly-Uncategorized transactions), which needs no deep reasoning and
 * benefits most from Flash-Lite's more generous free-tier request quota
 * (§6.1's Gemini free-tier quota fit).
 *
 * Typed as the AI SDK's own `LanguageModel` interface, never the provider's
 * own return type — so nothing outside this file ever depends on which
 * provider package produced it.
 */
export const fastModel: LanguageModel = google("gemini-2.5-flash-lite")

/**
 * `gemini-2.5-pro` — Gemini's current flagship reasoning-tier model.
 *
 * Used for the four narrative-synthesis features (Budget Advisor, Monthly
 * Summaries, Spending Insights, Health Score narrative — none of which are
 * built by this dispatch) — output quality there directly determines the
 * feature's entire value, and call volume is far lower than
 * categorization's, which affords a stronger/costlier tier
 * (ai-features-design.md §1). Exported now, alongside `fastModel`, so every
 * future AI feature shares this exact same client boundary rather than each
 * adding its own provider wiring.
 */
export const reasoningModel: LanguageModel = google("gemini-2.5-pro")
