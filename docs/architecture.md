# Architecture

## Tech Stack
- **Languages & Runtime**: TypeScript, Node.js (v18+)
- **Backend & APIs**: Express.js, Model Context Protocol (`@modelcontextprotocol/sdk`)
- **Frontend**: Vite, React 18, Tailwind CSS, Lucide React icons
- **Cloud & Storage Integrations**:
  - Google Drive API v3 (`googleapis` & REST multipart uploads with boundary validation)
  - GitHub REST API (`@octokit/rest`)
  - Firebase Authentication & Cloud Firestore
- **Security & Crypto**: Node.js `crypto` (AES-256-GCM for encrypted token secrets)

## Key Decisions
- **Book-Style Context Organization**: Context is structured as an indexable book root containing `notice.md` (active directives), `index.md` (navigation catalog), `commit.md` (Drive work audit trail), and topic subfolders with `.md`/`.json` documents.
- **Granular MCP File & Folder Commands**: MCP tools handle atomic file and folder operations (`create_folder`, `read_folder`, `write_file`, `read_file`, `update_file`, `delete_file`, `delete_folder`, `append_commit`) alongside repository sync.
- **Google Drive `commit.md` Ledger**: Because Google Drive does not provide git-like commit logs, an append-only `commit.md` ledger tracks who modified what, when, and why on Drive writes.
- **Read-Back Verification**: All file writes to Google Drive and GitHub execute immediate read-back checks to guarantee consistency before returning success.
- **Strict Multi-Tenant Isolation**: User tokens are decoupled from server-level secrets; secrets are encrypted at rest with user-isolated Firestore configs.

## Folder / File Map
- `src/lib/mcp/`: MCP server implementation, transport handlers, and storage adapters.
  - `server.ts`: MCP server exposing book-style file/folder and sync tools.
  - `driveAdapter.ts`: Google Drive v3 adapter for folder and file CRUD + `commit.md` tracking.
  - `githubAdapter.ts`: Octokit adapter for repo file/folder commits and sync.
  - `authGuard.ts`: Token expiration validation and notification guards.
- `src/lib/`: Core helpers (`googleDriveApi.ts`, `githubApi.ts`, `firebaseStore.ts`, `firebaseAuth.ts`).
- `src/components/`: React UI components (`DriveExplorer.tsx`, `ClaudeMcpHub.tsx`, `IntegrationsTab.tsx`, `DashboardOverview.tsx`).
- `server.ts`: Express backend serving APIs and Vite static bundle.
- `docs/`: Master documentation following docs management rules.
