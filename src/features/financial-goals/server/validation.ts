import { z } from "zod"

/**
 * Zod schemas for the Financial Goals module's server boundary (every Server
 * Action's input), per docs/architecture/api-contracts.md's Financial Goals
 * section and docs/product/financial-goals.md's acceptance criteria / edge
 * cases.
 */

// ---------------------------------------------------------------------------
// Shared constants / helpers (duplicated from features/goals/server/
// validation.ts rather than imported — features/<domain>/server modules
// don't share validation across domains, per folder-tree.md's module
// boundary rule, the same precedent Transactions already established by
// duplicating Accounts' copy of this exact helper).
// ---------------------------------------------------------------------------

// Matches the DB column precision (prisma/schema.prisma: `startingBalance`/
// `targetAmount` are both `Decimal(14, 2)`, same precision as
// `Account.balance`) — 14 total digits, 2 fractional, so the largest
// representable magnitude is 999,999,999,999.99.
const MAX_DECIMAL_ABS = 999_999_999_999.99

const MAX_NAME_LENGTH = 120

/** Guards against floating-point noise (e.g. 19.999999999999996 from a form
 * input) while still rejecting genuinely over-precise values like 19.999 —
 * identical technique to `features/goals/server/validation.ts`'s
 * `hasAtMostTwoDecimalPlaces`. */
function hasAtMostTwoDecimalPlaces(value: number): boolean {
  const cents = value * 100
  return Math.abs(Math.round(cents) - cents) < 1e-6
}

/** Reused by `targetAmountSchema` below — a DB `Decimal(14, 2)` column, so it
 * needs the same "well-formed currency number" shape check `targetPercent`
 * (validated separately, see `targetPercentSchema`) does not. */
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
 * `targetAmount` (NET_WORTH_SAVINGS_TARGET only): required at creation,
 * strictly positive — a $0 or negative target is meaningless (would be
 * Completed before the goal even starts, or unreachable).
 */
const targetAmountSchema = decimalPrecision("Target amount").gt(
  0,
  "Target amount must be greater than 0",
)

/**
 * `targetPercent` (SAVINGS_RATE_TARGET only): required at creation, `Decimal(5,
 * 2)` per the schema, bounded `[0, 100]` per financial-goals.md's own Edge
 * Case: "A Savings Rate goal with a target above 100% or below 0%: rejected
 * with a validation error — not a meaningful target."
 */
const targetPercentSchema = z
  .number({ error: "Target percent must be a number" })
  .finite("Target percent must be a finite number")
  .refine(hasAtMostTwoDecimalPlaces, {
    message: "Target percent supports at most 2 decimal places",
  })
  .gte(0, "Target percent must be between 0 and 100")
  .lte(100, "Target percent must be between 0 and 100")

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(MAX_NAME_LENGTH, `Name must be ${MAX_NAME_LENGTH} characters or fewer`)

const linkedDebtIdSchema = z.string().min(1, "A debt must be selected")

/** An `AccountId` list for the `ACCOUNT_SUBSET` measurement basis. Ownership/
 * archival-state validation (only the caller's own non-archived Accounts may
 * be selected, per prisma/schema.prisma's `FinancialGoalAccount` comment)
 * requires a database read and is therefore `server/actions.ts`'s
 * responsibility, not this shape-only schema's — mirrors
 * `features/bills/server/validation.ts`'s `categoryIdSchema` convention of
 * validating shape here and existence/ownership at the call site. */
const accountIdsSchema = z.array(z.string().min(1)).max(200)

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Builds a UTC-midnight `Date` from a `"yyyy-mm-dd"` string — identical
 * technique to `features/goals/server/validation.ts`'s `toUtcDateOnly`,
 * matching `FinancialGoal.targetDate`'s `@db.Date` column semantics. */
function toUtcDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

const dateOnlySchema = z
  .string()
  .regex(DATE_ONLY_PATTERN, "Date must be in YYYY-MM-DD format")
  .transform(toUtcDateOnly)

/** Treats an empty-string input the same as an omitted field — used for
 * `targetDate` at creation, which is optional (financial-goals.md's Type 3:
 * "a target percentage ... and, optionally, a target date"). Mirrors
 * `features/goals/server/validation.ts`'s `emptyToUndefined`. */
function emptyToUndefined(value: unknown): unknown {
  return value === "" ? undefined : value
}

const optionalDateOnlySchema = z.preprocess(
  emptyToUndefined,
  dateOnlySchema.optional(),
)

/** Treats an empty-string input as an *explicit clear* (`null`) — used only
 * by `UpdateFinancialGoalSchema.targetDate`, mirroring
 * `features/goals/server/validation.ts`'s `emptyToNull`/`UpdateGoalSchema.
 * targetDate` "" -> null convention for the identical clear-vs-omit
 * distinction a date picker needs. */
