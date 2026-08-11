# Plans

## Next Up
1. **MCP Server & Adapter Book-Style Refactor**:
   - Refactor `src/lib/mcp/server.ts` to implement full file/folder CRUD tools (`create_folder`, `read_folder`, `write_file`, `read_file`, `update_file`, `delete_file`, `delete_folder`, `append_commit`).
   - Enhance `driveAdapter.ts` to support arbitrary file paths, folders, and automatic `commit.md` append operations on Google Drive.
   - Enhance `githubAdapter.ts` to support multi-file/folder operations and commit tree management.
2. **Security Fixes**:
   - Add `serviceAccount.json` and credentials to `.gitignore`.
   - Fix `verifyMcpKey` expiration validation in `mcpKeysAdmin.ts`.
   - Fix GitHub token decryption in `server.ts`.
3. **UI Integration Alignment**:
   - Ensure `DriveExplorer.tsx` and `ClaudeMcpHub.tsx` reflect the book-style `notice.md`, `index.md`, `commit.md` hierarchy.

## Roadmap
- **Milestone 1: Documentation & Book-Style Architecture Alignment** *(Current)*
- **Milestone 2: MCP Server & Storage Adapter Implementation**
  - Implement full book-style MCP tools and Drive/GitHub folder-tree adapters.
- **Milestone 3: Drive `commit.md` History Ledger & `index.md` Auto-Sync**
  - Guarantee every Drive mutation appends an entry to `commit.md` and updates `index.md`.
- **Milestone 4: Comprehensive Verification & Security Hardening**
  - Run end-to-end tool calls against test files, verify read-back validation, and verify zero data loss.

## Backlog / Someday
- Git-like diff visualizer in the React UI for Google Drive `commit.md` revisions.
- WebSocket real-time broadcast when an AI agent updates any context file in Drive or GitHub.
- Multi-repo GitHub organization context synchronization.
