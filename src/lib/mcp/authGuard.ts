/**
 * Token expiration guard with safety buffer.
 * Supports ISO timestamp strings or numeric epoch milliseconds.
 */
export function isTokenExpired(tokenMetadata: { accessToken?: string; expiresAt?: number | string }): boolean {
  if (!tokenMetadata.expiresAt) {
    // If no expiration time is recorded, allow API call to attempt; it will fail explicitly if revoked/expired.
    return false; 
  }
  
  const expiresAtMs = typeof tokenMetadata.expiresAt === 'string' 
    ? new Date(tokenMetadata.expiresAt).getTime()
    : Number(tokenMetadata.expiresAt);
    
  if (isNaN(expiresAtMs)) return false;

  const nowMs = Date.now();
  const bufferMs = 2 * 60 * 1000; // 2-minute buffer
  
  return nowMs >= (expiresAtMs - bufferMs);
}

export async function sendExpirationEmail(userEmail: string): Promise<void> {
  // In a full production environment, this integrates with SendGrid/SES/Firebase extensions.
  console.log(`[EMAIL NOTIFICATION SENT] To: ${userEmail}`);
  console.log(`[SUBJECT] Action Required: Re-authenticate Context-Sharing MCP`);
  console.log(`[BODY] Your Google Drive session for the Context-Sharing MCP has expired. Please log in to re-authenticate.`);
  
  // Simulate latency
  await new Promise(resolve => setTimeout(resolve, 100));
}
