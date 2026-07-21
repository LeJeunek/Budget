import { DebtType } from "@prisma/client"
import { z } from "zod"

/**
 * Zod schemas for the Debt Tracker module's server boundary (every Server
 * Action's input), per docs/architecture/api-contracts.md's Debt Tracker
 * section and docs/product/debt-tracker.md's acceptance criteria/edge cases.
 */

// ---------------------------------------------------------------------------
// Shared constants / helpers
// ---------------------------------------------------------------------------

// Matches the DB column precision (prisma/schema.prisma: `Debt.balance`/
// `minimumPayment` are `Decimal(14, 2)`) — same rationale/value as
// `features/accounts/server/validation.ts`'s `MAX_BALANCE_ABS` and
// `features/investments/server/validation.ts`'s `MAX_DECIMAL_ABS`.
const MAX_DECIMAL_ABS = 999_999_999_999.99

// `Debt.interestRate` is `Decimal(5, 2)` in the schema (max magnitude
// 999.99), but the product-level sane range is far narrower — matching
// `features/accounts/server/validation.ts`'s own `interestRate` range
// exactly, so a typo like "425" instead of "4.25" is rejected the same way
// here as it already is for Accounts.
const MAX_INTEREST_RATE = 100
const MIN_INTEREST_RATE = 0

const MAX_NAME_LENGTH = 120

/**
 * Guards against floating-point noise (e.g. 19.999999999999996 from a form
 * input) while still rejecting genuinely over-precise values like 19.999.
 * Duplicated from every other domain's own copy (Accounts/Investments/Goals),
 * per folder-tree.md's module boundary rule (features/<domain>/server is not
 * a shared import target across domains) — if this logic ever needs to
 * change, update every copy.
 */
function hasAtMostTwoDecimalPlaces(value: number): boolean {
  const cents = value * 100
  return Math.abs(Math.round(cents) - cents) < 1e-6
}

