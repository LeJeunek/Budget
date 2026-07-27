# Product Spec — Account Balance Auto-Adjustment from Transactions

## Status

Scoped bug fix / behavior change to existing Phase 1 (Accounts) and Phase 1
(Transactions) functionality. This is not a new phase and does not get the
full Roadmap ceremony — but because it changes how a stored money value is
computed, it gets full acceptance-criteria rigor, per the CTO's standing rule
that money-correctness changes are never "just a small fix."

## Origin

User-reported bug: "the accounts are not updated based on income
transactions. If I receive a 1000 paycheck the account received against
should reflect it." Confirmed root cause: `Account.balance` is a manually
entered, standalone number today (`docs/product/accounts.md` AC1/AC6/AC7) —
nothing in Transactions, Recurring Income, or Bills has ever adjusted it when
a transaction posts against that account. That was Phase 1's original,
deliberate design, but it does not match user expectation and the user has
confirmed the direction below.

## Decision (not open for re-litigation)

Keep `Account.balance` as a stored column (do not compute it live from
transactions at read time). Instead, auto-adjust that stored value whenever a
transaction is created, edited, deleted, or split against an account whose
balance is transaction-derived. This preserves the existing fast-read
architecture; it does not replace it.

## User Story

As a FinanceOS user, when I log, edit, delete, or split a transaction against
one of my accounts, I want that account's balance to update automatically to
reflect it, so the balance shown in the app always matches what actually
happened to my money without me having to manually recalculate and re-enter
it myself.

## Business Value

Balance is the single number users check first and trust least if it's
wrong. An account balance that silently drifts from reality on every
transaction is a correctness bug serious enough to undermine trust in every
other number the app shows (Net Worth, Dashboard, Debt Payoff). Fixing this
converts Accounts + Transactions from "a place I log things" into "a place
that actually tracks my money," which is the core value proposition of the
product.

## Scope

### In scope
- **Checking, Savings, Cash, Credit Card** accounts: balance is auto-adjusted
  by transaction create/edit/delete/split, per the sign rules in Acceptance
  Criterion 1 below.
- Manual transaction entry, transaction edit, transaction delete, transaction
  split, and CSV import — every path that creates, changes, or removes a
  transaction row against an in-scope account.
- One-time historical reconciliation for existing accounts (Acceptance
  Criterion 6).

### Explicitly out of scope
- **Investment, Retirement, and Crypto accounts.** Per
  `docs/product/accounts.md` AC7 and the existing, working
  `setDerivedBalance` / `recalculateContainerBalance` mechanism
  (`src/features/accounts/server/service.ts`), any account with one or more
  active Holdings has its balance derived exclusively from the sum of those
  Holdings' current value, written back by the Investments module. This
  change must not add a second write path to `balance` for such an account.
  Transactions logged against an Investment/Retirement/Crypto account (if the
  product allows that at all) must **not** trigger a balance adjustment under
  this feature — see Acceptance Criterion 5 for the required guard.
- Any account type not listed as in-scope above continuing to have its
  balance manually editable in the ordinary way it already is today (see AC4).
- Multi-currency, live market data, or any other feature explicitly out of
  scope per the Charter or `docs/product/accounts.md`.
- Recurring Income and Bills' own scheduling/generation logic — those
  features already terminate in an ordinary `Transaction` row per their own
  specs; once that row exists, it is in scope for this feature the same as
  any manually entered transaction. This spec does not change how or when
  Recurring Income/Bills create that row, only what happens to the account's
  balance once it exists.

## Sign Convention — Transaction Amount to Balance Adjustment

Per `docs/product/transactions.md`, every transaction's `amount` is signed
uniformly regardless of account type: **positive = money in, negative = money
out**, relative to the account it's logged against. This is unchanged by this
feature. What changes is how that signed amount maps to a change in
`Account.balance`, and that mapping differs by account type because of the
asset-vs-liability convention already established in
`docs/product/accounts.md` AC6:

1. **Checking, Savings, Cash** (asset accounts): balance adjustment equals the
   transaction amount, unchanged in sign.
   - Example: a $1,000 paycheck deposited to Checking is `amount = +1000`;
     Checking's balance increases by $1,000.
   - Example: a $60 grocery purchase from Checking is `amount = -60`;
     Checking's balance decreases by $60.
