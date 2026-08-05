import type { Account } from "@/features/accounts/types"
import type { DebtWithProjection } from "@/features/debt/types"
import type { NetWorth, NetWorthByAccount } from "@/features/dashboard/types"

/**
 * Mirrors `features/dashboard/server/service.ts`'s `getNetWorth` formula
 * exactly: every non-archived account's balance, signed (`CREDIT_CARD`
 * negated, per `docs/product/accounts.md`'s convention), minus the Net Worth
 * liability term contributed by active debts *not* linked to an Account
 * (`features/debt/server/service.ts`'s
 * `getTotalActiveDebtBalanceForNetWorth` — reimplemented below since that
 * file lives under `features/debt/server/`, blocked by
 * public-demo-technical-design.md §4.1's `no-restricted-imports` rule).
 * `total = totalAccountBalance - totalUnlinkedDebtLiability`.
 *
 * The only two inputs are already-resolved `accounts`/`debts` arrays (no
 * `now` needed — this is a pure point-in-time snapshot), so
 * `derive/net-worth-history.ts` and `financial-goals.ts` can both call this
 * with the household's current accounts/debts to get the exact same "today"
 * figure Dashboard's own Net Worth stat card and Accounts' balance list
 * agree on — the "computed by the same function over the same input"
 * guarantee public-demo-technical-design.md §2.1 requires.
 */
export function deriveNetWorth(accounts: Account[], debts: DebtWithProjection[]): NetWorth {
  const activeAccounts = accounts.filter((account) => account.archivedAt === null)

  const byAccount: NetWorthByAccount[] = activeAccounts.map((account) => ({
    accountId: account.id,
    balance: account.type === "CREDIT_CARD" ? -account.balance : account.balance,
  }))

  const totalAccountBalance = byAccount.reduce((sum, entry) => sum + entry.balance, 0)

  const totalUnlinkedDebtLiability = debts
    .filter((debt) => debt.archivedAt === null && debt.accountId === null && debt.balance > 0)
    .reduce((sum, debt) => sum + debt.balance, 0)

  return {
    total: totalAccountBalance - totalUnlinkedDebtLiability,
    byAccount,
    totalUnlinkedDebtLiability,
  }
}
