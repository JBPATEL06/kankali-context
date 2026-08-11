/**
 * Core types for Book-Style Context System & MCP tools.
 */

export interface McpFileItem {
  id?: string;
  name: string;
  path: string;
  mimeType?: string;
  size?: number;
  content?: string;
  createdTime?: string;
  modifiedTime?: string;
  sha?: string; // For GitHub
  webViewLink?: string;
  iconLink?: string;
}

export interface McpFolderItem {
  id?: string;
  name: string;
  path: string;
  parentId?: string;
  createdTime?: string;
  modifiedTime?: string;
  files?: McpFileItem[];
  subfolders?: McpFolderItem[];
}

export interface CommitLogEntry {
  id?: string;
  timestamp: string; // ISO 8601 string
  author?: string;   // e.g., "claude-3-7-sonnet", "user", "agent-x"
  action: 'create' | 'update' | 'delete' | 'move' | 'sync';
  targetPath: string; // Absolute path within context tree (e.g. "/architecture/tech-stack.md")
  summary: string;    // Commit summary message
  sha?: string;       // File SHA or drive revision ID
  metadata?: Record<string, any>;
}

export interface BookStyleIndexEntry {
  name: string;
  path: string;
  description: string;
  updatedAt?: string;
}

export interface BookStyleIndex {
  title?: string;
  description?: string;
  noticePath?: string;
  commitLedgerPath?: string;
  entries: BookStyleIndexEntry[];
  rawMarkdown?: string;
}

export interface ContextPayload {
  metadata: {
    version: number;
    last_updated: string;
    [key: string]: any;
  };
  working_memory: Record<string, any>;
  tasks: any[];
  [key: string]: any;
}
