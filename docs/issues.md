# Known Issues & Troubleshooting (`docs/issues.md`)

## 🛠 Common Edge Cases & Resolutions

### 1. Version Mismatch / Race Conditions
* **Symptom**: `update_context` throws an error: `Version mismatch for session ... Expected version X, but got Y`.
* **Root Cause**: Another AI agent or process updated the context in the interim, incrementing the version counter.
* **Resolution**: The calling agent must call `get_context` to fetch the latest state and version, reapply its patch logic against the new state, and retry `update_context`.

### 2. Google Drive Token Expiration
* **Symptom**: `sync_to_drive` fails with an authentication error.
* **Root Cause**: The user's OAuth2 access/refresh token has expired or been revoked.
* **Resolution**: `authGuard.ts` detects expiration within a 5-minute buffer, triggers an email alert, and rejects the MCP tool call with instructions for the user to re-authenticate via the web interface.

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
