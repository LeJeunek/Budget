/**
 * PaydayEntry — Calendar v2's presentational entry for a single payday (a
 * scheduled income occurrence, or a logged Irregular/One-off event) on one
 * calendar day (calendar-v2.md AC4-AC7).
 *
 * Visually distinguishable from `BillEntry` at a glance, without requiring
 * the user to read any text (AC5) — three independent signals, since color
 * alone is never sufficient for a colorblind user:
 * 1. **Color**: the codebase's existing red/green semantic-color convention
 *    for financial data (`naming-standards.md`'s CSS/Tailwind section —
 *    already used for gains/losses, over-budget indicators, and
 *    negative-amortization warnings). A payday is money coming in, so it is
 *    treated as that convention's "positive" (green/emerald) side.
 * 2. **Icon**: `ArrowDownToLine` (a deposit-style icon — money arriving),
 *    distinct in shape from `BillEntry`'s invoice-style `Receipt`.
 * 3. **Label**: the stream name plus an explicit status word, never implied
 *    by color alone (unlike `BillEntry`, which reuses Calendar v1's existing
 *    color-only status convention unchanged).
 *
 * Deliberately uses the same "positive" green treatment for every payday
 * regardless of its own status (unlike `BillEntry`, whose color already
 * carries Bills' Upcoming/Due Today/Late/Paid meaning) — a payday's color
 * answers "is this income" at a glance; its status is conveyed by the label
 * text, never by swapping the entry's own color per status, since that would
 * collide with the bill-vs-payday color signal AC5 asks for.
 *
 * `status` is `undefined` for a logged Irregular/One-off event (AC7,
 * `PaydayCalendarEntry`'s own JSDoc) — already a completed, logged fact by
 * definition, so there is no Upcoming/Received distinction left to show;
 * rendered with the fixed label "Logged" instead.
 */

import Link from "next/link"
import { ArrowDownToLine } from "lucide-react"

import type { PaydayCalendarEntry } from "@/features/calendar/types"
import { cn, formatCurrency } from "@/lib/utils"

// `features/calendar/types.ts` re-exports `PaydayCalendarEntry` verbatim
// from Recurring Income but does not separately re-export
// `IncomeOccurrenceStatus` — derived here via `NonNullable<...["status"]>`
// rather than importing a second type from `@/features/recurring-income/types`
// directly, so this component depends on exactly one module boundary
// (`@/features/calendar/types`), matching every other component in this
// feature.
type PaydayStatus = NonNullable<PaydayCalendarEntry["status"]>

const STATUS_LABEL: Record<PaydayStatus, string> = {
  UPCOMING: "Upcoming",
  EXPECTED_TODAY: "Expected Today",
  NOT_YET_RECEIVED: "Not Yet Received",
  RECEIVED: "Received",
}

const ENTRY_CLASSNAME =
  "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"

export interface PaydayEntryProps {
  payday: PaydayCalendarEntry
  /** The caller's resolved `UserPreference.currencyDisplay`
   * (docs/release/phase-4c-notes.md Section 1) — this component has no
   * `"use client"` directive of its own and is rendered from `CalendarGrid`
   * (a Client Component), which resolves this via `useCurrencyDisplay()` and
   * passes it straight through as a plain prop. */
  currency: string
}

/** Selecting an entry navigates to that income stream's detail/receipt
 * history (AC6, the same "click an entry, land on its source" interaction
 * `BillEntry`/Calendar v1 AC4 already established). */
export function PaydayEntry({ payday, currency }: PaydayEntryProps) {
  const statusLabel = payday.status ? STATUS_LABEL[payday.status] : "Logged"

  return (
    <Link
      href={`/income/${payday.streamId}`}
      className={cn(
        "flex items-center gap-1 truncate rounded border px-1.5 py-0.5 text-[0.7rem] leading-tight hover:opacity-80",
        ENTRY_CLASSNAME,
      )}
      title={`${payday.streamName} — ${formatCurrency(payday.amount, currency)} (${statusLabel})`}
    >
      <ArrowDownToLine className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">
        {payday.streamName} · {formatCurrency(payday.amount, currency)} · {statusLabel}
      </span>
    </Link>
  )
}
