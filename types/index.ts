export type Origin = "claude" | "grok" | "user" | string;

export interface UserRecord {
  uid: string;
  email: string;
  name?: string;
  /** AES-encrypted GitHub PAT */
  githubTokenEnc?: string;
  githubOwner?: string;
  githubRepo?: string;
  githubBranch?: string;
  /** ISO date when the PAT expires (null = non-expiring / unknown) */
  tokenExpiresAt?: string | null;
  /** Last time we emailed about expiry */
  expiryEmailSentAt?: string | null;
  /** Random key the user puts in their MCP client */
  mcpApiKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContextFrontmatter {
  origin: Origin;
  domain: string;
  created: string;
  updated: string;
  tags: string[];
  hash: string;
}

export interface ParsedContext {
  frontmatter: ContextFrontmatter;
  body: string;
  raw: string;
  sha?: string;
  path: string;
}

export interface GithubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}
