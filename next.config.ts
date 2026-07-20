import type { NextConfig } from "next";

/**
 * TEMPORARY diagnostic — remove once the Vercel build-time
 * `TypeError: Invalid URL` / `input: '[REDACTED]/api/auth'` crash is fixed.
 *
 * Vercel's build-log redaction replaces any substring matching a configured
 * env var's value with `[REDACTED]`, so logging the raw values themselves
 * is useless here — whatever is malformed would just get hidden again. This
 * instead reports facts *about* each candidate (length, whether it round-
 * trips through `new URL()`, stray whitespace/quote characters) without ever
 * printing the value, so the signal survives redaction.
 */
function describeUrlEnvVar(name: string) {
  const value = process.env[name];
  if (value === undefined) return `${name}: <unset>`;
  const parts = [`${name}: len=${value.length}`];
  parts.push(`startsQuote=${value.startsWith('"') || value.startsWith("'")}`);
  parts.push(`endsQuote=${value.endsWith('"') || value.endsWith("'")}`);
  parts.push(`hasNewline=${/[\r\n]/.test(value)}`);
  parts.push(`leadingWs=${/^\s/.test(value)}`);
  parts.push(`trailingWs=${/\s$/.test(value)}`);
  try {
    const u = new URL(value);
    parts.push(`parsesAsURL=true protocol=${u.protocol} hostLen=${u.host.length}`);
  } catch (error) {
    parts.push(`parsesAsURL=false (${(error as Error).message})`);
  }
  return parts.join(" ");
}

console.log("[diagnostic] " + describeUrlEnvVar("BETTER_AUTH_URL"));
console.log("[diagnostic] " + describeUrlEnvVar("NEXT_PUBLIC_BETTER_AUTH_URL"));
console.log("[diagnostic] " + describeUrlEnvVar("NEXT_PUBLIC_AUTH_URL"));
console.log("[diagnostic] " + describeUrlEnvVar("NEXTAUTH_URL"));
console.log(
  `[diagnostic] VERCEL_URL: len=${process.env.VERCEL_URL?.length ?? "<unset>"} ` +
    `startsHttp=${process.env.VERCEL_URL?.startsWith("http") ?? "n/a"}`,
);

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
