import { exec } from "node:child_process"
import { promisify } from "node:util"

/**
 * Seed Demo Data (admin.md Capability 6) — a thin trigger for the EXISTING
 * `prisma/seed-showcase.ts` script (`npm run seed:showcase`), never a
 * reimplementation of its data-generation logic (Capability 6 AC3).
 *
 * **Why a spawned child process, not a direct TypeScript import of
 * `prisma/seed-showcase/index.ts`:** that module's entry point runs its
 * `main()` unconditionally at import time and, on failure, calls
 * `process.exit(1)` and disconnects its own standalone `PrismaClient`
 * (`prisma/seed-showcase/client.ts`) — appropriate for a one-shot CLI
 * invocation, but importing it directly into a running Next.js server
 * process would risk `process.exit(1)` killing the entire server on any
 * seeding failure, the opposite of Capability 6 AC4's "a clear failure
 * message... never hidden" requirement (a killed server reports nothing to
 * the admin who triggered it). Spawning it as a genuinely separate process
 * — exactly what `npm run seed:showcase` already does from a terminal —
 * keeps this trigger's own failure fully contained: a crash inside the
 * script only ever produces a non-zero exit code this function observes and
 * reports, never a crash of the admin request that triggered it.
 *
 * **Fixed-target and environment-gated by construction:** this function
 * takes no parameters at all — there is no target/user argument of any
 * kind, so no caller can ever widen this trigger's scope beyond the one
 * script it runs (which itself always seeds exactly
 * `showcase@lkbudget.demo`, per that script's own header comment).
 * `isDemoDataSeedAvailable()` is the one, single source of the
 * non-production gate, checked SERVER-SIDE via `process.env.NODE_ENV` (this
 * codebase's existing production-detection convention, `lib/db.ts`) —
 * `triggerDemoDataSeed()` re-checks it itself rather than trusting a caller
 * that already checked it once, so this function is safe even if called
 * from a future code path that forgot to gate its own UI.
 *
 * Operational note, flagged rather than silently assumed: this relies on
 * `npm`/`tsx` being invocable from the Next.js server process's own working
 * directory at runtime — true for local development and any staging/preview
 * environment that deploys this repo's full toolchain, but worth confirming
 * for whichever specific non-production hosting target this is exercised
 * against, since a serverless preview runtime that strips devDependencies
 * or disallows spawning child processes would need a different mechanism.
 */

const execAsync = promisify(exec)

/** Generous but bounded — the script seeds several months of data across
 * every feature area in one run; this only guards against a genuinely stuck
 * process; the script itself normally completes in well under a minute. */
const SEED_TIMEOUT_MS = 120_000

export interface DemoDataSeedResult {
  success: boolean
  /** Present only when `success` is false. */
  error?: string
}

/**
 * The one, single source of the "non-production only" gate (Capability 6
 * AC2) — checked server-side. Exported so both `triggerDemoDataSeed` (which
 * re-checks it before doing any work) and the Server Component rendering
 * Admin's Seed Demo Data screen can use the identical definition: in
 * production this action must not merely be disabled, it must not be shown
 * at all.
 */
export function isDemoDataSeedAvailable(): boolean {
  return process.env.NODE_ENV !== "production"
}

/**
 * Triggers `npm run seed:showcase` and waits for it to complete, reporting a
 * clear success/failure result (Capability 6 AC4) — never a silent partial
 * refresh. Takes no arguments, by construction (see this file's header
 * comment).
 */
export async function triggerDemoDataSeed(): Promise<DemoDataSeedResult> {
  if (!isDemoDataSeedAvailable()) {
    return {
      success: false,
      error: "Demo data seeding is only available in non-production environments.",
    }
  }

  try {
    const { stdout, stderr } = await execAsync("npm run seed:showcase", {
      cwd: process.cwd(),
      timeout: SEED_TIMEOUT_MS,
    })

    if (stdout) console.log(`[admin/demo-data] seed:showcase output:\n${stdout}`)
    if (stderr) console.error(`[admin/demo-data] seed:showcase stderr:\n${stderr}`)

    return { success: true }
  } catch (error) {
    console.error("[admin/demo-data] seed:showcase failed:", error)
    const message = error instanceof Error ? error.message : "Unknown error while seeding demo data"
    return { success: false, error: message }
  }
}
