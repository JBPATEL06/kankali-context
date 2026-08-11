## [2026-08-11] Full Project Bug & Security Audit

**What was discussed:**
- Performed comprehensive review of all source files after pulling latest code (commit f1007b1).

**Decisions made:**
- No code changes made in this session — audit only.
- Bugs and issues documented; fixes deferred to next session(s).

**Changes made to code/project:**
- None (read-only audit session).

**Open questions / follow-ups:**
- Which bugs to fix first? Recommended priority: #1 (serviceAccount.json gitignore) immediately, then #10 (missing OAuth scope) as it blocks Drive sync, then #5 (auth bypass via query param).
- Should `sendExpirationEmail` be wired to a real email provider (SendGrid/SES), or is console-log acceptable for now?
- Is the in-memory session store replacement (Firestore/Redis) scheduled for the next sprint?
- `ClaudeMcpHub` "Generate New MCP" — is this feature meant to be real or intentionally UI-only for now?

## [2026-08-11] Transition to Book-Style Context System & Architecture Update

**What was discussed:**
- Pivoted context management architecture from monolithic session JSON to a **Book-Style Context System** as defined in `docs/notice.md`.
- Storage formats expanded to Markdown (`.md`), JSON (`.json`), and custom formats across Google Drive and GitHub.
- Clarified book-style structural triad: `notice.md` (active directives), `index.md` (table of contents), and `commit.md` (append-only revision ledger for Drive).
- Defined required MCP tools for file/folder CRUD (`create_folder`, `read_folder`, `write_file`, `read_file`, `update_file`, `delete_file`, `delete_folder`, `append_commit`).

**Decisions made:**
- Adopted strict Docs Folder Management rule (`index.md`, `product.md`, `architecture.md`, `progress.md`, `plans.md`, `issues.md`, `notice.md`, `discussion.md`).
- Google Drive writes will automatically maintain `commit.md` to ensure immutable revision history despite lack of native git commits in Drive.
- MCP Server will expose both high-level book-style tools and granular file/folder tools.

**Changes made to code/project:**
- Restructured and updated `docs/index.md`, `docs/notice.md`, `docs/product.md`, `docs/architecture.md`, `docs/progress.md`, `docs/plans.md`, `docs/issues.md`, and `docs/discussion.md`.
- Created comprehensive implementation plan for Book-Style MCP tool execution.

**Open questions / follow-ups:**
- Should legacy single-session tools (`get_context`, `update_context`) be maintained alongside the new file/folder tools for backward compatibility?
- Should `commit.md` on Google Drive be automatically generated/appended on every file write, or only when an explicit `commit_message` is passed?

## [2026-08-11] Implemented Book-Style Context System & MCP Tools

**What was discussed:**
- Implemented full Book-Style Context System and hierarchical MCP tools.
- Closed 3 functional/critical bugs (`read_index`/`append_commit` fallback, GitHub token decryption, token expiry parameter).
- Completed security hardening (`.gitignore` update and `verifyMcpKey` expiration validation).

**Decisions made:**
- Created dedicated `src/lib/mcp/tools/bookStyleTools.ts` to keep `server.ts` clean and modular.
- Every Google Drive write verifies data via read-back and automatically appends to `commit.md`.
- Legacy `get_context` and `update_context` tools are preserved as backward-compatible proxies.

**Changes made to code/project:**
- `src/lib/mcp/types.ts`: Created shared types for file/folder items, commit entries, and book-style indexes.
- `src/lib/mcp/driveAdapter.ts`: Implemented hierarchical folder & file CRUD, read-back verification, `commit.md` ledger, and `index.md` catalog synchronization.
- `src/lib/mcp/githubAdapter.ts`: Implemented hierarchical file & folder CRUD and SHA handling.
- `src/lib/mcp/tools/bookStyleTools.ts`: Created modular tool definitions and execution dispatchers.
- `src/lib/mcp/server.ts`: Refactored to register modular tool handlers.
- `src/lib/mcp/authGuard.ts`: Enhanced `isTokenExpired` to handle optional `accessToken` and numeric/string `expiresAt`.
- `src/lib/mcpKeysAdmin.ts`: Added robust `expiresAt` validation in `verifyMcpKey`.
- `.gitignore`: Added `serviceAccount.json`, `firebase-applet-config.json`, and `*.env.local`.
- `src/scripts/testBookStyleMcp.ts`: Created and verified full end-to-end test suite.

**Open questions / follow-ups:**
- Proceed with UI component synchronization (`DriveExplorer.tsx` and `ClaudeMcpHub.tsx`) in next milestone.
