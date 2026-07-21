"use client"

/**
 * LogIrregularIncomeEventDialog — recurring-income.md AC11's "log an
 * individual income event" flow for an `IRREGULAR`/One-off stream: amount +
 * date, with the same optional Transaction-link path scheduled occurrences
 * get (AC8's linking pattern, reused per AC11's "same as scheduled streams'
 * occurrences"). No edit/unlog action exists here — per
 * `server/actions.ts`, this module exposes no update/delete action for
 * `IrregularIncomeEvent` (only `logIrregularIncomeEvent`), which the product
 * spec never asks for either (AC11 only describes logging; the Definition
 * of Done's editing/removal guarantees are scoped to Bill-mirroring
 * occurrence flows, not one-off events) — see this component's sibling
 * `irregular-event-history-list.tsx` for the resulting read-only history
 * view.
 *
 * Plus `LogIncomeEventButton`, a self-contained trigger mirroring
 * `income-stream-form.tsx`'s `AddIncomeStreamButton` pattern.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { logIrregularIncomeEvent } from "@/features/recurring-income/server/actions"
import { TransactionPicker } from "@/features/recurring-income/components/transaction-picker"
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

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export interface LogIrregularIncomeEventDialogProps {
  streamId: string
  streamName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LogIrregularIncomeEventDialog({
  streamId,
  streamName,
  open,
  onOpenChange,
}: LogIrregularIncomeEventDialogProps) {
  const router = useRouter()
  const [mode, setMode] = useState<"manual" | "linked">("manual")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(toDateInputValue(new Date()))
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function resetForm() {
    setMode("manual")
    setAmount("")
    setDate(toDateInputValue(new Date()))
    setSelectedTransactionId(null)
    setError(null)
  }

  async function handleSubmit() {
    setError(null)

    const parsedAmount = Number(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Enter an amount greater than zero.")
      return
    }
    if (!date) {
      setError("Enter the date received.")
      return
    }
    if (mode === "linked" && !selectedTransactionId) {
      setError("Select a transaction to link, or switch to entering it manually.")
      return
    }

    setIsSubmitting(true)
    // `logIrregularIncomeEvent` takes `input: unknown` and parses it itself
    // via `LogIrregularIncomeEventSchema` (server/validation.ts), which
    // accepts this pre-transform "yyyy-mm-dd" `date` string directly.
    const result = await logIrregularIncomeEvent({
      streamId,
      amount: parsedAmount,
      date,
      ...(mode === "linked" && selectedTransactionId ? { transactionId: selectedTransactionId } : {}),
    })
    setIsSubmitting(false)

    if (!result.success) {
      setError(result.error)
      return
    }

    toast.success(`Logged income for "${streamName}".`)
    resetForm()
    onOpenChange(false)
    // Re-runs the Server Component page's getStreamById() call — see
    // app/(dashboard)/income/[streamId]/page.tsx.
    router.refresh()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForm()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log income</DialogTitle>
          <DialogDescription>
            Record a one-off payment for &quot;{streamName}&quot; — no fixed cadence, so each
            payment is logged individually.
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
              <Label htmlFor="irregular-event-amount">Amount received</Label>
              <Input
                id="irregular-event-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="irregular-event-date">Date received</Label>
              <Input
                id="irregular-event-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
          </TabsContent>

          <TabsContent value="linked" className="mt-4 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="irregular-event-linked-date">Date received</Label>
              <Input
                id="irregular-event-linked-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="irregular-event-linked-amount">Amount received</Label>
              <Input
                id="irregular-event-linked-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
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
            {isSubmitting ? "Saving..." : "Log income"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export interface LogIncomeEventButtonProps {
  streamId: string
  streamName: string
  label?: string
}

/** Self-contained "Log income" trigger — mirrors
 * `income-stream-form.tsx`'s `AddIncomeStreamButton` pattern. */
export function LogIncomeEventButton({ streamId, streamName, label = "Log income" }: LogIncomeEventButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon />
        {label}
      </Button>
      <LogIrregularIncomeEventDialog
        streamId={streamId}
        streamName={streamName}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
