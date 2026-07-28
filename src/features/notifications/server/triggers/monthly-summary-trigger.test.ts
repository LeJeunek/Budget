import { readFileSync } from "node:fs"
import { join } from "node:path"

import { beforeEach, describe, expect, it, vi } from "vitest"

// `monthly-summary-trigger.ts` imports `dashboard/server/monthly-summary.ts`,
// which transitively imports `EXCLUDE_SPLIT_PARENTS` (via
// `features/analytics/server/expense-breakdown.ts`) from
// `features/transactions/server/service.ts` -> `.../receipts.ts` ->
// `lib/uploadthing.ts`, whose module-level `export const utapi = new UTApi()`
// throws under vitest's jsdom test environment. This mock exists purely to
// make the module graph importable in a test process — mirrors
// `features/dashboard/server/monthly-summary.test.ts`'s identical mock;
// never exercised by anything in this file.
vi.mock("@/lib/uploadthing", () => ({ utapi: {} }))

import { evaluateMonthlySummaryTriggers } from "./monthly-summary-trigger"

vi.mock("@/features/dashboard/server/monthly-summary", () => ({
  getRecentSummaries: vi.fn(),
}))
vi.mock("../notification-mapper", () => ({
  createNotificationIfNew: vi.fn(),
}))

// Fixed instant reused by every `fakeNotification` call below, so two
// separately-constructed "expected" and "actual" notification objects for
// the same `monthlySummaryId` compare equal via `toEqual` — a fresh
// `new Date()` per call is flaky (the actual and expected calls can land in
// different milliseconds).
const FIXED_NOW = new Date("2026-07-15T12:00:00.000Z")

function fakeSummary(overrides: {
  id: string
  month: string
  narrative: string | null
}) {
  return {
    id: overrides.id,
    month: overrides.month,
    narrative: overrides.narrative,
    citedFigures: overrides.narrative === null ? null : [],
    isPartialMonth: false,
  }
}

function fakeNotification(monthlySummaryId: string, month: string, narrative: string) {
  return {
    id: `notif-${monthlySummaryId}`,
    createdAt: FIXED_NOW,
    readAt: null,
    dismissedAt: null,
    type: "MONTHLY_SUMMARY_READY" as const,
    monthlySummaryId,
    month,
    narrative,
  }
}

// Every test below re-mocks `getRecentSummaries`/`createNotificationIfNew`
// with its own scenario; without a reset between tests, `vi.fn()`'s call
// history (and the last test's `mockImplementation`) would otherwise leak
// across tests via the module-level mocks declared above.
beforeEach(() => {
  vi.clearAllMocks()
})

/**
 * `evaluateMonthlySummaryTriggers` is short enough, and its one dependency
 * narrow enough, to mock directly (`vi.mock`) rather than only check at the
 * source level — mirrors `features/analytics/server/insights.test.ts`'s own
 * `vi.mock`-based coverage of a similarly small DB-touching orchestration
 * function.
 */
