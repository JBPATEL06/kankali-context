import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import os from "os";
import fs from "fs";
import net from "net";
import { Octokit } from "@octokit/rest";
import { AsyncLocalStorage } from "async_hooks";
import { ElectronPlatformAdapter, CloudPlatformAdapter, PlatformAdapter, UserConfig as AppConfig } from "./platform";
import { createServerInstance } from "./src/lib/mcp/server";
import crypto from "crypto";

dotenv.config();

let safeStorage: any = null;
try {
  safeStorage = require("electron").safeStorage;
} catch (e) {
  // safeStorage not available
}

const isCloud = process.env.KANKALI_MODE === "cloud";
export let platform: PlatformAdapter;

try {
  if (isCloud) {
    platform = new CloudPlatformAdapter();
  } else {
    platform = new ElectronPlatformAdapter();
  }
} catch (err: any) {
  console.error("[FATAL] Configuration initialization failed:", err.message);
  process.exit(1);
}

// Global configuration store for Local Mode, and request-scoped config storage for Cloud Mode
export const configStorage = new AsyncLocalStorage<AppConfig>();
export let globalConfig: AppConfig = {};

// Load default local config file
const CONFIG_DIR = path.join(os.homedir(), ".kankali");
export const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}
if (fs.existsSync(CONFIG_PATH)) {
  try {
    globalConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (e) {
    console.error("Failed to parse config file, starting fresh:", e);
  }
}

// Proxy configuration object to dynamically resolve properties from AsyncLocalStorage (multi-tenant)
// or fall back to the globalConfig object in Local/Electron mode.
export const config = new Proxy({}, {
  get(target, prop) {
    const store = configStorage.getStore();
    const activeConfig = store || globalConfig;
    return (activeConfig as any)[prop];
  },
  set(target, prop, value) {
    const store = configStorage.getStore();
    const activeConfig = store || globalConfig;
    (activeConfig as any)[prop] = value;
    return true;
  }
}) as AppConfig;

export async function persistCurrentConfig(userId: string) {
  const store = configStorage.getStore();
  if (store && userId !== "local-user") {
    await platform.getUserStore().saveUserConfig(userId, store);
  } else if (!isCloud) {
    await platform.getUserStore().saveUserConfig("local-user", globalConfig);
  }
}

export function encryptToken(token: string): string {
  return platform.encryptSecret(token);
}

export function decryptToken(encryptedBase64: string): string {
  return platform.decryptSecret(encryptedBase64);
}

function getLinkedGithubDetails() {
  let owner = config.linkedRepo?.owner;
  let repo = config.linkedRepo?.name;
  let branch = config.linkedRepo?.defaultBranch || config.githubBranch || "main";

  if (!owner || !repo) {
    if (config.githubRepo && config.githubRepo.includes("/")) {
      const parts = config.githubRepo.split("/");
      owner = parts[0];
      repo = parts[1];
    }
  }

  return { owner, repo, branch };
}

function getGithubClient(): Octokit {
  const rawToken = config.encryptedGithubToken || config.githubToken;
  if (!rawToken) {
    throw new Error("No linked GitHub account found. Please link your account first in the Kankali Context Hub UI.");
  }
  let token = "";
  if (config.encryptedGithubToken) {
    try {
      token = decryptToken(config.encryptedGithubToken);
    } catch {
      token = config.encryptedGithubToken;
    }
  } else {
    token = config.githubToken || "";
  }
  return new Octokit({ auth: token });
}

export function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => {
      resolve(false);
    });
    server.once("listening", () => {
      server.close(() => {
        resolve(true);
      });
    });
    server.listen(port, "127.0.0.1");
  });
}

export async function findFreePort(startPort: number): Promise<number> {
  let port = startPort;
  while (!(await isPortAvailable(port))) {
    port++;
  }
  return port;
}

const app = express();
app.set("trust proxy", true);
let PORT = 4577;

app.use(express.json({ limit: "10mb" }));

const rateLimitWindow = 15 * 60 * 1000;
const rateLimitMax = 100;
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function rateLimiter(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (process.env.KANKALI_MODE !== "cloud") {
    return next();
  }
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  let client = rateLimitStore.get(ip);
  if (!client || now > client.resetTime) {
    client = { count: 0, resetTime: now + rateLimitWindow };
  }
  client.count++;
  rateLimitStore.set(ip, client);
  if (client.count > rateLimitMax) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }
  next();
}

async function getUserIdFromRequest(req: express.Request): Promise<string> {
  if (process.env.KANKALI_MODE !== "cloud") {
    return "local-user";
  }
  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.match(/session_token=([^;]+)/);
  if (!match) return "anonymous";
  const token = match[1];
  try {
    const admin = require("firebase-admin");
    if (admin.apps.length === 0) {
      admin.initializeApp();
    }
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded.uid;
  } catch (err) {
    console.error("Firebase ID Token verification failed:", err);
    return "anonymous";
  }
}

async function multiTenantMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  let userId = "local-user";
  let userConfig: AppConfig = globalConfig;

  const isMcpRoute = req.path.startsWith("/api/mcp") || req.path.startsWith("/mcp");

  if (isCloud) {
    const userApiKey = req.params.userApiKey;
    if (userApiKey) {
      const resolved = await platform.getUserStore().getUserConfigByApiKey(userApiKey);
      if (resolved) {
        userId = resolved.userId;
        userConfig = resolved.config;
      } else if (!isMcpRoute) {
        return res.status(401).json({ error: "Invalid API Key" });
      }
    } else {
      userId = await getUserIdFromRequest(req);
      if (userId === "anonymous") {
        const queryUser = (req.query.user || req.query.userId || req.headers["x-user-profile"]) as string;
        if (queryUser) {
          userId = queryUser;
          userConfig = await platform.getUserStore().getUserConfig(userId);
        } else if (req.path.startsWith("/api/") && !isMcpRoute) {
          return res.status(401).json({ error: "Unauthorized" });
        }
      } else {
        userConfig = await platform.getUserStore().getUserConfig(userId);
      }
    }
  }

  configStorage.run(userConfig, () => {
    (req as any).userId = userId;
    next();
  });
}

// Helper function to resolve public host behind Cloud Run / Nginx
function getPublicHost(req: express.Request): string {
  const xfh = req.headers["x-forwarded-host"];
  if (xfh) {
    const host = Array.isArray(xfh) ? xfh[0] : xfh.split(",")[0].trim();
    if (host) return host;
  }
  const reqHost = req.get("host");
  if (reqHost && !reqHost.startsWith("0.0.0.0") && !reqHost.startsWith("127.0.0.1")) {
    return reqHost;
  }
  return reqHost || "localhost:3000";
}

// Helper function to resolve secure protocol (https) behind Cloud Run / Nginx
function getProtocol(req: express.Request): string {
  const xfp = req.headers["x-forwarded-proto"];
  if (xfp) {
    const proto = Array.isArray(xfp) ? xfp[0] : xfp.split(",")[0].trim();
    if (proto) return proto;
  }
  const host = getPublicHost(req);
  if (host.includes(".run.app") || host.includes(".ai.studio")) {
    return "https";
  }
  return req.protocol || "https";
}

// Enable CORS for external MCP integrations (Claude.ai Web, Custom Connectors, Claude Desktop)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, mcp-version");
  res.setHeader("Access-Control-Expose-Headers", "*");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Lazy init Gemini AI
let aiClient: GoogleGenAI | null = null;
function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is missing.");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

// Shared Helpers for Directory Index Modification & Parsing
export function addEntryToCatalogContent(indexContent: string, filePath: string, description: string): string {
  const lines = indexContent.split("\n");
  const cleanPath = filePath.replace(/^\/+/g, "");
  const targetLink = `(file:///${cleanPath})`;
  const newLine = `- [${cleanPath.split("/").pop()}]${targetLink}: ${description}`;

  let entryUpdated = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(targetLink)) {
      lines[i] = newLine;
      entryUpdated = true;
      break;
    }
  }

  if (!entryUpdated) {
    let entriesIdx = lines.findIndex(l => l.trim().startsWith("## Entries") || l.trim().startsWith("## Chapters"));
    if (entriesIdx !== -1) {
      lines.splice(entriesIdx + 1, 0, newLine);
    } else {
      lines.push(newLine);
    }
  }

  return lines.join("\n");
}

export function removeEntryFromCatalogContent(indexContent: string, filePath: string): string {
  const lines = indexContent.split("\n");
  const cleanPath = filePath.replace(/^\/+/g, "");
  const targetLink = `(file:///${cleanPath})`;

  const filtered = lines.filter(l => !l.includes(targetLink));
  return filtered.join("\n");
}

// Pending approvals map for secure out-of-band user approval
export const pendingApprovals = new Map<string, { toolName: string; path: string; reason: string; status: "pending" | "approved" | "rejected"; expiresAt: number }>();

export async function verifyApproval(
  req: any,
  res: any,
  id: any,
  toolName: string,
  args: any,
  getOldContent?: () => Promise<string | null>
): Promise<boolean> {
  const isDestructiveTool = toolName === "delete_file" || toolName === "delete_folder";
  let isDestructiveWrite = false;

  if (toolName === "write_file" && getOldContent) {
    const filePath = (args.path || "").replace(/^\/+/g, "");
    const fileName = filePath.split("/").pop() || "";
    if (fileName.toLowerCase() === "index.md") {
      try {
        const oldContent = await getOldContent();
        if (oldContent) {
          const oldLines = oldContent.split("\n").map(l => l.trim()).filter(Boolean);
          const newLines = (args.content || "").split("\n").map(l => l.trim()).filter(Boolean);
          const isReduction = oldLines.some(ol => {
            return ol.includes("file:///") && !newLines.includes(ol);
          });
          if (isReduction) {
            isDestructiveWrite = true;
          }
        }
      } catch (e) {
        // file doesn't exist yet, so it's additive/new. Auto-approved.
      }
    }
  }

  if (isDestructiveTool || isDestructiveWrite) {
    const token = args.confirmationToken || "";
    const reason = args.reason || "";

    if (!token) {
      const approvalId = "apprv_" + Math.random().toString(36).substring(2, 11);
      pendingApprovals.set(approvalId, {
        toolName,
        path: args.path || "",
        reason: reason || "No reason specified by AI.",
        status: "pending",
        expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes expiry
      });

      sendMcpResponse(req, res, {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{
            type: "text",
            text: `[APPROVAL REQUIRED] The action '${toolName}' on '${args.path || ""}' is a destructive action that deletes files or restructures index catalogs.
Your request has been queued under approval ID: '${approvalId}'.
Please ask the user to approve this request via the Kankali dashboard UI. The user must approve it before you can call this tool again.
Once they click Approve in the UI, call this tool again with both 'reason' and 'confirmationToken': '${approvalId}'.`
          }]
        }
      });
      return false;
    }

    const apprv = pendingApprovals.get(token);
    if (!apprv || apprv.status !== "approved" || apprv.expiresAt < Date.now()) {
      sendMcpResponse(req, res, {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{
            type: "text",
            text: `[REJECTED] The confirmation token '${token}' is either invalid, expired, or has not been approved by the user yet. Please ask the user to approve the pending request in the Kankali UI.`
          }]
        }
      });
      return false;
    }

    // Token successfully verified and consumed!
    pendingApprovals.delete(token);
  }

  return true;
}

// Server-side Google Drive API Helpers
export async function resolveDrivePath(
  accessToken: string,
  rootFolderId: string,
  pathStr: string,
  options: { createIfMissing?: boolean; isFolder?: boolean } = {}
): Promise<{ id: string; exists: boolean }> {
  const parts = pathStr.split("/").filter(Boolean);
  let currentParentId = rootFolderId;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isLast = i === parts.length - 1;
    const searchMime = (!isLast || options.isFolder)
      ? "mimeType = 'application/vnd.google-apps.folder'"
      : "mimeType != 'application/vnd.google-apps.folder'";

    const query = encodeURIComponent(`'${currentParentId}' in parents and name = '${part}' and ${searchMime} and trashed = false`);
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`;
    const response = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
      throw new Error(`Google Drive API path resolution error: ${response.statusText}`);
    }
    const data = await response.json();
    if (data.files && data.files.length > 0) {
      currentParentId = data.files[0].id;
    } else {
      if (options.createIfMissing && (!isLast || options.isFolder)) {
        const createUrl = "https://www.googleapis.com/drive/v3/files";
        const meta = {
          name: part,
          mimeType: "application/vnd.google-apps.folder",
          parents: [currentParentId]
        };
        const createRes = await fetch(createUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(meta)
        });
        if (!createRes.ok) {
          throw new Error(`Failed to create intermediate folder '${part}'`);
        }
        const newFolder = await createRes.json();
        currentParentId = newFolder.id;
      } else {
        return { id: "", exists: false };
      }
    }
  }

  return { id: currentParentId, exists: true };
}

export async function readDriveFile(accessToken: string, fileId: string): Promise<string> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    throw new Error(`Failed to read file from Drive: ${res.statusText}`);
  }
  return await res.text();
}

export async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete file from Drive: ${res.statusText}`);
  }
}

