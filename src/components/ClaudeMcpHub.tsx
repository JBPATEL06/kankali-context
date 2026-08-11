import React, { useState } from 'react';
import { UserSession } from '../types';
import { RefreshCw, Play, AlertCircle, Share2, Zap, Plus, Github, Cloud, FolderPlus, UserPlus, Save } from 'lucide-react';

interface ClaudeMcpHubProps {
  memories: any[];
  userSession: UserSession | null;
  onSaveFileToDrive: (fileName: string, content: string) => Promise<void>;
  onSaveNewMemory: (memory: any) => void;
}

export const ClaudeMcpHub: React.FC<ClaudeMcpHubProps> = () => {
  const [claudeUrl, setClaudeUrl] = useState('ws://localhost:8080/mcp/claude');
  const [grokUrl, setGrokUrl] = useState('ws://192.168.1.105:9090/mcp/grok');
  
  const [showGenerateMcp, setShowGenerateMcp] = useState(false);
  const [storageType, setStorageType] = useState<'github' | 'drive' | null>(null);
  const [githubOption, setGithubOption] = useState<'new_repo' | 'existing_repo_new_folder' | null>(null);
  const [driveOption, setDriveOption] = useState<'new_folder' | 'new_account' | null>(null);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  const [customMcps, setCustomMcps] = useState<any[]>([]);

  const resetGenerateState = () => {
    setShowGenerateMcp(false);
    setStorageType(null);
    setGithubOption(null);
    setDriveOption(null);
  };

  const handleGenerateMcp = () => {
    setShowSuccessMessage(true);
    setTimeout(() => {
      setShowSuccessMessage(false);
      
      const newMcp = {
        id: Date.now(),
        name: `Custom MCP (${storageType === 'github' ? 'GitHub' : 'Drive'})`,
        version: 'v1.0.0',
        url: `wss://${window.location.host}/mcp/custom-${Date.now()}`,
        status: 'online',
        permissions: ['Read Context', 'Write Context'],
        syncs: [
          { name: 'Initial Config', time: 'Just now' }
        ]
      };
      
      setCustomMcps(prev => [newMcp, ...prev]);
      resetGenerateState();
    }, 1500);
  };

  return (
    <div className="w-full max-w-5xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-[28px] font-bold text-slate-900 mb-2">Model Context Protocol Integrations</h1>
          <p className="text-base text-slate-600">Manage and monitor your active MCP server connections.</p>
        </div>
        {!showGenerateMcp && (
          <button 
            onClick={() => setShowGenerateMcp(true)}
            className="px-4 py-2 bg-[#003B95] text-white text-sm font-medium rounded-full hover:bg-blue-800 transition-colors flex items-center gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Generate New MCP
          </button>
        )}
      </div>

      {showGenerateMcp && (
        <div className="bg-white border border-blue-200 shadow-sm rounded-xl p-6 mb-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Generate New MCP Server</h2>
          
          <div className="space-y-6">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-3">1. Select Storage Type</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button 
                  onClick={() => { setStorageType('github'); setDriveOption(null); }}
                  className={`p-4 rounded-xl border-2 flex items-center gap-3 transition-colors ${storageType === 'github' ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-blue-300 bg-white'}`}
                >
                  <Github className={`w-6 h-6 ${storageType === 'github' ? 'text-blue-600' : 'text-slate-500'}`} />
                  <div className="text-left">
                    <div className={`font-semibold ${storageType === 'github' ? 'text-blue-900' : 'text-slate-900'}`}>GitHub</div>
                    <div className="text-xs text-slate-500">Sync with repository</div>
                  </div>
                </button>
                <button 
                  onClick={() => { setStorageType('drive'); setGithubOption(null); }}
                  className={`p-4 rounded-xl border-2 flex items-center gap-3 transition-colors ${storageType === 'drive' ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-blue-300 bg-white'}`}
                >
                  <Cloud className={`w-6 h-6 ${storageType === 'drive' ? 'text-blue-600' : 'text-slate-500'}`} />
                  <div className="text-left">
                    <div className={`font-semibold ${storageType === 'drive' ? 'text-blue-900' : 'text-slate-900'}`}>Google Drive</div>
                    <div className="text-xs text-slate-500">Sync with Drive folder</div>
                  </div>
                </button>
              </div>
            </div>

            {storageType === 'github' && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="text-sm font-medium text-slate-700 block mb-3">2. GitHub Configuration</label>
                <div className="space-y-3">
                  <label className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                    <input 
                      type="radio" 
                      name="github_opt" 
                      className="mt-1 text-blue-600 focus:ring-blue-500"
                      checked={githubOption === 'new_repo'}
                      onChange={() => setGithubOption('new_repo')}
                    />
                    <div>
                      <div className="text-sm font-medium text-slate-900">Use existing token with new repo</div>
                      <div className="text-xs text-slate-500">Creates a fresh repository for this MCP</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                    <input 
                      type="radio" 
                      name="github_opt" 
                      className="mt-1 text-blue-600 focus:ring-blue-500"
                      checked={githubOption === 'existing_repo_new_folder'}
                      onChange={() => setGithubOption('existing_repo_new_folder')}
                    />
                    <div>
                      <div className="text-sm font-medium text-slate-900">Use existing token with existing repo (new folder)</div>
                      <div className="text-xs text-slate-500">Adds an isolated folder to an existing repository</div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {storageType === 'drive' && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="text-sm font-medium text-slate-700 block mb-3">2. Google Drive Configuration</label>
                <div className="space-y-3">
                  <label className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                    <input 
                      type="radio" 
                      name="drive_opt" 
                      className="mt-1 text-blue-600 focus:ring-blue-500"
                      checked={driveOption === 'new_folder'}
                      onChange={() => setDriveOption('new_folder')}
                    />
                    <div>
                      <div className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                        <FolderPlus className="w-4 h-4 text-slate-500" />
                        New Folder
                      </div>
                      <div className="text-xs text-slate-500">Creates a new dedicated folder in your current Drive account</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                    <input 
                      type="radio" 
                      name="drive_opt" 
                      className="mt-1 text-blue-600 focus:ring-blue-500"
                      checked={driveOption === 'new_account'}
                      onChange={() => setDriveOption('new_account')}
                    />
                    <div>
                      <div className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                        <UserPlus className="w-4 h-4 text-slate-500" />
                        New Account
                      </div>
                      <div className="text-xs text-slate-500">Sign in with a different Google account</div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
              <button 
                onClick={resetGenerateState}
                className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button 
                disabled={!storageType || (storageType === 'github' && !githubOption) || (storageType === 'drive' && !driveOption)}
                onClick={handleGenerateMcp}
                className="px-6 py-2 rounded-lg bg-[#003B95] text-white text-sm font-medium hover:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {showSuccessMessage ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Generate MCP
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {customMcps.map((mcp) => (
          <div key={mcp.id} className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden flex flex-col shadow-sm">
            <div className="p-6 flex-1 flex flex-col">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    <Share2 className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-medium text-slate-900">{mcp.name}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">{mcp.version}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 border border-emerald-200">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span className="text-[11px] font-bold text-emerald-700 tracking-wide uppercase">Online</span>
                </div>
              </div>

              <div className="space-y-1.5 mb-5">
                <label className="text-xs font-medium text-slate-600">Server URL</label>
                <input
                  type="text"
                  value={mcp.url}
                  readOnly
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700"
                />
              </div>

              <div className="mb-6">
                <label className="text-xs font-medium text-slate-600 block mb-2">Permissions</label>
                <div className="flex flex-wrap gap-2">
                  {mcp.permissions.map((perm: string) => (
                    <span key={perm} className="px-3 py-1 rounded-full bg-blue-300 text-blue-900 text-xs font-medium">{perm}</span>
                  ))}
                </div>
              </div>

              <div className="mb-6 flex-1">
                <label className="text-xs font-medium text-slate-600 block mb-2">Recent Syncs</label>
                <div className="space-y-3">
                  {mcp.syncs.map((sync: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">{sync.name}</span>
                      <span className="text-sm text-slate-500">{sync.time}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 mt-auto pt-4">
                <button className="flex-1 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm font-medium transition-colors">
                  Configuration
                </button>
                <button className="flex-1 py-2 rounded-lg bg-[#003B95] hover:bg-blue-800 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                  <RefreshCw className="w-4 h-4" />
                  <span>Restart Server</span>
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* Claude MCP Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden flex flex-col shadow-sm">
          <div className="p-6 flex-1 flex flex-col">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  <Share2 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-medium text-slate-900">Claude MCP</h2>
                  <p className="text-xs text-slate-500 mt-0.5">v2.1.0</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 border border-emerald-200">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="text-[11px] font-bold text-emerald-700 tracking-wide uppercase">Online</span>
              </div>
            </div>

            <div className="space-y-1.5 mb-5">
              <label className="text-xs font-medium text-slate-600">Server URL</label>
              <input
                type="text"
                value={claudeUrl}
                onChange={(e) => setClaudeUrl(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700"
              />
            </div>

            <div className="mb-6">
              <label className="text-xs font-medium text-slate-600 block mb-2">Permissions</label>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 rounded-full bg-blue-300 text-blue-900 text-xs font-medium">Read Context</span>
                <span className="px-3 py-1 rounded-full bg-blue-300 text-blue-900 text-xs font-medium">Write Context</span>
                <span className="px-3 py-1 rounded-full bg-slate-200 text-slate-700 text-xs font-medium">Execute Tools</span>
              </div>
            </div>

            <div className="mb-6 flex-1">
              <label className="text-xs font-medium text-slate-600 block mb-2">Recent Syncs</label>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">Financial Data Model</span>
                  <span className="text-sm text-slate-500">2 mins ago</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">User Profiles DB</span>
                  <span className="text-sm text-slate-500">15 mins ago</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-auto pt-4">
              <button className="flex-1 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm font-medium transition-colors">
                Configuration
              </button>
              <button className="flex-1 py-2 rounded-lg bg-[#003B95] hover:bg-blue-800 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                <RefreshCw className="w-4 h-4" />
                <span>Restart Server</span>
              </button>
            </div>
          </div>
        </div>

        {/* Grok MCP Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden flex flex-col shadow-sm">
          <div className="p-6 flex-1 flex flex-col">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  <Zap className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h2 className="text-xl font-medium text-slate-900">Grok MCP</h2>
                  <p className="text-xs text-slate-500 mt-0.5">v1.0.5</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 border border-red-200">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <span className="text-[11px] font-bold text-red-700 tracking-wide uppercase">Offline</span>
              </div>
            </div>

            <div className="space-y-1.5 mb-5">
              <label className="text-xs font-medium text-slate-600">Server URL</label>
              <input
                type="text"
                value={grokUrl}
                onChange={(e) => setGrokUrl(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700"
              />
            </div>

            <div className="mb-6">
              <label className="text-xs font-medium text-slate-600 block mb-2">Permissions</label>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 rounded-full bg-blue-300 text-blue-900 text-xs font-medium">Read Context</span>
                <span className="px-3 py-1 rounded-full bg-slate-200 text-slate-700 text-xs font-medium">Search Web</span>
              </div>
            </div>

            <div className="mb-6 flex-1">
              <label className="text-xs font-medium text-slate-600 block mb-2">Recent Syncs</label>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Real-time News Feed</span>
                  <span className="text-sm text-slate-400">2 days ago</span>
                </div>
              </div>
              
              <div className="mt-4 p-3 rounded-lg bg-red-100 border border-red-200 flex items-start gap-2 text-red-700 text-sm">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p>Connection lost. Failed to ping server after 3 attempts.</p>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-auto pt-4">
              <button className="flex-1 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm font-medium transition-colors">
                Configuration
              </button>
              <button className="flex-1 py-2 rounded-lg bg-[#003B95] hover:bg-blue-800 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                <Play className="w-4 h-4 fill-current" />
                <span>Start Server</span>
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
