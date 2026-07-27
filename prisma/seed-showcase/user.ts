// Creates the showcase demo user with a REAL, loggable-in credential —
// unlike prisma/seed.ts's `prisma.user.upsert` (no password/AuthAccount row
// at all), this goes through Better Auth's own server-side
// `auth.api.signUpEmail` so the resulting User + AuthAccount password hash
// exactly matches what a real signup produces, and so the
// `databaseHooks.user.create.after` hook in src/lib/auth.ts seeds the 11
// default Categories automatically — no hand-rolled hashing or duplicated
// category-seeding logic here (see that file's own JSDoc for why both of
// those must go through this one entry point).
import { auth } from "../../src/lib/auth"
import { prisma } from "./client"
import { ACCOUNT_CREATED_AT, SHOWCASE_EMAIL, SHOWCASE_NAME, SHOWCASE_PASSWORD } from "./config"

export interface ShowcaseUser {
  id: string
  email: string
}

/**
 * Idempotent-friendly entry point: if a user with the showcase email already
 * exists (from a prior run of this script), it is deleted first — `User`'s
 * relations all cascade (`onDelete: Cascade`, per every FK back to `User` in
 * prisma/schema.prisma), so this one delete clears every model this script
 * seeds for that user, leaving nothing stale behind from a previous run.
 */
export async function createOrReplaceShowcaseUser(): Promise<ShowcaseUser> {
  const existing = await prisma.user.findUnique({ where: { email: SHOWCASE_EMAIL } })

  if (existing) {
    await prisma.user.delete({ where: { id: existing.id } })
    console.log(`Existing showcase user found (${SHOWCASE_EMAIL}) — deleted, recreating fresh.`)
  } else {
    console.log(`No existing showcase user found for ${SHOWCASE_EMAIL} — creating fresh.`)
  }

  const { user } = await auth.api.signUpEmail({
    body: {
      email: SHOWCASE_EMAIL,
      password: SHOWCASE_PASSWORD,
      name: SHOWCASE_NAME,
    },
  })

  // Real signups get `createdAt: now()`; this demo account is meant to look
  // several months old (per the task's "good for demoing/screenshotting"
  // goal), so it's backdated to this script's own account-creation anchor
  // immediately after signup. Also marks the email verified so nothing in
  // the UI nags a demo user to verify an email nobody will ever check.
  const backdated = await prisma.user.update({
    where: { id: user.id },
    data: { createdAt: ACCOUNT_CREATED_AT, updatedAt: ACCOUNT_CREATED_AT, emailVerified: true },
  })

  return { id: backdated.id, email: backdated.email }
}
