// Placeholder route so Sidebar navigation to "Goals" doesn't 404. Real
// implementation (per docs/planning/roadmap.md, Phase 2: "Savings Goals")
// lands once the Goal model and its API exist.
export default function GoalsPage() {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-heading text-2xl font-semibold text-foreground">
        Goals
      </h1>
      <p className="text-sm text-muted-foreground">Coming in Phase 2.</p>
    </div>
  )
}
