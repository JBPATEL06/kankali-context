# Project Context

## Overview
AI-to-AI Context-Sharing MCP Server & Multi-User Sync Platform that allows independent AI agents to store and sync contextual memory using Google Drive and GitHub.

## Tech Stack
TypeScript, Node.js, Express, React, Vite, Model Context Protocol (MCP) SDK, Firebase (Firestore & Auth), Google Drive API, GitHub API.

## Current Status
Firebase token storage implemented. Token expiration guard (strict < 2 mins) implemented for Drive and GitHub. MCP Server tools expanded with `read_index`, `read_notice`, and `append_commit`. Added Web HTTP SSE Endpoint for connecting AI clients and generating custom MCP links via the UI.

## Architecture / Key Decisions
- **Firebase over Local Storage**: All tokens (Google Drive, GitHub) are persisted to Firestore instead of a local SQLite database, allowing future cloud scalability.
- **Strict Token Expiry (< 2 minutes)**: To prevent race conditions during auth, tokens expiring within 2 minutes are automatically cleared from the DB and the AI is instructed to prompt the user to re-login.
- **Server-Side Token Loading**: AI agents now pass `user_id` instead of raw tokens in their MCP tool calls; the server handles fetching and validating credentials from Firebase.

## Folder / File Map
- `src/lib/mcp/server.ts`: The MCP Server implementation with context sync & MD tools.
- `src/lib/mcp/authGuard.ts`: Token expiration validation logic.
- `src/lib/firebaseStore.ts`: Node.js-safe Firestore interactions for the backend server.
- `src/lib/mcp/driveAdapter.ts`: Integrates with Google Drive appDataFolder for JSON and Markdown persistence.

## Open Issues / TODO
- Add WebSocket support for real-time multi-agent notification broadcasts.

## Next Steps
- Verify the Web MCP SSE flow in the UI.
- Implement AI `user_id` injection or authentication flow inside the SSE connection so that tools know which user is authenticated.
