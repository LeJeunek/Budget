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
