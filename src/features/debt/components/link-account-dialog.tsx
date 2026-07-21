"use client"

/**
 * LinkAccountDialog — lets a user link a Credit Card `Debt` to one of their
 * existing, unlinked Credit Card `Account`s (debt-tracker.md's Account-
 * linkage section, Option C: "an explicit, deliberate action ... to connect
 * the new Debt record to their existing Credit Card Account").
 *
 * `eligibleAccounts` is computed by the caller (app/(dashboard)/debt/page.tsx)
 * from `accounts.service.getAccounts` and every debt's `accountId`, per this
 * feature's read-only scope here — this component never queries anything
 * itself, it only calls the `linkDebtToAccount` Server Action with a
 * selection the caller already validated is eligible.
 *
 * Deliberately a single-purpose dialog, not folded into DebtFormDialog: per
 * `debt-tracker.md`, linking is "a separate, explicit follow-up action ...
 * never bundled into creation," and `linkDebtToAccount` is its own Server
 * Action distinct from `createDebt`/`updateDebt`.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import type { Account } from "@/features/accounts/types"
import { linkDebtToAccount } from "@/features/debt/server/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface LinkAccountDialogProps {
  debtId: string
  debtName: string
  /** Credit Card accounts not already linked to any other debt — see this
   * file's JSDoc for why this is computed by the caller, not here. */
  eligibleAccounts: Account[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LinkAccountDialog({
  debtId,
  debtName,
  eligibleAccounts,
  open,
  onOpenChange,
}: LinkAccountDialogProps) {
  const router = useRouter()
  const [accountId, setAccountId] = useState<string>("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleLink() {
    if (!accountId) return

    setIsSubmitting(true)
    const result = await linkDebtToAccount({ debtId, accountId })
    setIsSubmitting(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success(`${debtName} linked to account`)
    setAccountId("")
    onOpenChange(false)
    // Re-runs the Server Component page's getDebts()/getAccounts() calls —
    // see app/(dashboard)/debt/page.tsx.
    router.refresh()
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setAccountId("")
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link to an existing account</DialogTitle>
          <DialogDescription>
            Once linked, {debtName}&apos;s balance is read live from that
            account instead of being entered here — one number, not two, for
            the same card.
          </DialogDescription>
        </DialogHeader>

        {eligibleAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No unlinked Credit Card accounts are available. Add one on the
            Accounts page first, or keep managing this debt&apos;s balance
            manually here.
          </p>
        ) : (
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a Credit Card account" />
            </SelectTrigger>
            <SelectContent>
              {eligibleAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleLink}
            disabled={!accountId || isSubmitting || eligibleAccounts.length === 0}
          >
            Link account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
