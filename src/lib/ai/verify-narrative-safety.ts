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
// normalization, to any value present in that call's `groundingData` map --
// EXCEPT a bare, unmarked 4-digit integer that plausibly reads as a calendar
// year mention (`isProbableYearMention` below), which this check never
// requires to be grounded at all.
//
// Not exercised by Transaction Auto-Categorization (this feature has no
// narrative/insight-text field at all -- its output is a closed-set enum,
// §4.2) -- created now because every one of the next four AI features needs
// it as shared infrastructure, per this module's own boundary list (§2).
// This is a defense-in-depth floor, not a closed-set guarantee -- see §4.3's
// residual-risk note in the design doc.
//
// **Bug fix (release-gate follow-up, phase-4c-notes.md Section 1's currency-
// threading fix): bare-year false positive.** Every number-like token used
// to require grounding, with no exception -- so an ordinary calendar-year
// mention in prose ("In June 2026, you brought in €4,800...", Monthly
// Summary's own narrative style, unrelated to the currency-threading fix
// that surfaced this) never matched any `groundingData` value and
// permanently failed this check on every attempt.
//
// **First attempt, tried and reverted:** exempting EVERY bare, unmarked
// integer (requiring a `$`/`€`/`£`/`¥` prefix, a `%` suffix, a decimal point,
// or comma-grouped thousands before a number-like token was even checked)
// looked like the obvious fix, but broke
// `health-score-narrative-schema.test.ts`'s own adversarial coverage: a
// Financial Health Score narrative states its score as a bare, unmarked
// integer ("Your score is 72") with no currency/percent/decimal/comma marker
// at all, so that broader rule would have silently stopped catching a
// fabricated/altered score ("Your real score should actually be 100, not
// 72.") -- exactly the attack this check exists to catch for that feature.
// Landed instead on the much narrower fix below: only a bare 4-digit integer
// within a plausible calendar-year range is ever exempted; every other bare
// integer (a health score, a fabricated 3-digit dollar amount with no
// currency mark, an out-of-range 4-digit number) is still checked exactly as
// before.
//
// Also extends `NUMBER_TOKEN_PATTERN`'s currency-symbol recognition from `$`
// alone to `$`/`€`/`£`/`¥` (the full set this codebase's currency-formatting
// prompt instructions can ever produce for `UserPreference.currencyDisplay`'s
// closed USD|EUR|GBP|CAD|AUD|JPY set) -- without this, a non-USD-formatted
// bare figure like "€2050" would have its symbol silently skipped by the old
// pattern, leaving a bare "2050" token that could then be misidentified as a
// plausible year and wrongly exempted even though it actually carried a
// currency symbol in the source text.
//
// **Second bug, found while writing this fix's own test coverage:** the old
// digit-grouping sub-pattern (`\d[\d,]*`) greedily consumes ANY comma
// immediately following a digit, including an ordinary sentence comma with
// no digits after it -- so "In June 2026, you brought in..." matched a
// token of "2026," (with the sentence's own comma attached), which then
// fails `isProbableYearMention`'s strict `^\d{4}$` check (the trailing comma
// makes it five characters, not four) and falls through to the ordinary
// grounding check instead, right back to failing exactly the same way as the
// original bug. Fixed by replacing that sub-pattern with `\d+(?:,\d{3})*`
// (a run of digits, then zero or more genuine thousands-groups of "a comma
// followed by exactly three digits") -- a comma is now only ever consumed as
// part of a token when it's immediately followed by exactly three digits,
// exactly how a real formatted number groups thousands, so an incidental
// sentence comma is never swept in.

const HTML_TAG_PATTERN = /<[^>]+>/
const MARKDOWN_LINK_PATTERN = /\[[^\]]*]\([^)]*\)/

