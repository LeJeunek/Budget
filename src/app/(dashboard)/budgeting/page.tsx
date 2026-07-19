// Placeholder route so Sidebar navigation to "Budgeting" doesn't 404. Real
// implementation (per docs/planning/roadmap.md, Phase 2: "Budgeting") lands
// once the Budget/BudgetCategory models and their API exist.
export default function BudgetingPage() {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-heading text-2xl font-semibold text-foreground">
        Budgeting
      </h1>
      <p className="text-sm text-muted-foreground">Coming in Phase 2.</p>
    </div>
  )
}
