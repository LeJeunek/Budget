/**
 * DebtList — the grid of `DebtCard`s for one tab (active or archived) of
 * app/(dashboard)/debt/page.tsx. Not a Client Component itself (no state of
 * its own) — kept as a thin, server-renderable wrapper so the page doesn't
 * need to inline the grid markup twice (active/archived tabs), matching
 * `app/(dashboard)/accounts/page.tsx`'s own `AccountGrid` helper.
 *
 * `docs/product/debt-tracker.md`'s "very high number of debts" edge case
 * ("the list ... must not break") is handled by the same responsive grid
 * Accounts/Investments already rely on — no pagination/virtualization is
 * warranted at this feature's expected per-user debt volume (see
 * `prisma/schema.prisma`'s `Debt` model comment on this exact point).
 */

import type { Account } from "@/features/accounts/types"
import type { DebtWithProjection } from "@/features/debt/types"
import { DebtCard } from "@/features/debt/components/debt-card"

export interface DebtListProps {
  debts: DebtWithProjection[]
  /** Credit Card accounts eligible for linking — passed through to every
   * card so each one's Link dialog has the current, correct option list. */
  eligibleAccounts: Account[]
}

export function DebtList({ debts, eligibleAccounts }: DebtListProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {debts.map((debt) => (
        <DebtCard key={debt.id} debt={debt} eligibleAccounts={eligibleAccounts} />
      ))}
    </div>
  )
}
