"use client"

/**
 * MarkPaidDialog — bills.md AC7's two mutually exclusive ways to mark a bill
 * occurrence paid: entering an amount + date manually, or linking to an
 * existing Transaction. A `Tabs` toggle between the two, submitting the
 * matching branch of `server/validation.ts`'s `MarkPaidSchema` discriminated
 * union to the `markOccurrencePaid` Server Action.
 *
 * The transaction picker is a small inline search-and-pick list built from
 * existing primitives (`Input` + a scrollable button list), not a new
 * reusable combobox component — no `Popover`/`Command` primitive exists in
 * `components/ui/` yet, and per this role's scope ("a simple searchable
 * select/combobox is enough, don't over-build this") a dedicated shared
 * combobox isn't warranted for this one, bills-specific use. It calls the
 * existing `GET /api/transactions?search=` route (built for
 * `features/transactions/hooks/use-transactions.ts`) directly via `fetch`
 * rather than that hook, since this dialog only ever needs a one-off lookup,
 * not a cached/paginated list.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import type { BillOccurrence } from "@/features/bills/types"
import { markOccurrencePaid } from "@/features/bills/server/actions"
import type { MarkPaidInput } from "@/features/bills/server/validation"
import type { ApiResult } from "@/lib/api-response"
import type { TransactionListResult } from "@/features/transactions/types"
import { cn, formatCurrency, formatDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/** Minimal shape MarkPaidDialog needs about the occurrence being marked —
 * deliberately narrower than the full `BillOccurrence` so callers (e.g.
 * `upcoming-bills-list.tsx`, whose rows are `UpcomingOccurrence`, not
 * `BillOccurrence`) don't need to fetch/assemble fields this dialog never
 * uses. */
export interface MarkPaidOccurrenceSummary {
  id: string
  billName: string
  dueDate: Date
  expectedAmount: number
}

export interface MarkPaidDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  occurrence: MarkPaidOccurrenceSummary | null
  /** Called after a successful mark-paid, in addition to this component's
   * own `router.refresh()` — lets a caller (e.g. a dialog stack) do
   * additional cleanup. */
  onMarked?: (occurrence: BillOccurrence) => void
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function MarkPaidDialog({ open, onOpenChange, occurrence, onMarked }: MarkPaidDialogProps) {
  const router = useRouter()
  const [mode, setMode] = React.useState<"manual" | "linked">("manual")
  const [amount, setAmount] = React.useState("")
  const [date, setDate] = React.useState("")
  const [selectedTransactionId, setSelectedTransactionId] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open && occurrence) {
      setMode("manual")
      setAmount(String(occurrence.expectedAmount))
      setDate(toDateInputValue(new Date()))
      setSelectedTransactionId(null)
      setError(null)
    }
  }, [open, occurrence])

  async function handleSubmit() {
    if (!occurrence) return
    setError(null)

    // `markOccurrencePaid` re-parses its input from scratch at runtime via
    // `MarkPaidSchema` (server/validation.ts), whose manual branch accepts
    // the pre-transform `"yyyy-mm-dd"` string this dialog collects for
    // `date` — but `MarkPaidInput`'s *type* is the post-transform shape
    // (`date: Date`). The `as unknown as MarkPaidInput` cast below bridges
    // that gap, identical to transaction-form.tsx's own note on the same
    // pattern. `| null` here (narrowed by the `if (!input) return` guard
    // immediately below) lets each branch bail out via `setError` first.
    const input: MarkPaidInput | null =
      mode === "linked"
        ? (() => {
            if (!selectedTransactionId) {
              setError("Select a transaction to link.")
              return null
            }
            return { occurrenceId: occurrence.id, transactionId: selectedTransactionId }
          })()
        : (() => {
            const parsedAmount = Number(amount)
            if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
              setError("Enter a valid amount.")
              return null
            }
            if (!date) {
              setError("Enter the date paid.")
              return null
            }
            return {
              occurrenceId: occurrence.id,
              amount: parsedAmount,
              date,
            } as unknown as MarkPaidInput
          })()

    if (!input) return

    setIsSubmitting(true)
    const result = await markOccurrencePaid(input)
    setIsSubmitting(false)

    if (!result.success) {
      setError(result.error)
      return
    }

    toast.success(`Marked "${occurrence.billName}" paid.`)
    onOpenChange(false)
    onMarked?.(result.data)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark occurrence paid</DialogTitle>
          <DialogDescription>
            {occurrence
              ? `${occurrence.billName} — due ${formatDate(occurrence.dueDate)}`
              : "Record this occurrence as paid."}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(value) => setMode(value as "manual" | "linked")}>
          <TabsList className="w-full">
            <TabsTrigger value="manual" className="flex-1">
              Enter manually
            </TabsTrigger>
            <TabsTrigger value="linked" className="flex-1">
              Link to a transaction
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="mt-4 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="mark-paid-amount">Amount paid</Label>
              <Input
                id="mark-paid-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mark-paid-date">Date paid</Label>
              <Input
                id="mark-paid-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
          </TabsContent>

          <TabsContent value="linked" className="mt-4">
            <TransactionPicker
              selectedTransactionId={selectedTransactionId}
              onSelect={setSelectedTransactionId}
            />
          </TabsContent>
        </Tabs>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Mark paid"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface PickerTransaction {
  id: string
  merchant: string
  amount: number
  date: string
}

/** Debounce delay for the search-as-you-type transaction lookup — long
 * enough to avoid a request per keystroke, short enough to still feel
 * responsive for this small, one-off picker. */
const SEARCH_DEBOUNCE_MS = 300

function TransactionPicker({
  selectedTransactionId,
  onSelect,
}: {
  selectedTransactionId: string | null
  onSelect: (id: string) => void
}) {
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
