import React, { useState, useEffect } from 'react';
import { 
  Folder, 
  FolderPlus, 
  FileText, 
  FileCode, 
  FileJson, 
  Upload, 
  RefreshCw, 
  Trash2, 
  Eye, 
  ExternalLink, 
  ChevronRight, 
  HardDrive, 
  CheckCircle2, 
  Edit3, 
  MoveRight, 
  Sparkles,
  ArrowLeft,
  X,
  Bot
} from 'lucide-react';
import { DriveFileItem, UserSession } from '../types';

export interface VaultFolder {
  id: string;
  name: string;
  parentId: string;
  createdByAgent?: string;
  agentNamespace?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface VaultFile {
  id: string;
  name: string;
  parentId: string;
  content: string;
  mimeType: string;
  createdByAgent?: string;
  agentNamespace?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface DriveExplorerProps {
  userSession: UserSession | null;
  driveFiles: DriveFileItem[];
  driveFolderUrl: string | null;
  onRefreshDrive: () => void;
  onUploadFile: (fileName: string, mimeType: string, content: string) => Promise<void>;
  onDeleteFile: (fileId: string) => Promise<void>;
  onDownloadFile: (fileId: string) => Promise<string>;
  onLogin: () => void;
  isLoading: boolean;
}

export const DriveExplorer: React.FC<DriveExplorerProps> = ({
  userSession,
  driveFiles,
  driveFolderUrl,
  onRefreshDrive,
  onUploadFile,
  onDeleteFile,
  onDownloadFile,
  onLogin,
  isLoading,
}) => {
  // Local state for current folder navigation
  const [currentFolderId, setCurrentFolderId] = useState<string>('root');
  const [folderPath, setFolderPath] = useState<{ id: string; name: string }[]>([
    { id: 'root', name: 'Vault Root' },
  ]);

  // Server vault state
  const [vaultFolders, setVaultFolders] = useState<VaultFolder[]>([]);
  const [vaultFiles, setVaultFiles] = useState<VaultFile[]>([]);
  const [isTreeLoading, setIsTreeLoading] = useState<boolean>(false);

  // Modals
  const [showNewFolderModal, setShowNewFolderModal] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');

  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [uploadFileName, setUploadFileName] = useState<string>('');
  const [uploadFileContent, setUploadFileContent] = useState<string>('');

  const [selectedFile, setSelectedFile] = useState<{ id: string; name: string; content: string; createdByAgent?: string } | null>(null);

  const [moveItemModal, setMoveItemModal] = useState<{ id: string; name: string; currentParentId: string } | null>(null);
  const [targetMoveParentId, setTargetMoveParentId] = useState<string>('root');

  // Load backend vault structure
  const fetchVaultTree = async () => {
    setIsTreeLoading(true);
    try {
      const res = await fetch('/api/vault/tree');
      if (res.ok) {
        const data = await res.json();
        setVaultFolders(data.folders || []);
        setVaultFiles(data.files || []);
      }
    } catch (err) {
      console.error('Failed to fetch vault tree:', err);
    } finally {
      setIsTreeLoading(false);
    }
  };

  useEffect(() => {
    fetchVaultTree();
  }, []);

  // Filter current folder contents
  const currentFolders = vaultFolders.filter((f) => f.parentId === currentFolderId);
  const currentFiles = vaultFiles.filter((f) => f.parentId === currentFolderId);

  // Drive synced files matching current folder or drive root
  const currentDriveFiles = driveFiles.filter((df) => !df.name.startsWith('_'));

  const navigateToFolder = (folderId: string, folderName: string) => {
    setCurrentFolderId(folderId);
    setFolderPath((prev) => [...prev, { id: folderId, name: folderName }]);
  };

  const navigateToBreadcrumb = (index: number) => {
    const newPath = folderPath.slice(0, index + 1);
    setFolderPath(newPath);
    setCurrentFolderId(newPath[newPath.length - 1].id);
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      const res = await fetch('/api/vault/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFolderName.trim(),
          parentFolderId: currentFolderId,
          agentName: 'User Dashboard',
        }),
      });

