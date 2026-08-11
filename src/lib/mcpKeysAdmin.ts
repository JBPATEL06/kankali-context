import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

function getAdminFirestore() {
  if (!getApps().length) {
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccount.json';
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(serviceAccountPath)) {
      const serviceAccount = require(path.resolve(serviceAccountPath));
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
  return doc.data();
}
