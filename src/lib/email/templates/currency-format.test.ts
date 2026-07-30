import type { ReactNode } from "react"
import { describe, expect, it } from "vitest"

import { BudgetOverEmail } from "./budget-over"
import { formatCurrency } from "./format"
import { LowBalanceEmail } from "./low-balance"

/**
 * Phase 4c (phase-4c-technical-design.md §3.6, docs/product/customization.md
 * Currency Display capability, docs/release/phase-4c-notes.md §1's blocking
 * finding): verifies, by test, that a non-USD `currency` prop changes only
 * these templates' rendered currency symbol/grouping — never the underlying
 * numeric magnitude, and never any other rendered fact (account/category
 * name) — per customization.md's own Definition of Done.
 *
 * Templates are invoked directly as plain functions (`LowBalanceEmail({...})`),
 * never through `@react-email/render` (a peer-only dependency of the
 * installed `resend` SDK, not a direct dependency of this project, and not
 * installed in `node_modules`). A React element is a plain, inert object
 * graph (`{ type, props }`) until something actually walks/executes it —
 * `collectText` below walks exactly as deep as this file's own top-level
 * component eagerly builds (every `formatCurrency(...)` call happens
 * synchronously at element-construction time, before `NotificationEmailLayout`
 * — the one nested custom component in the tree — is ever invoked), which is
 * sufficient to observe every string this template itself renders.
 */
function collectText(node: unknown): string[] {
  if (node === null || node === undefined || typeof node === "boolean") {
    return []
  }
  if (typeof node === "string" || typeof node === "number") {
    return [String(node)]
  }
  if (Array.isArray(node)) {
    return node.flatMap(collectText)
  }
  if (typeof node === "object" && "props" in (node as Record<string, unknown>)) {
    return collectText((node as { props?: { children?: ReactNode } }).props?.children)
  }
  return []
}

const onlyDigits = (value: string): string => value.replace(/[^0-9]/g, "")

describe("formatCurrency (lib/email/templates/format.ts)", () => {
  it("renders a different symbol for USD vs. EUR while expressing the identical numeric magnitude", () => {
    const usd = formatCurrency(1234.5, "USD")
    const eur = formatCurrency(1234.5, "EUR")

    expect(usd).toBe("$1,234.50")
    expect(usd).not.toBe(eur)
    // Same digits either way — only the symbol/grouping convention differs,
    // never the amount itself.
    expect(onlyDigits(usd)).toBe(onlyDigits(eur))
  })
})

describe("email template currency threading", () => {
  it("LowBalanceEmail renders a different currency-formatted balance for EUR vs. USD, with the account name unchanged", () => {
    const baseProps = {
      accountName: "Everyday Checking",
      balance: 42.1,
      unsubscribeUrl: "https://example.test/unsub",
      preferencesUrl: "https://example.test/prefs",
    }

    const usdText = collectText(LowBalanceEmail({ ...baseProps, currency: "USD" })).join("")
    const eurText = collectText(LowBalanceEmail({ ...baseProps, currency: "EUR" })).join("")

    expect(usdText).toContain(formatCurrency(42.1, "USD"))
    expect(eurText).toContain(formatCurrency(42.1, "EUR"))
    expect(usdText).not.toEqual(eurText)

    // The one non-currency rendered fact is identical either way.
    expect(usdText).toContain("Everyday Checking")
    expect(eurText).toContain("Everyday Checking")
  })

  it("BudgetOverEmail renders a different currency-formatted allocated figure for EUR vs. USD, with the category name unchanged", () => {
    const baseProps = {
      categoryName: "Groceries",
      allocated: 900,
      unsubscribeUrl: "https://example.test/unsub",
      preferencesUrl: "https://example.test/prefs",
    }

    const usdText = collectText(BudgetOverEmail({ ...baseProps, currency: "USD" })).join("")
    const eurText = collectText(BudgetOverEmail({ ...baseProps, currency: "EUR" })).join("")

    expect(usdText).toContain(formatCurrency(900, "USD"))
    expect(eurText).toContain(formatCurrency(900, "EUR"))
    expect(usdText).not.toEqual(eurText)

    expect(usdText).toContain("Groceries")
    expect(eurText).toContain("Groceries")
  })
})
