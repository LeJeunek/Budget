# Phase 4a Security Review — AI Features (Final Pre-Release Gate)

**Reviewer:** Security Architect
**Scope:** `src/lib/ai/*` (client, generate-structured-output, types,
prompts/build-prompt, verify-grounding, verify-narrative-safety, rate-limit,
redact, assert-single-user-batch); every AI feature server module
(`transactions/server/categorization*.ts`, `budgeting/server/advisor*.ts`,
`dashboard/server/monthly-summary*.ts`, `analytics/server/insights*.ts`,
`financial-health-score/server/{formula,service,snapshot,health-score-narrative*}.ts`);
all four `app/api/cron/*` routes; the Transaction Auto-Categorization frontend
surface (`suggestion-badge.tsx`, `transaction-table.tsx`,
`(dashboard)/transactions/transactions-client.tsx`, `transactions/page.tsx`,
`transactions/server/actions.ts`); `prisma/schema.prisma`'s Phase 4a additions.

This is a review of the **shipped implementation**, not the design-stage
document. An earlier design-stage review (`docs/architecture/ai-features-design.md`
§2/§4 "Finding" annotations) already surfaced 8 findings (1 High), all fixed
before implementation. This review verifies those fixes actually landed in
code and checks for regressions/gaps introduced during implementation across
all five features plus the later `ReasoningModelCallLog` follow-up.

**Recommendation: APPROVE**

No High or Critical findings. Three Low/Informational notes below, none of
which block this phase gate.

---

## Findings

### 1. Cross-feature `reasoningModel` rate limit has a check-then-act race window (accepted risk, documented)

**Risk Level: Low**

**Affected files:**
`src/lib/ai/rate-limit.ts` (`checkReasoningModelRateLimit`, lines 223-239),
called from `src/features/budgeting/server/advisor.ts:199-209`,
`src/features/dashboard/server/monthly-summary.ts:440-451`,
`src/features/analytics/server/insights.ts:314-324`,
`src/features/financial-health-score/server/health-score-narrative.ts:243-246`.

**Scenario:** `checkReasoningModelRateLimit` (a `count()` read against
`ReasoningModelCallLog`) and the subsequent per-key `claimGenerationSlot`
atomic `create`/conditional-`update` are two independent, sequential
statements, never combined into one transaction (this is explicitly by
design — see `rate-limit.ts`'s own comment on `checkReasoningModelRateLimit`
and the `ReasoningModelCallLog` schema comment). Two nearly-simultaneous
requests for two *different* cache keys (e.g. a user opening the Budget
Advisor for two different months in two browser tabs at the same instant)
could both pass the per-user/project-wide count check before either has
recorded its own call, allowing the effective per-user/project-wide daily cap
to be exceeded by a small margin in a narrow race window. This does not allow
unbounded fan-out (the per-key `claimGenerationSlot`/`CATEGORIZATION_BATCH_SIZE`
mechanisms still bound the total number of concurrently-racing requests to a
small, finite set — the number of distinct cache keys a user can plausibly
open at once), and does not cross user boundaries.

**Recommended fix:** Documented and accepted as a soft cap protecting cost/
quota, not a hard security boundary, consistent with the single-user/
small-team deployment target stated in `rate-limit.ts`'s own comments on
`REASONING_MODEL_MAX_CALLS_PER_USER_PER_DAY`/`_PROJECT_WIDE_PER_DAY`. If the
user base grows, tighten by moving the count-then-claim into a single
`SELECT ... FOR UPDATE`-style transaction or a Postgres advisory lock keyed
per user, rather than leaving it purely sequential.

### 2. `ReasoningModelCallLog` has no automated retention/pruning job yet

**Risk Level: Low (availability/cost, not a data-exposure issue)**

**Affected files:** `prisma/schema.prisma` (`ReasoningModelCallLog` model,
lines 1923-1955, and its own header comment's "Retention (flagged, not
enforced by this migration)" note).

**Scenario:** This table is an unbounded, ever-growing append-only log; every
row becomes worthless to both rate-limit queries once older than the
24-hour rolling window, but nothing currently deletes old rows. Over time
this is a storage-growth and query-performance concern (though both indexed
queries stay efficient via `@@index([userId, createdAt])`/`@@index([createdAt])`
regardless of table size). Not a security vulnerability, but flagged per this
review's mandate to check rate-limiting infrastructure end-to-end, and
because the schema's own comment already flags it as an open item this gate
should not silently let slip.

