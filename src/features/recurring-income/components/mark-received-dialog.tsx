"use client"

/**
 * MarkReceivedDialog — recurring-income.md AC8's two ways to mark an income
 * occurrence received: entering an amount + date manually, or linking to an
 * existing money-in Transaction. Structurally mirrors
 * `features/bills/components/mark-paid-dialog.tsx`'s `Tabs`-toggle UI, with
 * one deliberate difference: per api-contracts.md's Recurring Income
 * section, `markOccurrenceReceived` (manual) and `linkOccurrenceToTransaction`
 * (linked) are two entirely separate Server Actions with two separate
 * schemas — unlike Bills' single `markOccurrencePaid` action taking a
 * discriminated-union input — so this dialog calls one or the other
 * directly based on the active tab, rather than building one combined input
 * object the way `mark-paid-dialog.tsx` does.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import type { IncomeOccurrence } from "@/features/recurring-income/types"
import {
  linkOccurrenceToTransaction,
  markOccurrenceReceived,
} from "@/features/recurring-income/server/actions"
import { TransactionPicker } from "@/features/recurring-income/components/transaction-picker"
import { formatDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/** Minimal shape this dialog needs about the occurrence being marked —
 * deliberately narrower than the full `IncomeOccurrence`, mirroring
 * `mark-paid-dialog.tsx`'s `MarkPaidOccurrenceSummary` precedent. */
export interface MarkReceivedOccurrenceSummary {
  id: string
  streamName: string
  expectedDate: Date
  expectedAmount: number | null
}

export interface MarkReceivedDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  occurrence: MarkReceivedOccurrenceSummary | null
  /** Called after a successful mark-received, in addition to this
   * component's own `router.refresh()` — mirrors `mark-paid-dialog.tsx`'s
   * `onMarked` prop. */
  onMarked?: (occurrence: IncomeOccurrence) => void
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function MarkReceivedDialog({
  open,
  onOpenChange,
  occurrence,
  onMarked,
}: MarkReceivedDialogProps) {
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
      setAmount(occurrence.expectedAmount !== null ? String(occurrence.expectedAmount) : "")
      setDate(toDateInputValue(new Date()))
      setSelectedTransactionId(null)
      setError(null)
    }
  }, [open, occurrence])

  async function handleSubmit() {
    if (!occurrence) return
    setError(null)

    if (mode === "linked") {
      if (!selectedTransactionId) {
        setError("Select a transaction to link.")
        return
      }
      setIsSubmitting(true)
      const result = await linkOccurrenceToTransaction({
        occurrenceId: occurrence.id,
        transactionId: selectedTransactionId,
      })
      setIsSubmitting(false)

      if (!result.success) {
        setError(result.error)
        return
      }

      toast.success(`Marked "${occurrence.streamName}" received.`)
      onOpenChange(false)
      onMarked?.(result.data)
      router.refresh()
      return
    }

    const parsedAmount = Number(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setError("Enter a valid amount.")
      return
    }
    if (!date) {
      setError("Enter the date received.")
      return
    }

    setIsSubmitting(true)
    // Unlike `bill-form.tsx`/`mark-paid-dialog.tsx`'s Server Actions (which
    // declare a typed, post-transform input parameter), this module's Server
    // Actions all take `input: unknown` and parse it themselves via
    // `MarkOccurrenceReceivedSchema` (server/validation.ts) — which accepts
    // the pre-transform "yyyy-mm-dd" string collected here for
    // `receivedDate` directly, so no bridging cast is needed at this call site.
    const result = await markOccurrenceReceived({
      occurrenceId: occurrence.id,
      receivedAmount: parsedAmount,
      receivedDate: date,
    })
    setIsSubmitting(false)

    if (!result.success) {
      setError(result.error)
      return
    }

    toast.success(`Marked "${occurrence.streamName}" received.`)
    onOpenChange(false)
    onMarked?.(result.data)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark occurrence received</DialogTitle>
          <DialogDescription>
            {occurrence
              ? `${occurrence.streamName} — expected ${formatDate(occurrence.expectedDate)}`
              : "Record this occurrence as received."}
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
              <Label htmlFor="mark-received-amount">Amount received</Label>
              <Input
                id="mark-received-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mark-received-date">Date received</Label>
              <Input
                id="mark-received-date"
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
            {isSubmitting ? "Saving..." : "Mark received"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
