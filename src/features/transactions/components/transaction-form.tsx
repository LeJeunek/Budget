"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
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
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Account } from "@/features/accounts/types"
import type { Category } from "@/features/categories/types"
import type { Transaction } from "@/features/transactions/types"
import type {
  CreateTransactionInput,
  UpdateTransactionInput,
} from "@/features/transactions/server/validation"
import {
  useCreateTransaction,
  useUpdateTransaction,
} from "@/features/transactions/hooks/use-transactions"

/**
 * Add/edit transaction dialog — one component, two modes (mirrors the
 * add/edit dialog pattern established elsewhere in the app, e.g. the
 * sign-in/sign-up tabs in app/(auth)/login/page.tsx's use of react-hook-form
 * + zodResolver + components/ui/form.tsx). `transaction` present = edit
 * mode; `null`/`undefined` = create mode.
 *
 * Tags are only editable in edit mode: `CreateTransactionSchema`
 * (server/validation.ts) has no `tags` field at all — a transaction's tags
 * can only be set via `updateTransaction`, per that schema's design. Rather
 * than send a `tags` value `createTransaction` would silently ignore, the
 * tags field is simply not rendered in create mode.
 *
 * Sign convention (docs/product/accounts.md via prisma/schema.prisma's
 * comment on Transaction.amount: "positive = income/credit, negative =
 * expense/debit"): the form collects an unsigned magnitude plus an
 * Income/Expense selector rather than asking the user to type a signed
 * number directly, since a bare amount field's sign is easy to get backwards.
 */

const NONE_CATEGORY_VALUE = "__none__"

const TransactionFormSchema = z.object({
  date: z.string().min(1, "Date is required"),
  merchant: z
    .string()
    .trim()
    .min(1, "Merchant is required")
    .max(200, "Merchant must be 200 characters or fewer"),
  amountType: z.enum(["expense", "income"]),
  // Deliberately `z.number()`, not `z.coerce.number()`: coercion makes this
  // field's Zod *input* type `unknown`, which conflicts with
  // `useForm<TransactionFormValues>`'s single (output) type parameter under
  // zod 4 + @hookform/resolvers — see the amount `<Input>`'s
  // `onChange={(e) => field.onChange(e.target.valueAsNumber)}` below, which
  // does the string -> number conversion itself so this schema never needs
  // to. `z.number()` also correctly rejects `NaN` (what `valueAsNumber` is
  // when the field is empty/invalid), which reads as "Amount must be a
  // number" — the validation message a blank field should show anyway.
  amountValue: z
    .number({ error: "Amount must be a number" })
    .finite("Amount must be a finite number")
    .min(0, "Amount must be zero or greater")
    .refine(
      (value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6,
      "Amount supports at most 2 decimal places",
    ),
  accountId: z.string().min(1, "Account is required"),
  categoryId: z.string(),
  notes: z.string().max(1000, "Notes must be 1000 characters or fewer").optional(),
  tags: z.string().optional(),
})

type TransactionFormValues = z.infer<typeof TransactionFormSchema>

export interface TransactionFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present = edit mode, null/undefined = create mode. */
  transaction?: Transaction | null
  /** Non-archived accounts only — see the caller (transactions-client.tsx),
   * which sources this from `useAccounts()`'s default (non-archived) list. */
  accounts: Account[]
  categories: Category[]
}

/** `Transaction.date` arrives as a UTC-midnight `Date` (or, once it has
 * crossed a JSON API boundary, an ISO date-time string) — this always
 * normalizes to the `"yyyy-mm-dd"` shape an `<input type="date">` needs,
 * matching the same UTC-calendar-date convention `server/validation.ts`'s
 * `toUtcDateOnly` uses. */
function toDateInputValue(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date
  return value.toISOString().slice(0, 10)
}

