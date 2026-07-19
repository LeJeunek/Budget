// Placeholder route so Sidebar navigation to "Transactions" doesn't 404.
// Real implementation (per docs/planning/roadmap.md, Phase 1:
// "Transactions") lands once the Transaction model and its API exist.
export default function TransactionsPage() {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-heading text-2xl font-semibold text-foreground">
        Transactions
      </h1>
      <p className="text-sm text-muted-foreground">Coming in Phase 1.</p>
    </div>
  )
}
