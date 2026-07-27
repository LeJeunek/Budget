"use server"

import { getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { ok, fail, type ApiResult } from "@/lib/api-response"
import type { AccountType } from "@/features/accounts/types"
import { AccountBalanceReconciliationSchema } from "@/features/transactions/server/validation"
import { EXCLUDE_SPLIT_PARENTS } from "@/features/transactions/server/service"
import {
  isBalanceAdjustableAccountType,
  computeAggregateBalanceDelta,
} from "@/features/transactions/server/balance-adjustment"

/**
 * One-time historical reconciliation READ path for Account Balance
 * Auto-Adjustment (docs/product/accounts-balance-auto-adjustment.md's
 * "Historical Data Reconciliation" section, Criterion 8).
 *
 * WHY this file is separate from `server/actions.ts`: that file already
 * covers create/edit/delete/split, which is the feature's ongoing,
 * every-transaction behavior (Criteria 1-7); this file is the feature's
 * one-time, ship-day-only concern (Criterion 8) — a single read-only Server
 * Action with no relationship to the mutation paths above beyond sharing
 * `balance-adjustment.ts`'s sign-convention math. Keeping it in its own
 * (small, single-responsibility) file avoids growing `actions.ts` further
 * for a concern that is conceptually a one-time migration aid, not a
 * standing part of the transaction-mutation surface.
 *
 * Kept deliberately as a **read**, not a write: per the spec's own decision
 * ("a silent backfill is its own serious risk... the recomputed figure
 * [must be] presented to the user for confirmation rather than silently
 * overwritten"), this action only ever computes and returns a comparison —
 * it never itself calls `db.account.update`. A user who wants to apply the
 * suggested figure does so via the ALREADY-EXISTING manual balance-edit path
 * (`features/accounts/server/actions.ts`'s `updateAccount`, Criterion 7),
 * exactly as the spec recommends ("this also reuses the same 'manual
 * balance edit' pathway... it requires no new UI primitive, only a one-time
 * prompt built on top of it"). See this repository's dispatch report for
 * why the confirm/decline PROMPT ITSELF (the UI half of Criterion 8) is
 * flagged as a Frontend Lead follow-up rather than built here — this
 * Backend Engineer role never writes UI.
 */

/** The comparison this feature's one-time reconciliation prompt needs per
 * account: what's stored today vs. what the account's own transaction
 * history says it should be, computed the exact same way ongoing
 * create/edit/delete/split adjustments would have gotten it to if this
 * feature had existed from day one. */
export interface AccountBalanceReconciliationPreview {
  accountId: string
  accountType: AccountType
  /** The account's current, stored `Account.balance`. */
  storedBalance: number
  /** Sum of every non-split-parent transaction's signed effect against this
   * account (Criterion 4's "split parent's amount is purely informational"
   * rule applied here too, via `EXCLUDE_SPLIT_PARENTS` — a parent's
   * inflated/duplicated `amount` must not be double-counted alongside its
   * own children's amounts). */
  transactionDerivedBalance: number
  /** `transactionDerivedBalance - storedBalance`, rounded to cents — the
   * number the UI's prompt would show as "this would change by $X." Zero
   * means the account is already fully reconciled and no prompt is needed. */
  difference: number
  /** How many transactions fed into `transactionDerivedBalance` — lets the
   * UI show e.g. "based on 214 transactions" for context/trust. */
  transactionCount: number
}

/**
 * Computes the one-time reconciliation comparison for a single account.
 *
 * Fails with a clear message (rather than silently returning zeros) for an
 * Investment/Retirement/Crypto account — Criterion 6's guard applies here
 * too: this feature has no business computing a "transaction-derived
 * balance" for an account type whose balance is exclusively Investments'
 * concern, even as a read-only preview.
 */
export async function getAccountBalanceReconciliationPreview(
  input: unknown,
): Promise<ApiResult<AccountBalanceReconciliationPreview>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = AccountBalanceReconciliationSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid account id")
  }
  const { accountId } = parsed.data

  const account = await db.account.findFirst({
    where: { id: accountId, userId: user.id },
  })
  if (!account) {
    return fail("Account not found")
  }

  if (!isBalanceAdjustableAccountType(account.type)) {
    return fail(
      "This account's balance is not derived from transaction history",
    )
  }

  const transactions = await db.transaction.findMany({
    where: { userId: user.id, accountId, ...EXCLUDE_SPLIT_PARENTS },
    select: { amount: true },
  })

  const amounts = transactions.map((transaction) => transaction.amount.toNumber())
  const transactionDerivedBalance = computeAggregateBalanceDelta(account.type, amounts)
  const storedBalance = account.balance.toNumber()

  return ok({
    accountId,
    accountType: account.type,
    storedBalance,
    transactionDerivedBalance,
    difference: Math.round((transactionDerivedBalance - storedBalance) * 100) / 100,
    transactionCount: transactions.length,
  })
}
