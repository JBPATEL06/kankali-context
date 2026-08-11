## [2026-08-11] Token Expiration & Google Drive MD Structure

**What was discussed:**
- Setting up Firebase as the sole token storage medium.
- Enforcing a strict < 2-minute token expiration guard.
- Exposing markdown tools (`read_index`, `read_notice`, `append_commit`) via the MCP server for AI interaction with Google Drive appData.

**Decisions made:**
- Used Firebase Firestore for token storage instead of a local file/SQLite DB, enabling a smoother transition to a hosted online service in the future.
- The MCP server now fetches tokens directly from Firebase using `user_id` instead of requiring the AI to pass raw tokens via the tool arguments.
- Expiration logic explicitly purges the expired token from Firestore and returns `"your token is expired you need to re-login"` to ensure the AI explicitly halts operations.

**Changes made to code/project:**
- **`src/lib/firebaseStore.ts`**: Made local storage checks Node.js-safe and added `clearGoogleToken` and `clearGithubToken`.
- **`src/lib/mcp/authGuard.ts`**: Reduced the expiration buffer to 2 minutes.
- **`src/lib/mcp/server.ts`**: Refactored `sync_to_drive` and `sync_to_github` to use `user_id`, and added `read_index`, `read_notice`, and `append_commit` tools.
- **`src/lib/mcp/driveAdapter.ts`**: Added `read_file_as_text` and `write_file_as_text` to support markdown ledgering.
- **`src/App.tsx`**: Updated the Google login handler to persist `googleTokenExpiresAt` to Firestore.

**Open questions / follow-ups:**
- Does the system need a scheduled cron job to clean up expired tokens proactively, or is the lazy evaluation on tool-call sufficient?

## [2026-08-11] Web MCP SSE Link Generation

**What was discussed:**
- Transitioning the MCP Server from a local `stdio` architecture to a web `SSE` architecture so that users can generate links via the UI.

**Decisions made:**
- Added `/api/mcp/generate-link` endpoint that maps a unique API key to a `userId` and `storageType` in Firebase (`mcp_keys` collection).
- The MCP Server now exposes `/api/mcp/sse` and `/api/mcp/message` over HTTP in `server.ts`.

**Changes made to code/project:**
- **`src/lib/mcp/server.ts`**: Replaced the default single-server instance with a `createServerInstance()` function to allow multiple HTTP SSE connections.
- **`server.ts`**: Added routes for handling SSE connections and message POSTing via `@modelcontextprotocol/sdk/server/sse.js`.
- **`src/lib/firebaseStore.ts`**: Added `createMcpKey` and `getMcpKeyInfo`.
- **`src/components/ClaudeMcpHub.tsx`**: Hooked up the "Generate MCP" UI modal to hit the new backend endpoint and display the real URL.

**Open questions / follow-ups:**
- Currently, the AI tool calls in the SSE flow still require `user_id` to be passed as an argument. We need to implement an automatic injection of this `user_id` inside the server request handler since the AI only knows about the URL key.

## [2026-08-11] MCP Keys Admin + Auth Guard Refactor + Git Push

**What was discussed:**
- Pushing current work to GitHub.
- Security check flagged `serviceAccount.json` was untracked and missing from `.gitignore`.

**Decisions made:**
- Added `serviceAccount.json` to `.gitignore` immediately to prevent accidental credential exposure.

**Changes made to code/project:**
- **`.gitignore`**: Added `serviceAccount.json` exclusion rule.
- **`src/lib/mcpKeysAdmin.ts`**: New module — admin functions for managing MCP API keys in Firestore.
- **`src/lib/mcp/authGuard.ts`**: Refactored for improved MCP route protection.
- **`src/lib/firebaseStore.ts`**: Refactored store logic.
- Committed and pushed to `origin/main` (commit `270d956`).

**Open questions / follow-ups:**
- Verify `mcpKeysAdmin.ts` integration with the MCP key generation flow end-to-end.
