"use client"

/**
 * ReconciliationPrompt — the one-time, per-account "historical data
 * reconciliation" prompt called for by docs/product/
 * accounts-balance-auto-adjustment.md's "Historical Data Reconciliation —
 * Recommendation" section (Acceptance Criterion 8): "the recomputed figure
 * [must be] presented to the user for confirmation rather than silently
 * overwritten" — "Based on your transaction history, this account's balance
 * would be $X, currently showing $Y — apply this correction?"
 *
 * Rendered by `AccountCard` for every account (see that file); this
 * component itself decides whether it has anything to show and renders
 * `null` otherwise, so `AccountCard` doesn't need to duplicate the
 * eligibility logic below.
 *
 * Data source: `getAccountBalanceReconciliationPreview` (`features/
 * transactions/server/reconciliation-actions.ts`), a read-only Server Action
 * — called directly here via TanStack Query's `queryFn`, the same
 * "Server-Action-as-data-source" pattern `features/transactions/hooks/
 * use-transactions.ts`'s mutation hooks already establish for this codebase
 * (see that file's `unwrap` helper, mirrored below).
 *
 * Applying an accepted correction reuses the EXISTING manual balance-edit
 * Server Action (`features/accounts/server/actions.ts`'s `updateAccount`) —
 * per the spec's explicit instruction, this component must never introduce a
 * new write path for `Account.balance`.
 *
 * One-time-ness (Criterion 8's "once a user has accepted or declined... that
 * account behaves purely per Criteria 1-7 from that point forward with no
 * further special-cased backfill logic"): there is no `Account` column for
 * "reconciliation prompt dismissed" (out of this role's scope to add one —
 * a schema change belongs to the Database Architect/Backend Engineer, and the
 * spec itself frames this as a one-time, ship-day-only concern rather than
 * standing product behavior worth a migration). Accepting resolves itself
 * with no extra bookkeeping: applying the correction makes `difference`
 * become `0` on the next preview read, so the prompt simply stops matching
 * its own render condition. Declining has no natural "resolved" signal to
 * key off of, so it needs SOME persistence or it would nag on every reload.
 * A `localStorage` key per account id is the chosen mechanism: it is
 * client-only (no migration/schema change), scoped per browser/device (an
 * acceptable tradeoff for a ship-day-only, low-stakes display preference —
 * the user can still apply the correction manually via Criterion 7's
 * existing account-edit path at any time regardless of this flag), and fails
 * open (a user in a fresh browser/profile sees the prompt again rather than
 * a correction silently never being offered).
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import type { Account } from "@/features/accounts/types"
import { updateAccount } from "@/features/accounts/server/actions"
import { isBalanceAdjustableAccountType } from "@/features/transactions/server/balance-adjustment"
import { getAccountBalanceReconciliationPreview } from "@/features/transactions/server/reconciliation-actions"
import { Button } from "@/components/ui/button"
import { useFormatCurrency } from "@/app/(dashboard)/currency-preference-provider"

const DISMISSED_KEY_PREFIX = "financeos:reconciliation-dismissed:"

function dismissedStorageKey(accountId: string): string {
  return `${DISMISSED_KEY_PREFIX}${accountId}`
}

/**
 * Reads/writes the dismissal flag defensively: some browser configurations
 * (e.g. Safari private browsing, a locked-down `localStorage` quota) throw on
 * access rather than simply being unavailable. This is a display preference,
 * not money-correctness logic — failing open (never persistently dismissed)
 * is the right failure mode, never crashing the Accounts page over it.
 */
function readDismissed(accountId: string): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(dismissedStorageKey(accountId)) === "1"
  } catch {
    return false
  }
}

function writeDismissed(accountId: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(dismissedStorageKey(accountId), "1")
  } catch {
    // Best-effort only — see readDismissed.
  }
}

export interface ReconciliationPromptProps {
  account: Account
}

export function ReconciliationPrompt({ account }: ReconciliationPromptProps) {
  const formatCurrency = useFormatCurrency()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isApplying, setIsApplying] = useState(false)

  // Checked in an effect (not a `useState` lazy initializer) so the first
  // client render matches the server-rendered markup (`window` doesn't exist
  // during SSR) — reading synchronously here would produce a hydration
  // mismatch whenever a dismissal is already recorded.
  const [dismissalChecked, setDismissalChecked] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setDismissed(readDismissed(account.id))
    setDismissalChecked(true)
  }, [account.id])

  // Mirrors this feature's own server-side guard exactly (Criterion 6 /
  // `isBalanceAdjustableAccountType`) plus the spec's "non-archived" scoping
  // for this prompt specifically — an archived account isn't shown on the
  // Active tab a user is reconciling from, and reopening old history for an
  // account the user has already put away would be surprising.
  const eligible =
    account.archivedAt === null && isBalanceAdjustableAccountType(account.type)

  const queryKey = ["accounts", "reconciliation-preview", account.id] as const

  const { data } = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await getAccountBalanceReconciliationPreview({
        accountId: account.id,
      })
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    // Only fetched once eligibility AND the one-time dismissal check have
    // both resolved — avoids a wasted read for an out-of-scope account type
    // and avoids fetching (then immediately discarding) a preview for an
    // account the user already declined on this device.
    enabled: eligible && dismissalChecked && !dismissed,
  })

  if (!eligible || !dismissalChecked || dismissed || !data || data.difference === 0) {
    return null
  }

  async function handleAccept() {
    setIsApplying(true)
    try {
      // Reuses the EXISTING manual balance-edit Server Action — see this
      // file's top-level doc comment for why no new write path is introduced
      // here.
      const result = await updateAccount({
        id: account.id,
        balance: data!.transactionDerivedBalance,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Balance updated from transaction history.")
      // Re-runs app/(dashboard)/accounts/page.tsx's getAccounts() call, which
      // is what feeds this component's own `account` prop a fresh
      // `storedBalance` — the next `getAccountBalanceReconciliationPreview`
      // read (triggered by the invalidation below) then sees `difference ===
      // 0` and this component naturally stops rendering; no dismissal
      // bookkeeping is needed for the accept path.
      queryClient.invalidateQueries({ queryKey })
      router.refresh()
    } finally {
      setIsApplying(false)
    }
  }

  function handleDecline() {
    writeDismissed(account.id)
    setDismissed(true)
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-amber-500/50 bg-amber-500/10 px-3 py-2.5 text-sm dark:border-amber-400/40 dark:bg-amber-400/10">
      <p className="text-foreground">
        Based on your transaction history, this account&apos;s balance would
        be{" "}
        <span className="font-medium">
          {formatCurrency(data.transactionDerivedBalance)}
        </span>
        , currently showing {formatCurrency(data.storedBalance)} — apply this
        correction?
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={handleAccept}
          disabled={isApplying}
        >
          Apply correction
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleDecline}
          disabled={isApplying}
        >
          Not now
        </Button>
      </div>
    </div>
  )
}
