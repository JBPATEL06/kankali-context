import { NextResponse } from "next/server";
import { listUsersNearingExpiry, markExpiryEmailSent } from "@/lib/users";
import { sendTokenExpiryEmail } from "@/lib/email";
import { cleanExpiredOAuthTokens } from "@/lib/oauth";

/**
 * Vercel Cron — daily at 09:00 UTC (see vercel.json).
 * Protected by CRON_SECRET header.
 */

export const maxDuration = 60;
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let users: Awaited<ReturnType<typeof listUsersNearingExpiry>> = [];
  try {
    users = await listUsersNearingExpiry(7);
  } catch (err) {
    console.error("Cron user query error:", err);
  }

  const results: Array<{ email: string; status: string }> = [];

  for (const user of users) {
    try {
      await sendTokenExpiryEmail(user);
      await markExpiryEmailSent(user.uid);
      results.push({ email: user.email, status: "sent" });
    } catch (err) {
      results.push({
        email: user.email,
        status: err instanceof Error ? err.message : "error",
      });
    }
  }

  let cleanedOAuth = { codesDeleted: 0, refreshDeleted: 0 };
  try {
    cleanedOAuth = await cleanExpiredOAuthTokens();
  } catch (err) {
    console.error("Cron OAuth cleanup error:", err);
  }

  return NextResponse.json({
    checked: users.length,
    results,
    cleanedOAuth,
  });
}
