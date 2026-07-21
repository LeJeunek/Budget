"use client"

/**
 * SavingsRateGoalFormDialog — create/edit form for a `SAVINGS_RATE_TARGET`
 * Financial Goal (financial-goals.md's Type 3), plus
 * `AddSavingsRateGoalButton`. The simplest of the three type forms: no
 * cross-domain picker (no debt/account list needed at all), just a percent
 * and an optional date — mirrors `features/goals/components/goal-form.tsx`'s
 * `targetDate` "" <-> unset/clear handling exactly (bound to
 * `<Input type="date">`, passed through as its raw `"yyyy-mm-dd"` string;
 * the server's `optionalDateOnlySchema`/`emptyToNull` parse that exact shape
 * for create/update respectively — see `server/validation.ts`).
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import type { FinancialGoalWithProgress } from "@/features/financial-goals/types"
import {
  createFinancialGoal,
  updateFinancialGoal,
} from "@/features/financial-goals/server/actions"
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

const MAX_NAME_LENGTH = 120

const FormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(MAX_NAME_LENGTH, `Name must be ${MAX_NAME_LENGTH} characters or fewer`),
  targetPercent: z
    .string()
    .trim()
    .refine((value) => value !== "" && Number.isFinite(Number(value)), {
      message: "Target percent must be a number",
    })
    .refine((value) => Number(value) >= 0 && Number(value) <= 100, {
      message: "Target percent must be between 0 and 100",
    }),
  // Bound to <Input type="date">, whose DOM value is "" (unset) or
  // "yyyy-mm-dd" — see this file's JSDoc.
  targetDate: z.string().trim().optional(),
})
type FormValues = z.infer<typeof FormSchema>

/** `"yyyy-mm-dd"` for a `Date`, using UTC getters — matches
 * `features/goals/components/goal-form-schema.ts`'s `toDateInputValue`
 * exactly, duplicated here per folder-tree.md's module-boundary rule
 * (features/<domain>/components isn't a shared import target across
 * domains). */
function toDateInputValue(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function defaultValuesFor(goal?: FinancialGoalWithProgress): FormValues {
  return {
    name: goal?.name ?? "",
    targetPercent:
      goal?.targetPercent !== undefined && goal?.targetPercent !== null
        ? String(goal.targetPercent)
        : "",
    targetDate: goal?.targetDate ? toDateInputValue(goal.targetDate) : "",
  }
}

export interface SavingsRateGoalFormDialogProps {
  /** Omit for create mode; pass the goal being edited for edit mode. */
  goal?: FinancialGoalWithProgress
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SavingsRateGoalFormDialog({
  goal,
  open,
  onOpenChange,
}: SavingsRateGoalFormDialogProps) {
  const router = useRouter()
  const isEditMode = goal !== undefined

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: defaultValuesFor(goal),
  })

  useEffect(() => {
    if (open) {
      form.reset(defaultValuesFor(goal))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goal])

  async function onSubmit(values: FormValues) {
    const targetPercent = Number(values.targetPercent)

    const result = isEditMode
      ? await updateFinancialGoal({
          id: goal.id,
          name: values.name,
          targetPercent,
          // "" explicitly clears a previously-set target date (server's
          // emptyToNull convention) rather than leaving it unchanged.
          targetDate: values.targetDate ?? "",
        })
      : await createFinancialGoal({
          type: "SAVINGS_RATE_TARGET",
          name: values.name,
          targetPercent,
          targetDate: values.targetDate || undefined,
        })

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success(isEditMode ? "Goal updated" : "Goal created")
    onOpenChange(false)
    // Re-runs the Server Component page's getFinancialGoals() calls — see
    // app/(dashboard)/financial-goals/page.tsx.
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Edit savings rate goal" : "Set a savings rate target"}
          </DialogTitle>
          <DialogDescription>
            Track your rolling 3-month average savings rate against a target
            percentage — the same calculation the Dashboard already shows you.
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
                    <Input placeholder="Save 20% of income" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="targetPercent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target savings rate (%)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" max="100" {...field} />
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

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {isEditMode ? "Save changes" : "Create goal"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export interface AddSavingsRateGoalButtonProps {
  /** Override the trigger label, e.g. for the zero-goals empty state. */
  label?: string
}

/**
 * Self-contained "Set a savings rate target" trigger: owns its own open
 * state so app/(dashboard)/financial-goals/page.tsx (a Server Component) can
 * render it without itself needing to be a Client Component.
 */
export function AddSavingsRateGoalButton({
  label = "Set a savings rate target",
}: AddSavingsRateGoalButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <PlusIcon />
        {label}
      </Button>
      <SavingsRateGoalFormDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
