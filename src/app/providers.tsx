"use client"

import { useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MotionConfig } from "framer-motion"

/**
 * Mounts a TanStack Query `QueryClientProvider` above the app tree.
 *
 * Every `features/*\/hooks/use-*.ts` file (e.g.
 * `features/transactions/hooks/use-transactions.ts`,
 * `features/accounts/hooks/use-accounts.ts`) calls `useQuery`/`useMutation`
 * and assumes a provider exists somewhere above it — none had been wired
 * into the app yet (Accounts and Transactions were both still Phase 0
 * placeholder pages, so nothing had exercised the hooks until now). This is
 * root-layout plumbing (routing/layout wiring), not a reusable UI
 * component or domain logic, so it belongs here per the Frontend Lead's
 * "manage routing" / "work within page and layout files" remit.
 *
 * The `QueryClient` is created inside `useState`'s lazy initializer (not a
 * module-level singleton) per TanStack Query's official Next.js App Router
 * guidance: a module-level client would be shared across requests on the
 * server, leaking cached data between users during SSR.
 *
 * **Phase 5b addition (docs/architecture/phase-5b-technical-design.md
 * §1.1):** also mounts `<MotionConfig reducedMotion="user">`, the app-wide,
 * zero-code-change default for any bare, declarative `motion.*` component
 * whose own animation doesn't need to branch on reduced motion explicitly.
 * This is root-layout plumbing in the identical sense `QueryClientProvider`
 * already is here (mounted once, above the whole app, rendering no visible
 * output of its own), so it belongs in this same file rather than a second,
 * motion-specific provider for one JSX element with no state of its own.
 * `MotionConfig` wraps `QueryClientProvider`'s own `{children}` rather than
 * the other way around — the two providers have no dependency on each
 * other's order, so this is simply "outermost plumbing wraps the query
 * boundary," not a meaningful nesting decision.
 *
 * **Correction (Bug Hunter, Phase 5b review gate,
 * `docs/testing/bug-reports/reduced-motion-not-honored-on-first-page-load-animated-number-progress-ring.md`
 * and `reduced-motion-mid-session-re-enable-does-not-resume-animation.md`):**
 * this doc comment previously claimed `MotionConfig`'s own `reducedMotion="user"`
 * resolution reliably makes bare `motion.*` transitions honor the live OS
 * preference, citing `components/shared/progress-ring.tsx`'s stroke
 * animation as the example. That example turned out to be wrong: Framer
 * Motion's own internal reduced-motion resolution (the mechanism
 * `MotionConfig="user"` relies on) reads the same one-time,
 * never-updated-after-mount value the installed `framer-motion` version's
 * public `useReducedMotion` hook had — `components/shared/motion/
 * use-reduced-motion.ts` was rewritten to a real, reactive
 * `useSyncExternalStore`-based hook to fix this for every EXPLICIT caller of
 * that hook, but `MotionConfig`'s own internal resolution is a separate
 * code path inside Framer Motion's own internals that this rewrite cannot
 * reach or fix. `progress-ring.tsx` no longer relies on `MotionConfig` alone
 * for this reason — it now calls the shared hook explicitly and drives its
 * stroke animation imperatively (see that file's own doc comment for the
 * full history). `MotionConfig` remains correctly mounted here for every
 * OTHER bare `motion.*` transition in the app that has no history of this
 * same demonstrated staleness — this is not a signal to migrate every
 * `motion.*` usage away from it, only a correction to what this file's own
 * comment previously, incorrectly, held up as proof it worked reliably.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </MotionConfig>
  )
}
