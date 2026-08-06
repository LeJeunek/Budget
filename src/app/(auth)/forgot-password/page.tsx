"use client"

// Password reset request page — mirrors login/page.tsx's own "intentionally
// plain" Phase 0 framing exactly. Calls Better Auth's `requestPasswordReset`
// (confirmed client method name — see auth-client.ts's own JSDoc), which
// always responds with the same generic success regardless of whether the
// email exists (Better Auth's own anti-enumeration behavior, confirmed by
// direct read of node_modules/better-auth/dist/api/routes/password.mjs).
// This page's own success copy deliberately mirrors that same generic
// wording rather than confirming or denying account existence itself.

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { requestPasswordReset } from "@/lib/auth-client"
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

const ForgotPasswordSchema = z.object({
  email: z.email("Enter a valid email address"),
})
type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false)
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: "" },
  })

  async function onSubmit(values: ForgotPasswordInput) {
    // Errors here are almost always transport/rate-limit failures, not "no
    // such account" (Better Auth never reveals that) — shown as a form
    // error rather than silently treated as success.
    const { error } = await requestPasswordReset({
      email: values.email,
      redirectTo: "/reset-password",
    })

    if (error) {
      form.setError("root", {
        message: error.message ?? "Something went wrong. Try again in a moment.",
      })
      return
    }

    setSubmitted(true)
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          Enter the email on your account and we&apos;ll send you a link to
          reset your password.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {submitted ? (
          <p className="text-sm text-foreground">
            If an account exists for that email, a reset link is on its way.
            Check your inbox (and spam folder) — the link expires in 1 hour.
          </p>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" {...field} />
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
                Send reset link
              </Button>
            </form>
          </Form>
        )}
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
