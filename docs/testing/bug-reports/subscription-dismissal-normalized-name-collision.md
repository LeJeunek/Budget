# Bug Report: Dismissing a subscription permanently and silently suppresses any future, genuinely different merchant that happens to share the same normalized name

## Severity
**Medium-High** — silent false negative with no user-visible symptom and no recovery path. Unlike a false positive (which the user sees and can act on), this failure mode is invisible: the user simply never sees a real, currently-active recurring charge from a coincidentally-same-normalized-name merchant ever again, with nothing in the UI to explain why or to undo it.

## Component
`src/features/analytics/server/subscriptions.ts` — `getSubscriptionCandidates`
`src/lib/merchant-normalization.ts` — `normalizeMerchantName` (the shared, lossy grouping key both detection and dismissal rely on)
`DismissedSubscriptionMerchant` (prisma/schema.prisma) — keyed solely on `(userId, normalizedMerchantName)`

## Summary
Subscription Cost Detection groups transactions into merchant "buckets" using `normalizeMerchantName`, a deliberately fuzzy string transform (lowercases, strips punctuation/TLD suffixes like `.com`, strips a single trailing corporate-entity suffix word like `Inc`/`Corp`/`Co`). This fuzziness is intentional and documented as an acceptable, non-bug limitation for *detection* itself (analytics.md's Edge Cases: "a merchant name that varies more than normalization can reconcile... may fail to group correctly... an acknowledged limitation, not a bug").

However, the **dismissal** mechanism (`dismissSubscriptionCandidate` / `DismissedSubscriptionMerchant`) is keyed at the exact same granularity — a bare `normalizedMerchantName` string, with no reference to the specific transactions, amount, or interval pattern that was actually dismissed. Once a user dismisses a merchant (e.g. because a genuine subscription for "Ace Corp" turned out to be something they didn't consider a subscription), **any future, entirely unrelated merchant** whose raw name happens to normalize to the identical string (e.g. a completely different business literally named "Ace") is permanently excluded from every future detection run for that user — even if it starts its own genuine, clearly-qualifying subscription pattern months later, at a totally different amount.

This is worse than the acknowledged detection-grouping limitation because it is **silent and irreversible from the user's perspective**: the suppressed candidate never renders in the UI, so there is nothing for the user to "un-dismiss" — they have no way to know a real subscription is being hidden, or why.

## Reproduction Steps (verified against a live database via the real service functions)
1. Create a test user and one Account.
2. Create 3 transactions for merchant `"Ace Corp"` at $9.99/month (Jan, Feb, Mar 2026) — a genuine, qualifying MONTHLY subscription.
3. Call `getSubscriptionCandidates(userId)` — correctly detects it:
   ```json
   [{"normalizedMerchantName":"ace","displayName":"Ace Corp","averageAmount":9.99,"detectedInterval":"MONTHLY","status":"POSSIBLY_CANCELLED", ...}]
   ```
   (`normalizeMerchantName("Ace Corp")` → `"ace"`, confirmed directly.)
4. Dismiss it: upsert `DismissedSubscriptionMerchant { userId, normalizedMerchantName: "ace" }` (the exact operation `dismissSubscriptionCandidate` performs).
5. Confirm `getSubscriptionCandidates(userId)` now correctly returns `[]`.
6. Months later, create 3 **new, unrelated** transactions for merchant `"Ace"` (note: no "Corp" suffix — normalizes to the identical `"ace"` key) at **$29.99/month** (May, Jun, Jul 2026) — a brand-new, genuinely different, clearly-qualifying MONTHLY subscription pattern (different amount, different time period, no relation to the original dismissed merchant beyond the coincidental name).
7. Call `getSubscriptionCandidates(userId)` again:
   ```json
   []
   ```

## Expected Behavior
A user dismissing a specific detected subscription should not be permanently blinded to a **different, later, genuinely distinct** subscription merely because its raw merchant name normalizes to the same string. At minimum, the product should have some mechanism to distinguish "this exact same recurring charge, continuing" from "an unrelated new charge that happens to share a normalized name" (e.g. re-surfacing a new candidate if the detected amount/pattern materially diverges from what was originally dismissed, or scoping the dismissal to more than a bare string).

## Actual Behavior
The new, real, currently-active $29.99/month "Ace" subscription is completely and silently suppressed — `getSubscriptionCandidates` returns `[]` despite a genuine qualifying pattern existing in the transaction history. Confirmed via direct service-layer testing with real DB rows (not just code reading).

## Real-World Impact
- The feature's stated value proposition ("here's what your subscriptions are actually costing you per year, in one place") silently fails for any user unlucky enough to have two different merchants collide under normalization (plausible for short/generic names, or common corporate-suffix stripping — "Value", "Prime", "Plus", "Ace", "Home", etc. are all realistic collision candidates).
- The running annualized-cost total (`getActiveSubscriptionAnnualizedTotal`) is understated with no indication anything is missing.
- No recovery path exists in the UI: since the suppressed candidate never renders, there's no "undo dismissal" affordance the user could even discover for it.

## Real-World Impact Note / Related Duplication
This is distinct from, and more severe than, the analytics.md-acknowledged "detection over-groups two different merchants into one bucket" limitation — dismissal doesn't just *fail to distinguish* the two merchants, it turns any future coincidental collision into a **standing, invisible exclusion**, since dismissal state never expires and is never re-evaluated against what's actually still being detected.

## Suggested Owner
Backend Engineer (Analytics module) — `src/features/analytics/server/subscriptions.ts` / `dismissSubscriptionCandidate`'s design in `actions.ts`, with a Product Owner decision needed on the intended resolution (e.g. scoping dismissal to a merchant+amount-range fingerprint, or expiring/re-validating dismissals against currently-detected patterns).
