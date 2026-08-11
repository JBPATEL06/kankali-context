import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { initializeApp, getApps, getApp } from 'firebase/app';
import firebaseConfig from '../../firebase-applet-config.json';
import admin from 'firebase-admin';

import { initializeApp as initAdminApp, getApps as getAdminApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

function getAdminDb() {
  if (!getAdminApps().length) {
    initAdminApp({
      credential: applicationDefault(),
    });
  }
  return getAdminFirestore();
}
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);

export interface UserFirebaseConfig {
  userId: string;
  email: string;
  displayName?: string;
  googleAccessToken?: string;
  googleRefreshToken?: string;
  googleTokenExpiresAt?: string;
  googleTokenObtainedAt?: string;
  mcpStorageMode?: 'drive' | 'github' | 'ask_user' | 'single_url' | 'url';
  driveFolderUrl?: string;
  githubRepo?: string;
  githubBranch?: string;
  githubToken?: string;
  githubTokenExpiresAt?: string;
  githubUsername?: string;
  lastSyncedAt?: string;
  updatedAt?: string;
}

/**
 * Saves or updates user configuration in Firestore under users/{userId}
 */
export async function saveUserConfigToFirestore(
  userId: string,
  data: Partial<UserFirebaseConfig>
): Promise<void> {
  if (!userId) return;

  const cacheKey = `kankali_user_config_${userId}`;
  const payload = {
    ...data,
    userId,
    updatedAt: new Date().toISOString(),
  };

  // Always sync local storage cache first
  try {
    if (typeof localStorage !== 'undefined') {
      const existingRaw = localStorage.getItem(cacheKey);
      const existing = existingRaw ? JSON.parse(existingRaw) : {};
      localStorage.setItem(cacheKey, JSON.stringify({ ...existing, ...payload }));
    }
  } catch (e) {
    // Ignore storage quota errors
  }

  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, payload, { merge: true });
  } catch (error: any) {
    console.warn('Firestore offline or unavailable, saved config locally:', error?.message || error);
  }
}

/**
 * Fetches user configuration from Firestore under users/{userId}
 */
export async function getUserConfigFromFirestore(userId: string): Promise<UserFirebaseConfig | null> {
  if (!userId) return null;
  const cacheKey = `kankali_user_config_${userId}`;

  try {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data() as UserFirebaseConfig;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(cacheKey, JSON.stringify(data));
        }
      } catch (e) { }
      return data;
    }
  } catch (error: any) {
    console.warn('Firestore offline or unavailable, falling back to local cache:', error?.message || error);
  }

  // Fallback to local storage if Firestore is offline
  try {
    if (typeof localStorage !== 'undefined') {
      const localRaw = localStorage.getItem(cacheKey);
      if (localRaw) {
        return JSON.parse(localRaw) as UserFirebaseConfig;
      }
    }
  } catch (e) { }

  return null;
}

/**
 * Saves GitHub integration parameters (repo, branch, token, token expiration) to Firestore
 */
export async function saveGithubDataToFirestore(
  userId: string,
  githubData: {
    repo: string;
    branch: string;
    token: string;
    expiresAt?: string;
    username?: string;
  }
): Promise<void> {
  await saveUserConfigToFirestore(userId, {
    githubRepo: githubData.repo,
    githubBranch: githubData.branch || 'main',
    githubToken: githubData.token,
    githubTokenExpiresAt: githubData.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    githubUsername: githubData.username || '',
  });
}

/**
 * Saves Google Drive Auth token & expiration data to Firestore
 */
export async function saveGoogleDriveAuthToFirestore(
  userId: string,
  accessToken: string,
  expiresInSeconds = 3600,
  refreshToken?: string
): Promise<{ tokenExpiresAt: string }> {
  const obtainedAt = new Date().toISOString();
  const tokenExpiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  const payload: Partial<UserFirebaseConfig> = {
    googleAccessToken: accessToken,
    googleTokenObtainedAt: obtainedAt,
    googleTokenExpiresAt: tokenExpiresAt,
  };
  if (refreshToken) {
    payload.googleRefreshToken = refreshToken;
  }

  await saveUserConfigToFirestore(userId, payload);

  return { tokenExpiresAt };
}

/**
 * Removes Google Drive tokens when expired
 */
export async function clearGoogleToken(userId: string): Promise<void> {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    googleAccessToken: null,
    googleRefreshToken: null,
    googleTokenExpiresAt: null,
    googleTokenObtainedAt: null
  } as any);
}

/**
 * Removes GitHub token when expired
 */
export async function clearGithubToken(userId: string): Promise<void> {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    githubToken: null,
    githubTokenExpiresAt: null
  } as any);
}

/**
 * Creates a unique MCP API Key for a user's AI connector.
 */
export async function createMcpKey(userId: string, storageType: string): Promise<string> {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'mcp_';
  for (let i = 0; i < 20; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  await getAdminDb().collection('mcp_keys').doc(key).set({
    userId,
    storageType,
    createdAt: new Date().toISOString(),
  });

  return key;
}
/**
 * Validates and retrieves the User ID and Storage Type for an MCP API Key.
 */
export async function getMcpKeyInfo(
  key: string
): Promise<{ userId: string; storageType: string } | null> {
  if (!key) return null;
  const snap = await getAdminDb().collection('mcp_keys').doc(key).get();
  if (!snap.exists) return null;
  return snap.data() as { userId: string; storageType: string };
}
