# Kankali Context ⚡

> **Universal, Self-Custodial AI Memory & Context Protocol (MCP)**  
> One persistent memory across **Claude**, **Cursor**, **ChatGPT**, and **Grok** — stored in **your own** GitHub Repository and Google Drive AppData. Zero database lock-in.

---

## 🌟 Why Kankali?

Most AI memory solutions store developer knowledge inside third-party vector databases and closed SaaS silos. If that company changes pricing or shuts down, your team's architectural context vanishes.

**Kankali gives you 100% data sovereignty:**
- 🧠 **Self-Custodial Memory**: All context is stored as human-readable Markdown with YAML frontmatter directly inside **your private GitHub repository** and/or **Google Drive AppData folder**.
- 🔐 **OAuth 2.1 + PKCE (RFC 7636)**: Native support for Claude Web Custom Connectors via Dynamic Client Registration (DCR) and PKCE. No copying API keys into browser prompts.
- 📑 **Progressive Disclosure AST Engine**: Instead of flooding LLM context windows with massive files (wasting thousands of tokens), Kankali generates AST outlines and reads/writes only targeted section chunks (`[auth-flow]` ~2KB).
- 🔄 **Universal MCP Endpoints**: Connect Claude Web, Cursor, Claude Code CLI, Grok, or ChatGPT to a single unified brain (`/mcp/master`).
- 🛡️ **Production-Hardened**: Built-in exponential backoff on GitHub 409 Conflicts, Google Drive duplicate auto-healing, AES-256-GCM encryption, and distributed rate limiting.

---

## 🏗️ Architecture

```
                      ┌────────────────────────────────────────────────────────┐
                      │ AI Clients: Claude Web / Cursor / Grok / Claude Code   │
                      └───────────────────────────┬────────────────────────────┘
                                                  │ MCP (OAuth 2.1 PKCE / Master Token)
                                                  ▼
                                 ┌─────────────────────────────────┐
                                 │      Kankali MCP Server         │
                                 │   - Progressive AST Chunking    │
                                 │   - Distributed Rate Limiter    │
                                 │   - 409 Conflict Retry Engine   │
                                 └────────┬───────────────┬────────┘
                                          │               │
                    (AES-256-GCM PAT)     │               │ (Google OAuth Refresh)
                                          ▼               ▼
                       ┌─────────────────────────┐ ┌─────────────────────────────┐
                       │   User's GitHub Repo    │ │ User's Google Drive AppData │
                       │   - /domains/*.md       │ │ (Private app-scoped sandbox)│
                       │   - /project/<slug>/*.md│ │ - project/<slug>/...        │
                       │   - /activity-log/*.md  │ │ - session/current.md        │
                       └─────────────────────────┘ └─────────────────────────────┘
```

---

## 🔌 MCP Endpoints

Kankali exposes standardized Model Context Protocol (MCP) endpoints over HTTP/SSE:

| Endpoint | Target Storage | Authentication | Ideal For |
| :--- | :--- | :--- | :--- |
| **`/mcp/master`** | **Dual Vault (Drive + GitHub)** | OAuth 2.1 / Master Token / Bearer Key | Claude Web, Grok, ChatGPT universal connector |
| **`/mcp/git`** | **User's GitHub Repo** | OAuth 2.1 / Bearer Key / Master Token | Cursor IDE, Claude Code CLI, CI/CD agents |
| **`/mcp/drive`** | **Google Drive AppData** | OAuth 2.1 / Bearer Key / Master Token | Lightweight mobile sessions, cross-device sync |

> **Backwards Compatibility:** All endpoints support both lowercase (`/mcp/drive`) and legacy uppercase paths (`/mcp/Drive`), as well as `/mcp` routing directly to `/mcp/master`.

---

## 🛠️ MCP Tool Suite

All endpoints provide standardized tools engineered for progressive disclosure:

