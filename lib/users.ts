import { db, USERS } from "./firebase";
import { encrypt, decrypt, randomApiKey } from "./crypto";
import type { UserRecord, GithubConfig } from "@/types";

export async function getUser(uid: string): Promise<UserRecord | null> {
  const snap = await db().collection(USERS).doc(uid).get();
  if (!snap.exists) return null;
  return snap.data() as UserRecord;
}

export async function getUserByMcpKey(apiKey: string): Promise<UserRecord | null> {
  const q = await db().collection(USERS).where("mcpApiKey", "==", apiKey).limit(1).get();
  if (q.empty) return null;
  return q.docs[0]!.data() as UserRecord;
}

export async function upsertUserFromAuth(params: {
  uid: string;
  email: string;
  name?: string;
}): Promise<UserRecord> {
  const ref = db().collection(USERS).doc(params.uid);
  const existing = await ref.get();
  const now = new Date().toISOString();

  if (existing.exists) {
    const data = existing.data() as UserRecord;
    await ref.update({ email: params.email, name: params.name, updatedAt: now });
    return { ...data, email: params.email, name: params.name, updatedAt: now };
  }

  const record: UserRecord = {
    uid: params.uid,
    email: params.email,
    name: params.name,
    mcpApiKey: randomApiKey(),
    createdAt: now,
    updatedAt: now,
  };
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
  const user = await getUser(uid);
  return user!;
}

export async function rotateMcpKey(uid: string): Promise<string> {
  const key = randomApiKey();
  await db().collection(USERS).doc(uid).update({
    mcpApiKey: key,
    updatedAt: new Date().toISOString(),
  });
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
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  const cutoffIso = cutoff.toISOString();

  // Firestore inequality needs an index if combined; for MVP we scan users with tokenExpiresAt set
  const snap = await db()
    .collection(USERS)
    .where("tokenExpiresAt", "!=", null)
    .get();

  const now = Date.now();
  const results: UserRecord[] = [];
  for (const doc of snap.docs) {
    const u = doc.data() as UserRecord;
    if (!u.tokenExpiresAt) continue;
    const exp = Date.parse(u.tokenExpiresAt);
    if (Number.isNaN(exp)) continue;
    if (exp > cutoff.getTime()) continue; // still far away
    // already expired or within window
    if (u.expiryEmailSentAt) {
      const sent = Date.parse(u.expiryEmailSentAt);
      // don't re-send more than once per 3 days
      if (!Number.isNaN(sent) && now - sent < 3 * 24 * 60 * 60 * 1000) continue;
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
