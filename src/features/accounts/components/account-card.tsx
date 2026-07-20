"use client"

/**
 * AccountCard — presents a single financial account (docs/product/
 * accounts.md AC2: name, type, institution, balance, color) plus an actions
 * menu for Edit and Archive/Unarchive.
 *
 * "use client": the actions menu and the Edit dialog it opens both need
 * local state and call Server Actions directly, so this whole card is a
 * Client Component even though it's rendered from a Server Component page
 * (app/(dashboard)/accounts/page.tsx) — Server Components can render Client
 * Components as children, they just can't *be* one themselves.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { MoreHorizontal } from "lucide-react"
import { toast } from "sonner"

import type { Account, AccountType } from "@/features/accounts/types"
import {
  archiveAccount,
  unarchiveAccount,
} from "@/features/accounts/server/actions"
import { AccountFormDialog } from "@/features/accounts/components/account-form"
import { ACCOUNT_TYPE_LABELS } from "@/features/accounts/components/account-form-schema"
import { cn, formatCurrency } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * Per docs/product/accounts.md AC7: Investment/Retirement/Crypto balances
 * are manually entered by the user, not live market data — the card makes
 * that explicit rather than implying a live feed.
 */
const USER_REPORTED_BALANCE_TYPES = new Set<AccountType>([
  "INVESTMENT",
  "RETIREMENT",
  "CRYPTO",
])

export interface AccountCardProps {
  account: Account
}

export function AccountCard({ account }: AccountCardProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [isTogglingArchive, setIsTogglingArchive] = useState(false)

  const isArchived = account.archivedAt !== null
  const isNegative = account.balance < 0

  async function handleArchiveToggle() {
    setIsTogglingArchive(true)
    const action = isArchived ? unarchiveAccount : archiveAccount
    const result = await action({ id: account.id })
    setIsTogglingArchive(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success(isArchived ? "Account restored" : "Account archived")
    // Re-runs the Server Component page's getAccounts() call so both the
    // active and archived lists reflect the new state — see
    // app/(dashboard)/accounts/page.tsx for the fetch this refreshes.
    router.refresh()
  }

  return (
    <>
      <Card className={cn(isArchived && "opacity-75")}>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div className="flex min-w-0 items-start gap-2.5">
            <span
              className="mt-1 size-2.5 shrink-0 rounded-full ring-1 ring-foreground/10"
              style={{ backgroundColor: account.color }}
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-col gap-1">
              <CardTitle className="truncate">{account.name}</CardTitle>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline">
                  {ACCOUNT_TYPE_LABELS[account.type]}
                </Badge>
                {account.institution && (
                  <span className="truncate text-xs text-muted-foreground">
                    {account.institution}
                  </span>
                )}
              </div>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${account.name}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                Edit
              </DropdownMenuItem>
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

        <CardContent className="flex flex-col gap-1">
          <span
            className={cn(
              "font-heading text-2xl font-semibold",
              isNegative ? "text-red-600 dark:text-red-400" : "text-foreground"
            )}
          >
            {formatCurrency(account.balance)}
          </span>
          {USER_REPORTED_BALANCE_TYPES.has(account.type) && (
            <span className="text-xs text-muted-foreground">
              Manually updated balance
            </span>
          )}
        </CardContent>
      </Card>

      <AccountFormDialog
        account={account}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  )
}
