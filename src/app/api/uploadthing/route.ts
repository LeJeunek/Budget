import { createRouteHandler } from "uploadthing/next"

import { receiptFileRouter } from "@/app/api/uploadthing/core"

/**
 * UploadThing's own Route Handler for the `receiptUploader` FileRouter
 * (./core.ts). Per docs/architecture/api-contracts.md's Receipts section,
 * this is UploadThing's own request/response contract, not this app's
 * `ApiResult<T>` — the browser's `<UploadButton />`/`<UploadDropzone />`
 * components (Frontend Lead's `receipt-uploader.tsx`) talk to this route
 * directly, not through any Server Action of ours.
 */
export const { GET, POST } = createRouteHandler({
  router: receiptFileRouter,
})
