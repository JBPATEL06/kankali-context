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

  const sendgridKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || process.env.MAIL_FROM;

  if (sendgridKey && fromEmail && userEmail) {
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sendgridKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: userEmail }] }],
          from: { email: fromEmail },
          subject,
          content: [{ type: 'text/plain', value: body }],
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error('[EMAIL] SendGrid failed:', res.status, errText);
      } else {
        console.log(`[EMAIL] Expiration notice sent via SendGrid to ${userEmail}`);
      }
      return;
    } catch (err) {
      console.error('[EMAIL] SendGrid request error:', err);
    }
  }

  // Dev / unconfigured fallback
  console.log(`[EMAIL NOTIFICATION] To: ${userEmail}`);
  console.log(`[SUBJECT] ${subject}`);
  console.log(`[BODY] ${body}`);
  await new Promise((resolve) => setTimeout(resolve, 50));
}
