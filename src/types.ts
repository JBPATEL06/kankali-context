export type ContextCategory = 'system_prompt' | 'fact_memory' | 'chat_history' | 'code_artifact';

export type PlatformType = 'claude' | 'claude_mcp' | 'grok' | 'chatgpt' | 'gemini' | 'all';

export interface ContextMemory {
  id: string;
  title: string;
  category: ContextCategory;
  summary: string;
  content: string;
  tags: string[];
  platforms: PlatformType[];
  
  // Platform specific formatted strings
  claudeFormat?: string;
  grokFormat?: string;
  openAiFormat?: string;
  geminiFormat?: string;

  // Drive sync details
  driveFileId?: string;
  driveFileName?: string;
  lastSyncedAt?: string;

  // Agent Provenance & Namespacing
  createdByAgent?: string;
  agentNamespace?: string;

  createdAt: string;
  updatedAt: string;
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  parentId?: string;
  webViewLink?: string;
  iconLink?: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
  createdByAgent?: string;
  agentNamespace?: string;
  verifiedSaved?: boolean;
}

export interface DriveFolderItem {
  id: string;
  name: string;
  parentId?: string;
  mimeType: 'application/vnd.google-apps.folder';
  createdTime?: string;
  modifiedTime?: string;
  createdByAgent?: string;
  agentNamespace?: string;
}

export interface VaultNode {
  id: string;
  name: string;
  isFolder: boolean;
  mimeType: string;
  parentId?: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  createdByAgent?: string;
  agentNamespace?: string;
  children?: VaultNode[];
}

export type SyncState = 'idle' | 'syncing' | 'success' | 'error';

export interface UserSession {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  accessToken: string | null;
}

export interface PlatformConfig {
  id: PlatformType;
  name: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  promptStyleName: string;
  description: string;
}
