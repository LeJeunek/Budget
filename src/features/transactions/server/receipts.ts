import { db } from "@/lib/db"
import { utapi } from "@/lib/uploadthing"
import { ok, fail, type ApiResult } from "@/lib/api-response"
import type { Receipt } from "@/features/transactions/types"
import {
  ReceiptFileDataSchema,
  type ReceiptFileInput,
} from "@/features/transactions/server/validation"

/**
 * Server-side receipt attachment/removal logic — the Phase 2 addendum to
 * Transactions, per docs/product/transactions.md's "Phase 2 Addendum:
 * Receipt Attachment" and docs/architecture/api-contracts.md's Receipts
 * section.
 *
 * Every function here takes a pre-resolved `userId` from its caller rather
 * than calling `getCurrentUser()` itself — the same convention as
 * `server/service.ts` (see that file's header comment: this module is never
 * imported from a Client Component, and never trusts a client-supplied user
 * id). This module has two call sites, each resolving that user differently:
 *   - `app/api/uploadthing/core.ts`'s `receiptUploader` FileRouter, where the
 *     user is authenticated once in `.middleware()` and passed through as
 *     upload metadata to `onUploadComplete` (which calls `attachReceipt`).
 *   - `server/actions.ts`'s `removeReceipt` Server Action, which calls
 *     `getCurrentUser()` itself — Server Actions are directly callable from
 *     client code, so they can never accept a client-supplied `userId`
 *     parameter — before delegating to `removeReceipt` below.
 *
 * `attachReceipt` is deliberately NOT re-exported as a public Server Action
 * from `server/actions.ts`, despite api-contracts.md's Receipts table
 * listing one — see that function's own JSDoc for the security reason.
 */

/**
 * Verifies a transaction exists and belongs to `userId` — the "never trust a
 * client-supplied transactionId alone" check required by
 * docs/architecture/api-contracts.md's Receipts section and by
 * docs/product/transactions.md's addendum AC6 ("scoped strictly to the
 * authenticated user's own transactions"). Reused by both:
 *   - `app/api/uploadthing/core.ts`'s `.middleware()` step, which rejects the
 *     upload *before* any file bytes reach storage for a transactionId the
 *     caller doesn't own (avoiding an orphaned stored file that
 *     `attachReceipt` would otherwise refuse to link to any Receipt row).
 *   - `attachReceipt` below, as a second, independent check at persist time
 *     — a transaction could in principle be deleted in the window between an
 *     upload starting and completing, so the middleware check alone isn't
 *     sufficient for correctness, only for avoiding the common-case orphan.
 */
export async function assertTransactionOwnership(
  userId: string,
  transactionId: string,
): Promise<boolean> {
  const transaction = await db.transaction.findFirst({
    where: { id: transactionId, userId },
    select: { id: true },
  })
  return transaction !== null
}

/**
 * Creates a `Receipt` row for a completed UploadThing upload. Called from
 * `app/api/uploadthing/core.ts`'s `onUploadComplete`, after the file already
 * exists in UploadThing storage — this function's only job is to persist the
 * metadata UploadThing already gave us (AC1), re-validated against
 * `ReceiptFileDataSchema` and re-checked against `assertTransactionOwnership`
 * (AC6) before writing.
 *
 * **Deliberately not exposed as a public Server Action**, despite
 * docs/architecture/api-contracts.md's Receipts table listing `attachReceipt`
 * as one "defined in receipts.ts, re-exported from actions.ts": a Server
 * Action callable directly from a Client Component can never safely accept a
 * client-supplied `userId` parameter the way this function's signature does
 * — a malicious client could pass an arbitrary `userId` and attach a receipt
 * to (or persist arbitrary file metadata against) another user's transaction,
 * defeating AC6 outright. It also isn't needed as a separate client-invoked
 * action: `<UploadButton endpoint="receiptUploader" />`'s upload *is* the
 * attach action — `onUploadComplete` runs this automatically, server-side,
 * the instant the file finishes uploading, with `userId` sourced from the
 * already-authenticated `.middleware()` step rather than the client. Flagged
 * here for the record as a documented, security-driven deviation from the
 * Architect's contract table, not a redesign of the feature's behavior.
 */
export async function attachReceipt(
  userId: string,
  transactionId: string,
  fileData: ReceiptFileInput,
): Promise<ApiResult<Receipt>> {
  const parsedFileData = ReceiptFileDataSchema.safeParse(fileData)
  if (!parsedFileData.success) {
    return fail(
      parsedFileData.error.issues[0]?.message ?? "Invalid receipt file data",
    )
  }

  const owned = await assertTransactionOwnership(userId, transactionId)
  if (!owned) {
    return fail("Transaction not found")
  }

  const receipt = await db.receipt.create({
    data: {
      userId,
      transactionId,
      ...parsedFileData.data,
    },
  })

  return ok(receipt)
}

/**
 * Removes a receipt: deletes its file from UploadThing storage, THEN deletes
 * its `Receipt` row — in that order, deliberately.
 *
 * Ordering rationale: if the storage delete fails, this function returns
 * early and the `Receipt` row is left completely untouched, so the row and
 * its file stay in sync (both still exist; the user sees a clear error and
 * can simply retry the removal). The reverse order — deleting the DB row
 * first, then the storage file — risks the opposite failure: if the storage
 * delete then fails, the `Receipt` row is already gone, so there is no
 * longer any row anywhere that references that file's key, permanently
 * orphaning it in UploadThing storage with no way to ever discover or retry
 * cleaning it up. Storage-first avoids that outcome entirely — the DB row
 * (the single source of truth for "does this receipt exist") is only ever
 * removed once its file is confirmed gone, so a `Receipt` row's existence and
 * its backing file's existence can never diverge. This is exactly the "no
 * orphaned file left in storage" requirement from
 * docs/product/transactions.md's addendum Edge Cases.
 */
export async function removeReceipt(
  userId: string,
  receiptId: string,
): Promise<ApiResult<{ id: string }>> {
  const receipt = await db.receipt.findFirst({
    where: { id: receiptId, userId },
  })
  if (!receipt) {
    return fail("Receipt not found")
  }

  const deleteResult = await utapi.deleteFiles(receipt.key)
  if (!deleteResult.success) {
    return fail(
      "Failed to remove the receipt file from storage; please try again",
    )
  }

  await db.receipt.delete({ where: { id: receiptId } })

  return ok({ id: receiptId })
}

/**
 * Lists every receipt attached to a transaction, scoped to `userId`. Used by
 * the transaction detail Server Component (a direct call, not a Server
 * Action/route — see docs/architecture/api-contracts.md's Receipts section:
 * "used in the transaction detail view only, not included in the paginated
 * table-row shape") and by `server/service.ts`'s `getTransactionDetail`.
 *
 * Split transactions: no special-casing needed here (see
 * api-contracts.md's "Split transactions" note) — a split line item is
 * already its own `Transaction` row, so viewing its detail page simply calls
 * this with that row's own id, identical to an unsplit transaction (AC4).
 *
 * Ordered newest-first so a user's most recently attached receipt (e.g. one
 * added to correct/supplement an earlier one) is easy to spot first.
 */
export async function getReceiptsForTransaction(
  userId: string,
  transactionId: string,
): Promise<Receipt[]> {
  return db.receipt.findMany({
    where: { transactionId, userId },
    orderBy: { createdAt: "desc" },
  })
}
