export function isTokenExpired(tokenMetadata: { accessToken: string; expiresAt?: number | string }): boolean {
  if (!tokenMetadata.expiresAt) {
    // If we don't have an expiration time, we can't definitively say it's expired.
    // The API call itself will fail if it is actually expired.
    return false;
  }

  const expiresAtMs = typeof tokenMetadata.expiresAt === 'string'
    ? new Date(tokenMetadata.expiresAt).getTime()
    : tokenMetadata.expiresAt;

  const nowMs = Date.now();
  const bufferMs = 2 * 60 * 1000; // 2-minute buffer

  return nowMs >= (expiresAtMs - bufferMs);
}

/**
 * Notify user that their Google Drive / MCP token expired.
 * Priority:
 *  1. SENDGRID_API_KEY + SENDGRID_FROM_EMAIL (HTTP API)
 *  2. Console fallback (dev / when email provider not configured)
 */
export async function sendExpirationEmail(userEmail: string): Promise<void> {
  const subject = 'Action Required: Re-authenticate Context-Sharing MCP';
  const body =
    'Your Google Drive session for the Context-Sharing MCP has expired. ' +
    'Please open the Kankali Context Hub web UI and sign in with Google again to re-authenticate.';

  if (!userEmail) {
    console.log('[EMAIL] No userEmail, skip');
    return;
  }

  try {
    // Firebase Trigger Email extension watches collection "mail"
    const { getFirestore, collection, addDoc } = await import('firebase/firestore');
    const { initializeApp, getApps, getApp } = await import('firebase/app');
    const firebaseConfig = (await import('../../../firebase-applet-config.json')).default;
    const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);

    await addDoc(collection(db, 'mail'), {
      to: [userEmail],
      message: {
        subject,
        text: body,
      },
    });
    console.log(`[EMAIL] Queued via Firestore mail collection for ${userEmail}`);
  } catch (err) {
    console.error('[EMAIL] Failed to queue mail doc:', err);
    console.log(`[EMAIL NOTIFICATION] To: ${userEmail}`);
    console.log(`[SUBJECT] ${subject}`);
    console.log(`[BODY] ${body}`);
  }
}
