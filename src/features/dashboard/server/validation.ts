import { z } from "zod"

/**
 * Zod schema and `"YYYY-MM"` <-> `Date` conversion helpers for the
 * Dashboard module's Automatic Monthly Summaries feature (Phase 4a), per
 * docs/architecture/api-contracts.md's Feature 3 section.
 *
 * `MonthlySummary.month` is modeled in prisma/schema.prisma as a
 * first-of-month UTC `@db.Date` (mirroring `Budget.month`'s identical
 * convention, per risk-register.md #8), while `regenerateMonthlySummary`
 * takes `month` as a `"YYYY-MM"` string, per api-contracts.md.
 *
 * Deliberately NOT imported from `features/budgeting/server/validation.ts`,
 * even though the regex/conversion logic is identical -- per
 * `features/transactions/server/service.ts`'s `EXCLUDE_SPLIT_PARENTS` doc
 * comment (and `categorization.ts`'s own note on the same convention),
 * `features/<domain>/server` modules do not cross-import each other's
 * validation internals in this codebase; this small duplication is the
 * established, deliberate alternative.
 */

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

/** Shared `"YYYY-MM"` validator for this module's `month` inputs. */
export const MonthSchema = z
  .string()
  .regex(MONTH_PATTERN, "Month must be in YYYY-MM format")

export type MonthInput = z.infer<typeof MonthSchema>

/**
 * Parses a `"YYYY-MM"` string into the UTC first-of-month `Date` stored in
 * `MonthlySummary.month`. Throws on a malformed `month` -- callers are
 * expected to have already validated it against `MonthSchema` (directly, or
 * via `RegenerateMonthlySummarySchema`) before reaching here; this is a
 * defensive guard, not the primary validation path.
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

/** `"yyyy-MM"` key for a UTC month-start `Date` -- the inverse of
 * `parseMonthToDate`, matching `features/dashboard/server/service.ts`'s
 * `formatMonthKey` exactly (built from UTC getters, never a
 * local-timezone-dependent formatter). */
export function formatMonthKey(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

/**
 * `regenerateMonthlySummary` Server Action input (docs/product/ai-features.md
 * Feature 3's "may optionally be offered" regenerate action,
 * docs/architecture/api-contracts.md's Feature 3 section: `{ month: string }`).
 * Ordinary Server-Action *input* validation, per naming-standards.md's Phase
 * 4a convention -- this is deliberately not in `monthly-summary-schema.ts`,
 * which is reserved exclusively for the shape the AI call itself must
 * return.
 */
export const RegenerateMonthlySummarySchema = z.object({
  month: MonthSchema,
})

export type RegenerateMonthlySummaryInput = z.infer<
  typeof RegenerateMonthlySummarySchema
>
