// Shared storageState file paths — split out from auth.setup.ts (rather than
// exported directly from it) deliberately: auth.setup.ts's module body calls
// Playwright's `setup(...)` (its own `test`-registration function) at import
// time, so any other spec file importing something from that module would
// also re-register its two login tests inside itself. Every consumer of
// these two constants (route-a11y.spec.ts, route-breakpoints.spec.ts, and
// auth.setup.ts itself) imports from this side-effect-free module instead.
export const ORDINARY_STORAGE_STATE = "tests/e2e/support/.auth/user.json"
export const ADMIN_STORAGE_STATE = "tests/e2e/support/.auth/admin.json"