function buildDefaultValues(
  transaction: Transaction | null | undefined,
  accounts: Account[],
): TransactionFormValues {
  if (!transaction) {
    return {
      date: toDateInputValue(new Date()),
      merchant: "",
      amountType: "expense",
      amountValue: 0,
      accountId: accounts[0]?.id ?? "",
      categoryId: NONE_CATEGORY_VALUE,
      notes: "",
      tags: "",
    }
  }
  return {
    date: toDateInputValue(transaction.date),
    merchant: transaction.merchant,
    amountType: transaction.amount < 0 ? "expense" : "income",
    amountValue: Math.abs(transaction.amount),
    accountId: transaction.accountId,
    categoryId: transaction.categoryId ?? NONE_CATEGORY_VALUE,
    notes: transaction.notes ?? "",
    tags: transaction.tags.map((tag) => tag.name).join(", "),
  }
}

export function TransactionForm({
  open,
  onOpenChange,
  transaction,
  accounts,
  categories,
}: TransactionFormProps) {
  const isEditMode = !!transaction
  const createTransaction = useCreateTransaction()
  const updateTransaction = useUpdateTransaction()
  const [formError, setFormError] = React.useState<string | null>(null)

  const defaultValues = React.useMemo(
    () => buildDefaultValues(transaction, accounts),
    [transaction, accounts],
  )

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(TransactionFormSchema),
    defaultValues,
  })

  // react-hook-form only applies `defaultValues` on first mount — this
  // dialog is a single long-lived instance reused for every add/edit, so it
  // must be explicitly reset whenever it opens (or the transaction being
  // edited changes) to avoid showing stale values from the previous open.
  React.useEffect(() => {
    if (open) {
      form.reset(defaultValues)
      setFormError(null)
    }
  }, [open, defaultValues, form])

  async function onSubmit(values: TransactionFormValues) {
    setFormError(null)
    const amount =
      values.amountType === "expense" ? -Math.abs(values.amountValue) : Math.abs(values.amountValue)
    const categoryId = values.categoryId === NONE_CATEGORY_VALUE ? "" : values.categoryId

    try {
      if (isEditMode && transaction) {
        const tags = (values.tags ?? "")
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)

        // `UpdateTransactionInput` (server/validation.ts's
        // `UpdateTransactionSchema` post-parse type) types `date` as `Date`
        // — the *output* of that schema's `dateOnlySchema.transform(...)`.
        // But `updateTransaction(input: unknown)` re-parses this value from
        // scratch at runtime and expects the pre-parse `"yyyy-mm-dd"`
        // string (same shape `TransactionFilterSchema`'s `dateFrom`/`dateTo`
        // accept) — passing an actual `Date` object would fail that
        // server-side `z.string()` check. This cast bridges that gap; see
        // the identical note on the create call below.
        const payload = {
          id: transaction.id,
          date: values.date,
          merchant: values.merchant,
          amount,
          accountId: values.accountId,
          categoryId,
          notes: values.notes ?? "",
          tags,
        } as unknown as UpdateTransactionInput

        await updateTransaction.mutateAsync(payload)
        toast.success(`Updated "${values.merchant}".`)
      } else {
        const payload = {
          date: values.date,
          merchant: values.merchant,
          amount,
          accountId: values.accountId,
          categoryId,
          notes: values.notes ?? "",
        } as unknown as CreateTransactionInput

        await createTransaction.mutateAsync(payload)
        toast.success(`Added "${values.merchant}".`)
      }
      onOpenChange(false)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save transaction.")
    }
  }

  const isSubmitting = createTransaction.isPending || updateTransaction.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit transaction" : "Add transaction"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update this transaction's details."
              : "Log a new transaction against one of your accounts."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
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
              <FormField
                control={form.control}
                name="accountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select an account" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="merchant"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Merchant</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Trader Joe's" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="amountType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="expense">Expense</SelectItem>
                        <SelectItem value="income">Income</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="amountValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
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
            </div>
            <FormDescription className="-mt-2">
              Expenses are stored as negative amounts, income as positive.
            </FormDescription>

            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="No category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE_CATEGORY_VALUE}>No category</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
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
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <textarea
                      {...field}
                      rows={2}
                      placeholder="Optional notes"
                      className="min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isEditMode && (
              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tags</FormLabel>
                    <FormControl>
                      <Input placeholder="coffee, work, family" {...field} />
                    </FormControl>
                    <FormDescription>
                      Comma-separated. A tag typed for the first time is created automatically.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : isEditMode ? "Save changes" : "Add transaction"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