      if (res.ok) {
        setNewFolderName('');
        setShowNewFolderModal(false);
        await fetchVaultTree();
      }
    } catch (err) {
      alert('Failed to create folder');
    }
  };

  const handleUploadFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFileName.trim() || !uploadFileContent.trim()) return;

    try {
      const mimeType = uploadFileName.endsWith('.json')
        ? 'application/json'
        : uploadFileName.endsWith('.md')
        ? 'text/markdown'
        : 'text/plain';

      // Save to server vault
      await fetch('/api/vault/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: uploadFileName.trim(),
          content: uploadFileContent,
          parentFolderId: currentFolderId,
          mimeType,
          agentName: 'User Dashboard',
        }),
      });

      // Also sync to Google Drive if authenticated
      if (userSession?.accessToken) {
        await onUploadFile(uploadFileName, mimeType, uploadFileContent);
      }

      setUploadFileName('');
      setUploadFileContent('');
      setShowUploadModal(false);
      await fetchVaultTree();
    } catch (err) {
      console.error('Failed to create file:', err);
    }
  };

  const handleMoveItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveItemModal) return;

    try {
      const res = await fetch('/api/vault/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: moveItemModal.id,
          newParentFolderId: targetMoveParentId,
        }),
      });

      if (res.ok) {
        setMoveItemModal(null);
        await fetchVaultTree();
      }
    } catch (err) {
      alert('Failed to move item');
    }
  };

  const handleDeleteItem = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete '${name}' from the vault?`)) return;

    try {
      await fetch(`/api/vault/items/${id}`, { method: 'DELETE' });
      await fetchVaultTree();
      if (selectedFile?.id === id) setSelectedFile(null);
    } catch (err) {
      alert('Failed to delete item');
    }
  };

  const getFileIcon = (fileName: string) => {
    if (fileName.endsWith('.json')) return <FileJson className="w-5 h-5 text-amber-400" />;
    if (fileName.endsWith('.md')) return <FileText className="w-5 h-5 text-blue-400" />;
    if (fileName.endsWith('.js') || fileName.endsWith('.ts') || fileName.endsWith('.py'))
      return <FileCode className="w-5 h-5 text-emerald-400" />;
    return <FileText className="w-5 h-5 text-zinc-400" />;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Vault Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 glass-panel p-6 sm:p-8 rounded-3xl border border-purple-500/20 shadow-2xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center gap-1.5 font-bold shadow-[0_0_10px_rgba(168,85,247,0.2)]">
              <HardDrive className="w-3.5 h-3.5 text-purple-400" /> appDataFolder Vault
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Live AI Multi-Agent File System
            </span>
          </div>
          <h2 className="text-2xl font-serif italic bg-gradient-to-r from-white via-slate-100 to-purple-200 bg-clip-text text-transparent mt-2">
            Google Drive & AI Context Vault Explorer
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowNewFolderModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all cursor-pointer"
          >
            <FolderPlus className="w-4 h-4 text-purple-300" />
            <span>New Folder</span>
          </button>

          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white shadow-[0_0_16px_rgba(168,85,247,0.3)] border border-purple-300/30 transition-all cursor-pointer"
          >
            <Upload className="w-4 h-4 text-white" />
            <span>Create / Upload File</span>
          </button>

          <button
            onClick={() => {
              fetchVaultTree();
              onRefreshDrive();
            }}
            disabled={isLoading || isTreeLoading}
            className="p-2.5 rounded-xl text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
            title="Refresh Vault Explorer"
          >
            <RefreshCw className={`w-4 h-4 ${(isLoading || isTreeLoading) ? 'animate-spin text-purple-300' : ''}`} />
          </button>

          {driveFolderUrl && (
            <a
              href={driveFolderUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-mono uppercase tracking-wider text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 transition-all font-semibold"
            >
              <span>Drive App</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </a>
          )}
        </div>
      </div>

      {/* Breadcrumb Navigation Bar */}
      <div className="flex items-center gap-2 px-5 py-3.5 glass-panel rounded-2xl border border-white/10 overflow-x-auto text-xs font-mono text-slate-300">
        {folderPath.map((item, idx) => (
          <React.Fragment key={item.id}>
            {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
            <button
              onClick={() => navigateToBreadcrumb(idx)}
              className={`hover:text-purple-300 transition-colors cursor-pointer flex items-center gap-1.5 ${
                idx === folderPath.length - 1 ? 'text-purple-300 font-bold' : 'text-slate-400'
              }`}
            >
              {idx === 0 ? <HardDrive className="w-3.5 h-3.5 text-purple-400" /> : <Folder className="w-3.5 h-3.5 text-purple-400" />}
              <span>{item.name}</span>
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Vault Contents Section */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Directory Tree Navigation Sidebar */}
        <div className="lg:col-span-1 glass-panel p-5 rounded-3xl border border-white/10 space-y-4">
          <h3 className="text-xs font-mono uppercase tracking-widest text-slate-400 flex items-center gap-2 font-semibold">
            <Folder className="w-4 h-4 text-purple-400" />
            Vault Hierarchy
          </h3>

          <div className="space-y-1.5 text-xs font-mono">
            <button
              onClick={() => {
                setCurrentFolderId('root');
                setFolderPath([{ id: 'root', name: 'Vault Root' }]);
              }}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl flex items-center gap-2.5 transition-all cursor-pointer ${
                currentFolderId === 'root' ? 'bg-purple-500/20 text-purple-200 border border-purple-500/30 font-semibold shadow-[0_0_12px_rgba(168,85,247,0.15)]' : 'text-slate-400 hover:bg-white/5'
              }`}
            >
              <HardDrive className="w-4 h-4 text-purple-400 shrink-0" />
              <span className="truncate">Vault Root</span>
            </button>

            {vaultFolders.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setCurrentFolderId(f.id);
                  setFolderPath([
                    { id: 'root', name: 'Vault Root' },
                    { id: f.id, name: f.name },
                  ]);
                }}
                className={`w-full text-left pl-6 pr-3.5 py-2.5 rounded-xl flex items-center gap-2.5 transition-all cursor-pointer ${
                  currentFolderId === f.id ? 'bg-purple-500/20 text-purple-200 border border-purple-500/30 font-semibold shadow-[0_0_12px_rgba(168,85,247,0.15)]' : 'text-slate-400 hover:bg-white/5'
                }`}
              >
                <Folder className="w-4 h-4 text-purple-400 shrink-0" />
                <span className="truncate">{f.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Main Folder Grid View */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Folders Section */}
          <div>
            <h4 className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2 font-semibold">
              <Folder className="w-4 h-4 text-purple-400" />
              Subfolders ({currentFolders.length})
            </h4>

            {currentFolders.length === 0 ? (
              <div className="p-6 glass-panel rounded-2xl border border-dashed border-white/10 text-center text-xs font-mono text-slate-500">
                No subfolders created yet in this directory.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {currentFolders.map((folder) => (
                  <div
                    key={folder.id}
                    className="group glass-card p-4 rounded-2xl border border-white/10 hover:border-purple-500/40 transition-all flex flex-col justify-between space-y-3 cursor-pointer shadow-lg"
                    onClick={() => navigateToFolder(folder.id, folder.name)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Folder className="w-5 h-5 text-purple-400 shrink-0 group-hover:scale-110 transition-transform" />
                        <span className="font-semibold text-sm text-white truncate group-hover:text-purple-300">
                          {folder.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMoveItemModal({ id: folder.id, name: folder.name, currentParentId: folder.parentId });
                          }}
                          className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10"
                          title="Move Folder"
                        >
                          <MoveRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteItem(folder.id, folder.name);
                          }}
                          className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-white/10"
                          title="Delete Folder"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-2 border-t border-white/5">
                      <span className="flex items-center gap-1 text-purple-300/80">
                        <Bot className="w-3 h-3" />
                        {folder.createdByAgent || 'Agent Created'}
                      </span>
                      <span>Folder</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Files Section */}
          <div>
            <h4 className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2 font-semibold">
              <FileText className="w-4 h-4 text-indigo-400" />
              Files & Context Artifacts ({currentFiles.length + (currentFolderId === 'root' ? currentDriveFiles.length : 0)})
            </h4>

            {currentFiles.length === 0 && (currentFolderId !== 'root' || currentDriveFiles.length === 0) ? (
              <div className="p-8 glass-panel rounded-2xl border border-dashed border-white/10 text-center text-xs font-mono text-slate-500">
                No files in this folder. AI agents can create notes and files directly via MCP tool <code className="text-purple-300">write_file</code>.
              </div>
            ) : (
              <div className="space-y-2.5">
                {/* Vault files */}
                {currentFiles.map((file) => (
                  <div
                    key={file.id}
                    className="p-4 glass-card rounded-2xl border border-white/10 hover:border-purple-500/30 transition-all flex items-center justify-between gap-4 group"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {getFileIcon(file.name)}
                      <div className="min-w-0">
                        <p className="text-xs font-mono font-medium text-white truncate group-hover:text-purple-300">
                          {file.name}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500 mt-0.5">
                          <span className="text-purple-300/80 flex items-center gap-1">
                            <Bot className="w-3 h-3" /> {file.createdByAgent || 'Claude MCP'}
                          </span>
                          <span>•</span>
                          <span>{file.mimeType}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setSelectedFile({ id: file.id, name: file.name, content: file.content, createdByAgent: file.createdByAgent })}
                        className="px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-xs font-mono text-purple-300 border border-purple-500/30 flex items-center gap-1.5 cursor-pointer font-semibold transition-all"
                      >
                        <Eye className="w-3.5 h-3.5 text-purple-300" />
                        <span>View</span>
                      </button>

                      <button
                        onClick={() => setMoveItemModal({ id: file.id, name: file.name, currentParentId: file.parentId })}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                        title="Move File"
                      >
                        <MoveRight className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeleteItem(file.id, file.name)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-white/10"
                        title="Delete File"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Google Drive synced files if root */}
                {currentFolderId === 'root' &&
                  currentDriveFiles.map((driveFile) => (
                    <div
                      key={driveFile.id}
                      className="p-4 glass-card rounded-2xl border border-purple-500/20 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        {getFileIcon(driveFile.name)}
                        <div className="min-w-0">
                          <p className="text-xs font-mono font-medium text-purple-200 truncate">
                            {driveFile.name}
                          </p>
                          <p className="text-[10px] font-mono text-slate-400">
                            Synced Google Drive File • {driveFile.size ? `${Math.round(parseInt(driveFile.size) / 1024)} KB` : 'Drive Document'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={async () => {
                            try {
                              const content = await onDownloadFile(driveFile.id);
                              setSelectedFile({ id: driveFile.id, name: driveFile.name, content });
                            } catch {
                              alert('Failed to download drive file');
                            }
                          }}
                          className="px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-xs font-mono text-purple-300 border border-purple-500/30 flex items-center gap-1.5 cursor-pointer font-semibold"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>

                        <button
                          onClick={() => onDeleteFile(driveFile.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-white/10"
                          title="Delete Drive File"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel border border-purple-500/30 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-serif italic text-white flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-purple-400" />
                Create New Vault Folder
              </h3>
              <button onClick={() => setShowNewFolderModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateFolder} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Folder Name</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. project-x or system-prompts"
                  className="w-full px-3.5 py-2.5 glass-input rounded-xl text-xs font-mono text-white focus:outline-none"
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewFolderModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-mono text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newFolderName.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold uppercase bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white disabled:opacity-50 cursor-pointer shadow-[0_0_12px_rgba(168,85,247,0.3)]"
                >
                  Create Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload/Create File Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel border border-purple-500/30 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-serif italic text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-purple-400" />
                Create / Write New Vault File
              </h3>
              <button onClick={() => setShowUploadModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadFileSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">File Name (with extension)</label>
                <input
                  type="text"
                  value={uploadFileName}
                  onChange={(e) => setUploadFileName(e.target.value)}
                  placeholder="e.g. architecture_rules.md or user_config.json"
                  className="w-full px-3.5 py-2.5 glass-input rounded-xl text-xs font-mono text-white focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">File Content</label>
                <textarea
                  rows={6}
                  value={uploadFileContent}
                  onChange={(e) => setUploadFileContent(e.target.value)}
                  placeholder="Write Markdown, JSON, or plain text content..."
                  className="w-full px-3.5 py-2.5 glass-input rounded-xl text-xs font-mono text-white focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-mono text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!uploadFileName.trim() || !uploadFileContent.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold uppercase bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white disabled:opacity-50 cursor-pointer shadow-[0_0_12px_rgba(168,85,247,0.3)]"
                >
                  Save File to Vault
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Move Item Modal */}
      {moveItemModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel border border-purple-500/30 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-serif italic text-white flex items-center gap-2">
                <MoveRight className="w-5 h-5 text-purple-400" />
                Move '{moveItemModal.name}'
              </h3>
              <button onClick={() => setMoveItemModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleMoveItemSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Select Target Directory</label>
                <select
                  value={targetMoveParentId}
                  onChange={(e) => setTargetMoveParentId(e.target.value)}
                  className="w-full px-3.5 py-2.5 glass-input rounded-xl text-xs font-mono text-white focus:outline-none"
                >
                  <option value="root" className="bg-slate-900 text-white">/ Vault Root</option>
                  {vaultFolders.map((f) => (
                    <option key={f.id} value={f.id} className="bg-slate-900 text-white">
                      / {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMoveItemModal(null)}
                  className="px-4 py-2 rounded-xl text-xs font-mono text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold uppercase bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white cursor-pointer shadow-[0_0_12px_rgba(168,85,247,0.3)]"
                >
                  Move Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View File Content Modal */}
      {selectedFile && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel border border-purple-500/30 rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl animate-scale-in max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                {getFileIcon(selectedFile.name)}
                <h3 className="text-sm font-mono font-bold text-white">{selectedFile.name}</h3>
                {selectedFile.createdByAgent && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-purple-500/15 text-purple-300 border border-purple-500/30 font-semibold">
                    {selectedFile.createdByAgent}
                  </span>
                )}
              </div>
              <button onClick={() => setSelectedFile(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto glass-card p-4 rounded-2xl border border-white/10 text-xs font-mono text-slate-300 leading-relaxed whitespace-pre-wrap select-text">
              {selectedFile.content}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setSelectedFile(null)}
                className="px-4 py-2 rounded-xl text-xs font-mono bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
