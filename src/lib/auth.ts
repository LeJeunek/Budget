import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { nextCookies } from "better-auth/next-js"
import { headers } from "next/headers"

import { db } from "@/lib/db"
import { DEFAULT_CATEGORIES } from "@/features/categories/default-categories"

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
 * `account.modelName` MUST be set to "authAccount": Prisma Client generates
 * its client property from the *model name*, not `@@map` — `@@map` only
 * renames the underlying SQL table. Our Prisma model is named `AuthAccount`
 * (to avoid colliding with FinanceOS's own `Account` model, which is a
 * separate, unrelated concept — a financial account), so its Prisma Client
 * property is `db.authAccount`, not `db.account`. Without this override,
 * Better Auth's Prisma adapter defaults to calling `db.account`, which
 * Prisma resolves to FinanceOS's financial Account model instead — causing
 * every credential sign-up to fail with a confusing "Argument `name` is
 * missing" error (financial Account.name is a required field the auth
 * payload obviously never provides). Caught via a real signup attempt
 * against the live dev database, not by typecheck/lint/build.
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
  account: {
    modelName: "authAccount",
  },
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
  // Seeds the Charter's fixed 11-category starter set for every new user,
  // per docs/product/categories.md AC1 ("Every new user automatically
  // receives the ... starter set at signup, with no action required on
  // their part"). This was flagged as an open gap by the agent that built
  // the Categories backend and went unaddressed until caught by live
  // testing sign-up through the actual UI — typecheck/lint/build never
  // exercise this path since it only matters at request time.
  //
  // `createMany` (not sequential `create` calls) so this is one round-trip;
  // failures here intentionally do not block sign-up itself (a user should
  // never be unable to create an account because category seeding hiccuped)
  // — logged, not rethrown, per the `after` hook's `Promise<void>` contract
  // giving Better Auth's core no way to surface a partial failure anyway.
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            await db.category.createMany({
              data: DEFAULT_CATEGORIES.map((category) => ({
                ...category,
                userId: user.id,
                isSystem: true,
              })),
            })
          } catch (error) {
            console.error(
              `Failed to seed default categories for user ${user.id}:`,
              error,
            )
          }
        },
      },
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
