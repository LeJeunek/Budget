"use client"

import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
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
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Account } from "@/features/accounts/types"
import type { TransactionImportSummary } from "@/features/transactions/types"
import type { ApiResult } from "@/lib/api-response"

/**
 * CSV import dialog. `POST /api/transactions/import` is a real Route
 * Handler (multipart/form-data), not a Server Action — see that route's
 * JSDoc — so this posts a `FormData` payload via plain `fetch` rather than
 * one of `features/transactions/hooks/use-transactions.ts`'s mutation
 * hooks.
 *
 * That route creates rows directly in `features/transactions/server/
 * import.ts`, bypassing `createTransaction` entirely, so nothing
 * automatically invalidates the `["transactions"]` TanStack Query cache the
 * way every mutation hook in `hooks/use-transactions.ts` does on success —
 * this dialog invalidates it manually after a successful import so the
 * table reflects the newly imported rows without a full page reload.
 */

export interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Non-archived accounts only — sourced from the caller's `useAccounts()`
   * call, same list used by the "Add Transaction" account select. */
  accounts: Account[]
}

export function ImportDialog({ open, onOpenChange, accounts }: ImportDialogProps) {
  const queryClient = useQueryClient()
  const [file, setFile] = React.useState<File | null>(null)
  const [accountId, setAccountId] = React.useState("")
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [summary, setSummary] = React.useState<TransactionImportSummary | null>(null)

  React.useEffect(() => {
    if (open) {
      setFile(null)
      setAccountId("")
      setErrorMessage(null)
      setSummary(null)
    }
  }, [open])

  async function handleImport() {
    if (!file || !accountId) return
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      const formData = new FormData()
      formData.set("file", file)
      formData.set("accountId", accountId)

      const response = await fetch("/api/transactions/import", {
        method: "POST",
        body: formData,
      })
      const result = (await response.json()) as ApiResult<TransactionImportSummary>

      if (!result.success) {
        setErrorMessage(result.error)
        return
      }

      setSummary(result.data)
      queryClient.invalidateQueries({ queryKey: ["transactions"] })
      if (result.data.imported > 0) {
        toast.success(
          `Imported ${result.data.imported} transaction${result.data.imported === 1 ? "" : "s"}.`,
        )
      }
    } catch {
      setErrorMessage("Could not reach the server. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const canImport = !!file && !!accountId && !isSubmitting

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import transactions from CSV</DialogTitle>
          <DialogDescription>
            Choose a CSV file and the account it belongs to. Rows that duplicate an existing
            transaction are skipped automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="import-account">Account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="import-account" className="w-full">
                <SelectValue placeholder="Select an account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="import-file">CSV file</Label>
            <Input
              id="import-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>

          {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

          {summary && (
            <div className="grid gap-2 rounded-lg border p-3 text-sm">
              <p>
                <span className="font-medium text-foreground">{summary.imported}</span> imported,{" "}
                <span className="font-medium text-foreground">{summary.skippedDuplicates}</span>{" "}
                duplicate{summary.skippedDuplicates === 1 ? "" : "s"} skipped,{" "}
                <span className="font-medium text-foreground">{summary.errors.length}</span> error
                {summary.errors.length === 1 ? "" : "s"}.
              </p>
              {summary.errors.length > 0 && (
                <ScrollArea className="h-32 rounded-md border">
                  <ul className="divide-y">
                    {summary.errors.map((rowError, index) => (
                      <li key={index} className="px-2 py-1.5 text-xs text-muted-foreground">
                        Row {rowError.row}: {rowError.message}
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {summary ? "Close" : "Cancel"}
          </Button>
          {!summary && (
            <Button type="button" onClick={handleImport} disabled={!canImport}>
              {isSubmitting ? "Importing..." : "Import"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
