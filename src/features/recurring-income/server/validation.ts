import { IncomeSchedule, IncomeType } from "@prisma/client"
import { z } from "zod"

/**
 * Zod schemas for the Recurring Income module's server boundary (every
 * Server Action's input), per docs/architecture/api-contracts.md's Recurring
 * Income section and docs/product/recurring-income.md's acceptance
 * criteria/edge cases.
 */

// ---------------------------------------------------------------------------
// Shared constants / helpers
// ---------------------------------------------------------------------------

// Matches the DB column precision (prisma/schema.prisma: `IncomeStream.
// expectedAmount`/`IncomeOccurrence.receivedAmount`/`IrregularIncomeEvent.
// amount` are all `Decimal(14, 2)`) — same rationale/value as
// `features/bills/server/validation.ts`'s `MAX_AMOUNT_ABS`.
const MAX_AMOUNT_ABS = 999_999_999_999.99

const NAME_MAX_LENGTH = 120

/**
 * Guards against floating-point noise (e.g. 19.999999999999996 from a form
 * input) while still rejecting genuinely over-precise values like 19.999.
 * Duplicated from every other domain's own copy (Bills/Accounts/Debt/
 * Investments), per folder-tree.md's module boundary rule
 * (features/<domain>/server is not a shared import target across domains) —
 * if this logic ever needs to change, update every copy.
 */
