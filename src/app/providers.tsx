"use client"

import { useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

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
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
