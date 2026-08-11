# Notice & Context Directives (`docs/notice.md`)

## 📌 Core Operational Directives

### 1. Storage & Multi-Format Context
- Context is stored across **Google Drive** and **GitHub**.
- Context files are formatted as Markdown (`.md`), JSON (`.json`), or other formats (e.g., XML, YAML, TXT) depending on the case scenario.
- AI agents and users interact with a hierarchical file and folder tree:
  - Create folder & file
  - Read folder (list tree/contents) & read file
  - Update file & folder (rename/move)
  - Delete file & folder

---

### 2. Book-Style Context Management Architecture
Context repositories in Google Drive and GitHub follow a structured **Book Style**:

```text
/ (Context Root)
├── notice.md        # Active operational directives, rules, and system notices
├── index.md         # Master catalog / Table of Contents (what is where and why)
├── commit.md        # Append-only work and revision history (critical for Google Drive)
└── <folders>/       # Categorized memory, tasks, architecture, and agent topics
    └── <files>      # Topic-specific Markdown/JSON context documents
```

#### File Roles:
1. **`notice.md`**: Top-level directives and immediate active constraints for agents working in this context.
2. **`index.md`**: The master table of contents. Informs AI agents and human users which document answers which question, preventing full-tree blind scanning.
3. **`commit.md`**: Since Google Drive lacks native Git commit history, `commit.md` serves as an append-only audit trail logging every modification (timestamp, author/agent, action, target path, and summary description).

---

### 3. MCP Command Requirements
The MCP server must expose granular file and folder tools for cloud context operations:
- `create_folder` / `create_file` (or `write_file`)
- `read_folder` (directory listing) / `read_file`
- `update_file`
- `delete_file` / `delete_folder`
- `append_commit` (for Drive work history logging)
- `sync_to_github` / `sync_to_drive`

---

### 4. Engineering Standards (Senior Dev Guidance)
- **Atomic Operations & Read-Back Verification**: All Drive/GitHub writes must be verified via read-back before returning success.
- **Fail-Safe Token Handling**: Explicit errors on token expiration with clear re-auth instructions; zero silent failures.
- **Strict Separation of Concerns**: DriveAdapter, GitHubAdapter, and MCP Server layer must remain modular, type-safe, and independent.
