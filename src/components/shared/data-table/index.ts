/**
 * Barrel export for the generic DataTable module.
 *
 * Usage:
 * ```tsx
 * import { DataTable, DataTableColumnHeader } from "@/components/shared/data-table"
 * ```
 */

export { DataTable, type DataTableProps } from "./data-table"
export {
  DataTableColumnHeader,
  type DataTableColumnHeaderProps,
} from "./data-table-column-header"
export {
  DataTablePagination,
  type DataTablePaginationProps,
} from "./data-table-pagination"
// Phase 5a (docs/architecture/phase-5a-technical-design.md §3.1) — the
// card-list mobile treatment primitive and its responsive composition with
// DataTable above.
export {
  DataTableCardList,
  type DataTableCardListProps,
  type CardDisplayPriority,
} from "./data-table-card-list"
export {
  ResponsiveDataTable,
  type ResponsiveDataTableProps,
} from "./responsive-data-table"
