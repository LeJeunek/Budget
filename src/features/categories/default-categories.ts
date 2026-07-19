// The Charter's fixed 11-category starter set. Single source of truth,
// imported by:
//   - src/lib/auth.ts's signup hook (creates these, isSystem: true, for every
//     real new user — see docs/product/categories.md AC1)
//   - prisma/seed.ts (dev/demo data only)
// Do not hardcode this list a third time.
export const DEFAULT_CATEGORIES: { name: string; color: string }[] = [
  { name: "Housing", color: "#f97316" },
  { name: "Utilities", color: "#eab308" },
  { name: "Transportation", color: "#84cc16" },
  { name: "Food", color: "#22c55e" },
  { name: "Entertainment", color: "#06b6d4" },
  { name: "Shopping", color: "#6366f1" },
  { name: "Healthcare", color: "#a855f7" },
  { name: "Insurance", color: "#ec4899" },
  { name: "Investments", color: "#14b8a6" },
  { name: "Savings", color: "#0ea5e9" },
  { name: "Misc", color: "#94a3b8" },
]
