import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { nextCookies } from "better-auth/next-js"
import { headers } from "next/headers"

import { db } from "@/lib/db"

/**
 * Better Auth server instance.
 *
 * Why the Prisma adapter: the Database Architect owns prisma/schema.prisma
 * as the single source of truth for the DB schema — the User/Session/
 * AuthAccount/Verification models there are already shaped to Better Auth's
 * Prisma adapter contract (see comments in schema.prisma), and AuthAccount
 * is explicitly mapped to the "account" table Better Auth expects. Routing
 * auth through the shared `db` client (lib/db.ts) instead of a second
 * connection means one Prisma connection pool for the whole app.
 *
 * `nextCookies()` must be the last entry in `plugins`: it rewrites the
 * Set-Cookie headers Better Auth's core produces so session cookies can be
 * set from Server Actions (via next/headers' cookies()), not just from the
 * Route Handler in app/api/auth/[...all]/route.ts.
 */
export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: "postgresql",
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  // Phase 0 scope per docs/planning/roadmap.md: email/password + Google only.
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      // Empty-string fallback keeps startup working before real credentials
      // are provisioned (see .env.example) — Google sign-in simply fails at
      // request time with unset credentials rather than crashing the app.
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  plugins: [nextCookies()],
})

// Shared session/user shape, inferred from the instance above so it always
// matches the actual configured plugins/fields instead of being hand-typed.
export type AuthSession = typeof auth.$Infer.Session
export type AuthUser = AuthSession["user"]

/**
 * The single entry point every domain's server code (Server Actions, Route
 * Handlers) must call to identify the current user before touching the
 * database. Returns null instead of throwing when unauthenticated so each
 * caller decides how to respond (redirect for pages, an ApiResult failure
 * for actions/routes) — see docs/architecture/Architecture.md ("lib/auth.ts
 * — Better Auth instance + getCurrentUser() helper, the primary defense
 * against the cross-user data leak risk") and folder-tree.md's note that
 * every features/<domain>/server/*.ts file must call this and scope every
 * Prisma query by the returned user's id.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  return session?.user ?? null
}
