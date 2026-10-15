import crypto from "crypto";

function getMasterTokenSecret(): string {
  const secret = process.env.ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FATAL: ENCRYPTION_KEY or NEXTAUTH_SECRET is required to sign and verify Master Auth Tokens in production."
    );
  }
  // Local development / testing fallback only
  return "kankali-dev-only-secret-do-not-use-in-production-32b!";
}

/**
 * Creates a stateless signed Master Auth Token with an explicit expiration timestamp.
 * Format: <expiresAtEpochMs>.<b64Payload>.<hmacSha256Signature>
 */
export function createMasterToken(uid: string, expiresInDays = 30): string {
  const expiresAt = Date.now() + expiresInDays * 24 * 60 * 60 * 1000;
  const payload = `${uid}:${expiresAt}`;
  const b64 = Buffer.from(payload, "utf8").toString("base64url");
  const hmac = crypto
    .createHmac("sha256", getMasterTokenSecret())
    .update(`${expiresAt}.${b64}`)
    .digest("hex");

  return `km_${expiresAt}.${b64}.${hmac}`;
}

/**
 * Verifies a signed Master Auth Token.
 * Returns the authenticated user's uid if valid and not expired; otherwise null.
 */
export function verifyMasterToken(token: string): { valid: boolean; uid?: string; error?: string } {
  if (!token || !token.startsWith("km_")) {
    return { valid: false, error: "Invalid token format." };
  }

  const raw = token.slice(3); // strip "km_"
  const parts = raw.split(".");
  if (parts.length !== 3) {
    return { valid: false, error: "Malformed token segments." };
  }

  const [expiresAtStr, b64, signature] = parts;
  const expiresAt = parseInt(expiresAtStr, 10);
  if (Number.isNaN(expiresAt)) {
    return { valid: false, error: "Invalid expiration timestamp." };
  }

  if (Date.now() > expiresAt) {
    return { valid: false, error: "Master MCP token has expired." };
  }

  const candidateSecrets = [
    (() => {
      try {
        return getMasterTokenSecret();
      } catch {
        return null;
      }
    })(),
    process.env.ENCRYPTION_KEY,
    process.env.NEXTAUTH_SECRET,
    "kankali-master-auth-secret-key-32b!",
    "kankali-dev-only-secret-do-not-use-in-production-32b!",
  ].filter((s): s is string => Boolean(s));

  let isValid = false;
  for (const sec of candidateSecrets) {
    const expectedHmac = crypto
      .createHmac("sha256", sec)
      .update(`${expiresAt}.${b64}`)
      .digest("hex");

    if (
      signature.length === expectedHmac.length &&
      crypto.timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expectedHmac, "utf8"))
    ) {
      isValid = true;
      break;
    }
  }

  if (!isValid) {
    return { valid: false, error: "Invalid token signature." };
  }

  try {
    const decoded = Buffer.from(b64, "base64url").toString("utf8");
    const [uid] = decoded.split(":");
    if (!uid) return { valid: false, error: "No UID found in payload." };
    return { valid: true, uid };
  } catch {
    return { valid: false, error: "Payload decode failed." };
  }
}
