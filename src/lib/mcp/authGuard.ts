import nodemailer from 'nodemailer';
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
 *gmail provider
 */


export async function sendExpirationEmail(userEmail: string): Promise<void> {
  const subject = 'Action Required: Re-authenticate Context-Sharing MCP';
  const body =
    'Your Google Drive session for the Context-Sharing MCP has expired. ' +
    'Please open the Kankali Context Hub web UI and sign in with Google again to re-authenticate.';

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  if (gmailUser && gmailPass && userEmail) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: gmailUser, pass: gmailPass },
      });
      await transporter.sendMail({
        from: gmailUser,
        to: userEmail,
        subject,
        text: body,
      });
      console.log(`[EMAIL] Sent via Gmail to ${userEmail}`);
      return;
    } catch (err) {
      console.error('[EMAIL] Gmail send failed:', err);
    }
  }

  // fallback
  console.log(`[EMAIL NOTIFICATION] To: ${userEmail}`);
  console.log(`[SUBJECT] ${subject}`);
  console.log(`[BODY] ${body}`);
}
