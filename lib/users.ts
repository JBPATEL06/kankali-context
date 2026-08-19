import bcrypt from "bcryptjs";
import { db, USERS } from "./firebase";
import { encrypt, decrypt, randomApiKey } from "./crypto";
import type { UserRecord, GithubConfig } from "@/types";

// High-performance User Caches for Serverless execution
const userCache = new Map<string, { user: UserRecord; expiresAt: number }>();
const keyCache = new Map<string, { user: UserRecord; expiresAt: number }>();

export function invalidateUserCache(uid?: string) {
  if (uid) {
    userCache.delete(uid);
  } else {
    userCache.clear();
    keyCache.clear();
  }
}

export async function getUser(uid: string): Promise<UserRecord | null> {
  const cached = userCache.get(uid);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.user;
  }

  const snap = await db().collection(USERS).doc(uid).get();
  if (!snap.exists) return null;
  const user = snap.data() as UserRecord;

  userCache.set(uid, { user, expiresAt: Date.now() + 60 * 1000 });
  if (user.mcpApiKey) {
    keyCache.set(user.mcpApiKey, { user, expiresAt: Date.now() + 60 * 1000 });
  }
  return user;
}

export async function getUserByMcpKey(apiKey: string): Promise<UserRecord | null> {
  const cached = keyCache.get(apiKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.user;
  }

  if (process.env.NODE_ENV === "development" && process.env.ENABLE_TEST_USERS === "true") {
    if (apiKey === "kk_test_user_alpha") {
      return {
        uid: "test_uid_alpha",
        email: "alpha@example.com",
        githubOwner: "UserAlpha",
        githubRepo: "alpha-context-repo",
        githubBranch: "main",
        githubTokenEnc: encrypt("mock_token_alpha"),
        mcpApiKey: "kk_test_user_alpha",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    if (apiKey === "kk_test_user_beta") {
      return {
        uid: "test_uid_beta",
        email: "beta@example.com",
        githubOwner: "UserBeta",
        githubRepo: "beta-context-repo",
        githubBranch: "main",
        githubTokenEnc: encrypt("mock_token_beta"),
        mcpApiKey: "kk_test_user_beta",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
  }
  const q = await db().collection(USERS).where("mcpApiKey", "==", apiKey).limit(1).get();
  if (q.empty) return null;
  const user = q.docs[0]!.data() as UserRecord;

  keyCache.set(apiKey, { user, expiresAt: Date.now() + 60 * 1000 });
  userCache.set(user.uid, { user, expiresAt: Date.now() + 60 * 1000 });
  return user;
}

const devUserStore = new Map<string, UserRecord>();

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const cleanEmail = email.trim().toLowerCase();
  if (process.env.NODE_ENV === "development" && process.env.ENABLE_TEST_USERS === "true") {
    if (devUserStore.has(cleanEmail)) {
      return devUserStore.get(cleanEmail)!;
    }
    return null;
  }

  // 1. Check lowercase match
  let q = await db().collection(USERS).where("email", "==", cleanEmail).limit(1).get();
  if (!q.empty) return q.docs[0]!.data() as UserRecord;

  // 2. Fallback check for raw email if different
  const rawEmail = email.trim();
  if (rawEmail !== cleanEmail) {
    q = await db().collection(USERS).where("email", "==", rawEmail).limit(1).get();
    if (!q.empty) return q.docs[0]!.data() as UserRecord;
  }

  return null;
}

export async function createUserWithPassword(params: {
  email: string;
  password: string;
  name?: string;
}): Promise<UserRecord> {
  const cleanEmail = params.email.trim().toLowerCase();
  const existing = await getUserByEmail(cleanEmail);
  if (existing) {
    throw new Error("An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(params.password, 12);
  const now = new Date().toISOString();
  const uid = `usr_${randomApiKey().slice(3, 19)}`;

  const record: UserRecord = {
    uid,
    email: cleanEmail,
    name: params.name?.trim() || cleanEmail.split("@")[0],
    passwordHash,
    authProviders: ["password"],
    emailVerified: false,
    mcpApiKey: randomApiKey(),
    createdAt: now,
    updatedAt: now,
  };

  if (process.env.NODE_ENV === "development" && process.env.ENABLE_TEST_USERS === "true") {
    devUserStore.set(cleanEmail, record);
    return record;
  }

  await db().collection(USERS).doc(uid).set(record);
  return record;
}

export async function verifyUserPassword(
  email: string,
  password: string
): Promise<UserRecord | null> {
  const user = await getUserByEmail(email);
  if (!user) {
    console.warn(`[kankali auth] No user record found for email: ${email}`);
    return null;
  }

  if (!user.passwordHash) {
    console.warn(`[kankali auth] User ${email} has no password hash (signed up via Google only).`);
    return null;
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    console.warn(`[kankali auth] Password comparison failed for: ${email}`);
    return null;
  }

  return user;
}

export async function upsertUserFromAuth(params: {
  uid: string;
  email: string;
  name?: string;
  refreshToken?: string;
}): Promise<UserRecord> {
  const cleanEmail = params.email.trim().toLowerCase();
  const ref = db().collection(USERS).doc(params.uid);
  const existing = await ref.get();
  const now = new Date().toISOString();

  let googleRefreshTokenEnc: string | undefined;
  if (params.refreshToken) {
    googleRefreshTokenEnc = encrypt(params.refreshToken);
  }

  if (existing.exists) {
    const data = existing.data() as UserRecord;
    const currentProviders = data.authProviders || [];
    const updatedProviders = currentProviders.includes("google")
      ? currentProviders
      : [...currentProviders, "google"];

    const updates: Partial<UserRecord> = {
      email: cleanEmail,
      name: params.name,
      authProviders: updatedProviders,
      emailVerified: true,
      updatedAt: now,
    };
    if (googleRefreshTokenEnc) {
      updates.googleRefreshTokenEnc = googleRefreshTokenEnc;
    }

    await ref.update(updates);
    return {
      ...data,
      ...updates,
    } as UserRecord;
  }

  const record: UserRecord = {
    uid: params.uid,
    email: cleanEmail,
    name: params.name,
    authProviders: ["google"],
    emailVerified: true,
    mcpApiKey: randomApiKey(),
    createdAt: now,
    updatedAt: now,
  };
  if (googleRefreshTokenEnc) {
    record.googleRefreshTokenEnc = googleRefreshTokenEnc;
  }
  await ref.set(record);
  return record;
}

export async function saveGithubSettings(
  uid: string,
  settings: {
    token: string;
    owner: string;
    repo: string;
    branch?: string;
    tokenExpiresAt?: string | null;
  }
): Promise<UserRecord> {
  const now = new Date().toISOString();
  const update = {
    githubTokenEnc: encrypt(settings.token),
    githubOwner: settings.owner.trim(),
    githubRepo: settings.repo.trim(),
    githubBranch: settings.branch?.trim() || "main",
    tokenExpiresAt: settings.tokenExpiresAt ?? null,
    expiryEmailSentAt: null, // reset so we can warn again for the new token
    updatedAt: now,
  };
  await db().collection(USERS).doc(uid).update(update);
  invalidateUserCache(uid);
  const user = await getUser(uid);
  return user!;
}

export async function rotateMcpKey(uid: string): Promise<string> {
  const key = randomApiKey();
  await db().collection(USERS).doc(uid).update({
    mcpApiKey: key,
    updatedAt: new Date().toISOString(),
  });
  invalidateUserCache(uid);
  return key;
}

/** Resolve GitHub credentials for an authenticated user (MCP path). */
export function resolveGithubConfig(user: UserRecord): GithubConfig | null {
  if (!user.githubTokenEnc || !user.githubOwner || !user.githubRepo) return null;
  try {
    return {
      token: decrypt(user.githubTokenEnc),
      owner: user.githubOwner,
      repo: user.githubRepo,
      branch: user.githubBranch || "main",
    };
  } catch {
    return null;
  }
}

/** Users whose token expires within `withinDays` and haven't been emailed recently. */
export async function listUsersNearingExpiry(withinDays = 7): Promise<UserRecord[]> {
  const now = new Date();
  const nowIso = now.toISOString();
  const cutoff = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);
  const cutoffIso = cutoff.toISOString();

  // Query only users whose tokens expire between now and cutoff window
  const snap = await db()
    .collection(USERS)
    .where("tokenExpiresAt", ">=", nowIso)
    .where("tokenExpiresAt", "<=", cutoffIso)
    .get();

  const nowMs = now.getTime();
  const results: UserRecord[] = [];
  for (const doc of snap.docs) {
    const u = doc.data() as UserRecord;
    if (u.expiryEmailSentAt) {
      const sent = Date.parse(u.expiryEmailSentAt);
      // don't re-send more than once per 3 days
      if (!Number.isNaN(sent) && nowMs - sent < 3 * 24 * 60 * 60 * 1000) continue;
    }
    results.push(u);
  }
  return results;
}

export async function markExpiryEmailSent(uid: string): Promise<void> {
  await db().collection(USERS).doc(uid).update({
    expiryEmailSentAt: new Date().toISOString(),
  });
}
