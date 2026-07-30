import { describe, expect, it } from "vitest"

import { DASHBOARD_CARD_KEYS } from "@/features/dashboard/dashboard-cards"

import { materializeDashboardCardPreferences, wouldHideLastVisibleCard } from "./service"

// Coverage for `materializeDashboardCardPreferences` — the row-absence
// materialization algorithm phase-4c-technical-design.md §3.5 specifies,
// extracted as a pure, database-free function specifically so it can be
// unit-tested directly, per this codebase's "no integration-test database"
// convention (e.g. `financial-health-score/server/service.test.ts`).

describe("materializeDashboardCardPreferences", () => {
  it("returns every canonical card, visible, in canonical order, when the user has no rows at all", () => {
    const result = materializeDashboardCardPreferences([])

    expect(result).toHaveLength(DASHBOARD_CARD_KEYS.length)
    expect(result.every((card) => card.visible)).toBe(true)
    expect(result.map((card) => card.key)).toEqual(DASHBOARD_CARD_KEYS.map((card) => card.key))
    // Order is strictly ascending, matching canonical position.
    result.forEach((card, index) => expect(card.order).toBe(index))
  })

  it("uses a row's own order/visible when one exists for a card", () => {
    const [first, second] = DASHBOARD_CARD_KEYS
    const result = materializeDashboardCardPreferences([
      { cardKey: first.key, order: 5, visible: false },
      { cardKey: second.key, order: 3, visible: true },
    ])

    const firstView = result.find((card) => card.key === first.key)
    const secondView = result.find((card) => card.key === second.key)
    expect(firstView).toMatchObject({ order: 5, visible: false })
    expect(secondView).toMatchObject({ order: 3, visible: true })
  })

  it("appends every card with no stored row after every card that DOES have a row, in canonical relative order", () => {
    const [first, , third] = DASHBOARD_CARD_KEYS
    // Only two of the canonical cards have explicit rows, at orders 0 and 1.
    const result = materializeDashboardCardPreferences([
      { cardKey: first.key, order: 1, visible: true },
      { cardKey: third.key, order: 0, visible: true },
    ])

    const sorted = [...result].sort((a, b) => a.order - b.order)
    // The two rows with explicit preferences come first (by their own
    // stored order), then every remaining canonical card is appended after
    // them, in DASHBOARD_CARD_KEYS' own relative order.
    expect(sorted[0].key).toBe(third.key)
    expect(sorted[1].key).toBe(first.key)
    const appendedKeys = sorted.slice(2).map((card) => card.key)
    const expectedAppendedKeys = DASHBOARD_CARD_KEYS.map((card) => card.key).filter(
      (key) => key !== first.key && key !== third.key,
    )
    expect(appendedKeys).toEqual(expectedAppendedKeys)
    // Every appended (row-absent) card defaults to visible.
    expect(sorted.slice(2).every((card) => card.visible)).toBe(true)
  })

  it("ignores a stale row whose cardKey no longer exists in the canonical list (risk-register.md #36)", () => {
    const result = materializeDashboardCardPreferences([
      { cardKey: "a-since-removed-card", order: 0, visible: false },
    ])

    // The stale row contributes nothing — every canonical card still
    // resolves to its own row-absence default, and the stale key never
    // appears in the output.
    expect(result).toHaveLength(DASHBOARD_CARD_KEYS.length)
    expect(result.find((card) => card.key === "a-since-removed-card")).toBeUndefined()
    expect(result.every((card) => card.visible)).toBe(true)
  })

  it("a stale row's order never influences where a legitimate appended card lands", () => {
    const [first] = DASHBOARD_CARD_KEYS
    const result = materializeDashboardCardPreferences([
      { cardKey: "a-since-removed-card", order: 99, visible: true },
      { cardKey: first.key, order: 0, visible: true },
    ])

    const sorted = [...result].sort((a, b) => a.order - b.order)
    // Every other canonical card is appended starting right after `first`'s
    // own order (1, 2, 3, ...), not after the stale row's order 99 — proof
    // the stale row was excluded from the "existing max order" computation.
    expect(sorted[0].key).toBe(first.key)
    expect(sorted[1].order).toBe(1)
  })

  it("preserves every canonical card's label from DASHBOARD_CARD_KEYS", () => {
    const result = materializeDashboardCardPreferences([])
    for (const card of DASHBOARD_CARD_KEYS) {
      expect(result.find((view) => view.key === card.key)?.label).toBe(card.label)
    }
  })
})

