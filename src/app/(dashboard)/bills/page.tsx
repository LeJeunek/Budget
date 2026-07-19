// Placeholder route so Sidebar navigation to "Bills" doesn't 404. Real
// implementation (per docs/planning/roadmap.md, Phase 2: "Bills") lands
// once the Bill model and its API exist.
export default function BillsPage() {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-heading text-2xl font-semibold text-foreground">
        Bills
      </h1>
      <p className="text-sm text-muted-foreground">Coming in Phase 2.</p>
    </div>
  )
}
