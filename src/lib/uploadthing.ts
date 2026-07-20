import { UTApi } from "uploadthing/server"

/**
 * UploadThing server SDK singleton, per docs/architecture/folder-tree.md's
 * Phase 2 addition. Used by `features/transactions/server/receipts.ts`
 * (`removeReceipt`) and `features/transactions/server/actions.ts`
 * (`deleteTransaction`'s receipt-file purge) to delete storage objects —
 * `utapi.deleteFiles(key)` — and implicitly by `app/api/uploadthing/core.ts`'s
 * `receiptUploader` FileRouter, which handles the upload side via
 * UploadThing's own client/server upload pipeline (not this SDK directly).
 *
 * Mirrors `lib/db.ts`'s "one shared singleton instance" pattern, but not its
 * `globalThis`-keyed dev-HMR guard: that guard exists specifically because a
 * `PrismaClient` holds a pooled DB connection that would leak/exhaust the
 * connection limit if recreated on every hot-reload. `UTApi` holds no such
 * pooled resource — it's a thin fetch-based HTTP client authenticated via
 * `UPLOADTHING_TOKEN` (read from `process.env` by default, see
 * `.env.example`) — so a plain module-level singleton is sufficient here;
 * Next.js's module cache already ensures this file only runs once per
 * process outside of hot-reload, and re-running it on a hot-reload has no
 * resource-leak cost worth guarding against.
 */
export const utapi = new UTApi()
