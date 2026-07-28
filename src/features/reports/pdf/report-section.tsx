import { StyleSheet, Text, View } from "@react-pdf/renderer"
import type { ReactNode } from "react"

/**
 * `<ReportSection>` — a titled block wrapping either a `<ReportTable>`, a
 * small figure list, or a `<NoDataState>`, per
 * phase-4b-technical-design.md §3's module doc.
 *
 * Deliberately does **not** set `wrap={false}` on itself (unlike
 * `<ReportTable>`'s own per-*row* `wrap={false}`) — a section containing a
 * long table (Largest Purchases, a full year's monthly trend) must be free
 * to flow across a page break; forcing an entire section onto a single page
 * would be exactly the kind of "silently truncated-looking" failure Risk
 * #23 warns against, not a fix for it.
 */

const styles = StyleSheet.create({
  section: { marginBottom: 14 },
  title: { fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#111111" },
})

interface ReportSectionProps {
  title: string
  children: ReactNode
}

export function ReportSection({ title, children }: ReportSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  )
}
