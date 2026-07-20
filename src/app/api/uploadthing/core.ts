import { z } from "zod"
import { createUploadthing, type FileRouter } from "uploadthing/next"
import { UploadThingError } from "uploadthing/server"

import { getCurrentUser } from "@/lib/auth"
import {
  assertTransactionOwnership,
  attachReceipt,
} from "@/features/transactions/server/receipts"
import {
  RECEIPT_MAX_FILE_SIZE_LABEL,
  RECEIPT_MAX_FILES_PER_UPLOAD,
} from "@/features/transactions/server/validation"

/**
 * UploadThing FileRouter definition for the Transactions receipt-attachment
 * addendum (docs/product/transactions.md's "Phase 2 Addendum: Receipt
 * Attachment"; docs/architecture/api-contracts.md's Receipts section;
 * docs/architecture/folder-tree.md's Phase 2 tree).
 *
 * `receiptUploader` is UploadThing's *only* consumer in this app — Bills does
 * not need its own storage endpoint per its own spec's Dependencies section
 * — so this file defines a single route.
 */
const f = createUploadthing()

/**
 * Client-supplied input alongside the file upload: the transaction this
 * receipt should attach to. UploadThing's `.input()` step runs before
 * `.middleware()` and exposes its parsed result there as `input`, which is
 * how `transactionId` travels from the browser
 * (`<UploadButton endpoint="receiptUploader" input={{ transactionId }} />`,
 * per api-contracts.md) through to `.middleware()`/`onUploadComplete` without
 * a second round-trip.
 */
const AttachReceiptInputSchema = z.object({
  transactionId: z.string().min(1, "Transaction id is required"),
})

export const receiptFileRouter = {
  receiptUploader: f({
    // AC5: "limits accepted file types to common receipt formats (images,
    // PDF)". `maxFileSize`/`maxFileCount` are per-category — see
    // features/transactions/server/validation.ts's
    // RECEIPT_MAX_FILE_SIZE_LABEL/RECEIPT_MAX_FILE_SIZE_BYTES for the 8MB
    // choice and its rationale (kept there, not duplicated here, since
    // server/receipts.ts's `attachReceipt` re-validates the identical byte
    // limit server-side — the two must never drift apart).
    image: {
      maxFileSize: RECEIPT_MAX_FILE_SIZE_LABEL,
      maxFileCount: RECEIPT_MAX_FILES_PER_UPLOAD,
    },
    pdf: {
      maxFileSize: RECEIPT_MAX_FILE_SIZE_LABEL,
      maxFileCount: RECEIPT_MAX_FILES_PER_UPLOAD,
    },
  })
    .input(AttachReceiptInputSchema)
    .middleware(async ({ input }) => {
      // AC6 / docs/architecture/folder-tree.md risk-register item #4: reject
      // unauthenticated uploads outright — no file for an anonymous request
      // ever reaches storage.
      const user = await getCurrentUser()
      if (!user) {
        throw new UploadThingError({
          code: "FORBIDDEN",
          message: "You must be signed in to upload a receipt",
        })
      }

      // Also verify transaction ownership *here*, before the file reaches
      // storage — not only in `attachReceipt` afterward. Checking only at
      // persist time would let an unauthorized transactionId's file upload
      // succeed and only then get rejected, leaving an orphaned file in
      // storage with no Receipt row (attachReceipt would correctly refuse to
      // link it). Re-checked again in `attachReceipt` regardless, per
      // api-contracts.md's "never trusts the client-supplied transactionId
      // alone" — a transaction could in principle be deleted in the window
      // between this middleware check and upload completion.
      const owned = await assertTransactionOwnership(
        user.id,
        input.transactionId,
      )
      if (!owned) {
        throw new UploadThingError({
          code: "FORBIDDEN",
          message: "Transaction not found",
        })
      }

      return { userId: user.id, transactionId: input.transactionId }
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // `file.url`/`file.appUrl` are deprecated in the installed SDK version
      // in favor of `file.ufsUrl` (removed entirely in a future major
      // version) — `ufsUrl` is what gets persisted as Receipt.url.
      const result = await attachReceipt(metadata.userId, metadata.transactionId, {
        url: file.ufsUrl,
        key: file.key,
        name: file.name,
        size: file.size,
        mimeType: file.type,
      })

      if (!result.success) {
        // Ownership was already verified in `.middleware()` above, so this
        // branch should be unreachable in practice — `attachReceipt`'s own
        // re-check exists only to guard the rare race window described
        // there. Logged rather than thrown: by this point the file has
        // already finished uploading and there is no client request left to
        // fail outright; this handler's return value only ever surfaces to
        // the browser via `onClientUploadComplete`'s `serverData`, not as an
        // upload error.
        console.error(
          `attachReceipt failed after upload completed for transaction ${metadata.transactionId}:`,
          result.error,
        )
        return { attached: false }
      }

      return { attached: true, receiptId: result.data.id }
    }),
} satisfies FileRouter

export type ReceiptFileRouter = typeof receiptFileRouter
