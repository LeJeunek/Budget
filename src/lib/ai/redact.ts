// Data-minimization helper (docs/architecture/ai-features-design.md §2).
//
// Truncates/strips a single untrusted string (a merchant name, a transaction
// note, a user-authored category name) to a bounded length and strips
// non-printable control characters before it is ever interpolated into a
// prompt. Bounds both prompt token cost and the "surface area" available to
// an injected-instruction attempt (risk-register.md #2) -- every
// feature-specific prompt builder calls this rather than re-implementing its
// own truncation/stripping logic.
//
// [Finding 2] `redact.ts` only sanitizes the strings it is handed -- it does
// NOT, and cannot, constrain *which* fields are passed to it in the first
// place. That structural constraint is `prompts/build-prompt.ts`'s DTO
// typing (see that file's own doc comment), not this file's job.

/** Conservative default ceiling for a single field (a merchant name or a
 * notes field) -- generous enough to never truncate a realistic value in
 * normal use (`transactions.md`'s own `merchant`/`notes` column limits are
 * 200/1000 characters respectively), while still bounding worst-case prompt
 * token cost per row in a batch call. */
const DEFAULT_MAX_LENGTH = 500

// Built from character codes rather than a literal regex containing raw
// control-character bytes in the source file itself (which would make this
// file's own diff/review unreadable, and risks silent corruption by tooling
// that isn't control-character-safe). Covers the C0 range (decimal 0-31 --
// includes newline/tab/carriage-return) and DEL plus the C1 range (decimal
// 127-159). Stripping newlines specifically (not just null bytes) matters
// here: a merchant/notes string containing embedded line breaks could
// otherwise be used to visually fabricate a fake delimiter/instruction line
// once interpolated into the prompt's untrusted-data block -- collapsing
// every control character to nothing keeps the sanitized value a single,
// inert line of display text.
const C0_RANGE_START = 0
const C0_RANGE_END = 0x1f
const C1_RANGE_START = 0x7f
const C1_RANGE_END = 0x9f

const CONTROL_CHARACTER_PATTERN = new RegExp(
  "[" +
    String.fromCharCode(C0_RANGE_START) +
    "-" +
    String.fromCharCode(C0_RANGE_END) +
    String.fromCharCode(C1_RANGE_START) +
    "-" +
    String.fromCharCode(C1_RANGE_END) +
    "]",
  "g",
)

/**
 * Sanitizes one untrusted string before it is placed into a prompt: strips
 * every control character, then truncates to `maxLength` (default 500).
 * Truncation happens after stripping so a long run of control characters can
 * never be used to push real content past the length ceiling.
 */
export function redactText(
  value: string,
  maxLength: number = DEFAULT_MAX_LENGTH,
): string {
  const stripped = value.replace(CONTROL_CHARACTER_PATTERN, "")
  return stripped.length > maxLength ? stripped.slice(0, maxLength) : stripped
}
