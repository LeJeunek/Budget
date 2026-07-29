import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { nextCookies } from "better-auth/next-js"
import { headers } from "next/headers"

import { db } from "@/lib/db"
import { getSystemCategoryTemplate } from "@/features/categories/server/template"

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
/**
 * Additional origins Better Auth accepts a request from, beyond `baseURL`
 * itself. Real-world gap this closes: `http://localhost:3000` and
 * `http://127.0.0.1:3000` are the same server but different origins as far
 * as Better Auth's strict origin check is concerned — a browser, VS Code's
 * preview pane, or any tool that happens to open the 127.0.0.1 form instead
 * of `localhost` gets rejected with "Invalid origin" even though `baseURL`
 * is configured correctly. Reproduced and confirmed 2026-07-20: `.env`'s
 * `BETTER_AUTH_URL` was correctly `http://localhost:3000` the whole time —
 * this was the actual cause, not a misconfigured `baseURL`.
 *
 * Also includes `VERCEL_URL` (a hostname-only value Vercel injects
 * automatically at build/runtime — see
 * https://vercel.com/docs/environment-variables/system-environment-variables)
 * so every preview deployment's unique subdomain is trusted without needing
 * `BETTER_AUTH_URL` hand-updated per preview — only the stable production
 * URL needs that (see .env.example).
 */
const trustedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL.trim()}`] : []),
]

/**
 * `.trim()` guards against a real production incident (2026-07-20): a
 * trailing space pasted into Vercel's `BETTER_AUTH_URL` env var value
 * survives `new URL()` on the bare origin (the URL parser trims it), but
 * Better Auth's internal `withPath()` only trims trailing *slashes* before
 * appending `/api/auth` — leaving the space embedded between origin and
 * path (`"https://…app /api/auth"`), which then fails an unguarded
 * `new URL()` deeper in Better Auth's request handling with a raw
 * `TypeError: Invalid URL` at request time (no build-time or type error).
 */
const betterAuthUrl = process.env.BETTER_AUTH_URL?.trim()

export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: "postgresql",
  }),
  account: {
    modelName: "authAccount",
  },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: betterAuthUrl,
  trustedOrigins,
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
  // Phase 4c (phase-4c-technical-design.md §1.3): exposes the Prisma-backed
  // `User.role` column through Better Auth's session/`$Infer` typing without
  // Better Auth's own `admin` plugin (rejected — see `UserRole`'s schema
  // comment and risk-register.md #27/#38). `input: false` is the load-bearing
  // part: Better Auth's `sign-up`/`update-user` routes both honor
  // `RemoveFieldsWithInputFalse` at the framework level, so a client-supplied
  // `role` value is mechanically impossible for either endpoint to accept —
  // this is what satisfies "no self-service admin-role-assignment UI... never
  // an endpoint reachable through the product itself" by construction, not by
  // remembering not to expose it. `type: "string"` (not a Prisma-enum-aware
  // type) is a minor, harmless type-boundary detail — Better Auth's
  // `additionalFields` API only knows primitive TS types; the value flowing
  // through session/`$Infer` typing is a plain string that happens to always
  // be `"USER"` or `"ADMIN"`, the same category of boundary every other
  // Prisma-enum-as-plain-string consumer in this codebase already crosses.
  user: {
    additionalFields: {
      role: { type: "string", input: false, defaultValue: "USER" },
    },
  },
  // Seeds the Charter's fixed 11-category starter set for every new user,
  // per docs/product/categories.md AC1 ("Every new user automatically
  // receives the ... starter set at signup, with no action required on
  // their part"), plus (Phase 4c, phase-4c-technical-design.md §3.2) a
  // `UserPreference` row, EAGERLY seeded here (unlike `NotificationPreference`
  // /`NotificationThresholdSettings`'s own lazy-on-first-customization
  // materialization) so the row exists from the very first request onward —
  // needed to support race-safe cross-device browser-timezone inference (see
  // that model's own schema comment: `timezone: "UTC"`,
  // `timezoneConfirmed: false` is the concrete starting state
  // `captureInferredTimezone`/`updateTimezone` safely upgrade exactly once).
  //
  // Category seeding was flagged as an open gap by the agent that built the
  // Categories backend and went unaddressed until caught by live testing
  // sign-up through the actual UI — typecheck/lint/build never exercise this
  // path since it only matters at request time.
  //
  // `createMany`/`create` (not sequential per-row calls) so each of these is
  // one round-trip; failures here intentionally do not block sign-up itself
  // (a user should never be unable to create an account because seeding
  // hiccuped) — logged, not rethrown, per the `after` hook's `Promise<void>`
  // contract giving Better Auth's core no way to surface a partial failure
  // anyway. The two seeding steps are independent and both wrapped in their
  // own `try/catch` so a category-seeding failure never prevents the
  // `UserPreference` row (or vice versa) from being created.
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            // Phase 4c (phase-4c-technical-design.md §4.3): reads the
            // DB-backed `SystemCategoryTemplate` table instead of the
            // `DEFAULT_CATEGORIES` constant it replaces — seeded, at deploy
            // time, with exactly that constant's eleven entries in their
            // original order (see this feature's migration's own
            // "DataMigration" comment), so this swap is zero-behavior-change
            // for the very next signup after deploy. `order` is a
            // template-only column, never copied onto `Category` (which has
            // no such column and nothing about categories.md asks for one).
            const template = await getSystemCategoryTemplate()
            await db.category.createMany({
              data: template.map((category) => ({
                name: category.name,
                color: category.color,
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

          try {
            await db.userPreference.create({
              data: { userId: user.id },
            })
          } catch (error) {
            console.error(
              `Failed to seed user preferences for user ${user.id}:`,
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

/**
 * Phase 4c (phase-4c-technical-design.md §1.3): the single entry point every
 * Admin Server Action and every Admin page's layout-level guard must call —
 * never `getCurrentUser()` plus an inline `role` check duplicated ad hoc, so
 * "what counts as admin" is defined in exactly one place, mirroring
 * `getCurrentUser()`'s own status as this codebase's one entry point for
 * identifying the current user at all.
 *
 * Same "return `null`, never throw" contract as `getCurrentUser()`. Because
 * this app's sessions are the database strategy (a `Session.token` row
 * looked up fresh on every call, joined live to its `User` row — no JWT/
 * stateless session plugin is configured), `role` being a plain column on
 * that same live-joined row means a mid-session revocation (an admin's
 * `role` flipped back to `USER` via a direct database update) takes effect
 * on the very next request, with no additional cache-invalidation mechanism
 * required — satisfying Admin's "checked live, on every request, never on
 * stale session data" requirement by construction.
 */
export async function getCurrentAdminUser(): Promise<AuthUser | null> {
  const user = await getCurrentUser()
  return user?.role === "ADMIN" ? user : null
}
