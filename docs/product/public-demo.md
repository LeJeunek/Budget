# Product Spec — Public Demo Mode

This document specifies `/demo`, the replacement for the now-removed `showcase@lkbudget.demo` account and Admin's now-removed "Seed Demo Data" capability. See `docs/product/admin.md`'s Capability 6, marked "REMOVED (2026-08-04)" and pointing here — that removal and this spec are two halves of the same change, landed together. This is a **product** spec: it does not design the fixture-data module's file format or location, the mechanism by which a page renders fixture data instead of a live query, or the route-group/layout structure `/demo` lives under — those are Solution Architect and Frontend Lead calls. Where this document says "the demo shows," the *how* is deliberately left to that pass.

## Scope Already Decided (binding, not revisited here)

Two decisions were made directly with the client, not delegated to this role, and are restated here so this spec is self-contained rather than re-litigating settled ground:

1. **Access: a public route, no login at all** (e.g. `/demo`) — anyone with the link can open it. No credentials exist to share, because none are required.
2. **Data: static, read-only fixture data, hard-coded and rendered directly** — no database writes are possible from `/demo`, and no database reads either (see Capability 3). This is what makes "always populated" a permanent, zero-maintenance guarantee rather than a promise that depends on a seed script being re-run, which is exactly the operational gap that made the old showcase account fragile enough to remove.

Everything below defines what "always populated sections and charts" concretely means, which pages qualify, and the guardrails that keep this route from ever becoming a second, unintended way into the real product's data or a write surface of any kind.

## In-Scope Pages, With Reasoning

The authenticated app's routes (`docs/architecture/folder-tree.md`) split naturally into two kinds: pages whose entire value is displaying financial data, charts, and progress — and pages whose value is configuration or one-off document generation. This spec puts the demo equivalent of only the first kind in scope:

- **Dashboard** (`/`) — the flagship overview; every stat card, the Financial Health Score summary, and all four Recharts charts.
- **Accounts** (`/accounts`) — the account list and balances that every other page's numbers ultimately roll up from.
- **Transactions** (`/transactions`) — the transaction history that gives every chart and category total something real underneath it.
- **Budgeting** (`/budgeting`) — the current month's plan, allocated/spent/remaining, and the budget health score.
- **Savings Goals** (`/goals` + detail) — goal progress, contributions, estimated completion.
- **Financial Goals** (`/financial-goals` + detail) — the broader debt-payoff/net-worth/savings-rate goal types, distinct from Savings Goals per `docs/product/financial-goals.md`'s existing boundary.
- **Debt** (`/debt`) — balance, interest rate, payoff projection.
- **Investments** (`/investments` + detail) — portfolio value, gain/loss, allocation.
- **Analytics** (`/analytics`) — the full metric suite, including its historical trend charts.
- **Financial Health Score** (`/financial-health-score`) — the four-component breakdown and trend.

These ten are exactly the surfaces `docs/product/phase-5b-motion-craft.md`'s Number Counters and Chart Transitions capabilities already identified, by direct inspection, as this app's headline chart/number-heavy pages — reusing that same, already-audited list here rather than re-deriving it is a deliberate consistency choice, not a coincidence.

## Out-of-Scope Pages, With Reasoning