// Coverage for `wouldHideLastVisibleCard` — AC3's "at least one Dashboard
// card must remain visible" guard, extracted as a pure predicate specifically
// so it can be unit-tested without a database (this file's own top-of-file
// note). This is the exact guard `updateDashboardCardVisibility`
// (`server/actions.ts`) now re-evaluates INSIDE a `Serializable`
// `db.$transaction`, against a snapshot read fresh from that transaction, to
// fix the TOCTOU race in dashboard-card-visibility-toctou-empty-dashboard.md
// (two concurrent requests hiding two different cards, each reading a stale
// "2 still visible" snapshot before either had written, both passing this
// exact guard, and jointly leaving zero cards visible). These tests confirm
// the guard's own decision is correct for every state it could be asked to
// evaluate; they cannot, by themselves, exercise the cross-transaction
// concurrency control (Postgres's `Serializable` isolation forcing one of two
// truly-concurrent transactions to abort with `P2034`) that makes each
// evaluation run against an isolated, not-concurrently-invalidated snapshot
// in the first place — this codebase has no integration-test database (see
// `lib/ai/rate-limit.test.ts`'s identical note), so that mechanism is instead
// verified at the source level in `actions.test.ts`.
describe("wouldHideLastVisibleCard", () => {
  const [cardA, cardB, cardC] = DASHBOARD_CARD_KEYS

  it("allows hiding a card when at least one other card would remain visible", () => {
    const current = DASHBOARD_CARD_KEYS.map((card, index) => ({
      key: card.key,
      label: card.label,
      order: index,
      visible: true,
    }))
    expect(wouldHideLastVisibleCard(current, cardA.key, false)).toBe(false)
  })

  it("blocks hiding the one and only currently-visible card", () => {
    const current = DASHBOARD_CARD_KEYS.map((card, index) => ({
      key: card.key,
      label: card.label,
      order: index,
      visible: card.key === cardA.key,
    }))
    expect(wouldHideLastVisibleCard(current, cardA.key, false)).toBe(true)
  })

  it("the concurrency-relevant case: with exactly two cards visible (A, B), hiding EITHER one alone is allowed, but each request's own guard is only valid against ITS OWN read — this is why the guard must be re-evaluated inside a Serializable transaction, not trusted from a pre-transaction read", () => {
    const currentTwoVisible = DASHBOARD_CARD_KEYS.map((card, index) => ({
      key: card.key,
      label: card.label,
      order: index,
      visible: card.key === cardA.key || card.key === cardB.key,
    }))
    // Each individually reads as safe against this shared "2 visible" snapshot...
    expect(wouldHideLastVisibleCard(currentTwoVisible, cardA.key, false)).toBe(false)
    expect(wouldHideLastVisibleCard(currentTwoVisible, cardB.key, false)).toBe(false)

    // ...but if BOTH were applied without re-reading in between (the bug),
    // the resulting state has zero visible cards among A/B — which the guard
    // WOULD correctly block, if only it were asked about that resulting
    // state rather than the stale shared snapshot both requests started
    // from. This is exactly why `updateDashboardCardVisibility` re-reads
    // `current` from inside the Serializable transaction on every call
    // rather than ever reusing a caller-supplied snapshot.
    const afterBothHidesApplied = currentTwoVisible.map((card) =>
      card.key === cardA.key || card.key === cardB.key ? { ...card, visible: false } : card,
    )
    // Every card other than A/B was explicitly set to `visible: false` in
    // this test's own setup above (not left at some default), so once A and
    // B are hidden too, no card remains visible at all — demonstrating the
    // unguarded result the Serializable transaction fix exists to prevent.
    expect(afterBothHidesApplied.some((card) => card.visible)).toBe(false)
    expect(afterBothHidesApplied.find((c) => c.key === cardA.key)?.visible).toBe(false)
    expect(afterBothHidesApplied.find((c) => c.key === cardB.key)?.visible).toBe(false)
  })

  it("allows unhiding a card regardless of current visibility counts (visible: true never triggers the guard)", () => {
    const current = DASHBOARD_CARD_KEYS.map((card, index) => ({
      key: card.key,
      label: card.label,
      order: index,
      visible: card.key === cardA.key,
    }))
    expect(wouldHideLastVisibleCard(current, cardC.key, true)).toBe(false)
  })

  it("hiding an already-hidden card never triggers the guard (it isn't in currentlyVisible to begin with)", () => {
    const current = DASHBOARD_CARD_KEYS.map((card, index) => ({
      key: card.key,
      label: card.label,
      order: index,
      visible: card.key === cardA.key,
    }))
    expect(wouldHideLastVisibleCard(current, cardB.key, false)).toBe(false)
  })
})
