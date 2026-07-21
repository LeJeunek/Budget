"use client"

/**
 * TransactionPicker — a small search-and-pick list for choosing an existing
 * money-in Transaction to link (recurring-income.md AC8/AC11's optional
 * linking path). Functionally identical to the inline, non-exported
 * `TransactionPicker` inside `features/bills/components/mark-paid-dialog.tsx`
 * — same "no Popover/Command primitive exists yet, don't over-build a shared
 * combobox for this one use case" reasoning applies here too.
 *
 * Extracted as its own file (rather than re-inlined per-dialog) because,
 * unlike Bills (which needs this picker in exactly one place), Recurring
 * Income needs it in two: `mark-received-dialog.tsx` (AC8's linked path) and
 * `irregular-event-form.tsx` (AC11's optional link for a logged event). This
 * feature's own "avoid duplication" boundary is `features/recurring-income/`
 * itself — reaching into Bills' private, non-exported component instead
 * would cross a module boundary this module doesn't own, per
 * folder-tree.md's "each domain owns its own composed UI" rule, so a second,
 * shared-within-this-feature copy is the correct amount of sharing here, not
 * a violation of the no-duplication rule.
 *
 * Calls `GET /api/transactions?search=` directly via `fetch` (the existing
 * route built for `features/transactions/hooks/use-transactions.ts`) rather
 * than that hook, for the same "one-off lookup, not a cached list" reason
 * Bills' picker does.
 */

import * as React from "react"

import type { ApiResult } from "@/lib/api-response"
import type { TransactionListResult } from "@/features/transactions/types"
import { cn, formatCurrency, formatDate } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"

interface PickerTransaction {
  id: string
  merchant: string
  amount: number
  date: string
}

/** Debounce delay for the search-as-you-type lookup — identical value/
 * rationale to Bills' `mark-paid-dialog.tsx`'s `SEARCH_DEBOUNCE_MS`. */
const SEARCH_DEBOUNCE_MS = 300

export interface TransactionPickerProps {
  selectedTransactionId: string | null
  onSelect: (id: string) => void
}

export function TransactionPicker({
  selectedTransactionId,
  onSelect,
}: TransactionPickerProps) {
  const [search, setSearch] = React.useState("")
  const [results, setResults] = React.useState<PickerTransaction[]>([])
  const [isLoading, setIsLoading] = React.useState(false)

  React.useEffect(() => {
    const timeout = setTimeout(async () => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams({ pageSize: "8", sortBy: "date", sortDir: "desc" })
        if (search.trim()) {
          params.set("search", search.trim())
        }
        const response = await fetch(`/api/transactions?${params.toString()}`)
        const result = (await response.json()) as ApiResult<TransactionListResult>
        if (result.success) {
          setResults(
            result.data.items.map((transaction) => ({
              id: transaction.id,
              merchant: transaction.merchant,
              amount: transaction.amount,
              date: String(transaction.date),
            })),
          )
        }
      } finally {
        setIsLoading(false)
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timeout)
  }, [search])

  return (
    <div className="grid gap-2">
      <Input
        placeholder="Search transactions by merchant or notes..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Search transactions"
      />
      <ScrollArea className="h-48 rounded-md border">
        {isLoading ? (
          <p className="p-3 text-sm text-muted-foreground">Searching...</p>
        ) : results.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">No transactions found.</p>
        ) : (
          <ul className="divide-y">
            {results.map((transaction) => (
              <li key={transaction.id}>
                <button
                  type="button"
                  onClick={() => onSelect(transaction.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                    selectedTransactionId === transaction.id && "bg-muted",
                  )}
                >
                  <span className="flex flex-col">
                    <span className="font-medium text-foreground">{transaction.merchant}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(transaction.date)}
                    </span>
                  </span>
                  <span className="font-medium text-foreground">
                    {formatCurrency(transaction.amount)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
      {selectedTransactionId && (
        <p className="text-xs text-muted-foreground">1 transaction selected.</p>
      )}
    </div>
  )
}
