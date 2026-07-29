import { describe, expect, it } from "vitest"

import { DASHBOARD_CARD_KEYS } from "@/features/dashboard/dashboard-cards"

import { materializeDashboardCardPreferences } from "./service"

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
