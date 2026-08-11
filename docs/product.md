# Product Specification (`docs/product.md`)

## 🎯 Vision & Purpose
**Kankali Context** is a web platform that lets users generate dedicated MCP (Model Context Protocol) server links and connect their AI agents (Claude, Grok, etc.) to personal storage backends — Google Drive or GitHub — for persistent context syncing across sessions.

Users sign in via Firebase Auth, connect their storage (Drive / GitHub), and receive a unique HTTP SSE URL they paste into their AI client to give it persistent memory.

---

## 🔑 Core Features

### 1. Firebase Authentication
- Sign in with Google (OAuth) or Email/Password
- Session persisted to Firestore (token, uid, email, displayName)
- Token expiration enforced: tokens expiring within 2 minutes are auto-cleared

### 2. MCP Server (HTTP SSE Transport)
Each user generates a unique link (`/api/mcp/sse?key=mcp_xxx`). The AI connects to this link via SSE and sends commands via `POST /api/mcp/message?key=mcp_xxx`. Per-connection server instances are created dynamically.

**Available MCP Tools:**
| Tool | Purpose |
|---|---|
| `get_context` | Reads current session context from in-memory store |
| `update_context` | Patches context with optimistic version locking |
| `sync_to_drive` | Persists context JSON to user's Google Drive appDataFolder |
| `sync_to_github` | Commits context to user's GitHub repository |
| `read_index` | Reads `index.md` from user's Drive appDataFolder |
| `read_notice` | Reads `notice.md` from Drive |
| `append_commit` | Appends a timestamped entry to `commits.md` in Drive |

### 3. Google Drive Integration
- OAuth token stored in Firestore (not browser)
- Drive appDataFolder used for private, hidden file storage
- Token validation before every Drive operation (HTTP 401 / 403 checks)

### 4. GitHub Integration
- Personal Access Token (PAT) stored in Firestore
- Repo, branch, and path configurable via the UI
- File SHA auto-fetched for clean `git push`-style updates

---

## 👥 Multi-User & Security Architecture
- All tokens stored in Firestore per `user_id` — never in plain localStorage
- MCP API keys (`mcp_keys` collection) map each SSE URL to a specific `userId`
- Token expiry < 2 min: token auto-purged from DB, AI instructed to prompt re-login
- CORS, Helmet, rate-limiting applied on all API routes
