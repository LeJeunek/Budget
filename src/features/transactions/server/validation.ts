import { z } from "zod"

/**
 * Zod schemas for the Transactions module's server boundary (the `GET
 * /api/transactions` Route Handler's query params, and every Server Action's
 * input), per docs/architecture/api-contracts.md's Transactions section and
 * naming-standards.md's Zod schema conventions (PascalCase + "Schema").
 */

// ---------------------------------------------------------------------------
// Shared constants / helpers
// ---------------------------------------------------------------------------

// Matches the DB column precision (`prisma/schema.prisma`: Transaction.amount
// is `Decimal(14, 2)`, the same precision as Account.balance) — 14 total
// digits, 2 of them fractional, so the largest representable magnitude is
// 999,999,999,999.99. Validating this here (per docs/product/transactions.md
// edge case "Very large individual amounts ... validated against supported
// monetary precision, same as Accounts") gives a clear 4xx error instead of
// letting Postgres reject an out-of-range value with an opaque database
// error.
const MAX_TRANSACTION_AMOUNT_ABS = 999_999_999_999.99

const MERCHANT_MAX_LENGTH = 200
const NOTES_MAX_LENGTH = 1000
const TAG_NAME_MAX_LENGTH = 50
// Defensive cap, not a spec requirement: prevents a single request from
// creating an unbounded number of Tag rows / TransactionTag join rows.
const MAX_TAGS_PER_TRANSACTION = 20

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 25
// Keeps a single page's payload bounded regardless of what a client requests
// — required by docs/product/transactions.md's "remains fast and usable as a
// user's transaction history grows into the thousands of rows" acceptance
// criterion; an unbounded pageSize would let a client defeat pagination
// entirely by requesting everything in one call.
const MAX_PAGE_SIZE = 100

/**
 * Guards against floating-point noise (e.g. 19.999999999999996 from a form
 * input) while still rejecting genuinely over-precise values like 19.999.
 * This is the exact same technique as
 * `features/accounts/server/validation.ts`'s `hasAtMostTwoDecimalPlaces` —
 * duplicated here rather than imported per folder-tree.md's module boundary
 * (features/<domain>/server is not a shared import target across domains);
 * if this logic ever needs to change, update both copies.
 */
function hasAtMostTwoDecimalPlaces(value: number): boolean {
  const cents = value * 100
  return Math.abs(Math.round(cents) - cents) < 1e-6
}

/** Reused by `amountSchema` below and by `server/import.ts` for validating
 * parsed CSV amount values — both need the identical "well-formed currency
 * number" shape check, so it is defined once here and exported rather than
 * re-implemented per caller. */
export const amountSchema = z
  .number({ error: "Amount must be a number" })
  .finite("Amount must be a finite number")
  .refine(hasAtMostTwoDecimalPlaces, {
    message: "Amount supports at most 2 decimal places",
  })
  .refine((value) => Math.abs(value) <= MAX_TRANSACTION_AMOUNT_ABS, {
    message: `Amount must be no larger than ${MAX_TRANSACTION_AMOUNT_ABS.toLocaleString("en-US")} in magnitude`,
  })
// NOTE: zero is intentionally allowed here (e.g. a wash/adjustment entry) —
// `SplitTransactionSchema` below adds its own `!== 0` refinement for split
// line items specifically, since an individual split allocation of $0 would
// be meaningless.

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Builds a UTC-midnight `Date` from a `"yyyy-mm-dd"` string by constructing
 * it with an explicit `T00:00:00.000Z` suffix, rather than relying on the
 * date-only-string UTC-parsing behavior of `new Date(dateOnlyString)` alone —
 * being explicit here means this still produces the correct UTC midnight
 * even if a caller's `dateOnlySchema` regex is ever loosened to accept a
 * fuller ISO string. Matches `Transaction.date`'s `@db.Date` column and the
 * UTC-calendar-date convention documented on
 * `features/dashboard/server/service.ts`'s `utcMonthStart`. */
function toUtcDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

/** Reused by `server/import.ts` for validating a normalized CSV date string
 * before parsing it into a `Date`. */
export const dateOnlySchema = z
  .string()
  .regex(DATE_ONLY_PATTERN, "Date must be in YYYY-MM-DD format")
  .transform(toUtcDateOnly)

