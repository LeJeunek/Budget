"use client"

import * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn, formatCurrency } from "@/lib/utils"
import type { Category } from "@/features/categories/types"
import type { Transaction } from "@/features/transactions/types"
import { useSplitTransaction } from "@/features/transactions/hooks/use-transactions"

/**
 * Split-transaction dialog, per docs/product/transactions.md AC13/14:
 * divides one transaction into two or more category allocations whose
 * amounts must sum EXACTLY to the original transaction's amount
 * (`server/actions.ts`'s `splitTransaction` enforces this in integer cents
 * server-side; this dialog mirrors that same integer-cents comparison
 * client-side purely so the submit button can be disabled until the split
 * is valid — the server check is still the actual guarantee).
 *
 * Single-level splitting only (AC15): the caller (transaction-table.tsx)
 * never offers "Split" for a row that is already a split child, and a
 * transaction that is already a split parent never reaches the table at
 * all (`listTransactions`'s `EXCLUDE_SPLIT_PARENTS`), so this dialog never
 * needs to guard against re-splitting itself.
 */

interface SplitRow {
  categoryId: string
  amount: string
}

const EMPTY_ROW: SplitRow = { categoryId: "", amount: "" }

export interface SplitDialogProps {
  transaction: Transaction | null
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
}

/** Same "exact cents" conversion technique as `server/actions.ts`'s
 * `splitTransaction` — avoids floating-point drift when comparing the
 * running total to the original amount. Returns `null` for a blank or
 * non-numeric input so the caller can distinguish "not filled in yet" from
 * a genuine `0`. */
function toCentsOrNull(value: string): number | null {
  if (value.trim() === "") return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.round(parsed * 100)
}

export function SplitDialog({ transaction, open, onOpenChange, categories }: SplitDialogProps) {
  const [rows, setRows] = React.useState<SplitRow[]>([EMPTY_ROW, EMPTY_ROW])
  const [formError, setFormError] = React.useState<string | null>(null)
  const splitTransaction = useSplitTransaction()

  React.useEffect(() => {
    if (open) {
      setRows([EMPTY_ROW, EMPTY_ROW])
      setFormError(null)
    }
  }, [open])

  const originalCents = transaction ? Math.round(transaction.amount * 100) : 0
  const rowCents = rows.map((row) => toCentsOrNull(row.amount))
  const hasIncompleteRow = rows.some((row, index) => !row.categoryId || rowCents[index] === null)
  const hasZeroAmount = rowCents.some((cents) => cents === 0)
  const sumCents = rowCents.reduce((sum: number, cents) => sum + (cents ?? 0), 0)
  const remainderCents = originalCents - sumCents
  const canSubmit =
    !!transaction &&
    rows.length >= 2 &&
    !hasIncompleteRow &&
    !hasZeroAmount &&
    remainderCents === 0

  function updateRow(index: number, patch: Partial<SplitRow>) {
    setRows((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)))
  }

  function addRow() {
    setRows((prev) => [...prev, EMPTY_ROW])
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index))
  }

  async function handleSubmit() {
    if (!transaction || !canSubmit) return
    setFormError(null)
    try {
      await splitTransaction.mutateAsync({
        id: transaction.id,
        splits: rows.map((row) => ({
          categoryId: row.categoryId,
          amount: Number(row.amount),
        })),
      })
      toast.success(`Split "${transaction.merchant}" into ${rows.length} categories.`)
      onOpenChange(false)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not split transaction.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Split transaction</DialogTitle>
          <DialogDescription>
            {transaction &&
              `Divide "${transaction.merchant}" (${formatCurrency(transaction.amount)}) across two or more categories. The split amounts must sum exactly to the original amount.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <Select
                value={row.categoryId}
                onValueChange={(value) => updateRow(index, { categoryId: value })}
              >
                <SelectTrigger className="w-full flex-1" aria-label={`Category for split ${index + 1}`}>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                step="0.01"
                value={row.amount}
                onChange={(event) => updateRow(index, { amount: event.target.value })}
                placeholder="0.00"
                className="w-28"
                aria-label={`Amount for split ${index + 1}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove split ${index + 1}`}
                onClick={() => removeRow(index)}
                disabled={rows.length <= 2}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={addRow}>
            <Plus className="size-4" aria-hidden="true" />
            Add split
          </Button>

          <div
            className={cn(
              "rounded-lg border px-3 py-2 text-sm",
              remainderCents === 0 ? "border-emerald-500/30 bg-emerald-500/10" : "border-border bg-muted/50",
            )}
          >
            {remainderCents === 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                Splits sum to {formatCurrency(sumCents / 100)} — ready to submit.
              </span>
            ) : (
              <span className="text-muted-foreground">
                {formatCurrency(sumCents / 100)} of {formatCurrency(originalCents / 100)} allocated —{" "}
                {formatCurrency(Math.abs(remainderCents) / 100)}{" "}
                {remainderCents > 0 ? "remaining" : "over"}.
              </span>
            )}
          </div>

          {formError && <p className="text-sm text-destructive">{formError}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || splitTransaction.isPending}
          >
            {splitTransaction.isPending ? "Splitting..." : "Split transaction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
