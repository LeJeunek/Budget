# Product Spec — Calendar v1 & Notifications v1 (Phase 2)

Both are small, in-scope-but-minor features per the Roadmap: Calendar v1 is a view built entirely on top of Bills, and Notifications v1 is a small alert layer over both Bills and Budgeting. They're combined into a single document and treated more briefly than this phase's three primary specs (Budgeting, Savings Goals, Bills), consistent with the Roadmap's framing of both as small additions rather than new domains.

---

## Calendar v1

### User Story
As a FinanceOS user, I want to see my upcoming bills laid out on a calendar so I can visually plan around due dates, alongside (or instead of) the plain upcoming list.

### Business Value
A calendar view is a low-cost, high-clarity way to answer "what do I owe and when, this month" at a glance — useful for users who think in terms of a monthly calendar rather than a sorted list. It reuses Bills' due-date data entirely, so it's a small feature to ship this phase while still giving the phase a second, distinct way to consume the same underlying Bills data.

### Scope note: paydays are deferred
The Roadmap describes Calendar v1 as "bills + paydays." Recurring income (paydays) is not modeled as its own domain until Phase 3 ("Recurring income tracking," per the Roadmap), so there is no data model yet to source payday dates from. **Calendar v1 in this phase is scoped to bills only.** Paydays are deferred to whenever Phase 3's recurring income feature ships and can be layered onto this same calendar view at that point — this is a scope reduction from the Roadmap's literal wording, flagged explicitly rather than invented around.

### Acceptance Criteria
1. A user can view a monthly calendar showing every bill occurrence due that month, placed on its due date.
2. Each calendar entry shows at minimum the bill name and amount, and reflects the same status (Upcoming/Due Today/Late/Paid) defined in the Bills spec.
3. A user can navigate to past and future months to see historical and upcoming bill due dates.
4. Selecting a calendar entry takes the user to that bill's detail (consistent with how Global Search v1 results link to their source, per the Transactions spec).

### Edge Cases
- **A month with no bills due**: shown as a clear empty calendar, not an error.
- **Multiple bills due on the same day**: all shown on that day's cell without one crowding out another.

### Definition of Done
- Calendar renders bill occurrences correctly across past, current, and future months, matching Bills' own status data exactly (no drift between the two views).
- Meets the release-level bar defined in the Project Charter: tests passing, Security Architect review (calendar scoped strictly to the authenticated user's own bills), documentation, and CTO/architecture sign-off.

### Dependencies
- Bills (Phase 2, this phase's sibling spec): Calendar v1 has no data of its own; it is entirely a view over Bills' due dates and statuses.

### Success Metrics
- Calendar view usage rate relative to the plain Bills upcoming list (which view users actually prefer, informs future calendar investment).

---

## Notifications v1

### User Story
As a FinanceOS user, I want to be notified within the app when I've gone over budget in a category or when a bill is due soon, so I find out proactively instead of only when I happen to check.

### Business Value
In-app notifications close the loop on both Budgeting and Bills: without them, both features are useful only if the user remembers to go check. A budget-exceeded or bill-due nudge is what makes the app feel like it's actively looking out for the user, materially increasing the perceived value of both features it's built on. Scoped to in-app only this phase, per the Roadmap's explicit deferral of email/push to Phase 4+, keeps this a small addition rather than a new delivery-infrastructure project.

### Acceptance Criteria
1. A user receives an in-app notification when a budgeted category's Spent amount exceeds its Allocated amount for the current month (per the Budgeting spec's over-budget indicator).
2. A user receives an in-app notification when a bill occurrence is due within a short, sensible advance window (e.g. a few days out) and again if it becomes Late without being marked paid.
3. Notifications are visible from a single, persistent location in the app (e.g. a notification indicator/inbox reachable from anywhere), not just a one-time toast a user could miss.
4. A user can mark a notification as read/dismiss it; dismissing does not undo or change the underlying budget/bill state.
5. Notifications are scoped strictly to the authenticated user's own budgets and bills.

### Edge Cases
- **A category that goes over budget multiple times in the same month** (e.g. the user keeps spending after already being over): does not spam a duplicate notification for every additional transaction — one active "over budget" notification per category per month is sufficient.
- **A bill that's already Late when the notification system is first used** (e.g. it became late before this feature existed): still surfaces a notification rather than being silently skipped because it predates the feature.
- **A user with no budget set and no bills**: sees an empty notifications state, not an error.
- **Marking a bill paid after a "due soon" or "late" notification already fired**: the notification is not retroactively deleted, but no further notifications fire for that already-resolved occurrence.

### Definition of Done
- Budget-exceeded and bill-due/late notifications both fire correctly and exactly once per triggering event (no duplicate spam, no missed notification) against real Budgeting and Bills data.
- Notification inbox/indicator and read/dismiss behavior are implemented consistent with the phase's UI patterns.
- Meets the release-level bar defined in the Project Charter: tests passing, Security Architect review (no cross-user notification leakage), documentation, and CTO/architecture sign-off.

### Dependencies
- Budgeting (Phase 2): source of the budget-exceeded trigger.
- Bills (Phase 2): source of the bill-due/late trigger.

### Success Metrics
- Notification-to-action rate: percentage of budget-exceeded notifications followed by the user viewing that category's budget, and percentage of bill-due notifications followed by the bill being marked paid before becoming Late.
- Reduction in Late bill occurrences after Notifications v1 ships, compared to the Bills-only baseline (does proactive nudging actually change outcomes).
- Zero reported duplicate/spam notification complaints.