describe("evaluateMonthlySummaryTriggers", () => {
  it("returns [] and never attempts a create when there are no MonthlySummary rows yet", async () => {
    const { getRecentSummaries } = await import("@/features/dashboard/server/monthly-summary")
    const { createNotificationIfNew } = await import("../notification-mapper")
    vi.mocked(getRecentSummaries).mockResolvedValue([])

    const result = await evaluateMonthlySummaryTriggers("user-1")

    expect(result).toEqual([])
    expect(createNotificationIfNew).not.toHaveBeenCalled()
  })

  it("returns [] and never attempts a create when the most recent row's narrative is still null", async () => {
    const { getRecentSummaries } = await import("@/features/dashboard/server/monthly-summary")
    const { createNotificationIfNew } = await import("../notification-mapper")
    vi.mocked(getRecentSummaries).mockResolvedValue([
      fakeSummary({ id: "summary-1", month: "2026-07", narrative: null }),
    ])

    const result = await evaluateMonthlySummaryTriggers("user-1")

    expect(result).toEqual([])
    expect(createNotificationIfNew).not.toHaveBeenCalled()
  })

  it("attempts exactly one create, keyed on the most recent row's own id, when its narrative is non-null", async () => {
    const { getRecentSummaries } = await import("@/features/dashboard/server/monthly-summary")
    const { createNotificationIfNew } = await import("../notification-mapper")
    vi.mocked(getRecentSummaries).mockResolvedValue([
      fakeSummary({
        id: "summary-1",
        month: "2026-07",
        narrative: "You saved more than last month.",
      }),
    ])
    vi.mocked(createNotificationIfNew).mockResolvedValue(
      fakeNotification("summary-1", "2026-07", "You saved more than last month."),
    )

    const result = await evaluateMonthlySummaryTriggers("user-1")

    expect(createNotificationIfNew).toHaveBeenCalledTimes(1)
    expect(createNotificationIfNew).toHaveBeenCalledWith({
      userId: "user-1",
      type: "MONTHLY_SUMMARY_READY",
      monthlySummaryId: "summary-1",
    })
    expect(result).toEqual([fakeNotification("summary-1", "2026-07", "You saved more than last month.")])
  })

  it("returns [] (not [null]) when createNotificationIfNew reports an already-existing row (dedup)", async () => {
    const { getRecentSummaries } = await import("@/features/dashboard/server/monthly-summary")
    const { createNotificationIfNew } = await import("../notification-mapper")
    vi.mocked(getRecentSummaries).mockResolvedValue([
      fakeSummary({
        id: "summary-1",
        month: "2026-07",
        narrative: "Already notified for this month.",
      }),
    ])
    vi.mocked(createNotificationIfNew).mockResolvedValue(null)

    const result = await evaluateMonthlySummaryTriggers("user-1")

    expect(result).toEqual([])
  })

  /**
   * (Phase 4b bug fix) Regression coverage for
   * docs/testing/bug-reports/
   * monthly-summary-notification-skips-months-after-evaluation-gap.md: two
   * new, never-yet-notified `MonthlySummary` rows exist (a gap spanning 2+
   * months since the last evaluation pass) — both must get their own
   * `createNotificationIfNew` attempt, not only whichever is most recent.
   */
  it("attempts a create for every unnotified row in the window when an evaluation gap spans 2+ new months", async () => {
    const { getRecentSummaries } = await import("@/features/dashboard/server/monthly-summary")
    const { createNotificationIfNew } = await import("../notification-mapper")
    vi.mocked(getRecentSummaries).mockResolvedValue([
      fakeSummary({ id: "summary-2", month: "2026-06", narrative: "June recap." }),
      fakeSummary({ id: "summary-1", month: "2026-05", narrative: "May recap." }),
    ])
    vi.mocked(createNotificationIfNew).mockImplementation(async ({ monthlySummaryId }) =>
      fakeNotification(
        monthlySummaryId as string,
        monthlySummaryId === "summary-2" ? "2026-06" : "2026-05",
        monthlySummaryId === "summary-2" ? "June recap." : "May recap.",
      ),
    )

    const result = await evaluateMonthlySummaryTriggers("user-1")

    expect(createNotificationIfNew).toHaveBeenCalledTimes(2)
    expect(createNotificationIfNew).toHaveBeenCalledWith({
      userId: "user-1",
      type: "MONTHLY_SUMMARY_READY",
      monthlySummaryId: "summary-2",
    })
    expect(createNotificationIfNew).toHaveBeenCalledWith({
      userId: "user-1",
      type: "MONTHLY_SUMMARY_READY",
      monthlySummaryId: "summary-1",
    })
    expect(result).toHaveLength(2)
  })

  /**
   * (Phase 4b bug fix) Companion to the gap-scenario test above: one of the
   * window's rows already has a `MONTHLY_SUMMARY_READY` notification (the
   * unique-constraint dedup `createNotificationIfNew` reports as `null`) —
   * re-checking it on this and every later pass must stay a no-op, never a
   * duplicate, while the still-unnotified row in the same window still gets
   * created.
   */
  it("skips a row that already has a notification (dedup) while still notifying a different unnotified row in the same window", async () => {
    const { getRecentSummaries } = await import("@/features/dashboard/server/monthly-summary")
    const { createNotificationIfNew } = await import("../notification-mapper")
    vi.mocked(getRecentSummaries).mockResolvedValue([
      fakeSummary({ id: "summary-2", month: "2026-06", narrative: "June recap." }),
      fakeSummary({ id: "summary-1", month: "2026-05", narrative: "May recap." }),
    ])
    vi.mocked(createNotificationIfNew).mockImplementation(async ({ monthlySummaryId }) =>
      monthlySummaryId === "summary-1"
        ? null
        : fakeNotification("summary-2", "2026-06", "June recap."),
    )

    const result = await evaluateMonthlySummaryTriggers("user-1")

    expect(createNotificationIfNew).toHaveBeenCalledTimes(2)
    expect(result).toEqual([fakeNotification("summary-2", "2026-06", "June recap.")])
  })
})

describe("monthly-summary-trigger.ts source-level wiring", () => {
  const SOURCE = readFileSync(join(__dirname, "monthly-summary-trigger.ts"), "utf-8")

  it("imports getRecentSummaries only — never getSummaryHistory (the anti-launch-flood decision)", () => {
    const importLines = SOURCE.split("\n").filter((line) => line.trim().startsWith("import "))
    expect(importLines.some((line) => line.includes("getRecentSummaries"))).toBe(true)
    expect(importLines.some((line) => line.includes("getSummaryHistory"))).toBe(false)
  })

  it("never imports lib/ai/ — zero new narrative generation, a pure verbatim reuse of the persisted field", () => {
    const importLines = SOURCE.split("\n").filter((line) => line.trim().startsWith("import "))
    expect(importLines.some((line) => line.includes("lib/ai"))).toBe(false)
  })
})
