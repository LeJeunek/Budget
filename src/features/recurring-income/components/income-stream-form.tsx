"use client"

/**
 * IncomeStreamFormDialog — a single form used for both creating and editing
 * an income stream (recurring-income.md AC1/AC2/AC5), plus
 * AddIncomeStreamButton, a small trigger that opens it in create mode.
 * Mirrors `features/bills/components/bill-form.tsx`'s exact
 * BillFormDialog/AddBillButton pattern (one form, controlled `open`/
 * `onOpenChange` since it's opened from multiple places — a page-header
 * button and, once built, a stream detail page's "Edit" action).
 *
 * The one structural difference from `bill-form.tsx`: AC2's conditional
 * requirement ("expected amount and anchor/first-expected-date required for
 * every schedule except Irregular/One-off — neither is required or shown for
 * Irregular") means this form must show/hide two fields based on the
 * currently-selected `schedule`, which `bill-form.tsx` (only one schedule
 * "shape") never needed to handle.
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import type { IncomeSchedule, IncomeStream, IncomeType } from "@/features/recurring-income/types"
import { createIncomeStream, updateIncomeStream } from "@/features/recurring-income/server/actions"
import type {
  CreateIncomeStreamInput,
  UpdateIncomeStreamInput,
} from "@/features/recurring-income/server/validation"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

/** Human-readable labels for `IncomeType` — the raw Prisma enum value is
 * never shown directly to the user. Exported so any other recurring-income
 * component needing the same labels reuses this instead of re-deriving its
 * own copy — same precedent as `bill-form.tsx`'s `BILL_SCHEDULE_LABELS`. */
export const INCOME_TYPE_LABELS: Record<IncomeType, string> = {
  SALARY: "Salary",
  SIDE_HUSTLE: "Side Hustle",
  DIVIDEND: "Dividend",
  RENTAL: "Rental",
  BONUS: "Bonus",
  OTHER: "Other",
}

const INCOME_TYPE_VALUES = Object.keys(INCOME_TYPE_LABELS) as IncomeType[]

/** Human-readable labels for `IncomeSchedule`, incl. `IRREGULAR` (AC1's new
 * option Bills has no equivalent of). Exported for the same reuse reason as
 * `INCOME_TYPE_LABELS` above. */
export const INCOME_SCHEDULE_LABELS: Record<IncomeSchedule, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Biweekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  ANNUALLY: "Annually",
  IRREGULAR: "Irregular / One-off",
}

const INCOME_SCHEDULE_VALUES = Object.keys(INCOME_SCHEDULE_LABELS) as IncomeSchedule[]

const IS_IRREGULAR = (schedule: IncomeSchedule) => schedule === "IRREGULAR"

/** Client-side form schema — deliberately separate from
 * `server/validation.ts`'s `CreateIncomeStreamSchema`/`UpdateIncomeStreamSchema`
 * for the same pre-transform-string-vs-Date reason `bill-form.tsx`'s
 * `BillFormSchema` is separate from its server schema. The conditional
 * "required unless Irregular" rule (AC2) is expressed once via `superRefine`,
 * mirroring `CreateIncomeStreamSchema`'s own approach so the two rules never
 * drift out of sync. */
const IncomeStreamFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120, "Name must be 120 characters or fewer"),
    type: z.enum(INCOME_TYPE_VALUES as [IncomeType, ...IncomeType[]]),
    schedule: z.enum(INCOME_SCHEDULE_VALUES as [IncomeSchedule, ...IncomeSchedule[]]),
    expectedAmount: z
      .number({ error: "Expected amount must be a number" })
      .finite("Expected amount must be a finite number")
      .nonnegative("Expected amount cannot be negative"),
    anchorDate: z.string(),
  })
  .superRefine((data, ctx) => {
    if (IS_IRREGULAR(data.schedule)) {
      return
    }
    if (!(data.expectedAmount > 0)) {
      ctx.addIssue({
        code: "custom",
        message: "Expected amount must be greater than zero",
        path: ["expectedAmount"],
      })
    }
    if (!data.anchorDate) {
      ctx.addIssue({
        code: "custom",
        message: "A first expected date is required",
        path: ["anchorDate"],
      })
    }
  })

type IncomeStreamFormValues = z.infer<typeof IncomeStreamFormSchema>

function toDateInputValue(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date
  return value.toISOString().slice(0, 10)
}

