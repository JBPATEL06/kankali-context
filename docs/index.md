# Architecture & Codebase Index (`docs/index.md`)

Welcome to the **AI-to-AI Context-Sharing MCP Server & Multi-User Sync Platform**. This document serves as the master navigation index and architectural blueprint for any AI agent or developer reading this codebase.

---

## 📂 Complete Directory Tree & File Mapping

```text
/
├── Dockerfile                  # Multi-stage production container build
├── README.md                   # Quick start and high-level project summary
├── package.json                # Project dependencies (Octokit, Google APIs, MCP SDK)
├── server.ts                   # Express custom backend server & Vite middleware
├── vite.config.ts              # Vite frontend build configuration
├── tsconfig.json               # TypeScript compiler options
├── src/                        # Frontend and backend source code
│   ├── App.tsx                 # Main React user interface
│   ├── main.tsx                # React DOM entry point
│   ├── index.css               # Global Tailwind CSS styles
│   ├── types.ts                # Shared global TypeScript interfaces
│   ├── components/             # Reusable UI components
│   ├── lib/                    # Core business logic and adapters
│   │   ├── firebaseAuth.ts     # Firebase Authentication helper
│   │   ├── firebaseStore.ts    # Firestore persistence utilities
│   │   ├── githubApi.ts        # Client-side GitHub integration helpers
│   │   ├── googleDriveApi.ts   # Client-side Google Drive integration helpers
│   │   ├── initialData.ts      # Default seed context and sample templates
│   │   └── mcp/                # Model Context Protocol (MCP) server & adapters
│   │       ├── authGuard.ts    # Token expiration guard & notification helper
│   │       ├── driveAdapter.ts # Google Drive appDataFolder storage adapter
│   │       ├── githubAdapter.ts# GitHub repository sync adapter
│   │       └── server.ts       # MCP Server handling 4 core tools
│   └── scripts/                # Diagnostic and CLI utility scripts
│       └── verifyAuth.ts       # Standalone token validation diagnostic tool
└── docs/                       # Comprehensive documentation library
    ├── index.md                # Master codebase map and navigation
    ├── product.md              # Product specification & core capabilities
    ├── progress.md             # Development milestone progress & roadmap
    └── issues.md               # Known edge cases, error handling & troubleshooting
```

---

## 🛠 Core Module Reference

1. **`server.ts` (Root)**: The Express server entry point that mounts API routes, Vite middleware for development, and static file serving for production.
2. **`src/lib/mcp/server.ts`**: The Model Context Protocol (MCP) server implementing `get_context`, `update_context`, `sync_to_drive`, and `sync_to_github`. Includes optimistic locking (`version` check) and in-memory session management.
3. **`src/lib/mcp/driveAdapter.ts`**: Integrates the Google Drive API v3 to securely persist and read session JSON files within the hidden `appDataFolder` using OAuth2 refresh tokens.
4. **`src/lib/mcp/githubAdapter.ts`**: Integrates `@octokit/rest` to commit and update session state files in a target GitHub repository branch.
5. **`src/lib/mcp/authGuard.ts`**: Validates token expiration with a 5-minute buffer and triggers email alerts when re-authentication is required.
6. **`src/scripts/verifyAuth.ts`**: CLI tool for testing GitHub PAT and Google Drive tokens before production deployment.