### 1. Progressive Disclosure & Navigation
- `read_notice`: Protocol instructions and rules for the AI assistant. Must be called first.
- `read_index`: High-level summary of all projects and active sessions.
- `list_tree`: File tree list (supports path prefix filters).
- `read_outline`: Extracts markdown AST headings, line boundaries, and anchor slugs (`extractOutline`).

### 2. File & Chunk Operations
- `read_file`: Reads full file content or an isolated heading anchor (`getSectionChunk`).
- `write_file`: Writes full content or in-place patches a specific section without file corruption (`replaceSectionChunk`).
- `delete_path`: Safely removes a file or recursive directory.
- `search_files`: Fast keyword search across stored markdown notes.

### 3. SDLC & Session Management
- `project_upsert`: Initialize or update a structured project (`/project/<slug>/...`) with stack, status, and decisions.
- `project_get` / `project_list`: Retrieve project status and codebase notes.
- `project_codebase_note`: Append dated architecture notes and milestones.
- `current_session_set` / `current_session_get`: Save and resume working scratchpad memory between sessions.

---

## 🚀 Client Setup

### 1. Claude Web (Custom Connector via OAuth)
1. In Claude Web, go to **Customize** → **Connectors** → **Add custom connector**.
2. Set Connector URL:
   ```
   https://kankali-context.vercel.app/mcp/master
   ```
3. Leave OAuth Client ID / Secret empty (discovered automatically via RFC 7636 PKCE).
4. Click **Connect** → Sign in with Google → **Allow access**.

### 2. Cursor IDE (`~/.cursor/mcp.json` or `.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "kankali": {
      "url": "https://kankali-context.vercel.app/mcp/master",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_API_KEY_OR_MASTER_TOKEN"
      }
    }
  }
}
```

### 3. Claude Code CLI
```bash
claude mcp add kankali https://kankali-context.vercel.app/mcp/master --header "Authorization: Bearer YOUR_MCP_API_KEY_OR_MASTER_TOKEN"
```

---

## 🔒 Security & Privacy Engineering

- **No Shared Database Lock-in:** User files reside strictly in user-owned accounts (GitHub or Google Drive).
- **Encryption at Rest:** Sensitive tokens (GitHub Fine-Grained PATs, Google OAuth refresh tokens) are encrypted in Firestore using **AES-256-GCM** with unique initialization vectors (`iv:tag:ciphertext`).
- **Fail-Secure Secrets:** Token signing strictly requires `ENCRYPTION_KEY` or `NEXTAUTH_SECRET` in production; insecure fallbacks are rejected.
- **Concurrency & 409 Conflict Retry:** Git commits execute with automatic exponential backoff retry to prevent SHA mismatch errors during concurrent AI agent invocations.
- **Drive Duplicate Auto-Pruning:** Google Drive queries enforce timestamp ordering and automatically prune orphaned duplicates created during concurrent writes.
- **Distributed Rate Limiting:** All MCP and auth endpoints are protected by persistent rate limiters against abuse.

---

## 💻 Self-Hosting & Local Development

### Prerequisites
- Node.js >= 20
- Firebase Firestore Project
- Google Cloud OAuth Credentials (with `https://www.googleapis.com/auth/drive.appdata` scope)
- GitHub Personal Access Token (or GitHub App)

### 1. Clone & Install
```bash
git clone https://github.com/JBPATEL06/kankali-context.git
cd kankali-context
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env.local` and populate:
```bash
cp .env.example .env.local
```
Key variables:
- `NEXTAUTH_SECRET` & `ENCRYPTION_KEY`: 32-byte cryptographic keys
- `NEXTAUTH_URL`: e.g. `http://localhost:3000`
- `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`: Google OAuth credentials
- `FIREBASE_SERVICE_ACCOUNT_JSON`: Service account JSON for Firestore

### 3. Run Development Server
```bash
npm run dev
```

### 4. Run Verification Tests
```bash
npx tsx scripts/test-corruption.ts
npx tsc --noEmit
```

### 5. Deploy to Vercel
```bash
npx vercel --prod
```

---

## 📄 License
MIT © [Jeel Patel](https://github.com/JBPATEL06)
