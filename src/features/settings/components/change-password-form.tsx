"use client"

/**
 * <ChangePasswordForm> — the in-app "reset your password" path for an
 * already-signed-in user (distinct from `/forgot-password`'s email-link
 * flow for someone locked out entirely). Calls Better Auth's
 * `changePassword` directly (confirmed client method name — see
 * `auth-client.ts`'s own JSDoc): requires the user's current password, so
 * this needs no email round-trip or token.
 *
 * `revokeOtherSessions: true` is a deliberate default, not left to the
 * caller — per Better Auth's own documented behavior, a password change is
 * exactly the moment a user would want every *other* signed-in device
 * logged out (e.g. a shared/borrowed device, a suspected compromise). This
 * component's own session is unaffected either way.
 */

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { changePassword } from "@/lib/auth-client"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    // Mirrors login/page.tsx's SignUpSchema minimum — Better Auth re-validates
    // server-side regardless, same "fast feedback only" framing.
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })
type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>

export function ChangePasswordForm() {
  const [justChanged, setJustChanged] = useState(false)
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(ChangePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  })

  async function onSubmit(values: ChangePasswordInput) {
    const { error } = await changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: true,
    })

    if (error) {
      form.setError("root", {
        message: error.message ?? "Could not change your password.",
      })
      return
    }

    toast.success("Password changed. Other devices have been signed out.")
    form.reset()
    setJustChanged(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>
          Changing your password signs you out of every other device — this
          one stays signed in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid max-w-sm gap-4"
          >
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
            {justChanged && !form.formState.isDirty && (
              <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">
                Password changed successfully.
              </p>
            )}
            <Button
              type="submit"
              className="w-fit"
              disabled={form.formState.isSubmitting}
            >
              Change password
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
