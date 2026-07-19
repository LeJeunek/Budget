"use client"

// Minimal Phase 0 login/sign-up page (email+password and Google OAuth), per
// docs/planning/roadmap.md's "Better Auth wired up: email login + Google
// OAuth". This is intentionally plain — a Frontend Lead / UI Component
// Engineer pass owns visual design later; the Backend Engineer's job here
// is only to wire real auth calls correctly (see auth-client.ts, which
// wraps the Better Auth React client hitting app/api/auth/[...all]).
//
// There is no dedicated "auth" feature module in docs/architecture/
// folder-tree.md (auth lives in lib/auth.ts + this route group, not
// features/), so the sign-in/sign-up form logic is kept local to this page
// rather than invented in a new features/auth/ folder that isn't part of
// the architecture.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

const SignInSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
})
type SignInInput = z.infer<typeof SignInSchema>

const SignUpSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.email("Enter a valid email address"),
  // Mirrors Better Auth's default minimum; the server re-validates this
  // regardless (see lib/auth.ts's emailAndPassword config) — client-side
  // validation here is only for fast user feedback, never trusted alone.
  password: z.string().min(8, "Password must be at least 8 characters"),
})
type SignUpInput = z.infer<typeof SignUpSchema>

/** Redirect target after a successful sign-in/sign-up. */
const POST_LOGIN_PATH = "/"

function GoogleButton() {
  const [isPending, setIsPending] = useState(false)

  async function handleClick() {
    setIsPending(true)
    // Full-page redirect flow (OAuth authorization code), so no local
    // success/error handling is needed here beyond surfacing a request-time
    // failure (e.g. Google credentials not yet configured).
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: POST_LOGIN_PATH,
    })
    if (error) {
      setIsPending(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={isPending}
      onClick={handleClick}
    >
      Continue with Google
    </Button>
  )
}

function SignInForm() {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<SignInInput>({
    resolver: zodResolver(SignInSchema),
    defaultValues: { email: "", password: "" },
  })

  async function onSubmit(values: SignInInput) {
    setFormError(null)
    const { error } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
      callbackURL: POST_LOGIN_PATH,
    })

    if (error) {
      setFormError(error.message ?? "Could not sign in. Check your credentials.")
      return
    }

    router.push(POST_LOGIN_PATH)
    router.refresh()
  }

  return (
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
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="current-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {formError ? (
          <p className="text-sm text-destructive">{formError}</p>
        ) : null}
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          Sign in
        </Button>
      </form>
    </Form>
  )
}

function SignUpForm() {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<SignUpInput>({
    resolver: zodResolver(SignUpSchema),
    defaultValues: { name: "", email: "", password: "" },
  })

  async function onSubmit(values: SignUpInput) {
    setFormError(null)
    const { error } = await authClient.signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
      callbackURL: POST_LOGIN_PATH,
    })

    if (error) {
      setFormError(error.message ?? "Could not create an account.")
      return
    }

    router.push(POST_LOGIN_PATH)
    router.refresh()
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
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
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="new-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {formError ? (
          <p className="text-sm text-destructive">{formError}</p>
        ) : null}
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          Create account
        </Button>
      </form>
    </Form>
  )
}

export default function LoginPage() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>FinanceOS</CardTitle>
        <CardDescription>Sign in to your account or create a new one.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Tabs defaultValue="sign-in">
          <TabsList className="w-full">
            <TabsTrigger value="sign-in" className="flex-1">
              Sign in
            </TabsTrigger>
            <TabsTrigger value="sign-up" className="flex-1">
              Sign up
            </TabsTrigger>
          </TabsList>
          <TabsContent value="sign-in" className="mt-4">
            <SignInForm />
          </TabsContent>
          <TabsContent value="sign-up" className="mt-4">
            <SignUpForm />
          </TabsContent>
        </Tabs>
        <div className="flex items-center gap-2">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>
        <GoogleButton />
      </CardContent>
    </Card>
  )
}