function hasAtMostTwoDecimalPlaces(value: number): boolean {
  const cents = value * 100
  return Math.abs(Math.round(cents) - cents) < 1e-6
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Builds a UTC-midnight `Date` from a `"yyyy-mm-dd"` string — identical
 * technique to `features/bills/server/validation.ts`'s `toUtcDateOnly`,
 * duplicated here for the same module-boundary reason as
 * `hasAtMostTwoDecimalPlaces` above. Matches `IncomeStream.anchorDate`/
 * `IncomeOccurrence.expectedDate`/`receivedDate`/`IrregularIncomeEvent.date`'s
 * `@db.Date` + UTC convention. */
function toUtcDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

/** A `"yyyy-mm-dd"` string, parsed into a UTC-midnight `Date`. Accepts either
 * a string (typical form/JSON input) or an already-constructed `Date` —
 * identical shape to `features/bills/server/validation.ts`'s
 * `dateOnlySchema`. */
const dateOnlySchema = z.union([
  z
    .string()
    .regex(DATE_ONLY_PATTERN, "Date must be in YYYY-MM-DD format")
    .transform(toUtcDateOnly),
  z.date(),
])

function amountSchema(label: string) {
  return z
    .number({ error: `${label} must be a number` })
    .finite(`${label} must be a finite number`)
    .refine(hasAtMostTwoDecimalPlaces, {
      message: `${label} supports at most 2 decimal places`,
    })
    .refine((value) => Math.abs(value) <= MAX_AMOUNT_ABS, {
      message: `${label} must be no larger than ${MAX_AMOUNT_ABS.toLocaleString("en-US")} in magnitude`,
    })
}

/** `expectedAmount` (the planning estimate, AC2) must be strictly positive —
 * a $0 "typical amount" is not a meaningful planning estimate, matching
 * `features/bills/server/validation.ts`'s `expectedAmountSchema` rationale
 * exactly. */
const expectedAmountSchema = amountSchema("Expected amount").positive(
  "Expected amount must be greater than zero",
)

/** `receivedAmount` (the manual mark-received path, AC8) allows zero (e.g. a
 * side hustle month with no sales still "received," recorded as $0) but
 * never negative. */
const receivedAmountSchema = amountSchema("Received amount").nonnegative(
  "Received amount cannot be negative",
)

/** `IrregularIncomeEvent.amount` (AC11): required, strictly positive — a
 * logged income event with a $0 amount has no real-world meaning, matching
 * `features/investments/server/validation.ts`'s `dividendAmountSchema`
 * rationale for the same shape of field. */
const irregularEventAmountSchema = amountSchema("Amount").positive(
  "Amount must be greater than zero",
)

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(NAME_MAX_LENGTH, `Name must be ${NAME_MAX_LENGTH} characters or fewer`)

const incomeTypeSchema = z.nativeEnum(IncomeType, {
  error: "Type must be one of the supported income types",
})

const incomeScheduleSchema = z.nativeEnum(IncomeSchedule, {
  error:
    "Schedule must be one of: weekly, biweekly, monthly, quarterly, annually, or irregular",
})

const idSchema = (label: string) => z.string().min(1, `${label} is required`)

// ---------------------------------------------------------------------------
// Conditional-requirement rule (AC2): expectedAmount/anchorDate required for
// every schedule except IRREGULAR
// ---------------------------------------------------------------------------

/**
 * AC2's conditional-requirement rule, applied against a stream's *effective*
 * schedule/expectedAmount/anchorDate (the create input directly, or the
 * merged result of an existing row + incoming partial update fields).
 * Returns an error message per offending field, or `null` for a valid
 * combination — mirrors `features/investments/server/validation.ts`'s
 * `validateSectorForAssetType` precedent for the exact same class of
 * problem (a conditional requirement that depends on another field's
 * *effective*, possibly-not-currently-being-changed value, which
 * `UpdateIncomeStreamSchema`'s partial shape alone cannot express as a
 * single Zod schema).
 *
 * **Judgment call, flagged here**: `anchorDate` is not listed in
 * api-contracts.md's literal `CreateIncomeStreamSchema`/
 * `UpdateIncomeStreamSchema` field enumerations, but `prisma/schema.prisma`'s
 * `IncomeStream.anchorDate` comment is explicit that it is required for
 * every non-IRREGULAR stream ("mirrors Bill.dueDate ... Nullable because an
 * IRREGULAR stream has no cadence to anchor at all ... for every other
 * schedule value this is required, enforced in Zod") — without it, a
 * scheduled stream would have no starting point for
 * `ensureOccurrencesGenerated` to compute a first occurrence from at all,
 * exactly mirroring why `Bill.dueDate` is a required `CreateBillSchema`
 * field. Treated here as required input for every schedule except
 * `IRREGULAR`, same as `expectedAmount`, to make occurrence generation
 * possible — see this feature's implementation notes for the full
 * rationale.
 */
export function validateScheduleFields(
  schedule: IncomeSchedule,
  expectedAmount: number | null,
  anchorDate: Date | null,
): { expectedAmount?: string; anchorDate?: string } | null {
  if (schedule === IncomeSchedule.IRREGULAR) {
    return null
  }

  const errors: { expectedAmount?: string; anchorDate?: string } = {}
  if (expectedAmount === null) {
    errors.expectedAmount = "Expected amount is required for a scheduled income stream"
  }
  if (anchorDate === null) {
    errors.anchorDate = "An anchor date is required for a scheduled income stream"
  }

  return Object.keys(errors).length > 0 ? errors : null
}

// ---------------------------------------------------------------------------
// Public schemas — see docs/architecture/api-contracts.md's Recurring Income
// section for the required names/shapes.
// ---------------------------------------------------------------------------

/**
 * `createIncomeStream` input, per recurring-income.md AC1/AC2 and
 * api-contracts.md's `CreateIncomeStreamSchema` shape: name, type, schedule,
 * expectedAmount (required unless `IRREGULAR`). `anchorDate` is likewise
 * required unless `IRREGULAR` — see `validateScheduleFields`'s JSDoc for why
 * this field is included despite api-contracts.md's field list omitting it.
 * The conditional requirement itself is enforced via `superRefine` (not two
 * separate schemas per schedule branch) so both fields' "required unless
 * Irregular" rule is expressed in exactly one place, reused identically by
 * `UpdateIncomeStreamSchema`'s merged-effective-value check in
 * `server/actions.ts`.
 */
export const CreateIncomeStreamSchema = z
  .object({
    name: nameSchema,
    type: incomeTypeSchema,
    schedule: incomeScheduleSchema,
    expectedAmount: expectedAmountSchema.nullable().optional(),
    anchorDate: dateOnlySchema.nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const errors = validateScheduleFields(
      data.schedule,
      data.expectedAmount ?? null,
      data.anchorDate ?? null,
    )
    if (errors?.expectedAmount) {
      ctx.addIssue({ code: "custom", message: errors.expectedAmount, path: ["expectedAmount"] })
    }
    if (errors?.anchorDate) {
      ctx.addIssue({ code: "custom", message: errors.anchorDate, path: ["anchorDate"] })
    }
  })

export type CreateIncomeStreamInput = z.infer<typeof CreateIncomeStreamSchema>

/**
 * `updateIncomeStream` input. Every field besides `id` is optional so
 * callers can patch a single field — same "undefined fields excluded from
 * the write" convention as `features/bills/server/validation.ts`'s
 * `UpdateBillSchema`. Per AC5, edits to `expectedAmount`/`schedule` apply to
 * future occurrences only — enforced naturally by `server/occurrence.ts`'s
 * lazy generator always reading the *current* `IncomeStream.expectedAmount`/
 * `schedule` at generation time, never retroactively touching
 * already-persisted `IncomeOccurrence` rows.
 *
 * No cross-field expectedAmount/anchorDate/schedule requirement is enforced
 * *in this schema* — see `validateScheduleFields`'s JSDoc for why that check
 * happens in `server/actions.ts` instead, against the merged existing +
 * incoming values (the same precedent `UpdateHoldingSchema`'s
 * `validateSectorForAssetType` establishes for an identical class of
 * problem).
 */
export const UpdateIncomeStreamSchema = z.object({
  id: idSchema("Income stream id"),
  name: nameSchema.optional(),
  type: incomeTypeSchema.optional(),
  schedule: incomeScheduleSchema.optional(),
  expectedAmount: expectedAmountSchema.nullable().optional(),
  anchorDate: dateOnlySchema.nullable().optional(),
})

export type UpdateIncomeStreamInput = z.infer<typeof UpdateIncomeStreamSchema>

/** `archiveIncomeStream` / `unarchiveIncomeStream` input — both take just the
 * id, mirroring `features/bills/server/validation.ts`'s `BillIdSchema`. */
export const IncomeStreamIdSchema = z.object({
  id: idSchema("Income stream id"),
})

export type IncomeStreamIdInput = z.infer<typeof IncomeStreamIdSchema>

/**
 * `markOccurrenceReceived` input (the manual path only, AC8) — per
 * api-contracts.md's exact shape `{ occurrenceId; receivedAmount;
 * receivedDate }`. Unlike Bills' `MarkPaidSchema` (a discriminated union
 * covering both the manual and linked paths under one action), Recurring
 * Income's contract lists "Mark occurrence received (manual)" and "Mark
 * occurrence received (linked)" as two entirely separate Server Actions
 * (`markOccurrenceReceived` vs. `linkOccurrenceToTransaction`) with two
 * separate schemas — this schema is deliberately manual-only, matching that
 * contract literally rather than introducing a union Bills' contract didn't
 * ask for here.
 */
export const MarkOccurrenceReceivedSchema = z.object({
  occurrenceId: idSchema("Occurrence id"),
  receivedAmount: receivedAmountSchema,
  receivedDate: dateOnlySchema,
})

export type MarkOccurrenceReceivedInput = z.infer<typeof MarkOccurrenceReceivedSchema>

/**
 * `linkOccurrenceToTransaction` input (the linked path, AC8) — per
 * api-contracts.md's exact shape `{ occurrenceId; transactionId }`.
 */
export const LinkOccurrenceToTransactionSchema = z.object({
  occurrenceId: idSchema("Occurrence id"),
  transactionId: idSchema("Transaction id"),
})

export type LinkOccurrenceToTransactionInput = z.infer<
  typeof LinkOccurrenceToTransactionSchema
>

/** `unmarkOccurrenceReceived` input — clears both the manual received fields
 * and any link (AC9), reverting the occurrence to its computed status. */
export const UnmarkOccurrenceReceivedSchema = z.object({
  occurrenceId: idSchema("Occurrence id"),
})

export type UnmarkOccurrenceReceivedInput = z.infer<
  typeof UnmarkOccurrenceReceivedSchema
>

/**
 * `logIrregularIncomeEvent` input, per api-contracts.md's exact shape
 * `LogIrregularIncomeEventSchema { streamId; amount (> 0); date;
 * transactionId? }` (AC11). The optional `transactionId` link goes through
 * the same `lib/transaction-link-guard.ts` check as scheduled occurrences'
 * linking — see `server/actions.ts`.
 */
export const LogIrregularIncomeEventSchema = z.object({
  streamId: idSchema("Income stream id"),
  amount: irregularEventAmountSchema,
  date: dateOnlySchema,
  transactionId: idSchema("Transaction id").optional(),
})

export type LogIrregularIncomeEventInput = z.infer<
  typeof LogIrregularIncomeEventSchema
>
