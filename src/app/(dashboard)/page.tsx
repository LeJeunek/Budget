import { StatCard } from "@/components/shared/stat-card"

/**
 * Dashboard Overview — Phase 0 placeholder only.
 *
 * Per docs/planning/roadmap.md, Phase 0 explicitly excludes "any financial
 * data model, any dashboard content." The `StatCard`s below are rendered in
 * their `loading` state purely to prove the shell/grid renders correctly;
 * no numbers (real or fake) are shown. Real data fetching (Server
 * Component + TanStack Query wiring against Backend Engineer-owned API
 * routes) lands in Phase 1 once Account/Transaction models exist.
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Connect an account to get started.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Net Worth" value="" loading />
        <StatCard label="Monthly Income" value="" loading />
        <StatCard label="Monthly Expenses" value="" loading />
        <StatCard label="Savings Rate" value="" loading />
      </div>
    </div>
  )
}
