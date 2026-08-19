import nodemailer from "nodemailer";
import { appOrigin } from "@/lib/oauth";
import type { UserRecord } from "@/types";

function transporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !pass) {
    throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD not configured");
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

export async function sendTokenExpiryEmail(user: UserRecord): Promise<void> {
  const exp = user.tokenExpiresAt
    ? new Date(user.tokenExpiresAt).toUTCString()
    : "unknown";
  const appUrl = appOrigin();

  const info = await transporter().sendMail({
    from: `"Kankali" <${process.env.GMAIL_USER}>`,
    to: user.email,
    subject: "Kankali — your GitHub token is about to expire",
    text: [
      `Hi${user.name ? ` ${user.name}` : ""},`,
      ``,
      `Your GitHub personal access token linked to Kankali expires on:`,
      `  ${exp}`,
      ``,
      `When it expires, AI assistants will no longer be able to read or write your context.`,
      ``,
      `Please generate a new fine-grained PAT and update it here:`,
      `  ${appUrl}/settings`,
      ``,
      `— Kankali`,
    ].join("\n"),
    html: `
      <p>Hi${user.name ? ` ${user.name}` : ""},</p>
      <p>Your GitHub personal access token linked to <strong>Kankali</strong> expires on:</p>
      <p><code>${exp}</code></p>
      <p>When it expires, AI assistants will no longer be able to read or write your context.</p>
      <p><a href="${appUrl}/settings">Update your token in Settings →</a></p>
      <p>— Kankali</p>
    `,
  });
  return;
}
