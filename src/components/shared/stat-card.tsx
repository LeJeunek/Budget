/**
 * StatCard — the dashboard building block for a single labeled metric
 * (e.g. "Net Worth", "Monthly Spend"). Purely presentational: callers pass
 * an already-formatted value (use `formatCurrency`/`formatDate` from
 * `lib/utils` before handing it to this component) plus an optional trend
 * and icon.
 *
 * Usage:
 * ```tsx
 * <StatCard
 *   label="Net Worth"
 *   value={formatCurrency(128430.55)}
 *   icon={Wallet}
 *   trend={{ direction: "up", value: "+4.2%", label: "vs last month" }}
 * />
 *
 * // Loading state (e.g. while a Server Component's data is being fetched
 * // by the caller — this component never fetches data itself)
 * <StatCard label="Net Worth" value="" loading />
 * ```
 */

import * as React from "react"
import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export interface StatCardTrend {
  direction: "up" | "down"
  /** Already-formatted magnitude, e.g. "+4.2%" or "-$120.00". */
  value: string
  /** Optional context, e.g. "vs last month". */
  label?: string
}

export interface StatCardProps {
  label: string
  /** Already-formatted value (this component performs no number formatting). */
  value: string | number
  /** Optional content rendered immediately before the value, e.g. a currency symbol. */
  prefix?: React.ReactNode
  icon?: LucideIcon
  trend?: StatCardTrend
  /** Renders a skeleton placeholder instead of `value`/`trend`. */
  loading?: boolean
  className?: string
}

export function StatCard({
  label,
  value,
  prefix,
  icon: Icon,
  trend,
  loading = false,
  className,
}: StatCardProps) {
  return (
    <Card className={cn(className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <span className="text-sm text-muted-foreground">{label}</span>
        {Icon && (
          <Icon
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {loading ? (
          <>
            <Skeleton className="h-7 w-28" aria-hidden="true" />
            <Skeleton className="h-3.5 w-20" aria-hidden="true" />
          </>
        ) : (
          <>
            <span className="font-heading text-2xl font-semibold text-foreground">
              {prefix}
              {value}
            </span>
            {trend && (
              <span
                className={cn(
                  "flex items-center gap-1 text-xs font-medium",
                  trend.direction === "up"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                )}
              >
                {trend.direction === "up" ? (
                  <TrendingUp className="size-3.5" aria-hidden="true" />
                ) : (
                  <TrendingDown className="size-3.5" aria-hidden="true" />
                )}
                <span>{trend.value}</span>
                {trend.label && (
                  <span className="font-normal text-muted-foreground">
                    {trend.label}
                  </span>
                )}
              </span>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