function emptyToNull(value: unknown): unknown {
  return value === "" ? null : value
}

// ---------------------------------------------------------------------------
// Public schemas — see docs/architecture/api-contracts.md's Financial Goals
// section for the required shapes.
// ---------------------------------------------------------------------------

/**
 * `createFinancialGoal` input — a discriminated union on `type`, per
 * api-contracts.md's exact shape. `type` is fixed at creation (AC1) and
 * never appears in `UpdateFinancialGoalSchema` below.
 *
 * Each branch is a plain `z.object` (not a `.refine`-wrapped effect) so
 * `z.discriminatedUnion` can dispatch on `type` — the one cross-field rule
 * this schema itself enforces (`ACCOUNT_SUBSET` requires a non-empty
 * `accountIds`) is applied via `.superRefine` on the *union result*, not
 * inside any individual branch, since wrapping a branch in `.refine` would
 * make it incompatible with `discriminatedUnion`'s object-schema
 * requirement.
 */
const DebtPayoffGoalSchema = z.object({
  type: z.literal("DEBT_PAYOFF"),
  name: nameSchema,
  linkedDebtId: linkedDebtIdSchema,
})

const NetWorthSavingsTargetGoalSchema = z.object({
  type: z.literal("NET_WORTH_SAVINGS_TARGET"),
  name: nameSchema,
  targetAmount: targetAmountSchema,
  measurementBasis: z.enum(["TOTAL_NET_WORTH", "ACCOUNT_SUBSET"], {
    error: "Measurement basis must be either Total Net Worth or an Account subset",
  }),
  accountIds: accountIdsSchema.optional(),
})

const SavingsRateTargetGoalSchema = z.object({
  type: z.literal("SAVINGS_RATE_TARGET"),
  name: nameSchema,
  targetPercent: targetPercentSchema,
  targetDate: optionalDateOnlySchema,
})

export const CreateFinancialGoalSchema = z
  .discriminatedUnion("type", [
    DebtPayoffGoalSchema,
    NetWorthSavingsTargetGoalSchema,
    SavingsRateTargetGoalSchema,
  ])
  .superRefine((data, ctx) => {
    // financial-goals.md's Type 2: "(b) a user-selected subset of their
    // non-archived Accounts" — a subset with zero Accounts selected isn't a
    // meaningful measurement, so this is required at creation, not left to
    // resolve to an implicit "measures nothing."
    if (
      data.type === "NET_WORTH_SAVINGS_TARGET" &&
      data.measurementBasis === "ACCOUNT_SUBSET" &&
      (!data.accountIds || data.accountIds.length === 0)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Select at least one account for the account subset",
        path: ["accountIds"],
      })
    }
  })

export type CreateFinancialGoalInput = z.infer<typeof CreateFinancialGoalSchema>

/**
 * `updateFinancialGoal` input. Per AC1/api-contracts.md, `type` is
 * deliberately **excluded** — "editing a goal's type after creation is not
 * supported... a user who wants a different type archives the current goal
 * and creates a new one." Every field is optional so callers can patch just
 * one (e.g. renaming); `server/actions.ts` is responsible for rejecting any
 * field that doesn't apply to the *existing* goal's fixed type (e.g.
 * `targetPercent` supplied for a `DEBT_PAYOFF` goal) — a check this schema
 * cannot itself express, since it has no way to know the goal's type without
 * a database read.
 *
 * `linkedDebtId`/`startingBalance` have no update path at all (not even
 * listed here) — financial-goals.md's Type 1 section: `startingBalance` is
 * "a fixed anchor, not recomputed later," and AC3's editable-fields list for
 * this feature never mentions `linkedDebtId`, matching `startingBalance`'s
 * own "set once at creation" treatment.
 */
export const UpdateFinancialGoalSchema = z.object({
  id: z.string().min(1, "Financial goal id is required"),
  name: nameSchema.optional(),
  targetAmount: targetAmountSchema.optional(),
  measurementBasis: z
    .enum(["TOTAL_NET_WORTH", "ACCOUNT_SUBSET"], {
      error: "Measurement basis must be either Total Net Worth or an Account subset",
    })
    .optional(),
  accountIds: accountIdsSchema.optional(),
  targetPercent: targetPercentSchema.optional(),
  targetDate: z.preprocess(emptyToNull, dateOnlySchema.nullable().optional()),
})

export type UpdateFinancialGoalInput = z.infer<typeof UpdateFinancialGoalSchema>

/** `archiveFinancialGoal` / `unarchiveFinancialGoal` / `getFinancialGoalById`
 * input — just the id. */
export const FinancialGoalIdSchema = z.object({
  id: z.string().min(1, "Financial goal id is required"),
})

export type FinancialGoalIdInput = z.infer<typeof FinancialGoalIdSchema>
