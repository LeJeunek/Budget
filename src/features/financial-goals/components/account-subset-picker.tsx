"use client"

/**
 * AccountSubsetPicker — the Account-multi-select control used by
 * `net-worth-savings-goal-form.tsx`'s `ACCOUNT_SUBSET` measurement basis.
 * Split into its own file purely for size discipline (keeping
 * `net-worth-savings-goal-form.tsx` under the company's ~300-line-per-file
 * guideline) — not a new reusable UI primitive, this composes
 * `components/ui`'s existing `DropdownMenu`/`DropdownMenuCheckboxItem`/
 * `Badge`/`Button` primitives directly (see the form file's own JSDoc for why
 * no `Controller`-bindable multi-select component exists in `components/ui`
 * yet to reuse instead).
 */

import { ChevronDownIcon, XIcon } from "lucide-react"

import type { Account } from "@/features/accounts/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface AccountSubsetPickerProps {
  /** Non-archived accounts selectable for the subset. */
  accounts: Account[]
  /** Currently-selected account ids. */
  selectedIds: string[]
  onToggle: (accountId: string, checked: boolean) => void
}

export function AccountSubsetPicker({
  accounts,
  selectedIds,
  onToggle,
}: AccountSubsetPickerProps) {
  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No accounts available. Add one on the Accounts page first.
      </p>
    )
  }

  const selectedAccounts = accounts.filter((account) => selectedIds.includes(account.id))

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-between font-normal">
            {selectedIds.length > 0
              ? `${selectedIds.length} account${selectedIds.length === 1 ? "" : "s"} selected`
              : "Select accounts"}
            <ChevronDownIcon className="size-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-64 w-(--radix-dropdown-menu-trigger-width) overflow-y-auto"
        >
          {accounts.map((account) => (
            <DropdownMenuCheckboxItem
              key={account.id}
              checked={selectedIds.includes(account.id)}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) => onToggle(account.id, checked === true)}
            >
              {account.name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {selectedAccounts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedAccounts.map((account) => (
            <Badge key={account.id} variant="secondary" className="gap-1">
              {account.name}
              <button
                type="button"
                aria-label={`Remove ${account.name}`}
                onClick={() => onToggle(account.id, false)}
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </>
  )
}
