import { AccountType } from "@prisma/client"
import { z } from "zod"

// ---------------------------------------------------------------------------
// Shared constants / helpers
// ---------------------------------------------------------------------------

// Matches the DB column precision (`prisma/schema.prisma`: balance is
// `Decimal(14, 2)`) — 14 total digits, 2 of them fractional, so the largest
// representable magnitude is 999,999,999,999.99. Validating this here (per
// docs/product/accounts.md's "very large or precise balances" edge case)
// gives a clear 4xx error instead of letting Postgres reject an out-of-range
// value with an opaque database error.
const MAX_BALANCE_ABS = 999_999_999_999.99

// `interestRate` is `Decimal(5, 2)` in the schema (max magnitude 999.99),
// but the product-level valid range is far narrower — see MAX_INTEREST_RATE
// below, which is the rule actually enforced.
const MAX_INTEREST_RATE = 100
const MIN_INTEREST_RATE = 0

const DEFAULT_ACCOUNT_COLOR = "#6366f1" // matches the Prisma column default
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

const MAX_NAME_LENGTH = 120
const MAX_INSTITUTION_LENGTH = 120

/**
 * Guards against floating-point noise (e.g. 19.999999999999996 from a form
 * input) while still rejecting genuinely over-precise values like 19.999.
 * Comparing rounded cents against the raw value (scaled) within a tiny
 * epsilon is the standard safe way to check "at most 2 decimal places" for
 * an IEEE-754 double.
 */
function hasAtMostTwoDecimalPlaces(value: number): boolean {
  const cents = value * 100
  return Math.abs(Math.round(cents) - cents) < 1e-6
}

// Reused by both `balance` and `interestRate` — both are DB `Decimal(_, 2)`
// columns, so both need the same "well-formed currency number" shape check.
// Range checks differ per field and are applied separately below.
const decimalPrecision = (label: string) =>
  z
    .number({ error: `${label} must be a number` })
    .finite(`${label} must be a finite number`)
    .refine(hasAtMostTwoDecimalPlaces, {
      message: `${label} supports at most 2 decimal places`,
    })

// NOTE: intentionally no `.min(0)` here — see docs/product/accounts.md's
// "Negative balances: allowed for Checking/Savings/Cash (e.g. overdraft) —
// must not be blocked or flagged as an error." The balance sign convention
// (asset accounts positive, Credit Card positive-as-debt) is a display/
// aggregation rule enforced by downstream consumers (e.g. Net Worth), not a
// numeric constraint this schema should impose — imposing one here would
// incorrectly block legitimate overdrafts.
const balanceSchema = decimalPrecision("Balance").refine(
  (value) => Math.abs(value) <= MAX_BALANCE_ABS,
  {
    message: `Balance must be no larger than ${MAX_BALANCE_ABS.toLocaleString("en-US")} in magnitude`,
  },
)

// Range-checked per docs/product/accounts.md's edge case: "Interest rate out
// of a sane range (e.g. negative, or above 100%): flagged with a validation
// message rather than silently accepted, since a typo here (e.g. '425'
// instead of '4.25') is a realistic user error."
const interestRateSchema = decimalPrecision("Interest rate")
  .min(MIN_INTEREST_RATE, "Interest rate cannot be negative")
  .max(
    MAX_INTEREST_RATE,
    `Interest rate must be ${MAX_INTEREST_RATE} or less — enter a percentage like 4.25, not 425`,
  )

const colorSchema = z
  .string()
  .regex(HEX_COLOR_PATTERN, "Color must be a 6-digit hex value, e.g. #6366f1")

// Empty-string institution input (a blank text field) is normalized to
// `undefined` (create) so Prisma stores NULL rather than an empty string —
// "naturally blank for Cash" per the spec, not a validation failure.
const institutionSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().max(MAX_INSTITUTION_LENGTH).optional(),
)

const accountTypeSchema = z.nativeEnum(AccountType, {
  error: "Type must be one of the supported account types",
})

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(MAX_NAME_LENGTH, `Name must be ${MAX_NAME_LENGTH} characters or fewer`)

// ---------------------------------------------------------------------------
// Public schemas — see docs/architecture/api-contracts.md's Accounts section
// and docs/architecture/naming-standards.md for the required names/shapes.
// ---------------------------------------------------------------------------

/**
 * `createAccount` input. Duplicate names across accounts are explicitly
 * allowed (docs/product/accounts.md edge cases) so there is no uniqueness
 * check here.
 */
export const CreateAccountSchema = z.object({
  name: nameSchema,
  type: accountTypeSchema,
  institution: institutionSchema,
  balance: balanceSchema.optional().default(0),
  interestRate: interestRateSchema.optional(),
  color: colorSchema.optional().default(DEFAULT_ACCOUNT_COLOR),
})

export type CreateAccountInput = z.infer<typeof CreateAccountSchema>

/**
 * `updateAccount` input. Every field besides `id` is optional so callers can
 * patch a single field (e.g. just re-coloring), and per the spec's "Editing
 * an account that has existing transactions" edge case, every field
 * including `type` may be changed post-creation without restriction.
 *
 * `interestRate: null` is accepted (via `.nullable()`) so a client can
 * explicitly clear a previously-set rate, e.g. after correcting the account
 * type away from an interest-bearing one — plain `.optional()` alone cannot
 * distinguish "leave unchanged" from "clear it".
 */
export const UpdateAccountSchema = z.object({
  id: z.string().min(1, "Account id is required"),
  name: nameSchema.optional(),
  type: accountTypeSchema.optional(),
  institution: institutionSchema,
  balance: balanceSchema.optional(),
  interestRate: interestRateSchema.nullable().optional(),
  color: colorSchema.optional(),
})

export type UpdateAccountInput = z.infer<typeof UpdateAccountSchema>

/** `archiveAccount` / `unarchiveAccount` input — both take just the id. */
export const AccountIdSchema = z.object({
  id: z.string().min(1, "Account id is required"),
})

export type AccountIdInput = z.infer<typeof AccountIdSchema>
