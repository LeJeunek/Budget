import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it, vi } from "vitest"

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
  getMostRecentSummary: vi.fn(),
}))
vi.mock("../notification-mapper", () => ({
  createNotificationIfNew: vi.fn(),
}))

/**
 * `evaluateMonthlySummaryTriggers` is short enough, and its one dependency
 * narrow enough, to mock directly (`vi.mock`) rather than only check at the
 * source level — mirrors `features/analytics/server/insights.test.ts`'s own
 * `vi.mock`-based coverage of a similarly small DB-touching orchestration
 * function.
 */
describe("evaluateMonthlySummaryTriggers", () => {
  it("returns [] and never attempts a create when there is no MonthlySummary row yet", async () => {
    const { getMostRecentSummary } = await import("@/features/dashboard/server/monthly-summary")
    const { createNotificationIfNew } = await import("../notification-mapper")
    vi.mocked(getMostRecentSummary).mockResolvedValue(null)

    const result = await evaluateMonthlySummaryTriggers("user-1")

    expect(result).toEqual([])
    expect(createNotificationIfNew).not.toHaveBeenCalled()
  })

  it("returns [] and never attempts a create when the most recent row's narrative is still null", async () => {
    const { getMostRecentSummary } = await import("@/features/dashboard/server/monthly-summary")
    const { createNotificationIfNew } = await import("../notification-mapper")
    vi.mocked(getMostRecentSummary).mockResolvedValue({
      id: "summary-1",
      month: "2026-07",
      narrative: null,
      citedFigures: null,
      isPartialMonth: false,
    })

    const result = await evaluateMonthlySummaryTriggers("user-1")

    expect(result).toEqual([])
    expect(createNotificationIfNew).not.toHaveBeenCalled()
  })

  it("attempts exactly one create, keyed on the most recent row's own id, when its narrative is non-null", async () => {
    const { getMostRecentSummary } = await import("@/features/dashboard/server/monthly-summary")
    const { createNotificationIfNew } = await import("../notification-mapper")
    vi.mocked(getMostRecentSummary).mockResolvedValue({
      id: "summary-1",
      month: "2026-07",
      narrative: "You saved more than last month.",
      citedFigures: [],
      isPartialMonth: false,
    })
    const fakeNotification = {
      id: "notif-1",
      createdAt: new Date(),
      readAt: null,
      dismissedAt: null,
      type: "MONTHLY_SUMMARY_READY" as const,
      monthlySummaryId: "summary-1",
      month: "2026-07",
      narrative: "You saved more than last month.",
    }
    vi.mocked(createNotificationIfNew).mockResolvedValue(fakeNotification)

    const result = await evaluateMonthlySummaryTriggers("user-1")

    expect(createNotificationIfNew).toHaveBeenCalledTimes(1)
    expect(createNotificationIfNew).toHaveBeenCalledWith({
      userId: "user-1",
      type: "MONTHLY_SUMMARY_READY",
      monthlySummaryId: "summary-1",
    })
    expect(result).toEqual([fakeNotification])
  })

  it("returns [] (not [null]) when createNotificationIfNew reports an already-existing row (dedup)", async () => {
    const { getMostRecentSummary } = await import("@/features/dashboard/server/monthly-summary")
    const { createNotificationIfNew } = await import("../notification-mapper")
    vi.mocked(getMostRecentSummary).mockResolvedValue({
      id: "summary-1",
      month: "2026-07",
      narrative: "Already notified for this month.",
      citedFigures: [],
      isPartialMonth: false,
    })
    vi.mocked(createNotificationIfNew).mockResolvedValue(null)

    const result = await evaluateMonthlySummaryTriggers("user-1")

    expect(result).toEqual([])
  })
})

describe("monthly-summary-trigger.ts source-level wiring", () => {
  const SOURCE = readFileSync(join(__dirname, "monthly-summary-trigger.ts"), "utf-8")

  it("imports getMostRecentSummary only — never getSummaryHistory (the anti-launch-flood decision)", () => {
    const importLines = SOURCE.split("\n").filter((line) => line.trim().startsWith("import "))
    expect(importLines.some((line) => line.includes("getMostRecentSummary"))).toBe(true)
    expect(importLines.some((line) => line.includes("getSummaryHistory"))).toBe(false)
  })

  it("never imports lib/ai/ — zero new narrative generation, a pure verbatim reuse of the persisted field", () => {
    const importLines = SOURCE.split("\n").filter((line) => line.trim().startsWith("import "))
    expect(importLines.some((line) => line.includes("lib/ai"))).toBe(false)
  })
})
