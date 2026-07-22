import { z } from "zod"

/**
 * Zod schemas and "YYYY-MM" <-> `Date` conversion helpers for the Budgeting
 * module, per docs/architecture/api-contracts.md's Budgeting section and
 * folder-tree.md's note that `validation.ts` owns `SetAllocationSchema` and
 * the shared `MonthSchema`.
 *
 * `Budget.month` is modeled in prisma/schema.prisma as a first-of-month UTC
 * `@db.Date` (mirroring `Transaction.date`'s UTC convention, per
 * risk-register.md #8), while every function in the Budgeting contract
 * takes/returns `month` as a `"YYYY-MM"` string. This file is the single
 * place that boundary is crossed — `server/service.ts` and `server/
 * actions.ts` both call `parseMonthToDate`/`isPastMonth` from here instead
 * of re-deriving the UTC-first-of-month math independently, the same "one
 * conversion point" discipline `features/dashboard/server/service.ts` uses
 * for its own UTC month helpers.
 */

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

/** Shared `"YYYY-MM"` validator — every read/mutation in this module takes
 * `month` in this format. */
export const MonthSchema = z
  .string()
  .regex(MONTH_PATTERN, "Month must be in YYYY-MM format")

export type MonthInput = z.infer<typeof MonthSchema>

/**
 * Parses a `"YYYY-MM"` string into the UTC first-of-month `Date` stored in
 * `Budget.month`. Throws on a malformed `month` — callers are expected to
 * have already validated it against `MonthSchema` (directly, or via
 * `SetAllocationSchema`) before reaching here; this is a defensive guard,
 * not the primary validation path.
 */
export function parseMonthToDate(month: string): Date {
  const parsed = MonthSchema.safeParse(month)
  if (!parsed.success) {
    throw new Error(`Invalid month "${month}" — expected "YYYY-MM"`)
  }

  const [yearStr, monthStr] = month.split("-")
  const year = Number(yearStr)
  const monthIndex = Number(monthStr) - 1

  return new Date(Date.UTC(year, monthIndex, 1))
}

/** UTC first-of-month `Date` for "now" — the boundary `isPastMonth` compares
 * against (AC3: past months are read-only, current and future are
 * editable). Accepts an injectable `now` purely for testability. */
export function currentMonthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

/**
 * `true` when `monthDate` (a UTC first-of-month `Date`, see
 * `parseMonthToDate`) is strictly before the current calendar month —
 * budgeting.md AC3's "past months are read-only" boundary. The current
 * month itself is never "past" (it's editable), matching AC3's "the current
 * month and future months are editable" wording exactly.
 */
export function isPastMonth(monthDate: Date, now: Date = new Date()): boolean {
  return monthDate.getTime() < currentMonthStart(now).getTime()
}

// ---------------------------------------------------------------------------
// Mutation input schemas
// ---------------------------------------------------------------------------

// Budget.amount is Decimal(14, 2) (prisma/schema.prisma), so this mirrors
// features/accounts/server/validation.ts's `decimalPrecision`/`balanceSchema`
// precision-guard pattern exactly. Not imported from there —
// features/<domain>/server modules don't cross-import each other's
// validation internals (matches features/transactions/server/service.ts's
// EXCLUDE_SPLIT_PARENTS note on this same boundary rule); duplicated here as
// its own small, self-contained rule instead.
const MAX_ALLOCATION_AMOUNT = 999_999_999_999.99

/** Guards against floating-point noise while still rejecting genuinely
 * over-precise input (e.g. `19.999`) — see
 * features/accounts/server/validation.ts's identical helper for the full
 * epsilon-comparison rationale. */
function hasAtMostTwoDecimalPlaces(value: number): boolean {
  const cents = value * 100
  return Math.abs(Math.round(cents) - cents) < 1e-6
}

// Edge Cases: "Negative or non-numeric allocation input: rejected with a
// validation error; allocations must be zero or a positive amount." No
// upper bound beyond the DB column's own precision — Edge Cases also state
// "Allocating more than the user can realistically afford: allowed without
// restriction," so MAX_ALLOCATION_AMOUNT exists only to keep the value
// representable in `Decimal(14, 2)`, not as a product-level cap.
const allocationAmountSchema = z
  .number({ error: "Amount must be a number" })
  .finite("Amount must be a finite number")
  .min(0, "Amount must be zero or a positive amount")
  .max(
    MAX_ALLOCATION_AMOUNT,
    `Amount must be no larger than ${MAX_ALLOCATION_AMOUNT.toLocaleString("en-US")}`,
  )
  .refine(hasAtMostTwoDecimalPlaces, {
    message: "Amount supports at most 2 decimal places",
  })

/**
 * `setCategoryAllocation` input (api-contracts.md's Budgeting section:
 * `SetAllocationSchema { month: "YYYY-MM"; categoryId: string; amount: number }`).
 * `amount >= 0` is the only allocation-value validation the spec calls
 * for — "set to zero" vs. "unset" is a row-presence distinction the
 * service/DB layer handles (prisma/schema.prisma's Budgeting modeling
 * comment), not something this schema encodes; there is no separate "clear
 * allocation" action anywhere in the spec.
 */
export const SetAllocationSchema = z.object({
  month: MonthSchema,
  categoryId: z.string().min(1, "Category id is required"),
  amount: allocationAmountSchema,
})

export type SetAllocationInput = z.infer<typeof SetAllocationSchema>

/**
 * `refreshBudgetAdvisor` Server Action input (docs/product/ai-features.md
 * Feature 2, docs/architecture/api-contracts.md's Feature 2 section: `{
 * month: string }`). Ordinary Server-Action *input* validation, per
 * naming-standards.md's Phase 4a convention -- this is deliberately not in
 * `advisor-schema.ts`, which is reserved exclusively for the shape the AI
 * call itself must return.
 */
export const RefreshBudgetAdvisorSchema = z.object({
  month: MonthSchema,
})

export type RefreshBudgetAdvisorInput = z.infer<typeof RefreshBudgetAdvisorSchema>
