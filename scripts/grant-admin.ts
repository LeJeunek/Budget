// FinanceOS — operational script to grant the `ADMIN` tier to an existing
// account. Run via `npm run grant:admin -- <email>`.
//
// Per docs/architecture/phase-4c-technical-design.md §1.3 (admin.md
// Capability 1 AC5, the CTO kickoff pass's carried-over scope item #2):
// granting the ADMIN tier is an operational action the team performs
// directly against the database — a seed script or a direct database
// update — and is NEVER a button, form, or endpoint reachable through the
// product itself. This script is that sanctioned operational action; it is
// deliberately NOT imported or referenced from anywhere under
// `src/features/admin/` or `src/app/admin/` — there is no code path in the
// shipped product that can reach this script or its effect.
//
// Revoking the tier is the identical operational action in reverse (a
// direct `UPDATE "user" SET role = 'USER' WHERE email = ...`, per AC5's own
// "a seed script or a direct database update" wording) — deliberately not
// scripted here, since it's a one-line, rarely-needed manual statement that
// doesn't earn a second maintained script.
//
// Idempotent: granting admin to an account that already holds it is a
// no-op (logged, not an error) — safe to re-run.
import { db } from "@/lib/db"

async function grantAdmin(email: string): Promise<void> {
  const user = await db.user.findUnique({ where: { email } })
  if (!user) {
    throw new Error(`No account found for email "${email}"`)
  }

  if (user.role === "ADMIN") {
    console.log(`[grant-admin] ${email} already holds the ADMIN tier. No changes made.`)
    return
  }

  await db.user.update({ where: { email }, data: { role: "ADMIN" } })
  console.log(`[grant-admin] Granted ADMIN to ${email} (user id ${user.id}).`)
}

const email = process.argv[2]?.trim()

if (!email) {
  console.error("Usage: npm run grant:admin -- <email>")
  process.exitCode = 1
} else {
  grantAdmin(email)
    .catch((error: unknown) => {
      console.error("[grant-admin] Failed:", error)
      process.exitCode = 1
    })
    .finally(async () => {
      await db.$disconnect()
    })
}
