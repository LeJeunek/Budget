"use client"

/**
 * NetWorthTrendSparkline — the "may optionally show a mini trend line" piece
 * of a `NET_WORTH_SAVINGS_TARGET` goal card, per financial-goals.md's Type 2
 * section, present only when `FinancialGoalWithProgress.trend` is populated
 * (`measurementBasis === "TOTAL_NET_WORTH"` — never a fabricated series for
 * `ACCOUNT_SUBSET`, per that same section's stated constraint; the caller
 * simply never renders this component in that case).
 *
 * Deliberately its own small file, not inlined into financial-goal-card.tsx:
 * a chart needs its own `"use client"` boundary and pulls in `recharts`
 * (already a project dependency — reused here, not duplicated — see
 * `features/dashboard/components/net-worth-history-chart.tsx`), and keeping
 * it separate keeps the card file focused on layout/composition rather than
 * chart configuration, matching this company's "every function/file a single
 * responsibility" rule.
 *
 * This is intentionally a much smaller/quieter chart than Dashboard's own
 * Net Worth History chart: no axes, no legend, no range selector — just a
 * glanceable "is this trending toward the target" shape, sized to sit inside
 * a goal card. It does not duplicate that chart's own component (module
 * boundaries don't allow importing another feature's `components/` file);
 * it reuses the same third-party charting library directly instead.
 */

import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip } from "recharts"

import type { FinancialGoalTrendPoint } from "@/features/financial-goals/types"
import { formatDateLabel } from "@/features/financial-goals/components/financial-goal-shared"
import { useFormatCurrency } from "@/app/(dashboard)/currency-preference-provider"
import { useChartAnimationProps } from "@/components/shared/motion"

export interface NetWorthTrendSparklineProps {
  points: FinancialGoalTrendPoint[]
  /** The goal's `targetAmount` — drawn as a flat reference line so the trend
   * is legible against the milestone it's aiming for, not just a shape in
   * isolation. */
  targetAmount: number
}

export function NetWorthTrendSparkline({
  points,
  targetAmount,
}: NetWorthTrendSparklineProps) {
  const formatCurrency = useFormatCurrency()
  // Chart Transitions (Phase 5b): one shared entrance/update animation gate,
  // reduced-motion-aware — see docs/architecture/phase-5b-technical-design.md §5.1.
  const chartAnimationProps = useChartAnimationProps()

  if (points.length === 0) {
    return null
  }

  return (
    <div className="h-16 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        {/* accessibilityLayer={false}: Recharts 3.x's default keyboard-nav
            overlay makes its <svg role="application"> focusable, which axe
            flags (aria-hidden-focus) since this whole chart is already
            aria-hidden — a purely decorative sparkline, never the primary
            way to read this data. */}
        <LineChart
          data={points}
          margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
          accessibilityLayer={false}
        >
          <Tooltip
            labelFormatter={(value) => formatDateLabel(String(value))}
            formatter={(value) => [formatCurrency(Number(value)), "Net worth"]}
            contentStyle={{
              backgroundColor: "var(--popover)",
              borderColor: "var(--border)",
              borderRadius: "var(--radius-lg)",
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
          />
          <ReferenceLine
            y={targetAmount}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
          />
          <Line
            type="monotone"
            dataKey="value"
            dot={false}
            stroke="var(--chart-1)"
            strokeWidth={2}
            {...chartAnimationProps}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