// Recursive Drive backup helper
export async function backupIndexFilesRecursively(token: string, folderId: string) {
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType)`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return;
  const data = await res.json();
  const items = data.files || [];

  let indexFileId = "";
  let indexBakFileId = "";

  for (const item of items) {
    if (item.mimeType === "application/vnd.google-apps.folder") {
      await backupIndexFilesRecursively(token, item.id);
    } else if (item.name === "index.md") {
      indexFileId = item.id;
    } else if (item.name === "index.bak") {
      indexBakFileId = item.id;
    }
  }

  if (indexFileId) {
    try {
      const content = await readDriveFile(token, indexFileId);
      await uploadToDriveWithVerification(
        token,
        folderId,
        "index.bak",
        content,
        indexBakFileId || undefined
      );
    } catch (err) {
      console.warn(`[Backup] Failed to backup index.md in folder ${folderId}:`, err);
    }
  }
}

// Periodic index.bak sync timer for Drive backend (crawls all subfolders recursively)
let driveBackupTimer: NodeJS.Timeout | null = null;
export function startDriveBackupTimer() {
  if (driveBackupTimer) clearInterval(driveBackupTimer);

  driveBackupTimer = setInterval(async () => {
    const token = await getDriveAccessToken();
    if (!token) return;
    try {
      const hubFolderId = await getOrCreateDriveFolderServer(token, DRIVE_FOLDER_NAME, "root");
      await backupIndexFilesRecursively(token, hubFolderId);
      console.log("[Backup] Successfully completed recursive sync of all index.bak catalog backups on Google Drive.");
    } catch (e) {
      console.warn("[Backup] Failed to run recursive index backup on Drive:", e);
    }
  }, 10 * 60 * 1000); // 10 minutes
  console.log("[Backup] Google Drive recursive index.bak sync timer started.");
}

// Trigger Drive backup manually
app.post("/api/mcp/trigger-backup", async (req, res) => {
  const token = await getDriveAccessToken();
  if (!token) return res.status(400).json({ error: "No Drive access token." });
  try {
    const hubFolderId = await getOrCreateDriveFolderServer(token, DRIVE_FOLDER_NAME, "root");
    await backupIndexFilesRecursively(token, hubFolderId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "Agentic AI Context Hub API", mcpServer: "Claude Model Context Protocol Enabled" });
});

app.use("/api", multiTenantMiddleware);

// In-memory context store for MCP server
let mcpMemories: any[] = [
  {
    id: "ctx-001",
    title: "Claude Senior Full-Stack Architect Persona",
    category: "system_prompt",
    summary: "Core agent identity specifying clean code principles, TypeScript 5+, React 19, and Tailwind CSS rules.",
    content: "You are a Senior Full-Stack Software Architect specializing in TypeScript, React 19, and Express. Always write production-ready code with clean architecture, strict error handling, modular UI components, and modern Tailwind CSS. Maintain complete relative context awareness across sessions.",
    tags: ["persona", "coding", "typescript", "architecture"],
    platforms: ["claude"],
    claudeFormat: `<system>\n  <persona>Senior Full-Stack Software Architect</persona>\n  <guidelines>\n    <rule>Always write production-ready TypeScript with strict types</rule>\n    <rule>Follow modular React 19 component patterns</rule>\n    <rule>Utilize Tailwind CSS utility styling with zero bloat</rule>\n    <rule>Store relative memory context rather than full raw chat transcripts</rule>\n  </guidelines>\n</system>`,
    updatedAt: new Date().toISOString()
  },
  {
    id: "ctx-002",
    title: "Developer Preferences & Stack Rules",
    category: "fact_memory",
    summary: "Persistent user preferences regarding coding style, preferred libraries, and Google Cloud hosting.",
    content: "User prefers functional React with TypeScript, Vite build tool, Tailwind CSS, Google Drive for cloud backup, and dark executive slate UI themes. Prefers explicit code examples over conversational fluff.",
    tags: ["preferences", "user_profile", "developer_settings"],
    platforms: ["claude"],
    claudeFormat: `<user_memory>\n  <preference key="framework">React 18/19 with Vite</preference>\n  <preference key="styling">Tailwind CSS (utility-first)</preference>\n  <preference key="cloud_storage">Google Drive via OAuth REST API</preference>\n  <preference key="communication_style">Direct, technical, minimal fluff</preference>\n</user_memory>`,
    updatedAt: new Date().toISOString()
  },
  {
    id: "ctx-003",
    title: "Google Drive Sync Root Path Convention",
    category: "fact_memory",
    summary: "Cloud storage directory naming convention and atomic sync requirements.",
    content: "All agent context memories must sync to the dedicated Google Drive folder titled \"/Agentic_AI_Context_Hub\". Each memory item is saved as a structured JSON file titled \"context_memory_<id>.json\" alongside a master \"_context_index.json\" catalog.",
    tags: ["google_drive", "cloud_storage", "sync_protocol"],
    platforms: ["claude"],
    claudeFormat: `<context_memory>\n  <drive_folder>/Agentic_AI_Context_Hub</drive_folder>\n  <file_naming_convention>context_memory_<id>.json</file_naming_convention>\n  <index_catalog>_context_index.json</index_catalog>\n  <sync_policy>Atomic bidirectional overwrite based on updatedAt timestamp</sync_policy>\n</context_memory>`,
    updatedAt: new Date().toISOString()
  },
  {
    id: "ctx-004",
    title: "Express + Vite Single-Process Architecture Pattern",
    category: "code_artifact",
    summary: "Durable full-stack Express server integration with Vite middleware in development and static bundle in production.",
    content: "All full-stack applications run Express on port 3000. In development mode (NODE_ENV !== \"production\"), mount Vite as Express middleware using createViteServer({ server: { middlewareMode: true }, appType: \"spa\" }). In production, serve static assets from the dist folder.",
    tags: ["express", "vite", "node", "architecture_pattern"],
    platforms: ["claude"],
    claudeFormat: `<code_artifact name="express_vite_server_pattern">\n  <environment_rule>Single process on PORT 3000 host 0.0.0.0</environment_rule>\n  <dev_mode>Vite middlewareMode: true integrated into Express app</dev_mode>\n  <prod_mode>Serve dist/ static directory with fallback to index.html</prod_mode>\n</code_artifact>`,
    updatedAt: new Date().toISOString()
  },
  {
    id: "ctx-005",
    title: "Claude MCP JSON-RPC 2.0 Tool Protocol Specification",
    category: "code_artifact",
    summary: "Standardized Model Context Protocol tool schema for Claude Desktop and MCP clients.",
    content: "MCP endpoints serve JSON-RPC 2.0 messages over HTTP POST and SSE streams. Standard methods include tools/list (exposing available tools with inputSchema) and tools/call (executing specific tool logic). Responses must format results inside content array with type \"text\".",
    tags: ["mcp", "json-rpc", "claude_desktop", "protocol"],
    platforms: ["claude"],
    claudeFormat: `<code_artifact name="claude_mcp_spec">\n  <protocol>JSON-RPC 2.0</protocol>\n  <methods>tools/list, tools/call, resources/list, resources/read</methods>\n  <response_schema>\n    { "jsonrpc": "2.0", "id": 1, "result": { "content": [{ "type": "text", "text": "..." }] } }\n  </response_schema>\n</code_artifact>`,
    updatedAt: new Date().toISOString()
  },
  {
    id: "ctx-006",
    title: "Relative Context Extraction & Noise Filtering Directive",
    category: "system_prompt",
    summary: "Strict rule preventing whole-chat transcript dumps in favor of relative context facts.",
    content: "Never store raw conversational chat transcripts or conversational pleasantries verbatim. Parse user inputs for relative facts, persona rules, and durable architectural conventions, stripping out chatter and greetings.",
    tags: ["extraction_rules", "memory_scope", "filtering"],
    platforms: ["claude"],
    claudeFormat: `<system>\n  <memory_extraction_directive>\n    <rule>Reject raw chat transcript dumps and back-and-forth chatter</rule>\n    <rule>Extract strictly relative facts, preferences, and durable code conventions</rule>\n    <rule>Format extracted memory in concise XML for Claude context injection</rule>\n  </memory_extraction_directive>\n</system>`,
    updatedAt: new Date().toISOString()
  },
  {
    id: "ctx-007",
    title: "OAuth API Token Rotation & Safety Policy",
    category: "fact_memory",
    summary: "Security guidelines for handling Google Workspace OAuth tokens in browser local storage and server session proxies.",
    content: "Access tokens obtained via Google Workspace OAuth should be kept in memory or session storage. Never log raw access tokens or client secrets to stdout/stderr. Refresh tokens must be exchanged server-side.",
    tags: ["security", "oauth", "token_management", "google_workspace"],
    platforms: ["claude"],
    claudeFormat: `<user_memory>\n  <security_policy>\n    <rule>Never expose OAuth client secrets in browser bundles</rule>\n    <rule>Use server-side proxy routes for API calls requiring secret keys</rule>\n    <rule>Handle expired Google OAuth access tokens gracefully with UI login prompt</rule>\n  </security_policy>\n</user_memory>`,
    updatedAt: new Date().toISOString()
  }
];

export async function scaffoldRepository(octokit: Octokit, owner: string, repo: string, branch: string) {
  const commitFile = async (filePath: string, content: string, message: string) => {
    try {
      let sha: string | undefined;
      try {
        const fileRes = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: filePath,
          ref: branch
        });
        if (!Array.isArray(fileRes.data)) {
          sha = fileRes.data.sha;
        }
      } catch (e) {
        // File doesn't exist
      }

      if (filePath === ".gitignore" && sha) {
        const existingFile = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: filePath,
          ref: branch
        });
        if (!Array.isArray(existingFile.data) && existingFile.data.type === "file") {
          const rawContent = Buffer.from(existingFile.data.content, "base64").toString("utf8");
          if (!rawContent.includes("node_modules")) {
            const updatedContent = rawContent + "\nnode_modules/\n";
            await octokit.rest.repos.createOrUpdateFileContents({
              owner,
              repo,
              path: filePath,
              message: "Update .gitignore with node_modules/",
              content: Buffer.from(updatedContent).toString("base64"),
              sha,
              branch
            });
          }
        }
        return;
      }

      if (sha) return;

      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: filePath,
        message,
        content: Buffer.from(content).toString("base64"),
        branch
      });
    } catch (e) {
      console.warn(`Scaffolding file '${filePath}' failed or already exists:`, e);
    }
  };

  await commitFile("index.md", `# Kankali Context Index\n\nWelcome to Kankali's Table of Contents. This repository acts as a localized AI context store.\n\n## Chapters\n- [issues/index.md](file:///issues/index.md): Listing of all issues, debugging notes, and active trouble tickets.\n- [project/index.md](file:///project/index.md): Project notes, snippets, configuration parameters, and architectural documentation.\n`, "Initial Kankali index scaffolding");
  
  await commitFile("issues/index.md", `# Issues Catalog\n\nThis folder contains debugging sessions, issue trackers, and resolution notes.\n\n## Entries\n`, "Initial Kankali issues scaffolding");
  
  await commitFile("project/index.md", `# Projects Catalog\n\nThis folder organizes project-specific directories, code snippets, and designs.\n\n## Entries\n`, "Initial Kankali projects scaffolding");

  await commitFile(".gitignore", `node_modules/\ndist/\nbuild/\n.env\n*.local\n.gemini/\n.dbci/\n`, "Add Kankali .gitignore");
}

export async function readRepoFile(octokit: Octokit, owner: string, repo: string, path: string, branch: string): Promise<string> {
  try {
    const res = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref: branch
    });
    if (Array.isArray(res.data)) {
      throw new Error(`Path '${path}' is a directory, not a file.`);
    }
    if (res.data.type === "file") {
      return Buffer.from(res.data.content, "base64").toString("utf8");
    }
    throw new Error(`Path '${path}' is not a file.`);
  } catch (err: any) {
    if (err.status === 403 || err.message?.includes("too large") || err.message?.includes("1 MB")) {
      const metadataRes = await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref: branch
      }).catch(() => null);

      if (metadataRes && !Array.isArray(metadataRes.data) && metadataRes.data.sha) {
        const blobRes = await octokit.rest.git.getBlob({
          owner,
          repo,
          file_sha: metadataRes.data.sha
        });
        return Buffer.from(blobRes.data.content, "base64").toString("utf8");
      }
    }
    throw err;
  }
}

