// Placeholder route so Sidebar navigation to "Analytics" doesn't 404. Real
// implementation (per docs/planning/roadmap.md, Phase 3: "Analytics (full
// suite)") lands once accounts/transactions/debt/investments data exists.
export default function AnalyticsPage() {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-heading text-2xl font-semibold text-foreground">
        Analytics
      </h1>
      <p className="text-sm text-muted-foreground">Coming in Phase 3.</p>
    </div>
  )
}
