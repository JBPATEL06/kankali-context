# Task: Close Verification Gaps in Book-Style MCP Implementation

## Context
The Book-Style Context System refactor (hierarchical MCP file/folder tools across Google Drive and GitHub) has been implemented and most of the originally scoped bugs are confirmed fixed in code: the `read_index`/`append_commit` legacy fallback is gone, `sync_to_github`'s token-decryption bug is fixed in `bookStyleTools.ts`, `isTokenExpired` and `verifyMcpKey` correctly check expiration, and tool registration is properly modularized into `src/lib/mcp/tools/bookStyleTools.ts`.

A follow-up code review against the live repo (`github.com/JBPATEL06/kankali-context`) found one new bug and three verification gaps that were missed in the first pass. Fix these now.

## 1. Fix silent token-decryption fallback in `server.ts`
**File:** `server.ts` (repo root), function `getGithubClient()`, ~L104-120.

**Current bug:**
```ts
if (config.encryptedGithubToken) {
  try {
    token = decryptToken(config.encryptedGithubToken);
  } catch {
    token = config.encryptedGithubToken; // BUG: falls back to raw ciphertext as if it were a valid token
  }
} else {
  token = config.githubToken || "";
}
```
If decryption throws, this silently uses the **still-encrypted ciphertext** as the GitHub auth token instead of failing explicitly. This violates the "Fail-Safe Token Handling: zero silent failures" directive in `docs/notice.md`, and it's the same class of bug (silent token misuse) that was already fixed once in `bookStyleTools.ts`'s `sync_to_github` path — this is a second, previously-missed instance in the root `server.ts`.

**Required fix:**
- Remove the catch-and-fallback. If `decryptToken()` throws, propagate a clear, explicit error (e.g. `throw new Error("GitHub token could not be decrypted. Please re-link your GitHub account.")`) rather than constructing an `Octokit` client with an invalid token.
- Do not swallow the error anywhere upstream of the caller — the caller needs to see this failure and surface a re-auth prompt, per the fail-safe token handling standard.
- Search the rest of `server.ts` and `src/lib/mcp/**` for the same pattern (`catch { token = <still-encrypted value> }` or any catch block that assigns an undecrypted secret to a variable subsequently used as a live credential) and fix any other occurrences found.

## 2. Add read-back verification to GitHub writes
**File:** `src/lib/mcp/githubAdapter.ts`, method `write_file()`.

**Gap:** `docs/notice.md` requires read-back verification on **both** Drive and GitHub writes ("All Drive/GitHub writes must be verified via read-back before returning success"). `driveAdapter.ts`'s `write_file` implements this correctly (3-attempt retry loop comparing written vs. read-back content). `githubAdapter.ts`'s `write_file` does not — it trusts the Octokit `createOrUpdateFileContents` response and returns immediately.

**Required fix:**
- After `createOrUpdateFileContents` succeeds, call `octokit.repos.getContent()` again for the same path/ref and confirm the returned (base64-decoded) content matches what was written.
- Follow the same retry pattern already used in `driveAdapter.ts` (up to 3 attempts with a short backoff) rather than inventing a new pattern — keep the two adapters consistent.
- On verification failure after all retries, throw an explicit error (matching Drive's `Read-back verification failed for '${filePath}'...` message style) rather than returning success.
- Apply the same read-back check to `delete_file()` — confirm the file is actually gone (a subsequent `getContent` should 404) before returning `{ success: true }`.

## 3. Add test coverage for `index.md` auto-sync
**File:** `src/scripts/testBookStyleMcp.ts`, section 5 (DriveAdapter End-to-End CRUD tests).

**Gap:** `sync_index()` is implemented and wired into `driveAdapter.ts`'s `write_file`, but no test asserts on `index.md` content — only `commit.md` is checked.

**Required fix:** After the existing `write_file('/architecture/tech-stack.md', ...)` test step, add:
```ts
console.log('Testing index.md auto-sync...');
const indexRes = await driveAdapter.read_file('index.md');
assert(indexRes.content.includes('/architecture/tech-stack.md'), 'index.md contains newly written file path');
```
Also add a corresponding check after `delete_file` that `index.md` reflects the removal (per `sync_index`'s `'remove'` action).

## 4. Add GitHub adapter test coverage
**File:** `src/scripts/testBookStyleMcp.ts`.

**Gap:** The entire test suite exercises `DriveAdapter` only, against a mocked Drive client. `GitHubAdapter` has zero test coverage.

**Required fix:** Add a new section (e.g. "8. Testing GitHubAdapter End-to-End CRUD with Read-Back Verification") that:
- Mocks the Octokit client the same way `createMockDriveClient()` mocks Drive (inspect that helper and mirror its pattern for GitHub's `getContent` / `createOrUpdateFileContents` / `deleteFile` calls).
- Exercises `write_file`, `read_file`, `list_folder`, and `delete_file` end-to-end against the mock.
- Explicitly asserts the new read-back verification from item 2 above actually runs and would catch a mismatch (e.g. a test case where the mock returns different content on read-back than what was written, and the adapter is asserted to throw).

## 5. Add error-path / negative test coverage
**File:** `src/scripts/testBookStyleMcp.ts`.

**Gap:** All current tests are happy-path. `docs/notice.md`'s fail-safe token handling standard implies these failure modes should be explicitly verified, not just implemented.

**Required fix:** Add test cases for:
- Calling `read_file` / `write_file` with an invalid/nonexistent path — assert an explicit error is thrown, not a silent empty result.
- Calling a tool that requires GitHub auth when `encryptedGithubToken` is absent — assert the existing `"No linked GitHub account found..."` error surfaces.
- Simulating a token-decryption failure (mock `platform.decryptSecret` to throw) and asserting `getGithubClient()` now throws explicitly per the item-1 fix, rather than constructing a client with bad credentials.

## Verification
Run `npx tsx src/scripts/testBookStyleMcp.ts` and `npx tsc --noEmit` after all changes. All new assertions (index.md sync, GitHub CRUD, GitHub read-back failure case, error-path cases) must pass, in addition to the existing suite. Report the full console output, not just a pass/fail summary — the read-back and error-path assertions in particular should show their actual comparison values on failure.

## Deliverable
Updated `server.ts`, `githubAdapter.ts`, and `testBookStyleMcp.ts`, plus full test run output confirming all five items above are resolved and covered.