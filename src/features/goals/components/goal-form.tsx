"use client"

/**
 * GoalFormDialog — a single form used for both creating and editing a goal
 * (docs/product/savings-goals.md AC1/AC4), plus AddGoalButton, a small
 * trigger that opens it in create mode. One component pair instead of two
 * near-duplicate forms, per the company's "avoid duplication" rule — mirrors
 * features/accounts/components/account-form.tsx's AccountFormDialog/
 * AddAccountButton pair exactly.
 *
 * Pattern match: React Hook Form + zodResolver + the shared `Form`
 * primitives, calling a Server Action directly and branching on its
 * `ApiResult`, exactly like app/(auth)/login/page.tsx and account-form.tsx.
 * The validation schema itself lives in ./goal-form-schema.ts — split out to
 * keep this file (rendering + submit wiring) under the company's
 * ~300-line-per-file guideline.
 *
 * Controlled `open`/`onOpenChange` (rather than a built-in `DialogTrigger`)
 * for the same reason account-form.tsx documents: this dialog is opened from
 * multiple places (a page-level "Add Goal" button, and each GoalCard's Edit
 * menu item, which needs to close its own dropdown menu first) — simplest
 * with the parent owning the open state.
 *
 * Per AC3, there is deliberately no account picker anywhere in this form —
 * a goal's progress only ever moves via logged contributions
 * (contribution-form.tsx), never by linking an Account.
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import type { Goal } from "@/features/goals/types"
import { createGoal, updateGoal } from "@/features/goals/server/actions"
import {
  GoalFormSchema,
  defaultValuesFor,
  type GoalFormFields,
} from "@/features/goals/components/goal-form-schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

export interface GoalFormDialogProps {
  /** Omit for create mode; pass the goal being edited for edit mode. */
  goal?: Goal
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GoalFormDialog({ goal, open, onOpenChange }: GoalFormDialogProps) {
  const router = useRouter()
  const isEditMode = goal !== undefined

  const form = useForm<GoalFormFields>({
    resolver: zodResolver(GoalFormSchema),
    defaultValues: defaultValuesFor(goal),
  })

  // Re-syncs the form whenever the dialog opens (create vs. edit, or a
  // different goal entirely) instead of once on mount — the same
  // GoalFormDialog instance is reused across every GoalCard's Edit action,
  // so stale values from a previous open must not leak in.
  useEffect(() => {
    if (open) {
      form.reset(defaultValuesFor(goal))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goal])

  async function onSubmit(values: GoalFormFields) {
    // GoalFormSchema validates these as well-formed number strings but
    // doesn't convert them — Number(...) here is safe precisely because
    // validation already guaranteed each is parseable. targetDate is sent
    // through as its raw "yyyy-mm-dd" (or "") string: createGoal/updateGoal's
    // server-side schemas parse that exact shape themselves (see
    // goal-form-schema.ts's targetDate JSDoc).
    const targetAmount = Number(values.targetAmount)
    const plannedMonthlyContribution = values.plannedMonthlyContribution
      ? Number(values.plannedMonthlyContribution)
      : undefined

    const result = isEditMode
      ? await updateGoal({
          id: goal.id,
          name: values.name,
          targetAmount,
          targetDate: values.targetDate ?? "",
          // On edit, an empty field must explicitly clear a previously-set
          // plan (UpdateGoalSchema accepts `null` for this) rather than be
          // omitted and left unchanged — mirrors account-form.tsx's
          // interestRate ?? null handling.
          plannedMonthlyContribution: plannedMonthlyContribution ?? null,
        })
      : await createGoal({
          name: values.name,
          targetAmount,
          targetDate: values.targetDate ?? "",
          plannedMonthlyContribution,
        })

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success(isEditMode ? "Goal updated" : "Goal created")
    onOpenChange(false)
    // Re-runs the Server Component page's getGoals() call — see
    // app/(dashboard)/goals/page.tsx and [goalId]/page.tsx.
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit goal" : "Add goal"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update this goal's target."
              : "Set a savings target to start tracking progress toward it."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Emergency Fund" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="targetAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target amount</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="targetDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormDescription>Optional.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="plannedMonthlyContribution"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Planned monthly contribution</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" {...field} />
                  </FormControl>
                  <FormDescription>
                    Optional — used to estimate when you&apos;ll reach this goal.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {isEditMode ? "Save changes" : "Add goal"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export interface AddGoalButtonProps {
  /** Override the trigger label, e.g. for the zero-goals empty state. */
  label?: string
}

/**
 * Self-contained "Add Goal" trigger: owns its own open state so
 * app/(dashboard)/goals/page.tsx (a Server Component) can render it without
 * itself needing to be a Client Component.
 */
export function AddGoalButton({ label = "Add goal" }: AddGoalButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon />
        {label}
      </Button>
      <GoalFormDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
