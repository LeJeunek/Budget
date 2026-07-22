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
 * `gemini-flash-lite-latest` — Gemini's cheapest/fastest current tier, as a
 * rolling alias rather than a dated version pin.
 *
 * Live verification against a real API key (2026-07-22) found that every
 * dated version this design originally specified or considered
 * (`gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.0-flash-lite`,
 * `gemini-3.1-flash-lite`) returns a hard "no longer available to new
 * users" or "caller does not have permission" error on a freshly-created
 * free-tier API key, even though Google's own `models.list` endpoint still
 * lists them as existing — dated model names get sunset for new keys
 * faster than this document can be kept in sync. Google's own `-latest`
 * alias names are exempt from that churn by design (they always resolve to
 * whatever Google currently recommends), so this codebase deliberately
 * uses the alias, not a pinned version — the "swappable provider" property
 * this file already provides for a provider change applies equally to a
 * same-provider model-name change.
 *
 * Used for Transaction Auto-Categorization only (ai-features-design.md §1):
 * a closed-set classification task (pick one of the user's existing category
 * ids) running at this phase's highest call volume (every batch of
 * newly-Uncategorized transactions), which needs no deep reasoning and
 * benefits most from the lite tier's more generous free-tier request quota
 * (§6.1's Gemini free-tier quota fit).
 *
 * Typed as the AI SDK's own `LanguageModel` interface, never the provider's
 * own return type — so nothing outside this file ever depends on which
 * provider package produced it.
 */
export const fastModel: LanguageModel = google("gemini-flash-lite-latest")

/**
 * `gemini-flash-latest` — used for the four narrative-synthesis features
 * (Budget Advisor, Monthly Summaries, Spending Insights, Health Score
 * narrative — none of which are built by this dispatch).
 *
 * This design originally called for a "pro"-tier reasoning model here
 * (`gemini-2.5-pro`). Live verification (2026-07-22) found every dated
 * "pro" model name, and even the `gemini-pro-latest`/`gemini-3.1-pro-preview`
 * aliases, fail against a fresh free-tier key with "Gemini API has not been
 * used in project ... or it is disabled" — a GCP-project-level enablement
 * step beyond what this project's free-tier setup does today, not a
 * per-request error. `gemini-flash-latest` succeeds immediately with no
 * extra Google Cloud Console setup and produced coherent, well-formed
 * narrative output in direct testing (a full sentence narrating a savings
 * change, matching this feature class's actual quality bar) — so it is
 * used for all four narrative features rather than asking the user to
 * enable additional GCP APIs/billing just to reach a "pro" tier this
 * design doesn't strictly require. If a future feature's output quality
 * genuinely needs the stronger tier, revisit this exact call site — do not
 * silently degrade back to guessing a model name without re-verifying
 * against a live key first, per this same comment's own reasoning.
 */
export const reasoningModel: LanguageModel = google("gemini-flash-latest")
