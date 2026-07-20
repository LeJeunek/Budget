/**
 * Validation schema and default-values helper for account-form.tsx, split
 * into its own module so the component file (rendering + submit wiring)
 * stays under the company's ~300-line-per-file guideline. Not a new shared
 * `components/ui`/`components/shared` primitive — this is private to the
 * Accounts feature's form and only imported by account-form.tsx.
 *
 * The schema is a client-side copy of the rules already enforced by
 * features/accounts/server/validation.ts (CreateAccountSchema/
 * UpdateAccountSchema) — kept here, not imported, for the same reason
 * app/(auth)/login/page.tsx defines its own schemas: fast client feedback
 * only, the Server Action re-validates independently and is the real
 * source of truth.
 */

import { z } from "zod"

import type { Account, AccountType } from "@/features/accounts/types"

/**
 * Human-readable labels for `AccountType` — the raw Prisma enum
 * (e.g. "CREDIT_CARD") is never shown directly to the user. Lives here
 * (not in account-card.tsx, where it originally lived) because account-
 * card.tsx also imports `AccountFormDialog` from account-form.tsx, which in
 * turn needs this constant: keeping it there created a real circular import
 * (account-card -> account-form -> account-card) that worked fine in dev
 * but crashed Vercel's production Turbopack build with a TDZ
 * `ReferenceError: Cannot access 'G' before initialization` — dev's bundler
 * tolerates the cycle via lazy live bindings, production's concatenated
 * chunk does not. This file has no dependents among the three, so both
 * account-card.tsx and account-form.tsx can import it one-way instead.
 */
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CHECKING: "Checking",
  SAVINGS: "Savings",
  CREDIT_CARD: "Credit Card",
  CASH: "Cash",
  INVESTMENT: "Investment",
  RETIREMENT: "Retirement",
  CRYPTO: "Crypto",
}

// Matches the Prisma column default (see prisma/schema.prisma's Account.color
// and server/validation.ts's DEFAULT_ACCOUNT_COLOR) so a brand-new account
// created without touching the color picker lands on the same default the
// backend would apply anyway.
export const DEFAULT_ACCOUNT_COLOR = "#6366f1"

export const ACCOUNT_TYPE_VALUES = Object.keys(ACCOUNT_TYPE_LABELS) as [
  AccountType,
  ...AccountType[],
]

// Per docs/product/accounts.md AC1: "Interest Rate ... only meaningful for
// interest-bearing types such as Savings, Credit Card, Retirement." Hiding
// the field for other types (see account-form.tsx) avoids asking for a
// number that doesn't apply.
export const INTEREST_BEARING_TYPES = new Set<AccountType>([
  "SAVINGS",
  "CREDIT_CARD",
  "RETIREMENT",
])

// Both money fields are bound to <Input type="number"> controls, whose DOM
// value is always a string — RHF's `field.value` mirrors that, so both stay
// `z.string()` here (validated, not `.transform()`ed to a number). shadcn's
// `FormField`/`FormControl` are built on RHF's `Controller`, whose typing
// doesn't propagate a Zod `.transform()`'s separate "output" type through
// `control` — mixing transforms into a Controller-driven form breaks
// zodResolver's generic inference in practice, so the string -> number
// conversion instead happens explicitly in account-form.tsx's `onSubmit`,
// once, after validation has already confirmed each string is well-formed.
const numericStringField = (label: string) =>
  z
    .string()
    .trim()
    .refine((value) => value !== "" && Number.isFinite(Number(value)), {
      message: `${label} must be a number`,
    })

// Per docs/product/accounts.md AC1, interest rate is optional — an empty
// input is valid (means "no rate"); anything non-empty must be a
// well-formed number in the 0-100 range.
const interestRateFieldSchema = z
  .string()
  .trim()
  .optional()
  .refine(
    (value) => !value || Number.isFinite(Number(value)),
    "Interest rate must be a number"
  )
  .refine((value) => !value || Number(value) >= 0, {
    message: "Interest rate cannot be negative",
  })
  .refine((value) => !value || Number(value) <= 100, {
    message: "Interest rate must be 100 or less — enter 4.25, not 425",
  })

export const AccountFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(120, "Name must be 120 characters or fewer"),
  type: z.enum(ACCOUNT_TYPE_VALUES, {
    error: "Select an account type",
  }),
  institution: z
    .string()
    .trim()
    .max(120, "Institution must be 120 characters or fewer")
    .optional(),
  balance: numericStringField("Balance"),
  interestRate: interestRateFieldSchema,
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a 6-digit hex value"),
})

export type AccountFormFields = z.infer<typeof AccountFormSchema>

/** Omit `account` for create mode's defaults; pass it to prefill edit mode. */
export function defaultValuesFor(account?: Account): AccountFormFields {
  if (!account) {
    return {
      name: "",
      type: "CHECKING",
      institution: "",
      balance: "0",
      interestRate: "",
      color: DEFAULT_ACCOUNT_COLOR,
    }
  }

  return {
    name: account.name,
    type: account.type,
    institution: account.institution ?? "",
    balance: String(account.balance),
    interestRate:
      account.interestRate === null ? "" : String(account.interestRate),
    color: account.color,
  }
}
