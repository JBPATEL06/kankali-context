import React, { useState, useEffect } from 'react';
import { UserSession } from '../types';
import { Github, Folder, RefreshCw, MoreVertical } from 'lucide-react';
import { saveGithubDataToFirestore, getUserConfigFromFirestore } from '../lib/firebaseStore';
import { googleSignIn } from '../lib/firebaseAuth';

interface IntegrationsTabProps {
  memories: any[];
  userSession: UserSession | null;
  onGoogleConnected?: (sessionPatch: Partial<UserSession>) => void;
}

export const IntegrationsTab: React.FC<IntegrationsTabProps> = ({ memories, userSession, onGoogleConnected }) => {
  const [ghRepo, setGhRepo] = useState('');
  const [ghBranch, setGhBranch] = useState('main');
  const [ghPath, setGhPath] = useState('');
  const [ghToken, setGhToken] = useState('');
  const [isSavingAndSyncing, setIsSavingAndSyncing] = useState(false);
  const [isGhConnected, setIsGhConnected] = useState(false);
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);

  useEffect(() => {
    const loadConfig = async () => {
      if (userSession?.uid) {
        try {
          const cfg = await getUserConfigFromFirestore(userSession.uid);
          if (cfg) {
            if (cfg.githubRepo) setGhRepo(cfg.githubRepo);
            if (cfg.githubBranch) setGhBranch(cfg.githubBranch);
            if (cfg.githubToken) {
              setGhToken(cfg.githubToken);
              setIsGhConnected(true);
            }
            const hasDrive =
              !!(cfg.googleAccessToken || cfg.googleRefreshToken) &&
              (!cfg.googleTokenExpiresAt || new Date(cfg.googleTokenExpiresAt).getTime() > Date.now());
            // Also treat a non-JWT Google access token on the session as connected
            const sessionTokenLooksGoogle =
              !!userSession.accessToken && userSession.accessToken.split('.').length !== 3;
            setIsDriveConnected(hasDrive || sessionTokenLooksGoogle);
          } else {
            const sessionTokenLooksGoogle =
              !!userSession.accessToken && userSession.accessToken.split('.').length !== 3;
            setIsDriveConnected(sessionTokenLooksGoogle);
          }
        } catch (e) {
          console.error(e);
        }
      }
    };
    loadConfig();
  }, [userSession]);

  const handleSaveAndSync = async () => {
    setIsSavingAndSyncing(true);
    try {
      if (userSession?.uid) {
        await saveGithubDataToFirestore(userSession.uid, {
          repo: ghRepo,
          branch: ghBranch,
          token: ghToken,
        });
        setIsGhConnected(true);
      }
      
      const payload = {
        token: ghToken.trim(),
        linkedRepo: ghRepo ? {
          owner: ghRepo.split('/')[0],
          name: ghRepo.split('/')[1] || ghRepo,
          defaultBranch: ghBranch || 'main'
        } : null,
      };

      const userEmail = userSession?.email || userSession?.uid || 'local-user';
      await fetch(`/api/github/link?user=${encodeURIComponent(userEmail)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingAndSyncing(false);
    }
  };

  const handleConnectDrive = async () => {
    setIsConnectingDrive(true);
    try {
      const res = await googleSignIn();
      if (res) {
        setIsDriveConnected(true);
        onGoogleConnected?.({
          uid: res.user.uid,
          displayName: res.user.displayName,
          email: res.user.email,
          photoURL: res.user.photoURL,
          accessToken: res.accessToken,
        });
      }
    } catch (err) {
      console.error('Drive connect failed:', err);
    } finally {
      setIsConnectingDrive(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto pb-12">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 mb-1">Context Sources</h1>
        <p className="text-sm text-slate-600">Connect external data repositories to provide context for your AI sessions.</p>
      </div>

      <div className="space-y-6">
        {/* GitHub Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-sm relative">
          <div className="p-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-900 text-white shrink-0">
                  <Github className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">GitHub</h2>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className={`w-2 h-2 rounded-full ${isGhConnected ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                    <span className={`text-xs font-medium ${isGhConnected ? 'text-emerald-600' : 'text-slate-500'}`}>
                      {isGhConnected ? 'Account Connected' : 'Not Connected'}
                    </span>
                  </div>
                </div>
              </div>
              <button className="text-slate-400 hover:text-slate-600">
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Select Repository</label>
                <input
                  type="text"
                  placeholder="owner/repo"
                  value={ghRepo}
                  onChange={(e) => setGhRepo(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Branch</label>
                <input
                  type="text"
                  placeholder="main"
                  value={ghBranch}
                  onChange={(e) => setGhBranch(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="space-y-1.5 mb-2">
              <label className="text-xs font-medium text-slate-600">Context Path</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Folder className="w-4 h-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  placeholder=""
                  value={ghPath}
                  onChange={(e) => setGhPath(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <p className="text-xs text-slate-500 pt-1">
                Specify a folder path or leave as root ('/') to include the entire repository.
              </p>
            </div>

            {!isGhConnected && (
              <div className="space-y-1.5 mt-4 mb-2">
                <label className="text-xs font-medium text-slate-600">GitHub Personal Access Token (for initial connection)</label>
                <input
                  type="password"
                  placeholder="ghp_..."
                  value={ghToken}
                  onChange={(e) => setGhToken(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}

            <div className="flex justify-end mt-6">
              <button
                onClick={handleSaveAndSync}
                disabled={isSavingAndSyncing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium bg-[#003B95] hover:bg-blue-800 text-white shadow-sm transition-colors cursor-pointer disabled:opacity-70"
              >
                <RefreshCw className={`w-4 h-4 ${isSavingAndSyncing ? 'animate-spin' : ''}`} />
                <span>{isSavingAndSyncing ? 'Syncing...' : 'Sync Context'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Google Drive Card */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex space-x-1 shrink-0">
                <svg className="w-6 h-6" viewBox="0 0 87.3 126" xmlns="http://www.w3.org/2000/svg">
                  <path d="M58.3 126 29.1 75.7 87.3 75.7z" fill="#0066da"/>
                  <path d="M29.1 75.7 0 126 29.2 25.1z" fill="#00ac47"/>
                  <path d="M87.3 75.7 58.2 25.1 0 25.1z" fill="#ea4335"/>
                  <path d="M29.1 75.7 58.2 25.1 87.3 75.7z" fill="#ffba00"/>
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Google Drive</h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className={`w-2 h-2 rounded-full ${isDriveConnected ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                  <span className={`text-xs font-medium ${isDriveConnected ? 'text-emerald-600' : 'text-slate-500'}`}>
                    {isDriveConnected ? 'Connected' : 'Not Connected'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-slate-700 leading-relaxed max-w-xl">
                Connect Google Drive to securely search and summarize documents, spreadsheets, and presentations directly within your sessions.
                Uses appDataFolder for private MCP context storage.
              </p>
              <div className="flex items-center gap-4 shrink-0 w-full sm:w-auto">
                <a href="#" className="text-sm font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap">Learn More</a>
                <button
                  type="button"
                  onClick={handleConnectDrive}
                  disabled={isConnectingDrive}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-full text-sm font-medium bg-slate-200 hover:bg-slate-300 text-slate-800 transition-colors disabled:opacity-70 cursor-pointer"
                >
                  {isConnectingDrive ? 'Connecting...' : isDriveConnected ? 'Re-connect' : 'Connect'}
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
