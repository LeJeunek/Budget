"use client"

/**
 * DividendFormDialog — logs a dividend receipt against a holding (AC8: "an
 * amount and a date"). Allowed even on a Closed holding (Edge Cases: "a
 * dividend logged on a Closed holding ... allowed"), so this dialog is
 * offered from a holding-row's actions menu regardless of `closedAt` — see
 * holding-row.tsx.
 *
 * Pattern match: React Hook Form + zodResolver + the shared `Form`
 * primitives, calling `logDividend` directly and branching on its
 * `ApiResult` — same structure as
 * `features/goals/components/contribution-form.tsx`'s `ContributionForm`,
 * the closest existing "amount + date" logging dialog in this codebase.
 */

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { z } from "zod"

import { logDividend } from "@/features/investments/server/actions"
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
 * todayDateInputValue), so the default date shown never drifts a day
 * depending on the browser's local timezone relative to the server's
 * UTC-normalized `@db.Date` columns. */
function todayDateInputValue(): string {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, "0")
  const day = String(now.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const DividendFormSchema = z.object({
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

type DividendFormFields = z.infer<typeof DividendFormSchema>

export interface DividendFormDialogProps {
  holdingId: string
  holdingName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DividendFormDialog({
  holdingId,
  holdingName,
  open,
  onOpenChange,
}: DividendFormDialogProps) {
  const router = useRouter()

  const form = useForm<DividendFormFields>({
    resolver: zodResolver(DividendFormSchema),
    defaultValues: { amount: "", date: todayDateInputValue() },
  })

  // Resets to a blank amount + today's date on every open, so a
  // previously-submitted value doesn't linger the next time this dialog is
  // reused for a different holding (same rationale as ContributionForm's
  // identical effect).
  useEffect(() => {
    if (open) {
      form.reset({ amount: "", date: todayDateInputValue() })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, holdingId])

  async function onSubmit(values: DividendFormFields) {
    const result = await logDividend({
      holdingId,
      amount: Number(values.amount),
      date: values.date,
    })

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success("Dividend logged")
    onOpenChange(false)
    // Re-runs whichever Server Component page rendered this dialog (the
    // main Investments page or a holding detail page) so totals/history
    // reflect the new dividend immediately.
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Log a dividend</DialogTitle>
          <DialogDescription>
            Record dividend income received from {holdingName}.
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
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Log dividend
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
