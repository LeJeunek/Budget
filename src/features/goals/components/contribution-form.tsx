"use client"

/**
 * ContributionForm — logs a contribution against a goal (AC3: "an amount ...
 * adds to that goal's current progress"), the only way a goal's progress
 * moves. Rendered as a small dialog triggered by a "Log contribution"
 * button, opened from the goal detail view
 * (app/(dashboard)/goals/[goalId]/page.tsx).
 *
 * Deliberately has only two fields — amount and date — and no account
 * picker, per AC3's explicit "no account picker anywhere in this feature's
 * UI" requirement (resolved, CTO 2026-07-19: manual contributions only, no
 * Account linkage).
 *
 * Pattern match: React Hook Form + zodResolver + the shared `Form`
 * primitives, calling `addContribution` directly and branching on its
 * `ApiResult`, same as goal-form.tsx/account-form.tsx. Kept in one file
 * (no separate -schema.ts split) since its schema is small enough that the
 * whole component stays well under the company's ~300-line guideline.
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import { addContribution } from "@/features/goals/server/actions"
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

/** `"yyyy-mm-dd"` for today, in UTC — matches this codebase's established
 * UTC-calendar-date convention (see goal-form-schema.ts's identical
 * toDateInputValue) so the default date shown never drifts a day depending
 * on the browser's local timezone relative to the server's UTC-normalized
 * `@db.Date` columns. */
function todayDateInputValue(): string {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, "0")
  const day = String(now.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const ContributionFormSchema = z.object({
  amount: z
    .string()
    .trim()
    .refine((value) => value !== "" && Number.isFinite(Number(value)), {
      message: "Amount must be a number",
    })
    .refine((value) => Number(value) > 0, {
      message: "Amount must be greater than 0",
    }),
  date: z.string().trim().min(1, "Date is required"),
})

type ContributionFormFields = z.infer<typeof ContributionFormSchema>

export interface ContributionFormProps {
  goalId: string
  /** Trigger button label, e.g. "Log contribution" vs. "Log your first
   * contribution" for a goal with no history yet. */
  triggerLabel?: string
}

export function ContributionForm({
  goalId,
  triggerLabel = "Log contribution",
}: ContributionFormProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const form = useForm<ContributionFormFields>({
    resolver: zodResolver(ContributionFormSchema),
    defaultValues: { amount: "", date: todayDateInputValue() },
  })

  // Resets to a blank amount + today's date on every open, so a
  // previously-submitted value doesn't linger the next time this dialog is
  // opened for the same goal.
  useEffect(() => {
    if (open) {
      form.reset({ amount: "", date: todayDateInputValue() })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function onSubmit(values: ContributionFormFields) {
    const result = await addContribution({
      goalId,
      amount: Number(values.amount),
      date: values.date,
    })

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success("Contribution logged")
    setOpen(false)
    // Re-runs the Server Component detail page's getGoalById() call so the
    // updated progress and contribution history render immediately — see
    // app/(dashboard)/goals/[goalId]/page.tsx.
    router.refresh()
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PlusIcon />
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Log a contribution</DialogTitle>
            <DialogDescription>
              Record an amount you&apos;ve put toward this goal.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  Log contribution
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  )
}
