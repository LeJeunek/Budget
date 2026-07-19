import { toNextJsHandler } from "better-auth/next-js"

import { auth } from "@/lib/auth"

// Better Auth's catch-all Next.js Route Handler. Every auth operation
// (sign-in, sign-up, OAuth callback, session lookup, sign-out, etc.) is
// dispatched through auth.handler based on the request path/method — see
// docs/architecture/folder-tree.md, this exact path is Better Auth's
// required mount point. Do not add business logic here; all app-specific
// behavior belongs in lib/auth.ts's getCurrentUser() and downstream
// features/<domain>/server code.
export const { GET, POST } = toNextJsHandler(auth)