- **Bills** (`/bills`) and **Recurring Income** (`/income`) — both are predominantly task/status lists (due dates, paid/late state, mark-paid actions) rather than chart-heavy surfaces, and both would need every fixture due-date to stay meaningfully "upcoming" relative to whenever a visitor happens to open the link — a freshness burden this spec's static-fixture approach is specifically designed to avoid (see Capability 2, AC6). Their financial substance (income/expense totals) is already told through Dashboard, Budgeting, and Analytics. A later pass may add them if there's real appetite; not assumed here (see Open Questions).
- **Calendar** (`/calendar`) — same reasoning as Bills/Recurring Income, sharper: a calendar's entire premise is "what's relevant around today," which is structurally in tension with a dataset that must never need updating.
- **Settings** (`/settings/notifications`, `/settings/appearance`, `/settings/preferences`) — pure configuration; there is no financial data to showcase, and every control on these pages is a write action, in direct tension with Capability 3 below.
- **Reports** (`/reports`) — its entire output is a generated PDF via a Server Action; both the write-shaped generation flow and the fact that its figures never render as a live, animatable DOM number (already noted in `phase-5b-motion-craft.md`'s own Number Counters AC7) make it a poor fit for a read-only, always-populated in-app page.
- **Admin** (`/admin/*`) — internal team tooling that must remain undiscoverable to ordinary users per `docs/product/admin.md` Capability 1 AC3; a public demo referencing or resembling it would directly contradict that standing requirement. `/demo` and `/admin` must never link to, resemble, or be confused with one another.
- **`/login`** — not applicable; the entire point of `/demo` is that no login step exists on its path.

## User Story

As a prospective user, a person evaluating FinanceOS on my behalf, or someone the team wants to show the product to (a sales conversation, a screenshot, a portfolio link), I want to open a single public link and immediately see a fully populated, realistic dashboard and every major section of the app — with real-looking charts, balances, budgets, debt, investments, and goals already filled in — without creating an account, without anyone handing me a password, and without any risk that what I'm looking at has been emptied out, broken, or left stale by someone else's testing.

## Business Value

The showcase account this replaces had a single-point-of-failure design flaw: it was real data behind a real login, which meant it could be edited, deleted, or left in a broken state by anyone with the credentials, and could only be restored by an admin manually re-running a seed script (the very capability just removed). None of that risk is inherent to what a demo actually needs to do — a demo does not need to be *editable*, it needs to *look real and always be there*. Static, public, read-only fixture data solves the actual underlying need (something the team can point anyone to, at any time, that always looks right) while eliminating the entire class of problem the old approach carried: it cannot be broken, because nothing can write to it; it cannot go stale from disuse, because nothing needs to refresh it; it cannot require an admin's intervention, because there is no seed step to re-run. This is a strict improvement over the capability it replaces, not a smaller version of it.

---

## Capability 1: Public, Unauthenticated Access

### User Story
As anyone with the link — a prospective user, someone the team is showing the product to, or a visitor who found it on their own — I want to open `/demo` and see the full experience immediately, with no login screen, no signup form, and no credential of any kind standing between me and the content.

### Acceptance Criteria
1. A single top-level, unauthenticated route (`/demo`) exists, structurally separate from the `(auth)` and `(dashboard)` authenticated route groups and from `/admin` — the same "its own separate route tree" precedent Admin established for staying hidden (`admin.md` Capability 1), applied here in the opposite direction: `/demo` is deliberately public rather than deliberately undiscoverable.
2. No login, signup, credential entry, magic link, OAuth flow, or any session-establishment step is ever presented or required to view any in-scope page under `/demo` — full access from a single shared link, zero prior action.
3. No page under `/demo` checks for, reads, or depends on `getCurrentUser()`, a session cookie, or any Better Auth state of any kind. Visiting `/demo` while logged out, logged in as an ordinary user, or logged in as an admin all produce byte-for-byte identical content — login state is irrelevant to, and invisible from, every page under `/demo`.
4. `/demo`'s existence must not weaken, bypass, or add any exception to the authorization checks a real authenticated route already enforces — visiting `/` or `/accounts` while logged out still redirects to `/login` exactly as it does today. The new public route is purely additive; it introduces no new gap in an existing gate.
5. `/demo` carries no rate limiting, invite code, waitlist, or any other access friction, consistent with the decided "no credentials to share" framing.
6. Nothing in the real, authenticated product links to, redirects to, or otherwise surfaces `/demo` as part of the logged-in experience — a real user is never shown, or accidentally routed into, the demo. (Whether a *public-facing* page like `/login` should link *to* `/demo` is a separate question, deliberately left open — see Open Questions.)

### Edge Cases
- **A logged-in user manually navigates to `/demo`**: sees the exact same public fixture content any anonymous visitor would see — their own real data never appears, never mixes in, and is never referenced, per AC3.
- **A visitor's browser has stale cookies from a prior real session**: irrelevant, since `/demo` never inspects session state at all (AC3) — no code path exists where a stale cookie could change what renders.
- **An automated crawler or bot hits `/demo` at high volume**: since the route performs no database read or write (Capability 3), this carries none of the load or data-integrity risk a real authenticated route under similar traffic would; whether to actively invite or discourage such traffic (`robots.txt`) is a separate call — see Open Questions.

---

## Capability 2: Always-Populated Fixture Data

### User Story
As a visitor to `/demo`, I want every chart, headline number, and list on every page I can reach to already be filled in with realistic, coherent numbers — never an empty state, a "get started" prompt, or a stuck loading skeleton — so the product reads as something people actually use, not an empty shell.

### Acceptance Criteria
1. Every in-scope page's every chart, headline stat/number, and list or table renders fully populated content on first paint — no empty state, no zero-value placeholder, and no loading skeleton that is ever the final rendered state, since there is no real fetch for a skeleton to be "stuck" mid-way through.
2. The fixture dataset is static and hard-coded, not read from the database, not produced by a seed script, and requires no running job or scheduled maintenance to remain populated — "always populated" holds permanently, by construction, with zero operational upkeep, which is the entire point of this replacing the old showcase account.
3. The fixture dataset depicts **one single, internally consistent household** across every in-scope page — the same account names/balances referenced on Dashboard and Accounts, the same category totals referenced on Dashboard, Budgeting, and Analytics, the same debt referenced on Debt and (if surfaced) Financial Goals' debt-payoff type. A visitor clicking between pages sees one coherent financial story, not several unrelated datasets stitched together.
4. The fixture household is realistic and moderately well-off, per the decided target — at minimum:
   - Accounts across at least three types (e.g. checking, savings, a credit card, an investment/retirement account).
   - Several months of transaction history with real variety: multiple merchants, a range of categories, a mix of income and expense entries, and at least one recognizably recurring pattern (e.g. a subscription).
   - An active current-month budget with multiple categories, including at least one comfortably under budget and at least one near or over budget — so Budgeting's over-budget indicator and health score both have something genuine to show, not an all-green or all-red degenerate case.
   - At least one active debt with a non-zero balance, an interest rate, and a real payoff projection.
   - An investment portfolio with more than one holding, showing a mix of gain and loss — so gain/loss coloring and allocation both render meaningfully rather than uniformly.
   - At least one in-progress Savings Goal and at least one in-progress Financial Goal of a type other than debt-payoff (already covered above), each at a real, partial completion percentage — never 0% or 100%.
   - A Financial Health Score with every component subscore populated at a plausible, non-perfect, non-zero value, so the breakdown view is genuinely informative.
   - Enough historical breadth (multiple months) that Net Worth History, trend charts, and Analytics' period-based metrics all render an actual trend, not a single flat point.
5. Every in-scope page's number-counter and chart-entrance animations (per `phase-5b-motion-craft.md`) fire against the fixture data on `/demo` exactly as they would on the real app — the demo is a full, real-feeling page, not a stripped-down or animation-free version of one.
6. **The fixture dataset must not visibly grow stale the longer it goes unmaintained.** Because dates within the story (transaction dates, "goal in progress since," the investment's growth history) are hard-coded, they must be expressed and rendered in a way that doesn't read as increasingly out-of-date months or years after this ships (e.g. relative framing — "within the last 3 months" — computed from render time, rather than a fixed calendar date that will eventually just say "2026" no matter when it's viewed). This is a product requirement this spec is stating explicitly, not an implementation detail left silent; the exact mechanism (relative-date computation vs. some other approach) is the Solution Architect's call.

### Edge Cases
- **A visitor opens `/demo` a year after launch with zero maintenance in between**: per AC6, the story must still read as current/recent — this is the concrete, testable form of "always populated" extended to also mean "never obviously stale."
- **A fixture number that would, in a real account, be genuinely alarming** (e.g. a maxed-out credit card, a goal at 0%): deliberately avoided by AC4's "moderately well-off... at least one near/over budget" framing — the fixture household is realistic and has some tension (an over-budget category, a debt still being paid down) without depicting financial distress, since the demo's job is to show the product's *breadth* of coverage, not a crisis scenario.
- **A cross-page inconsistency is introduced later** (e.g. Analytics' income figure diverging from Dashboard's after an unrelated edit to one fixture file): this is a fixture-data-maintenance defect against AC3, to be caught the same way any other regression would be — flagged here as a real risk of a single shared fixture story, not assumed away.

---

## Capability 3: Read-Only by Construction

### User Story
As the team operating FinanceOS, I want `/demo` to be structurally incapable of writing to anything — no form submission, no button, no request from that route ever reaches the database — so that this public, credential-free page can never be used to probe, spam, or otherwise abuse any part of the real application's backend.

### Acceptance Criteria
1. No page under `/demo` renders any control whose activation performs a write. Wherever the real authenticated equivalent page has an Add/Edit/Delete/Save/Mark-Paid/accept-suggestion/log-contribution control, the demo either omits it entirely or renders a visually present but inert equivalent with no destination — never a working control wired to nothing, and never one that silently swallows a submission without telling the visitor anything happened.
2. No Server Action from any real feature module (`features/*/server/actions.ts`) is ever imported or invoked from any file under the `/demo` route tree, directly or transitively — verified by construction (no such import exists anywhere in that tree), not merely by disabling buttons in the UI layer.
3. No page under `/demo` performs a database read either — every rendered value comes from the static fixture data, never a live Prisma query, even a read-only one. This guarantees zero database load from public `/demo` traffic and guarantees the page can never be altered, emptied out, or broken by anything happening elsewhere in the real application, exactly as decided.
4. Because there is no session and no real user record involved, `/demo` carries none of the cross-user data-leakage risk Risk #4 concerns every other route with — stated explicitly here since this is the one place in the app where "whose data is this" has a fixed, non-user-specific answer by design.
5. Read-only means no write reaches any backend — it does not mean the page is inert. Client-side-only interactions with no backend call (see Capability 5) remain fully expected and fine.

### Edge Cases
- **A visitor inspects the page source or network tab looking for an API to call directly** (e.g. attempting to POST to a Server Action's endpoint found in a bundle): finds nothing to call, because per AC2 no such import exists in the `/demo` tree in the first place — there is no disabled-but-present endpoint to discover, only its absence.
- **A visitor submits a form via browser devtools despite the UI disabling it**: has no effect beyond the browser's own client-side validation, because no Server Action is wired to that form at all (AC1/AC2) — this is a structural guarantee, not one that depends on the UI layer's disabled state being respected.
- **A future engineer adds a new in-scope page to `/demo` and reflexively copies the real page's component, including its mutating controls**: this is exactly the mistake AC1/AC2 exist to catch — flagged here so it's tested for explicitly (Definition of Done), not assumed to never happen.

---

## Capability 4: Demo Awareness

### User Story
As a visitor to `/demo`, I want it to be obvious at all times that I'm looking at a demo with fictional data, not somebody's real financial account, so I never mistake sample numbers for real ones and never wonder whether anything I do here is being saved.

### Acceptance Criteria
1. Every page under `/demo` displays a persistent, clearly visible indicator (a banner or equivalent) stating plainly that this is a demo populated with fictional/sample data — present on every reachable page, not only the entry point, so a visitor arriving via a shared deep link to a specific demo page still sees it immediately.
2. The indicator's wording never implies the data is real and never implies any action taken on this page is being saved anywhere.
3. The indicator is persistent enough that trust is never in question, but not a blocking modal or interstitial a visitor must dismiss before seeing content — consistent with the decided low-friction, no-credentials-needed access model.
4. The indicator meets the same accessibility bar every other piece of persistent chrome in this app is held to (`phase-5a-accessibility-responsive.md`'s standing WCAG 2.1 AA floor) — it is announced sensibly to assistive technology and never conveyed by color alone.

### Edge Cases
- **A visitor navigates rapidly between several demo pages**: the indicator's presence never flickers, disappears momentarily, or needs to "load in" separately from the rest of the page — it is as permanent a piece of chrome as the demo's own navigation.
- **A screen-reader user on `/demo`**: the demo-mode announcement is discoverable without being so aggressive (e.g. an `aria-live` interruption on every navigation) that it becomes noise — a static, always-present landmark is sufficient; it does not need to re-announce itself on every page change.

---

## Capability 5: Navigable Demo Experience

### User Story
As a visitor to `/demo`, I want to click around between sections the same way a real user would — into an account's detail, a specific goal, a specific holding — so the demo feels like exploring an actual product, not a single static screenshot.

### Acceptance Criteria
1. Every in-scope page (Capability list above) has a demo equivalent reachable via a persistent, demo-scoped navigation that mirrors the real app's own sidebar/nav shape — a visitor can move from Dashboard into Accounts, Transactions, Budgeting, Debt, Investments, Savings Goals, Financial Goals, Analytics, and Financial Health Score, and back, without leaving `/demo` or hitting a dead link.
2. Where the real app has a detail route nested under an in-scope page (an individual account, a savings goal, a financial goal, an investment holding), the demo provides at least one working example of that detail route, populated with fixture data consistent with its parent list page (per Capability 2 AC3) — a visitor can go one level deep, not only view flat list pages.
3. Controls that exist on a real page purely to filter/sort/search/paginate its own already-rendered data (Transactions' search bar, Analytics' period selector, and similar) may be present on the demo equivalent for visual authenticity, but are **not required** to be functionally wired to the fixture data — this spec deliberately does not require re-implementing each page's own client-side interaction logic against a static fixture array. If present but non-functional, such a control must degrade safely (a no-op, never a thrown error, a broken layout, or an attempted network call) — consistent with Capability 3 AC2's no-Server-Action requirement.
4. The demo experience is self-contained: nothing under `/demo` links out to the real authenticated app's login, signup, or any authenticated route (aside from whatever the Open Questions below eventually resolve for a public marketing entry point), and no real authenticated page is required by this spec to link into `/demo`.

### Edge Cases
- **A visitor directly types a URL for an out-of-scope page under `/demo`** (e.g. `/demo/bills`): resolves to a clear "not part of this demo" state or redirects to the demo's own entry page — never a hard crash, and never silently falling through to render the real, authenticated `/bills` page.
- **Browser back/forward navigation within `/demo`**: behaves the same as it would in the real authenticated app — no broken history state specific to the demo route tree.
- **A visitor on a small/mobile viewport**: the demo inherits the same responsive treatment (`phase-5a-accessibility-responsive.md`) the real equivalent pages already have — it is not a desktop-only experience.

---

## Definition of Done

- Every in-scope page (Dashboard, Accounts, Transactions, Budgeting, Savings Goals + detail, Financial Goals + detail, Debt, Investments + detail, Analytics, Financial Health Score) has a working `/demo` equivalent, verified by direct navigation, with every chart/number/list populated per Capability 2 — checked per page, not as an aggregate claim.
- Verified by code inspection (not just UI spot-check) that no file under the `/demo` route tree imports any feature module's `server/actions.ts`, and that no file under that tree issues a Prisma query of any kind — Capability 3's "by construction" bar, tested as such.
- Verified that visiting any `/demo` page while logged out, logged in as an ordinary user, and logged in as an admin all render identical content, and that visiting any real authenticated route while logged out still redirects to `/login` unchanged — Capability 1's no-new-gap requirement.
- Verified that every real, authenticated page contains no link, redirect, or reference to `/demo`.
- Demo-mode indicator confirmed present and accessible (axe-core, zero critical/serious, per 5a's standing bar) on every reachable `/demo` page.
- Cross-page fixture consistency (Capability 2 AC3) spot-checked across at least Dashboard, Accounts, Budgeting, and Analytics, since these four share the most overlapping figures.
- Meets the release-level bar defined in the Project Charter: tests passing, Security Architect review (the headline focus here is confirming Capability 3's read-only-by-construction guarantee and Capability 1's no-weakening-of-real-auth guarantee), Performance Engineer review (no database load introduced by public `/demo` traffic), Bug Hunter pass, documentation, and CTO/architecture sign-off.

## Dependencies

- `docs/architecture/folder-tree.md`'s existing route structure — the ten in-scope pages' real equivalents, which the demo pages are built to resemble.
- `docs/product/phase-5b-motion-craft.md` — the number-counter and chart-transition behavior every in-scope demo page's fixture-driven figures must also exhibit (Capability 2 AC5), and the reused ten-surface "chart/number-heavy" list this spec's own in-scope list is grounded in.
- `docs/product/admin.md` Capability 1's "no visible trace" precedent for Admin, applied in reverse here to keep `/demo` and `/admin` from ever resembling or linking to one another.
- `docs/product/financial-goals.md`'s existing Savings-Goal-vs-Financial-Goal boundary, which the fixture dataset's goal content (Capability 2 AC4) must respect rather than reinvent.
- The fixture dataset itself — its concrete data model/module (a static TypeScript object, a JSON file, or equivalent) is a Solution Architect/Backend Engineer artifact this spec does not design; this spec specifies only its required content (Capability 2 AC4) and its required properties (static, coherent, non-stale).
- `docs/product/phase-5a-accessibility-responsive.md`'s standing WCAG 2.1 AA floor and responsive treatment, extended to every `/demo` page per Capabilities 4 and 5.

## Success Metrics

- Zero database queries (read or write) ever logged as originating from `/demo` traffic — the direct, measurable proof of Capability 3's "read-only by construction" claim.
- Zero empty-state, zero-value, or stuck-loading-skeleton renders found across a full audit of every in-scope `/demo` page — the direct, measurable proof of "always populated."
- `/demo` remains fully functional and unchanged in appearance with zero manual maintenance for a sustained period after launch — the concrete replacement metric for the old showcase account's own operational burden (which required an admin to re-run a seed script whenever it broke or went stale).
- The team can share the `/demo` link for a sales conversation or a screenshot without any prior setup, credential-sharing, or "let me make sure the showcase account isn't broken right now" check — directly closing the operational gap `admin.md`'s removed Capability 6 used to require an admin action to close.

## Open Questions

These are genuine ambiguities this spec surfaces but does not resolve — flagged rather than silently decided:

1. **In-product discoverability.** Should any public-facing surface of the real app (most plausibly `/login`) link *to* `/demo`? The client's own framing ("anyone with the link can open it") describes access, not discoverability — it does not require the app itself to advertise the link. Left open; a small, separate, low-risk addition if wanted later.
2. **Search-engine indexing.** Should `/demo` be crawlable (default) or explicitly excluded via `robots.txt`/meta-robots? A marketing/SEO call outside this spec's scope; noted so it isn't decided by default inaction.
3. **Fixture-date mechanism.** Capability 2 AC6 requires that fixture dates never read as increasingly stale, but does not mandate the specific technique (relative-date computation from render time vs. some other approach) — left to the Solution Architect.
4. **Future scope: Bills, Recurring Income, Calendar.** Explicitly excluded here (see Out-of-Scope reasoning above); flagged so it isn't silently forgotten if there's real appetite for a later pass once the freshness/date-relativity problem those three pages pose has a proven solution from Capability 2 AC6's resolution.
5. **Multiple fixture "personas."** This spec defines exactly one coherent fixture household. A second, alternate persona (e.g. to show a different life stage or account mix) is out of scope entirely for this spec — noted as a plausible future request, not assumed needed.
