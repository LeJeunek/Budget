"use client"

/**
 * DebtCard — presents a single debt (docs/product/debt-tracker.md AC2/AC4/
 * AC5: name, type, balance, interest rate, minimum payment, payoff date,
 * total interest remaining) plus an actions menu for Edit, Archive/
 * Unarchive, and (Credit Card debts only) Link/Unlink an Account. Mirrors
 * `features/accounts/components/account-card.tsx`'s structure (Card +
 * DropdownMenu actions + a controlled edit dialog) exactly.
 *
 * "use client": the actions menu and the dialogs it opens both need local
 * state and call Server Actions directly, so this whole card is a Client
 * Component even though it's rendered from a Server Component page
 * (app/(dashboard)/debt/page.tsx) — Server Components can render Client
 * Components as children, they just can't *be* one themselves.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { MoreHorizontal } from "lucide-react"
import { toast } from "sonner"

import type { Account } from "@/features/accounts/types"
import type { DebtWithProjection } from "@/features/debt/types"
import {
  archiveDebt,
  unarchiveDebt,
  unlinkDebtFromAccount,
} from "@/features/debt/server/actions"
import { DEBT_TYPE_LABELS } from "@/features/debt/components/debt-form-schema"
import { DebtFormDialog } from "@/features/debt/components/debt-form"
import { LinkAccountDialog } from "@/features/debt/components/link-account-dialog"
import { cn, formatCurrency } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/** `"yyyy-MM"` -> `"August 2026"`, for `payoffDate` (AC4: "month/year debt
 * reaches $0"). Built from UTC parts, matching the key `payoff-math.ts`'s
 * `formatYearMonth` produces — duplicated per-feature the same way
 * `goal-card.tsx`'s own `formatMonthLabel` is (folder-tree.md's module
 * boundary rule: `features/<domain>/components` isn't a shared import
 * target across domains). */
function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, 1))
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}

export interface DebtCardProps {
  debt: DebtWithProjection
  /** Credit Card accounts not already linked to any other debt — passed
   * through from the page for the Link dialog; ignored for non-Credit-Card
   * debts. */
  eligibleAccounts: Account[]
}

export function DebtCard({ debt, eligibleAccounts }: DebtCardProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [isTogglingArchive, setIsTogglingArchive] = useState(false)
  const [isUnlinking, setIsUnlinking] = useState(false)

  const isArchived = debt.archivedAt !== null
  const isLinked = debt.accountId !== null
  const canLink = debt.type === "CREDIT_CARD"

  async function handleArchiveToggle() {
    setIsTogglingArchive(true)
    const action = isArchived ? unarchiveDebt : archiveDebt
    const result = await action({ id: debt.id })
    setIsTogglingArchive(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success(isArchived ? "Debt restored" : "Debt archived")
    // Re-runs the Server Component page's getDebts() calls so both the
    // active and archived lists reflect the new state — see
    // app/(dashboard)/debt/page.tsx.
    router.refresh()
  }

  async function handleUnlink() {
    setIsUnlinking(true)
    const result = await unlinkDebtFromAccount({ debtId: debt.id })
    setIsUnlinking(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success("Debt unlinked from account")
    router.refresh()
  }

  return (
    <>
      <Card className={cn(isArchived && "opacity-75")}>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle className="truncate">{debt.name}</CardTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{DEBT_TYPE_LABELS[debt.type]}</Badge>
              {debt.isPaidOff && <Badge>Paid Off</Badge>}
              {isLinked && <Badge variant="secondary">Linked to account</Badge>}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${debt.name}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                Edit
              </DropdownMenuItem>
              {canLink && !isLinked && (
                <DropdownMenuItem onSelect={() => setLinkOpen(true)}>
                  Link to account
                </DropdownMenuItem>
              )}
              {canLink && isLinked && (
                <DropdownMenuItem disabled={isUnlinking} onSelect={handleUnlink}>
                  Unlink from account
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                variant={isArchived ? "default" : "destructive"}
                disabled={isTogglingArchive}
                onSelect={handleArchiveToggle}
              >
                {isArchived ? "Unarchive" : "Archive"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="font-heading text-2xl font-semibold text-foreground">
              {formatCurrency(debt.effectiveBalance)}
            </span>
            <span className="text-xs text-muted-foreground">
              {debt.interestRate}% APR &middot; {formatCurrency(debt.minimumPayment)}
              /mo minimum
            </span>
          </div>

          {debt.isPaidOff ? (
            <p className="text-xs text-muted-foreground">
              This debt is paid off.
            </p>
          ) : debt.isNegativeAmortization ? (
            <Badge variant="destructive" className="w-fit">
              Won&apos;t pay off at the current minimum payment
            </Badge>
          ) : (
            <div className="flex flex-col gap-0.5">
              <p className="text-sm text-foreground">
                Payoff date:{" "}
                <span className="font-medium">
                  {debt.payoffDate ? formatMonthLabel(debt.payoffDate) : "—"}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(debt.totalInterestRemaining ?? 0)} total interest
                remaining at minimum payment
              </p>
              {debt.isEstimate && (
                <p className="text-xs text-muted-foreground">
                  Estimate assumes no new purchases are added.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <DebtFormDialog debt={debt} open={editOpen} onOpenChange={setEditOpen} />
      {canLink && (
        <LinkAccountDialog
          debtId={debt.id}
          debtName={debt.name}
          eligibleAccounts={eligibleAccounts}
          open={linkOpen}
          onOpenChange={setLinkOpen}
        />
      )}
    </>
  )
}
