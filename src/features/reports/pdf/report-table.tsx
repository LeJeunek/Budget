import { StyleSheet, Text, View } from "@react-pdf/renderer"

/**
 * `<ReportTable>` — the one shared, reusable table primitive every one of
 * the six templates composes (phase-4b-technical-design.md §3, §2's own
 * "avoid duplication" rationale for choosing `@react-pdf/renderer` in the
 * first place: "`<ReportTable>` ... shared across all six templates").
 *
 * **Risk #23's mitigation, applied here:** every row is rendered with
 * `wrap={false}` (a single row's cells can never be split across a page
 * break, avoiding a silently-truncated-looking row), while the table's own
 * outer `View` allows wrapping so a long list (Largest Purchases, Top
 * Merchants, a full year's monthly trend) flows onto additional pages
 * instead of being cut off. The one known limitation this does **not**
 * solve (documented, not silently accepted): the header row is not
 * re-rendered atop each subsequent page a table spans — `@react-pdf/renderer`
 * has no built-in "repeat table header on page break" primitive the way an
 * HTML `<thead>` would provide. This is a cosmetic gap (every data row is
 * still fully present, nothing is truncated), flagged here for the
 * Bug Hunter/Performance Engineer's Risk #23 review rather than silently
 * left undocumented.
 */

export interface ReportTableColumn<Row> {
  key: string
  header: string
  /** Column width as a percentage of the table's total width; columns
   * default to an even split when omitted. */
  width?: number
  align?: "left" | "right" | "center"
  /** `index` is the row's position within `rows` — needed by any column
   * whose value depends on more than just its own row (e.g. a running/
   * cumulative total computed alongside `rows` rather than stored on each
   * row itself, per `pdf/templates/cash-flow.tsx`'s "Cumulative" column). */
  render: (row: Row, index: number) => string
}

interface ReportTableProps<Row> {
  columns: ReportTableColumn<Row>[]
  rows: Row[]
}

const styles = StyleSheet.create({
  table: { width: "100%", marginBottom: 4 },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
    borderBottomStyle: "solid",
    paddingBottom: 4,
    marginBottom: 2,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#dddddd",
    borderBottomStyle: "solid",
    paddingVertical: 3,
  },
  headerCell: { fontSize: 9, fontWeight: 700, color: "#333333", paddingRight: 4 },
  cell: { fontSize: 9, color: "#1a1a1a", paddingRight: 4 },
})

export function ReportTable<Row>({ columns, rows }: ReportTableProps<Row>) {
  const evenWidth = 100 / columns.length

  return (
    <View style={styles.table} wrap>
      <View style={styles.headerRow}>
        {columns.map((column) => (
          <Text
            key={column.key}
            style={[
              styles.headerCell,
              { width: `${column.width ?? evenWidth}%`, textAlign: column.align ?? "left" },
            ]}
          >
            {column.header}
          </Text>
        ))}
      </View>

      {rows.map((row, index) => (
        <View key={index} style={styles.row} wrap={false}>
          {columns.map((column) => (
            <Text
              key={column.key}
              style={[
                styles.cell,
                { width: `${column.width ?? evenWidth}%`, textAlign: column.align ?? "left" },
              ]}
            >
              {column.render(row, index)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  )
}
