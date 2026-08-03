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
 * zero-code-change default that makes every bare, declarative `motion.*`
 * component's `transition` (e.g. `components/shared/progress-ring.tsx`'s
 * existing `motion.circle` stroke animation) honor the OS-level
 * `prefers-reduced-motion` preference for free — Reduced-Motion Foundation
 * AC3, satisfied with zero edits to that file's own animation code. This is
 * root-layout plumbing in the identical sense `QueryClientProvider` already
 * is here (mounted once, above the whole app, rendering no visible output
 * of its own), so it belongs in this same file rather than a second,
 * motion-specific provider for one JSX element with no state of its own.
 * `MotionConfig` wraps `QueryClientProvider`'s own `{children}` rather than
 * the other way around — the two providers have no dependency on each
 * other's order, so this is simply "outermost plumbing wraps the query
 * boundary," not a meaningful nesting decision.
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
