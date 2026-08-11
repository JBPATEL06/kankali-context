# Architecture & Codebase Index (`docs/index.md`)

> Master navigation map for developers and AI agents reading this codebase.

---

## 📂 Directory Tree & File Purpose

```text
/
├── server.ts                    # Express backend — API routes, Vite middleware, MCP SSE endpoints
├── platform.ts                  # Platform adapter (Electron vs Cloud environment abstraction)
├── package.json                 # All dependencies
├── vite.config.ts               # Vite frontend build config
├── tsconfig.json                # TypeScript compiler options
├── firebase-applet-config.json  # Firebase project config (CLIENT-SIDE, safe to commit)
├── firebase-blueprint.json      # Firestore schema definition reference
├── .env                         # 🔒 SECRET — Never commit. Server env vars.
│
├── src/
│   ├── App.tsx                  # Main React app shell — auth state, drive sync, routing
│   ├── main.tsx                 # React DOM entry point
│   ├── index.css                # Global CSS styles
│   ├── types.ts                 # Shared TypeScript interfaces (UserSession, ContextMemory, etc.)
│   │
│   ├── components/
│   │   ├── LoginGate.tsx        # Login/signup screen (Google + Email auth)
│   │   ├── Navbar.tsx           # Top navigation bar
│   │   ├── Sidebar.tsx          # Left navigation sidebar
│   │   ├── DashboardOverview.tsx# Dashboard home screen — stats, activity
│   │   ├── ClaudeMcpHub.tsx     # MCP Hub — generate links, list active MCP cards
│   │   ├── DriveExplorer.tsx    # Google Drive file browser UI
│   │   ├── IntegrationsTab.tsx  # Context Sources — GitHub & Google Drive config
│   │   └── ConfirmationModal.tsx# Generic confirmation dialog
│   │
│   └── lib/
│       ├── firebaseAuth.ts      # Firebase Auth: googleSignIn, emailSignIn, logout
│       ├── firebaseStore.ts     # Firestore CRUD: tokens, config, MCP keys
│       ├── googleDriveApi.ts    # Client-side Drive API: list, upload, download, delete files
│       ├── githubApi.ts         # Client-side GitHub API helpers
│       ├── initialData.ts       # Default seed context memories
│       └── mcp/
│           ├── server.ts        # MCP Server — createServerInstance() factory, all tools registered
│           ├── authGuard.ts     # Token expiry guard (2-min buffer, auto-purge from Firestore)
│           ├── driveAdapter.ts  # Drive appDataFolder: save/read JSON + markdown files
│           └── githubAdapter.ts # GitHub: commit context files using @octokit/rest
│
└── docs/
    ├── index.md                 # THIS FILE — codebase map
    ├── product.md               # Product spec & feature list
    ├── progress.md              # What works, what doesn't, what's next
    └── issues.md                # Known bugs & troubleshooting guide
```

---

## 🔗 Backend API Routes (`server.ts`)

| Method | Route | Purpose | Auth Required |
|---|---|---|---|
| GET | `/api/drive/files` | List Drive files | ✅ Firebase token |
| POST | `/api/drive/sync` | Sync memories to Drive | ✅ Firebase token |
| POST | `/api/github/link` | Save GitHub token & repo to Firestore | ✅ Firebase token |
| POST | `/api/github/sync` | Sync context to GitHub | ✅ Firebase token |
| **POST** | **`/api/mcp/generate-link`** | Generate unique MCP SSE URL for user | ✅ Firebase token |
| **GET** | **`/api/mcp/sse`** | SSE endpoint for AI to connect | 🔑 MCP API key |
| **POST** | **`/api/mcp/message`** | AI sends tool call messages | 🔑 MCP API key |

---

## 🔑 Firestore Collections Schema

| Collection | Document Key | Fields |
|---|---|---|
| `users` | `{uid}` | `email`, `displayName`, `googleAccessToken`, `googleTokenExpiresAt`, `githubToken`, `githubRepo`, `githubBranch` |
| `mcp_keys` | `{mcp_key}` | `userId`, `storageType`, `createdAt` |

---

## 🛠 MCP Tools Reference

| Tool Name | Description | Key Parameters |
|---|---|---|
| `get_context` | Get current session context | `session_id`, `user_id` |
| `update_context` | Patch context with version lock | `session_id`, `user_id`, `patch_data`, `expected_version` |
| `sync_to_drive` | Save context to Drive appDataFolder | `session_id`, `user_id` |
| `sync_to_github` | Commit context to GitHub repo | `session_id`, `user_id`, `file_path` |
| `read_index` | Read `index.md` from Drive | `user_id` |
| `read_notice` | Read `notice.md` from Drive | `user_id` |
| `append_commit` | Append entry to `commits.md` in Drive | `user_id`, `message` |