export async function writeRepoFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  content: string,
  branch: string
): Promise<{ sha: string }> {
  const contentBase64 = Buffer.from(content).toString("base64");
  const bytes = Buffer.byteLength(content, "utf8");

  if (bytes > 1024 * 1024) {
    const blobRes = await octokit.rest.git.createBlob({
      owner,
      repo,
      content,
      encoding: "utf-8"
    });
    const blobSha = blobRes.data.sha;

    const refRes = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`
    });
    const commitSha = refRes.data.object.sha;

    const commitRes = await octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: commitSha
    });
    const treeSha = commitRes.data.tree.sha;

    const treeRes = await octokit.rest.git.createTree({
      owner,
      repo,
      base_tree: treeSha,
      tree: [
        {
          path,
          mode: "100644",
          type: "blob",
          sha: blobSha
        }
      ]
    });
    const newTreeSha = treeRes.data.sha;

    const newCommitRes = await octokit.rest.git.createCommit({
      owner,
      repo,
      message: `Write large file: ${path}`,
      tree: newTreeSha,
      parents: [commitSha]
    });
    const newCommitSha = newCommitRes.data.sha;

    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommitSha
    });

    return { sha: blobSha };
  } else {
    let existingSha: string | undefined;
    try {
      const fileRes = await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref: branch
      });
      if (!Array.isArray(fileRes.data)) {
        existingSha = fileRes.data.sha;
      }
    } catch (e) {
      // File doesn't exist yet
    }

    const commitRes = await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: `Write file: ${path}`,
      content: contentBase64,
      sha: existingSha,
      branch
    });
    return { sha: commitRes.data.content?.sha || "" };
  }
}

export async function updateParentIndex(
  octokit: Octokit,
  owner: string,
  repo: string,
  filePath: string,
  description: string,
  branch: string
) {
  const parts = filePath.split("/");
  const fileName = parts.pop()!;
  const parentDirPath = parts.join("/");
  const parentIndexPath = parentDirPath ? `${parentDirPath}/index.md` : "index.md";

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      let indexContent = "";
      let indexSha: string | undefined;

      try {
        const indexRes = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: parentIndexPath,
          ref: branch
        });
        if (!Array.isArray(indexRes.data) && indexRes.data.type === "file") {
          indexContent = Buffer.from(indexRes.data.content, "base64").toString("utf8");
          indexSha = indexRes.data.sha;
        }
      } catch (e) {
        indexContent = `# Table of Contents\n\n## Entries\n`;
      }

      const lines = indexContent.split("\n");
      const linkRegex = new RegExp(`\\[${fileName}\\]\\(file:\\/\\/\\/(?:[^)]+)\\)`);
      let foundIdx = -1;

      for (let i = 0; i < lines.length; i++) {
        if (linkRegex.test(lines[i])) {
          foundIdx = i;
          break;
        }
      }

      const relativeLink = filePath;
      const newEntry = `- [${fileName}](file:///${relativeLink}): ${description || "No description provided."}`;

      if (foundIdx !== -1) {
        lines[foundIdx] = newEntry;
      } else {
        let entriesHeaderIdx = lines.findIndex(line => line.includes("## Entries"));
        if (entriesHeaderIdx !== -1) {
          lines.splice(entriesHeaderIdx + 1, 0, newEntry);
        } else {
          lines.push(newEntry);
        }
      }

      const updatedContent = lines.join("\n");

      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: parentIndexPath,
        message: `Update index for ${fileName}`,
        content: Buffer.from(updatedContent).toString("base64"),
        sha: indexSha,
        branch
      });
      break;
    } catch (err: any) {
      if ((err.status === 409 || err.message?.includes("conflict") || err.message?.includes("sha")) && attempt < 3) {
        console.warn(`SHA conflict on index update (attempt ${attempt}/3). Retrying in 1s...`);
        await new Promise(r => setTimeout(r, 1000));
      } else {
        throw err;
      }
    }
  }
}

export async function removeEntryFromParentIndex(
  octokit: Octokit,
  owner: string,
  repo: string,
  filePath: string,
  branch: string
) {
  const parts = filePath.replace(/\/+$/, "").split("/");
  const itemName = parts.pop()!;
  const parentDirPath = parts.join("/");
  const parentIndexPath = parentDirPath ? `${parentDirPath}/index.md` : "index.md";

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      let indexContent = "";
      let indexSha: string | undefined;

      try {
        const indexRes = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: parentIndexPath,
          ref: branch
        });
        if (!Array.isArray(indexRes.data) && indexRes.data.type === "file") {
          indexContent = Buffer.from(indexRes.data.content, "base64").toString("utf8");
          indexSha = indexRes.data.sha;
        }
      } catch (e) {
        return;
      }

      const lines = indexContent.split("\n");
      const linkRegex = new RegExp(`\\[${itemName}\\]\\(file:\\/\\/\\/(?:[^)]+)\\)`);
      const filteredLines = lines.filter(line => !linkRegex.test(line));

      if (lines.length === filteredLines.length) {
        return;
      }

      const updatedContent = filteredLines.join("\n");

      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: parentIndexPath,
        message: `Remove index entry for ${itemName}`,
        content: Buffer.from(updatedContent).toString("base64"),
        sha: indexSha,
        branch
      });
      break;
    } catch (err: any) {
      if ((err.status === 409 || err.message?.includes("conflict") || err.message?.includes("sha")) && attempt < 3) {
        console.warn(`SHA conflict on index removal (attempt ${attempt}/3). Retrying in 1s...`);
        await new Promise(r => setTimeout(r, 1000));
      } else {
        throw err;
      }
    }
  }
}

export async function deleteFolderGit(
  octokit: Octokit,
  owner: string,
  repo: string,
  dirPath: string,
  branch: string
) {
  const cleanDirPath = dirPath.replace(/\/+$/, "") + "/";

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const refRes = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`
      });
      const commitSha = refRes.data.object.sha;

      const commitRes = await octokit.rest.git.getCommit({
        owner,
        repo,
        commit_sha: commitSha
      });
      const treeSha = commitRes.data.tree.sha;

      const treeRes = await octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: treeSha,
        recursive: "true"
      });

      const newTreeNodes = treeRes.data.tree
        .filter((node: any) => {
          return node.path !== dirPath.replace(/\/+$/, "") && !node.path.startsWith(cleanDirPath);
        })
        .map((node: any) => ({
          path: node.path,
          mode: node.mode,
          type: node.type,
          sha: node.sha
        }));

      const newTreeRes = await octokit.rest.git.createTree({
        owner,
        repo,
        tree: newTreeNodes
      });
      const newTreeSha = newTreeRes.data.sha;

      const newCommitRes = await octokit.rest.git.createCommit({
        owner,
        repo,
        message: `Delete directory: ${dirPath}`,
        tree: newTreeSha,
        parents: [commitSha]
      });
      const newCommitSha = newCommitRes.data.sha;

      await octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: newCommitSha
      });

      await removeEntryFromParentIndex(octokit, owner, repo, dirPath, branch);
      break;
    } catch (err: any) {
      if ((err.status === 409 || err.message?.includes("conflict") || err.message?.includes("sha")) && attempt < 3) {
        console.warn(`SHA conflict on directory deletion (attempt ${attempt}/3). Retrying in 1s...`);
        await new Promise(r => setTimeout(r, 1000));
      } else {
        throw err;
      }
    }
  }
}


app.get("/api/github/status", (req, res) => {
  const isEncryptedAvailable = !!(safeStorage && safeStorage.isEncryptionAvailable());
  res.json({
    isLinked: !!config.encryptedGithubToken,
    expiry: config.githubTokenExpiry || null,
    linkedRepo: config.linkedRepo || null,
    userProfile: config.userProfile || null,
    isEncryptionAvailable: isEncryptedAvailable
  });
});

app.get("/api/mcp/pending-approvals", (req, res) => {
  const list = Array.from(pendingApprovals.entries())
    .filter(([_, apprv]) => apprv.status === "pending" && apprv.expiresAt > Date.now())
    .map(([id, apprv]) => ({ id, ...apprv }));
  res.json({ approvals: list });
});

app.post("/api/mcp/approve", (req, res) => {
  const { id } = req.body;
  const apprv = pendingApprovals.get(id);
  if (apprv) {
    apprv.status = "approved";
    return res.json({ success: true });
  }
  res.status(404).json({ error: "Approval request not found." });
});

app.post("/api/mcp/reject", (req, res) => {
  const { id } = req.body;
  const apprv = pendingApprovals.get(id);
  if (apprv) {
    apprv.status = "rejected";
    return res.json({ success: true });
  }
  res.status(404).json({ error: "Approval request not found." });
});

app.post("/api/github/link", rateLimiter, async (req, res) => {
  const { token, linkedRepo, userProfile } = req.body;
  if (!token) {
    return res.status(400).json({ error: "GitHub Personal Access Token is required." });
  }

  try {
    const octokit = new Octokit({ auth: token });
    const userRes = await octokit.rest.users.getAuthenticated();
    
    const headers = userRes.headers;
    const scopes = headers["x-oauth-scopes"] || "";
    const expiryHeader = headers["github-authentication-token-expiration"];
    const expiryVal = expiryHeader ? String(expiryHeader) : null;

    const isFineGrained = token.startsWith("github_pat_") || (!scopes && !headers["x-oauth-client-id"]);
    if (isFineGrained) {
      return res.status(400).json({
        error: "Please use a classic Personal Access Token. Fine-grained tokens are not currently supported."
      });
    }
    
    const scopeArray = scopes.split(",").map(s => s.trim());
    const hasRepoScope = scopeArray.includes("repo") || scopeArray.includes("public_repo");
    if (!hasRepoScope) {
      return res.status(400).json({
        error: `Insufficient scopes on token. Found: '${scopes}'. At minimum, the 'repo' scope is required.`
      });
    }

    const encryptedToken = encryptToken(token);

    if (isCloud && !config.userApiKey) {
      config.userApiKey = crypto.randomBytes(32).toString("hex");
    }

    config.encryptedGithubToken = encryptedToken;
    config.githubToken = token;
    config.githubTokenExpiry = expiryVal;
    config.linkedRepo = linkedRepo || null;
    if (linkedRepo && linkedRepo.owner && linkedRepo.name) {
      config.githubRepo = `${linkedRepo.owner}/${linkedRepo.name}`;
      config.githubBranch = linkedRepo.defaultBranch || "main";
    }
    config.userProfile = userProfile || {
      userId: userRes.data.login,
      authProvider: "github",
      email: userRes.data.email || `${userRes.data.login}@github.com`,
      displayName: userRes.data.name || userRes.data.login
    };

    const targetUserId = (req as any).userId || (req.query.user || req.query.userId) as string || "local-user";
    await persistCurrentConfig(targetUserId);

    return res.json({
      status: "linked",
      userProfile: config.userProfile,
      linkedRepo: config.linkedRepo,
      expiry: config.githubTokenExpiry,
      userApiKey: config.userApiKey
    });
  } catch (err: any) {
    console.error("Link GitHub PAT failed:", err);
    return res.status(500).json({
      error: err.message || "Failed to validate GitHub token."
    });
  }
});

app.get("/api/github/repos", async (req, res) => {
  try {
    const octokit = getGithubClient();
    const response = await octokit.rest.repos.listForAuthenticatedUser({
      visibility: "all",
      per_page: 100,
      sort: "updated"
    });
    const repos = response.data.map(repo => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      owner: repo.owner.login,
      private: repo.private,
      defaultBranch: repo.default_branch
    }));
    res.json(repos);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to list repositories." });
  }
});

app.post("/api/github/link-repo", rateLimiter, async (req, res) => {
  const { owner, name, defaultBranch } = req.body;
  if (!owner || !name) {
    return res.status(400).json({ error: "Repository owner and name are required." });
  }

  try {
    const octokit = getGithubClient();
    const branch = defaultBranch || "main";

    config.linkedRepo = { owner, name, defaultBranch: branch };
    await persistCurrentConfig((req as any).userId);

    await scaffoldRepository(octokit, owner, name, branch);

    res.json({
      status: "linked",
      linkedRepo: config.linkedRepo
    });
  } catch (err: any) {
    console.error("Link repo failed:", err);
    res.status(500).json({ error: err.message || "Failed to link repository." });
  }
});

app.post("/api/github/create-repo", rateLimiter, async (req, res) => {
  const { repoName } = req.body;
  if (!repoName) {
    return res.status(400).json({ error: "Repository name is required." });
  }

  try {
    const octokit = getGithubClient();
    const response = await octokit.rest.repos.createForAuthenticatedUser({
      name: repoName,
      private: true,
      auto_init: true
    });

    const repo = response.data;
    const owner = repo.owner.login;
    const name = repo.name;
    const defaultBranch = repo.default_branch || "main";

    config.linkedRepo = { owner, name, defaultBranch };
    await persistCurrentConfig((req as any).userId);

    await scaffoldRepository(octokit, owner, name, defaultBranch);

    res.json({
      status: "created",
      linkedRepo: config.linkedRepo
    });
  } catch (err: any) {
    console.error("Create repo failed:", err);
    res.status(500).json({ error: err.message || "Failed to create repository." });
  }
});

app.get("/api/github/tree", async (req, res) => {
  const owner = config.linkedRepo?.owner;
  const repo = config.linkedRepo?.name;
  const branch = config.linkedRepo?.defaultBranch || "main";

  if (!owner || !repo) {
    return res.json({ folders: [], files: [], isLinked: false });
  }

  try {
    const octokit = getGithubClient();
    
    const refRes = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`
    });
    const commitSha = refRes.data.object.sha;

    const commitRes = await octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: commitSha
    });
    const treeSha = commitRes.data.tree.sha;

    const treeRes = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: treeSha,
      recursive: "true"
    });

    const folders: any[] = [];
    const files: any[] = [];

    for (const node of treeRes.data.tree) {
      const parts = node.path.split("/");
      const name = parts.pop()!;
      const parentPath = parts.join("/");
      
      if (node.type === "tree") {
        folders.push({
          id: node.path,
          name,
          parentId: parentPath || "root",
          sha: node.sha
        });
      } else if (node.type === "blob") {
        files.push({
          id: node.path,
          name,
          parentId: parentPath || "root",
          sha: node.sha,
          size: node.size || 0
        });
      }
    }

    res.json({
      isLinked: true,
      repoName: `${owner}/${repo}`,
      branch,
      folders,
      files
    });
  } catch (err: any) {
    console.error("Failed to fetch GitHub repository tree:", err);
    res.status(500).json({ error: err.message || "Failed to fetch repository tree." });
  }
});

