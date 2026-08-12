import { NextResponse } from "next/server";
import { listUsersNearingExpiry, markExpiryEmailSent } from "@/lib/users";
import { sendTokenExpiryEmail } from "@/lib/email";

/**
 * Vercel Cron — daily at 09:00 UTC (see vercel.json).
 * Protected by CRON_SECRET header.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await listUsersNearingExpiry(7);
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

  return NextResponse.json({ checked: users.length, results });
}
