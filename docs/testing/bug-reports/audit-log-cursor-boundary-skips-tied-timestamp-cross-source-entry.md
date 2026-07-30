# Bug Report: `getAuditLog`'s cross-source cursor pagination silently drops an entry whenever two different source tables produce a row with the exact same millisecond `occurredAt` that straddles a page boundary

## Severity
**Low-Medium** — internal-only, read-only, never a financial figure, and the implementing engineer already documented this exact tradeoff as a deliberate, accepted narrow gap (`audit-log.ts`'s own header comment). It is worth a formal report (rather than leaving it as an accepted comment) because: (1) it is concretely reachable, not merely theoretical, and (2) the code comment's framing — "a genuinely rare coincidence across independently-timestamped domains" — likely understates real-world likelihood, since several of the eight sources are exactly the kind of batch/cron-driven writes that produce many same-millisecond rows across *different* tables at once (e.g. the `evaluate-notifications` cron creating several `Notification` rows in the same batch while an AI-cache regeneration job also runs, or a bulk CSV import generating many `CategorySuggestion` rows alongside other same-minute activity) — the audit log's entire stated business value (admin.md Capability 3) is visibility into exactly this kind of high-volume, cron-driven activity, and a silently-skipped entry (which could be an email-send *failure* or a degraded AI generation — the specific things this feature exists to surface) undermines that without any indication anything was missed.

## Component
`src/features/admin/server/audit-log.ts` lines 39-59 (header comment acknowledging the tradeoff), lines 105-127 (`resolveWindow`), lines 453-469 (`getAuditLog`'s merge/cursor logic)

## Summary
`getAuditLog` merges up to `PAGE_SIZE` (50) rows from each of eight independently-queried source tables, sorts the combined set by `occurredAt` descending, and slices to the top 50 for the page. The pagination cursor is built from only the *last row shown on the page* — `{ occurredAt, id }` — and the next page's window (`resolveWindow`) applies that cursor's `occurredAt` as a single, source-agnostic exclusive upper bound (`lt`) identically across **all eight** source fetchers, regardless of which one source the cursor row actually came from.

If two rows from two *different* source tables share the exact same millisecond `occurredAt`, and the merged, globally-sorted list happens to cut the page exactly between them (one lands at position 50 — shown, becomes the cursor — the other at position 51 — excluded purely by the `slice(0, PAGE_SIZE)` truncation, not by any timestamp difference):

1. Page N's cursor is built from the position-50 row: `{ occurredAt: T, id: <source A's id> }`.
2. Page N+1's window sets `lt = T` for **every** source, including source B's own fetcher.
3. Source B's row (also `occurredAt === T`) fails `occurredAt < T` and is excluded from page N+1's query — it was never included in page N (truncated by the slice) and can never appear on any subsequent page either (its own source's filter now permanently excludes it, since `lt` only ever gets equal to or earlier than `T` on every later page).
4. That row is gone from the paginated view forever: not duplicated, not shown twice, but *silently absent*, with no error, no gap indicator, and no way for an admin paging through the log to know a same-millisecond event from a different source was skipped.

## Reproduction Steps
1. Using two different underlying source tables (e.g. `CategorySuggestion` and `Notification`, both feeding into the audit log per `SOURCE_FETCHERS`), directly write one row into each with the **identical** millisecond `createdAt` timestamp (test-only setup — trivial via `db.categorySuggestion.create({ data: { ..., createdAt: T } } })` and `db.notification.create({ data: { ..., createdAt: T, emailSentAt: T } } })` with the same `T`, since Prisma allows an explicit `createdAt` override on these test rows).
2. Seed enough other, distinctly-timestamped rows across the remaining sources so that, once everything is merged and sorted, these two same-`T` rows land at exactly positions 50 and 51 in the globally-sorted list for the very first `getAuditLog({})` call (i.e., 49 rows exist with `occurredAt > T`, and these are the next two most recent).
3. Call `getAuditLog({})` (page 1). Confirm `entries[49]` is one of the two `T`-timestamped rows (say, the `CategorySuggestion` one) and that the other (`Notification`) row is absent from this page (it was position 51, cut by the `PAGE_SIZE` slice).
4. Call `getAuditLog({ cursor: result.nextCursor })` (page 2). Confirm the `Notification` row with `occurredAt === T` is **not** present in `entries` — `resolveWindow` computed `lt = T` for `fetchNotificationEmailEntries`'s own query too, and `T < T` is false, so it's excluded.
5. Page through every subsequent page to the end of the log: confirm the `Notification` row never appears on any page — it is permanently missing from the paginated view, despite existing in the underlying `Notification` table and satisfying every filter the admin applied.

## Expected Behavior
Every event-generating row across all eight sources should eventually appear exactly once when an admin pages through the full, unfiltered audit log — no row should be permanently excluded purely because another, unrelated source produced a row with the identical millisecond timestamp at a page boundary.

## Actual Behavior
A row from any source whose `occurredAt` exactly ties the cursor row's `occurredAt` (from a *different* source) is silently and permanently excluded from every subsequent page once that boundary has been crossed, with no error or indication to the admin that anything was skipped.

## Suggested Owner
Backend Engineer, `src/features/admin/server/audit-log.ts` (`resolveWindow`/`getAuditLog`) — the accepted tradeoff as currently documented should be revisited given it's concretely reachable via ordinary batch/cron activity, not just a contrived coincidence. A compound tie-breaker (e.g. cursoring on `(occurredAt, id)` per source, using `id` — or a per-source-tagged compound key — as the secondary sort/bound rather than `occurredAt` alone) would close this without a large redesign, though the header comment's own framing suggests the original engineer weighed this and judged it an acceptable low-priority gap for an internal-only view — flagging here so that judgment call is made with the reachability/likelihood analysis above in hand, not just the "genuinely rare coincidence" framing already on record.
