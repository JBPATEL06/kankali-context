"use client";

import { useState, useEffect, useMemo } from "react";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import {
  FolderIcon,
  FolderOpenIcon,
  FileTextIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
  RefreshIcon,
  CopyIcon,
  CheckIcon,
  EyeIcon,
  CodeIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  GoogleDriveIcon,
  GithubIcon,
} from "@/components/Icons";

export interface VaultEntry {
  path: string;
  name?: string;
  type: "file" | "dir" | "blob" | "tree";
  size?: number;
  updatedAt?: string;
}

interface FileContent {
  path: string;
  content: string;
  size?: number;
  updatedAt?: string;
  sha?: string;
  source: "git" | "drive";
}

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  updatedAt?: string;
  children?: TreeNode[];
}

interface VaultExplorerProps {
  hasGoogleDrive: boolean;
  hasGithubToken: boolean;
  onLinkDrive?: () => void;
  defaultSource?: "drive" | "git";
}

function buildTree(entries: VaultEntry[]): TreeNode[] {
  const root: TreeNode[] = [];
  const dirMap = new Map<string, TreeNode>();

  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));

  for (const entry of sorted) {
    const parts = entry.path.split("/");
    const fileName = parts.pop() || entry.path;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const segment = parts[i];
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;

      if (!dirMap.has(currentPath)) {
        const dirNode: TreeNode = {
          name: segment,
          path: currentPath,
          type: "dir",
          children: [],
        };
        dirMap.set(currentPath, dirNode);

        if (parentPath && dirMap.has(parentPath)) {
          dirMap.get(parentPath)!.children!.push(dirNode);
        } else {
          root.push(dirNode);
        }
      }
    }

    const fileNode: TreeNode = {
      name: fileName,
      path: entry.path,
      type: "file",
      size: entry.size,
      updatedAt: entry.updatedAt,
    };

    if (currentPath && dirMap.has(currentPath)) {
      dirMap.get(currentPath)!.children!.push(fileNode);
    } else {
      root.push(fileNode);
    }
  }

  return root;
}

