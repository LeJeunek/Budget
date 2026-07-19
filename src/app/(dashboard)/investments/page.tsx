// Placeholder route so Sidebar navigation to "Investments" doesn't 404.
// Real implementation (per docs/planning/roadmap.md, Phase 3:
// "Investments") lands once the Investment model and its API exist.
export default function InvestmentsPage() {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-heading text-2xl font-semibold text-foreground">
        Investments
      </h1>
      <p className="text-sm text-muted-foreground">Coming in Phase 3.</p>
    </div>
  )
}
