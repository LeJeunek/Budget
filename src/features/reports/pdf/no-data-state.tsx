import { StyleSheet, Text, View } from "@react-pdf/renderer"

/**
 * `<NoDataState>` — the one shared "no data for this period" / "this section
 * doesn't apply" renderer, per phase-4b-technical-design.md §3's module doc:
 * "reports.md's Edge Cases, applied identically across all six report
 * types — one component, not six independent empty-state strings."
 *
 * Every report-specific empty-state message (reports.md's own, per-type
 * wording — e.g. "No debts tracked," "no financial activity was recorded
 * this month") is supplied by the calling template as plain text, never
 * hard-coded here — this component only owns the *rendering*, never the
 * message content, so each template stays the single source of truth for
 * its own spec-mandated wording.
 */

const styles = StyleSheet.create({
  container: { paddingVertical: 4, paddingBottom: 8 },
  text: { fontSize: 9, color: "#666666" },
})

interface NoDataStateProps {
  message: string
}

export function NoDataState({ message }: NoDataStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{message}</Text>
    </View>
  )
}
