# FinanceOS — Architecture (Phase 0 + Phase 1 + Phase 2 + Phase 3a + Phase 3b + Phase 4a foundation)

Scope: repo skeleton (Phase 0), the Accounts/Transactions/Dashboard-v1 domain (Phase 1), Budgeting/Savings Goals/Bills/Calendar v1/Notifications v1 plus the Transactions receipt-attachment addendum (Phase 2), Debt Tracker/Investments/Recurring Income plus the Net Worth aggregation update and Net Worth Snapshot job (Phase 3a), the Net Worth History chart, the Analytics suite, and Financial Goals (Phase 3b), per [docs/planning/roadmap.md](../planning/roadmap.md). Later phases extend this document; they do not replace it.

**Phase 4a status note — this document is a pointer, not the source of truth, for AI-specific decisions.** Phase 4a's substantial technical design (LLM provider/approach, `lib/ai/`'s internal module boundaries, the Zod structured-output pattern, prompt-injection defenses, the fallback contract, and cost/latency bounds for all five AI features) is documented in full in **[docs/architecture/ai-features-design.md](ai-features-design.md)**, written by the AI Engineer per `roadmap.md`'s Phase 4a milestone 2. That document is already substantial (390+ lines) and explicitly recommended a short pointer from this file rather than folding its content in — this section is that pointer, plus the pieces that document deliberately left to this Architect: where `lib/ai/` and each feature's AI-owned files sit in the overall module map, the five features' API-surface classification (documented fully in `api-contracts.md`'s new Phase 4a section), and the Financial Health Score's historical-snapshot module-placement call (below). For any AI-internal question (why Google Gemini — revised from an initial Anthropic decision, see that document's provider-swap addendum — why `generateObject`, the retry-once policy, the grounding-verification mechanism, the categorization schema's dynamic enum technique), `ai-features-design.md` is authoritative; this document is not repeated or restated there.

**Phase 3a status note (unchanged):** the `Account`-linkage schema question (Risk #9, roadmap.md Phase 3a section) is resolved — see "Phase 3a — the Account-linkage handoff" below.

**Phase 3b status note (unchanged):** this pass assumes Phase 3a's schema (as actually built and documented in `docs/database/er-diagram.md`'s Phase 3a design notes) is settled and live. Phase 3b hands the Database Architect two new schema requirements — `FinancialGoal` (plus a small join table) and `DismissedSubscriptionMerchant` — both specified in full below, following the same "flag the requirement precisely, Database Architect makes the final call" pattern Phase 3a established for Debt/Investments.

## Guiding pattern: feature-first modules under App Router

Each business domain (accounts, transactions, dashboard, categories, budgeting, goals, bills, notifications, debt, investments, recurring-income, analytics, financial-goals, and — as of Phase 4a — financial-health-score) is a **feature module**: its own folder under `features/`, containing everything specific to that domain — server logic, types, validation schemas, hooks — with `app/` staying thin (routing + composition only) and `components/` staying generic (no domain knowledge).

This keeps ownership unambiguous, which matters given the org's role boundaries: Backend Engineer owns `features/<domain>/server/`, Frontend Lead owns `app/`, UI Component Engineer owns `components/`, **and, as of Phase 4a, AI Engineer owns `lib/ai/` plus the AI-generation-specific files inside each of the five participating features' own `server/` directories (never a whole feature module of their own — see below).**

**`lib/ai/` itself is not a feature module — it is cross-feature infrastructure**, the same category as `lib/recurrence.ts` and `lib/merchant-normalization.ts`: framework-agnostic (aside from its one Vercel-AI-SDK/provider dependency, isolated to `client.ts`), imported by multiple feature modules, and never importing back from any of them (see the updated module-boundary table and dependency graph below). This is a placement rule, not a special case invented for AI — it is the exact same "genuinely cross-feature, needed by more than one domain" test `lib/merchant-normalization.ts` was held to in Phase 3b.

**New in Phase 4a — the AI-owned sibling-file convention.** Every one of the five features' AI-generation logic (prompt assembly, the call into `lib/ai/generate-structured-output.ts`, and that feature's own generated-content persistence) lives in its **own** new file(s) inside that feature's existing `server/` directory — never merged into that feature's existing `service.ts` or `actions.ts`. This mirrors the Phase 3b precedent already set by `features/analytics/server/subscription-detection.ts` (a distinct concern earns its own file even within an already-established feature module), extended here for an additional, Phase-4a-specific reason: AI-generation code has a fundamentally different failure mode — network-dependent, non-deterministic, and contractually required to return `AiFeatureResult<T>` and never throw (`ai-features-design.md` §5) — than the rest of a feature's server code, which is plain, deterministic Prisma reads/writes. Isolating AI-generation code into its own file(s) keeps that "everything else in `service.ts` is deterministic" invariant legible at a glance for every reviewer, present and future. `lib/ai/generate-structured-output.ts` remains the **only** place in the entire codebase that ever calls the model provider — every one of the five features' new files reaches it through that one function, never a provider SDK directly (`ai-features-design.md` §2).