/** Treats an empty-string form/query value the same as an omitted field —
 * used for every optional string field below so a blank input never fails
 * validation with a confusing "too short" message. Mirrors
 * `features/accounts/server/validation.ts`'s `institutionSchema` pattern. */
function emptyToUndefined(value: unknown): unknown {
  return value === "" ? undefined : value
}

const optionalDateOnlySchema = z.preprocess(
  emptyToUndefined,
  dateOnlySchema.optional(),
)

/** Reused by `server/import.ts` for validating a parsed CSV merchant cell. */
export const merchantSchema = z
  .string()
  .trim()
  .min(1, "Merchant is required")
  .max(
    MERCHANT_MAX_LENGTH,
    `Merchant must be ${MERCHANT_MAX_LENGTH} characters or fewer`,
  )

/**
 * Notes field that distinguishes "leave unchanged" from "explicitly clear" on
 * update, per docs/product/transactions.md AC9 ("adding/removing notes").
 * `undefined` (key omitted from the input entirely) means leave unchanged;
 * an empty-string input (the user cleared the notes textarea) is normalized
 * to `null` — an explicit clear — rather than to `undefined`, since
 * `emptyToUndefined` would make clearing notes indistinguishable from not
 * touching them at all. Reused as-is for `CreateTransactionSchema`, where
 * `null`/`undefined` both correctly mean "no notes yet".
 */
const notesSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  z
    .string()
    .trim()
    .max(NOTES_MAX_LENGTH, `Notes must be ${NOTES_MAX_LENGTH} characters or fewer`)
    .nullable()
    .optional(),
)

/**
 * Category field with the same "leave unchanged vs. explicitly clear"
 * semantics as `notesSchema` above — an empty-string input (the "no
 * category" option in a select) is normalized to `null`, which
 * `server/actions.ts` treats as "reassign to Uncategorized" on update and as
 * "create with no category" on create. `undefined` (omitted) means leave
 * unchanged on update.
 */
const categoryIdSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  z.string().min(1, "Invalid category id").nullable().optional(),
)

// ---------------------------------------------------------------------------
// Public schemas — see docs/architecture/api-contracts.md's Transactions
// section for the required names/shapes.
// ---------------------------------------------------------------------------

/**
 * `createTransaction` input. `accountId` is required (a transaction cannot
 * exist without an account); `categoryId`/`notes` are optional. Whether the
 * target account belongs to the caller and is not archived is *not*
 * checkable here (Zod has no DB access) — that check happens in
 * `server/actions.ts` per docs/product/accounts.md's "Attempting to log a new
 * transaction against an archived account: must be blocked" edge case.
 */
export const CreateTransactionSchema = z.object({
  date: dateOnlySchema,
  merchant: merchantSchema,
  amount: amountSchema,
  accountId: z.string().min(1, "Account is required"),
  categoryId: categoryIdSchema,
  notes: notesSchema,
})

export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>

/**
 * `updateTransaction` input. Every field besides `id` is optional so callers
 * can patch a single field (e.g. just re-categorizing) — only fields present
 * in the parsed input are written by `server/actions.ts`, following the same
 * "undefined fields are excluded from `data`" convention as
 * `features/accounts/server/actions.ts`'s `updateAccount`.
 *
 * `tags` is a full-replacement list (the complete set of tag names the
 * transaction should have after this update), not an add/remove diff — this
 * matches how a multi-select tag input naturally reports its state and keeps
 * the operation idempotent. A tag name with no existing case-insensitive
 * match for this user is auto-created, per docs/product/transactions.md AC11
 * ("a tag typed for the first time is created automatically") — see
 * `server/actions.ts`'s `resolveTagIds`.
 */
export const UpdateTransactionSchema = z.object({
  id: z.string().min(1, "Transaction id is required"),
  date: dateOnlySchema.optional(),
  merchant: merchantSchema.optional(),
  amount: amountSchema.optional(),
  accountId: z.string().min(1, "Account is required").optional(),
  categoryId: categoryIdSchema,
  notes: notesSchema,
  tags: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Tag cannot be empty")
        .max(TAG_NAME_MAX_LENGTH, `Tags must be ${TAG_NAME_MAX_LENGTH} characters or fewer`),
    )
    .max(MAX_TAGS_PER_TRANSACTION, `A transaction supports at most ${MAX_TAGS_PER_TRANSACTION} tags`)
    .optional(),
})

