import { getFeatureFlags } from "@/features/admin/server/feature-flags"
import { FeatureFlagToggle } from "@/features/admin/components/feature-flag-toggle"

/**
 * Feature Flags (admin.md Capability 4). A Server Component: reads
 * `admin.server/feature-flags.getFeatureFlags()` directly (no Route
 * Handler), rendering one `FeatureFlagToggle` per row — each row owns its
 * own `toggleFeatureFlag` Server Action call and `router.refresh()` on
 * success (see that component's JSDoc).
 */
export default async function AdminFeatureFlagsPage() {
  const flags = await getFeatureFlags()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">Feature Flags</h1>
        <p className="text-sm text-muted-foreground">
          Fast, deploy-free kill switches for FinanceOS&apos;s newest, highest-risk surfaces.
          Toggling a flag off degrades that surface using its own already-defined
          graceful-degradation behavior — never a new, separately-designed broken state.
        </p>
      </div>

      {flags.length === 0 ? (
        <p className="text-sm text-muted-foreground">No feature flags are configured yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {flags.map((flag) => (
            <FeatureFlagToggle key={flag.key} flag={flag} />
          ))}
        </div>
      )}
    </div>
  )
}
