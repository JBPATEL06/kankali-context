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

export async function getMcpKeyInfo(
    key: string
): Promise<{ userId: string; storageType: string } | null> {
    if (!key) return null;
    const snap = await getAdminDb().collection('mcp_keys').doc(key).get();
    if (!snap.exists) return null;
    return snap.data() as { userId: string; storageType: string };
}