function TreeNodeItem({
  node,
  depth,
  selectedPath,
  onSelectFile,
  expandedDirs,
  toggleDir,
  onDeletePath,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  expandedDirs: Set<string>;
  toggleDir: (path: string) => void;
  onDeletePath: (path: string) => void;
}) {
  if (node.type === "dir") {
    const isExpanded = expandedDirs.has(node.path);
    return (
      <div style={{ marginLeft: depth > 0 ? "0.75rem" : 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            width: "100%",
            borderRadius: "4px",
            transition: "background 0.15s ease",
          }}
        >
          <button
            type="button"
            onClick={() => toggleDir(node.path)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              flex: 1,
              textAlign: "left",
              padding: "0.35rem 0.5rem",
              background: "transparent",
              border: "none",
              color: "var(--on-surface)",
              fontSize: "0.825rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <span style={{ color: "var(--primary)", display: "flex", alignItems: "center" }}>
              {isExpanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
            </span>
            <span style={{ color: "var(--primary)", display: "flex", alignItems: "center" }}>
              {isExpanded ? <FolderOpenIcon size={16} /> : <FolderIcon size={16} />}
            </span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {node.name}
            </span>
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginLeft: "auto" }}>
              {node.children?.length || 0}
            </span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeletePath(node.path);
            }}
            className="btn-text"
            title={`Delete folder '${node.path}'`}
            style={{ padding: "0.25rem 0.4rem", fontSize: "0.75rem", opacity: 0.6 }}
          >
            <TrashIcon size={13} color="var(--status-critical)" />
          </button>
        </div>

        {isExpanded && node.children && (
          <div
            style={{
              borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
              marginLeft: "0.6rem",
              paddingLeft: "0.25rem",
            }}
          >
            {node.children.map((child) => (
              <TreeNodeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelectFile={onSelectFile}
                expandedDirs={expandedDirs}
                toggleDir={toggleDir}
                onDeletePath={onDeletePath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isSelected = selectedPath === node.path;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        marginLeft: depth > 0 ? "0.75rem" : 0,
        borderRadius: "4px",
        border: isSelected ? "1px solid rgba(56, 189, 248, 0.35)" : "1px solid transparent",
        background: isSelected ? "rgba(56, 189, 248, 0.14)" : "transparent",
      }}
    >
      <button
        type="button"
        onClick={() => onSelectFile(node.path)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.45rem",
          flex: 1,
          textAlign: "left",
          padding: "0.35rem 0.5rem",
          background: "transparent",
          border: "none",
          color: isSelected ? "var(--primary)" : "var(--on-surface)",
          fontSize: "0.825rem",
          cursor: "pointer",
          minWidth: 0,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", color: isSelected ? "var(--primary)" : "var(--text-muted)" }}>
          <FileTextIcon size={14} />
        </span>
        <span
          style={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontFamily: node.name.endsWith(".md") ? "var(--font-sans)" : "var(--font-mono)",
          }}
        >
          {node.name}
        </span>
        {node.size != null && (
          <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {node.size > 1024 ? `${(node.size / 1024).toFixed(1)}k` : `${node.size}b`}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDeletePath(node.path);
        }}
        className="btn-text"
        title={`Delete '${node.path}'`}
        style={{ padding: "0.25rem 0.4rem", opacity: isSelected ? 0.9 : 0.4 }}
      >
        <TrashIcon size={13} color="var(--status-critical)" />
      </button>
    </div>
  );
}

export function VaultExplorer({
  hasGoogleDrive,
  hasGithubToken,
  onLinkDrive,
  defaultSource,
}: VaultExplorerProps) {
  const [source, setSource] = useState<"drive" | "git">(
    defaultSource || (hasGoogleDrive ? "drive" : hasGithubToken ? "git" : "drive")
  );
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileData, setFileData] = useState<FileContent | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"preview" | "raw">("preview");

  // In-place Editing State
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [savingFile, setSavingFile] = useState(false);

  // New File / Folder Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createType, setCreateType] = useState<"file" | "folder">("file");
  const [createPath, setCreatePath] = useState("");
  const [createContent, setCreateContent] = useState("");
  const [creating, setCreating] = useState(false);

  // Delete Confirmation Modal State
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [confirmToken, setConfirmToken] = useState<string | null>(null);
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function fetchTree() {
    setError(null);
    setLoadingTree(true);
    try {
      const res = await fetch(`/api/vault/tree?source=${source}&recursive=true`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load files.");
        setEntries([]);
      } else {
        const fileList: VaultEntry[] = (data.entries || []).filter(
          (e: VaultEntry) => e.type === "file" || e.type === "blob"
        );
        setEntries(fileList);

        if (fileList.length > 0 && (!selectedPath || !fileList.some((f) => f.path === selectedPath))) {
          loadFile(fileList[0].path);
        } else if (fileList.length === 0) {
          setSelectedPath(null);
          setFileData(null);
        }
      }
    } catch {
      setError("Network error while loading file tree.");
    } finally {
      setLoadingTree(false);
    }
  }

  async function loadFile(path: string) {
    setSelectedPath(path);
    setLoadingFile(true);
    setError(null);
    setIsEditing(false);
    try {
      const res = await fetch(
        `/api/vault/file?source=${source}&path=${encodeURIComponent(path)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to read file.");
        setFileData(null);
      } else {
        setFileData(data);
        setEditContent(data.content || "");
      }
    } catch {
      setError("Network error while reading file.");
      setFileData(null);
    } finally {
      setLoadingFile(false);
    }
  }

  useEffect(() => {
    fetchTree();
  }, [source]);

  function toggleDir(path: string) {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function expandAll() {
    const allDirs = new Set<string>();
    for (const f of entries) {
      const parts = f.path.split("/");
      let p = "";
      for (let i = 0; i < parts.length - 1; i++) {
        p = p ? `${p}/${parts[i]}` : parts[i];
        allDirs.add(p);
      }
    }
    setExpandedDirs(allDirs);
  }

  function collapseAll() {
    setExpandedDirs(new Set());
  }

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase().trim();
    return entries.filter((e) => e.path.toLowerCase().includes(q));
  }, [entries, searchQuery]);

  const treeNodes = useMemo(() => {
    return buildTree(filteredEntries);
  }, [filteredEntries]);

  function copyContent() {
    if (!fileData?.content) return;
    navigator.clipboard.writeText(fileData.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // CRUD: Save in-place edited file
  async function handleSaveEdit() {
    if (!selectedPath) return;
    setSavingFile(true);
    try {
      const res = await fetch("/api/vault/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, path: selectedPath, content: editContent }),
      });
      const data = await res.json();
      setSavingFile(false);
      if (!res.ok) {
        alert(data.error || "Failed to save file.");
      } else {
        showToast("File saved successfully!");
        setIsEditing(false);
        await loadFile(selectedPath);
      }
    } catch {
      setSavingFile(false);
      alert("Network error while saving file.");
    }
  }

  // CRUD: Create new file or folder
  async function handleCreateItem(e: React.FormEvent) {
    e.preventDefault();
    if (!createPath.trim()) return;
    setCreating(true);

    const targetPath =
      createType === "folder"
        ? `${createPath.replace(/\/+$/, "")}/README.md`
        : createPath.trim();

    const initialContent =
      createType === "folder"
        ? `# ${createPath}\n\nFolder initialized.`
        : createContent || `# ${createPath}\n\n`;

    try {
      const res = await fetch("/api/vault/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, path: targetPath, content: initialContent }),
      });
      const data = await res.json();
      setCreating(false);
      if (!res.ok) {
        alert(data.error || "Failed to create item.");
      } else {
        showToast(`${createType === "folder" ? "Folder" : "File"} created!`);
        setIsCreateModalOpen(false);
        setCreatePath("");
        setCreateContent("");
        await fetchTree();
        await loadFile(targetPath);
      }
    } catch {
      setCreating(false);
      alert("Network error while creating item.");
    }
  }

  // CRUD: Delete Initiation & Execution
  async function executeDelete(token?: string) {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/vault/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, path: deleteTarget, confirm_token: token }),
      });
      const data = await res.json();
      setDeleting(false);

      if (!res.ok) {
        alert(data.error || "Delete failed.");
        setDeleteTarget(null);
        setConfirmToken(null);
      } else if (data.confirmation_required) {
        setConfirmToken(data.confirm_token);
        setDeleteWarning(data.message || `Deleting '${deleteTarget}' is permanent and cannot be undone.`);
      } else {
        showToast(`'${deleteTarget}' deleted!`);
        setDeleteTarget(null);
        setConfirmToken(null);
        setDeleteWarning(null);
        if (selectedPath === deleteTarget) {
          setSelectedPath(null);
          setFileData(null);
        }
        await fetchTree();
      }
    } catch {
      setDeleting(false);
      alert("Network error during deletion.");
    }
  }

  const isConnected = source === "drive" ? hasGoogleDrive : hasGithubToken;

  return (
    <div className="card" style={{ padding: "1.25rem", position: "relative" }}>
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: "absolute",
            top: "1rem",
            right: "1rem",
            background: "var(--surface-container-high)",
            border: "1px solid var(--tertiary)",
            color: "var(--tertiary)",
            padding: "0.5rem 1rem",
            borderRadius: "4px",
            fontSize: "0.825rem",
            fontWeight: 600,
            zIndex: 50,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          <CheckIcon size={14} color="var(--tertiary)" /> {toast}
        </div>
      )}

      {/* Header & Controls Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "1.25rem",
          paddingBottom: "1rem",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <h2 className="card__title" style={{ margin: 0, fontSize: "1.2rem" }}>
              Context Vault File Explorer
            </h2>
            <span className="badge-tag badge-tag--mint" style={{ fontSize: "0.7rem" }}>
              FULL CRUD
            </span>
          </div>
          <p style={{ fontSize: "0.825rem", color: "var(--text-medium)", margin: "0.25rem 0 0" }}>
            Create, edit, inspect, and delete files &amp; folders on Google Drive App Data or GitHub.
          </p>
        </div>

        {/* Storage Tabs */}
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>

          <button
            type="button"
            onClick={() => setSource("drive")}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: "4px",
              fontSize: "0.8rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              border:
                source === "drive"
                  ? "1px solid var(--primary-container)"
                  : "1px solid var(--border-subtle)",
              background:
                source === "drive"
                  ? "rgba(56, 189, 248, 0.15)"
                  : "rgba(255, 255, 255, 0.03)",
              color: source === "drive" ? "var(--primary)" : "var(--on-surface-variant)",
            }}
          >
            <GoogleDriveIcon size={14} /> Google Drive
          </button>

          <button
            type="button"
            onClick={() => setSource("git")}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: "4px",
              fontSize: "0.8rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              border:
                source === "git"
                  ? "1px solid var(--primary-container)"
                  : "1px solid var(--border-subtle)",
              background:
                source === "git"
                  ? "rgba(56, 189, 248, 0.15)"
                  : "rgba(255, 255, 255, 0.03)",
              color: source === "git" ? "var(--primary)" : "var(--on-surface-variant)",
            }}
          >
            <GithubIcon size={14} /> GitHub
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={fetchTree}
            disabled={loadingTree}
            className="btn-tonal"
            title="Refresh files"
            style={{ padding: "0.35rem 0.6rem", fontSize: "0.8rem", display: "flex", alignItems: "center" }}
          >
            <RefreshIcon size={14} className={loadingTree ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Explorer Workspace */}
      {!isConnected ? (
        <div
          style={{
            textAlign: "center",
            padding: "2.5rem 1rem",
            background: "rgba(6, 14, 32, 0.5)",
            borderRadius: "6px",
            border: "1px dashed var(--border-subtle)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.75rem", color: "var(--primary)" }}>
            {source === "drive" ? <GoogleDriveIcon size={36} /> : <GithubIcon size={36} />}
          </div>
          <h3 style={{ fontSize: "1rem", color: "#ffffff", margin: "0 0 0.5rem" }}>
            {source === "drive" ? "Google Drive Not Linked" : "GitHub Not Configured"}
          </h3>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", maxWidth: "24rem", margin: "0 auto 1.25rem" }}>
            {source === "drive"
              ? "Link your Google Drive in Settings to store and manage private context files."
              : "Save your GitHub Personal Access Token and repository details in Settings to view repository files."}
          </p>
          {source === "drive" && onLinkDrive && (
            <button
              type="button"
              onClick={onLinkDrive}
              className="btn-filled"
              style={{ fontSize: "0.85rem", padding: "0.5rem 1rem" }}
            >
              Link Google Drive
            </button>
          )}
        </div>
      ) : (
        <div className="vault-grid">
          {/* Left Panel: Hierarchical File Tree & Sidebar */}
          <div className="vault-sidebar">
            {/* Search Box */}
            <div style={{ padding: "0.6rem", borderBottom: "1px solid var(--border-subtle)" }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search files or folders..."
                style={{
                  width: "100%",
                  padding: "0.4rem 0.6rem",
                  fontSize: "0.8rem",
                  background: "rgba(0, 0, 0, 0.3)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "4px",
                  color: "#ffffff",
                  outline: "none",
                }}
              />
            </div>

            {/* Expand / Collapse Controls */}
            <div
              style={{
                display: "flex",
                gap: "0.4rem",
                padding: "0.35rem 0.6rem",
                borderBottom: "1px solid var(--border-subtle)",
                background: "rgba(0, 0, 0, 0.2)",
              }}
            >
              <button
                type="button"
                onClick={expandAll}
                className="btn-tonal"
                style={{ flex: 1, padding: "0.25rem 0.4rem", fontSize: "0.725rem", justifyContent: "center", display: "flex", alignItems: "center", gap: "0.3rem" }}
              >
                <FolderOpenIcon size={12} /> Expand
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="btn-tonal"
                style={{ flex: 1, padding: "0.25rem 0.4rem", fontSize: "0.725rem", justifyContent: "center", display: "flex", alignItems: "center", gap: "0.3rem" }}
              >
                <FolderIcon size={12} /> Collapse
              </button>
            </div>

            {/* Tree Items */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0.4rem" }}>
              {loadingTree ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                  Loading structure…
                </div>
              ) : treeNodes.length === 0 ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                  {searchQuery ? "No matching files" : "Vault is empty"}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
                  {treeNodes.map((node) => (
                    <TreeNodeItem
                      key={node.path}
                      node={node}
                      depth={0}
                      selectedPath={selectedPath}
                      onSelectFile={loadFile}
                      expandedDirs={expandedDirs}
                      toggleDir={toggleDir}
                      onDeletePath={(p) => {
                        setDeleteTarget(p);
                        executeDelete();
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Tree Footer */}
            <div
              style={{
                padding: "0.45rem 0.65rem",
                borderTop: "1px solid var(--border-subtle)",
                fontSize: "0.72rem",
                color: "var(--text-muted)",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>{entries.length} total file(s)</span>
              <span>{source === "drive" ? "Google App Data" : "GitHub Master"}</span>
            </div>
          </div>

          {/* Right Panel: File Preview, Live Inspector & In-place Editor */}
          <div className="vault-inspector">
            {selectedPath ? (
              <>
                {/* File Header Bar */}
                <div
                  style={{
                    padding: "0.6rem 0.85rem",
                    borderBottom: "1px solid var(--border-subtle)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    background: "rgba(0, 0, 0, 0.25)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                    <FileTextIcon size={14} color="var(--primary)" />
                    <span style={{ fontSize: "0.85rem", color: "var(--color-cyan-light)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                      {selectedPath}
                    </span>
                    {fileData?.size != null && (
                      <span className="badge-tag" style={{ fontSize: "0.65rem", padding: "0.1rem 0.4rem" }}>
                        {fileData.size} bytes
                      </span>
                    )}
                  </div>

                  {/* Actions Toolbar */}
                  <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
                    {/* View Mode Toggle for Markdown */}
                    {selectedPath.endsWith(".md") && !isEditing && (
                      <div
                        style={{
                          display: "flex",
                          background: "rgba(0, 0, 0, 0.35)",
                          borderRadius: "4px",
                          padding: "2px",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setViewMode("preview")}
                          style={{
                            padding: "0.18rem 0.45rem",
                            borderRadius: "3px",
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            border: "none",
                            background: viewMode === "preview" ? "rgba(56, 189, 248, 0.22)" : "transparent",
                            color: viewMode === "preview" ? "var(--primary)" : "var(--text-muted)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.25rem",
                          }}
                        >
                          <EyeIcon size={11} /> View
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode("raw")}
                          style={{
                            padding: "0.18rem 0.45rem",
                            borderRadius: "3px",
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            border: "none",
                            background: viewMode === "raw" ? "rgba(56, 189, 248, 0.22)" : "transparent",
                            color: viewMode === "raw" ? "var(--primary)" : "var(--text-muted)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.25rem",
                          }}
                        >
                          <CodeIcon size={11} /> Raw
                        </button>
                      </div>
                    )}

                    {/* Edit / Save Button */}
                    {!isEditing ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditContent(fileData?.content || "");
                          setIsEditing(true);
                        }}
                        className="btn-tonal"
                        style={{ padding: "0.22rem 0.55rem", fontSize: "0.75rem", color: "var(--primary)", display: "flex", alignItems: "center", gap: "0.3rem" }}
                      >
                        <EditIcon size={12} /> Edit
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          disabled={savingFile}
                          className="btn-filled"
                          style={{ padding: "0.22rem 0.65rem", fontSize: "0.75rem" }}
                        >
                          {savingFile ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsEditing(false)}
                          className="btn-tonal"
                          style={{ padding: "0.22rem 0.55rem", fontSize: "0.75rem" }}
                        >
                          Cancel
                        </button>
                      </>
                    )}

                    {/* Copy Button */}
                    <button
                      type="button"
                      onClick={copyContent}
                      disabled={!fileData?.content}
                      className="btn-tonal"
                      style={{ padding: "0.22rem 0.55rem", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
                    >
                      {copied ? <CheckIcon size={12} color="var(--tertiary)" /> : <CopyIcon size={12} />}
                      {copied ? "COPIED" : "Copy"}
                    </button>

                    {/* Delete File Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteTarget(selectedPath);
                        executeDelete();
                      }}
                      className="btn-tonal"
                      style={{ padding: "0.22rem 0.55rem", fontSize: "0.75rem", color: "var(--status-critical)", display: "flex", alignItems: "center", gap: "0.3rem" }}
                      title="Delete file"
                    >
                      <TrashIcon size={12} color="var(--status-critical)" /> Delete
                    </button>
                  </div>
                </div>

                {/* Content Body / In-place Editor */}
                <div style={{ flex: 1, padding: "1rem", overflowY: "auto", position: "relative" }}>
                  {loadingFile ? (
                    <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
                      Loading content…
                    </div>
                  ) : error ? (
                    <div style={{ padding: "1.5rem", color: "var(--status-critical)", fontSize: "0.85rem" }}>
                      {error}
                    </div>
                  ) : isEditing ? (
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      style={{
                        width: "100%",
                        height: "100%",
                        minHeight: "380px",
                        background: "#04070d",
                        border: "1px solid var(--border-primary)",
                        borderRadius: "4px",
                        color: "#ffffff",
                        padding: "0.75rem",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.85rem",
                        lineHeight: 1.6,
                        outline: "none",
                        resize: "vertical",
                      }}
                    />
                  ) : fileData ? (
                    selectedPath.endsWith(".md") && viewMode === "preview" ? (
                      <MarkdownPreview content={fileData.content} />
                    ) : (
                      <pre
                        style={{
                          margin: 0,
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.825rem",
                          lineHeight: 1.65,
                          color: "var(--on-surface)",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {fileData.content}
                      </pre>
                    )
                  ) : null}
                </div>
              </>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "column",
                  color: "var(--text-muted)",
                  padding: "2rem",
                  textAlign: "center",
                }}
              >
                <div style={{ color: "var(--primary)", marginBottom: "0.75rem" }}>
                  <FolderOpenIcon size={44} />
                </div>
                <div style={{ fontSize: "0.95rem", color: "#ffffff", fontWeight: 600 }}>
                  Select a File to Inspect or Edit
                </div>
                <div style={{ fontSize: "0.825rem", maxWidth: "22rem", marginTop: "0.35rem", color: "var(--text-muted)" }}>
                  Click on any folder to expand, or use <strong>+ File</strong> / <strong>+ Folder</strong> above to create new context documents.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Create New File or Folder */}
      {isCreateModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "30rem",
              background: "var(--surface-container-high)",
              border: "1px solid var(--border-primary)",
              padding: "1.5rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#ffffff", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                {createType === "folder" ? <FolderIcon size={18} color="var(--primary)" /> : <FileTextIcon size={18} color="var(--primary)" />}
                {createType === "folder" ? "Create New Folder" : "Create New File"}
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="btn-text"
                style={{ fontSize: "1.2rem", padding: "0.2rem 0.5rem" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateItem} className="form-grid">
              <div className="field">
                <label>
                  {createType === "folder" ? "Folder Path (e.g. docs/api-specs)" : "File Path (e.g. docs/notes.md)"} *
                </label>
                <input
                  type="text"
                  value={createPath}
                  onChange={(e) => setCreatePath(e.target.value)}
                  placeholder={createType === "folder" ? "e.g. docs/api-specs" : "e.g. docs/my-note.md"}
                  required
                />
              </div>

              {createType === "file" && (
                <div className="field">
                  <label>Initial Markdown Content</label>
                  <textarea
                    value={createContent}
                    onChange={(e) => setCreateContent(e.target.value)}
                    placeholder="# Title\n\nInitial notes..."
                    rows={4}
                    style={{
                      width: "100%",
                      background: "rgba(0, 0, 0, 0.3)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "4px",
                      color: "#ffffff",
                      padding: "0.5rem",
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.825rem",
                    }}
                  />
                </div>
              )}

              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="btn-tonal"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !createPath.trim()}
                  className="btn-filled"
                >
                  {creating ? "Creating..." : createType === "folder" ? "Create Folder" : "Create File"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Delete Two-Step Confirmation */}
      {confirmToken && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "28rem",
              background: "var(--surface-container-high)",
              border: "1px solid var(--status-critical)",
              padding: "1.5rem",
              textAlign: "center",
            }}
          >
            <div style={{ color: "var(--status-critical)", display: "flex", justifyContent: "center", marginBottom: "0.5rem" }}>
              <TrashIcon size={36} color="var(--status-critical)" />
            </div>
            <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem", color: "#ffffff" }}>
              Confirm Irreversible Deletion
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-medium)", margin: "0 0 1.25rem", lineHeight: 1.5 }}>
              {deleteWarning || `Are you sure you want to permanently delete '${deleteTarget}'?`}
            </p>

            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
              <button
                type="button"
                onClick={() => {
                  setConfirmToken(null);
                  setDeleteTarget(null);
                }}
                className="btn-tonal"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeDelete(confirmToken)}
                disabled={deleting}
                className="btn-filled"
                style={{ background: "var(--status-critical)", borderColor: "var(--status-critical)" }}
              >
                {deleting ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
