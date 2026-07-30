# Bug Report: `TimezoneSchema` accepts raw UTC-offset strings (e.g. `"+05:00"`) and non-canonical legacy aliases as "valid IANA timezone names" — exactly the input class the feature's own design explicitly rejects the offset-picker approach to avoid

## Severity
**Medium** — no crash, and the ordinary UI path (a fixed dropdown built from `Intl.supportedValuesOf("timeZone")`) can never actually submit one of these values today, so no real user is affected *yet*. It is Medium rather than Low because: (1) the Server Action is a public, directly-POSTable endpoint (`updateTimezone`, `captureInferredTimezone`) with no other gate in front of it, so this is a genuine, unauthenticated-input-shape defect in the validation layer itself, not a hypothetical; (2) it silently defeats the *specific, stated reason* customization.md gives for choosing an IANA-name dropdown over a raw-offset picker in the first place ("a raw UTC-offset number ... would silently break twice a year in regions observing daylight saving time"); and (3) `UserPreference.timezone` is explicitly scoped as groundwork for a future consuming-logic pass (customization.md's Timezone Preference Scope note) — any value that slips through today's validation is stored durably and will be fed straight into that future pass's date-boundary math without ever having been re-validated, silently reintroducing the exact DST bug the feature exists to close.

## Component
`src/features/settings/server/validation.ts` lines 94-114 (`isValidIanaTimezone`, `TimezoneSchema`)
`src/features/settings/server/actions.ts` lines 99-117, 136-153 (`updateTimezone`, `captureInferredTimezone` — both validate solely via `TimezoneSchema`/`UpdateTimezoneSchema`)

## Summary
`TimezoneSchema` validates a candidate timezone string by constructing `new Intl.DateTimeFormat(undefined, { timeZone: value }).resolvedOptions()` inside a try/catch and treating "does this throw?" as the entire validity check (lines 94-106). The file's own comment block (lines 78-93) explains this was a deliberate choice over `Intl.supportedValuesOf("timeZone")` set-membership, specifically because that stricter check rejects `"UTC"` (this schema's own documented safety-net default) on the project's actual Node/ICU build.

The problem is that `Intl.DateTimeFormat`'s constructor is *far* more permissive than "a valid IANA zone name" — per ECMA-402, the `timeZone` option also accepts (and successfully resolves) raw fixed UTC-offset strings and a number of legacy/non-canonical aliases that are not IANA names at all:

- `"+05:00"` and `"-08:00"` → both construct successfully; `resolvedOptions().timeZone` echoes the literal offset string back unchanged (confirmed on this project's actual Node v24 runtime).
- `"PST"`, `"US/Pacific"`, `"EST5EDT"` → construct successfully and silently canonicalize to a real IANA zone internally (e.g. `America/Los_Angeles`), but the schema stores whatever the caller *typed*, not the canonicalized value, so the raw legacy string itself ends up persisted.

A fixed offset string is precisely the input class customization.md's own Timezone Preference capability rejects by design ("the standard, unambiguous way to represent a user's local time including that region's own daylight-saving rules, rather than a raw UTC-offset number that would silently break twice a year in regions observing daylight saving time"). `isValidIanaTimezone`'s permissive check accepts it anyway, storing `"+05:00"` literally into `UserPreference.timezone` as if it were a fully valid, DST-aware preference.

The schema's own governing `prisma/schema.prisma` comment (`UserPreference.timezone`, lines 2269-2271) states the column is "app-validated against Node's own `Intl.supportedValuesOf("timeZone")`" — but the actual implementation deliberately does **not** do that (per its own header comment, precisely because that check rejects `"UTC"`), and the more permissive replacement it uses instead reopens the raw-offset/legacy-alias hole `supportedValuesOf` would have closed. The schema comment and the actual validation behavior have drifted apart.

## Reproduction Steps
1. In a Node REPL/script using this project's own `isValidIanaTimezone` logic (verified directly against the project's Node v24.14.0 runtime):
   ```js
   function isValidIanaTimezone(value) {
     try {
       new Intl.DateTimeFormat(undefined, { timeZone: value }).resolvedOptions();
       return true;
     } catch { return false; }
   }
   isValidIanaTimezone("+05:00")   // => true
   isValidIanaTimezone("-08:00")   // => true
   isValidIanaTimezone("PST")      // => true
   isValidIanaTimezone("US/Pacific") // => true
   isValidIanaTimezone("EST5EDT")  // => true
   ```
2. Equivalently, call `TimezoneSchema.safeParse("+05:00")` (or `UpdateTimezoneSchema.safeParse({ timezone: "+05:00" })`) directly — `.success` is `true`.
3. As a live repro against the running app: authenticate, then directly invoke the `updateTimezone` Server Action with `{ timezone: "+05:00" }` (bypassing `TimezoneSelect`'s UI, which only ever offers `Intl.supportedValuesOf("timeZone")` entries and could never produce this value itself — the point is that nothing stops a direct call, and Server Actions are POST endpoints reachable independent of the component that happens to render a `<button>` for them).
4. Observe: the action succeeds, `UserPreference.timezone` is persisted as the literal string `"+05:00"`, and `getUserPreference`/`TimezoneSelect` subsequently display "Currently set to +05:00" as if it were an ordinary, valid preference — no error, no rejection.

## Expected Behavior
`TimezoneSchema` should reject any input that is not an actual IANA Time Zone Database identifier — in particular, a raw fixed UTC-offset string (`"+05:00"`, `"-08:00"`) should never validate, since accepting one directly contradicts the product requirement (customization.md's Timezone Preference capability) that the field encode a *region's* DST rules, not a fixed offset. Legacy three-letter zone abbreviations and `Country/City`-style deprecated aliases that Intl silently canonicalizes to a real zone are a secondary, lower-stakes concern, but ideally the schema would also normalize/reject those rather than persist whatever non-canonical spelling the caller supplied.

## Actual Behavior
`isValidIanaTimezone` treats "`Intl.DateTimeFormat` didn't throw" as equivalent to "is a valid IANA timezone name," which is a strictly broader set that includes raw UTC offsets and several non-IANA legacy aliases. Any of these values pass `TimezoneSchema`/`UpdateTimezoneSchema` and get persisted verbatim to `UserPreference.timezone` via both `updateTimezone` and `captureInferredTimezone`, with no narrower allow-list (e.g. cross-checking against `Intl.supportedValuesOf("timeZone")`, which the schema's own `prisma/schema.prisma` comment claims is already happening) ever applied.

## Suggested Owner
Backend Engineer, `src/features/settings/server/validation.ts` (`isValidIanaTimezone`/`TimezoneSchema`) — the fix likely needs a narrower check than "does `Intl.DateTimeFormat` accept it," e.g. cross-referencing the resolved/canonical value against `Intl.supportedValuesOf("timeZone")` (with an explicit `"UTC"` carve-out preserved, since the file's own comment correctly identifies that `supportedValuesOf` excludes it on this runtime) rather than relying on `Intl.DateTimeFormat`'s deliberately lenient legacy-compatibility parsing.
