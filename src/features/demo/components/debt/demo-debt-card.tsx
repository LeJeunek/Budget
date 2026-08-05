"use client"

/**
 * DemoDebtCard — read-only presentational twin of
 * `features/debt/components/debt-card.tsx`, built for the public `/demo`
 * route (docs/architecture/public-demo-technical-design.md §3.3).
 *
 * Mirrors DebtCard's display fields (type badge, Paid Off / Linked-to-
 * account badges, effective balance, APR, minimum payment, payoff date or a
 * negative-amortization warning, total interest remaining, estimate note)
 * but omits the entire actions menu and both dialogs it opens (Edit, Link/
 * Unlink account) — `debt-card.tsx` itself imports `archiveDebt`/
 * `unarchiveDebt`/`unlinkDebtFromAccount` from
 * `@/features/debt/server/actions`, which nothing under `/demo` may ever
 * reach, even transitively (public-demo.md Capability 3 AC2), so that file
 * is never imported here.
 *
 * `DEBT_TYPE_LABELS` is imported from `debt-form-schema.ts` (not the card
 * file) — that module only imports `zod` and this feature's own `types.ts`,
 * so reusing it here duplicates nothing and pulls in nothing unsafe.
 *
 * Usage:
 * ```tsx
 * <DemoDebtCard debt={DEMO_HOUSEHOLD.debts[0]} />
 * ```
 */

import { cn, formatCurrency } from "@/lib/utils"
import { DEBT_TYPE_LABELS } from "@/features/debt/components/debt-form-schema"
import { AnimatedNumber } from "@/components/shared/motion"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import type { DebtWithProjection } from "@/features/debt/types"

/** `"yyyy-MM"` -> `"August 2026"` — mirrors `debt-card.tsx`'s own
 * `formatMonthLabel`, duplicated per this codebase's "features/<domain>/
 * components isn't a shared import target across domains" convention
 * (that file also carries the actions menu/dialogs this twin must never
 * pull in, so it can't be imported directly). */
function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, 1))
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}

export interface DemoDebtCardProps {
  debt: DebtWithProjection
  /** ISO 4217 currency code — defaults to "USD" since `/demo` has no
   * per-visitor currency preference to resolve. */
  currency?: string
}

export function DemoDebtCard({ debt, currency = "USD" }: DemoDebtCardProps) {
  const isArchived = debt.archivedAt !== null
  const isLinked = debt.accountId !== null

  return (
    <Card className={cn(isArchived && "opacity-75")}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="truncate">{debt.name}</CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{DEBT_TYPE_LABELS[debt.type]}</Badge>
            {debt.isPaidOff && <Badge>Paid Off</Badge>}
            {isLinked && <Badge variant="secondary">Linked to account</Badge>}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <AnimatedNumber
            value={debt.effectiveBalance}
            format={(amount) => formatCurrency(amount, currency)}
            className="font-heading text-2xl font-semibold text-foreground"
          />
          <span className="text-xs text-muted-foreground">
            {debt.interestRate}% APR &middot;{" "}
            <AnimatedNumber
              value={debt.minimumPayment}
              format={(amount) => formatCurrency(amount, currency)}
            />
            /mo minimum
          </span>
        </div>

        {debt.isPaidOff ? (
          <p className="text-xs text-muted-foreground">
            This debt is paid off.
          </p>
        ) : debt.isNegativeAmortization ? (
          <Badge variant="destructive" className="w-fit">
            Won&apos;t pay off at the current minimum payment
          </Badge>
        ) : (
          <div className="flex flex-col gap-0.5">
            <p className="text-sm text-foreground">
              Payoff date:{" "}
              <span className="font-medium">
                {debt.payoffDate ? formatMonthLabel(debt.payoffDate) : "—"}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              <AnimatedNumber
                value={debt.totalInterestRemaining ?? 0}
                format={(amount) => formatCurrency(amount, currency)}
              />{" "}
              total interest remaining at minimum payment
            </p>
            {debt.isEstimate && (
              <p className="text-xs text-muted-foreground">
                Estimate assumes no new purchases are added.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
