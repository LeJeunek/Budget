import path from "path"
import react from "@vitejs/plugin-react"
import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    // Phase 5a (docs/architecture/phase-5a-technical-design.md §1.1,
    // Risk #48): Playwright specs live under tests/e2e/ and import their own
    // `test`/`expect` from `@playwright/test` — a different test-runner
    // contract than Vitest's globally-injected `test`/`expect` (`globals:
    // true` above). Without this exclude, Vitest's own default include glob
    // (`**/*.{test,spec}.?(c|m)[jt]s?(x)`) would also collect and attempt to
    // execute those files, failing immediately (no browser context, no
    // Playwright worker fixtures) and corrupting `npm run test`'s signal for
    // every other, legitimate Vitest suite in the same run. Merged with
    // Vitest's own `configDefaults.exclude` (not a replacement of it) so
    // node_modules/.git stay excluded too.
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
