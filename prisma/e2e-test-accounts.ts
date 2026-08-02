// Pure constants — the two fixed E2E test-account email addresses.
//
// Deliberately split out of prisma/seed-e2e-test-user.ts (rather than
// exported directly from it, the way prisma/seed-showcase.ts's constants
// live in its own config.ts, not its index.ts entry point): that script's
// own `main()` runs unconditionally at module import time (this codebase's
// standing seed-script convention — see seed-e2e-test-user.ts's own final
// lines), so anything else that needs just these two email strings (e.g.
// tests/e2e/support/auth.setup.ts, which needs them to log in, not to
// re-run the seed) must import them from a side-effect-free module instead
// of triggering a full re-seed as an import-time side effect.
export const E2E_TEST_EMAIL = "e2e-test@lkbudget.dev"
export const E2E_TEST_ADMIN_EMAIL = "e2e-test-admin@lkbudget.dev"