**New in Phase 3a — the isomorphic pure-calculation-file convention.** Every prior "pure function, no Prisma" module (e.g. Bills' `occurrence.ts`) lived under `server/` because nothing client-side ever needed to call it directly — a Server Component always mediated. Debt Tracker's snowball/avalanche comparison breaks that assumption: AC6/AC7 require the comparison to recompute **instantly** as a user adjusts the extra-payment amount, which is a bad fit for a server round-trip on every keystroke. The fix is not a new pattern family, just a placement rule: **a pure calculation module that a Client Component needs to call directly must live at the feature root (sibling to `types.ts`), never under `server/`.** Anything under `server/` is server-only by convention in this codebase (it's where Prisma-touching code lives), and importing a `server/` file into a `"use client"` component is exactly the kind of accidental server/client boundary violation Next.js bundling should never be asked to paper over. See `features/debt/payoff-math.ts` in folder-tree.md's Phase 3a additions.

**Phase 3b note on this convention:** none of Phase 3b's three features introduce a client-instant-recompute requirement analogous to Debt's strategy comparison — Analytics' shared reporting-period control and Financial Goals' CRUD forms both follow the ordinary "change a filter/field → Server Action or searchParam navigation → Server Component re-renders" flow already used everywhere outside Debt. Subscription Cost Detection's pattern-matching algorithm is pure and unit-testable exactly like `payoff-math.ts`, but nothing client-side ever calls it directly (detection always happens server-side, as part of a Server Component's initial read) — so it stays under `server/` (`features/analytics/server/subscription-detection.ts`), not at the feature root. This is a placement rule, not a purity rule: a function only earns the feature-root/`-math.ts` treatment when a Client Component genuinely needs to import and call it directly for instant, round-trip-free recompute.

**Phase 4a note on this convention:** none of the five AI features introduces a client-instant-recompute requirement either — every on-demand "refresh"/"reconsider" action is a bounded, rate-limited round trip to the model, by design (`ai-features-design.md` §6's entire cost/latency-bounding argument depends on these calls **not** running on every keystroke or every render). So no AI-generation file is ever a feature-root, client-callable pure module; every one of them stays under `server/`, called only from a Server Component (initial view), a Server Action (on-demand refresh/reconsider), or a cron Route Handler (batch/scheduled generation) — never directly from a Client Component.

## Server/client boundary

- **Server Components by default** for all pages (`app/**/page.tsx`) — fetch data directly via server-only data-access functions, no client-side waterfall for initial load. **(Phase 4a)** every one of the five features' *initial-view* read (the categorization suggestion badge, the Advisor card, the most-recent Monthly Summary, the Insights widget, the Health Score card/detail view) is a Server Component direct call returning `AiFeatureResult<T>` (or, for the Health Score's deterministic half, a plain, non-AI-wrapped value — see below) — never a client-side fetch-on-mount for first paint.
- **Server Actions** (`features/<domain>/server/actions.ts`) for mutations. **Phase 4a adds:** `features/transactions/server/actions.ts`'s `acceptCategorySuggestion`, `rejectCategorySuggestion`, `requestCategorySuggestion` (the manual "reconsider" path); `features/budgeting/server/actions.ts`'s `refreshBudgetAdvisor`; `features/analytics/server/actions.ts`'s `refreshSpendingInsights`; optionally `features/dashboard/server/actions.ts`'s `regenerateMonthlySummary` (per the product spec's "may optionally be offered" wording). See api-contracts.md's Phase 4a section for exact input/output shapes and the `ApiResult<AiFeatureResult<T>>` composition rule these all share.
- **Route Handlers** (`app/api/<domain>/route.ts`) only where a true HTTP endpoint is needed. **Phase 4a adds exactly three, all cron/system routes, none session-authenticated:** `app/api/cron/categorize-transactions/route.ts`, `app/api/cron/monthly-summary/route.ts`, `app/api/cron/financial-health-score-snapshot/route.ts` — each shared-secret authenticated and plain-JSON, mirroring `app/api/cron/net-worth-snapshot/route.ts`'s existing, already-established exception to `ApiResult<T>`. **No new session-authenticated Route Handler is introduced for any of the five features** — every on-demand generate/refresh path is a Server Action, not a client-refetchable route, because none of the five features has a Net-Worth-History-style "user picks a different range, must refetch without a full navigation" requirement; a Server Action followed by `revalidatePath` is sufficient everywhere.
- **Client Components** are opt-in (`"use client"`) for interactive pieces. **Phase 4a adds:** the inline suggestion badge + accept/reject buttons and the batch-review list (Transactions), the Advisor card's "Refresh"/collapse controls (Budgeting), the Insights widget's "Refresh" control (Analytics/Dashboard), and the "AI-generated" visual label shared by all narrative surfaces (per `ai-features.md`'s Cross-Cutting Requirement #3) — all thin, presentation-only Client Components consuming an already-fetched `AiFeatureResult<T>` prop; none of them re-implements the AI call itself or bypasses the Server Action layer.
- TanStack Query is used client-side only where a genuine client-cache benefit exists (unchanged rule from Phase 1/2/3a/3b). **Phase 4a adds no new hooks.** None of the five features has a toggle-and-refetch need analogous to `use-net-worth-history.ts`'s range selector — every "Refresh" action is a Server Action + `revalidatePath`, the same mutation-triggers-re-render flow already used by every archive/unarchive/create domain in this app, not a client-cache pattern.

## Data flow (Phase 3a example: Debt Tracker's snowball/avalanche comparison)

This is the first data flow in the app where the "predictable response shape" round-trip is deliberately **not** re-run on every user input, so it's worth spelling out as its own example alongside the Phase 1 Transactions flow already documented below:

```
Initial load (Server Component)
  → features/debt/server/service.ts.getDebts(userId)
    → prisma client (lib/db.ts) → PostgreSQL
    → per debt: features/debt/payoff-math.ts.computeAmortization(debt) (minimum-payment-only projection, AC4)
  ← DebtWithProjection[] rendered server-side (payoff date, total interest, negative-amortization warning)

Strategy comparison (Client Component, features/debt/components/strategy-comparison.tsx)
  → receives the same DebtWithProjection[] as a prop from the Server Component (no refetch)
  → user types an extra-payment amount
  → features/debt/payoff-math.ts.compareSnowballAndAvalanche(debts, extraPayment) — pure function,
    runs entirely in the browser, recomputes on every keystroke with no network round-trip
  ← comparison table re-renders instantly

Mutating a debt (e.g. editing balance/rate/minimum payment)
  → React Hook Form + Zod (client-side validation, same schema as server)
  → Server Action updateDebt
    → features/debt/server/validation.ts (re-validated server-side)
    → features/debt/server/service.ts (persists the edit; does NOT recompute/store projections —
      they are always derived at the next read, same "computed at read time" rule as Goals/Bills)
  ← ApiResult<Debt> → revalidatePath → Server Component re-fetches → payoff-math.ts recomputes
```

Unchanged Phase 1 example (Transactions) retained for reference:
```
User action (client form/table)
  → React Hook Form + Zod (client-side validation, same schema as server)
  → Server Action or /api/transactions route (Backend Engineer)
    → features/transactions/server/validation.ts (Zod, re-validated server-side — never trust client)
    → features/transactions/server/service.ts (business logic: dedupe on import, category resolution)
    → prisma client (lib/db.ts) → PostgreSQL
  ← predictable response shape: { success: true, data } | { success: false, error }
  → TanStack Query cache updated → table re-renders
```

**New Phase 3b example — Net Worth History's range selector (a client-cache-refetch flow, not a mutation):**
```
Initial load (Server Component, app/(dashboard)/page.tsx)
  → features/dashboard/server/net-worth-history.ts.resolveDefaultRange(userId)  (AC3's "under 90 days
    of history → default All Time, otherwise default 90 Days" rule — a cheap min(capturedDate)/count
    query, not a full row fetch)
  → features/dashboard/server/net-worth-history.ts.getNetWorthHistory(userId, defaultRange)
  ← NetWorthHistoryResponse (see api-contracts.md) rendered server-side as the chart's initial state,
    passed as props into the Client Component below

Range/breakdown interaction (Client Component, features/dashboard/components/net-worth-history-chart.tsx)
  → user picks a different range (30d/90d/1y/all)
  → features/dashboard/hooks/use-net-worth-history.ts (TanStack Query) →
    GET /api/dashboard/net-worth-history?range=  → features/dashboard/server/net-worth-history.ts.getNetWorthHistory
  ← ApiResult<NetWorthHistoryResponse> → chart re-renders with the new range's points
  → breakdown toggle (Net Worth vs. Assets/Debt) is a pure client-side view switch over the
    *already-fetched* response's existing `assets`/`debt` series — no new query per AC5's
    "no additional query concept"
```

**New Phase 3b example — Analytics' shared reporting-period control (searchParam navigation, not a client fetch):**
```
User picks a reporting period (This Year / Last 12 Months / Year-to-Date / All Time)
  → features/analytics/components/reporting-period-select.tsx (Client Component) →
    router.push(`/analytics?period=last-12-months`) (searchParam navigation, same mechanism
    Budgeting's month-navigator and Bills' calendar already use — no new pattern)
  → app/(dashboard)/analytics/page.tsx (Server Component) re-renders, reading `period` from
    `searchParams` and passing the resolved `{ start, end }` range into every metric card
  → each card is its own `<Suspense>` boundary calling its own analytics.server.* function
    directly (Server Component composition, no client waterfall) — one metric's "not enough
    data yet" state never blocks another card's render (AC3)
```

**New Phase 3b example — Financial Goals' read-live progress (no contribution flow exists):**
```
Initial load (Server Component, app/(dashboard)/financial-goals/page.tsx)
  → features/financial-goals/server/service.ts.getFinancialGoals(userId, { includeArchived? })
    → per DEBT_PAYOFF goal: features/debt/server/service.ts.getDebtById(userId, linkedDebtId)
      (reads the Debt's live effectiveBalance and archivedAt, regardless of the Debt's own
      archived state — see "Financial Goals" section below for why this must include archived Debts)
    → per NET_WORTH_SAVINGS_TARGET goal measuring Total Net Worth:
      features/dashboard/server/service.ts.getNetWorth(userId)
    → per NET_WORTH_SAVINGS_TARGET goal measuring an Account subset:
      features/accounts/server/service.ts.getAccounts(userId) (filtered/summed locally)
    → per SAVINGS_RATE_TARGET goal: features/dashboard/server/service.ts.getMonthlySummary(userId, month)
      called once per each of the trailing 3 months, averaged (excluding any $0-income month)
  ← FinancialGoalWithProgress[] — every progress/completion field computed at read time,
    nothing written back to FinancialGoal itself (see api-contracts.md's shape)

Mutating a goal (create/edit/archive) — an ordinary Server Action, same CRUD shape as every
other archive/unarchive domain. There is deliberately no "log a contribution/update" action
anywhere in this flow (AC6) — that is the one, defining structural difference from Savings Goals.
```

**New Phase 4a example — Transaction Auto-Categorization's automatic (cron) path vs. the manual "reconsider" path:**
```
Automatic path (batch cron, no user session)
  app/api/cron/categorize-transactions/route.ts (POST, shared-secret authenticated)
    → features/transactions/server/categorization.ts.generateSuggestionsForUncategorized()
      → queries Uncategorized transactions with no existing PENDING suggestion row, chunked
        into fixed-size batches (ai-features-design.md §6)
      → per batch: lib/ai/prompts/build-prompt.ts assembles the prompt (redact.ts sanitizes
        merchant/notes text first) → lib/ai/generate-structured-output.ts, schema built
        dynamically per batch by categorization-schema.ts's buildCategorySuggestionSchema
        (candidate category IDs = that user's real, current category list)
      → on AiFeatureResult "ok": persists one new suggestion row per transaction (PENDING) —
        never writes Transaction.categoryId directly (§4.4's structural no-autonomous-write rule)
      → on "unavailable": no row is written; the transaction is simply left Uncategorized,
        identical to the feature not existing (product spec's Edge Cases)
  ← { processed: number } plain JSON, mirrors net-worth-snapshot's cron contract

Manual "reconsider" path (Server Action, user-initiated)
  → user clicks "Suggest a category" on any transaction (categorized or not)
  → Server Action requestCategorySuggestion({ transactionId })
    → lib/ai/rate-limit.ts.canRefreshNow(...) checked first (per-transaction minimum interval)
    → features/transactions/server/categorization.ts (same single-transaction call path as above)
  ← ApiResult<AiFeatureResult<CategorySuggestion>> → UI shows the suggestion badge or the
    "Couldn't generate a suggestion right now" message, per the AiFeatureResult status

Accepting/rejecting (ordinary Server Action, no AI call involved)
  → Server Action acceptCategorySuggestion({ suggestionId })
    → features/transactions/server/service.ts's existing category-assignment path (identical
      to a manual edit, per Feature 1 AC4) — this is the ONLY code path that ever writes
      Transaction.categoryId as a result of a suggestion
  ← ApiResult<Transaction> → revalidatePath → transaction row re-renders with its real category
```

**New Phase 4a example — Financial Health Score: a zero-AI-dependency score, plus an optional, separately-generated narrative:**
```
Score + breakdown (Server Component, always available, no AI call in this path at all)
  → features/financial-health-score/server/service.ts.getFinancialHealthScore(userId)
    → debt.service (Debt-to-Income), recurring-income.service (actual income denominator),
      budgeting.service.getBudgetHealthScore (Budget Adherence, reused verbatim), dashboard
      .service.getNetWorth / net-worth-history.ts (Net Worth Trend, trailing 3 months)
  ← FinancialHealthScoreBreakdown — pure arithmetic, renders identically whether or not the
    AI provider is reachable at all (Feature 5's own strongest degradation guarantee)

Historical trend + narrative (cron-driven, decoupled from any page view)
  app/api/cron/financial-health-score-snapshot/route.ts (POST, shared-secret authenticated)
    → features/financial-health-score/server/snapshot.ts.captureAllUsersHealthScoreSnapshots()
      → per user: calls service.ts's same formula, persists a FinancialHealthScoreSnapshot row
      → in the SAME invocation (ai-features-design.md §6's explicit recommendation): calls
        health-score-narrative.ts → lib/ai/generate-structured-output.ts (groundingData = the
        four just-computed component values + their prior-snapshot delta) → persists the
        narrative onto that same snapshot row (or leaves it null on "unavailable")
  ← { processed: number } plain JSON

Page view (any time after the above has run at least once)
  → Server Component reads the latest persisted snapshot row for its narrative + the full
    snapshot history for the trend sparkline — no AI call ever happens on a page view
```

## Folder-level module boundaries

| Folder | Owner | May import from | Must NOT import from |
|---|---|---|---|
| `app/` | Frontend Lead | `components/`, `features/*/hooks`, `features/*/types`, `features/*/server/service.ts` (direct read calls from Server Components), `features/*/payoff-math.ts`-style feature-root pure modules | `features/*/server/actions.ts` only via a proper Server Action reference, never business logic reached into ad hoc |
| `components/ui/`, `components/shared/` | UI Component Engineer | nothing domain-specific | any `features/*` |
| `features/<domain>/server/` | Backend Engineer (AI Engineer for the AI-owned files within it, per the sibling-file convention above) | `lib/db.ts`, `lib/auth.ts`, `lib/uploadthing.ts` (Transactions only), `lib/recurrence.ts` (Bills, Recurring Income), `lib/transaction-link-guard.ts` (Bills, Recurring Income), `lib/merchant-normalization.ts` (Analytics), **`lib/ai/`'s exported functions/types only, never a provider SDK directly (Transactions, Budgeting, Dashboard, Analytics, Financial Health Score — Phase 4a)**, other domains' server code only via explicit, individually-exported service calls (not direct Prisma reach-through) | `app/`, `components/` |
| `features/<domain>/` (types, schemas, hooks, feature-root pure modules like `payoff-math.ts`) | shared (Backend Engineer defines, Frontend Lead consumes) | — | — |
| `lib/` | Solution Architect + Database Architect (db client), Backend Engineer (auth helpers, UploadThing SDK singleton, recurrence math, transaction-link guard, merchant normalization) | — | — |
| `lib/ai/` | AI Engineer | `@ai-sdk/google` / the `ai` package (isolated to `client.ts` only, revised from an initial `@ai-sdk/anthropic` decision — see `ai-features-design.md`'s provider-swap addendum), nothing feature-specific | `app/`, `components/`, any `features/*` — **this is the one direction that must never be crossed**: features import `lib/ai/`, `lib/ai/` never imports a feature back. This is what keeps the module graph acyclic despite five features depending on it (see the Phase 4a dependency graph below). |

This prevents circular dependencies: UI components never know about features; features never import from `app/`; only `app/` composes both; and, as of Phase 4a, `lib/ai/` is a pure fan-in leaf exactly like `lib/recurrence.ts`, never a fan-out source back into any feature.

## Naming conventions

See [naming-standards.md](naming-standards.md).

## API contracts

See [api-contracts.md](api-contracts.md).

## Reusable utilities established in Phase 0/1 (for later phases to reuse, not redefine)

- `lib/db.ts` — singleton Prisma client
- `lib/auth.ts` — Better Auth server instance + `getCurrentUser()` helper (every domain's server code calls this to scope queries by user ID — this is the primary defense against the cross-user data leak risk flagged in the risk register)
- `lib/api-response.ts` — the `{ success, data } | { success, error }` response helper, used by every Route Handler and Server Action from Phase 1 onward
- `components/ui/data-table/` — generic TanStack Table wrapper (UI Component Engineer), domain-agnostic; Transactions table (Phase 1), and every future list/table (budgets, bills, debts, investments) composes this instead of building a new table
- `components/shared/stat-card.tsx`, `components/shared/progress-ring.tsx` — dashboard building blocks reused by every phase's "overview" screens

## Reusable utilities added in Phase 2

- `components/shared/month-navigator.tsx` — domain-agnostic prev/current/next month stepper, shared by Budgeting's planner and Bills' calendar view.
- `lib/uploadthing.ts` — `utapi` (UploadThing server SDK) singleton, mirroring `lib/db.ts`'s singleton-export pattern.
- `features/transactions/server/aggregations.ts` — `getSpendingByCategoryForMonth` / `getUncategorizedSpendingForMonth`, shared by Dashboard and Budgeting.

## Reusable utilities added in Phase 3a

- **`lib/recurrence.ts`** (NEW) — pure, framework-agnostic schedule-cadence math: `getNextOccurrenceDate(fromDate, schedule)` and `generateOccurrenceDatesBetween(fromDate, throughDate, schedule)`, for the `weekly | biweekly | monthly | quarterly | annually` schedule set. Extracted from Bills' existing `features/bills/server/occurrence.ts`. See the earlier version of this document for the full extraction rationale.
- **`lib/transaction-link-guard.ts`** (NEW) — narrow, read-only, cross-domain Prisma access answering "is this Transaction already linked to any recurring-item occurrence, anywhere in the product." One deliberate carve-out in this codebase's module-boundary rule, justified in detail earlier in this document.
- **`features/debt/payoff-math.ts`** — pure functions: `computeAmortization(debt, extraPayment)`, `compareSnowballAndAvalanche(debts[], extraPayment)`.

## Reusable utilities added in Phase 3b

- **`lib/merchant-normalization.ts`** (NEW) — `normalizeMerchantName(raw: string): string`, a pure, framework-agnostic string-normalization function (trim, collapse internal whitespace, case-fold, strip a small set of common corporate/domain suffixes — e.g. `.COM`, `INC`, `LLC` — the exact suffix list is a Backend Engineer implementation detail, not an architectural one). This lives in `lib/` — not inside `features/analytics/` — for the same reason `lib/recurrence.ts` does: it is genuinely cross-feature shared infrastructure, needed by **two** of Analytics' Pass 1/Pass 2 metrics (Top Merchants, Subscription Cost Detection), and framework/Prisma-agnostic (pure string transformation, safe to unit-test with fixture strings alone, same testability bar as `payoff-math.ts`).

  **Explicitly not a merge with Transactions' existing CSV-import dedup normalization.** `features/transactions/server/import.ts` already does a private, unexported `merchant.trim().toLowerCase()` normalization for its own duplicate-detection key (`buildDedupeKey`, per AC18's "same date, amount, and merchant already on file"). This is a **different, stricter** normalization than what Analytics needs: CSV dedup wants two rows to match only when their merchant text is *effectively identical* (a false match here would silently drop a legitimate transaction), while Top Merchants/Subscription Detection deliberately want a **fuzzier** match that also folds "NETFLIX.COM" and "Netflix" together (analytics.md's own example) — a false match here just groups two rows into one merchant bucket, a far lower-severity mistake than accidentally discarding a real transaction. Unifying these two into one function would either weaken CSV dedup's precision or under-group Analytics' merchant families; they are correctly two separate, independently-justified normalization rules that happen to share a name. `lib/merchant-normalization.ts` is net-new, and `features/transactions/server/import.ts`'s existing private helper is explicitly **not** touched or reused by this phase — flagged here so a future implementer doesn't "simplify" by merging them.

## Reusable utilities added in Phase 4a

- **`lib/ai/`** (NEW MODULE) — `client.ts` (`fastModel`/`reasoningModel` exports, the only file touching `@ai-sdk/google` — provider revised from an initial Anthropic decision; see `ai-features-design.md`'s provider-swap addendum), `generate-structured-output.ts` (the one reusable "prompt → validated object" call, retry-once-then-degrade), `types.ts` (`AiFeatureResult<T>`, `AiFailureReason`), `prompts/build-prompt.ts` (instruction/untrusted-data delimiter framing), `verify-grounding.ts` (anti-fabrication check for narrative features), `rate-limit.ts` (`canRefreshNow`, batch-size cap constant), `redact.ts` (merchant/notes/category-name sanitization before prompt interpolation). Full behavior, call signatures, and reasoning: `ai-features-design.md` §2–§6. This document only records *where it sits in the module map* (above) and *that nothing else may talk to the model provider directly*.

## Phase 3a module boundaries and cross-domain reads

Three new feature modules ship in Phase 3a: `debt`, `investments`, `recurring-income`. Their dependency direction, laid out the same way Phase 2's was, to keep the module graph acyclic:

```
Accounts, Transactions, Categories        (Phase 1 base layer — unchanged; still has zero
        ↑            ↑                     dependency on any Phase 2 or Phase 3a/3b module)
        |            |
      Debt      Investments                (each reads Accounts read-only; Investments additionally
        |            |                      writes a recalculated balance back onto Account.
        |            |                      Neither Debt nor Investments imports the other.)
        |            |
        └─────┬──────┘
              ↓
          Dashboard                        (adds Net Worth aggregation reads into Debt and
                                            Investments, plus a snapshot writer)

Bills  ←──────────────→  Recurring Income  (NOT a direct import in either direction — both instead
   ↓                          ↓              depend one-directionally on lib/transaction-link-guard.ts)
   └────────┬─────────────────┘
            ↓
   lib/transaction-link-guard.ts

Recurring Income  →  Transactions           (link-picker search + read linked transaction amount)
```

Concretely, unchanged from the original Phase 3a design: Debt's optional Account link, Investments' derived-balance write-back, and Recurring Income's Transactions link-picker reuse — see the earlier sections of this document (retained below, in full) for the complete reasoning.

- **`features/debt/server/`** calls into `features/accounts/server/service.ts` **only if** the Database Architect's chosen linkage shape includes an optional Account link (adopted: Option C, hybrid) — `debt.service`'s "effective balance" helper reads the linked Account's balance live via `accounts.service.getAccountById`, the same "read live via the join, never copied" precedent already established for `BillOccurrence.transactionId`.
- **`features/investments/server/`** calls into `features/accounts/server/service.ts` for container CRUD/lookup (read) and **writes back** a recalculated balance onto the Account whenever a holding is created/updated/closed.
- **`features/recurring-income/server/`** calls into `features/transactions/server/service.ts` for the link-picker search and to read the linked Transaction's amount at render time.
- **`features/dashboard/server/service.ts`** adds calls into `debt.service` (total active, unlinked-to-account debt liability).
- **`features/dashboard/server/snapshot.ts`** is added to the existing Dashboard module.

### Investments → Accounts: the derived-balance write-back (a deliberate, narrow exception)

Unchanged from the original Phase 3a design — see `docs/database/er-diagram.md`'s Phase 3a design note #4 for the adopted, as-built version of this reasoning.

### Cross-feature exclusivity: Bills ↔ Recurring Income (a Transaction backs at most one occurrence, of either kind)

Unchanged from the original Phase 3a design — see `docs/database/er-diagram.md`'s Phase 3a design note #5 for the adopted, as-built version, including the explicit decision **not** to add a database trigger this phase (application-level guard only, a monitored risk).

## Phase 3a — the Account-linkage handoff (resolved, for reference)

Per Risk #9 and roadmap.md's Phase 3a section, the Database Architect made the schema-shape call: **Option C (hybrid, optional link)** for Debt, and **"grow `Account` as the container"** for Investments — both matching this Architect's original recommendation. See `docs/database/er-diagram.md`'s Phase 3a design notes #1–#2 for the adopted, as-built reasoning. This section is retained (rather than deleted) purely as a historical record of the handoff; Phase 3b's design below treats both decisions as settled fact, not an open variable.

---

## Phase 3b — Net Worth History, Analytics, Financial Goals

Per `roadmap.md`'s Phase 3b section and `docs/product/{net-worth-history,analytics,financial-goals}.md`. This phase closes out v1. Three independent read-heavy/insight-layer features, in the Roadmap's stated build order: Net Worth History chart, then Analytics (Pass 1, then Pass 2), then Financial Goals.

### Risk #11 — Analytics query strategy: raw on-read aggregation, not materialized/cached aggregates

**Decision: every one of the 11 Analytics metrics is computed via on-read Prisma aggregation queries (`aggregate`/`groupBy`, or a single bounded, column-projected `findMany` reduced in application code where Prisma's query API can't express the grouping directly), scoped by `userId` and by the shared reporting-period range where applicable. No materialized view, no cache table, no background/scheduled pre-computation job is introduced for Analytics in this phase.**

This follows this codebase's established convention exactly — every derived value everywhere else (Budget Health Score, Goal progress, Bill/Income occurrence status, Debt payoff projections, Investment gain/loss) is computed at read time and never stored, and `docs/database/performance-considerations.md` has explicitly declined to introduce a caching layer at every prior opportunity ("No caching layer... dashboard queries are cheap enough at this data scale to compute on each request," restated again in the Phase 3a additions: "No caching layer is introduced for any Phase 3a read path... consistent with the Phase 0/1 decision"). Risk #11 asks this Architect to affirmatively re-evaluate that default against Analytics' specific read patterns rather than inherit it by default — done, below, metric by metric, and the conclusion is that the default holds:

- **Every metric is scoped to one user's own data.** This app has never had a cross-user aggregation query, and Analytics doesn't introduce one — the performance question is "how expensive is one user's own history," not "how expensive is a whole-table scan," and `performance-considerations.md`'s standing assumption ("thousands, not millions, of rows per user") applies unchanged.
- **Every metric with a time dimension is bounded by the shared reporting-period control** (This Year / Last 12 Months / Year-to-Date / All Time, per analytics.md AC2) — even "All Time" for a multi-year power user is bounded by that one user's account age, the same bound `dashboard.service.getMonthlyTrends`'s existing per-month loop already relies on.
- **The two metrics with no natural period bound (Top Merchants, Largest Purchases)** are simple single-dimension `groupBy`/`orderBy`+`limit` queries — no heavier than the Transactions table's own existing paginated list query, which this app already runs today at full production scale.
- **Category Trends is the one metric whose query shape is genuinely different from anything shipped before** — see "Analytics module structure" below for why (a two-dimensional category×month bucketing that Prisma's `groupBy` can't express against a truncated date column without raw SQL) — but the fix is a column-projected, bounded-by-period `findMany` reduced once in application code, not a cache. This is flagged explicitly for the Performance Engineer's review (same spirit as the Phase 3a Performance Engineer review that added `Holding.@@index([accountId, closedAt])` post-gate) — if profiling later shows this specific query needs a raw `date_trunc` SQL query instead of fetch-then-reduce, that is a query-shape refinement, not a reason to introduce caching.
- **Subscription Cost Detection is the one metric that must read a user's full expense history regardless of the reporting-period control** (it needs "first-detected" and "most-recent" charge dates, which a period filter would truncate) — still bounded by the same single-user "thousands, not millions" assumption, and only three columns (`merchant`, `date`, `amount`) need to be selected, keeping the fetch cheap even at that scope.
- **No concrete metric in this document requires data that changes faster than a user can plausibly re-view the page**, and no metric's own correctness depends on point-in-time freezing the way `NetWorthSnapshot` genuinely does (that's why `NetWorthSnapshot` *is* a stored, frozen table — see er-diagram.md's Phase 3a design note #6 — and why it's the one legitimate precedent for "store instead of compute" in this schema; nothing in Analytics has that same "the formula itself might change later and past readings must survive that change unaltered" requirement, since none of Analytics' 11 metrics are asked to preserve a frozen historical statement the way a snapshot must).

**Conclusion:** raw on-read aggregation is sufficient for all 11 metrics. If a future Performance Engineer review of production data finds a *specific* metric (most likely Category Trends or Subscription Cost Detection, per the reasoning above) is measurably too slow at real user data volumes, the correct next step is a targeted query-shape fix (a raw SQL grouped query, an additional index) for that one metric — not a blanket materialization/caching layer introduced speculatively ahead of evidence, which risk register item #11's own mitigation language ("if live-query performance is a concern **at realistic data volumes**") already frames as evidence-driven, not precautionary.

### Analytics module structure

**Decision: split `features/analytics/server/` into cohesive per-metric-family files, grouped by shared query shape (not one giant `service.ts`, and not strictly one file per single metric).**

`features/budgeting/server/service.ts` (521 lines) and `features/investments/server/service.ts` (533 lines) are this codebase's two largest existing service files, each covering a genuinely large single domain. Analytics covers **11** independently-specified metrics across two data-dependency passes — a single `service.ts` holding all of them would run well past 1,000 lines and would violate this project's own file-size and single-responsibility standards far more severely than either existing large file (Yearly Spending and Subscription Cost Detection share a `userId` and not much else in terms of query shape or business logic). Splitting into 11 separate single-metric files was also considered and rejected: several metrics are trivial variations of the exact same query shape (Yearly Spending and Category Trends are both "spending grouped by a time bucket," just at different granularities; Top Merchants and Largest Purchases are both "single-period expense-transaction rankings"), and splitting those apart would duplicate the same period-resolution/expense-definition boilerplate across needlessly many files rather than sharing it once per cohesive group.

**Adopted file layout** (full paths in folder-tree.md's Phase 3b additions; summarized here for the boundary reasoning):

- `features/analytics/server/period.ts` — the **one** shared reporting-period resolver (`resolveReportingPeriodRange(period, now)` → `{ start: Date | null; end: Date }`, `start: null` meaning "All Time," open-ended), used by every metric with a time dimension. This is Analytics' equivalent of `dashboard/server/service.ts`'s private `resolveMonthToDateRange` — except here it must be exported and shared *within* the module, since every one of the 7 period-aware metrics needs the exact same range resolution rather than each reimplementing "This Year"/"Last 12 Months"/"Year-to-Date" boundary math independently (a real, concrete duplication risk this file exists specifically to prevent).
- `features/analytics/server/spending-trends.ts` — Yearly Spending, Category Trends (Pass 1). Grouped together because both are "expenses bucketed over time," differing only in bucket granularity (year vs. month) and dimensionality (Yearly Spending is one bucket dimension; Category Trends is two — category × month).
- `features/analytics/server/expense-breakdown.ts` — Expense Distribution, Top Merchants, Largest Purchases (Pass 1). Grouped together because all three are "rank or bucket a single period's/all-time's expense transactions by one dimension" (category, merchant, amount respectively) — structurally the simplest, single-`groupBy`-or-`orderBy` group.
- `features/analytics/server/budget-comparison.ts` — Budget vs. Actual (Pass 1). Kept in its own file specifically because — unlike every other Pass 1 metric, which reads only `Transaction`/`Category` — this one is a cross-domain read into `features/budgeting/server/service.ts` (calls `getBudgetMonth` once per month in the selected period, reshaping the results into the multi-month table AC9 requires). Isolating the one metric with an outbound cross-domain dependency into its own file keeps the dependency graph easy to audit at a glance (a reviewer checking "does anything in `spending-trends.ts` import another feature" never has to check this file too).
- `features/analytics/server/spending-heatmap.ts` — Daily Spending Heatmap (Pass 1). Kept separate because its output shape (per-calendar-day intensity relative to the user's own typical daily spend) and its "day" grouping granularity (Transaction's `date` column is already day-granular, so this is a plain single-column `groupBy`, unlike Category Trends' two-dimension bucketing) don't share meaningful logic with any other metric.
- `features/analytics/server/income-analytics.ts` — Income Growth, Income Sources (Pass 2). Grouped together because both read the exact same underlying data (Recurring Income's actual-received `IncomeOccurrence`/`IrregularIncomeEvent` amounts, plus the "Untracked/Other" residual bucket of unlinked money-in Transactions) and differ only in whether the result is trended over time (Income Growth) or expressed as a single period's proportion breakdown (Income Sources) — one shared internal helper (`getActualIncomeBySource(userId, range)`), two thin public functions.
- `features/analytics/server/savings-growth.ts` — Savings Growth (Pass 2). Kept in its own file because it is the one metric with **two** cross-domain dependencies at once (Dashboard's income/expense math, via a per-month loop identical in shape to `budget-comparison.ts`'s, plus Investments' new `getGainLossForPeriod` — see below), and its own non-trivial exclusion rule (a $0-income month drops out of the average, mirroring `dashboard.service.computeSavingsRate`'s existing null-on-zero-income convention rather than reinventing it).
- `features/analytics/server/subscriptions.ts` — orchestration for Subscription Cost Detection: fetches the user's full expense-transaction history (merchant/date/amount only), calls the pure detection algorithm below, filters out dismissed merchants, and computes the Active/Possibly Cancelled status and the running annualized-total.
- `features/analytics/server/subscription-detection.ts` — the **pure** pattern-matching algorithm itself (grouping, interval/amount tolerance matching, price-change continuation), taking an in-memory array of `{ merchant, date, amount }` and returning detected candidate groups with no Prisma access at all — kept separate from `subscriptions.ts` specifically so it can be unit-tested against fixture arrays exactly the way `payoff-math.ts` already is (per analytics.md's own Definition of Done: "covered by tests against fixture transaction data"), without needing a database in the test. This does **not** live at the feature root (unlike `payoff-math.ts`) because nothing client-side ever calls it directly — see the "isomorphic pure-calculation-file convention" note earlier in this document.
- `features/analytics/server/actions.ts` — the single Server Action, `dismissSubscriptionCandidate`.
- `features/analytics/server/validation.ts` — `ReportingPeriodSchema`, `DismissSubscriptionCandidateSchema`.

**Callers import the specific file that owns the function they need** (e.g. a Server Component card imports `spending-trends.ts`'s `getYearlySpending` directly), the same "explicit, individually-exported service calls, not a mandatory barrel" convention already established by `features/transactions/server/aggregations.ts` (Dashboard and Budgeting both import it directly, not through a re-exporting `service.ts`). No `features/analytics/server/service.ts` barrel file is introduced — it would add an indirection layer with no consumer that actually needs a single unified import surface (each Analytics card only ever needs one or two specific functions, never "all of Analytics" as a unit).

**A pre-existing, minor duplication flagged, not introduced by this design:** `EXCLUDE_SPLIT_PARENTS` (the "don't double-count a split transaction's parent row" filter, per dashboard-overview.md AC10) is currently defined independently in both `features/dashboard/server/service.ts` and `features/transactions/server/service.ts` (the latter is the one `features/transactions/server/aggregations.ts` actually imports, confirming it as the intended canonical home). Every Analytics function touching expense transactions must import `EXCLUDE_SPLIT_PARENTS` from `features/transactions/server/service.ts` (its canonical, already-exported home) — **not** redefine a third copy, and **not** import Dashboard's copy — per analytics.md AC4's binding requirement that Analytics use "the exact same definition of an expense transaction" every other feature uses. The existing two-copy duplication between Dashboard and Transactions predates this phase and is out of this Architect's scope to fix retroactively (Dashboard's `service.ts` is Backend Engineer's file, already shipped and reviewed), but is flagged here as a small, low-risk cleanup candidate for a future pass, so a third copy is never accidentally added on top of it.

**New cross-domain function required, flagged for the Backend Engineer implementing Investments' Phase 3b touch-up (no schema change needed):** Savings Growth needs the **period-scoped change** in a user's holdings' value (AC15: "investment holdings' gain/loss for that same period... subtracted out"), which is a fundamentally different question from `investments.service.getPortfolioOverview`'s existing lifetime `currentValue - costBasis` total. The data needed already exists — `HoldingValueHistoryEntry.previousValue`/`newValue`/`recordedAt` (per `investments/server/service.ts`'s existing `getGrowthHistory`, which already queries this exact table) — so this requires **one new exported function**, e.g. `investments.service.getGainLossForPeriod(userId, { start, end }): Promise<number>`, summing `(newValue - previousValue)` across every `HoldingValueHistoryEntry` (active and closed holdings both — a holding closed mid-period still contributed real gain/loss before closing) recorded within the period. **No `prisma/schema.prisma` change is required** — this is a new query against an existing, already-sufficient table, the same category of "new function, no schema change" requirement Phase 3a's own `getTotalActiveDebtBalanceForNetWorth` was.

**A clarification, not an open question, on Investments' `DividendEntry` vs. Analytics' Income Growth/Sources:** `investments.md`'s manually-logged `DividendEntry` rows (per-Holding dividend tracking) are **not** consumed by Income Growth or Income Sources, by construction of analytics.md AC13's own definition ("Recurring Income's actual-received data... `IncomeOccurrence`/`IrregularIncomeEvent` amounts... Money-in activity never associated with any tracked income stream is still included... in an explicit 'Untracked/Other' bucket") — that definition names exactly two source tables (plus untracked Transactions) and does not mention `DividendEntry` at all. A dividend a user has *also* logged as a Recurring Income stream of type `DIVIDEND` is counted via that stream's own `IncomeOccurrence`/`IrregularIncomeEvent` rows, same as any other income type; a dividend logged **only** via Investments' `DividendEntry` (with no corresponding Recurring Income stream or matching Transaction) is simply not part of Income Growth/Sources' total at all — not double-counted, not silently dropped from anything it was ever supposed to be part of, just genuinely out of scope for those two metrics by the Product Owner's own resolved wording. This is stated here explicitly so no implementer "fixes" what looks like a gap by wiring `DividendEntry` into Income Growth — doing so would be an unrequested scope change, not a bug fix.

### Subscription Cost Detection's dismissal-tracking schema requirement (handoff to the Database Architect)

Detection itself is entirely computed at read time (per the Risk #11 decision above) — but "a user can dismiss a detected item as 'not a subscription,' after which that merchant is excluded from future detection for that user" (analytics.md's Subscription Cost Detection section) is a genuine, durable fact about *that user's relationship to that merchant name* that must survive across every future detection run, which a pure read-time computation cannot represent on its own (there is no "Subscription" row to attach a dismissal flag to, since subscriptions are never persisted entities — only detected patterns).

**Required new model:**
```
DismissedSubscriptionMerchant {
  id                      String   @id
  userId                  String   // FK to User, indexed
  normalizedMerchantName  String   // MUST be the exact output of lib/merchant-normalization.ts's
                                    // normalizeMerchantName() — the same key subscription-detection.ts
                                    // groups candidates by, so a re-detection pass's grouping key
                                    // matches this table's lookup key directly. Storing the *raw*
                                    // merchant string here would silently fail to suppress future
                                    // detections of the same merchant under a slightly different raw
                                    // spelling — normalization must happen once, before storage, not
                                    // be re-derived inconsistently at read time.
  dismissedAt             DateTime // audit/ordering only — this is not a soft-delete of a real
                                    // entity, so there is no corresponding "undismiss" requirement
                                    // in analytics.md (unlike every archive/unarchive domain in this
                                    // app) and none is added speculatively here. If a future phase
                                    // wants an "undo" action, it is a simple row delete against this
                                    // same table — no schema change would be needed then either.

  @@unique([userId, normalizedMerchantName])
  @@index([userId])
}
```

**Why a dedicated small model, not a JSON field or a reuse of an existing mechanism (the three alternatives considered):**
1. **A JSON array field on `User`** (e.g. `User.dismissedSubscriptionMerchants: string[]`) was considered and rejected. It would (a) break this schema's consistent "one row per fact, one table per user-owned list" convention used everywhere else in this app (every other per-user list — Accounts, Debts, Goals, Bills, Income Streams — is its own table with a `userId` FK, never a JSON blob on `User`); (b) provide no database-level protection against a duplicate/race-condition double-dismissal, unlike a `@@unique` constraint; and (c) `User` is Better Auth-managed schema territory (per er-diagram.md's own standing note: "use the exact field names/table mappings the adapter expects... do not rename without checking") — adding arbitrary product-specific columns onto the auth-owned model is exactly the kind of scope creep that table should stay free of.
2. **Reusing `Notification`'s dismiss mechanism** was considered and rejected: `Notification.dismissedAt` dismisses one specific, already-persisted row representing a specific triggered event (a specific over-budget category, a specific bill occurrence) — it has no concept of "permanently exclude this merchant name from ever being flagged again," which is a standing exclusion rule, not a one-time event dismissal. Forcing Subscription Detection's fundamentally different semantics (a durable exclusion *rule*, not a dismissible *instance*) onto `Notification`'s shape would be a worse fit than a small, purpose-built table.
3. **No persistence at all, re-deriving from some other signal** was considered and rejected outright — there is no other signal in this schema that could represent "the user told us this specific merchant isn't a subscription" (this is genuinely new information the user is providing, not something derivable from Transaction/Category/Budget data already on file).

This is the first model in this schema whose entire purpose is "durably record an exclusion decision about a *computed, never-persisted* concept" (contrast with `Notification`, which dismisses an already-persisted row, or every `archivedAt` column, which soft-deletes an already-persisted entity) — flagged explicitly as a new, small pattern, the same way `NetWorthSnapshot` was flagged in Phase 3a as "the first not-request-triggered write path."

### FinancialGoal schema-adjacent module design (handoff to the Database Architect)

**Module boundary:** `features/financial-goals/server/service.ts` is a pure downstream consumer of three other domains' existing service functions — it introduces **zero** new cross-domain functions on Debt/Dashboard/Accounts beyond the one already flagged for Investments above (which Financial Goals doesn't even need). This mirrors Analytics' own shape: a "leaf" module in the dependency graph that other domains never import back from, so no cycle risk exists.

```
features/financial-goals/server/service.ts calls:
  → features/debt/server/service.ts.getDebtById(userId, debtId)          (Debt Payoff type)
  → features/dashboard/server/service.ts.getNetWorth(userId)             (Net Worth/Savings Target,
                                                                            Total Net Worth basis)
  → features/dashboard/server/net-worth-history.ts.getNetWorthHistory(userId, range)
                                                                          (Net Worth/Savings Target's
                                                                            optional mini trend line,
                                                                            Total Net Worth basis only)
  → features/accounts/server/service.ts.getAccounts(userId)              (Net Worth/Savings Target,
                                                                            Account-subset basis)
  → features/dashboard/server/service.ts.getMonthlySummary(userId, month) (Savings Rate Target,
                                                                            called 3x, rolling average)
```

**One confirmation to flag for the Backend Engineer (not a redesign):** `debt.service.getDebtById` must return a Debt regardless of its `archivedAt` state when looked up by id (as opposed to `getDebts`' list, which correctly excludes archived by default) — Financial Goals' edge case "a linked Debt is archived while its goal is still active: progress freezes at its last-known value" requires exactly this. This requires **no new function and no schema change**: an archived Debt's row (including its `balance`/`effectiveBalance`-supporting fields) is never deleted, only flagged — so "freezing" a goal's progress is simply a natural consequence of continuing to read the same, unchanged Debt row after it's archived, exactly the same way an archived Account's `balance` field is still a real, readable number. No new persistence of a "frozen snapshot value" is needed on `FinancialGoal` itself — flagged here explicitly because it's a tempting but unnecessary over-design (a `frozenProgressAtArchival` column would violate "never store what's derived" for no benefit, since the live Debt row already preserves everything needed).

**Required new model — `FinancialGoal` stores only the goal's definition (type, target, and each type's own configuration), never any progress/completion value:**
```
FinancialGoal {
  id                String    @id
  userId            String    // FK to User, indexed
  name              String
  type              enum      // FinancialGoalType — fixed at creation (AC1), never changed after
  archivedAt         DateTime? // soft delete, same convention as Account/Bill/Goal/Debt

  // Type 1 — DEBT_PAYOFF fields (null for the other two types)
  linkedDebtId      String?   // FK to Debt — see the exclusivity note below for the uniqueness rule
  startingBalance   Decimal?  // captured once at creation, frozen — never recomputed (per the spec's
                                // "fixed anchor, not recomputed later")

  // Type 2 — NET_WORTH_SAVINGS_TARGET fields (null for the other two types)
  targetAmount      Decimal?
  measurementBasis  enum?     // MeasurementBasis: TOTAL_NET_WORTH | ACCOUNT_SUBSET
                                // (the subset itself is the join table below, not a column here)

  // Type 3 — SAVINGS_RATE_TARGET fields (null for the other two types)
  targetPercent     Decimal?  // validated 0-100 at the application layer (Zod), per the spec's
                                // "target above 100% or below 0%... rejected with a validation error"
  targetDate        DateTime? // optional, Type 3 only per the spec's own wording

  createdAt         DateTime
  updatedAt         DateTime

  @@index([userId])
}

FinancialGoalAccount {           // explicit join table for Type 2's Account-subset measurement basis
  financialGoalId   String      // FK to FinancialGoal
  accountId         String      // FK to Account

  @@id([financialGoalId, accountId])
}
```

**No `completedAt`, no `progress`/`percentComplete` column, no manual-update timestamp — deliberately.** Every one of this codebase's existing "auto-detected completion" domains (`Goal.isCompleted`, `Debt.isPaidOff`, Bill/Income occurrence status) computes that state at read time from live source data and never stores it; `FinancialGoal` follows the identical rule for all three of its types, since financial-goals.md's own Boundary section states this is the feature's entire reason for existing as a distinct model from `SavingsGoal` ("every Financial Goal type... is read-only against its source data"). Storing a completion flag here would reintroduce exactly the "which number is the real one" drift risk the Product Owner's Boundary decision was written to avoid.

**A flat table with nullable type-specific columns, one enum discriminator — matching this schema's existing precedent, not inventing a new shape.** This mirrors `Debt` (one table, one `DebtType` enum, fields shared across all six debt types) and `IncomeStream` (one table, one `IncomeType`/`IncomeSchedule` enum pair, `expectedAmount`/`anchorDate` nullable depending on schedule) rather than three separate per-type tables or a JSON "config" blob — consistent, and it keeps `getFinancialGoals`'s list query a single-table, single `groupBy`-free read regardless of the mix of types a user has created.

**`FinancialGoalAccount` is an explicit join table, not Prisma's implicit m-n** — same reasoning as `TransactionTag`'s existing precedent: it may need to grow a field later (unlikely, but "explicit join tables compose better with future growth than implicit ones" is this schema's standing rule, restated here rather than re-litigated) and it's the natural place to enforce "only non-archived Accounts may be selected" at the application layer when a user edits the subset.

**Debt Payoff exclusivity (at most one active goal per Debt) — flagged as an open enforcement-mechanism decision for the Database Architect, with a recommendation:** the spec requires "at most one active Debt Payoff Financial Goal per Debt at a time," but — unlike `Debt.accountId`'s plain `@unique` (any linked Debt may only ever have one link, full stop, no archived-goal exception) — this constraint must be conditional on the goal itself being **non-archived** (a user is explicitly allowed to archive one Debt Payoff goal and create a fresh one for the same Debt). A plain `@@unique([linkedDebtId])` would incorrectly block that allowed re-creation. Two options, mirroring the exact tradeoff already decided once in this schema (er-diagram.md's Phase 3a design note #5, Bills↔Recurring Income exclusivity):
1. **A Postgres partial unique index** (`CREATE UNIQUE INDEX ... ON financial_goal (linked_debt_id) WHERE archived_at IS NULL`), added via a hand-edited addition to the Prisma-generated migration (Prisma's schema DSL has no first-class syntax for a conditional `@@unique`) — a real, database-enforced guarantee, but the first partial index this schema would ever need, and requires editing a generated migration file by hand rather than relying purely on `prisma migrate`.
2. **Application-level check-then-create inside a single Prisma `$transaction`** (query for an existing non-archived `DEBT_PAYOFF` goal with the same `linkedDebtId` immediately before creating a new one) — no schema change, same "monitored risk, not database-enforced" shape already accepted for the Bills↔Recurring Income cross-table case, and justified by the same reasoning: this is a single authenticated user, in their own session, potentially clicking "create" twice in quick succession — not a concurrent-multi-actor write path.

**This Architect's recommendation is Option 2**, for consistency with the precedent already set (design note #5 explicitly chose the application-level guard over a trigger for a structurally identical low-concurrency, single-user race profile) and to avoid introducing this schema's first hand-edited migration for a benefit (closing an already-narrow race window) the Phase 3a precedent already judged not to be worth that cost. **Non-binding** on the Database Architect, per this project's standing rule — if a partial index is preferred, only this one constraint's implementation changes; nothing else in this design is affected. **This exclusivity check does not need a shared `lib/`-level guard file** the way Bills↔Recurring Income did: that case needed `lib/transaction-link-guard.ts` specifically because *two* independent domains each needed to check the *other's* table (a genuine circular-import risk if either imported the other directly). Here, the check is entirely self-contained within `FinancialGoal`'s own table — no other domain ever needs to query it — so a private helper function inside `features/financial-goals/server/service.ts` is sufficient, with no `lib/` file and no cross-feature import at all.

### Net Worth History chart's data source and read-side contract

Confirmed: **nothing architecturally tricky here.** This is a straightforward, bounded, single-table read over `NetWorthSnapshot` (already live and accumulating since the end of Phase 3a, per Risk #10's mitigation), scoped by `userId` and `capturedDate`, using the existing `@@index([userId, capturedAt])` (er-diagram.md's Phase 3a design note #6 already anticipated this exact future read: "the separate `capturedAt` index exists for Phase 3b's future ordered range queries"). No new model, no new index, and no cross-domain read is required — `NetWorthSnapshot` already stores the two components (`totalAccountBalance`, `totalUnlinkedDebtLiability`) and the total (`totalNetWorth`) the chart needs for both its default single-line view and its Assets/Debt breakdown toggle (AC5's "sourced from the same snapshot rows already being read — no additional query concept").

This addition lives entirely inside the existing `features/dashboard/` module (`features/dashboard/server/net-worth-history.ts`, sibling to the existing `snapshot.ts`), not a new feature module — same reasoning Phase 3a already applied to the snapshot job itself: this has no data of its own beyond reads over a table Dashboard already owns and writes to, and its one new Route Handler (`app/api/dashboard/net-worth-history/route.ts`) is the natural, narrow exception to "Dashboard needs no client-refetchable routes" flagged in the Server/client boundary section above.

**Query and thinning shape (AC7's "legibility at every range," this Architect's/Frontend Lead's implementation decision, made here):** `getNetWorthHistory(userId, range)` fetches every `NetWorthSnapshot` row in the resolved date window (a single indexed range query — bounded by the user's account age even at "All Time," the same "thousands, not millions, of rows per user" scale this entire document has relied on everywhere else) and, only when the row count exceeds a legibility threshold (e.g. ~120 points), thins the result to at most that many points by selecting one **real, already-captured** row per bucket (e.g. the last snapshot in each week or month bucket, depending on range) — never an averaged or interpolated synthetic point. This keeps AC6 ("hover shows that day's exact date and value") honest even on a thinned series (every rendered point is a genuine day's real snapshot, just not every day is rendered at long ranges) and keeps AC8 ("never fabricate an interpolated value for a missing day") unambiguously satisfied, since thinning only ever *omits* real points, never invents new ones. This thinning happens once, server-side, inside `getNetWorthHistory` itself — not a client-side concern, and not exposed as an isomorphic pure-calc file, since no Client Component ever needs to recompute it independently of the fetched response (contrast with `payoff-math.ts`, which a Client Component genuinely must call directly).

**Default-range resolution (AC3) is computed server-side, once, at initial load** — `resolveDefaultRange(userId)` (a cheap `min(capturedDate)`/count query, not a full row fetch) determines whether the initial render uses "All Time" (under 90 days of history) or "90 Days" (90+ days), matching this doc's Data Flow section above.

---

## Phase 4a — AI Features foundation

Per `roadmap.md`'s Phase 4a section, `docs/product/ai-features.md` (Product Owner spec), and `docs/architecture/ai-features-design.md` (AI Engineer's technical design). This section closes the "second gate" the company rule requires (spec + architecture, both signed off, before any implementation) by adding the codebase-integration pieces `ai-features-design.md` explicitly left to this Architect. **Database Architect is next** — finalizing the suggestion/audit-trail table, the Budget Advisor/Insights refresh-cache rows, and the `FinancialHealthScoreSnapshot`-shaped table (module placement resolved below; column shape is theirs).

### Five features, five module homes — none of them a new "ai" feature module

`lib/ai/` is infrastructure, not a feature (see the Guiding Pattern section above) — so each of the five product features' AI-generation code lives inside **that feature's own existing module**, except the Financial Health Score, whose placement required a genuine, non-obvious call (its own subsection below):

| Feature | Module | New AI-owned files (this feature's own `server/`) | New non-AI files |
|---|---|---|---|
| Transaction Auto-Categorization | `features/transactions/` (existing) | `categorization-schema.ts`, `categorization.ts` | `app/api/cron/categorize-transactions/route.ts`; `actions.ts` gains `acceptCategorySuggestion`/`rejectCategorySuggestion`/`requestCategorySuggestion` |
| AI Budget Advisor | `features/budgeting/` (existing) | `advisor-schema.ts`, `advisor.ts` | `actions.ts` gains `refreshBudgetAdvisor` |
| Automatic Monthly Summaries | `features/dashboard/` (existing) | `monthly-summary-schema.ts`, `monthly-summary.ts` | `app/api/cron/monthly-summary/route.ts`; a new `app/(dashboard)/monthly-recap/` route tree (history + detail) |
| Spending Insights | `features/analytics/` (existing) | `insights-schema.ts`, `insights.ts` | `actions.ts` gains `refreshSpendingInsights` |
| Financial Health Score (deterministic score + optional narrative) | `features/financial-health-score/` (**NEW module — see below**) | `health-score-narrative-schema.ts`, `health-score-narrative.ts` | `service.ts` (deterministic formula), `snapshot.ts` (cron capture), `app/api/cron/financial-health-score-snapshot/route.ts`, `app/(dashboard)/financial-health-score/page.tsx` |

Full file tree for all five: folder-tree.md's Phase 4a additions. Full API surface (mechanism/input/output per row above): api-contracts.md's Phase 4a section.

### Financial Health Score: module placement resolution (this Architect's call, closing the AI Engineer's open handoff)

`ai-features-design.md` (§2's placement table, and §7's flagged-not-designed note) left two questions open for this pass to close. Both are resolved here; the Database Architect's actual column-level schema work is unaffected and comes next.

**1. Confirming the CTO's expectation (`ai-features.md`, Resolved item 2): yes, a new sibling table, not an extension of `NetWorthSnapshot`.** Having now seen the AI Engineer's full design, nothing in it weakens the CTO's reasoning — if anything it sharpens it. `NetWorthSnapshot` stores three `Decimal` columns describing one concept (net worth and its two components). The Health Score snapshot needs to store **four** independent component scores, a total, and — per `ai-features-design.md` §6's own explicit recommendation ("generate+persist the narrative in the same invocation" as the snapshot) — a narrative-cache field: a materially wider row answering a materially different question ("how healthy is this user's whole financial picture," not "what is this user's net worth"). Folding that onto `NetWorthSnapshot` would force every future reader of that table to know which columns belong to which concept — exactly the two-concepts-one-table conflation this schema has already deliberately avoided once, for `DismissedSubscriptionMerchant` (kept standalone rather than folded into `Notification`, per the Phase 3b section above). **Confirmed, independently, as this Architect's own conclusion** — this is not merely relaying the CTO's steer forward unexamined.

**2. Module/file placement: a new feature module, `features/financial-health-score/`, not an extension of `features/dashboard/`.** This is the genuinely open question — the AI Engineer's design correctly declined to guess at it ("wherever the Backend Engineer places the deterministic score itself — this file is a sibling, not a replacement," `ai-features-design.md` §2). It does **not** follow the same precedent as the Net Worth Snapshot job or the Net Worth History chart, both of which correctly live inside `features/dashboard/` for a specific, stated reason: "it has no data of its own beyond reads/a snapshot row of numbers Dashboard already computes." The Financial Health Score fails that test on every count:
   - It performs genuinely new computation of its own — a four-component deterministic formula reading **across four other domains** (Debt, Recurring Income, Budgeting's existing Budget Health Score, Dashboard's Net Worth) — not a read over data Dashboard itself already fully owns end-to-end, the way the Net Worth History chart is.
   - It gets its own dedicated detail view (`ai-features.md` AC8: "a summary card... and a dedicated detail view"), its own persisted historical table, and its own AI-generated narrative — exactly the shape of "leaf, cross-domain-consuming module with its own persisted entity and its own detail route" this codebase already established for **Financial Goals** in Phase 3b. Compare the call list directly: `financial-goals/server/service.ts` calls `debt.service`, `dashboard.service.getNetWorth`, `accounts.service.getAccounts`, `dashboard.service.getMonthlySummary` (see the Phase 3b cross-domain call list above); the Financial Health Score's `service.ts` would call `debt.service`, `recurring-income.service`, `budgeting.service.getBudgetHealthScore`, `dashboard.service.getNetWorth`/`net-worth-history.ts` — structurally the same "leaf module, four inbound cross-domain reads, zero outbound importers" shape, not a new pattern.
   - Continuing to grow `features/dashboard/server/service.ts` with a fifth cross-domain formula it doesn't otherwise need would push that already-large, Phase-1-era file further from single-responsibility for no offsetting benefit — the same file-size/SRP discipline already applied consistently since Analytics' module-structure decision in Phase 3b.

   **Concretely:**
   - `features/financial-health-score/server/service.ts` owns the deterministic formula — `getFinancialHealthScore(userId)` — calling `debt.service`, `recurring-income.service`, `budgeting.service.getBudgetHealthScore` (reused verbatim, never reimplemented — Feature 5's own Definition of Done requirement), and `dashboard.service.getNetWorth`/`net-worth-history.ts`. **Zero AI dependency** — this file never imports `lib/ai/`.
   - `features/financial-health-score/server/snapshot.ts` owns the periodic, cron-triggered, idempotent-per-user-per-day capture job (AC7), mirroring `dashboard/server/snapshot.ts`'s already-proven cron/idempotency pattern — the exact "reusing the proven *pattern*, not the same rows" framing the CTO's own Resolved-section language used. Per `ai-features-design.md` §6's recommendation, this same cron invocation also generates and persists the narrative, by calling the AI-owned `health-score-narrative.ts`/`health-score-narrative-schema.ts` pair that lives **alongside** it in this new module (resolving the AI Engineer's "or wherever the Backend Engineer places the deterministic score itself" open note: it's here, as a sibling file in the same new module, never inside `service.ts` itself — per the Phase 4a AI-owned sibling-file convention above).
   - `features/dashboard/` gains exactly **one** new, thin pass-through read — `dashboard.service.getFinancialHealthScoreCard(userId)` — mirroring the existing `getBudgetHealthScoreCard` pass-through precisely, so the Dashboard summary card needs no direct cross-module import and Dashboard's own module boundary is undisturbed.
   - This new module is a **leaf** in the dependency graph, structurally identical to Financial Goals and Analytics: Debt, Recurring Income, Budgeting, and Dashboard never import from `features/financial-health-score/` — only it imports from them. No cycle risk is introduced.

### Phase 4a module boundaries and cross-domain reads

```
Debt, Recurring Income, Budgeting, Dashboard        (existing — each read live, never re-derived;
        │        │           │         │             Budget Adherence = Budgeting's existing
        └────┬───┴─────┬─────┴────┬────┘             Budget Health Score, reused verbatim)
             ↓         ↓          ↓
   features/financial-health-score/server/service.ts     (NEW leaf module — 4-component
             │                                             deterministic formula, ZERO AI
             ↓                                             dependency, per Feature 5's own
   features/financial-health-score/server/snapshot.ts       degradation guarantee)
             │            (cron: captures score history; generates + persists narrative
             ↓             in the same invocation, per ai-features-design.md §6)
   features/financial-health-score/server/health-score-narrative.ts  ───────────┐
                                                                                  ↓
   features/transactions/server/categorization.ts (fastModel)   ─────────┐       │
   features/budgeting/server/advisor.ts (reasoningModel)         ────────┤       │
   features/dashboard/server/monthly-summary.ts (reasoningModel) ───────┼──▶  lib/ai/
   features/analytics/server/insights.ts (reasoningModel)        ───────┘       │
                                                                                  │
   lib/ai/ never imports back into any feature — pure fan-in leaf ──────────────┘
```

Every arrow above points into `lib/ai/`, never out of it — the same acyclicity guarantee `lib/recurrence.ts` and `lib/merchant-normalization.ts` already provide, extended here to five callers instead of two. No feature imports another feature's new Phase 4a AI-owned file directly (e.g. `budgeting/server/advisor.ts` never imports `analytics/server/insights.ts`); every one of the five reaches `lib/ai/` independently, keeping the five features mutually decoupled exactly as `ai-features-design.md` §1's "swapping `fastModel`... touches one file, not five feature directories" argument requires.

### Suggestion/audit-trail table and refresh-cache rows: module ownership (schema itself is Database Architect's, per the handoff in `ai-features-design.md` §7)

- **The Transaction Auto-Categorization suggestion/audit-trail table** (`ai-features-design.md` §7's required-facts list) is owned conceptually by the **Transactions** domain — queried only from `features/transactions/server/categorization.ts`, the same "one feature, one owner" rule every other per-user list in this schema already follows (Accounts, Debts, Goals, Bills). No other feature ever reads or writes it.
- **The Budget Advisor's and Spending Insights' refresh-cache rows** (`ai-features-design.md` §7's "flagged, not designed" note) are likewise each owned by their own feature — a `(userId, month)`-keyed cache row inside Budgeting's own domain, a `(userId, reportingPeriod)`-keyed cache row inside Analytics' own domain — not a single shared "AI content cache" table trying to serve both. This is the same "purpose-built tables over one overloaded model" discipline the CTO's own `DismissedSubscriptionMerchant` reasoning already established, restated here so the Database Architect doesn't default to consolidating these three distinct persistence needs into one generic table for convenience.

## Risks / scalability notes

- The Transactions table is the highest-traffic, highest-complexity UI surface — Budgeting, Bills, Debt, and Investments all reuse the same `DataTable` component and API pagination shape.
- `Account.type` is modeled as a discriminated enum specifically so Phase 3a's Debt/Investment features don't require a new top-level entity for the types that already exist — confirmed with Database Architect per risk register item #1.
- **(Phase 3a) Net Worth double-counting** — see api-contracts.md's Net Worth Aggregation Update section for the full contract; resolved, live, and unchanged by Phase 3b (Phase 3b's Net Worth History chart and Financial Goals' Net Worth/Savings Target type both read `getNetWorth`'s already-double-count-safe `total`, never re-deriving it).
- **(Phase 3a) The Net Worth Snapshot job is the first scheduled/cron surface in this codebase** — unchanged by Phase 3b; Phase 4a adds three more cron surfaces (categorization, monthly summary, health-score snapshot), all following the exact same shared-secret/no-session/plain-JSON exception this job established first.
- **(Phase 3b) Risk #11 is resolved: raw on-read aggregation for all 11 Analytics metrics, no materialized/cached aggregates introduced** — see the full reasoning above. This is the first phase where this Architect was explicitly asked to re-justify (not just inherit) this codebase's long-standing "no caching layer" default, and the conclusion is that the default still holds, evidence-first (revisit only if a Performance Engineer review of real production data volumes finds a specific metric too slow, per the risk register's own evidence-driven mitigation language).
- **(Phase 3b) `DismissedSubscriptionMerchant` is this schema's first "durable exclusion rule over a computed, never-persisted concept"** — a genuinely new small pattern, not a repeat of `archivedAt`/`Notification.dismissedAt`'s existing shapes. See the full reasoning above; flagged here for visibility the same way `NetWorthSnapshot`'s "first not-request-triggered write path" status was flagged in Phase 3a's risk notes.
- **(Phase 3b) `FinancialGoal`'s Debt Payoff exclusivity rule is the second time this schema has faced a "conditional uniqueness" requirement** (the first being the Bills↔Recurring Income cross-table exclusivity in Phase 3a) — this Architect's recommendation is to resolve it the same way (application-level guard, no database trigger/partial index this phase), for consistency, but this is explicitly the Database Architect's call to make or override, same as every other schema-shape recommendation in this document.
- **(Phase 3b) Two small, well-defined cross-domain additions are required of the Backend Engineer, neither requiring a schema change:** `investments.service.getGainLossForPeriod(userId, { start, end })` (for Savings Growth) and `debt.service.getDebtById`'s confirmed archived-inclusive-by-id behavior (for Financial Goals' Debt Payoff type) — both flagged in full above, in their respective sections.
- **(Phase 4a) `lib/ai/` is this codebase's first cross-feature module with an outbound third-party network dependency** (`@ai-sdk/google`, revised from an initial `@ai-sdk/anthropic` decision — see `ai-features-design.md`'s provider-swap addendum) — isolated to exactly one file (`client.ts`), per the module-boundary table above, so a future provider swap or an outage of the provider itself can never propagate past that one file's contract. See `ai-features-design.md` for the full swappability/observability reasoning.
- **(Phase 4a) `features/financial-health-score/` is this codebase's first feature module whose central computation (the score itself) has zero AI dependency while its module still exists specifically because of an AI-adjacent requirement (the narrative + AC7's snapshot history)** — flagged for visibility since it's an easy module boundary to get wrong (folding the whole module under `lib/ai/` would misrepresent 90% of its content, which is deterministic Backend Engineer arithmetic, not AI-generated). See the full module-placement resolution above.
- **(Phase 4a) Three new small persistence needs are confirmed required, not optional, per `ai-features-design.md` §7 and the CTO's Resolved-section confirmation in `ai-features.md`:** the Transaction Auto-Categorization suggestion/audit-trail table (load-bearing for Feature 1's own Success Metrics, not best-effort), and the Budget Advisor/Spending Insights refresh-cache rows (load-bearing for the cost/latency bound in `ai-features-design.md` §6, not a nice-to-have). All three are purpose-built, feature-owned tables per the module-ownership note above — not one shared "AI content" table.
- **(Phase 4a) No new caching-layer precedent is introduced by the Budget Advisor/Insights refresh-cache rows** — these are narrow, generated-content cache rows for one specific AI output, not a reintroduction of the general-purpose materialized/cached-aggregate pattern Risk #11 evaluated and declined for Analytics' own deterministic metrics above. The two are not in tension: Risk #11 declined caching *deterministic Prisma aggregation* (cheap to recompute, so caching would add complexity for no correctness or cost benefit); these rows cache *non-deterministic, non-free-to-regenerate AI output* (the entire reason `ai-features-design.md` §6 requires bounding how often it's regenerated at all).
