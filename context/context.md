# Project Context

## Overview
AI-to-AI Context-Sharing MCP Server & Multi-User Sync Platform that allows independent AI agents to store and sync contextual memory using Google Drive and GitHub.

## Tech Stack
TypeScript, Node.js, Express, React, Vite, Model Context Protocol (MCP) SDK, Firebase (Firestore & Auth), Google Drive API, GitHub API.

## Current Status
Firebase token storage implemented. Token expiration guard (strict < 2 mins) in place. MCP Server tools expanded with `read_index`, `read_notice`, and `append_commit`. Web HTTP SSE endpoint live for AI client connections. MCP API key admin module (`mcpKeysAdmin.ts`) added for managing MCP keys via Firestore. Auth guard refactored for improved route protection.

## Architecture / Key Decisions
- **Firebase over Local Storage**: All tokens (Google Drive, GitHub) are persisted to Firestore instead of a local SQLite database, allowing future cloud scalability.
- **Strict Token Expiry (< 2 minutes)**: To prevent race conditions during auth, tokens expiring within 2 minutes are automatically cleared from the DB and the AI is instructed to prompt the user to re-login.
- **Server-Side Token Loading**: AI agents now pass `user_id` instead of raw tokens in their MCP tool calls; the server handles fetching and validating credentials from Firebase.

## Folder / File Map
- `src/lib/mcp/server.ts`: MCP Server with context sync & MD tools.
- `src/lib/mcp/authGuard.ts`: MCP route protection & token expiration validation.
- `src/lib/firebaseStore.ts`: Node.js-safe Firestore interactions for the backend.
- `src/lib/mcpKeysAdmin.ts`: Admin module for managing MCP API keys in Firestore.
- `src/lib/mcp/driveAdapter.ts`: Google Drive appDataFolder JSON/Markdown persistence.
- `serviceAccount.json`: Firebase service account credentials — **gitignored, never commit**.

## Open Issues / TODO
- Add WebSocket support for real-time multi-agent notification broadcasts.

## Next Steps
- Implement automatic `user_id` injection in the SSE connection handler (AI should not need to pass it manually).
- Add WebSocket support for real-time multi-agent notification broadcasts.
- Verify the MCP keys admin flow end-to-end in the UI.
