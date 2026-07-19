"use client"

import * as React from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Category } from "@/features/categories/types"
import {
  createCategory,
  deleteCategory,
  updateCategory,
} from "@/features/categories/server/actions"

/**
 * "Manage Categories" dialog — per the CTO's Phase 1 placement decision,
 * Categories has no dedicated nav route/page, so this is the only place a
 * user manages custom categories, reached from a button on the Transactions
 * page (see transactions-client.tsx).
 *
 * Categories has no client hook or REST list route (unlike Accounts/
 * Transactions) — `categories`/`categoryUsageCounts` are fetched by the
 * page's Server Component and passed down as props (see page.tsx's JSDoc).
 * `createCategory`/`updateCategory`/`deleteCategory` are Server Actions and
 * are called directly from this Client Component; each success calls
 * `onCategoriesChanged` (the caller's `router.refresh()`) so the
 * Server-Component-sourced `categories`/`categoryUsageCounts` props are
 * re-fetched and this dialog reflects the change immediately.
 */

const DEFAULT_NEW_CATEGORY_COLOR = "#94a3b8"

export interface CategoryManagerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
  /** Custom-category-id -> transaction count, precomputed server-side (see
   * page.tsx) — used for the "N transactions will become Uncategorized"
   * delete-confirmation copy. */
  categoryUsageCounts: Record<string, number>
  onCategoriesChanged: () => void
}

function CategoryRow({
  category,
  usageCount,
  onChanged,
}: {
  category: Category
  usageCount: number
  onChanged: () => void
}) {
  const [name, setName] = React.useState(category.name)
  const [color, setColor] = React.useState(category.color)
  const [isSaving, setIsSaving] = React.useState(false)
  const [isConfirmingDelete, setIsConfirmingDelete] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)

  React.useEffect(() => {
    setName(category.name)
    setColor(category.color)
  }, [category.name, category.color])

  const isDirty = name !== category.name || color !== category.color

  async function handleSave() {
    setIsSaving(true)
    try {
      const result = await updateCategory({
        id: category.id,
        // System categories' names are fixed — the rename input isn't even
        // rendered for them (see below), and only `color` is ever sent for
        // an isSystem category, matching `updateCategory`'s own "system
        // categories cannot be renamed" enforcement.
        ...(category.isSystem ? {} : { name }),
        color,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`Updated "${result.data.name}".`)
      onChanged()
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    setIsDeleting(true)
    try {
      const result = await deleteCategory({ id: category.id })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`Deleted "${category.name}".`)
      onChanged()
    } finally {
      setIsDeleting(false)
      setIsConfirmingDelete(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 border-b py-2.5 last:border-0">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
          className="size-7 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5"
          aria-label={`Color for ${category.name}`}
        />
        {category.isSystem ? (
          <span className="flex-1 text-sm font-medium">{category.name}</span>
        ) : (
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-7 flex-1"
            maxLength={50}
            aria-label={`Name for ${category.name}`}
          />
        )}
        {category.isSystem && <Badge variant="secondary">System</Badge>}
        {isDirty && (
          <Button type="button" size="sm" variant="outline" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        )}
        {!category.isSystem && (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Delete ${category.name}`}
            onClick={() => setIsConfirmingDelete(true)}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      {isConfirmingDelete && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-2 text-xs">
          <span>
            {usageCount > 0
              ? `${usageCount} transaction${usageCount === 1 ? "" : "s"} will become Uncategorized.`
              : "This category is not used by any transactions."}
          </span>
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => setIsConfirmingDelete(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="xs"
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Confirm delete"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function CategoryManagerDialog({
  open,
  onOpenChange,
  categories,
  categoryUsageCounts,
  onCategoriesChanged,
}: CategoryManagerDialogProps) {
  const [newName, setNewName] = React.useState("")
  const [newColor, setNewColor] = React.useState(DEFAULT_NEW_CATEGORY_COLOR)
  const [isCreating, setIsCreating] = React.useState(false)

  // Counts (and the category list itself) can go stale between page loads
  // — refresh on every open so a repeat visit sees up-to-date data without
  // requiring a full page reload.
  React.useEffect(() => {
    if (open) {
      onCategoriesChanged()
    }
  }, [open, onCategoriesChanged])

  async function handleCreate() {
    const trimmedName = newName.trim()
    if (!trimmedName) return
    setIsCreating(true)
    try {
      const result = await createCategory({ name: trimmedName, color: newColor })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`Added "${result.data.name}".`)
      setNewName("")
      setNewColor(DEFAULT_NEW_CATEGORY_COLOR)
      onCategoriesChanged()
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage categories</DialogTitle>
          <DialogDescription>
            Rename or recolor your custom categories. System categories&apos; names are fixed, but
            their color can still be changed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="new-category-name">New category</Label>
            <Input
              id="new-category-name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="e.g. Hobbies"
              maxLength={50}
            />
          </div>
          <input
            type="color"
            value={newColor}
            onChange={(event) => setNewColor(event.target.value)}
            className="size-8 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5"
            aria-label="Color for new category"
          />
          <Button type="button" onClick={handleCreate} disabled={isCreating || !newName.trim()}>
            {isCreating ? "Adding..." : "Add"}
          </Button>
        </div>

        <ScrollArea className="h-72 pr-2">
          {categories.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              usageCount={categoryUsageCounts[category.id] ?? 0}
              onChanged={onCategoriesChanged}
            />
          ))}
        </ScrollArea>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
