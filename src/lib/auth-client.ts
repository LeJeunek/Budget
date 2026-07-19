"use client"

import { createAuthClient } from "better-auth/react"

/**
 * Better Auth's React client. Used by Client Components only (the login
 * form here, and later the top-nav's "sign out" / account menu) to call
 * sign-in/sign-up/sign-out and read session state without a manual fetch
 * wrapper.
 *
 * No `baseURL` is passed: the browser fetches same-origin against
 * /api/auth/* (see src/app/api/auth/[...all]/route.ts), so Better Auth's
 * default of the current window origin is correct in every environment
 * (local dev, staging, prod) without an extra NEXT_PUBLIC_* env var.
 */
export const authClient = createAuthClient()

export const { signIn, signUp, signOut, useSession } = authClient
