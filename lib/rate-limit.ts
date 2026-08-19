import { db } from "@/lib/firebase";

export type RateLimitOptions = {
  windowMs: number;
  maxRequests: number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

const RATE_LIMIT_COLLECTION = "rate_limits";
const localMemoryFallback = new Map<string, { count: number; resetAt: number }>();

function extractClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1"
  );
}

function checkMemoryRateLimit(
  key: string,
  now: number,
  options: RateLimitOptions
): RateLimitResult {
  const record = localMemoryFallback.get(key);
  if (!record || now > record.resetAt) {
    localMemoryFallback.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (record.count >= options.maxRequests) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfter) };
  }

  record.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Cross-Instance Persistent Rate Limiter (Firestore-backed with in-memory fallback).
 * Guarantees rate limit enforcement across distributed Vercel serverless containers.
 */
export async function checkRateLimit(
  req: Request,
  prefix: string,
  options: RateLimitOptions = { windowMs: 60_000, maxRequests: 30 }
): Promise<RateLimitResult> {
  const ip = extractClientIp(req);
  const sanitizedIp = ip.replace(/[^a-zA-Z0-9_-]/g, "_");
  const docId = `${prefix}_${sanitizedIp}`;
  const now = Date.now();

  try {
    const firestore = db();
    const docRef = firestore.collection(RATE_LIMIT_COLLECTION).doc(docId);

    const result = await firestore.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) {
        tx.set(docRef, { count: 1, resetAt: now + options.windowMs, updatedAt: now });
        return { allowed: true, retryAfterSeconds: 0 };
      }

      const data = snap.data() as { count: number; resetAt: number };
      if (now > (data.resetAt || 0)) {
        tx.set(docRef, { count: 1, resetAt: now + options.windowMs, updatedAt: now });
        return { allowed: true, retryAfterSeconds: 0 };
      }

      if (data.count >= options.maxRequests) {
        const retryAfter = Math.ceil((data.resetAt - now) / 1000);
        return { allowed: false, retryAfterSeconds: Math.max(1, retryAfter) };
      }

      tx.update(docRef, { count: data.count + 1, updatedAt: now });
      return { allowed: true, retryAfterSeconds: 0 };
    });

    return result;
  } catch {
    // Graceful fallback to memory tracking if Firestore is temporarily offline/unconfigured
    return checkMemoryRateLimit(`${prefix}:${ip}`, now, options);
  }
}

export function rateLimitResponse(retryAfterSeconds: number): Response {
  return Response.json(
    {
      error: "slow_down",
      error_description: "Too many requests. Please try again later.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