function buildDefaultValues(stream: IncomeStream | null | undefined): IncomeStreamFormValues {
  if (!stream) {
    return {
      name: "",
      type: "SALARY",
      schedule: "MONTHLY",
      expectedAmount: 0,
      anchorDate: toDateInputValue(new Date()),
    }
  }
  return {
    name: stream.name,
    type: stream.type,
    schedule: stream.schedule,
    expectedAmount: stream.expectedAmount ?? 0,
    anchorDate: stream.anchorDate ? toDateInputValue(stream.anchorDate) : toDateInputValue(new Date()),
  }
}

export interface IncomeStreamFormDialogProps {
  /** Present = edit mode, null/undefined = create mode. */
  stream?: IncomeStream | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after a successful create/update, in addition to this
   * component's own `router.refresh()` — mirrors `bill-form.tsx`'s
   * `onSaved` prop. */
  onSaved?: (stream: IncomeStream) => void
}

export function IncomeStreamFormDialog({
  stream,
  open,
  onOpenChange,
  onSaved,
}: IncomeStreamFormDialogProps) {
  const router = useRouter()
  const isEditMode = stream !== undefined && stream !== null

  const form = useForm<IncomeStreamFormValues>({
    resolver: zodResolver(IncomeStreamFormSchema),
    defaultValues: buildDefaultValues(stream),
  })

  // Re-syncs whenever the dialog opens (create vs. edit, or a different
  // stream entirely) — this single dialog instance is reused across every
  // trigger, same rationale as bill-form.tsx's identical effect.
  useEffect(() => {
    if (open) {
      form.reset(buildDefaultValues(stream))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stream])

  const schedule = form.watch("schedule")
  const isIrregular = IS_IRREGULAR(schedule)

  async function onSubmit(values: IncomeStreamFormValues) {
    // Both Server Actions re-validate from scratch via their own schemas
    // (server/validation.ts), which accept the pre-transform "yyyy-mm-dd"
    // string this form collects for `anchorDate` — but the *type* declares
    // the post-transform `Date` shape. The cast below bridges that gap,
    // identical to bill-form.tsx's own note on the same pattern.
    // `expectedAmount`/`anchorDate` are omitted entirely for Irregular
    // streams (rather than sent as 0/today) — AC2's "no expected amount is
    // required or shown" is read here as "never submitted" too, matching
    // `createIncomeStream`'s own force-normalization of these fields to
    // `null` when the schedule is IRREGULAR.
    const sharedFields = {
      name: values.name,
      type: values.type,
      schedule: values.schedule,
      ...(isIrregular
        ? {}
        : { expectedAmount: values.expectedAmount, anchorDate: values.anchorDate }),
    }

    const result = isEditMode
      ? await updateIncomeStream({
          id: stream.id,
          ...sharedFields,
        } as unknown as UpdateIncomeStreamInput)
      : await createIncomeStream(sharedFields as unknown as CreateIncomeStreamInput)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success(isEditMode ? "Income stream updated" : "Income stream created")
    onOpenChange(false)
    onSaved?.(result.data)
    // Re-runs the Server Component page's getIncomeStreams()/getStreamById()
    // call — see app/(dashboard)/income/page.tsx and [streamId]/page.tsx.
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit income stream" : "Add income stream"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update this stream's details. Changes to amount or schedule only affect future occurrences."
              : "Set up a source of income — salary, a side hustle, dividends, rental, or a bonus."}
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
                    <Input placeholder="e.g. Acme Corp Salary, Etsy Shop" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {INCOME_TYPE_VALUES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {INCOME_TYPE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="schedule"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Schedule</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a schedule" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {INCOME_SCHEDULE_VALUES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {INCOME_SCHEDULE_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {isIrregular ? (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                Irregular/One-off income has no fixed amount or cadence — once created, log each
                payment individually from the stream&apos;s detail page.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="expectedAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expected amount</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={Number.isNaN(field.value) ? "" : field.value}
                          onChange={(event) => field.onChange(event.target.valueAsNumber)}
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="anchorDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isEditMode ? "Anchor date" : "First expected date"}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {isEditMode ? "Save changes" : "Add income stream"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export interface AddIncomeStreamButtonProps {
  /** Override the trigger label, e.g. for the zero-streams empty state. */
  label?: string
}

/** Self-contained "Add income stream" trigger: owns its own open state so a
 * Server Component page can render it without itself needing to be a Client
 * Component — mirrors `bill-form.tsx`'s `AddBillButton`. */
export function AddIncomeStreamButton({ label = "Add income stream" }: AddIncomeStreamButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon />
        {label}
      </Button>
      <IncomeStreamFormDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