**Recommended fix:** Add a small scheduled cleanup step (a new cron route or
an addition to an existing daily cron) that deletes
`ReasoningModelCallLog` rows older than a modest multiple (e.g. 3-7x) of
`REASONING_MODEL_ROLLING_WINDOW_MS`. This is a Backend Engineer task, not a
Security Architect implementation — flagged here as the artifact needed.

### 3. Task-description cron count mismatch (informational only, not a finding)

**Risk Level: None**

The review brief referenced "five cron routes under `src/app/api/cron/`."
Only four exist: `categorize-transactions`, `financial-health-score-snapshot`,
`monthly-summary`, `net-worth-snapshot`. This is expected, not a gap: Spending
Insights (Feature 4) has no cron path by design — it is refresh-on-demand
only (`api-contracts.md`'s Feature 4 section; `insights.ts`'s own top-of-file
comment). All four cron routes that do exist were reviewed (see below); no
fifth route was found to be missing auth or otherwise unreviewed.

---

## Verified Controls (checked, no issue found)

### A. Prompt-injection defenses match the design doc exactly

- **Structural delimiters:** `lib/ai/prompts/build-prompt.ts`'s
  `buildUserPrompt` wraps every untrusted payload in
  `<untrusted_user_data>...</untrusted_user_data>`, with
  `neutralizeEmbeddedDelimiters` HTML-entity-escaping any literal delimiter
  token found *inside* the untrusted data itself before embedding — this
  specifically defeats an adversarial merchant/category/note string crafted
  to contain the literal closing tag to make the model perceive the block as
  ending early. Every one of the five features' prompt builders
  (`categorization.ts`, `advisor-schema.ts`, `monthly-summary-schema.ts`,
  `insights-schema.ts`, `health-score-narrative-schema.ts`) calls this single
  shared function — no feature hand-concatenates its own untrusted-data
  framing.
- **Closed-set enums:** `categorization-schema.ts`'s `buildCategorySuggestionSchema`
  builds `z.enum` over both `transactionId` and `categoryId` scoped to
  exactly that call's candidate ids (the Finding 4 fix from the design-stage
  review — both fields, not just `categoryId`, are closed sets). An
  out-of-set value literally cannot parse, independent of what the model was
  instructed to do.
- **Grounding checks:** `verify-grounding.ts`'s `verifyGrounding` is wired
  into all four narrative features (`advisor.ts`, `monthly-summary.ts`,
  `insights.ts`, `health-score-narrative.ts`) via
  `generate-structured-output.ts`'s `groundingData`/`extractCitedFigures`
  parameters — every `citedFigures` entry must match a real, caller-supplied
  figure within a 0.01 epsilon or the attempt is treated as a validation
  failure and retried once, then degraded to `"unavailable"`.
- **Narrative-safety checks:** `verify-narrative-safety.ts` is wired into the
  same four features via `extractNarrativeStrings`, rejecting any narrative
  containing an HTML/script-like tag, markdown link syntax, an echoed
  delimiter token, or an unlisted number token. Transaction
  Auto-Categorization correctly omits both grounding/narrative-safety checks
  (no narrative field exists in its closed-set-enum output — nothing to
  ground or safety-check), matching the design doc's own scoping.
- No feature bypasses `generate-structured-output.ts` to call the AI SDK's
  `generateObject` directly — `lib/ai/client.ts` is the only file importing
  `@ai-sdk/google`, and every feature server module imports only
  `fastModel`/`reasoningModel` from it plus `generateStructuredOutput`.

### B. Every DB query is scoped by an already-resolved `userId`

Checked every exported function in `categorization.ts`, `advisor.ts`,
`monthly-summary.ts`, `insights.ts`, `insights-candidates.ts`, `formula.ts`,
`service.ts`, `snapshot.ts`, `health-score-narrative.ts`. Every one takes
`userId` as a caller-supplied parameter (resolved upstream by
`getCurrentUser()` in a Server Action/Server Component, or by a cron loop's
own per-user loop variable) and threads it into every `where` clause. None of
these files call `getCurrentUser()` themselves or accept a client-supplied
user id parameter. `actions.ts` files (`transactions`, `budgeting`,
`dashboard`, `analytics`) all follow the standing
auth-then-validate-then-scope convention: `getCurrentUser()` first, fail
closed on `null`, then every subsequent Prisma call filtered by `{ ..., userId:
user.id }`.

