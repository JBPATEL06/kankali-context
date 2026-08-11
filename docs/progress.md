# Development Progress & Roadmap (`docs/progress.md`)

## 🚀 Completed Milestones

- [x] **Step 1: Schema & Architecture Design**
  - Defined explicit tool names (`get_context`, `update_context`, `sync_to_drive`, `sync_to_github`).
  - Added integer `version` property inside `metadata` for optimistic locking.
  - Added optional `filePath` parameter for GitHub syncing (`.context/session.json`).

- [x] **Step 2: Google Drive Adapter (`appDataFolder`)**
  - Implemented `DriveAdapter` with `save_to_appdata` and `read_from_appdata`.
  - Added `and trashed = false` filtering to file lookups.
  - Configured multi-user support with `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and user refresh tokens.

- [x] **Step 3: GitHub Storage Adapter**
  - Implemented `GitHubAdapter` using `@octokit/rest`.
  - Added file SHA lookup and base64 encoding for commit updates.

- [x] **Step 4: MCP Server Setup & Tool Handlers**
  - Integrated `@modelcontextprotocol/sdk`.
  - Implemented in-memory session store map (`Map<string, ContextPayload>`).
  - Registered all 4 core tools with strict input schemas and robust error handling.

- [x] **Step 5: Auth Expiration Guard & Diagnostics**
  - Created `authGuard.ts` for token expiration checks and email notification stubs.
  - Built diagnostic verification script (`src/scripts/verifyAuth.ts`).

---

## 📅 Upcoming / Future Enhancements
- [ ] Add WebSocket support for real-time multi-agent notification broadcasts.
- [ ] Implement persistent database caching (Firestore/Cloud SQL) for session store backup.
- [ ] Expand test coverage with automated unit tests for optimistic locking conflicts.
