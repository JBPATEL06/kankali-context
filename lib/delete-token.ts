import { createHmac, timingSafeEqual } from "crypto";

export const DELETE_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getDeleteSecret(): string {
  return (
    process.env.JWT_SIGNING_SECRET ||
    process.env.ENCRYPTION_KEY ||
    process.env.NEXTAUTH_SECRET ||
    "kankali-delete-safety-secret"
  );
}

/**
 * Generate a stateless, HMAC-signed confirmation token for a two-step delete flow.
 */
export function createDeleteToken(path: string, uid = "global"): string {
  const expiresAt = Date.now() + DELETE_TOKEN_TTL_MS;
  const payload = `${path}:${uid}:${expiresAt}`;
  const hmac = createHmac("sha256", getDeleteSecret()).update(payload).digest("hex");
  const b64Payload = Buffer.from(payload, "utf8").toString("base64url");
  return `${expiresAt}.${b64Payload}.${hmac}`;
}

/**
 * Verify a confirmation token for deleting a specific path.
 */
export function verifyDeleteToken(
  token: string | undefined | null,
  expectedPath: string,
  expectedUid = "global"
): boolean {
  if (!token || typeof token !== "string") return false;

  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;

    const [expiresAtStr, b64Payload, signature] = parts;
    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt) || Date.now() > expiresAt) return false;

    const payload = Buffer.from(b64Payload, "base64url").toString("utf8");
    const [path, uid] = payload.split(":");
    if (path !== expectedPath) return false;
    if (expectedUid && uid !== expectedUid && uid !== "global") return false;

    const expectedHmac = createHmac("sha256", getDeleteSecret()).update(payload).digest("hex");
    if (signature.length !== expectedHmac.length) return false;

    return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedHmac));
  } catch {
    return false;
  }
}
