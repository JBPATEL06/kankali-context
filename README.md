# Kankali (multi-user)

Portable MCP memory layer. Each user signs in, connects **their own** GitHub repo + PAT, and AI clients use a per-user MCP API key. Context is written into that user’s repo only.

## Architecture

```
AI client ──MCP + user API key──► Kankali (Vercel)
                                      │
                          Firestore user record
                          (encrypted GitHub PAT)
                                      │
                                      ▼
                            user's GitHub repo
                            /domains/<slug>/context.md
                            /activity-log/YYYY-MM-DD.md
```

- **Auth**: Google via NextAuth  
- **User data**: Firebase Firestore (`users/{uid}`)  
- **GitHub PATs**: AES-256-GCM encrypted with `ENCRYPTION_KEY`  
- **Expiry emails**: daily Vercel Cron → Gmail SMTP  
- **MCP**: `/mcp` — tools `list_domains`, `read_context`, `write_context`, `search_context`

## User flow

1. Sign in with Google  
2. Settings → paste fine-grained PAT + owner/repo (+ optional expiry date)  
3. Copy MCP API key into Claude / Grok / Cursor  
4. AIs store context in **that user’s** GitHub repo  

## Env vars

See `.env.example`. Required: NextAuth, Google OAuth, Firebase service account, `ENCRYPTION_KEY`, Gmail for reminders.

## Deploy

```bash
npx vercel --prod
# set env vars in Vercel dashboard, then redeploy
```

Add your production URL to Google OAuth **Authorized JavaScript origins** and **redirect URIs**  
(`https://your-app.vercel.app/api/auth/callback/google`).

## Security notes

- Never commit `serviceAccount.json` or client secrets  
- Rotate any credentials that were shared in chat  
- Fine-grained PATs scoped to one repo recommended  