export type UpdateTransactionInput = z.infer<typeof UpdateTransactionSchema>

/** `deleteTransaction` input. */
export const TransactionIdSchema = z.object({
  id: z.string().min(1, "Transaction id is required"),
})

export type TransactionIdInput = z.infer<typeof TransactionIdSchema>

/**
 * One allocation in a `splitTransaction` call. `categoryId` is required
 * (unlike the base `categoryIdSchema` above) — per
 * docs/product/transactions.md AC13/14, the entire point of splitting is to
 * assign each portion its own category, so an "Uncategorized" split line
 * item would defeat the feature's purpose. `amount` must be non-zero — a $0
 * allocation is not a meaningful split.
 */
const splitEntrySchema = z.object({
  categoryId: z.string().min(1, "Each split requires a category"),
  amount: amountSchema.refine((value) => value !== 0, {
    message: "Split amount cannot be zero",
  }),
})

/**
 * `splitTransaction` input. `splits` requires at least 2 entries (AC13: "two
 * or more category allocations"). The sum-must-match-exactly rule
 * (AC13/edge case "Split remainder/rounding") is *not* enforced here — it
 * requires the original transaction's amount, which Zod cannot look up; see
 * `server/actions.ts`'s `splitTransaction` for the exact-cents comparison.
 */
export const SplitTransactionSchema = z.object({
  id: z.string().min(1, "Transaction id is required"),
  splits: z
    .array(splitEntrySchema)
    .min(2, "A split requires at least 2 category allocations"),
})

export type SplitTransactionInput = z.infer<typeof SplitTransactionSchema>

// AC2: "A user can sort the table by date, amount, merchant, or category."
// Added 2026-07-19 along with the matching api-contracts.md update — the
// implementing agent correctly declined to guess at a query-param shape the
// contract hadn't specified yet and flagged the gap instead of extending the
// contract unilaterally.
const SORT_FIELDS = ["date", "amount", "merchant", "category"] as const
export type TransactionSortField = (typeof SORT_FIELDS)[number]
const DEFAULT_SORT_BY: TransactionSortField = "date"
const DEFAULT_SORT_DIR = "desc"

/**
 * `GET /api/transactions` query params, per
 * docs/architecture/api-contracts.md's Transactions "List" row:
 * `?page=&pageSize=&accountId=&categoryId=&search=&dateFrom=&dateTo=&sortBy=&sortDir=`.
 *
 * `categoryId` accepts the `UNCATEGORIZED_CATEGORY_ID` sentinel from
 * `features/dashboard/types.ts` (re-exported by `../types.ts`) in addition to
 * real category ids — `server/service.ts`'s `listTransactions` is what
 * interprets that sentinel as `{ categoryId: null }`; this schema only checks
 * it is a non-empty string, since Zod has no way to also validate it against
 * the sentinel *or* a real id without a DB round-trip.
 *
 * All fields arrive as strings (URL search params / a plain object built from
 * them), hence `z.coerce.number()` for `page`/`pageSize`.
 */
export const TransactionFilterSchema = z.object({
  page: z.coerce
    .number({ error: "Page must be a number" })
    .int("Page must be a whole number")
    .min(1, "Page must be at least 1")
    .optional()
    .default(DEFAULT_PAGE),
  pageSize: z.coerce
    .number({ error: "Page size must be a number" })
    .int("Page size must be a whole number")
    .min(1, "Page size must be at least 1")
    .max(MAX_PAGE_SIZE, `Page size must be ${MAX_PAGE_SIZE} or fewer`)
    .optional()
    .default(DEFAULT_PAGE_SIZE),
  accountId: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  categoryId: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  search: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(200).optional(),
  ),
  dateFrom: optionalDateOnlySchema,
  dateTo: optionalDateOnlySchema,
  sortBy: z.preprocess(
    emptyToUndefined,
    z.enum(SORT_FIELDS).optional().default(DEFAULT_SORT_BY),
  ),
  sortDir: z.preprocess(
    emptyToUndefined,
    z.enum(["asc", "desc"]).optional().default(DEFAULT_SORT_DIR),
  ),
})

export type TransactionFilterInput = z.infer<typeof TransactionFilterSchema>
