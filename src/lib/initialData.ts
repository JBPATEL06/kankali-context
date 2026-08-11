import { ContextMemory, PlatformConfig } from '../types';

export const PLATFORMS: PlatformConfig[] = [
  {
    id: 'claude',
    name: 'Claude / Anthropic',
    icon: 'MessageSquareText',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    promptStyleName: 'XML TAGS (<SYSTEM>, <CONTEXT>)',
    description: 'Optimized for Anthropic Claude 3.5 & 3.7 Sonnet with structured XML tags and relative memory blocks.',
  },
  {
    id: 'claude_mcp',
    name: 'Claude MCP Protocol',
    icon: 'Server',
    color: 'text-amber-500 dark:text-amber-300',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    promptStyleName: 'JSON-RPC 2.0 PROTOCOL',
    description: 'Direct Model Context Protocol server endpoint for Claude Desktop, Cursor, and Anthropic API agents.',
  },
];

export const INITIAL_CONTEXT_MEMORIES: ContextMemory[] = [
  {
    id: 'ctx-001',
    title: 'Claude Senior Full-Stack Architect Persona',
    category: 'system_prompt',
    summary: 'Core agent identity specifying clean code principles, TypeScript 5+, React 19, and Tailwind CSS rules.',
    content: 'You are a Senior Full-Stack Software Architect specializing in TypeScript, React 19, and Express. Always write production-ready code with clean architecture, strict error handling, modular UI components, and modern Tailwind CSS. Maintain complete relative context awareness across sessions.',
    tags: ['persona', 'coding', 'typescript', 'architecture'],
    platforms: ['claude'],
    claudeFormat: `<system>
  <persona>Senior Full-Stack Software Architect</persona>
  <guidelines>
    <rule>Always write production-ready TypeScript with strict types</rule>
    <rule>Follow modular React 19 component patterns</rule>
    <rule>Utilize Tailwind CSS utility styling with zero bloat</rule>
    <rule>Store relative memory context rather than full raw chat transcripts</rule>
  </guidelines>
</system>`,
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z',
  },
  {
    id: 'ctx-002',
    title: 'Developer Preferences & Stack Rules',
    category: 'fact_memory',
    summary: 'Persistent user preferences regarding coding style, preferred libraries, and Google Cloud hosting.',
    content: 'User prefers functional React with TypeScript, Vite build tool, Tailwind CSS, Google Drive for cloud backup, and dark executive slate UI themes. Prefers explicit code examples over conversational fluff.',
    tags: ['preferences', 'user_profile', 'developer_settings'],
    platforms: ['claude'],
    claudeFormat: `<user_memory>
  <preference key="framework">React 18/19 with Vite</preference>
  <preference key="styling">Tailwind CSS (utility-first)</preference>
  <preference key="cloud_storage">Google Drive via OAuth REST API</preference>
  <preference key="communication_style">Direct, technical, minimal fluff</preference>
</user_memory>`,
    createdAt: '2026-08-02T14:30:00Z',
    updatedAt: '2026-08-02T14:30:00Z',
  },
  {
    id: 'ctx-003',
    title: 'Google Drive Sync Root Path Convention',
    category: 'fact_memory',
    summary: 'Cloud storage directory naming convention and atomic sync requirements.',
    content: 'All agent context memories must sync to the dedicated Google Drive folder titled "/Agentic_AI_Context_Hub". Each memory item is saved as a structured JSON file titled "context_memory_<id>.json" alongside a master "_context_index.json" catalog.',
    tags: ['google_drive', 'cloud_storage', 'sync_protocol'],
    platforms: ['claude'],
    claudeFormat: `<context_memory>
  <drive_folder>/Agentic_AI_Context_Hub</drive_folder>
  <file_naming_convention>context_memory_<id>.json</file_naming_convention>
  <index_catalog>_context_index.json</index_catalog>
  <sync_policy>Atomic bidirectional overwrite based on updatedAt timestamp</sync_policy>
</context_memory>`,
    createdAt: '2026-08-03T11:15:00Z',
    updatedAt: '2026-08-03T11:15:00Z',
  },
  {
    id: 'ctx-004',
    title: 'Express + Vite Single-Process Architecture Pattern',
    category: 'code_artifact',
    summary: 'Durable full-stack Express server integration with Vite middleware in development and static bundle in production.',
    content: 'All full-stack applications run Express on port 3000. In development mode (NODE_ENV !== "production"), mount Vite as Express middleware using createViteServer({ server: { middlewareMode: true }, appType: "spa" }). In production, serve static assets from the dist folder.',
    tags: ['express', 'vite', 'node', 'architecture_pattern'],
    platforms: ['claude'],
    claudeFormat: `<code_artifact name="express_vite_server_pattern">
  <environment_rule>Single process on PORT 3000 host 0.0.0.0</environment_rule>
  <dev_mode>Vite middlewareMode: true integrated into Express app</dev_mode>
  <prod_mode>Serve dist/ static directory with fallback to index.html</prod_mode>
</code_artifact>`,
    createdAt: '2026-08-04T09:20:00Z',
    updatedAt: '2026-08-04T09:20:00Z',
  },
  {
    id: 'ctx-005',
    title: 'Claude MCP JSON-RPC 2.0 Tool Protocol Specification',
    category: 'code_artifact',
    summary: 'Standardized Model Context Protocol tool schema for Claude Desktop and MCP clients.',
    content: 'MCP endpoints serve JSON-RPC 2.0 messages over HTTP POST and SSE streams. Standard methods include tools/list (exposing available tools with inputSchema) and tools/call (executing specific tool logic). Responses must format results inside content array with type "text".',
    tags: ['mcp', 'json-rpc', 'claude_desktop', 'protocol'],
    platforms: ['claude'],
    claudeFormat: `<code_artifact name="claude_mcp_spec">
  <protocol>JSON-RPC 2.0</protocol>
  <methods>tools/list, tools/call, resources/list, resources/read</methods>
  <response_schema>
    { "jsonrpc": "2.0", "id": 1, "result": { "content": [{ "type": "text", "text": "..." }] } }
  </response_schema>
</code_artifact>`,
    createdAt: '2026-08-04T16:45:00Z',
    updatedAt: '2026-08-04T16:45:00Z',
  },
  {
    id: 'ctx-006',
    title: 'Relative Context Extraction & Noise Filtering Directive',
    category: 'system_prompt',
    summary: 'Strict rule preventing whole-chat transcript dumps in favor of relative context facts.',
    content: 'Never store raw conversational chat transcripts or conversational pleasantries verbatim. Parse user inputs for relative facts, persona rules, and durable architectural conventions, stripping out chatter and greetings.',
    tags: ['extraction_rules', 'memory_scope', 'filtering'],
    platforms: ['claude'],
    claudeFormat: `<system>
  <memory_extraction_directive>
    <rule>Reject raw chat transcript dumps and back-and-forth chatter</rule>
    <rule>Extract strictly relative facts, preferences, and durable code conventions</rule>
    <rule>Format extracted memory in concise XML for Claude context injection</rule>
  </memory_extraction_directive>
</system>`,
    createdAt: '2026-08-05T08:10:00Z',
    updatedAt: '2026-08-05T08:10:00Z',
  },
  {
    id: 'ctx-007',
    title: 'OAuth API Token Rotation & Safety Policy',
    category: 'fact_memory',
    summary: 'Security guidelines for handling Google Workspace OAuth tokens in browser local storage and server session proxies.',
    content: 'Access tokens obtained via Google Workspace OAuth should be kept in memory or session storage. Never log raw access tokens or client secrets to stdout/stderr. Refresh tokens must be exchanged server-side.',
    tags: ['security', 'oauth', 'token_management', 'google_workspace'],
    platforms: ['claude'],
    claudeFormat: `<user_memory>
  <security_policy>
    <rule>Never expose OAuth client secrets in browser bundles</rule>
    <rule>Use server-side proxy routes for API calls requiring secret keys</rule>
    <rule>Handle expired Google OAuth access tokens gracefully with UI login prompt</rule>
  </security_policy>
</user_memory>`,
    createdAt: '2026-08-05T14:20:00Z',
    updatedAt: '2026-08-05T14:20:00Z',
  }
];

