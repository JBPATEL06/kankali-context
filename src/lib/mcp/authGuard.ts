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
  const bufferMs = 5 * 60 * 1000; // 5-minute buffer
  
  return nowMs >= (expiresAtMs - bufferMs);
}

export async function sendExpirationEmail(userEmail: string): Promise<void> {
  // In a full production environment, this would integrate with an email provider like SendGrid, SES, or a Firebase Extension.
  console.log(`[EMAIL NOTIFICATION SENT] To: ${userEmail}`);
  console.log(`[SUBJECT] Action Required: Re-authenticate Context-Sharing MCP`);
  console.log(`[BODY] Your Google Drive session for the Context-Sharing MCP has expired. Please log in to re-authenticate.`);
  
  // Simulate network latency for the email service
  await new Promise(resolve => setTimeout(resolve, 300));
}
