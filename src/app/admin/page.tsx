import { redirect } from "next/navigation"

/**
 * `/admin` has no content of its own — redirects to Users, the first
 * capability in admin.md's own ordering (phase-4c-technical-design.md §7.2:
 * "redirects to /admin/users (or a minimal landing summary — Frontend
 * Lead's call)"). `app/admin/layout.tsx`'s guard already ran before this
 * page renders, so this redirect never needs to re-check admin status
 * itself.
 */
export default function AdminIndexPage() {
  redirect("/admin/users")
}
