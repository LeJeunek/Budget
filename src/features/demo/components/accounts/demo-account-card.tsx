"use client"

/**
 * DemoAccountCard — read-only presentational twin of
 * `features/accounts/components/account-card.tsx`, built for the public
 * `/demo` route (docs/architecture/public-demo-technical-design.md §3.3).
 *
 * Mirrors AccountCard's display fields exactly (color swatch, name, type
 * badge, institution, balance, the "manually updated balance" note for
 * Investment/Retirement/Crypto types) but omits the entire actions menu and
 * the Edit dialog it opens, and the one-time reconciliation prompt — none of
 * those can exist without a real Server Action to call, and `/demo` must
 * never render a working-looking control wired to nothing (public-demo.md
 * Capability 3 AC1). Deliberately does not import `account-card.tsx` itself:
 * that file imports `archiveAccount`/`unarchiveAccount` from
 * `@/features/accounts/server/actions`, which nothing under `/demo` may ever
 * reach, even transitively (Capability 3 AC2).
 *
 * `ACCOUNT_TYPE_LABELS` is imported from `account-form-schema.ts` (not the
 * card file) — that module only imports `zod` and this feature's own
 * `types.ts`, so reusing it here duplicates nothing and pulls in nothing
 * unsafe.
 *
 * Takes only plain, already-resolved props — no fetch, no Context, no
 * Server Action import of any kind.
 *
 * Usage:
 * ```tsx
 * <DemoAccountCard account={DEMO_HOUSEHOLD.accounts[0]} />
 *
 * // Non-default currency
 * <DemoAccountCard account={account} currency="EUR" />
 * ```
 */

import { cn, formatCurrency } from "@/lib/utils"
import { ACCOUNT_TYPE_LABELS } from "@/features/accounts/components/account-form-schema"
import { AnimatedNumber } from "@/components/shared/motion"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import type { Account, AccountType } from "@/features/accounts/types"

/** Per docs/product/accounts.md AC7 — mirrors `account-card.tsx`'s identical
 * constant (see that file's own comment for the full rationale). */
const USER_REPORTED_BALANCE_TYPES = new Set<AccountType>([
  "INVESTMENT",
  "RETIREMENT",
  "CRYPTO",
])

export interface DemoAccountCardProps {
  account: Account
  /** ISO 4217 currency code — defaults to "USD" since `/demo` has no
   * per-visitor currency preference to resolve. */
  currency?: string
}

export function DemoAccountCard({ account, currency = "USD" }: DemoAccountCardProps) {
  const isArchived = account.archivedAt !== null
  const isNegative = account.balance < 0

  return (
    <Card className={cn(isArchived && "opacity-75")}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className="mt-1 size-2.5 shrink-0 rounded-full ring-1 ring-foreground/10"
            style={{ backgroundColor: account.color }}
            aria-hidden="true"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle className="truncate">{account.name}</CardTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{ACCOUNT_TYPE_LABELS[account.type]}</Badge>
              {account.institution && (
                <span className="truncate text-xs text-muted-foreground">
                  {account.institution}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-1">
        <AnimatedNumber
          value={account.balance}
          format={(amount) => formatCurrency(amount, currency)}
          className={cn(
            "font-heading text-2xl font-semibold",
            isNegative ? "text-red-600 dark:text-red-400" : "text-foreground"
          )}
        />
        {USER_REPORTED_BALANCE_TYPES.has(account.type) && (
          <span className="text-xs text-muted-foreground">
            Manually updated balance
          </span>
        )}
      </CardContent>
    </Card>
  )
}