2. **Credit Card** (liability account; balance represents debt owed, stored
   and displayed as a positive number per AC6): balance adjustment is the
   **inverse** of the transaction amount.
   - Example: a $50 purchase charged to a credit card is `amount = -50` (an
     expense, same sign convention as any other account) but increases the
     amount owed — the card's balance must **increase** by $50, not decrease.
   - Example: a $200 payment made toward a credit card, logged as a
     transaction against the credit card account, is `amount = +200` (money
     in, relative to that account) and must **decrease** the balance (debt
     owed) by $200.
   - This is the single highest-risk sign detail in this feature: a naive
     "always add the amount" implementation will silently move every credit
     card balance in the wrong direction. Backend Engineer must treat Credit
     Card as its own explicit branch, not a default case.
3. **Investment, Retirement, Crypto**: out of scope entirely (see above) —
   no transaction-driven balance adjustment of any kind, regardless of sign.

## Acceptance Criteria

1. **Create**: creating a transaction against an in-scope account
   immediately adjusts that account's `balance` by the signed amount
   described above, atomically with the transaction's creation (both succeed
   or both fail together — a transaction must never be recorded without its
   balance effect, or vice versa).
2. **Edit**: editing an existing transaction correctly re-derives the
   account balance impact for every field that can change it:
   - **Amount changes, account unchanged**: the balance adjustment made at
     create time is reversed and the new amount's adjustment is applied to
     the same account, net result equivalent to "undo the old effect, apply
     the new one."
   - **Account changes, amount unchanged**: the old account's balance has the
     original adjustment reversed; the new account has that same amount's
     adjustment applied fresh (using the new account's own sign rule, e.g.
     moving a transaction from Checking to a Credit Card must apply the
     Credit-Card sign rule at the new account, not carry over the old
     account's arithmetic).
   - **Both amount and account change in the same edit** (explicitly called
     out as a case to handle, per `docs/product/transactions.md`'s
     `UpdateTransactionSchema`, which allows both fields in one call): the old
     account has the *original* amount's effect reversed; the new account has
     the *new* amount's effect applied under its own sign rule. This must be
     computed as a single, atomic operation — there is no intermediate state
     where only one of the two changes has been applied.
   - Editing any other field (merchant, date, category, notes, tags) has no
     balance effect.
3. **Delete**: deleting a transaction against an in-scope account reverses
   that transaction's balance effect on its account, atomically with the
   row's deletion. Deleting a split parent (whose own `amount` is purely
   informational and must never have had a balance effect of its own — see
   Criterion 4) cascades to its split children exactly as it already does for
   tags/receipts; each child's own balance effect must be reversed as part of
   that same cascade, since each child independently affected the balance
   when it was created.
