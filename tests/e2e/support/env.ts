// Shared env-var helpers for specs that need real credentials — split out
// so `auth.setup.ts` (which needs this to log in once, up front) and
// `flows/authentication.spec.ts` (which needs the identical value to
// exercise the real /login form itself, per that flow's own charter
// requirement) don't each carry their own copy of the same "read
// E2E_TEST_USER_PASSWORD, throw a clear error if unset" logic — the
// company's "avoid duplication" rule applied to test infrastructure, not
// just production code.
export function requireE2ePassword(): string {
  const password = process.env.E2E_TEST_USER_PASSWORD
  if (!password) {
    throw new Error(
      "E2E_TEST_USER_PASSWORD is not set — required to log in as the seeded " +
        "e2e-test@/e2e-test-admin@lkbudget.dev accounts (see .env.example). " +
        "Run `npm run seed:e2e` first if these accounts don't exist yet.",
    )
  }
  return password
}
