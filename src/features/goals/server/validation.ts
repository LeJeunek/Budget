import { z } from "zod"

/**
 * Zod schemas for the Goals module's server boundary (every Server Action's
 * input), per docs/architecture/api-contracts.md's Savings Goals section and
 * docs/product/savings-goals.md's acceptance criteria / edge cases.
 */

// ---------------------------------------------------------------------------
// Shared constants / helpers
// ---------------------------------------------------------------------------

// Matches the DB column precision (`prisma/schema.prisma`: `Goal.targetAmount`
// and `Goal.plannedMonthlyContribution` are both `Decimal(14, 2)`, and
// `GoalContribution.amount` is also `Decimal(14, 2)` — the same precision as
// `Account.balance`/`Transaction.amount`) — 14 total digits, 2 of them
// fractional, so the largest representable magnitude is
// 999,999,999,999.99. Validating this here gives a clear 4xx error instead of
// letting Postgres reject an out-of-range value with an opaque database
// error, per docs/product/savings-goals.md's "Very large target amounts ...
// the goals list remains usable" edge case.
const MAX_DECIMAL_ABS = 999_999_999_999.99

const MAX_NAME_LENGTH = 120

/**
 * Guards against floating-point noise (e.g. 19.999999999999996 from a form
 * input) while still rejecting genuinely over-precise values like 19.999.
 * The exact same technique as `features/accounts/server/validation.ts`'s
 * `hasAtMostTwoDecimalPlaces` and `features/transactions/server/validation.ts`'s
 * copy of it — duplicated here rather than imported, per folder-tree.md's
 * module boundary rule (features/<domain>/server is not a shared import
 * target across domains, confirmed by Transactions already duplicating
 * Accounts' copy rather than importing it). If this logic ever needs to
 * change, update every copy.
 */
function hasAtMostTwoDecimalPlaces(value: number): boolean {
  const cents = value * 100
  return Math.abs(Math.round(cents) - cents) < 1e-6
}

/** Reused by `targetAmountSchema`, `plannedMonthlyContributionSchema`, and
 * `contributionAmountSchema` below — all three are DB `Decimal(14, 2)`
 * columns, so all three need the same "well-formed currency number" shape
 * check. Range/sign checks differ per field and are applied separately. */
function decimalPrecision(label: string) {
  return z
    .number({ error: `${label} must be a number` })
    .finite(`${label} must be a finite number`)
    .refine(hasAtMostTwoDecimalPlaces, {
      message: `${label} supports at most 2 decimal places`,
    })
    .refine((value) => Math.abs(value) <= MAX_DECIMAL_ABS, {
      message: `${label} must be no larger than ${MAX_DECIMAL_ABS.toLocaleString("en-US")} in magnitude`,
    })
}

/**
 * `targetAmount`: required, strictly positive per AC1 ("a target amount
 * (required)") and the "negative or non-numeric target amount ... rejected
 * with a validation error" edge case. Zero is also rejected — a $0 target is
 * meaningless (would be Completed before any contribution).
 */
const targetAmountSchema = decimalPrecision("Target amount").gt(
  0,
  "Target amount must be greater than 0",
)

/**
 * `plannedMonthlyContribution`: optional (AC1), but when provided must be
 * strictly positive — a $0 or negative planned contribution is not a
 * meaningful monthly plan and would corrupt AC7's `remaining / planned`
 * estimate (divide-by-zero or a nonsensical negative month count).
 */
const plannedMonthlyContributionSchema = decimalPrecision(
  "Planned monthly contribution",
).gt(0, "Planned monthly contribution must be greater than 0")

/**
 * `GoalContribution.amount`: required, strictly positive per AC3 ("an amount
 * ... adds to that goal's current progress") and the "negative contribution
 * amount ... rejected" edge case. There is no "$0 contribution" use case
 * (unlike Transactions' wash-entry allowance) since a $0 contribution would
 * have no effect on progress.
 */
const contributionAmountSchema = decimalPrecision("Contribution amount").gt(
  0,
  "Contribution amount must be greater than 0",
)

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(MAX_NAME_LENGTH, `Name must be ${MAX_NAME_LENGTH} characters or fewer`)

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Builds a UTC-midnight `Date` from a `"yyyy-mm-dd"` string — identical
 * technique to `features/transactions/server/validation.ts`'s
 * `toUtcDateOnly`/`dateOnlySchema` (duplicated per the same module-boundary
 * rule as `hasAtMostTwoDecimalPlaces` above), matching `Goal.targetDate` and
 * `GoalContribution.date`'s `@db.Date` column semantics and the UTC-calendar-
 * date convention established by `features/dashboard/server/service.ts`'s
 * `utcMonthStart`. */
function toUtcDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

const dateOnlySchema = z
  .string()
  .regex(DATE_ONLY_PATTERN, "Date must be in YYYY-MM-DD format")
  .transform(toUtcDateOnly)

/** Treats an empty-string input the same as an omitted field — used for
 * `targetDate`, which is optional per AC1. Mirrors
 * `features/transactions/server/validation.ts`'s `emptyToUndefined`. */
function emptyToUndefined(value: unknown): unknown {
  return value === "" ? undefined : value
}

const optionalDateOnlySchema = z.preprocess(
  emptyToUndefined,
  dateOnlySchema.optional(),
)

/** Treats an empty-string input as an *explicit clear* (`null`) rather than
 * "omitted" — used only by `UpdateGoalSchema.targetDate`, where a date
 * picker being cleared back to blank must be distinguishable from the field
 * simply not being included in the update payload. Mirrors
 * `features/transactions/server/validation.ts`'s `notesSchema`/
 * `categoryIdSchema` "" -> null convention (as opposed to
 * `emptyToUndefined`'s "" -> undefined "leave unchanged" convention used by
 * `optionalDateOnlySchema` above, which is correct for *create* where there
 * is no prior value to clear). */
function emptyToNull(value: unknown): unknown {
  return value === "" ? null : value
}

// ---------------------------------------------------------------------------
// Public schemas — see docs/architecture/api-contracts.md's Savings Goals
// section for the required names/shapes.
// ---------------------------------------------------------------------------

/**
 * `createGoal` input. `targetDate`/`plannedMonthlyContribution` are both
 * optional per AC1. A `targetDate` in the past is intentionally accepted
 * (not rejected) — per the "Goal with a target date in the past at creation
 * time ... allowed, but visually flagged" edge case; that flagging
 * (`isTargetDatePassed`) is a read-time computed field in
 * `server/service.ts`, not something this schema enforces.
 */
export const CreateGoalSchema = z.object({
  name: nameSchema,
  targetAmount: targetAmountSchema,
  targetDate: optionalDateOnlySchema,
  plannedMonthlyContribution: plannedMonthlyContributionSchema.optional(),
})

export type CreateGoalInput = z.infer<typeof CreateGoalSchema>

/**
 * `updateGoal` input. Every field besides `id` is optional so callers can
 * patch a single field (e.g. just the name) — only fields actually present
 * in the parsed input are written by `server/actions.ts`, the same
 * "undefined fields excluded from `data`" convention as
 * `features/accounts/server/actions.ts`'s `updateAccount`. Per AC4, none of
 * these fields ever touch progress (`currentProgress` is derived from
 * `GoalContribution` rows only, never a column on `Goal`).
 *
 * `targetDate`/`plannedMonthlyContribution` accept an explicit `null` (via
 * `.nullable()`) so a caller can clear a previously-set value — plain
 * `.optional()` alone cannot distinguish "leave unchanged" (omitted) from
 * "clear it" (explicit null), the same distinction
 * `features/accounts/server/validation.ts`'s `UpdateAccountSchema.interestRate`
 * makes for the identical reason.
 */
export const UpdateGoalSchema = z.object({
  id: z.string().min(1, "Goal id is required"),
  name: nameSchema.optional(),
  targetAmount: targetAmountSchema.optional(),
  targetDate: z.preprocess(
    emptyToNull,
    dateOnlySchema.nullable().optional(),
  ),
  plannedMonthlyContribution: plannedMonthlyContributionSchema
    .nullable()
    .optional(),
})

export type UpdateGoalInput = z.infer<typeof UpdateGoalSchema>

/** `archiveGoal` / `unarchiveGoal` / `getGoalById` input — just the id. */
export const GoalIdSchema = z.object({
  id: z.string().min(1, "Goal id is required"),
})

export type GoalIdInput = z.infer<typeof GoalIdSchema>

/**
 * `addContribution` input, per AC3 and api-contracts.md's
 * `AddContributionSchema { goalId: string; amount: number (> 0); date: Date }`.
 * A contribution's `date` is not restricted to "today or earlier" — a user
 * backfilling a contribution they logged late, or recording one they intend
 * to make, is a reasonable real-world use and nothing in the spec forbids it.
 */
export const AddContributionSchema = z.object({
  goalId: z.string().min(1, "Goal id is required"),
  amount: contributionAmountSchema,
  date: dateOnlySchema,
})

export type AddContributionInput = z.infer<typeof AddContributionSchema>

/** `deleteContribution` input. */
export const ContributionIdSchema = z.object({
  id: z.string().min(1, "Contribution id is required"),
})

export type ContributionIdInput = z.infer<typeof ContributionIdSchema>
