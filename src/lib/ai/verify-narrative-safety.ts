import {
  UNTRUSTED_DATA_CLOSE_TAG,
  UNTRUSTED_DATA_OPEN_TAG,
} from "./prompts/build-prompt"

// [Finding 1, new file] The narrative-text safety check
// (docs/architecture/ai-features-design.md §2/§4.3), sitting alongside
// `verify-grounding.ts` in the same retry-once-then-degrade pipeline
// (`generate-structured-output.ts`, §3).
//
// Where `verify-grounding.ts` checks the structured `citedFigures` array
// against known-good data, this file checks the free-text narrative/insight
// string itself -- a dimension `verify-grounding.ts` does not cover (correct
// `citedFigures` alongside an unrelated, leaked, or fabricated-in-prose
// narrative would otherwise pass undetected). Rejects (triggering §3's
// retry) any narrative string that: contains HTML/script-like tags,
// contains markdown link syntax, echoes the untrusted-data delimiter
// tokens, or contains a number-like token that does not correspond, after
// normalization, to any value present in that call's `groundingData` map.
//
// Not exercised by Transaction Auto-Categorization (this feature has no
// narrative/insight-text field at all -- its output is a closed-set enum,
// §4.2) -- created now because every one of the next four AI features needs
// it as shared infrastructure, per this module's own boundary list (§2).
// This is a defense-in-depth floor, not a closed-set guarantee -- see §4.3's
// residual-risk note in the design doc.

const HTML_TAG_PATTERN = /<[^>]+>/
const MARKDOWN_LINK_PATTERN = /\[[^\]]*]\([^)]*\)/

// Matches a currency/percentage/plain number-like token in prose: an
// optional leading sign/currency symbol, digits with optional thousands
// separators, an optional decimal portion, and an optional trailing percent
// sign -- e.g. "$1,234.56", "-12.5%", "340".
const NUMBER_TOKEN_PATTERN = /-?\$?\d[\d,]*(?:\.\d+)?%?/g

/** Default tolerance for matching a normalized number token against a known
 * grounding value -- matches `verify-grounding.ts`'s own default so the two
 * checks apply an identical notion of "close enough to be the same figure". */
const DEFAULT_EPSILON = 0.01

/**
 * Returns `true` only if `narrative` contains none of: an HTML/script-like
 * tag, markdown link syntax, an echoed untrusted-data delimiter token, or a
 * number-like token that doesn't correspond (after normalizing currency
 * symbols/commas/percent signs) to any value in `groundingData`.
 */
export function verifyNarrativeSafety(
  narrative: string,
  groundingData: Record<string, number>,
  epsilon: number = DEFAULT_EPSILON,
): boolean {
  if (HTML_TAG_PATTERN.test(narrative)) {
    return false
  }
  if (MARKDOWN_LINK_PATTERN.test(narrative)) {
    return false
  }
  if (
    narrative.includes(UNTRUSTED_DATA_OPEN_TAG) ||
    narrative.includes(UNTRUSTED_DATA_CLOSE_TAG)
  ) {
    return false
  }

  const knownValues = Object.values(groundingData)
  const numberTokens = narrative.match(NUMBER_TOKEN_PATTERN) ?? []

  return numberTokens.every((token) => {
    const normalized = normalizeNumberToken(token)
    if (normalized === null) {
      return true
    }
    return knownValues.some((known) => Math.abs(known - normalized) <= epsilon)
  })
}

/** Strips `$`, `,`, and `%` from a matched number-like token and parses the
 * remainder as a float. Returns `null` for a token that (after stripping)
 * still isn't a finite number, e.g. a bare "-" matched in isolation. */
function normalizeNumberToken(token: string): number | null {
  const cleaned = token.replace(/[$,%]/g, "")
  const value = Number.parseFloat(cleaned)
  return Number.isFinite(value) ? value : null
}
