"use client"

// Password reset completion page — the `redirectTo` target
// forgot-password/page.tsx passes to `requestPasswordReset`. Better Auth's
// own `/reset-password/:token` GET callback (triggered by the link in the
// email) validates the token server-side BEFORE this page ever loads, then
// redirects the browser here with either `?token=<valid>` or
// `?error=INVALID_TOKEN` — this page never has to validate the token
// itself, only read which of those two outcomes it was handed.

import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { resetPassword } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

const ResetPasswordSchema = z
  .object({
    // Mirrors login/page.tsx's SignUpSchema's own minimum — Better Auth
    // re-validates server-side regardless (see lib/auth.ts's
    // emailAndPassword config), same "client-side is fast feedback only"
    // framing as that file already established.
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })
type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>

/**
 * `useSearchParams()` opts a page out of static generation unless it's
 * wrapped in `<Suspense>` (Next.js's own "missing-suspense-with-csr-bailout"
 * requirement — confirmed by a real `next build` failure, not assumed) —
 * this fallback only ever flashes for the instant before the token/error
 * query param is read, since this route is never reached without one.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  )
}

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const linkError = searchParams.get("error")
  const [success, setSuccess] = useState(false)

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  })

  async function onSubmit(values: ResetPasswordInput) {
    if (!token) return
    const { error } = await resetPassword({ newPassword: values.newPassword, token })

    if (error) {
      form.setError("root", {
        message: error.message ?? "Could not reset your password. Try requesting a new link.",
      })
      return
    }

    setSuccess(true)
  }

  if (success) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Password updated</CardTitle>
          <CardDescription>You can now sign in with your new password.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => router.push("/login")}>
            Back to sign in
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!token || linkError) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>This link isn&apos;t valid</CardTitle>
          <CardDescription>
            Password reset links expire after 1 hour, or may have already
            been used. Request a new one to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/forgot-password">
            <Button className="w-full">Request a new link</Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>Enter a new password for your account.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm new password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.formState.errors.root && (
              <p className="text-sm text-destructive">
                {form.formState.errors.root.message}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              Reset password
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