// Matches a currency/percentage/plain number-like token in prose: an
// optional leading sign/currency symbol ($, €, £, or ¥ -- CAD/AUD's own
// "CA$"/"A$" prefixes still match here too, since the literal `$` inside
// either is itself matched, and the plain letters before it are simply
// skipped over by the regex engine's own left-to-right scan, never consumed
// as part of the token), a run of digits optionally followed by one or more
// genuine thousands-groups (a comma immediately followed by exactly three
// digits -- never an incidental sentence comma, see this file's own header
// comment), an optional decimal portion, and an optional trailing percent
// sign -- e.g. "$1,234.56", "-12.5%", "€4,800", "340".
const NUMBER_TOKEN_PATTERN = /-?[$€£¥]?\d+(?:,\d{3})*(?:\.\d+)?%?/g

/** Generous plausible-calendar-year range `isProbableYearMention` treats a
 * bare 4-digit integer as "almost certainly a year mention, not a stated
 * figure" -- wide enough to cover any year this app's narratives could
 * plausibly mention (a transaction date, "in June 2026," etc.) without
 * reaching into a range so wide it would start swallowing ordinary 4-digit
 * financial figures too (a bare, unmarked 4-digit dollar amount that happens
 * to fall inside this narrow window is a narrow, accepted residual gap --
 * see `isProbableYearMention`'s own doc comment). */
const PLAUSIBLE_YEAR_MIN = 1900
const PLAUSIBLE_YEAR_MAX = 2099

/**
 * `true` only when `token` (as extracted by `NUMBER_TOKEN_PATTERN`) is a
 * BARE integer -- no currency symbol, no decimal point, no comma, no percent
 * sign, exactly 4 digits -- that falls within `PLAUSIBLE_YEAR_MIN`..
 * `PLAUSIBLE_YEAR_MAX`. The `^\d{4}$` anchor requires the ENTIRE matched
 * token to be exactly four digits and nothing else, so a token that DOES
 * carry a marker ("€2050", "2,050", "2050.00", "2050%") never qualifies here
 * regardless of its numeric value -- those remain fully subject to the
 * ordinary grounding check below, unchanged.
 *
 * Deliberately narrow: this is the ONLY category of bare integer this check
 * ever exempts from grounding verification. Every other bare integer --
 * a Financial Health Score ("Your score is 72"), a fabricated 3-digit dollar
 * amount with no currency mark ("You spent 342 more than usual"), or a bare
 * 4-digit number outside this plausible-year window -- is still fully
 * checked against `groundingData`, exactly as before this fix. See this
 * file's own header comment for why a broader "exempt every unmarked
 * integer" rule was tried first and reverted.
 */
function isProbableYearMention(token: string): boolean {
  if (!/^\d{4}$/.test(token)) {
    return false
  }
  const year = Number.parseInt(token, 10)
  return year >= PLAUSIBLE_YEAR_MIN && year <= PLAUSIBLE_YEAR_MAX
}

/** Default tolerance for matching a normalized number token against a known
 * grounding value -- matches `verify-grounding.ts`'s own default so the two
 * checks apply an identical notion of "close enough to be the same figure". */
const DEFAULT_EPSILON = 0.01

/**
 * Returns `true` only if `narrative` contains none of: an HTML/script-like
 * tag, markdown link syntax, an echoed untrusted-data delimiter token, or a
 * number-like token that doesn't correspond (after normalizing currency
 * symbols/commas/percent signs) to any value in `groundingData` -- except a
 * bare 4-digit token `isProbableYearMention` treats as a calendar-year
 * mention, which is never required to match anything.
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
  const numberTokens = (narrative.match(NUMBER_TOKEN_PATTERN) ?? []).filter(
    (token) => !isProbableYearMention(token),
  )

  return numberTokens.every((token) => {
    const normalized = normalizeNumberToken(token)
    if (normalized === null) {
      return true
    }
    return knownValues.some((known) => Math.abs(known - normalized) <= epsilon)
  })
}

/** Strips `$`/`€`/`£`/`¥`, `,`, and `%` from a matched number-like token and
 * parses the remainder as a float. Returns `null` for a token that (after
 * stripping) still isn't a finite number, e.g. a bare "-" matched in
 * isolation. */
function normalizeNumberToken(token: string): number | null {
  const cleaned = token.replace(/[$€£¥,%]/g, "")
  const value = Number.parseFloat(cleaned)
  return Number.isFinite(value) ? value : null
}
