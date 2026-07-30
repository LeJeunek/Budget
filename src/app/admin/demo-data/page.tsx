import { isDemoDataSeedAvailable } from "@/features/admin/server/demo-data"
import { SeedDemoDataButton } from "@/features/admin/components/seed-demo-data-button"

/**
 * Seed Demo Data (admin.md Capability 6). A Server Component: checks
 * `isDemoDataSeedAvailable()` (`features/admin/server/demo-data.ts`)
 * server-side before rendering anything — per AC2's "not shown at all, not
 * merely disabled," a production visit to this page (direct URL, since
 * `app/admin/layout.tsx` already omits its nav entry in production too)
 * never renders the trigger, only an explanatory line. The Server Action
 * this page's button eventually calls (`seedDemoData` ->
 * `triggerDemoDataSeed`) re-checks this same gate independently regardless
 * (AC3's edge case: blocked at the server, not merely hidden client-side).
 */

/**
 * Phase 4c performance follow-up (phase-4c-performance-review.md Finding 3):
 * `seedDemoData` -> `triggerDemoDataSeed` awaits its spawned child process
 * for up to `SEED_TIMEOUT_MS` (120s, `features/admin/server/demo-data.ts`)
 * inside the Server Action this page's button invokes, but neither this
 * segment nor any ancestor layout previously declared a `maxDuration` —
 * leaving the ACTUAL ceiling to Vercel's unconfigured platform default,
 * which is well below 120s on both Hobby (10s) and an unconfigured Pro
 * deployment (15s). A platform-level kill before the internal 120s ceiling
 * would terminate the Server Action with no `{ success, error }` result at
 * all, defeating `demo-data.ts`'s own stated reason for choosing a spawned
 * child process in the first place (admin.md Capability 6 AC4's "a clear
 * failure message... never hidden"). Set to 150s for margin above
 * `SEED_TIMEOUT_MS`, the same "someone chose this number for this feature"
 * discipline this codebase's four cron routes already establish
 * (`app/api/cron/<name>/route.ts`, the only other `maxDuration` usages in this
 * repo). Non-production-only in effect (Capability 6 AC2 already restricts
 * this whole page to non-production), matching that finding's own scope.
 */
export const maxDuration = 150

export default async function AdminDemoDataPage() {
  const isAvailable = isDemoDataSeedAvailable()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">Seed Demo Data</h1>
        <p className="text-sm text-muted-foreground">
          Refresh the showcase@lkbudget.demo account with realistic sample data for a call or
          screenshot — always this one fixed account, never any other.
        </p>
      </div>

      {isAvailable ? (
        <SeedDemoDataButton />
      ) : (
        <p className="text-sm text-muted-foreground">
          Demo data seeding is only available in non-production environments.
        </p>
      )}
    </div>
  )
}