app.get("/api/github/file", async (req, res) => {
  const filePath = req.query.path as string;
  const owner = config.linkedRepo?.owner;
  const repo = config.linkedRepo?.name;
  const branch = config.linkedRepo?.defaultBranch || "main";

  if (!filePath || !owner || !repo) {
    return res.status(400).json({ error: "Missing required parameters." });
  }

  try {
    const octokit = getGithubClient();
    const content = await readRepoFile(octokit, owner, repo, filePath, branch);
    res.json({ content });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to read file." });
  }
});

app.post("/api/github/write-file", async (req, res) => {
  const { path: filePath, content, description } = req.body;
  const owner = config.linkedRepo?.owner;
  const repo = config.linkedRepo?.name;
  const branch = config.linkedRepo?.defaultBranch || "main";

  if (!filePath || !content || !owner || !repo) {
    return res.status(400).json({ error: "Missing required parameters." });
  }

  try {
    const octokit = getGithubClient();
    const result = await writeRepoFile(octokit, owner, repo, filePath, content, branch);
    await updateParentIndex(octokit, owner, repo, filePath, description || "Updated via UI dashboard.", branch);
    res.json({ success: true, sha: result.sha });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to write file." });
  }
});

app.post("/api/github/delete-file", async (req, res) => {
  const { path: filePath } = req.body;
  const owner = config.linkedRepo?.owner;
  const repo = config.linkedRepo?.name;
  const branch = config.linkedRepo?.defaultBranch || "main";

  if (!filePath || !owner || !repo) {
    return res.status(400).json({ error: "Missing required parameters." });
  }

  try {
    const octokit = getGithubClient();
    
    let fileSha: string | undefined;
    try {
      const fileRes = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: filePath,
        ref: branch
      });
      if (!Array.isArray(fileRes.data)) {
        fileSha = fileRes.data.sha;
      }
    } catch (e) {
      // not found
    }

    if (fileSha) {
      await octokit.rest.repos.deleteFile({
        owner,
        repo,
        path: filePath,
        message: `Delete file via dashboard: ${filePath}`,
        sha: fileSha,
        branch
      });
    }

    await removeEntryFromParentIndex(octokit, owner, repo, filePath, branch);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete file." });
  }
});

app.post("/api/github/delete-folder", async (req, res) => {
  const { path: dirPath } = req.body;
  const owner = config.linkedRepo?.owner;
  const repo = config.linkedRepo?.name;
  const branch = config.linkedRepo?.defaultBranch || "main";

  if (!dirPath || !owner || !repo) {
    return res.status(400).json({ error: "Missing required parameters." });
  }

  try {
    const octokit = getGithubClient();
    await deleteFolderGit(octokit, owner, repo, dirPath, branch);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete directory." });
  }
});

app.post("/api/github/create-folder", async (req, res) => {
  const { path: dirPath } = req.body;
  const owner = config.linkedRepo?.owner;
  const repo = config.linkedRepo?.name;
  const branch = config.linkedRepo?.defaultBranch || "main";

  if (!dirPath || !owner || !repo) {
    return res.status(400).json({ error: "Missing required parameters." });
  }

  try {
    const octokit = getGithubClient();
    const folderName = dirPath.split("/").pop();
    const indexFilePath = `${dirPath}/index.md`;
    const tocTemplate = `# ${folderName} Catalog\n\nThis folder holds relative context assets.\n\n## Entries\n`;
    
    await writeRepoFile(octokit, owner, repo, indexFilePath, tocTemplate, branch);
    await updateParentIndex(octokit, owner, repo, indexFilePath, `Folder Catalog for '${folderName}'`, branch);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to create folder." });
  }
});


// Endpoint to sync UI local storage memories into backend MCP memory bank
app.post("/api/mcp/sync-memories", (req, res) => {
  const { memories } = req.body;
  if (Array.isArray(memories)) {
    mcpMemories = memories;
    return res.json({ success: true, count: mcpMemories.length });
  }
  res.status(400).json({ error: "Invalid memories array" });
});

// GET complete vault hierarchy tree (folders + files + memories)
app.get("/api/vault/tree", (req, res) => {
  res.json({
    rootFolderId: "root",
    folders: mcpFolders,
    files: mcpFiles,
    memories: mcpMemories,
    activeIdentities: Array.from(activeAgentIdentities.values())
  });
});

// POST create folder
app.post("/api/vault/folders", (req, res) => {
  const { name, parentFolderId, agentName, namespace } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Folder name is required" });

  const newFolder: VaultFolderItem = {
    id: `folder-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name: name.trim(),
    parentId: parentFolderId || "root",
    createdByAgent: agentName || "User Frontend",
    agentNamespace: namespace || "default",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  mcpFolders.push(newFolder);
  res.json({ success: true, folder: newFolder });
});

// POST write/upload file
app.post("/api/vault/files", (req, res) => {
  const { fileName, content, parentFolderId, mimeType, agentName, namespace } = req.body;
  if (!fileName || content === undefined) return res.status(400).json({ error: "fileName and content required" });

  const parentId = parentFolderId || "root";
  const existingIdx = mcpFiles.findIndex((f) => f.parentId === parentId && f.name.toLowerCase() === fileName.toLowerCase());

  let targetFile: VaultFileItem;
  if (existingIdx !== -1) {
    mcpFiles[existingIdx] = {
      ...mcpFiles[existingIdx],
      content,
      mimeType: mimeType || mcpFiles[existingIdx].mimeType,
      createdByAgent: agentName || mcpFiles[existingIdx].createdByAgent,
      updatedAt: new Date().toISOString()
    };
    targetFile = mcpFiles[existingIdx];
  } else {
    targetFile = {
      id: `file-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: fileName,
      parentId,
      content,
      mimeType: mimeType || "text/plain",
      createdByAgent: agentName || "User Frontend",
      agentNamespace: namespace || "default",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    mcpFiles.unshift(targetFile);
  }

  res.json({ success: true, file: targetFile });
});

// POST move or rename item
app.post("/api/vault/move", (req, res) => {
  const { itemId, newParentFolderId, newName } = req.body;
  const folder = mcpFolders.find((f) => f.id === itemId);
  const file = mcpFiles.find((f) => f.id === itemId);

  if (folder) {
    if (newParentFolderId) folder.parentId = newParentFolderId;
    if (newName) folder.name = newName;
    folder.updatedAt = new Date().toISOString();
    return res.json({ success: true, item: folder });
  }

  if (file) {
    if (newParentFolderId) file.parentId = newParentFolderId;
    if (newName) file.name = newName;
    file.updatedAt = new Date().toISOString();
    return res.json({ success: true, item: file });
  }

  res.status(404).json({ error: "Item not found" });
});

// DELETE endpoint intentionally removed.
// Destructive operations require human confirmation and cannot be triggered
// by an AI agent via a plain REST call or MCP tool. Use the UI confirmation
// modal path (handleDeleteDriveFilePrompt / handleDeleteMemoryPrompt) instead.

// GET MCP status & config
app.get("/api/mcp/status", (req, res) => {
  const protocol = req.protocol;
  const host = req.get("host") || "localhost:3000";
  const baseUrl = `${protocol}://${host}`;
  
  res.json({
    status: "online",
    name: "Nexus Context Hub Claude MCP Server",
    version: "1.0.0",
    protocolVersion: "2024-11-05",
    mcpEndpoint: `${baseUrl}/api/mcp`,
    mcpSseEndpoint: `${baseUrl}/api/mcp/sse`,
    activeMemoriesCount: config.linkedRepo ? 1 : 0,
    capabilities: ["tools"],
    supportedTools: [
      "list_folder",
      "read_index",
      "read_file",
      "write_file",
      "create_folder",
      "delete_file",
      "delete_folder",
      "search",
      "register_agent_identity",
      "get_user_profile"
    ]
  });
});

// Active connected agent identity registry for multi-agent namespacing
let activeAgentIdentities = new Map<string, { agentName: string; agentRole: string; namespace: string; registeredAt: string }>();
let sessionAgentMap = new Map<string, { agentName: string; agentRole: string; namespace: string; registeredAt: string }>();

function getSessionKeyFromReq(req: express.Request): string {
  return (req.query.sessionId as string) || (req.query.user as string) || (req.headers["x-session-id"] as string) || req.ip || "default_session";
}

function resolveSessionIdentity(req: express.Request) {
  const sessionKey = getSessionKeyFromReq(req);
  const urlAgentAlias = (req.query.agent || req.query.alias || req.headers["x-agent-alias"]) as string;

  if (urlAgentAlias && urlAgentAlias.trim()) {
    const trimmed = urlAgentAlias.trim();
    const info = {
      agentName: trimmed,
      agentRole: (req.query.agentRole as string) || "AI Assistant",
      namespace: (req.query.namespace as string) || "default",
      registeredAt: new Date().toISOString()
    };
    activeAgentIdentities.set(trimmed, info);
    sessionAgentMap.set(sessionKey, info);
    return info;
  }

  return sessionAgentMap.get(sessionKey) || null;
}

