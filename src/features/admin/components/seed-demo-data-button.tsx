"use client"

/**
 * SeedDemoDataButton — Seed Demo Data (admin.md Capability 6). The
 * confirm-before-destructive-action `Dialog` mirrors `TransactionTable`'s
 * own delete-confirmation dialog pattern (AC4: "a clear confirmation
 * before... and a clear success/failure result after").
 *
 * Takes no props and accepts no target/environment parameter of any kind —
 * mirrors `seedDemoData`'s own zero-argument Server Action signature
 * (Capability 6 AC1's "no field, dropdown, or parameter lets an admin choose
 * which account to seed"). `app/admin/demo-data/page.tsx` is the ONE place
 * that decides whether to render this component at all
 * (`isDemoDataSeedAvailable()`, checked server-side) — this component itself
 * has no environment-awareness, since the Server Action it calls re-checks
 * that gate independently regardless (`features/admin/server/demo-data.ts`'s
 * own doc comment on why it never trusts a caller that already checked it
 * once).
 */

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { seedDemoData } from "@/features/admin/server/actions"

type SeedResult = { success: true } | { success: false; error: string }

export function SeedDemoDataButton() {
  const [isConfirmOpen, setIsConfirmOpen] = React.useState(false)
  const [isSeeding, setIsSeeding] = React.useState(false)
  const [lastResult, setLastResult] = React.useState<SeedResult | null>(null)

  async function handleConfirm() {
    setIsSeeding(true)
    try {
      const result = await seedDemoData()
      if (!result.success) {
        setLastResult({ success: false, error: result.error })
        toast.error(result.error)
        return
      }
      setLastResult({ success: true })
      toast.success("Demo data refreshed — showcase@lkbudget.demo now has fresh sample data.")
    } finally {
      setIsSeeding(false)
      setIsConfirmOpen(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button type="button" variant="destructive" onClick={() => setIsConfirmOpen(true)}>
          Refresh Demo Data
        </Button>
      </div>

      {lastResult && (
        <p
          className={
            // Accessibility fix (docs/testing/e2e/accessibility-run-report.md's
            // 2026-08-02 re-run, finding #1, axe `color-contrast`) — see
            // transaction-detail-client.tsx's identical fix/comment.
            lastResult.success
              ? "text-sm text-emerald-700 dark:text-emerald-400"
              : "text-sm text-red-700 dark:text-red-400"
          }
          role="status"
        >
          {lastResult.success
            ? "Demo data refreshed successfully."
            : `Demo data refresh failed: ${lastResult.error}`}
        </p>
      )}

      <Dialog open={isConfirmOpen} onOpenChange={(open) => !isSeeding && setIsConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refresh demo data?</DialogTitle>
            <DialogDescription>
              This replaces every account, transaction, budget, bill, and every other record
              currently in the showcase@lkbudget.demo account with fresh sample data. This cannot
              be undone. This always targets that one fixed demo account — no other account is
              ever affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsConfirmOpen(false)}
              disabled={isSeeding}
            >
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirm} disabled={isSeeding}>
              {isSeeding ? "Refreshing..." : "Refresh demo data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
