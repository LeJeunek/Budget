import { createHmac, timingSafeEqual } from "node:crypto"

import { NotificationType } from "@prisma/client"
import { z } from "zod"

/**
 * One-click email-unsubscribe token: mints/verifies a signed
 * `{ userId, type }` pair, per docs/architecture/phase-4b-technical-design.md
 * §5. THE ONLY file that signs or verifies this token — every other file
 * (`features/notifications/server/email-dispatch.ts` to mint,
 * `app/api/notifications/unsubscribe/route.ts` to verify) calls through
 * here, never re-implements the HMAC logic itself.
 *
 * Signed with the dedicated `EMAIL_UNSUBSCRIBE_SECRET` env var — deliberately
 * NOT `BETTER_AUTH_SECRET` (see `.env.example`'s matching comment: rotating
 * one must never require rotating the other).
 *
 * This is the ONLY credential `GET /api/notifications/unsubscribe` accepts —
 * no session, no other identifier — and it is cryptographically bound to
 * exactly one `(userId, type)` pair at generation time (§5's own
 * cross-user-leakage reasoning: a tampered/guessed token fails signature
 * verification and is rejected outright; there is no way to construct a
 * token that resolves to a different `userId`/`type` than the one it was
 * signed for).
 */

const TOKEN_PAYLOAD_SEPARATOR = "."

export interface UnsubscribeTokenPayload {
  userId: string
  type: NotificationType
}

const UnsubscribeTokenPayloadSchema = z.object({
  userId: z.string().min(1),
  type: z.nativeEnum(NotificationType),
})

/** Reads the signing secret at call time (not module load time) so a test
 * environment or a not-yet-configured dev environment doesn't crash on
 * import — mirrors `lib/auth.ts`'s own lazy `process.env` reads. Throws only
 * when actually asked to sign/verify a token without one configured. */
function getSigningSecret(): string {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET
  if (!secret) {
    throw new Error("EMAIL_UNSUBSCRIBE_SECRET is not configured")
  }
  return secret
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", getSigningSecret()).update(encodedPayload).digest("hex")
}

/**
 * Mints a signed unsubscribe token for exactly one `(userId, type)` pair —
 * called once per notification email send, by `email-dispatch.ts`, and
 * embedded in that email's one-click unsubscribe link.
 */
export function generateUnsubscribeToken(payload: UnsubscribeTokenPayload): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url")
  const signature = sign(encodedPayload)
  return `${encodedPayload}${TOKEN_PAYLOAD_SEPARATOR}${signature}`
}

/**
 * Verifies a token minted by `generateUnsubscribeToken`, returning the
 * `{ userId, type }` it was signed for — or `null` for a malformed token, an
 * invalid/tampered signature, or a payload that doesn't decode to the
 * expected shape. Signature comparison uses `timingSafeEqual` (not `===`) to
 * avoid a timing side-channel on the comparison itself, the standard
 * defense for any HMAC-verification code path.
 */
export function verifyUnsubscribeToken(token: string): UnsubscribeTokenPayload | null {
  const separatorIndex = token.indexOf(TOKEN_PAYLOAD_SEPARATOR)
  if (separatorIndex === -1) {
    return null
  }

  const encodedPayload = token.slice(0, separatorIndex)
  const providedSignature = token.slice(separatorIndex + 1)
  if (!encodedPayload || !providedSignature) {
    return null
  }

  const expectedSignature = sign(encodedPayload)
  const providedBuffer = Buffer.from(providedSignature, "utf-8")
  const expectedBuffer = Buffer.from(expectedSignature, "utf-8")
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null
  }

  try {
    const decoded = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf-8"))
    const parsed = UnsubscribeTokenPayloadSchema.safeParse(decoded)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
