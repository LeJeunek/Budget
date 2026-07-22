import { generateObject } from "ai"
import type { LanguageModel } from "ai"
import type { z } from "zod"

import type { AiFeatureResult, CitedFigure } from "./types"
import { verifyGrounding } from "./verify-grounding"
import { verifyNarrativeSafety } from "./verify-narrative-safety"

// THE reusable "prompt -> validated object" call
// (docs/architecture/ai-features-design.md §3). Every one of the five AI
// features calls this function, and only this function, to reach the model
// -- no feature calls the AI SDK's `generateObject` directly.
//
// Behavior (§3, verbatim):
//   1. Calls `generateObject` with a bounded `AbortSignal.timeout(timeoutMs)`.
//   2. If the call succeeds, the result parses against `schema`, and (when
//      supplied) the grounding/narrative-safety checks pass: return
//      `{ status: "ok", data }`.
//   3. If the call throws, or either check fails: retry EXACTLY once, with a
//      stricter system-prompt addendum appended. A single, bounded retry --
//      never a loop.
//   4. If the retry also fails for any reason: return `{ status: "unavailable" }`.
//      This function never throws past this point -- every caller gets a
//      typed result, never an exception to remember to catch.
//
// Why a Result type, not a thrown error: an AI failure must never propagate
// as an unhandled exception into a Server Component render or a Server
// Action -- Cross-Cutting Product Requirement #1 ("the rest of the page must
// always keep working"). Returning `AiFeatureResult<T>` makes "the caller
// must handle the degraded case" a compile-time requirement rather than
// relying on every implementer remembering a `try/catch`.

const RETRY_SYSTEM_ADDENDUM =
  "\n\nYour previous response did not match the required format. Return ONLY the requested structured output -- no commentary, no additional text, and reference only the figures provided to you."

/** Internal-only failure taxonomy, per naming-standards.md's `AiFailureReason`
 * note: used exclusively for this file's own observability logging, never
 * surfaced past this module's boundary -- every caller only ever sees
 * `AiFeatureResult`'s `"ok" | "unavailable"`. */
type AiFailureReason =
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "VALIDATION_FAILED"
  | "GROUNDING_FAILED"
  | "NARRATIVE_SAFETY_FAILED"

export interface GenerateStructuredOutputParams<Schema extends z.ZodTypeAny> {
  /** `fastModel` or `reasoningModel` from `lib/ai/client.ts` -- never a raw
   * provider-specific model reference. */
  model: LanguageModel
  /** Fixed, developer-authored system instructions -- zero user data, ever. */
  system: string
  /** Built via `prompts/build-prompt.ts` -- includes the delimited
   * untrusted-data block. */
  prompt: string
  /** The feature's own Zod schema, which may be built dynamically per
   * request (e.g. categorization's per-call `z.enum`s). Per
   * ai-features-design.md §1's Gemini structured-output constraint, this
   * must never use `z.union` or `z.record` anywhere. */
  schema: Schema
  /** Every figure legitimately available to this specific call, for the
   * optional grounding/narrative-safety checks below. Omit entirely for a
   * closed-set schema (e.g. categorization) that has no narrative text to
   * ground. */
  groundingData?: Record<string, number>
  /** Pulls the `citedFigures` array out of this schema's particular parsed
   * shape -- required together with `groundingData` to run
   * `verify-grounding.ts`. Every one of the four narrative features' schemas
   * places `citedFigures` differently (top-level vs. nested per-item), so
   * this function cannot assume a single fixed field path across all five
   * features. */
  extractCitedFigures?: (data: z.infer<Schema>) => CitedFigure[]
  /** Pulls every narrative/insight-text string out of this schema's parsed
   * shape, for `verify-narrative-safety.ts` -- see `extractCitedFigures`'s
   * doc comment for why this is a caller-supplied extractor rather than an
   * assumed field name. */
  extractNarrativeStrings?: (data: z.infer<Schema>) => string[]
  /** Bounded per call-site: shorter for interactive user-triggered actions,
   * longer for batch/cron paths where no user is waiting on the response
   * (ai-features-design.md §6). */
  timeoutMs: number
  /** Feature name, for the internal observability log line only -- never
   * part of the returned `AiFeatureResult`. */
  featureName: string
}

interface AttemptSuccess<T> {
  ok: true
  data: T
}

interface AttemptFailure {
  ok: false
  reason: AiFailureReason
  error?: unknown
}

async function attemptOnce<Schema extends z.ZodTypeAny>(
  params: GenerateStructuredOutputParams<Schema>,
  system: string,
): Promise<AttemptSuccess<z.infer<Schema>> | AttemptFailure> {
  let generated: z.infer<Schema>

  try {
    const result = await generateObject({
      model: params.model,
      system,
      prompt: params.prompt,
      schema: params.schema,
      abortSignal: AbortSignal.timeout(params.timeoutMs),
      // This module owns its own single, stricter-prompt retry (§3) -- the
      // AI SDK's own built-in retry (default: 2) is disabled so that retry
      // is never compounded with a second, differently-behaved retry layer,
      // keeping "exactly one retry, ever" true regardless of the AI SDK's
      // own defaults changing in a future version bump.
      maxRetries: 0,
    })
    generated = result.object as z.infer<Schema>
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError"
    return {
      ok: false,
      reason: isTimeout ? "TIMEOUT" : "VALIDATION_FAILED",
      error,
    }
  }

  if (params.groundingData && params.extractCitedFigures) {
    const citedFigures = params.extractCitedFigures(generated)
    if (!verifyGrounding(citedFigures, params.groundingData)) {
      return { ok: false, reason: "GROUNDING_FAILED" }
    }
  }

  if (params.groundingData && params.extractNarrativeStrings) {
    const narratives = params.extractNarrativeStrings(generated)
    const allSafe = narratives.every((text) =>
      verifyNarrativeSafety(text, params.groundingData as Record<string, number>),
    )
    if (!allSafe) {
      return { ok: false, reason: "NARRATIVE_SAFETY_FAILED" }
    }
  }

  return { ok: true, data: generated }
}

/**
 * The one, reusable prompt -> validated-object call every AI feature uses.
 * See this file's top-of-file doc comment for the full retry/degrade
 * contract. Never throws.
 */
export async function generateStructuredOutput<Schema extends z.ZodTypeAny>(
  params: GenerateStructuredOutputParams<Schema>,
): Promise<AiFeatureResult<z.infer<Schema>>> {
  const startedAt = Date.now()

  const first = await attemptOnce(params, params.system)
  if (first.ok) {
    return { status: "ok", data: first.data }
  }
  logFailure(params.featureName, first.reason, Date.now() - startedAt, first.error)

  const second = await attemptOnce(params, `${params.system}${RETRY_SYSTEM_ADDENDUM}`)
  if (second.ok) {
    return { status: "ok", data: second.data }
  }
  logFailure(params.featureName, second.reason, Date.now() - startedAt, second.error)

  return { status: "unavailable" }
}

/** Logs the specific failure reason, feature name, and latency for
 * observability (ai-features-design.md §5's "bounded and observable"
 * requirement) -- this detail never crosses `lib/ai/`'s own boundary; every
 * caller only ever sees `{ status: "unavailable" }`. */
function logFailure(
  featureName: string,
  reason: AiFailureReason,
  latencyMs: number,
  error?: unknown,
): void {
  console.error(
    `[lib/ai] ${featureName} generation failed: ${reason} (${latencyMs}ms)`,
    error,
  )
}
