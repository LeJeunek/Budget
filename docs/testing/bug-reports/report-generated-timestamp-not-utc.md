# Report PDF's "Generated" timestamp is formatted in the server process's local timezone, not UTC

**Severity:** Medium — deterministic given a non-UTC server process timezone; silently produces a wrong *calendar date* (not just a wrong clock hour) the moment that assumption doesn't hold.

**Component:** `src/features/reports/pdf/document-shell.tsx` — `GENERATED_AT_FORMATTER` (around lines 81-94), call site around line 112.

## Summary

`GENERATED_AT_FORMATTER`'s own doc comment claims it matches "this codebase's established UTC-calendar-date display convention (`lib/utils.ts`'s `formatDate`)," but unlike every sibling formatter in this exact feature (`server/period.ts`'s `MONTH_NAME_FORMATTER`/`DATE_LABEL_FORMATTER`, both of which set `timeZone: "UTC"`) and unlike `lib/utils.ts`'s `formatDate` itself (which explicitly sets `timeZone: "UTC"`), `GENERATED_AT_FORMATTER` never sets `timeZone` at all. Without it, `Intl.DateTimeFormat` falls back to the Node process's local/default timezone, so the same `generatedAt` instant renders a different calendar date depending purely on server deployment configuration.

## Reproduction

Direct reproduction of `GENERATED_AT_FORMATTER`'s exact `Intl.DateTimeFormat` config against a UTC-day-boundary instant:

```
$ node -e "
const generatedAt = '2026-07-28T02:30:00.000Z';
const fmt = new Intl.DateTimeFormat('en-US', { year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short' });
console.log(fmt.format(new Date(generatedAt)));
"
Jul 27, 2026, 9:30 PM CDT
```

The formatter (run with this machine's default `America/Chicago` process timezone) renders **Jul 27** for an instant that is `2026-07-28` in UTC — a full calendar day off from the UTC date every other part of the same report (period boundaries, filename) is computed against. Changing the process's `TZ` env var reproduces a different, equally wrong, calendar date each time — confirming the output is a function of server deployment configuration, not of the instant being formatted.

## Steps to Reproduce in the App

1. Deploy/run the app on a server process whose local timezone isn't UTC (the Node default on most non-container hosts, and even some container setups, unless `TZ=UTC` is explicitly set).
2. Generate any report close to a UTC day boundary (e.g. between 00:00 and the process's local midnight offset from UTC).
3. Observe the PDF's "Generated" line shows the previous (or next) calendar day relative to the UTC instant `generatedAt` actually holds — inconsistent with every other UTC-anchored date in the same document (period label, filename).

## Expected Behavior

`GENERATED_AT_FORMATTER` should pin `timeZone: "UTC"`, matching its own doc comment's claim and every sibling formatter in this feature (`server/period.ts`) and in `lib/utils.ts`.

## Actual Behavior

`timeZone` is omitted from `GENERATED_AT_FORMATTER`'s options, so the formatter silently uses the server process's local timezone, contradicting its own doc comment and this codebase's established UTC-calendar-date convention.

## Suggested Fix

Add `timeZone: "UTC"` to `GENERATED_AT_FORMATTER`'s `Intl.DateTimeFormat` options in `src/features/reports/pdf/document-shell.tsx` (lines 87-94), matching `server/period.ts`'s existing formatters.

## Suggested Owner

Backend Engineer / owner of `src/features/reports/pdf/document-shell.tsx`.
