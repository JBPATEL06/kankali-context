# Product Specification (`docs/product.md`)

## 🎯 Vision & Purpose
The **AI-to-AI Context-Sharing MCP Server** is designed to enable multiple independent AI agents (and human operators) to seamlessly collaborate, read, patch, and synchronize working memory, tasks, and state across sessions without race conditions or data loss.

---

## 🔑 Core Capabilities & Tools

### 1. `get_context`
* **Purpose**: Retrieves the current shared context payload for a given session.
* **Behavior**: Looks up the session in memory. If not found, initializes a default structured payload with metadata version `1`.

### 2. `update_context`
* **Purpose**: Patches working memory, tasks, or shared state with built-in optimistic locking.
* **Parameters**: `session_id`, `patch_data`, `expected_version`.
* **Safety Mechanism**: Verifies `expected_version === current.metadata.version`. If valid, increments version by `1`, updates `last_updated`, and applies the patch. If invalid, rejects with a version mismatch error preventing Model B from overwriting Model A's changes.

### 3. `sync_to_drive`
* **Purpose**: Persists session state to the user's private Google Drive `appDataFolder`.
* **Authentication**: Utilizes server-level `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` combined with the user's individual OAuth2 `refresh_token`.
* **Guard**: Validates token expiration via `authGuard.ts` before execution.

### 4. `sync_to_github`
* **Purpose**: Commits session payloads to a designated GitHub repository and file path (defaulting to `.context/{session_id}.json`).
* **Authentication**: Uses a GitHub Personal Access Token (PAT).
* **Versioning**: Automatically checks existing file `sha` to perform clean updates via `@octokit/rest`.

---

## 👥 Multi-User & Security Architecture
* **Server-Level Secrets**: Client IDs and API secrets are stored securely in environment variables.
* **User-Level Tokens**: End-users authenticate through standard Google OAuth flows to grant isolated access to their `appDataFolder`.
* **Token Expiration Guards**: Automatic detection of expired tokens with simulated email alerting (`sendExpirationEmail`).
