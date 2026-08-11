import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

function getAdminFirestore() {
  if (!getApps().length) {
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccount.json';
    const resolvedPath = path.resolve(serviceAccountPath);
    if (fs.existsSync(resolvedPath)) {
      const serviceAccount = require(resolvedPath);
      initializeApp({
        credential: cert(serviceAccount),
      });
    } else {
      initializeApp();
    }
  }
  return getFirestore();
}

export async function generateMcpKey(userId: string, integrationType: 'google_drive' | 'github', tokenData: any): Promise<string> {
  const db = getAdminFirestore();
  const mcpKey = crypto.randomBytes(32).toString('hex');
  
  await db.collection("mcp_keys").doc(mcpKey).set({
    key: mcpKey,
    userId: userId || "anonymous",
    integrationType,
    tokenData,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
  });

  return mcpKey;
}

export async function verifyMcpKey(mcpKey: string): Promise<any | null> {
  if (!mcpKey) return null;
  const db = getAdminFirestore();
  const doc = await db.collection("mcp_keys").doc(mcpKey).get();
  if (!doc.exists) return null;
  const data = doc.data();
  if (!data) return null;

  if (data.expiresAt) {
    const expiresAtMs = typeof data.expiresAt === 'string' ? new Date(data.expiresAt).getTime() : Number(data.expiresAt);
    if (!isNaN(expiresAtMs) && expiresAtMs < Date.now()) {
      console.warn(`[MCP Auth] MCP Key ${mcpKey} has expired on ${data.expiresAt}`);
      return null;
    }
  }

  return data;
}
