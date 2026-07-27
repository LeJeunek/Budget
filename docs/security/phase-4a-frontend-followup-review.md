# Phase 4a Frontend Follow-up — Security Review (Scoped Delta)

**Reviewer:** Security Architect
**Scope:** Only the frontend surfaces built to close the gap identified in
`docs/release/phase-4a-notes.md` (Release Manager REJECT — "zero shipped
frontend" for Features 2-5):

- `src/features/budgeting/components/budget-advisor-card.tsx`
- `src/features/dashboard/components/monthly-summary-card.tsx`
- `src/features/analytics/components/spending-insights-widget.tsx`
- `src/features/financial-health-score/components/financial-health-score-badge.tsx`
- `src/features/financial-health-score/components/financial-health-score-breakdown.tsx`
- `src/features/financial-health-score/components/financial-health-score-history-chart.tsx`
- `src/features/financial-health-score/components/financial-health-score-narrative.tsx`
- `src/app/(dashboard)/financial-health-score/page.tsx` (new)
- `src/app/(dashboard)/budgeting/page.tsx`, `src/app/(dashboard)/page.tsx`,
  `src/app/(dashboard)/analytics/page.tsx` (modified)

This is **not** a re-review of `lib/ai/*`, the five feature server modules,
the cron routes, or Prisma schema — all already covered with an APPROVE
verdict in `docs/security/phase-4a-review.md`, which remains valid and is
not superseded by this document. This review only checks whether the new UI
callers introduce a new risk on top of that already-approved backend.

**Recommendation: APPROVE**

No High/Medium/Low findings. All four checked items pass cleanly.

---

## 1. Server Action callers — no client-controllable identifier smuggled in

Checked every call site in the three new interactive client components:

- `budget-advisor-card.tsx` → `refreshBudgetAdvisor({ month })`
- `monthly-summary-card.tsx` → `regenerateMonthlySummary({ month: current.month })`
- `spending-insights-widget.tsx` → `refreshSpendingInsights({ period: PERIOD_TO_KEBAB[period] })`

Each of these three Server Actions (`budgeting/server/actions.ts:173`,
`dashboard/server/actions.ts:42`, `analytics/server/actions.ts:129`) takes
`input: unknown`, resolves the user independently via `getCurrentUser()`
first (failing closed with `UNAUTHENTICATED` on `null`), and only then
`safeParse`s the client payload against a single-field Zod schema
(`RefreshBudgetAdvisorSchema { month }`, `RegenerateMonthlySummarySchema
{ month }`, `RefreshSpendingInsightsSchema { period }` — all confirmed in
`validation.ts` in their respective feature folders). None of the three
schemas has a `userId`/account/owner field of any kind, so there is no field
for a compromised or hand-crafted client call to even attempt to smuggle an
identifier through — `user.id` from the session is the only identity value
that ever reaches the underlying `refreshBudgetAdvisorRecommendations`/
`regenerateMonthlySummaryForUser`/`refreshSpendingInsightsForUser` calls, and
it comes exclusively from the server-side `getCurrentUser()` call inside the
action, never from `parsed.data`. This matches the existing, already-approved
pattern for `acceptCategorySuggestion`/`rejectCategorySuggestion` noted in
the prior review's Verified Control B.

No new authorization surface is introduced by any of the three new
components.

## 2. AI narrative text rendering

Checked every place these seven files render AI-authored text:

- `budget-advisor-card.tsx:143` — `{recommendation.text}`
- `monthly-summary-card.tsx:113-114` and `:164` — `{entry.narrative ?? ...}` /
  `{current.narrative}`
- `spending-insights-widget.tsx:149` — `{insight.text}`
- `financial-health-score-narrative.tsx:60` — `{narrative.data.narrative}`

All four are plain JSX text-node interpolations (`{expression}` inside a
`<span>`/`<p>`), which React escapes by default. Confirmed no
`dangerouslySetInnerHTML` anywhere in this file set (`grep` across
`src/features/**/*.tsx` for `dangerouslySetInnerHTML|markdown|marked(|remark|
rehype` returns zero matches outside of doc-comment prose explicitly stating
the *prohibition*). Confirmed none of these four values is ever concatenated
into a `href`/`src`/`Link` target — every rendering site is a leaf text node
with no surrounding interpolation into a URL-constructing expression. This
is the correct client-side backstop behind the already-reviewed
grounding/narrative-safety checks in `lib/ai/verify-narrative-safety.ts`;
even if a narrative-safety check regressed server-side, plain-text rendering
here still prevents it from becoming stored/reflected XSS.

## 3. `/financial-health-score` page — user scoping

`src/app/(dashboard)/financial-health-score/page.tsx` is a Server Component
that calls `getCurrentUser()`, redirects to `/login` on `null` (defensive,
mirroring the layout-level guard), and passes only `user.id` — never any
route param or search param — into `getFinancialHealthScore(user.id)`,
`getLatestNarrative(user.id)`, and `getFinancialHealthScoreHistory(user.id)`.
The route itself (`app/(dashboard)/financial-health-score/page.tsx`) has no
dynamic segment (no `[id]`/`[userId]`) and the page component takes no props
at all besides the implicit Next.js ones — there is no parameter of any kind
a caller could manipulate to request another user's score. This matches the
identical shape already used by `budgeting/page.tsx` and `(dashboard)/page.tsx`.

## 4. `lib/ai/` import boundary

Grepped all four new `financial-health-score/components/*.tsx` files plus
`budget-advisor-card.tsx`, `monthly-summary-card.tsx`, and
`spending-insights-widget.tsx` for any import from `@/lib/ai/*`. Three of the
seven (`budget-advisor-card.tsx`, `spending-insights-widget.tsx`, and
`financial-health-score-narrative.tsx`) import
`type { AiFeatureResult } from "@/lib/ai/types"` — in every case as a
TypeScript `import type`, and `lib/ai/types.ts` itself contains only two
type/interface declarations (`AiFeatureResult<T>`, `CitedFigure`) with zero
runtime code, zero imports of its own, and no reference to `client.ts`,
`generate-structured-output.ts`, or any API-key-touching module. Because
`import type` is fully erased at compile time (no runtime module is
bundled), this does not cross the established "only server-side feature
modules call into `lib/ai/`'s functional surface" boundary the task
description is guarding against — it is equivalent to sharing a discriminated
union shape, not sharing behavior. No component imports `client.ts`,
`generate-structured-output.ts`, `rate-limit.ts`, `redact.ts`, or any other
functional file under `lib/ai/`. This is a different (and safe) pattern from
Feature 1's `suggestion-badge.tsx`, which uses its own feature-owned
`PendingCategorySuggestion` type instead of `AiFeatureResult` (Feature 1 has
no narrative/grounding wrapper) — noted only for completeness, not a
divergence that matters for security.

---

## Verdict

**APPROVE.**

The four new AI-surfacing components and the three modified pages correctly
extend the existing, already-approved session-scoping, plain-text-rendering,
and module-boundary conventions verified in `docs/security/phase-4a-review.md`.
No new Server Action parameter accepts a client-supplied identity value, no
narrative/insight text is rendered through any HTML-producing or
URL-constructing path, the new detail page is scoped exclusively through the
authenticated session with no route/query parameter for user identity, and
no component imports functional (non-type-only) code from `lib/ai/`. No
findings to report; nothing here should block Release Manager sign-off on
security grounds.