// Vault Folder & File Item Types for appDataFolder hierarchy
export interface VaultFolderItem {
  id: string;
  name: string;
  parentId: string; // 'root' or parent folder ID
  createdByAgent: string;
  agentNamespace: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultFileItem {
  id: string;
  name: string;
  parentId: string; // 'root' or parent folder ID
  content: string;
  mimeType: string;
  createdByAgent: string;
  agentNamespace: string;
  createdAt: string;
  updatedAt: string;
}

let mcpFolders: VaultFolderItem[] = [
  {
    id: "folder-system-prompts",
    name: "System Prompts",
    parentId: "root",
    createdByAgent: "Nexus Vault System",
    agentNamespace: "default",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: "folder-code-artifacts",
    name: "Code Artifacts & Architecture",
    parentId: "root",
    createdByAgent: "Nexus Vault System",
    agentNamespace: "default",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

let mcpFiles: VaultFileItem[] = [
  {
    id: "file-system-prompt-guide",
    name: "system_prompt_spec.md",
    parentId: "folder-system-prompts",
    content: "# System Prompt Guidelines\n\n1. Always enforce structured XML outputs for Claude.\n2. Store core memories in the appDataFolder Google Drive vault.",
    mimeType: "text/markdown",
    createdByAgent: "Claude - Work Laptop",
    agentNamespace: "default",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

function getUserProfileFromReq(req: express.Request) {
  const userParam = (req.query.user || req.query.userId || req.headers["x-user-profile"] || "") as string;
  if (!userParam) {
    return {
      userId: "guest",
      email: "guest@nexus.hub",
      displayName: "Guest User",
      role: "Developer / AI Architect",
      preferences: {
        preferredPromptFormat: "claude_xml",
        autoSync: true
      }
    };
  }
  const email = userParam.includes("@") ? userParam : `${userParam}@nexus.hub`;
  const rawName = userParam.split("@")[0].replace(/[^a-zA-Z0-9_]/g, " ");
  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  
  return {
    userId: userParam,
    email,
    displayName: displayName || "Context Hub User",
    role: "Developer / AI Architect",
    preferences: {
      preferredPromptFormat: "claude_xml",
      autoSync: true
    }
  };
}

// In-memory SSE Clients registry
const sseClients = new Map<string, express.Response>();

// Helper for setting MCP CORS headers
function setMcpCorsHeaders(res: express.Response) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-Profile, Accept, Last-Event-ID, x-requested-with");
  res.setHeader("Access-Control-Max-Age", "86400");
}

// Dispatcher helper for dual-mode MCP (SSE vs HTTP JSON-RPC)
function sendMcpResponse(req: express.Request, res: express.Response, jsonRpcObj: any) {
  setMcpCorsHeaders(res);
  const sessionId = req.query.sessionId as string;
  const sseRes = sessionId ? sseClients.get(sessionId) : null;

  if (sseRes) {
    try {
      sseRes.write(`event: message\ndata: ${JSON.stringify(jsonRpcObj)}\n\n`);
    } catch (e) {
      console.error("Failed to write to SSE stream", e);
    }
  }

  if (!res.headersSent) {
    return res.status(200).json(jsonRpcObj);
  }
}

const mcpPaths = [
  "/api/mcp",
  "/api/mcp/sse",
  "/api/mcp/github",
  "/api/mcp/github/sse",
  "/api/mcp/drive",
  "/api/mcp/drive/sse",
  "/api/mcp/:userApiKey",
  "/api/mcp/:userApiKey/sse",
  "/mcp/github",
  "/mcp/github/sse",
  "/mcp/drive",
  "/mcp/drive/sse",
  "/mcp/github/:userApiKey",
  "/mcp/github/:userApiKey/sse",
  "/mcp/drive/:userApiKey",
  "/mcp/drive/:userApiKey/sse"
];

// OPTIONS preflight endpoint for CORS
app.options(mcpPaths, (req, res) => {
  setMcpCorsHeaders(res);
  return res.status(204).end();
});

// HEAD endpoint for connector health check probes
app.head(mcpPaths, multiTenantMiddleware, (req, res) => {
  setMcpCorsHeaders(res);
  res.setHeader("Content-Type", "text/event-stream");
  return res.status(200).end();
});

// GET - Handshake & Stream for Claude Connectors & SSE Clients
app.get(mcpPaths, multiTenantMiddleware, (req, res) => {
  setMcpCorsHeaders(res);

  const userId = (req as any).userId;
  const keyInfo = { userId };
  const mcpServer = createServerInstance(keyInfo.userId);

  const profile = getUserProfileFromReq(req);
  const protocol = getProtocol(req);
  const host = getPublicHost(req);
  const isGithubPath = req.path.includes("github") || req.query.storage === "github";
  const storage = isGithubPath ? "github" : (req.query.storage === "drive" || req.path.includes("drive")) ? "drive" : (req.query.storage as string || "");

  const buildUrl = (extraParams: Record<string, string> = {}) => {
    const params = new URLSearchParams();
    if (storage) params.set("storage", storage);
    if (profile.userId && profile.userId !== "guest") params.set("user", profile.userId);
    for (const [k, v] of Object.entries(extraParams)) {
      if (v) params.set(k, v);
    }
    const q = params.toString();
    const basePath = (isCloud && req.params.userApiKey) ? `/api/mcp/${req.params.userApiKey}` : `/api/mcp`;
    return `${protocol}://${host}${basePath}${q ? `?${q}` : ""}`;
  };

  // Return pure JSON ONLY if explicitly requested via query param (?format=json or ?json=true)
  const wantsJson = req.query.format === "json" || req.query.json === "true";

  if (wantsJson) {
    const endpoint = buildUrl();

    return res.json({
      jsonrpc: "2.0",
      id: 1,
      result: {
        status: "online",
        name: "Nexus Context Hub Claude MCP Server",
        version: "1.0.0",
        protocolVersion: "2024-11-05",
        userProfile: profile,
        mcpEndpoint: endpoint,
        capabilities: {
          resources: { subscribe: false, listChanged: true },
          prompts: { listChanged: true },
          tools: { listChanged: true }
        },
        serverInfo: {
          name: "Nexus Context Hub MCP Server",
          version: "1.0.0"
        }
      }
    });
  }

  // Generate session ID for SSE connection
  const sessionId = (req.query.sessionId as string) || `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Set SSE Headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  sseClients.set(sessionId, res);

  // Send absolute endpoint URL for Claude Web compatibility
  const endpointUrl = buildUrl({ sessionId });
  res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);

  const keepAlive = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch (err) {
      clearInterval(keepAlive);
    }
  }, 10000);

  req.on("close", () => {
    clearInterval(keepAlive);
    sseClients.delete(sessionId);
  });
});

// JSON-RPC 2.0 Claude Model Context Protocol (MCP) Handler
app.post(mcpPaths, multiTenantMiddleware, async (req, res) => {
  let body = req.body || {};
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }

  const { jsonrpc, id, method, params } = body;

  if (!jsonrpc || jsonrpc !== "2.0") {
    return sendMcpResponse(req, res, {
      jsonrpc: "2.0",
      id: id || 1,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          resources: { subscribe: false, listChanged: true },
          prompts: { listChanged: true },
          tools: { listChanged: true }
        },
        serverInfo: {
          name: "Nexus Context Hub MCP Server",
          version: "1.0.0"
        }
      }
    });
  }

  // Handle MCP Protocol methods
  switch (method) {
    case "initialize": {
      const noticeContent = `# Notice — Read This First

This is a Kankali context store. It holds saved notes, project context,
and history for one user, organized so you (the AI) only load what you
need instead of the whole repository.

## Before you act
1. Read \`index.md\` at the root — it lists what's here and where.
2. Drill into a folder's own \`index.md\` before reading individual files.
3. If the index doesn't make it clear what you're looking for, or you're
   unsure whether an action is what the user wants — ask the user.
   Do not guess, especially on deletes or edits.

## Rules
- This file cannot be modified. Any write attempt will be rejected.
- Deleting a folder or modifying an index requires user approval and a
  stated reason.
`;
      return sendMcpResponse(req, res, {
        jsonrpc: "2.0",
        id: id ?? 1,
        result: {
          protocolVersion: params?.protocolVersion || "2024-11-05",
          capabilities: {
            resources: { subscribe: false, listChanged: true },
            prompts: { listChanged: true },
            tools: { listChanged: true }
          },
          serverInfo: {
            name: "Nexus Context Hub MCP Server",
            version: "1.0.0"
          },
          instructions: noticeContent
        }
      });
    }

    case "notifications/initialized":
      return sendMcpResponse(req, res, { jsonrpc: "2.0", id: id ?? null, result: {} });

    case "ping":
      return sendMcpResponse(req, res, { jsonrpc: "2.0", id: id ?? 1, result: {} });

    case "resources/list":
      return sendMcpResponse(req, res, {
        jsonrpc: "2.0",
        id,
        result: {
          resources: [
            {
              uri: "context://memories/all",
              name: "All Nexus Context Memories",
              description: "Full collection of system prompts, fact memories, chat logs, and code artifacts",
              mimeType: "application/json"
            },
            {
              uri: "context://memories/system_prompts",
              name: "System Prompts & Personas",
              description: "Active Claude agent identities and system instructions",
              mimeType: "text/plain"
            },
            {
              uri: "context://memories/fact_memories",
              name: "User Fact Memories & Preferences",
              description: "Persistent facts and developer preferences for Claude",
              mimeType: "text/plain"
            }
          ]
        }
      });

    case "resources/templates/list":
      return sendMcpResponse(req, res, {
        jsonrpc: "2.0",
        id,
        result: {
          resourceTemplates: []
        }
      });

    case "resources/read": {
      const uri = params?.uri || "";
      let responseText = "";

      if (uri.endsWith("system_prompts")) {
        responseText = mcpMemories
          .filter((m) => m.category === "system_prompt")
          .map((m) => `=== ${m.title} ===\n${m.claudeFormat || m.content}`)
          .join("\n\n");
      } else if (uri.endsWith("fact_memories")) {
        responseText = mcpMemories
          .filter((m) => m.category === "fact_memory")
          .map((m) => `=== ${m.title} ===\n${m.claudeFormat || m.content}`)
          .join("\n\n");
      } else {
        responseText = JSON.stringify(mcpMemories, null, 2);
      }

      return sendMcpResponse(req, res, {
        jsonrpc: "2.0",
        id,
        result: {
          contents: [
            {
              uri,
              mimeType: uri.endsWith("all") ? "application/json" : "text/plain",
              text: responseText
            }
          ]
        }
      });
    }

    case "prompts/list":
      return sendMcpResponse(req, res, {
        jsonrpc: "2.0",
        id,
        result: {
          prompts: [
            {
              name: "inject_context_hub_persona",
              description: "Inject active Nexus Context Hub system prompts & user preferences into Claude",
              arguments: [
                { name: "category", description: "Filter by category (system_prompt | fact_memory | all)", required: false }
              ]
            },
            {
              name: "claude_xml_system_prompt",
              description: "Format all hub memories into Claude-optimized XML tags (<system>, <user_memory>)",
              arguments: []
            }
          ]
        }
      });

    case "prompts/get": {
      const promptName = params?.name || "";
      const cat = params?.arguments?.category;

      let filtered = mcpMemories;
      if (cat && cat !== "all") {
        filtered = mcpMemories.filter((m) => m.category === cat);
      }

      const formattedContext = filtered
        .map((m) => m.claudeFormat || `<context_memory id="${m.id}" title="${m.title}">\n${m.content}\n</context_memory>`)
        .join("\n\n");

      return sendMcpResponse(req, res, {
        jsonrpc: "2.0",
        id,
        result: {
          description: `Injected Context Memories from Nexus Hub (${promptName})`,
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Below is the synchronized active memory context from Nexus Context Hub for Claude:\n\n${formattedContext}\n\nPlease retain these rules and preferences throughout our conversation.`
              }
            }
          ]
        }
      });
    }

    case "tools/list":
      return sendMcpResponse(req, res, {
        jsonrpc: "2.0",
        id,
        result: {
          tools: [
            {
              name: "list_folder",
              description: "List files and subfolders in a specific path inside the repository. First reads index.md if present.",
              inputSchema: {
                type: "object",
                properties: {
                  path: { type: "string", description: "Target directory path (e.g. 'project' or '/'). Defaults to root." }
                }
              }
            },
            {
              name: "read_index",
              description: "Read the Table of Contents index.md for a folder.",
              inputSchema: {
                type: "object",
                properties: {
                  path: { type: "string", description: "Folder path (e.g. 'issues' or 'project/project-1'). Defaults to root." }
                }
              }
            },
            {
              name: "read_file",
              description: "Read the full contents of a file in the repository.",
              inputSchema: {
                type: "object",
                properties: {
                  path: { type: "string", description: "Path to file (e.g. 'project/project-1/notes.md')" }
                },
                required: ["path"]
              }
            },
            {
              name: "write_file",
              description: "Create or update a file in the repository. Updates parent index.md automatically.",
              inputSchema: {
                type: "object",
                properties: {
                  path: { type: "string", description: "Path to write (e.g. 'project/project-1/notes.md')" },
                  content: { type: "string", description: "Full text content of the file." },
                  description: { type: "string", description: "A brief 1-line description of the file for the parent folder's Table of Contents." },
                  reason: { type: "string", description: "Reason for editing. Required ONLY if modifying or restructuring index.md in a way that deletes/reduces existing catalog entries." },
                  confirmationToken: { type: "string", description: "Required for destructive catalog restructuring. One-time confirmation token issued by the server via the approval queue." }
                },
                required: ["path", "content", "description"]
              }
            },
            {
              name: "create_folder",
              description: "Create a new folder in the repository with a default index.md.",
              inputSchema: {
                type: "object",
                properties: {
                  path: { type: "string", description: "Path of the folder to create (e.g. 'project/new-project')." }
                },
                required: ["path"]
              }
            },
            {
              name: "delete_file",
              description: "Delete a file from the repository and remove its entry from parent index.md.",
              inputSchema: {
                type: "object",
                properties: {
                  path: { type: "string", description: "Path of the file to delete (e.g. 'project/project-1/notes.md')." },
                  reason: { type: "string", description: "Required. Explicit justification for deleting this context file." },
                  confirmationToken: { type: "string", description: "Required. One-time confirmation token issued by the server via the approval queue after user authorization." }
                },
                required: ["path"]
              }
            },
            {
              name: "delete_folder",
              description: "Atomically delete a folder and all its contents recursively using the Git Trees API.",
              inputSchema: {
                type: "object",
                properties: {
                  path: { type: "string", description: "Path of the folder to delete (e.g. 'project/project-1')." },
                  reason: { type: "string", description: "Required. Explicit justification for deleting this folder recursively." },
                  confirmationToken: { type: "string", description: "Required. One-time confirmation token issued by the server via the approval queue after user authorization." }
                },
                required: ["path"]
              }
            },
            {
              name: "search",
              description: "Search for files. Scans index.md files first, falling back to the GitHub Search API.",
              inputSchema: {
                type: "object",
                properties: {
                  query: { type: "string", description: "Keyword or tag to search for." }
                },
                required: ["query"]
              }
            },
            {
              name: "register_agent_identity",
              description: "Register or update connected AI assistant identity for provenance tracking.",
              inputSchema: {
                type: "object",
                properties: {
                  agentName: { type: "string", description: "Display name of connected AI model or client" },
                  agentRole: { type: "string", description: "Specialized role (e.g. Senior Architect)" }
                },
                required: ["agentName"]
              }
            },
            {
              name: "get_user_profile",
              description: "Get current user profile, email, linked GitHub repo, and token details.",
              inputSchema: {
                type: "object",
                properties: {}
              }
            }
          ]
        }
      });


    case "tools/call": {
      const toolName = params?.name;
      const args = params?.arguments || {};

      // General Tools
      if (toolName === "register_agent_identity") {
        const rawAlias = args.agentName || args.alias || "";
        if (!rawAlias || !rawAlias.trim()) {
          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            error: {
              code: -32602,
              message: "Missing required parameter 'agentName' (alias)."
            }
          });
        }

        const agentName = rawAlias.trim();
        const agentRole = args.agentRole ? args.agentRole.trim() : "AI Assistant";

        const identityInfo = {
          agentName,
          agentRole,
          namespace: "default",
          registeredAt: new Date().toISOString()
        };

        activeAgentIdentities.set(agentName, identityInfo);

        return sendMcpResponse(req, res, {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: `Custom agent alias successfully registered: '${agentName}' (${agentRole}).`
              }
            ]
          }
        });
      }

      if (toolName === "get_user_profile") {
        const { owner, repo, branch } = getLinkedGithubDetails();
        const linkedRepoObj = (owner && repo) ? { owner, name: repo, defaultBranch: branch } : (config.linkedRepo || null);
        const hasToken = !!(config.encryptedGithubToken || config.githubToken);
        const currentReqUser = (req as any).userId || (req.query.user || req.query.userId || req.headers["x-user-profile"] || "") as string;
        const fallbackEmail = currentReqUser && currentReqUser.includes("@") ? currentReqUser : "anonymous@kankali.local";

        return sendMcpResponse(req, res, {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  userId: config.userProfile?.userId || currentReqUser || "anonymous",
                  email: config.userProfile?.email || fallbackEmail,
                  linkedGithubRepo: linkedRepoObj,
                  encryptionAvailable: true,
                  hasTokenSaved: hasToken
                }, null, 2)
              }
            ]
          }
        });
      }

      // Root NOTICE.md write protection (case-insensitive)
      if (args.path) {
        const filePath = (args.path || "").replace(/^\/+/g, "");
        const filename = filePath.split("/").pop() || "";
        if (filename.toLowerCase() === "notice.md" || filePath.toLowerCase() === "notice.md") {
          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "Modifying or deleting 'NOTICE.md' is strictly forbidden by server policy." }
          });
        }
      }

      // GOOGLE DRIVE BACKEND
      if (req.path.includes("drive") || req.query.storage === "drive") {
        const accessToken = await getDriveAccessToken();
        if (!accessToken) {
          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: "Google Drive OAuth token not linked or expired." }
          });
        }

        const hubFolderId = await getOrCreateDriveFolderServer(accessToken, DRIVE_FOLDER_NAME, "root");

        if (toolName === "list_folder") {
          const targetPath = (args.path || "").replace(/^\/+|\/+$/g, "");
          const indexFilePath = targetPath ? `${targetPath}/index.md` : "index.md";
          
          try {
            const indexFile = await resolveDrivePath(accessToken, hubFolderId, indexFilePath);
            if (indexFile.exists) {
              const tocContent = await readDriveFile(accessToken, indexFile.id);
              return sendMcpResponse(req, res, {
                jsonrpc: "2.0",
                id,
                result: {
                  content: [{ type: "text", text: `Found folder index at '${indexFilePath}':\n\n${tocContent}` }]
                }
              });
            }

            const targetFolder = targetPath 
              ? await resolveDrivePath(accessToken, hubFolderId, targetPath, { isFolder: true })
              : { id: hubFolderId, exists: true };

            if (!targetFolder.exists) {
              return sendMcpResponse(req, res, {
                jsonrpc: "2.0",
                id,
                error: { code: -32603, message: `Directory '${targetPath}' not found.` }
              });
            }

            const query = encodeURIComponent(`'${targetFolder.id}' in parents and trashed = false`);
            const fields = encodeURIComponent('files(id, name, mimeType)');
            const listUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=folder,name`;
            const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
            if (!listRes.ok) throw new Error("Failed to list folder.");
            const listData = await listRes.json();
            const rawList: any[] = listData.files || [];

            const items = rawList.map(item => {
              const isDir = item.mimeType === "application/vnd.google-apps.folder";
              return `${isDir ? "[DIR]" : "[FILE]"} ${item.name}`;
            });

            return sendMcpResponse(req, res, {
              jsonrpc: "2.0",
              id,
              result: {
                content: [{ type: "text", text: `Index not found. Directory contents of '${targetPath || "/"}':\n\n${items.join("\n")}` }]
              }
            });
          } catch (err: any) {
            return sendMcpResponse(req, res, {
              jsonrpc: "2.0",
              id,
              error: { code: -32603, message: err.message || "Failed to list folder contents." }
            });
          }
        }

        if (toolName === "read_index") {
          const targetPath = (args.path || "").replace(/^\/+|\/+$/g, "");
          const indexFilePath = targetPath ? `${targetPath}/index.md` : "index.md";

          try {
            const indexFile = await resolveDrivePath(accessToken, hubFolderId, indexFilePath);
            if (!indexFile.exists) {
              return sendMcpResponse(req, res, {
                jsonrpc: "2.0",
                id,
                error: { code: -32603, message: `Index file '${indexFilePath}' not found.` }
              });
            }
            const content = await readDriveFile(accessToken, indexFile.id);
            return sendMcpResponse(req, res, {
              jsonrpc: "2.0",
              id,
              result: { content: [{ type: "text", text: content }] }
            });
          } catch (err: any) {
            return sendMcpResponse(req, res, {
              jsonrpc: "2.0",
              id,
              error: { code: -32603, message: err.message || `Failed to read index.` }
            });
          }
        }

        if (toolName === "read_file") {
          const filePath = (args.path || "").replace(/^\/+/g, "");
          try {
            const file = await resolveDrivePath(accessToken, hubFolderId, filePath);
            if (!file.exists) {
              return sendMcpResponse(req, res, {
                jsonrpc: "2.0",
                id,
                error: { code: -32603, message: `File '${filePath}' not found.` }
              });
            }
            const content = await readDriveFile(accessToken, file.id);
            return sendMcpResponse(req, res, {
              jsonrpc: "2.0",
              id,
              result: { content: [{ type: "text", text: content }] }
            });
          } catch (err: any) {
            return sendMcpResponse(req, res, {
              jsonrpc: "2.0",
              id,
              error: { code: -32603, message: err.message || `Failed to read file.` }
            });
          }
        }

        if (toolName === "write_file") {
          const filePath = (args.path || "").replace(/^\/+/g, "");
          const content = args.content || "";
          const description = args.description || "";

          const approved = await verifyApproval(req, res, id, toolName, args, async () => {
            const file = await resolveDrivePath(accessToken, hubFolderId, filePath);
            return file.exists ? await readDriveFile(accessToken, file.id) : null;
          });
          if (!approved) return;

          try {
            const parts = filePath.split("/");
            const fileName = parts.pop()!;
            const dirPath = parts.join("/");

            let parentDirId = hubFolderId;
            if (dirPath) {
              const dirRes = await resolveDrivePath(accessToken, hubFolderId, dirPath, { createIfMissing: true, isFolder: true });
              parentDirId = dirRes.id;
            }

            const existingFile = await resolveDrivePath(accessToken, hubFolderId, filePath);
            const uploadResult = await uploadToDriveWithVerification(
              accessToken,
              parentDirId,
              fileName,
              content,
              existingFile.exists ? existingFile.id : undefined
            );

            if (!uploadResult.confirmed_saved) {
              throw new Error(uploadResult.error || "Verification upload failed.");
            }

            // Update parent index.md
            const indexFilePath = dirPath ? `${dirPath}/index.md` : "index.md";
            const indexFileRes = await resolveDrivePath(accessToken, hubFolderId, indexFilePath);
            let indexContent = dirPath ? `# ${parts.pop() || "Folder"} Catalog\n\n## Entries\n` : `# Kankali Context Index\n\n## Chapters\n`;
            if (indexFileRes.exists) {
              indexContent = await readDriveFile(accessToken, indexFileRes.id);
            }
            const updatedIndex = addEntryToCatalogContent(indexContent, filePath, description);
            await uploadToDriveWithVerification(
              accessToken,
              parentDirId,
              "index.md",
              updatedIndex,
              indexFileRes.exists ? indexFileRes.id : undefined
            );

            return sendMcpResponse(req, res, {
              jsonrpc: "2.0",
              id,
              result: {
                content: [{ type: "text", text: `Successfully wrote file '${filePath}' to Drive. File ID: ${uploadResult.driveFileId}` }]
              }
            });
          } catch (err: any) {
            return sendMcpResponse(req, res, {
              jsonrpc: "2.0",
              id,
              error: { code: -32603, message: err.message || `Failed to write file.` }
            });
          }
        }

        if (toolName === "create_folder") {
          const targetPath = (args.path || "").replace(/^\/+|\/+$/g, "");
          const folderName = targetPath.split("/").pop()!;

          try {
            const newFolder = await resolveDrivePath(accessToken, hubFolderId, targetPath, { createIfMissing: true, isFolder: true });
            const indexFilePath = `${targetPath}/index.md`;
            const indexContent = `# ${folderName} Catalog\n\nThis folder holds relative context assets.\n\n## Entries\n`;
            
            const indexFileRes = await resolveDrivePath(accessToken, hubFolderId, indexFilePath);
            await uploadToDriveWithVerification(
              accessToken,
              newFolder.id,
              "index.md",
              indexContent,
              indexFileRes.exists ? indexFileRes.id : undefined
            );

            // Update parent index.md
            const parts = targetPath.split("/");
            parts.pop();
            const parentPath = parts.join("/");
            const parentIndexFilePath = parentPath ? `${parentPath}/index.md` : "index.md";
            
            const parentIndexRes = await resolveDrivePath(accessToken, hubFolderId, parentIndexFilePath);
            let parentIndexContent = parentPath ? `# Parent Catalog\n\n## Entries\n` : `# Kankali Context Index\n\n## Chapters\n`;
            if (parentIndexRes.exists) {
              parentIndexContent = await readDriveFile(accessToken, parentIndexRes.id);
            }
            const updatedIndex = addEntryToCatalogContent(parentIndexContent, indexFilePath, `Folder Catalog for '${folderName}'`);
            
            const parentDirId = parentPath 
              ? (await resolveDrivePath(accessToken, hubFolderId, parentPath, { isFolder: true })).id
              : hubFolderId;

            await uploadToDriveWithVerification(
              accessToken,
              parentDirId,
              "index.md",
              updatedIndex,
              parentIndexRes.exists ? parentIndexRes.id : undefined
            );

            return sendMcpResponse(req, res, {
              jsonrpc: "2.0",
              id,
              result: { content: [{ type: "text", text: `Successfully created folder and index catalog at '${indexFilePath}' on Drive.` }] }
            });
          } catch (err: any) {
            return sendMcpResponse(req, res, {
              jsonrpc: "2.0",
              id,
              error: { code: -32603, message: err.message || "Failed to create folder." }
            });
          }
        }

        if (toolName === "delete_file") {
          const filePath = (args.path || "").replace(/^\/+/g, "");

          const approved = await verifyApproval(req, res, id, toolName, args);
          if (!approved) return;

          try {
            const file = await resolveDrivePath(accessToken, hubFolderId, filePath);
            if (!file.exists) {
              return sendMcpResponse(req, res, {
                jsonrpc: "2.0",
                id,
                result: { content: [{ type: "text", text: `File '${filePath}' not found. No action needed.` }] }
              });
            }

            await deleteDriveFile(accessToken, file.id);

            const parts = filePath.split("/");
            parts.pop();
            const parentPath = parts.join("/");
            const parentIndexFilePath = parentPath ? `${parentPath}/index.md` : "index.md";

            const parentIndexRes = await resolveDrivePath(accessToken, hubFolderId, parentIndexFilePath);
            if (parentIndexRes.exists) {
              const indexContent = await readDriveFile(accessToken, parentIndexRes.id);
              const updatedContent = removeEntryFromCatalogContent(indexContent, filePath);
              const parentDirId = parentPath 
                ? (await resolveDrivePath(accessToken, hubFolderId, parentPath, { isFolder: true })).id
                : hubFolderId;

              await uploadToDriveWithVerification(
                accessToken,
                parentDirId,
                "index.md",
                updatedContent,
                parentIndexRes.id
              );
            }

            return sendMcpResponse(req, res, {
              jsonrpc: "2.0",
              id,
              result: { content: [{ type: "text", text: `Successfully deleted file '${filePath}' and removed its catalog entry.` }] }
            });
          } catch (err: any) {
            return sendMcpResponse(req, res, {
              jsonrpc: "2.0",
              id,
              error: { code: -32603, message: err.message || "Failed to delete file." }
            });
          }
        }

        if (toolName === "delete_folder") {
          const dirPath = (args.path || "").replace(/^\/+|\/+$/g, "");

          const approved = await verifyApproval(req, res, id, toolName, args);
          if (!approved) return;

          try {
            const folder = await resolveDrivePath(accessToken, hubFolderId, dirPath, { isFolder: true });
            if (!folder.exists) {
              return sendMcpResponse(req, res, {
                jsonrpc: "2.0",
                id,
                result: { content: [{ type: "text", text: `Folder '${dirPath}' not found. No action needed.` }] }
              });
            }

            await deleteDriveFile(accessToken, folder.id);

            const parts = dirPath.split("/");
            parts.pop();
            const parentPath = parts.join("/");
            const parentIndexFilePath = parentPath ? `${parentPath}/index.md` : "index.md";
            
            const parentIndexRes = await resolveDrivePath(accessToken, hubFolderId, parentIndexFilePath);
            if (parentIndexRes.exists) {
              const indexContent = await readDriveFile(accessToken, parentIndexRes.id);
              const updatedContent = removeEntryFromCatalogContent(indexContent, `${dirPath}/index.md`);
              const parentDirId = parentPath 
                ? (await resolveDrivePath(accessToken, hubFolderId, parentPath, { isFolder: true })).id
                : hubFolderId;

              await uploadToDriveWithVerification(
                accessToken,
                parentDirId,
                "index.md",
                updatedContent,
                parentIndexRes.id
              );
            }

            return sendMcpResponse(req, res, {
              jsonrpc: "2.0",
              id,
              result: { content: [{ type: "text", text: `Successfully deleted folder '${dirPath}' and removed parent catalog reference.` }] }
            });
          } catch (err: any) {
            return sendMcpResponse(req, res, {
              jsonrpc: "2.0",
              id,
              error: { code: -32603, message: err.message || "Failed to delete folder." }
            });
          }
        }

        if (toolName === "search") {
          const query = (args.query || "").trim().toLowerCase();
          try {
            const queryUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${hubFolderId}' in parents and trashed = false`)}&fields=${encodeURIComponent("files(id,name,mimeType)")}`;
            const searchRes = await fetch(queryUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
            if (!searchRes.ok) throw new Error("Failed to query Drive folder files.");
            const searchData = await searchRes.json();
            const rawList: any[] = searchData.files || [];
            const results: string[] = [];

            for (const f of rawList) {
              if (f.name.endsWith(".md") || f.name.endsWith(".json")) {
                const content = await readDriveFile(accessToken, f.id);
                if (content.toLowerCase().includes(query)) {
                  results.push(`- [${f.name}](file:///${f.name})`);
                }
              }
            }

            return sendMcpResponse(req, res, {
              jsonrpc: "2.0",
              id,
              result: {
                content: [{ type: "text", text: results.length > 0 ? `Search results matching '${query}':\n\n${results.join("\n")}` : `No matches found on Drive.` }]
              }
            });
          } catch (err: any) {
            return sendMcpResponse(req, res, {
              jsonrpc: "2.0",
              id,
              error: { code: -32603, message: err.message || "Search failed." }
            });
          }
        }

        return sendMcpResponse(req, res, {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Tool '${toolName}' not supported on Drive backend.` }
        });
      }

      // GITHUB BACKEND
      const { owner, repo, branch } = getLinkedGithubDetails();

      if (!owner || !repo) {
        return sendMcpResponse(req, res, {
          jsonrpc: "2.0",
          id,
          error: { code: -32603, message: "No GitHub repository linked. Please link a repository first." }
        });
      }

      if (toolName === "list_folder") {
        const targetPath = (args.path || "").replace(/^\/+|\/+$/g, "");
        const indexFilePath = targetPath ? `${targetPath}/index.md` : "index.md";

        try {
          const octokit = getGithubClient();
          let tocContent = "";
          try {
            tocContent = await readRepoFile(octokit, owner, repo, indexFilePath, branch);
          } catch (e) {
            // index.md doesn't exist
          }

          if (tocContent) {
            return sendMcpResponse(req, res, {
              jsonrpc: "2.0",
              id,
              result: {
                content: [{ type: "text", text: `Found folder index at '${indexFilePath}':\n\n${tocContent}` }]
              }
            });
          }

          const contentsRes = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: targetPath,
            ref: branch
          });

          const items = Array.isArray(contentsRes.data)
            ? contentsRes.data.map(item => `${item.type === "dir" ? "[DIR]" : "[FILE]"} ${item.path}`)
            : [contentsRes.data.path];

          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Index not found. Raw directory contents of '${targetPath || "/"}':\n\n${items.join("\n")}`
                }
              ]
            }
          });
        } catch (err: any) {
          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: err.message || "Failed to list folder contents." }
          });
        }
      }

      if (toolName === "read_index") {
        const targetPath = (args.path || "").replace(/^\/+|\/+$/g, "");
        const indexFilePath = targetPath ? `${targetPath}/index.md` : "index.md";
        const { owner, repo, branch } = getLinkedGithubDetails();

        if (!owner || !repo) {
          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: "No GitHub repository linked." }
          });
        }

        try {
          const octokit = getGithubClient();
          const content = await readRepoFile(octokit, owner, repo, indexFilePath, branch);
          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: content }]
            }
          });
        } catch (err: any) {
          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: err.message || `Failed to read index at '${indexFilePath}'.` }
          });
        }
      }

      if (toolName === "read_file") {
        const filePath = (args.path || "").replace(/^\/+/g, "");
        const { owner, repo, branch } = getLinkedGithubDetails();

        if (!owner || !repo) {
          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: "No GitHub repository linked." }
          });
        }

        try {
          const octokit = getGithubClient();
          const content = await readRepoFile(octokit, owner, repo, filePath, branch);
          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: content }]
            }
          });
        } catch (err: any) {
          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: err.message || `Failed to read file '${filePath}'.` }
          });
        }
      }

      if (toolName === "write_file") {
        const filePath = (args.path || "").replace(/^\/+/g, "");
        const content = args.content || "";
        const description = args.description || "";
        const { owner, repo, branch } = getLinkedGithubDetails();

        if (!owner || !repo) {
          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: "No GitHub repository linked." }
          });
        }

        try {
          const octokit = getGithubClient();
          const approved = await verifyApproval(req, res, id, toolName, args, async () => {
            try {
              return await readRepoFile(octokit, owner, repo, filePath, branch);
            } catch (e) {
              return null;
            }
          });
          if (!approved) return;

          const result = await writeRepoFile(octokit, owner, repo, filePath, content, branch);
          await updateParentIndex(octokit, owner, repo, filePath, description, branch);

          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: `Successfully wrote file '${filePath}' and updated parent index.md. File SHA: ${result.sha}` }]
            }
          });
        } catch (err: any) {
          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: err.message || `Failed to write file '${filePath}'.` }
          });
        }
      }

      if (toolName === "create_folder") {
        const targetPath = (args.path || "").replace(/^\/+|\/+$/g, "");
        const indexFilePath = `${targetPath}/index.md`;
        const { owner, repo, branch } = getLinkedGithubDetails();

        if (!owner || !repo) {
          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: "No GitHub repository linked." }
          });
        }

        try {
          const octokit = getGithubClient();
          const folderName = targetPath.split("/").pop();
          const tocTemplate = `# ${folderName} Catalog\n\nThis folder holds relative context assets.\n\n## Entries\n`;
          
          await writeRepoFile(octokit, owner, repo, indexFilePath, tocTemplate, branch);
          await updateParentIndex(octokit, owner, repo, indexFilePath, `Folder Catalog for '${folderName}'`, branch);

          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: `Successfully created folder catalog index at '${indexFilePath}'.` }]
            }
          });
        } catch (err: any) {
          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: err.message || `Failed to create folder at '${targetPath}'.` }
          });
        }
      }

      if (toolName === "delete_file") {
        const filePath = (args.path || "").replace(/^\/+/g, "");
        const { owner, repo, branch } = getLinkedGithubDetails();

        if (!owner || !repo) {
          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: "No GitHub repository linked." }
          });
        }

        try {
          const approved = await verifyApproval(req, res, id, toolName, args);
          if (!approved) return;

          const octokit = getGithubClient();
          
          let fileSha: string | undefined;
          try {
            const fileRes = await octokit.rest.repos.getContent({
              owner,
              repo,
              path: filePath,
              ref: branch
            });
            if (!Array.isArray(fileRes.data)) {
              fileSha = fileRes.data.sha;
            }
          } catch (e) {
            // File not found
          }

          if (!fileSha) {
            return sendMcpResponse(req, res, {
              jsonrpc: "2.0",
              id,
              result: {
                content: [{ type: "text", text: `File '${filePath}' not found in repository. No action needed.` }]
              }
            });
          }

          await octokit.rest.repos.deleteFile({
            owner,
            repo,
            path: filePath,
            message: `Delete file: ${filePath}`,
            sha: fileSha,
            branch
          });

          await removeEntryFromParentIndex(octokit, owner, repo, filePath, branch);

          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: `Successfully deleted file '${filePath}' and removed its parent index entry.` }]
            }
          });
        } catch (err: any) {
          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: err.message || `Failed to delete file '${filePath}'.` }
          });
        }
      }

      if (toolName === "delete_folder") {
        const dirPath = (args.path || "").replace(/^\/+|\/+$/g, "");
        const { owner, repo, branch } = getLinkedGithubDetails();

        if (!owner || !repo) {
          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: "No GitHub repository linked." }
          });
        }

        try {
          const approved = await verifyApproval(req, res, id, toolName, args);
          if (!approved) return;

          const octokit = getGithubClient();
          await deleteFolderGit(octokit, owner, repo, dirPath, branch);

          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: `Successfully atomically deleted folder '${dirPath}' using Git Trees API.` }]
            }
          });
        } catch (err: any) {
          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: err.message || `Failed to delete directory '${dirPath}'.` }
          });
        }
      }

      if (toolName === "search") {
        const query = (args.query || "").trim();
        const { owner, repo, branch } = getLinkedGithubDetails();

        if (!owner || !repo) {
          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: "No GitHub repository linked." }
          });
        }

        try {
          const octokit = getGithubClient();
          const indexPaths = ["index.md", "issues/index.md", "project/index.md"];
          const localHits: string[] = [];

          for (const idxPath of indexPaths) {
            try {
              const text = await readRepoFile(octokit, owner, repo, idxPath, branch);
              const lines = text.split("\n");
              for (const line of lines) {
                if (line.toLowerCase().includes(query.toLowerCase()) && line.includes("file:///")) {
                  localHits.push(`Index: ${idxPath} -> ${line.trim()}`);
                }
              }
            } catch (e) {
              // Ignore
            }
          }

          if (localHits.length > 0) {
            return sendMcpResponse(req, res, {
              jsonrpc: "2.0",
              id,
              result: {
                content: [{ type: "text", text: `Found matches in local index.md summaries:\n\n${localHits.join("\n")}` }]
              }
            });
          }

          const searchRes = await octokit.rest.search.code({
            q: `${query} repo:${owner}/${repo}`
          });

          const items = searchRes.data.items.map(item => `- ${item.path} (Score: ${item.score})`);

          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: items.length > 0
                    ? `No local index matches. Found matches via GitHub Search API:\n\n${items.join("\n")}`
                    : `No matches found locally or via GitHub Search API.`
                }
              ]
            }
          });
        } catch (err: any) {
          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: err.message || "Failed to search repository." }
          });
        }
      }

      if (toolName === "register_agent_identity") {
        const rawAlias = args.agentName || args.alias || "";
        if (!rawAlias || !rawAlias.trim()) {
          return sendMcpResponse(req, res, {
            jsonrpc: "2.0",
            id,
            error: {
              code: -32602,
              message: "Missing required parameter 'agentName' (alias)."
            }
          });
        }

        const agentName = rawAlias.trim();
        const agentRole = args.agentRole ? args.agentRole.trim() : "AI Assistant";

        const identityInfo = {
          agentName,
          agentRole,
          namespace: "default",
          registeredAt: new Date().toISOString()
        };

        activeAgentIdentities.set(agentName, identityInfo);

        return sendMcpResponse(req, res, {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: `Custom agent alias successfully registered: '${agentName}' (${agentRole}).`
              }
            ]
          }
        });
      }

      if (toolName === "get_user_profile") {
        const isEncryptedAvailable = !!(safeStorage && safeStorage.isEncryptionAvailable());
        return sendMcpResponse(req, res, {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    isLinked: !!config.encryptedGithubToken,
                    expiry: config.githubTokenExpiry || null,
                    linkedRepo: config.linkedRepo || null,
                    userProfile: config.userProfile || null,
                    isEncryptionAvailable: isEncryptedAvailable
                  },
                  null,
                  2
                )
              }
            ]
          }
        });
      }

      return sendMcpResponse(req, res, {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Tool '${toolName}' not found` }
      });
    }

    default:
      return sendMcpResponse(req, res, {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method '${method}' not supported` }
      });
  }
});

