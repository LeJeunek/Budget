import { Resend } from "resend"

// THE ONLY file in this codebase that imports the `resend` package or reads
// `RESEND_API_KEY` (docs/architecture/phase-4b-technical-design.md §4).
// Every feature reaches the email provider exclusively through
// `send-notification-email.ts`, which itself only imports `getResendClient`
// — never the `resend` package directly. Mirrors `lib/ai/client.ts`'s "one
// file owns the third-party import" convention (itself mirroring
// `lib/db.ts`/`lib/uploadthing.ts`'s singleton-export pattern) — a future
// provider swap (per phase-4b-technical-design.md §4's own comparison table)
// is a change to this one file, never a change to any feature.
//
// `RESEND_API_KEY` is read explicitly (rather than relying on the SDK's own
// implicit env-var fallback) so this file's own doc comment stays literally
// true and greppable — see `.env.example`'s matching comment.
//
// Constructed lazily (not a top-level `export const`) because the `resend`
// package's constructor throws synchronously when the key is missing or
// empty — and email is an off-by-default channel per notifications-v2.md, so
// a deployment that never configures `RESEND_API_KEY` must still import and
// build cleanly. A module-scope `new Resend(...)` would throw the moment
// anything imports this file (including transitively, e.g. Next.js's build-time
// page-data collection for `app/api/cron/evaluate-notifications/route.ts`),
// crashing the whole app over an unconfigured optional feature.
let cachedClient: Resend | null = null

export function getResendClient(): Resend {
  if (!cachedClient) {
    cachedClient = new Resend(process.env.RESEND_API_KEY)
  }
  return cachedClient
}