/** Reused by `balance`, `interestRate`, and `minimumPayment` — all three are
 * DB `Decimal(_, 2)` columns needing the same "well-formed currency number"
 * shape check. Range/sign checks differ per field and are applied
 * separately below. */
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
 * `balance` at **creation** (`CreateDebtSchema`): required, strictly
 * positive — debt-tracker.md AC1 ("a current balance ... entered as a
 * positive number") and api-contracts.md's `CreateDebtSchema` shape
 * (`balance > 0`) are both explicit that a debt is created with a nonzero
 * amount owed; there is no product reason to create a $0 debt.
 */
const createBalanceSchema = decimalPrecision("Balance").gt(
  0,
  "Balance must be greater than 0",
)

/**
 * `balance` on **update** (`UpdateDebtSchema`): allows exactly `0`, unlike
 * creation. **Judgment call, flagged here**: api-contracts.md's `Debt`
 * section only spells out the `> 0` constraint for `CreateDebtSchema`, and is
 * silent on `UpdateDebtSchema`'s numeric range for this field. Allowing `0`
 * on update (but not on create) is a deliberate choice to support AC9's
 * auto-Paid-Off behavior: a user who pays off a debt outside the app (e.g. a
 * lump-sum payoff) needs to be able to edit the balance down to exactly `0`
 * so the debt is automatically recognized as Paid Off, the same way AC3
 * already allows editing balance/interestRate/minimumPayment at any time.
 * Negative balances are still rejected either way — a debt cannot owe a
 * negative amount.
 */
const updateBalanceSchema = decimalPrecision("Balance").min(
  0,
  "Balance cannot be negative",
)

/**
 * `interestRate`: required (unlike `Account.interestRate`, which is
 * optional) per AC1's explicit note that every payoff calculation in this
 * feature depends on it. Range-checked the same way
 * `features/accounts/server/validation.ts` checks its own `interestRate`
 * field, for the same "a typo like 425 instead of 4.25 is a realistic user
 * error" reason.
 */
const interestRateSchema = decimalPrecision("Interest rate")
  .min(MIN_INTEREST_RATE, "Interest rate cannot be negative")
  .max(
    MAX_INTEREST_RATE,
    `Interest rate must be ${MAX_INTEREST_RATE} or less — enter a percentage like 4.25, not 425`,
  )

/**
 * `minimumPayment`: required, strictly positive per AC1 and
 * api-contracts.md's `CreateDebtSchema` shape (`minimumPayment > 0`) — a $0
 * "minimum payment" has no real-world meaning and would make
 * `payoff-math.ts`'s amortization loop degenerate (a debt that never
 * shrinks).
 */
const minimumPaymentSchema = decimalPrecision("Minimum payment").gt(
  0,
  "Minimum payment must be greater than 0",
)

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(MAX_NAME_LENGTH, `Name must be ${MAX_NAME_LENGTH} characters or fewer`)

const debtTypeSchema = z.nativeEnum(DebtType, {
  error: "Type must be one of the supported debt types",
})

// ---------------------------------------------------------------------------
// Public schemas — see docs/architecture/api-contracts.md's Debt Tracker
// section for the required names/shapes.
// ---------------------------------------------------------------------------

/**
 * `createDebt` input, per api-contracts.md: name, type, balance > 0,
 * interestRate >= 0 (required), minimumPayment > 0. Deliberately has no
 * `accountId` field — linking to an existing Credit Card Account is a
 * separate, explicit action (`linkDebtToAccount`), never bundled into
 * creation, matching the "deliberate action, not automatic panel injection"
 * framing debt-tracker.md's Account-linkage section establishes (the same
 * optional-linking pattern already used for Bills <-> Transaction).
 */
export const CreateDebtSchema = z.object({
  name: nameSchema,
  type: debtTypeSchema,
  balance: createBalanceSchema,
  interestRate: interestRateSchema,
  minimumPayment: minimumPaymentSchema,
})

export type CreateDebtInput = z.infer<typeof CreateDebtSchema>

/**
 * `updateDebt` input. Every field besides `id` is optional so callers can
 * patch a single field, matching `UpdateAccountSchema`/`UpdateHoldingSchema`'s
 * convention. Per api-contracts.md's exact field list, `type` is
 * deliberately NOT updatable here — changing a debt's type post-creation
 * could silently violate the "only Credit Card debts may link to an Account"
 * invariant for an already-linked debt, so this contract simply doesn't
 * offer that footgun; a user who mis-typed the type would archive and
 * recreate the debt instead.
 *
 * Editing balance/interestRate/minimumPayment recalculates that debt's
 * payoff projections at the next read only — never retroactively (AC3) —
 * which falls out naturally from projections never being stored at all
 * (`server/service.ts` always computes them fresh).
 */
export const UpdateDebtSchema = z.object({
  id: z.string().min(1, "Debt id is required"),
  name: nameSchema.optional(),
  balance: updateBalanceSchema.optional(),
  interestRate: interestRateSchema.optional(),
  minimumPayment: minimumPaymentSchema.optional(),
})

export type UpdateDebtInput = z.infer<typeof UpdateDebtSchema>

/** `archiveDebt` / `unarchiveDebt` input — both take just the id, matching
 * `AccountIdSchema`/`GoalIdSchema`/`BillIdSchema`'s established shape. */
export const DebtIdSchema = z.object({
  id: z.string().min(1, "Debt id is required"),
})

export type DebtIdInput = z.infer<typeof DebtIdSchema>

/**
 * `linkDebtToAccount` input, per api-contracts.md: `{ debtId, accountId }`.
 * The Credit-Card-only / ownership / not-already-linked checks all require a
 * database lookup (the Account's `type`, `userId`, and whether it already
 * backs a different Debt), so — matching
 * `features/investments/server/validation.ts`'s
 * `validateSectorForAssetType` precedent for the same class of problem —
 * those checks live in `server/actions.ts` against the loaded rows, not in
 * this schema, which only validates the input's shape.
 */
export const LinkDebtToAccountSchema = z.object({
  debtId: z.string().min(1, "Debt id is required"),
  accountId: z.string().min(1, "Account id is required"),
})

export type LinkDebtToAccountInput = z.infer<typeof LinkDebtToAccountSchema>

/** `unlinkDebtFromAccount` input, per api-contracts.md: `{ debtId }`. */
export const UnlinkDebtFromAccountSchema = z.object({
  debtId: z.string().min(1, "Debt id is required"),
})

export type UnlinkDebtFromAccountInput = z.infer<typeof UnlinkDebtFromAccountSchema>

/**
 * The optional extra monthly payment amount for the snowball/avalanche
 * comparison (AC6). There is no Server Action that consumes this schema —
 * per api-contracts.md, `compareSnowballAndAvalanche` is called directly,
 * client-side, from `../payoff-math.ts` — but it is still exported from this
 * module (per folder-tree.md's explicit listing of `ExtraPaymentSchema`
 * alongside `CreateDebtSchema`/`UpdateDebtSchema`) so
 * `features/debt/components/extra-payment-input.tsx` (Frontend Lead
 * territory) has a single, shared source of truth for validating the raw
 * input before it ever reaches `payoff-math.ts`'s pure functions, rather than
 * each component re-deriving its own "must be a non-negative number" check.
 * Defaults to `0` (AC6: "optional, defaults to $0").
 */
export const ExtraPaymentSchema = decimalPrecision("Extra payment amount")
  .min(0, "Extra payment amount cannot be negative")
  .optional()
  .default(0)

export type ExtraPaymentInput = z.infer<typeof ExtraPaymentSchema>