// Health check endpoint

// Gemini Chat & Context Processing Endpoint
app.post("/api/gemini/chat", async (req, res) => {
  try {
    const { prompt, systemInstruction, history, format } = req.body;
    const ai = getAIClient();

    let fullPrompt = prompt;
    if (format && format !== "raw") {
      fullPrompt = `Format output for ${format} platform context format:\n\n${prompt}`;
    }

    const contents = [];
    if (history && Array.isArray(history)) {
      for (const msg of history) {
        contents.push({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.text }]
        });
      }
    }
    contents.push({ role: "user", parts: [{ text: fullPrompt }] });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: systemInstruction ? { systemInstruction } : undefined
    });

    res.json({ text: response.text || "" });
  } catch (error: any) {
    console.error("Gemini API error:", error);
    res.status(500).json({ error: error.message || "Failed to process request with Gemini AI" });
  }
});

// Gemini Memory Extraction & Auto-Categorization Endpoint
app.post("/api/gemini/extract-memory", async (req, res) => {
  try {
    const { rawText } = req.body;
    const ai = getAIClient();

    const systemInstruction = `You are an expert AI Memory & Context Extractor specifically designed for Claude AI and Claude Model Context Protocol (MCP).

CRITICAL DIRECTIVES & CATEGORY SCOPE:
1. DO NOT store or dump the entire raw chat transcript, full conversational logs, or back-and-forth chatter verbatim.
2. Extract ONLY relative, high-value, durable context memories: core user preferences, technical decisions, persona rules, specific project requirements, and actionable system directives.
3. CATEGORY SCOPE RULES:
   - "system_prompt": System-level persona, agent behavior rules, or global operation constraints.
   - "fact_memory": Persistent user preferences, environment configurations, API specifications, or business facts.
   - "code_artifact": Durable architectural conventions, reusable coding standards, and structural patterns — NEVER temporary single-use scratchpad code snippets.
4. Filter out trivial greetings, conversational pleasantries, and redundant chat lines.

FEW-SHOT EXTRACTION EXAMPLES:

Example 1 (Chat Noise -> Durable Fact Memory):
Input: "Hey Claude! Good morning. Could you help me write a function to format dates? Also, by the way, for all our microservices, we always format timestamps using ISO-8601 UTC strings."
Output JSON:
{
  "title": "ISO-8601 UTC Timestamp Standard",
  "category": "fact_memory",
  "tags": ["formatting", "timestamps", "iso8601", "microservices"],
  "platforms": ["claude"],
  "summary": "Mandatory UTC ISO-8601 timestamp string format across all API endpoints.",
  "content": "All microservice timestamps and API responses must strictly use ISO-8601 UTC strings (e.g. YYYY-MM-DDTHH:mm:ss.sssZ).",
  "claudeFormat": "<context_memory>\n  <rule>All timestamps across microservices must use ISO-8601 UTC format.</rule>\n</context_memory>"
}

Example 2 (Discussion -> Durable Code Artifact Pattern):
Input: "Can we review how we handle Express error handling? We should ensure all async routes are wrapped or use express-async-handler, and always return standard JSON error objects with { success: false, error: message }."
Output JSON:
{
  "title": "Express Standard Async Error Handling Pattern",
  "category": "code_artifact",
  "tags": ["express", "error-handling", "nodejs", "architecture"],
  "platforms": ["claude"],
  "summary": "Standardized async route error handling wrapper and uniform JSON error payload.",
  "content": "All Express async endpoints must be wrapped to catch unhandled rejections and return uniform error responses in the shape: { success: false, error: string } with appropriate HTTP status codes.",
  "claudeFormat": "<code_artifact name=\"express_error_handling\">\n  <rule>Wrap all Express async handlers</rule>\n  <response_schema>{ \"success\": false, \"error\": \"string\" }</response_schema>\n</code_artifact>"
}

Return a valid JSON object matching this schema (with NO markdown backticks or extra text):
{
  "title": "Short descriptive title for this relative context memory",
  "category": "system_prompt" | "fact_memory" | "code_artifact",
  "tags": ["tag1", "tag2"],
  "platforms": ["claude"],
  "summary": "Brief 1-2 sentence overview of the key relative fact or directive",
  "content": "The distilled, concise context memory ready for insertion into Claude system prompts or MCP memory bank",
  "claudeFormat": "Claude-optimized XML (<system>...</system> or <user_memory>...</user_memory> or <code_artifact>...)</code_artifact>"
}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: `Extract relative context memory (NOT raw full chat) from this input:\n\n${rawText}` }] }],
      config: { systemInstruction }
    });

    const outputText = response.text || "";
    const cleanJson = outputText.replace(/```json/gi, "").replace(/```/g, "").trim();

    try {
      const parsed = JSON.parse(cleanJson);
      res.json({ success: true, memory: parsed });
    } catch {
      res.json({
        success: true,
        memory: {
          title: "Extracted Context Memory",
          summary: "Distilled relative context snippet for Claude",
          content: outputText,
          category: "fact_memory",
          tags: ["extracted", "claude"],
          platforms: ["claude"]
        }
      });
    }
  } catch (error: any) {
    console.error("Gemini extraction error:", error);
    res.status(500).json({ error: error.message || "Failed to extract memory" });
  }
});


// ---------------------------------------------------------------------------
// Server-side Google Drive write helper
//
// Token resolution order (first that works wins):
//   1. GCP Workload Identity metadata server — used automatically on Cloud Run,
//      no key file needed, token is always fresh (fetched per-call).
//   2. GOOGLE_ACCESS_TOKEN env var — for local development only.
//      Note: raw OAuth access tokens expire in ~1 hour. Use this only for
//      short local test sessions; never set it as a static Cloud Run var.
//
// When neither is available all write tools return confirmed_saved: false.
// ---------------------------------------------------------------------------
const DRIVE_FOLDER_NAME = "Agentic_AI_Context_Hub";
const DRIVE_BACKUP_FOLDER_NAME = "_Backups";

// Cache the Workload Identity token briefly to avoid hammering the metadata
// server on every single Drive call (it's an internal HTTP call but still).
let _wiTokenCache: { token: string; expiresAt: number } | null = null;

/**
 * Fetches a fresh Google OAuth token from the GCP instance metadata server.
 * Works automatically on Cloud Run / GCE with no config or key file.
 * Returns null when not running on GCP (local dev).
 */
async function getWorkloadIdentityToken(): Promise<string | null> {
  // Return cached token if still valid for at least 60 more seconds
  if (_wiTokenCache && Date.now() < _wiTokenCache.expiresAt - 60_000) {
    return _wiTokenCache.token;
  }

  try {
    const res = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      {
        headers: { "Metadata-Flavor": "Google" },
        // Short timeout — if this call hangs we're not on GCP
        signal: AbortSignal.timeout(2000)
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const token: string = data.access_token;
    const expiresIn: number = data.expires_in ?? 3600; // seconds
    _wiTokenCache = { token, expiresAt: Date.now() + expiresIn * 1000 };
    return token;
  } catch {
    // Not on GCP or metadata server unreachable — silent fallback
    return null;
  }
}

/**
 * Resolve the best available Drive access token for server-side calls.
 * Prefers Workload Identity (Cloud Run), falls back to local dev env var.
 */
async function getDriveAccessToken(): Promise<string | null> {
  const wiToken = await getWorkloadIdentityToken();
  if (wiToken) return wiToken;
  return process.env.GOOGLE_ACCESS_TOKEN || null;
}

async function getDriveFolderId(accessToken: string, folderName: string, parentId = "root"): Promise<string | null> {
  const q = encodeURIComponent(
    `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`
  );
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}

async function createDriveFolderServer(accessToken: string, folderName: string, parentId: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: folderName, mimeType: "application/vnd.google-apps.folder", parents: [parentId] })
  });
  if (!res.ok) throw new Error(`Failed to create Drive folder '${folderName}': ${res.statusText}`);
  const data = await res.json();
  return data.id;
}

async function getOrCreateDriveFolderServer(accessToken: string, folderName: string, parentId = "root"): Promise<string> {
  const existing = await getDriveFolderId(accessToken, folderName, parentId);
  if (existing) return existing;
  return createDriveFolderServer(accessToken, folderName, parentId);
}

/**
 * Upload a file to Drive with read-back verification. Retries up to 3 times on
 * content mismatch. Returns { driveFileId, confirmed_saved }.
 */
async function uploadToDriveWithVerification(
  accessToken: string,
  folderId: string,
  fileName: string,
  content: string,
  existingFileId?: string
): Promise<{ driveFileId: string; confirmed_saved: boolean; error?: string }> {
  const boundary = "-------314159265358979323846";
  const mimeType = fileName.endsWith(".json") ? "application/json" : "text/plain";
  const metadata = existingFileId ? { name: fileName, mimeType } : { name: fileName, mimeType, parents: [folderId] };
  const body =
    `\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n` +
    content +
    `\r\n--${boundary}--`;

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id`;
  const method = existingFileId ? "PATCH" : "POST";

  const uploadRes = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body
  });

  if (!uploadRes.ok) {
    if (uploadRes.status === 401) {
      return { driveFileId: "", confirmed_saved: false, error: "Google OAuth access token expired or unauthorized (HTTP 401). Please re-authenticate." };
    }
    const err = await uploadRes.json().catch(() => ({}));
    return { driveFileId: "", confirmed_saved: false, error: (err as any).error?.message || uploadRes.statusText };
  }

  const saved = await uploadRes.json();
  const fileId = saved.id;

  // Read-back verification — up to 3 attempts
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const verifyRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!verifyRes.ok) {
        if (verifyRes.status === 401) {
          return { driveFileId: fileId, confirmed_saved: false, error: "Google OAuth token expired during save read-back verification (HTTP 401)." };
        }
      } else {
        const readBack = await verifyRes.text();
        if (readBack === content) {
          return { driveFileId: fileId, confirmed_saved: true };
        }
      }
    } catch (e) {
      console.warn(`Drive read-back attempt ${attempt} failed:`, e);
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
  }

  return { driveFileId: fileId, confirmed_saved: false, error: "Read-back content mismatch after 3 attempts — silent save failure." };
}

