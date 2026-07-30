# Bug Report: `updateDashboardCardVisibility`'s "at least one card visible" guard is a check-then-write race with no locking or transaction — two concurrent requests hiding two different cards can both pass the guard and leave zero cards visible

## Severity
**High** — this directly defeats customization.md's Dashboard Layout AC3 hard invariant ("At least one card must remain visible at all times... rather than being allowed to produce a completely empty Dashboard — an empty Dashboard would read as broken or in an error state"), the one guarantee that capability's Definition of Done explicitly calls out as verified. It requires no adversarial intent — an ordinary user with exactly two cards left visible, toggling both off in quick succession (two clicks close together, a slow/retried request, or two open tabs) is a completely plausible real-world interaction, not a contrived attack.

## Component
`src/features/settings/server/actions.ts` lines 191-219 (`updateDashboardCardVisibility`) and lines 163-183 (`persistAllCardPreferences`)

## Summary
`updateDashboardCardVisibility` enforces AC3's guard with a classic, unguarded check-then-act sequence:

```ts
const current = await getDashboardCardPreferences(user.id)   // READ

if (!visible) {
  const currentlyVisible = current.filter((card) => card.visible)
  const targetIsCurrentlyVisible = currentlyVisible.some((card) => card.key === key)
  if (targetIsCurrentlyVisible && currentlyVisible.length <= 1) {
    return fail("At least one Dashboard card must remain visible — unhide another card before hiding this one.")
  }
}

const updated = current.map((card) => (card.key === key ? { ...card, visible } : card))
await persistAllCardPreferences(user.id, updated)             // WRITE (independent per-row upserts)
```

There is no transaction, row lock, or optimistic-concurrency check spanning the read and the write — and, critically, the write itself (`persistAllCardPreferences`) is not even a single atomic statement: it fires one independent `db.dashboardCardPreference.upsert(...)` per card key via `Promise.all` (lines 174-182), each targeting a distinct `(userId, cardKey)` row.

Concretely, with exactly two cards (`A`, `B`) currently visible and every other card already hidden:

1. Request 1 (`{ key: "A", visible: false }`) and Request 2 (`{ key: "B", visible: false }`) fire concurrently (e.g., two browser tabs, or two rapid clicks racing a slow first response).
2. Both independently call `getDashboardCardPreferences` **before either has written anything** — each observes `currentlyVisible = [A, B]`, length `2`. Neither request's own guard check sees the *other* request's still-in-flight change, so both conclude `currentlyVisible.length <= 1` is `false` and proceed.
3. Request 1 computes `updated = [..., A: visible=false, B: visible=true (unchanged, from its own stale read), ...]` and calls `persistAllCardPreferences`, which fires an independent upsert for A (`visible: false`) and an independent upsert for B (`visible: true`).
4. Request 2 computes `updated = [..., A: visible=true (unchanged, from its own stale read), B: visible=false, ...]` and likewise fires independent upserts for A (`visible: true`) and B (`visible: false`).
5. Four independent upserts are now racing across two unrelated rows: `{req1.A=false, req1.B=true, req2.A=true, req2.B=false}`. Card A's *final* persisted value depends only on which of `{req1.A, req2.A}` commits last; Card B's final value depends only on which of `{req1.B, req2.B}` commits last — these are two **independent** races with no ordering relationship to each other (nothing ties "whichever request's A-write wins" to "whichever request's B-write wins").
6. It is therefore entirely possible for `req1.A=false` to land last for card A (A ends up hidden) **and independently** for `req2.B=false` to land last for card B (B ends up hidden) — the two "losing" writes for each card can come from *different* requests. Result: both A and B end up `visible=false`, and since every other card was already hidden, the Dashboard now has **zero visible cards**.

## Reproduction Steps
1. As a user, hide every Dashboard card except exactly two (call them Card A and Card B) via the ordinary Settings UI, so `getDashboardCardPreferences` returns exactly two `visible: true` rows.
2. Fire two concurrent calls to `updateDashboardCardVisibility`, one hiding A and one hiding B, timed so both complete their own `getDashboardCardPreferences` read before either's `persistAllCardPreferences` write finishes — e.g. in a test/script: `Promise.all([updateDashboardCardVisibility({key:"A", visible:false}), updateDashboardCardVisibility({key:"B", visible:false})])`, or in a browser, two tabs each hiding a different one of the two remaining cards within the same round-trip window (throttle the network to widen the window if needed).
3. Observe both calls return success (`ApiResult.ok`) — neither's guard ever saw `currentlyVisible.length <= 1`, because both read the same "2 visible" snapshot before either wrote.
4. Reload the Dashboard settings page / call `getDashboardCardPreferences` fresh: under adverse-but-plausible interleaving of the four independent per-row upserts described above, both A and B are persisted as `visible: false`, leaving zero visible cards.
5. Load `/` (the Dashboard itself): per AC3's own stated failure mode, the user now sees a completely empty Dashboard with no cards at all and no built-in path back except manually navigating to Settings to unhide something — reachable only because the very reason a user would be down to "two cards visible" (about to intentionally trim their layout) is also exactly the situation this race requires.

## Expected Behavior
Per AC3, a request to hide the last remaining visible card must always be blocked with a clear explanation — including when a *second*, concurrently-hidden card is what would otherwise leave zero visible, i.e. the guard must account for concurrent in-flight requests, not just the state of a single request's own stale read. The end state after any sequence or interleaving of hide requests must never be zero visible cards.

## Actual Behavior
The guard's read-check-write is not atomic, and the persistence layer decomposes a single logical "update the whole card set" write into independent per-row upserts with no cross-request coordination. Two concurrent requests hiding two different cards, each of which is individually valid at the moment it was checked, can both succeed and jointly produce the exact empty-Dashboard end state AC3 is meant to prevent.

## Suggested Owner
Backend Engineer, `src/features/settings/server/actions.ts` (`updateDashboardCardVisibility`) — the fix needs either a single atomic statement that both checks and enforces the invariant server-side (e.g. a transaction with a row-level lock/serializable isolation on the caller's `DashboardCardPreference` rows, or a conditional update expressed as one SQL statement that can only succeed if it wouldn't leave zero visible rows) rather than the current separate read-then-many-independent-writes shape.