Specifically verified for the frontend surface in scope: `acceptCategorySuggestion`/
`rejectCategorySuggestion`/`requestCategorySuggestion`
(`transactions/server/actions.ts:598-679`, `:530-583`) all look up the
client-supplied `suggestionId`/`transactionId` via `db.categorySuggestion.findFirst({
where: { id, userId: user.id } })` / `db.transaction.findFirst({ where: { id,
userId: user.id } })` before ever acting on it — a suggestion or transaction
id belonging to another user resolves to "not found," never an unauthorized
mutation. `suggestion-badge.tsx` and `transaction-table.tsx` never trust
anything beyond what these Server Actions return; no client-side ownership
assumption exists in either component.

### C. No feature ever passes a raw Prisma entity into a prompt builder

Every feature builds a narrow, explicit DTO field-by-field
(`CategorizationPromptInput`, `BudgetAdvisorPromptInput`,
`MonthlySummaryPromptInput`, `SpendingInsightsPromptInput`,
`HealthScoreNarrativePromptInput`) before calling `buildUserPrompt`. No
`include`-relation object or full Prisma row is ever spread into one of these
DTOs. Every untrusted string field (`merchant`, `notes`, `categoryName`,
`displayName`) is passed through `redactText()` before being placed into its
DTO, in every one of `categorization.ts`, `advisor.ts`, `monthly-summary.ts`,
`insights.ts`/`insights-candidates.ts`. The Health Score narrative correctly
uses no `redactText()` calls at all, since (per its own schema file's "Data
minimization" note) its entire prompt input is deterministic 0-100 scores
with zero user-authored strings anywhere in it — verified true by inspection
of `health-score-narrative-schema.ts`'s `HealthScoreNarrativePromptInput`.

### D. Cross-user isolation holds in every cron/batch path

- `categorize-transactions` cron
  (`generateAutomaticSuggestionsForAllUsers` → `generateAutomaticSuggestionsForUser`)
  iterates users **sequentially**, and the one batch-shaped payload in this
  phase (a chunk of one user's transactions + that same user's categories) is
  guarded by `assertSingleUserBatch` immediately before prompt construction —
  the only place in Phase 4a this guard is actually exercised, since it is
  the only feature whose payload is a list of rows rather than a
  single-user scalar/small-object read.
- `monthly-summary`/`financial-health-score-snapshot` crons
  (`generateMonthlySummariesForAllUsers`,
  `captureAllUsersFinancialHealthScoreSnapshots`) also iterate sequentially;
  neither ever builds a list-of-rows-spanning-multiple-users payload (each
  call's data is scalar/small-object, scoped by one `userId` parameter per
  iteration), so `assertSingleUserBatch` is correctly not invoked there —
  each file's own doc comment makes this structural argument explicitly and
  it holds up under inspection.
- `net-worth-snapshot` cron (pre-existing, Phase 3a) is unchanged and was not
  re-reviewed in depth here beyond confirming its cron-auth pattern is the
  template the four Phase 4a/later cron routes correctly copied.

### E. Cron route authentication

All four cron routes (`categorize-transactions`, `financial-health-score-snapshot`,
`monthly-summary`, `net-worth-snapshot`) implement the identical check:

```
if (!cronSecret || !providedSecret || providedSecret !== cronSecret) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
```

This correctly returns the same 401 for three distinct cases — wrong secret,
missing header, and `CRON_SECRET` unset entirely — collapsing them into one
indistinguishable response so an unconfigured deployment is never mistaken
for "no auth required," and so a caller cannot use response differences to
probe whether the secret is configured. No route leaks any configuration
detail (env var presence, expected secret shape, etc.) in its error body.
`.env` is git-ignored and not tracked in the repository; `.env.example`
only contains empty placeholder values for `CRON_SECRET`/
`GOOGLE_GENERATIVE_AI_API_KEY`.

### F. Rate-limiting ordering across all four `reasoningModel` features

Verified that `checkReasoningModelRateLimit` (cross-feature, per-user +
project-wide, rolling day) runs **before** the feature's own per-key
`claimGenerationSlot` in every one of the four call sites:

- `advisor.ts`'s `claimReasoningModelGenerationSlot` (lines 199-209)
- `monthly-summary.ts`'s `claimReasoningModelGenerationSlot` (lines 440-451)
- `insights.ts`'s `claimReasoningModelGenerationSlot` (lines 314-324)
- `health-score-narrative.ts`'s inline check (lines 243-246) — this feature
  has no per-key cache row of its own (by design; its "cooldown" is already
  provided by `snapshot.ts`'s upsert idempotency), so there is no second
  claim step to order against, but the cross-feature check is still applied
  before the model is ever called.

`recordReasoningModelCall` is called exactly once per actual
`generateStructuredOutput` attempt (success or failure) in every one of the
four features, at the one call site that actually invokes the model — never
inside the slot-claiming step, and never skipped on a failed attempt. No
feature calls `generateStructuredOutput` directly bypassing this gate; every
call site funnels through `generateAndPersist`
(`advisor.ts`/`monthly-summary.ts`/`insights.ts`) or the single function body
of `generateFinancialHealthScoreNarrative` (`health-score-narrative.ts`),
each of which is the sole caller of `generateStructuredOutput` in its file.

### G. Prisma schema — Phase 4a additions

`CategorySuggestion`, `BudgetAdvisorCache`, `MonthlySummary`,
`SpendingInsightsCache`, `FinancialHealthScoreSnapshot`,
`ReasoningModelCallLog` all: declare `userId String` with `user User
@relation(..., onDelete: Cascade)`; carry a `userId`-leading composite index
(`@@index([userId, ...])` or `@@index([userId])`) satisfying every query
shape used against them; and use `onDelete: Cascade`/`SetNull` appropriately
(`CategorySuggestion.suggestedCategoryId` correctly `SetNull`, matching the
"invalidate, don't silently keep a dangling id" product rule). No foreign key
or missing index was found that would allow one user's row to be queried,
joined, or counted under another user's scope.
`category_suggestion_transactionId_pending_key` (the hand-authored partial
unique index closing the cron double-invocation race, Finding 5 from the
design-stage review) is confirmed present and correctly shaped in
`prisma/migrations/20260722193327_category_suggestion_pending_partial_unique_index/migration.sql`.

### H. XSS / rendering

No feature persists or returns HTML from a narrative field without having
already run it through `verify-narrative-safety.ts`'s HTML-tag/markdown-link
rejection (which triggers the one retry, then `"unavailable"` on repeat
failure — an unsafe narrative is structurally never persisted). No
`dangerouslySetInnerHTML` usage exists anywhere in the reviewed frontend
surface or in the codebase's AI-narrative-consuming components generally
(one match found repo-wide, in `analytics/types.ts`'s own doc comment
explicitly *prohibiting* that pattern for `SpendingInsight.text`, not an
actual usage).

### I. SQL Injection / secrets / CSRF

All Phase 4a database access goes through Prisma's parameterized query
builder — no raw SQL string concatenation was found in any reviewed file.
`GOOGLE_GENERATIVE_AI_API_KEY` is read in exactly one file
(`lib/ai/client.ts`) and never logged, returned to a client, or embedded in
any prompt. CSRF: consistent with the rest of this codebase's existing
posture (Next.js Server Actions' own POST-only, same-origin-enforced
invocation model — not a Phase 4a-specific concern, and unchanged from prior
phases' accepted baseline).

---

## Verdict

**APPROVE.**

The shipped Phase 4a implementation faithfully carries through every
prompt-injection defense, grounding/narrative-safety check, rate-limiting
ordering rule, and cross-user isolation invariant documented in the
design-stage review, across all five features, their shared `lib/ai/`
foundation, all four cron routes, and the one frontend surface in scope. The
two Low findings above (the count-then-claim race window on the
cross-feature rate limit, and the missing `ReasoningModelCallLog` retention
job) are both pre-existing, explicitly-documented, accepted trade-offs
appropriate to this application's stated single-user/small-team deployment
target — neither is a data-exposure or authorization gap, and neither should
block Release Manager sign-off. Recommend tracking finding #2 (retention
job) as a fast-follow, non-blocking backlog item.
