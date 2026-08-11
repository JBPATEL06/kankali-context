# Known Issues & Troubleshooting (`docs/issues.md`)

## 🛠 Common Edge Cases & Resolutions

### 1. Version Mismatch / Race Conditions
* **Symptom**: `update_context` throws an error: `Version mismatch for session ... Expected version X, but got Y`.
* **Root Cause**: Another AI agent or process updated the context in the interim, incrementing the version counter.
* **Resolution**: The calling agent must call `get_context` to fetch the latest state and version, reapply its patch logic against the new state, and retry `update_context`.

### 2. Google Drive / GitHub Token Expiration & Re-authentication
* **Symptom**: `sync_to_drive`, `sync_to_github`, or file tool calls fail with authentication errors.
* **Root Cause**: The user's OAuth2 access/refresh token or GitHub PAT has expired, been revoked, or is missing.
* **Resolution**: `authGuard.ts` detects expiration within a 2-minute buffer. MCP tools do not fail silently; they throw explicit `McpError` messages instructing the user to open the Kankali web UI and re-authenticate, while clearing invalid tokens and triggering expiration notification emails.

### 3. GitHub File SHA Conflicts
* **Symptom**: `sync_to_github` returns a `422 Unprocessable Entity` error.
* **Root Cause**: Updating an existing file without providing the correct `sha` of the current file version on the target branch.
* **Resolution**: `GitHubAdapter` automatically fetches existing file content and `sha` prior to calling `createOrUpdateFileContents`. Ensure the token has `repo` write permissions.

---

## 🔍 Diagnostic Commands
To verify credentials before running the server, execute:
```bash
npx tsx src/scripts/verifyAuth.ts
```
*(Ensure `GITHUB_PAT` and `GOOGLE_DRIVE_ACCESS_TOKEN` environment variables are set).*
