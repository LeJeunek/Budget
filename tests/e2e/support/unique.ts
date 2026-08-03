// Shared helper for flow specs (tests/e2e/flows/) that create real data —
// every flow that creates a new record (a transaction, an account, a goal,
// an imported CSV row) embeds a fresh, run-unique label in whatever name
// field it fills so re-running the suite against the same seeded database
// never collides with a previous run's leftover row. This matters most for
// Transactions' CSV import flow specifically: `importTransactionsFromCsv`'s
// own duplicate-detection key is date+amount+merchant
// (features/transactions/server/import.ts), so a repeated merchant name
// across runs would silently import as "0 imported, 1 duplicate skipped" on
// the second run and break that flow's own assertion.
//
// Not used by the accessibility/responsive suites, which only ever read the
// fixed fixture data prisma/seed-e2e-test-user.ts seeds (see
// support/route-inventory.ts) rather than creating anything new.
export function uniqueLabel(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 10_000)}`
}
