# Progress & Status (`docs/progress.md`)

> Last updated: 2026-08-11

---

## ✅ Backend — COMPLETED

| Feature | File | Status |
|---|---|---|
| Express server with Vite middleware | `server.ts` | ✅ Done |
| Firebase Auth middleware (`multiTenantMiddleware`) | `server.ts` | ✅ Done |
| Rate limiting & Helmet security headers | `server.ts` | ✅ Done |
| GitHub link API (`POST /api/github/link`) | `server.ts` | ✅ Done |
| Drive sync API (`POST /api/drive/sync`) | `server.ts` | ✅ Done |
| **MCP SSE endpoint** (`GET /api/mcp/sse`) | `server.ts` | ✅ Done |
| **MCP message endpoint** (`POST /api/mcp/message`) | `server.ts` | ✅ Done |
| **MCP link generator** (`POST /api/mcp/generate-link`) | `server.ts` | ✅ Done |
| MCP Server factory (`createServerInstance`) | `src/lib/mcp/server.ts` | ✅ Done |
| MCP Tools: `get_context`, `update_context` | `src/lib/mcp/server.ts` | ✅ Done |
| MCP Tools: `sync_to_drive`, `sync_to_github` | `src/lib/mcp/server.ts` | ✅ Done |
| MCP Tools: `read_index`, `read_notice`, `append_commit` | `src/lib/mcp/server.ts` | ✅ Done |
| Token expiry guard (2-min buffer, auto-purge) | `src/lib/mcp/authGuard.ts` | ✅ Done |
| Drive appDataFolder adapter | `src/lib/mcp/driveAdapter.ts` | ✅ Done |
| GitHub commit adapter | `src/lib/mcp/githubAdapter.ts` | ✅ Done |
| Firestore token storage (Google & GitHub) | `src/lib/firebaseStore.ts` | ✅ Done |
| `createMcpKey` / `getMcpKeyInfo` (API key generation) | `src/lib/firebaseStore.ts` | ✅ Done |
| `saveGoogleDriveAuthToFirestore` | `src/lib/firebaseStore.ts` | ✅ Done |
| `saveGithubDataToFirestore` | `src/lib/firebaseStore.ts` | ✅ Done |

---

## ✅ Frontend — COMPLETED & Linked to Backend

| Feature | File | Linked Backend | Status |
|---|---|---|---|
| Google Sign-In (OAuth popup) | `src/lib/firebaseAuth.ts` | Firebase Auth + Firestore save | ✅ Done |
| Email Sign-In / Sign-Up | `src/lib/firebaseAuth.ts` | Firebase Auth | ✅ Done |
| Google Drive token saved to Firestore on login | `src/App.tsx` | `saveUserConfigToFirestore` | ✅ Done |
| Drive token expiry detection (401 vs 403) | `src/App.tsx` | `validateGoogleDriveToken` | ✅ Done |
| Re-auth banner (token expiry warning) | `src/App.tsx` | UI only, triggers `googleSignIn` | ✅ Done |
| **Generate MCP Link button** | `ClaudeMcpHub.tsx` | `POST /api/mcp/generate-link` | ✅ Done |
| Display generated MCP links as cards | `ClaudeMcpHub.tsx` | Real URL from backend | ✅ Done |
| GitHub token + repo save | `IntegrationsTab.tsx` | `POST /api/github/link` + Firestore | ✅ Done |
| GitHub config load from Firestore on mount | `IntegrationsTab.tsx` | `getUserConfigFromFirestore` | ✅ Done |
| Drive Files browser (list/upload/download/delete) | `DriveExplorer.tsx` | `googleDriveApi.ts` (client OAuth) | ✅ Done |
| Dashboard overview stats | `DashboardOverview.tsx` | Reads local memory state | ✅ Done |

---

## ❌ Frontend — UI EXISTS BUT NOT LINKED TO BACKEND

| Feature | File | What's Missing |
|---|---|---|
| **Google Drive "Connect" button** | `IntegrationsTab.tsx` | Button has no `onClick` — needs to trigger `googleSignIn()` from `firebaseAuth.ts` |
| **Google Drive status (Connected / Not Connected)** | `IntegrationsTab.tsx` | Always shows "Not Connected" — needs to check if `accessToken` exists in session |
| **MCP card "Configuration" button** | `ClaudeMcpHub.tsx` | No action wired up — placeholder only |
| **MCP card "Restart Server" button** | `ClaudeMcpHub.tsx` | No action wired up — placeholder only |
| **GitHub status dot** | `IntegrationsTab.tsx` | Always shows green dot even if not connected — logic exists but dot color is hardcoded |

---

## ❌ Backend — PLANNED BUT NOT STARTED

| Feature | Notes |
|---|---|
| **`user_id` injection in SSE tool calls** | Currently AI must pass `user_id` in every tool call manually. Should be auto-injected from the API key on the server side. |
| **WebSocket support** | Real-time multi-agent notification broadcasts — not started |
| **Persistent session store (DB)** | Current in-memory `Map` is lost on server restart. Needs Firestore/Redis backup |
| **Token auto-refresh (Drive)** | If refresh token is present, auto-renew Drive access token before expiry |
| **MCP key expiry / revocation** | No mechanism to expire or revoke generated MCP links yet |
| **One-link-per-AI enforcement** | Planned: each AI client gets its own unique link; sharing blocked |

---

## 📅 Recommended Next Steps (Priority Order)

1. **Wire Google Drive "Connect" button** in `IntegrationsTab.tsx` → call `googleSignIn()`
2. **Auto-inject `user_id`** from MCP API key inside the SSE server (so AI doesn't need to pass it)
3. **Persist MCP session store** to Firestore so context survives server restarts
4. **Add MCP key expiry** (e.g. 30-day TTL) and a revoke button in the UI
