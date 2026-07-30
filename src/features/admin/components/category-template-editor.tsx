"use client"

/**
 * CategoryTemplateEditor — Manage Categories, the starter template (admin.md
 * Capability 5). Structurally mirrors `CategoryManagerDialog`
 * (`features/transactions/components/category-manager-dialog.tsx`, Phase
 * 1's per-user custom-category editor) — same add-row form + editable-list
 * shape — but is NOT that component reused: this edits the global
 * `SystemCategoryTemplate` table via Admin's own gated Server Actions
 * (`features/admin/server/actions.ts`), never a user's own `Category` rows,
 * per Capability 5's explicit "never touches an already-seeded user's
 * categories" disambiguation.
 *
 * Reorder (AC4) is "Move up"/"Move down" buttons, not drag-and-drop — an
 * "equivalent explicit action" per AC4's own wording, chosen over pulling in
 * a new drag-and-drop dependency for a five-to-fifteen-row admin-only list.
 *
 * AC6's "never zero entries" guard is enforced twice, deliberately: here in
 * the UI (the last remaining row's delete control is disabled with an
 * explanation, per the dispatch note "not just rely on the server
 * rejecting it") AND server-side
 * (`features/categories/server/template.ts`'s `CategoryTemplateWouldBeEmptyError`,
 * surfaced via `deleteCategoryTemplateEntry`'s `ApiResult` failure as a
 * defense-in-depth backstop this component still displays via `toast.error`
 * if it's ever somehow reached).
 *
 * No local copy of `initialEntries` is held in state — every mutation below
 * calls `router.refresh()` on success, which re-runs `app/admin/categories/
 * page.tsx`'s Server Component read and passes fresh props straight back
 * down, the same "Server Action + router.refresh(), no dedicated hook"
 * pattern as `CategoryManagerDialog`'s own `onCategoriesChanged`.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { SystemCategoryTemplateEntry } from "@/features/categories/server/template"
import {
  createCategoryTemplateEntry,
  deleteCategoryTemplateEntry,
  reorderCategoryTemplateEntries,
  updateCategoryTemplateEntry,
} from "@/features/admin/server/actions"

const DEFAULT_NEW_ENTRY_COLOR = "#94a3b8"

interface TemplateEntryRowProps {
  entry: SystemCategoryTemplateEntry
  isOnly: boolean
  isFirst: boolean
  isLast: boolean
  isMoving: boolean
  onMove: (direction: "up" | "down") => void
  onChanged: () => void
}

function TemplateEntryRow({
  entry,
  isOnly,
  isFirst,
  isLast,
  isMoving,
  onMove,
  onChanged,
}: TemplateEntryRowProps) {
  const [name, setName] = React.useState(entry.name)
  const [color, setColor] = React.useState(entry.color)
  const [isSaving, setIsSaving] = React.useState(false)
  const [isConfirmingDelete, setIsConfirmingDelete] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)

  React.useEffect(() => {
    setName(entry.name)
    setColor(entry.color)
  }, [entry.name, entry.color])

  const isDirty = name !== entry.name || color !== entry.color

  async function handleSave() {
    setIsSaving(true)
    try {
      const result = await updateCategoryTemplateEntry({ id: entry.id, name, color })
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
      const result = await deleteCategoryTemplateEntry({ id: entry.id })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`Removed "${entry.name}" from the starter-category template.`)
      onChanged()
    } finally {
      setIsDeleting(false)
      setIsConfirmingDelete(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 border-b px-3 py-2.5 last:border-0">
      <div className="flex items-center gap-2">
        <div className="flex flex-col">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Move ${entry.name} up`}
            disabled={isFirst || isMoving}
            onClick={() => onMove("up")}
          >
            <ArrowUp className="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Move ${entry.name} down`}
            disabled={isLast || isMoving}
            onClick={() => onMove("down")}
          >
            <ArrowDown className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
        <input
          type="color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
          className="size-7 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5"
          aria-label={`Color for ${entry.name}`}
        />
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-7 flex-1"
          maxLength={50}
          aria-label={`Name for ${entry.name}`}
        />
        {isDirty && (
          <Button type="button" size="sm" variant="outline" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        )}
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`Remove ${entry.name}`}
          title={
            isOnly
              ? "The starter-category template must always have at least one entry."
              : `Remove ${entry.name}`
          }
          disabled={isOnly}
          onClick={() => setIsConfirmingDelete(true)}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {isOnly && (
        <p className="pl-8 text-xs text-muted-foreground">
          This is the last entry — the template can never be reduced to zero entries.
        </p>
      )}

      {isConfirmingDelete && (
        <div className="ml-8 flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-2 text-xs">
          <span>Remove &quot;{entry.name}&quot; from the starter-category template?</span>
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
              {isDeleting ? "Removing..." : "Confirm remove"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export interface CategoryTemplateEditorProps {
  initialEntries: SystemCategoryTemplateEntry[]
}

export function CategoryTemplateEditor({ initialEntries }: CategoryTemplateEditorProps) {
  const router = useRouter()
  const [newName, setNewName] = React.useState("")
  const [newColor, setNewColor] = React.useState(DEFAULT_NEW_ENTRY_COLOR)
  const [isCreating, setIsCreating] = React.useState(false)
  const [movingId, setMovingId] = React.useState<string | null>(null)

  // Server-Component-sourced (see this file's header JSDoc) — never copied
  // into local state, so a `router.refresh()` after any mutation is the only
  // thing that ever changes what's rendered here.
  const entries = initialEntries

  function handleChanged() {
    router.refresh()
  }

  async function handleCreate() {
    const trimmedName = newName.trim()
    if (!trimmedName) return
    setIsCreating(true)
    try {
      const result = await createCategoryTemplateEntry({ name: trimmedName, color: newColor })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`Added "${result.data.name}" to the starter-category template.`)
      setNewName("")
      setNewColor(DEFAULT_NEW_ENTRY_COLOR)
      handleChanged()
    } finally {
      setIsCreating(false)
    }
  }

  async function handleMove(entryId: string, direction: "up" | "down") {
    const index = entries.findIndex((entry) => entry.id === entryId)
    const swapIndex = direction === "up" ? index - 1 : index + 1
    if (index === -1 || swapIndex < 0 || swapIndex >= entries.length) return

    const reordered = [...entries]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(swapIndex, 0, moved)

    setMovingId(entryId)
    try {
      const result = await reorderCategoryTemplateEntries({
        orderedIds: reordered.map((entry) => entry.id),
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      handleChanged()
    } finally {
      setMovingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Every new signup is seeded with a copy of this list. Changes here only affect signups from
        this point forward — an existing user&apos;s already-seeded categories (including ones
        they&apos;ve since renamed, recolored, or deleted) are never touched.
      </div>

      <div className="flex items-end gap-2">
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="new-template-entry-name">New starter category</Label>
          <Input
            id="new-template-entry-name"
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
          aria-label="Color for new starter category"
        />
        <Button type="button" onClick={handleCreate} disabled={isCreating || !newName.trim()}>
          {isCreating ? "Adding..." : "Add"}
        </Button>
      </div>

      <div className="flex flex-col rounded-lg border">
        {entries.map((entry, index) => (
          <TemplateEntryRow
            key={entry.id}
            entry={entry}
            isOnly={entries.length === 1}
            isFirst={index === 0}
            isLast={index === entries.length - 1}
            isMoving={movingId === entry.id}
            onMove={(direction) => handleMove(entry.id, direction)}
            onChanged={handleChanged}
          />
        ))}
      </div>
    </div>
  )
}
