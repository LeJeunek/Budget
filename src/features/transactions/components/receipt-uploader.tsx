"use client"

import { useRouter } from "next/navigation"
import { generateUploadButton } from "@uploadthing/react"
import { toast } from "sonner"

import type { ReceiptFileRouter } from "@/app/api/uploadthing/core"
import {
  RECEIPT_MAX_FILE_SIZE_LABEL,
  RECEIPT_MAX_FILES_PER_UPLOAD,
} from "@/features/transactions/server/validation"

// UploadThing's own base stylesheet for its generated components — imported
// here (this component's only consumer of it) rather than in app/globals.css,
// since `<UploadButton>` is the sole UploadThing UI surface in this app (per
// docs/architecture/api-contracts.md's Receipts section: "this is currently
// UploadThing's only consumer"). The `appearance`/`content` props below
// re-theme it to match shadcn/Tailwind, but the base stylesheet still
// supplies layout fundamentals (progress bar, spacing) the override classes
// don't reproduce.
import "@uploadthing/react/styles.css"

/**
 * Receipt attachment control for the transaction detail page (Phase 2
 * addendum: docs/product/transactions.md's "Phase 2 Addendum: Receipt
 * Attachment" AC1; docs/architecture/api-contracts.md's Receipts section,
 * "Upload from the browser" row).
 *
 * Wraps UploadThing's `<UploadButton>` rather than `<UploadDropzone>` — a
 * receipt is typically a single photo/PDF selected via the OS file picker,
 * and the transaction detail page already has enough vertical sections (see
 * `transaction-detail-client.tsx`) that a large dropzone would add bulk
 * without adding capability; a button reads simpler for "attach a receipt"
 * and still supports selecting multiple files at once via the same file
 * picker dialog (AC1's "one or more").
 *
 * `generateUploadButton<ReceiptFileRouter>()` is called at module scope
 * (not inside the component) so the typed helper is created once per module
 * load, not once per render — mirrors UploadThing's own documented usage.
 * `ReceiptFileRouter` is imported with `import type`, which Next.js's
 * compiler erases entirely at build time, so none of `core.ts`'s
 * server-only code (Prisma/`getCurrentUser`/`uploadthing/next`) is pulled
 * into this Client Component's bundle — only the type shape survives, which
 * is all `generateUploadButton` needs to type-check `endpoint`/`input`
 * against.
 *
 * No local upload-progress state is kept here: `<UploadButton>` already
 * renders its own built-in progress affordance (percentage + spinner) while
 * `isUploading` is true, so duplicating that in this wrapper would be dead
 * weight, not an improvement.
 */

const UploadButton = generateUploadButton<ReceiptFileRouter>()

export interface ReceiptUploaderProps {
  /** The transaction this upload should attach to — travels to
   * `app/api/uploadthing/core.ts`'s `.middleware()` as the `input` UploadThing
   * exposes there, per that file's `AttachReceiptInputSchema`. */
  transactionId: string
}

export function ReceiptUploader({ transactionId }: ReceiptUploaderProps) {
  const router = useRouter()

  return (
    <UploadButton
      endpoint="receiptUploader"
      input={{ transactionId }}
      appearance={{
        button:
          "h-8 gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground after:bg-primary/40 hover:bg-primary/80 ut-uploading:cursor-not-allowed ut-uploading:bg-primary/70 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        container: "w-fit flex-row items-center gap-2",
        allowedContent: "text-xs text-muted-foreground",
      }}
      content={{
        button({ isUploading }) {
          return isUploading ? "Uploading..." : "Attach receipt"
        },
        allowedContent: `Images and PDF, up to ${RECEIPT_MAX_FILE_SIZE_LABEL} each, ${RECEIPT_MAX_FILES_PER_UPLOAD} files max`,
      }}
      onClientUploadComplete={(files) => {
        // `serverData` is exactly what `core.ts`'s `onUploadComplete` returned
        // (`{ attached: boolean; receiptId?: string }`) — see that file's
        // JSDoc for why a persist failure there is possible-but-rare (a race
        // between upload start and the transaction being deleted) and is
        // surfaced here rather than as an upload error, since by this point
        // the file has already finished uploading successfully.
        const attachedCount = files.filter((file) => file.serverData?.attached).length
        const failedCount = files.length - attachedCount

        if (attachedCount > 0) {
          toast.success(
            attachedCount === 1
              ? "Receipt attached."
              : `${attachedCount} receipts attached.`,
          )
        }
        if (failedCount > 0) {
          toast.error(
            failedCount === 1
              ? "A file uploaded but could not be attached to this transaction. Please try again."
              : `${failedCount} files uploaded but could not be attached to this transaction. Please try again.`,
          )
        }

        // The receipts list rendered by `receipt-list.tsx` is fed by this
        // page's Server Component prop (`getTransactionDetail`'s result),
        // not client-side state — `router.refresh()` re-runs that fetch so
        // the newly attached receipt(s) appear without a full page reload.
        // Mirrors `account-form.tsx`'s identical post-mutation refresh.
        router.refresh()
      }}
      onUploadError={(error) => {
        // AC5: "a file that is too large or an unsupported type is rejected
        // ... surfaced ... as a clear toast error, not a silent failure."
        // UploadThing rejects oversized/wrong-type files before the upload
        // starts (per the FileRouter's `maxFileSize`/type config in core.ts),
        // surfacing here as an `UploadThingError` whose `.message` is already
        // human-readable (e.g. "Invalid file type" / "File too large").
        toast.error(error.message || "Could not upload receipt.")
      }}
    />
  )
}