4. **Split**: per `docs/product/transactions.md`, a split parent's `amount`
   is "purely informational" once split children exist, and Auto-
   Categorization already excludes split parents from anything that reads
   `amount` as real (`EXCLUDE_SPLIT_PARENTS` /
   `src/features/transactions/server/categorization.ts`). This feature must
   follow the same rule:
   - The **parent's original create-time balance effect must be reversed**
     at the moment it is split (its `amount` stops being real, so its effect
     on the balance must stop too).
   - **Each split child's own signed amount then applies its own balance
     effect**, using the same account (a split's children always share the
     parent's `accountId`) and the same sign rule as any ordinary
     transaction. Because split amounts are validated to sum exactly to the
     parent's original amount, the net balance effect of "parent reversed +
     all children applied" is mathematically identical to the parent's
     original effect never having changed — this must be true by construction,
     not by coincidence, and should be covered by a test asserting exact
     equality.
   - Un-splitting (deleting split children, per `docs/product/transactions.md`'s
     "no merge back" Phase 1 limitation) is just ordinary child-transaction
     deletion under Criterion 3 — no special-cased "restore the parent's
     effect" logic is needed or wanted, since the parent row's `amount` was
     never re-applied.
5. **CSV Import**: every successfully imported row is an ordinary transaction
   against the one account chosen for that import (`docs/product/
   transactions.md` AC16), and must adjust that account's balance exactly as
   manual entry would — import is not exempt. A user who imports a CSV
   containing their paycheck has the identical expectation as one who types
   it in by hand; treating import differently would reintroduce the exact bug
   this feature exists to fix, just via a different entry point. Rows skipped
   as invalid or duplicate must have no balance effect. Implementation is
   free to apply the whole import's net effect as a single aggregate balance
   update rather than one update per row (this is a performance concern, not
   a product one) provided the net result is identical to summing every
   valid row's individual effect.
6. **Guard against out-of-scope account types**: before applying any balance
   adjustment, the account's type must be checked against the in-scope list
   (Criterion "Scope" above). An Investment/Retirement/Crypto account must
   never have its balance touched by this mechanism, regardless of whether it
   currently has active Holdings or not — that account type's balance is
   always Investments' concern, never Transactions'. If product direction
   ever allows ordinary transactions against these account types, this
   guard's exclusion list — not a "does it currently have active holdings"
   check — is what must gate it, so a container that temporarily has zero
   active holdings doesn't briefly become writable by this mechanism and then
   get silently overwritten again the next time a holding changes.
7. **Manual balance edits continue to work, and coexist with automatic
   adjustment.** Per `docs/product/accounts.md` AC3 and the user's real-world
   need to correct a starting balance or reconcile against a bank statement,
   a user must still be able to directly edit the `balance` field on any
   Checking/Savings/Cash/Credit-Card account going forward, exactly as
   `updateAccount` already allows today for any account without active
   Holdings. A manual edit simply overwrites the current value, the same as
   it does today; it does not need to "know about" or reconcile against
   transaction history. The two mechanisms (automatic, per-transaction
   adjustment, and manual, user-initiated overwrite) both write the same
   column and are expected to coexist exactly like a real bank statement
   reconciliation works: transactions keep the running total moving day to
   day, and an occasional manual correction re-anchors it if it's ever
   noticed to be off (e.g. a fee the app doesn't know about, an error in a
   historical transaction the user doesn't want to hunt down and fix
   individually). This is a deliberate, permanent feature of the design, not
   a gap to close later.
8. **Historical data reconciliation (one-time, at ship time).** See dedicated
   section below — this is the single highest-risk item in this feature and
   is called out separately rather than buried as one bullet among many.

## Historical Data Reconciliation — Recommendation

**Every existing in-scope account already has transactions recorded against
it that never adjusted its balance.** Two options exist:

- **Option A (recommended): one-time backfill.** At ship time, run a
  one-time migration/reconciliation job that recomputes every existing
  in-scope account's balance as: the account's current stored `balance` is
  treated as already correct as of "now," and going forward only new
  transaction activity (create/edit/delete/split) adjusts it — **OR**,
  preferably, recompute each account's balance from scratch as the sum of
  every existing transaction's signed effect (per the sign rules above),
  and have the user confirm/compare that computed figure against their real
  bank statement once, at the moment this feature ships.
- **Option B: no backfill, manual true-up.** Ship the feature so only
  transactions created after ship date participate in auto-adjustment,
  leaving every existing account's current balance untouched and requiring
  the user to manually verify/correct it once against their real bank
  statement, with no system-computed assistance.

**Recommendation: Option A, with the recomputed figure presented to the user
for confirmation rather than silently overwritten.**

Reasoning:
- The user's own bug report is specifically that historical transactions
  (a "1000 paycheck") already failed to move the balance — leaving existing
  accounts un-reconciled means the exact accounts the user is complaining
  about stay wrong indefinitely, and every account in the database today is
  in that state. Option B does not actually fix the reported bug for a single
  existing account; it only prevents the bug from recurring going forward.
- However, a **silent** backfill is its own serious risk: if the currently
  stored `balance` on some account is itself the user's best/most recent
  manual entry (e.g. they updated it last week to match their real bank
  balance, and some historical transactions predating that entry were never
  logged, are duplicates, or are otherwise not a complete record), a blind
  "sum of all transactions" recompute could silently produce a number that
  is further from reality than what's there today, with no way for the user
  to notice or undo it.
- The middle path — compute the reconciled figure, present it to the user
  explicitly per account (e.g. "Based on your transaction history, this
  account's balance would be $X, currently showing $Y — apply this
  correction?") and let them accept or decline per account — gets the
  correctness benefit of Option A without the silent-corruption risk called
  out in the brief. This also reuses the same "manual balance edit" pathway
  from Criterion 7, so it requires no new UI primitive, only a one-time
  prompt built on top of it.
- This reconciliation step is a one-time event scoped to ship day, not an
  ongoing feature; once a user has accepted or declined the reconciliation
  prompt for an account, that account behaves purely per Criteria 1–7 from
  that point forward with no further special-cased backfill logic.

This reconciliation prompt/flow is its own small piece of scope Backend
Engineer and Frontend Lead should confirm feasible before commit — if it
turns out to be materially more complex than presenting a single confirm/
decline dialog per account, escalate back to Product Owner rather than
silently downgrading to Option B.

## Net Worth, Debt Payoff, and Net Worth Snapshot — Impact Assessment

- **`getNetWorth`** (`src/features/dashboard/server/service.ts`) already
  reads `Account.balance` live, directly from the database, on every call —
  it applies the same asset/liability sign convention this spec relies on
  (Credit Card negated) and requires **no code change**. Once `balance` is
  kept continuously correct by this feature, `getNetWorth`'s output simply
  becomes correct more often (specifically, immediately after every
  transaction, rather than only after a manual balance edit) — it was never
  caching or copying the value.
- **Debt Payoff** (`src/features/debt/server/service.ts`): a Debt linked to
  an Account (`accountId` set) already reads that Account's balance live as
  its "effective balance" for every payoff-math projection, by explicit
  design ("a linked Credit Card's projections always reflect its true
  current balance even though the `Debt` row's own `balance` column is
  stale/unused in that state," per that file's own documentation). This
  requires **no code change** either — it is already built to treat the
  Account's balance as the live source of truth, which is exactly what this
  feature makes more consistently accurate. An **unlinked** Debt (no
  `accountId`) is entirely outside this feature's scope, since its balance
  column is user-maintained independent of any Account.
- **Net Worth Snapshot cron** (`src/app/api/cron/net-worth-snapshot/route.ts`,
  `src/features/dashboard/server/snapshot.ts`): captures a **point-in-time**
  copy of `getNetWorth`'s output into `NetWorthSnapshot` once per run (daily,
  per its existing schedule). This is an intentional, existing snapshot
  design — it already only reflects whatever `Account.balance` was at the
  moment the cron last ran, regardless of this feature. This feature does
  not make snapshots go stale "faster than expected": a snapshot was always
  only as fresh as its last capture, and balance could already change
  in-between captures today via a manual account edit. This feature simply
  adds another, more frequent reason a balance can move between two
  snapshot captures (every transaction, not just a manual edit) — the
  existing between-snapshot staleness window and its documented
  sparse-history/thinning handling in `net-worth-history.ts` are unaffected
  and require **no change**.

## Edge Cases

- **Transaction against an archived account**: not reachable in the first
  place per `docs/product/transactions.md` AC12 ("only non-archived accounts
  can be selected") — no new edge case introduced here.
- **Reassigning a transaction to a newly-archived account mid-edit**: already
  blocked by the existing archived-account check in `updateTransaction`; this
  feature does not change that gate, it only adds a balance effect to the
  reassignment once it's allowed to proceed.
- **Reassigning a transaction between two different account *types*** (e.g.
  Checking to Credit Card): the balance effect at the new account must use
  the new account's own sign rule (Criterion 2), never the old account's.
- **Reassigning a transaction to/from an out-of-scope account type**
  (Investment/Retirement/Crypto), if the product ever allows creating
  ordinary transactions against one: the in-scope side of the move still
  gets its balance adjusted; the out-of-scope side must not (Criterion 6).
  This is flagged as a case Backend Engineer must explicitly test, since it's
  the one scenario where the two halves of a single edit follow different
  rules from each other.
- **Deleting a split parent whose children were themselves edited or
  reassigned after the split** (e.g. a split child's category or amount was
  later changed): the cascade-delete must reverse whatever each child's
  *current* balance effect is at time of deletion, not its original
  as-created effect, since a child transaction is an ordinary transaction
  once created and may have been independently edited per Criterion 2.
- **Negative resulting balances**: unaffected by this feature —
  `docs/product/accounts.md`'s existing "negative balances allowed for
  Checking/Savings/Cash (overdraft)" edge case continues to apply; this
  feature does not introduce a new floor or validation rule. A Credit Card
  whose balance is driven to a negative value (e.g. an overpayment) is
  likewise allowed, not blocked, consistent with the same "no artificial
  floor" precedent.
- **Concurrent edits to the same account** (e.g. two transactions against the
  same account saved in close succession): the balance adjustment must be
  applied as an atomic increment/decrement against the current stored value
  (not a read-modify-write race using a client-held stale balance), so two
  near-simultaneous transactions against the same account both land
  correctly rather than one clobbering the other's effect.
- **CSV import row-level failure partway through a large file**: only rows
  that actually commit as transactions may contribute a balance effect; a
  row that fails validation or is skipped as a duplicate must contribute
  nothing, consistent with Criterion 5.
- **A user declines the one-time reconciliation prompt** (see Historical
  Data Reconciliation): their account's currently-stored balance is left
  untouched, and — per this spec's decision — the automatic mechanism still
  applies to every transaction from that point forward. The account may
  remain "off" by whatever historical discrepancy existed before ship date
  until the user manually corrects it themselves via Criterion 7; this is an
  accepted, user-chosen outcome, not a bug.

## Definition of Done

- Create, edit (amount-only, account-only, and both-in-one-edit), delete, and
  split all produce the exact balance effect specified above, verified for
  both an asset-type account and a Credit Card account (the inverted-sign
  case is not considered covered until it has its own explicit test).
- CSV import's net balance effect on the target account, for a batch of
  valid/invalid/duplicate rows, exactly equals the sum of each valid row's
  individual effect.
- Investment/Retirement/Crypto accounts are verified to have zero balance
  effect from any transaction-side code path, including a regression test
  guarding against this mechanism ever writing to such an account's balance.
- A plain Checking/Savings/Cash/Credit-Card account's balance remains
  independently, manually editable via the existing account-edit path, and a
  manual edit followed by a new transaction correctly adjusts from the
  manually-set value (not from some other cached figure).
- The one-time historical reconciliation prompt has been reviewed and
  confirmed feasible by Backend Engineer/Frontend Lead, or Product Owner has
  been notified of a scoped-down alternative before implementation proceeds.
- `getNetWorth`, Debt Payoff projections, and the Net Worth Snapshot cron are
  confirmed (by code review, since none require a code change per the impact
  assessment above) to still read `Account.balance` live with no new caching
  introduced anywhere in this change.
- Meets the release-level bar defined in the Project Charter for a
  money-correctness change: tests passing (including the sign-convention and
  split-parent-reversal cases called out above), Security Architect review
  (balance adjustments remain scoped to the authenticated user's own
  accounts, same ownership rules as every existing mutation), Performance
  Engineer review (no per-row balance update introducing an N+1 write
  pattern on large CSV imports), documentation, and CTO/architecture sign-off.

## Dependencies

- Accounts (Phase 1) and Transactions (Phase 1): this feature modifies
  existing behavior in both, it does not introduce a new domain.
- Investments' existing `setDerivedBalance`/`recalculateContainerBalance`
  mechanism (Phase 3a): this feature must not conflict with it; the guard in
  Criterion 6 is the explicit contract between the two.
- Debt's existing "read the linked Account's balance live" design (Phase 3a):
  already compatible, no dependency work needed, called out here only so its
  correctness is understood rather than assumed.

## Success Metrics

- Zero reported incidents of an account balance failing to reflect a posted
  transaction (this is the metric the original bug report maps to directly).
- Zero reported incidents of a Credit Card balance moving in the wrong
  direction relative to a purchase or payment.
- Reduction in the "manual balance edit" action's usage rate over time
  post-ship, as a proxy signal that users increasingly trust the automatic
  figure rather than routinely overriding it to correct drift.
- Net Worth and Debt Payoff figures requiring zero separate bug reports
  attributable to this change (confirming the "no code change needed, already
  reads live" assessment holds in production).
