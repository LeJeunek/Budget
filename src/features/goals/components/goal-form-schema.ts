/**
 * Validation schema and default-values helper for goal-form.tsx, split into
 * its own module so the component file (rendering + submit wiring) stays
 * under the company's ~300-line-per-file guideline — mirrors
 * features/accounts/components/account-form-schema.ts exactly.
 *
 * This is a client-side copy of the rules already enforced by
 * features/goals/server/validation.ts (CreateGoalSchema/UpdateGoalSchema),
 * kept here rather than imported for the same reason account-form-schema.ts
 * gives: fast client feedback only, the Server Action re-validates
 * independently and is the real source of truth.
 */

import { z } from "zod"

import type { Goal } from "@/features/goals/types"

const MAX_NAME_LENGTH = 120

// Both money fields are bound to <Input type="number"> controls, whose DOM
// value is always a string — kept as z.string() here (validated, not
// transformed) for the same Controller/zodResolver typing reason
// account-form-schema.ts documents on its own numericStringField. The
// string -> number conversion happens once in goal-form.tsx's onSubmit,
// after validation has already confirmed each string is well-formed.
function positiveNumericStringField(label: string) {
  return z
    .string()
    .trim()
    .refine((value) => value !== "" && Number.isFinite(Number(value)), {
      message: `${label} must be a number`,
    })
    .refine((value) => value === "" || Number(value) > 0, {
      message: `${label} must be greater than 0`,
    })
}

// Optional counterpart of the above — used by plannedMonthlyContribution,
// which AC1 makes optional but, when provided, must still be > 0 (a $0 or
// negative plan isn't meaningful — see server/validation.ts's identical
// rule on plannedMonthlyContributionSchema).
const optionalPositiveNumericStringField = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || Number.isFinite(Number(value)), {
    message: "Planned monthly contribution must be a number",
  })
  .refine((value) => !value || Number(value) > 0, {
    message: "Planned monthly contribution must be greater than 0",
  })

export const GoalFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(MAX_NAME_LENGTH, `Name must be ${MAX_NAME_LENGTH} characters or fewer`),
  targetAmount: positiveNumericStringField("Target amount"),
  // Bound to <Input type="date">, whose DOM value is "" (unset) or
  // "yyyy-mm-dd" — passed through as-is to createGoal/updateGoal, which
  // both parse that exact string shape server-side (dateOnlySchema).
  targetDate: z.string().trim().optional(),
  plannedMonthlyContribution: optionalPositiveNumericStringField,
})

export type GoalFormFields = z.infer<typeof GoalFormSchema>

/** `"yyyy-mm-dd"` for a `Date`, using UTC getters — matches this codebase's
 * established UTC-calendar-date convention (see server/service.ts's
 * `formatMonthKey`) so a stored `@db.Date` value never shifts to an
 * adjacent day depending on the browser's local timezone. */
function toDateInputValue(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Omit `goal` for create mode's defaults; pass it (or a `GoalWithProgress`,
 * which extends `Goal`) to prefill edit mode. */
export function defaultValuesFor(goal?: Goal): GoalFormFields {
  if (!goal) {
    return {
      name: "",
      targetAmount: "",
      targetDate: "",
      plannedMonthlyContribution: "",
    }
  }

  return {
    name: goal.name,
    targetAmount: String(goal.targetAmount),
    targetDate: goal.targetDate ? toDateInputValue(goal.targetDate) : "",
    plannedMonthlyContribution:
      goal.plannedMonthlyContribution === null
        ? ""
        : String(goal.plannedMonthlyContribution),
  }
}
