/**
 * Validation schema and default-values helper for debt-form.tsx, split into
 * its own module so the component file (rendering + submit wiring) stays
 * under the company's ~300-line-per-file guideline — same split as
 * `features/accounts/components/account-form-schema.ts`.
 *
 * This is a client-side copy of the shape already enforced by
 * `features/debt/server/validation.ts` (`CreateDebtSchema`/`UpdateDebtSchema`)
 * — kept here, not imported, for the same reason `account-form-schema.ts`
 * keeps its own copy: fast client feedback only ("well-formed number", not
 * every business rule), the Server Action re-validates independently and is
 * the real source of truth. Also matches account-form-schema.ts's choice to
 * keep every numeric field a `z.string()` bound to an `<Input type="number">`
 * control (RHF/zodResolver typing doesn't propagate a `.transform()`'s output
 * type through `Controller` cleanly) — the string -> number conversion
 * happens once in debt-form.tsx's `onSubmit`, after validation already
 * confirmed each string is well-formed.
 */

import { z } from "zod"

import type { Debt, DebtType } from "@/features/debt/types"

/**
 * Human-readable labels for `DebtType` — the raw Prisma enum value
 * (e.g. "CREDIT_CARD") is never shown directly to the user. Covers all six
 * values per debt-tracker.md AC1.
 */
export const DEBT_TYPE_LABELS: Record<DebtType, string> = {
  CREDIT_CARD: "Credit Card",
  PERSONAL_LOAN: "Personal Loan",
  AUTO_LOAN: "Auto Loan",
  STUDENT_LOAN: "Student Loan",
  MORTGAGE: "Mortgage",
  OTHER: "Other",
}

export const DEBT_TYPE_VALUES = Object.keys(DEBT_TYPE_LABELS) as [
  DebtType,
  ...DebtType[],
]

const numericStringField = (label: string) =>
  z
    .string()
    .trim()
    .refine((value) => value !== "" && Number.isFinite(Number(value)), {
      message: `${label} must be a number`,
    })

export const DebtFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(120, "Name must be 120 characters or fewer"),
  type: z.enum(DEBT_TYPE_VALUES, {
    error: "Select a debt type",
  }),
  balance: numericStringField("Balance"),
  interestRate: numericStringField("Interest rate"),
  minimumPayment: numericStringField("Minimum payment"),
})

export type DebtFormFields = z.infer<typeof DebtFormSchema>

/**
 * Omit `debt` for create mode's defaults; pass it to prefill edit mode.
 *
 * Balance is prefilled from `effectiveBalance` (the live, never-copied
 * number — see `types.ts`'s `DebtWithProjection` doc), not the raw `Debt.balance`
 * column, so a linked Credit Card debt's form shows the number the user
 * actually recognizes as "what I owe" rather than the stale manual column
 * debt-form.tsx disables editing on anyway (see that file's JSDoc).
 */
export function defaultValuesFor(debt?: Debt & { effectiveBalance?: number }): DebtFormFields {
  if (!debt) {
    return {
      name: "",
      type: "CREDIT_CARD",
      balance: "",
      interestRate: "",
      minimumPayment: "",
    }
  }

  return {
    name: debt.name,
    type: debt.type,
    balance: String(debt.effectiveBalance ?? debt.balance),
    interestRate: String(debt.interestRate),
    minimumPayment: String(debt.minimumPayment),
  }
}
