# Progress

## Done
- **Book-Style Context System & MCP Tools**:
  - Created shared interfaces (`McpFileItem`, `McpFolderItem`, `CommitLogEntry`, `BookStyleIndex`) in `src/lib/mcp/types.ts`.
  - Implemented `DriveAdapter` (`src/lib/mcp/driveAdapter.ts`) supporting hierarchical folder/file CRUD, mandatory read-back verification, automated `commit.md` ledger updates, and `index.md` catalog synchronization.
  - Implemented `GitHubAdapter` (`src/lib/mcp/githubAdapter.ts`) with hierarchical file/folder CRUD, SHA tracking, branch commit management, and **mandatory read-back verification** for `write_file` and `delete_file`.
  - Modularized tool handlers into `src/lib/mcp/tools/bookStyleTools.ts` and registered full tool suite (`write_file`, `read_file`, `create_folder`, `read_folder`, `delete_file`, `delete_folder`, `append_commit`, `read_notice`, `read_index`, `sync_to_drive`, `sync_to_github`) in `src/lib/mcp/server.ts`.
  - Proxied legacy `get_context` and `update_context` tools with optimistic locking to book-style storage.
- **Bug & Security Fixes**:
  - Fixed `[High]` `read_index` and `append_commit` fallback — now operating directly on book-style `index.md` and `commit.md`.
  - Fixed `[Critical]` GitHub token decryption via `platform.decryptSecret` across `server.ts` (`getGithubClient`) and `bookStyleTools.ts` with fail-safe error propagation.
  - Fixed `[Critical]` `ElectronPlatformAdapter.decryptSecret` in `platform.ts` to throw explicitly on corrupted ciphertext rather than returning raw ciphertext.
  - Fixed `[Medium]` `isTokenExpired` parameter handling in `authGuard.ts`.
  - Added `serviceAccount.json`, `firebase-applet-config.json`, and `*.env.local` to `.gitignore`.
  - Added explicit `expiresAt` validation in `verifyMcpKey` (`mcpKeysAdmin.ts`).
- **Comprehensive Verification**:
  - 9 automated test suites in `src/scripts/testBookStyleMcp.ts` covering tool definitions, notice/index reading, legacy optimistic locking, Drive CRUD with `commit.md` & `index.md` auto-sync, token expiration buffers, AES-256-GCM crypto, GitHub CRUD with read-back verification & failure detection, and error paths.
  - Clean TypeScript compilation with `tsc --noEmit` and successful production bundle build (`npm run build`).

## In Progress
- UI alignment for `DriveExplorer.tsx` and `ClaudeMcpHub.tsx` to visualize the book-style `notice.md`, `index.md`, `commit.md` hierarchy.

## Broken / Known-Bad
- Missing `drive.appdata` / file OAuth scope in Google sign-in → 403 on Google sign-in operations (`firebaseAuth.ts` L23).
- CORS middleware uses `Access-Control-Allow-Origin: *` in production (`server.ts` L262).
- `multiTenantMiddleware` query-param bypass for `/api/` routes (`server.ts` L213).
