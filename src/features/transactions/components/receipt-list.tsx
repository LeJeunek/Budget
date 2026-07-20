"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Download, Loader2, Paperclip, Trash2 } from "lucide-react"
import { toast } from "sonner"

import type { Receipt } from "@/features/transactions/types"
import { removeReceipt } from "@/features/transactions/server/actions"
import { Button } from "@/components/ui/button"

/**
 * Receipt list for the transaction detail page (Phase 2 addendum:
 * docs/product/transactions.md's "Phase 2 Addendum: Receipt Attachment"
 * AC2/AC3; docs/architecture/api-contracts.md's Receipts section, "List
 * receipts for a transaction" / "Remove a receipt" rows).
 *
 * `receipts` is a plain prop, not a query hook — this feature deliberately
 * has no client-fetchable "list receipts" endpoint (see
 * `receipts.ts`'s `getReceiptsForTransaction` JSDoc: "used in the
 * transaction detail view only"), so the list always originates from the
 * enclosing Server Component's `getTransactionDetail` call and is refreshed
 * via `router.refresh()` after a mutation, exactly like
 * `receipt-uploader.tsx`'s post-upload refresh.
 */

const BYTE_UNITS = ["B", "KB", "MB", "GB"] as const

/** Formats a byte count as a short human-readable string (e.g. "482 KB",
 * "2.3 MB") for display next to each receipt's file name. */
function formatFileSize(bytes: number): string {
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const decimals = unitIndex === 0 ? 0 : 1
  return `${value.toFixed(decimals)} ${BYTE_UNITS[unitIndex]}`
}

export interface ReceiptListProps {
  receipts: Receipt[]
}

export function ReceiptList({ receipts }: ReceiptListProps) {
  const router = useRouter()
  // Tracks which single receipt is mid-removal so only that row's button
  // shows a spinner/disables — removing one receipt should not block
  // removing a different one concurrently.
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function handleRemove(receipt: Receipt) {
    setRemovingId(receipt.id)
    try {
      const result = await removeReceipt({ id: receipt.id })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`Removed "${receipt.name}".`)
      router.refresh()
    } finally {
      setRemovingId(null)
    }
  }

  if (receipts.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
        No receipts attached yet.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {receipts.map((receipt) => (
        <li
          key={receipt.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Paperclip
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-col">
              <a
                href={receipt.url}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-sm font-medium text-foreground hover:underline"
                title={receipt.name}
              >
                {receipt.name}
              </a>
              <span className="text-xs text-muted-foreground">
                {formatFileSize(receipt.size)}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              asChild
              aria-label={`Download ${receipt.name}`}
            >
              {/* AC2: view/download a receipt from the detail view. `download`
                 hints the browser to save rather than navigate, but the
                 file also opens fine in a new tab for viewing (e.g. images/
                 PDFs render inline) since UploadThing serves it directly. */}
              <a href={receipt.url} target="_blank" rel="noopener noreferrer" download={receipt.name}>
                <Download className="size-4" aria-hidden="true" />
              </a>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${receipt.name}`}
              disabled={removingId === receipt.id}
              onClick={() => handleRemove(receipt)}
            >
              {removingId === receipt.id ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
