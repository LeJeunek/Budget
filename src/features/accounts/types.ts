import type { Account as PrismaAccount, AccountType } from "@prisma/client"

// Re-export the Prisma-generated enum so consumers of this feature (hooks,
// and later the UI Component Engineer's components) never need to import
// from "@prisma/client" directly — Prisma stays an implementation detail
// behind features/accounts/server, per folder-tree.md's module boundary.
export type { AccountType }

/**
 * Client-safe representation of a financial Account.
 *
 * Prisma's `Decimal` (balance, interestRate) is a decimal.js class instance,
 * not a plain serializable value. Passing it as-is across the Server
 * Component -> Client Component boundary, or through a Server Action's
 * response, is unsafe. `server/service.ts` and `server/actions.ts` always
 * convert Decimal -> number before returning data, so every consumer outside
 * `features/accounts/server` works with this plain-number shape instead of
 * the raw Prisma type.
 *
 * Balance sign convention (see docs/product/accounts.md, binding for every
 * downstream calculation including the Dashboard's Net Worth aggregation):
 *   - CHECKING, SAVINGS, CASH, INVESTMENT, RETIREMENT, CRYPTO: `balance` is
 *     an asset, stored/displayed as a positive value (negative allowed only
 *     as a real overdraft, e.g. Checking — never blocked by validation).
 *   - CREDIT_CARD: `balance` is a positive value representing debt/liability
 *     — downstream aggregations (e.g. Net Worth) are responsible for
 *     subtracting it, not this type or the validation layer.
 * This type only describes the shape; see server/validation.ts for the
 * enforcement of the "well-formed currency value" rules (precision, range)
 * and docs/product/accounts.md for the full sign convention.
 */
export type Account = Omit<PrismaAccount, "balance" | "interestRate"> & {
  balance: number
  interestRate: number | null
}

/**
 * Options for `service.getAccounts`.
 *
 * Per docs/product/accounts.md acceptance criteria 2 and 5, the product has
 * exactly two distinct account list views — the default active list and a
 * separate archived-accounts view — not a combined "everything" view. This
 * flag switches between those two, it does not union them:
 *   - `includeArchived` false/omitted (default): only non-archived accounts
 *     (`archivedAt: null`) — the default account list (AC2).
 *   - `includeArchived` true: only archived accounts (`archivedAt` set) —
 *     the dedicated "view archived accounts separately" list (AC5).
 */
export interface GetAccountsOptions {
  includeArchived?: boolean
}