/**
 * Write all in-memory context items to Drive as a timestamped backup snapshot.
 * Creates the backup folder if it doesn't exist; prunes to keep the last 10 snapshots.
 * Marks the backup folder with restricted sharing (no new public shares added).
 */
async function writeDriveBackupSnapshot(accessToken: string): Promise<void> {
  try {
    const hubFolderId = await getOrCreateDriveFolderServer(accessToken, DRIVE_FOLDER_NAME, "root");
    const backupFolderId = await getOrCreateDriveFolderServer(accessToken, DRIVE_BACKUP_FOLDER_NAME, hubFolderId);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `snapshot_${timestamp}.json`;
    const content = JSON.stringify({ memories: mcpMemories, folders: mcpFolders, files: mcpFiles, savedAt: new Date().toISOString() }, null, 2);

    await uploadToDriveWithVerification(accessToken, backupFolderId, fileName, content);

    // Prune to keep last 10 snapshots (ordered by modifiedTime desc)
    const q = encodeURIComponent(`'${backupFolderId}' in parents and trashed = false`);
    const listRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&fields=files(id,name)&pageSize=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (listRes.ok) {
      const listData = await listRes.json();
      const allFiles: { id: string }[] = listData.files || [];
      const toDelete = allFiles.slice(10); // keep 0..9 (newest)
      for (const f of toDelete) {
        await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` }
        });
      }
    }
    console.log(`[Backup] Snapshot written: ${fileName}`);
  } catch (err) {
    console.error("[Backup] Failed to write Drive backup snapshot:", err);
  }
}

// Server-side 5-minute backup poll (only active when GOOGLE_ACCESS_TOKEN is set)
let backupIntervalId: ReturnType<typeof setInterval> | null = null;

function startBackupPoll() {
  if (backupIntervalId) clearInterval(backupIntervalId);
  backupIntervalId = setInterval(async () => {
    // Resolve token fresh each tick — Workload Identity tokens are cached
    // internally by getDriveAccessToken() so this is cheap.
    const token = await getDriveAccessToken();
    if (!token) {
      console.log("[Backup] No Drive credentials available — skipping backup tick.");
      return;
    }
    console.log("[Backup] 5-minute poll triggered — writing Drive backup snapshot...");
    await writeDriveBackupSnapshot(token);
  }, 5 * 60 * 1000);
  console.log("[Backup] Server-side 5-minute Drive backup poll started.");
}

// Serve frontend with Vite in dev, static files in prod
async function startServer() {
  const distPath = path.join(process.cwd(), "dist");
  const isProd = process.env.NODE_ENV === "production" || fs.existsSync(path.join(distPath, "index.html"));

  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Dynamic port scanning
  const envPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  PORT = envPort;

  const bindHost = "0.0.0.0";
  app.listen(PORT, bindHost, () => {
    console.log(`Agentic AI Context Hub running on http://${bindHost}:${PORT}`);
  });
}

console.log(`[Boot Check] NODE_ENV: ${process.env.NODE_ENV}, KANKALI_TEST: ${process.env.KANKALI_TEST}`);
if (process.env.NODE_ENV !== "test" && process.env.KANKALI_TEST !== "true") {
  startServer();
}
