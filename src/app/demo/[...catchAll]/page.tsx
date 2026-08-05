import { notFound } from "next/navigation"

/**
 * Catch-all for any `/demo/*` path that isn't one of the ten in-scope routes
 * — e.g. `/demo/bills`, a mistyped detail id's parent segment, or a random
 * deep path — per docs/architecture/public-demo-technical-design.md §1 and
 * public-demo.md Capability 5's Edge Case. Unconditionally calls `notFound()`
 * so Next.js renders `src/app/demo/not-found.tsx` within this layout's own
 * nav/banner chrome, never a hard crash and never a silent fall-through to
 * the real, authenticated app.
 */
export default function DemoCatchAllPage() {
  notFound()
}
