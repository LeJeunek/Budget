import { getSystemCategoryTemplate } from "@/features/categories/server/template"
import { CategoryTemplateEditor } from "@/features/admin/components/category-template-editor"

/**
 * Manage Categories — the starter template (admin.md Capability 5). A
 * Server Component: reads `getSystemCategoryTemplate()`
 * (`features/categories/server/template.ts` — Categories, not Admin, owns
 * this table; see that file's own doc comment) directly, no Route Handler.
 *
 * Deliberately NOT nested under `/settings/` or `/categories/`, per
 * phase-4c-technical-design.md §7.2: this edits a global template, not a
 * per-user resource — living under `/admin/` keeps that distinction
 * structurally unambiguous, and this page never links to or touches Phase
 * 1's existing per-user Categories CRUD dialog.
 */
export default async function AdminCategoriesPage() {
  const entries = await getSystemCategoryTemplate()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">Manage Categories</h1>
        <p className="text-sm text-muted-foreground">
          The starter-category template every new signup is seeded with — add, edit, reorder, or
          remove entries.
        </p>
      </div>

      <CategoryTemplateEditor initialEntries={entries} />
    </div>
  )
}
