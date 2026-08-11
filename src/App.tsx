import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { ShieldAlert, RefreshCw, X } from 'lucide-react';
import { 
  initAuth, 
  logout,
  googleSignIn,
  emailSignIn,
  emailSignUp,
  deleteAccount
} from './lib/firebaseAuth';
import { saveUserConfigToFirestore, getUserConfigFromFirestore } from './lib/firebaseStore';
import { UserSession, ContextMemory, DriveFileItem, SyncState } from './types';
import { INITIAL_CONTEXT_MEMORIES } from './lib/initialData';
import { 
  syncContextMemoriesToDrive, 
  listDriveFiles, 
  getOrCreateContextHubFolder,
  uploadDriveFile,
  deleteDriveFile,
  downloadDriveFile,
  GoogleTokenExpiredError,
  validateGoogleDriveToken
} from './lib/googleDriveApi';

import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { DashboardOverview } from './components/DashboardOverview';
import { ClaudeMcpHub } from './components/ClaudeMcpHub';
import { DriveExplorer } from './components/DriveExplorer';
import { IntegrationsTab } from './components/IntegrationsTab';
import { LoginGate } from './components/LoginGate';

export default function App() {
  const [userSession, setUserSession] = useState<UserSession | null>(() => {
    try {
      const saved = localStorage.getItem('nexus_user_session');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const updateSession = (session: UserSession | null) => {
    setUserSession(session);
    if (session) {
      localStorage.setItem('nexus_user_session', JSON.stringify(session));
      if (session.uid) {
        saveUserConfigToFirestore(session.uid, {
          email: session.email || '',
          displayName: session.displayName || '',
          googleAccessToken: session.accessToken,
        }).catch(e => console.warn('Failed to save session to Firestore:', e));
      }
    } else {
      localStorage.removeItem('nexus_user_session');
    }
  };

  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false);
  
  // Context Memories State
  const [memories, setMemories] = useState<ContextMemory[]>(() => {
    try {
      const saved = localStorage.getItem('kankali_context_memories');
      return saved ? JSON.parse(saved) : INITIAL_CONTEXT_MEMORIES;
    } catch (e) {
      return INITIAL_CONTEXT_MEMORIES;
    }
  });

  // Google Drive Files State
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => {
    return localStorage.getItem('kankali_last_synced_at');
  });
  const [driveFolderUrl, setDriveFolderUrl] = useState<string | null>(() => {
    return localStorage.getItem('kankali_drive_folder_url');
  });
  const [isDriveLoading, setIsDriveLoading] = useState<boolean>(false);

  // Drive Token Expiration & Save Validation Errors
  const [tokenExpiredWarning, setTokenExpiredWarning] = useState<boolean>(false);
  const [driveSaveError, setDriveSaveError] = useState<string | null>(null);

  // Dark mode
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('theme') !== 'light';
  });

  useEffect(() => {
    localStorage.setItem('kankali_context_memories', JSON.stringify(memories));
  }, [memories]);

  // Apply dark/light theme class to document element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Handle Token Error & Expiration Helper
  const handleDriveError = (err: any, customPrefix = 'Drive Operation Failed') => {
    console.error(customPrefix, err);
    if (err instanceof GoogleTokenExpiredError || err.isTokenExpired || err.message?.toLowerCase().includes('expired') || err.message?.includes('401')) {
      setTokenExpiredWarning(true);
      setDriveSaveError('Your Google OAuth token has expired. Your changes were NOT saved to Google Drive. Click "Re-Authenticate with Google" to save.');
      setSyncState('error');
    } else {
      setDriveSaveError(`${customPrefix}: ${err.message || 'Unknown error. Content save not verified.'}`);
      setSyncState('error');
    }
  };

  // Load files from Google Drive
  const refreshDrive = async (isManual = false) => {
    if (!userSession?.accessToken) return;
    
    // If the token is a JWT (contains dots), it's a Firebase ID token from Email login, not a Google Drive OAuth token.
    if (userSession.accessToken.split('.').length === 3) {
      setDriveSaveError('You are signed in with Email. Google Drive features require signing in with Google.');
      setIsDriveLoading(false);
      return;
    }

    setIsDriveLoading(true);
    try {
      const tokenCheck = await validateGoogleDriveToken(userSession.accessToken);
      if (!tokenCheck.valid) {
        setTokenExpiredWarning(true);
        setDriveSaveError('Google Auth Token expired. Please re-authenticate to sync and access Drive.');
        return;
      }
      setTokenExpiredWarning(false);
      setDriveSaveError(null);

      const folderId = await getOrCreateContextHubFolder(userSession.accessToken);
      const files = await listDriveFiles(userSession.accessToken, folderId);
      setDriveFiles(files);
      const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
      setDriveFolderUrl(folderUrl);
      localStorage.setItem('kankali_drive_folder_url', folderUrl);
    } catch (err: any) {
      if (isManual) {
        handleDriveError(err, 'Failed to load Drive files');
      } else {
        console.warn('Background Drive refresh skipped/failed:', err);
      }
    } finally {
      setIsDriveLoading(false);
    }
  };

  useEffect(() => {
    if (userSession?.accessToken) {
      refreshDrive();
    }
  }, [userSession?.accessToken]);

  // Handle Google Drive Sync with Validation
  const handleDriveSync = async () => {
    if (!userSession?.accessToken) {
      setDriveSaveError('Please sign in with Google to sync files to Google Drive.');
      return;
    }

    if (userSession.accessToken.split('.').length === 3) {
      setDriveSaveError('You are signed in with Email. Syncing to Google Drive requires signing in with Google.');
      return;
    }
    setSyncState('syncing');
    setDriveSaveError(null);

    try {
      const res = await syncContextMemoriesToDrive(userSession.accessToken, memories);
      setMemories(res.updatedMemories);
      setDriveFolderUrl(res.driveFolderUrl);
      localStorage.setItem('kankali_drive_folder_url', res.driveFolderUrl);
      const now = new Date().toISOString();
      setLastSyncedAt(now);
      localStorage.setItem('kankali_last_synced_at', now);
      setSyncState('success');
      setTokenExpiredWarning(false);
      await refreshDrive(true);
    } catch (err) {
      handleDriveError(err, 'Drive Sync Failed');
    } finally {
      setTimeout(() => setSyncState('idle'), 4000);
    }
  };

  // Upload file to Drive with Validation
  const handleUploadFile = async (fileName: string, mimeType: string, content: string) => {
    if (!userSession?.accessToken) {
      setDriveSaveError('Please sign in with Google to upload files.');
      return;
    }

    if (userSession.accessToken.split('.').length === 3) {
      setDriveSaveError('You are signed in with Email. Uploading to Google Drive requires signing in with Google.');
      return;
    }
    setIsDriveLoading(true);
    setDriveSaveError(null);
    try {
      const folderId = await getOrCreateContextHubFolder(userSession.accessToken);
      await uploadDriveFile(userSession.accessToken, folderId, fileName, mimeType, content);
      setTokenExpiredWarning(false);
      await refreshDrive(true);
    } catch (err) {
      handleDriveError(err, `Failed to upload '${fileName}' to Google Drive`);
      throw err;
    } finally {
      setIsDriveLoading(false);
    }
  };

  // Delete file from Drive
  const handleDeleteFile = async (fileId: string) => {
    if (!userSession?.accessToken) return;
    setIsDriveLoading(true);
    try {
      await deleteDriveFile(userSession.accessToken, fileId);
      await refreshDrive(true);
    } catch (err) {
      handleDriveError(err, 'Failed to delete file from Google Drive');
    } finally {
      setIsDriveLoading(false);
    }
  };

  // Download file from Drive
  const handleDownloadFile = async (fileId: string): Promise<string> => {
    if (!userSession?.accessToken) throw new Error('Not authenticated with Google');
    try {
      return await downloadDriveFile(userSession.accessToken, fileId);
    } catch (err) {
      handleDriveError(err, 'Failed to download file from Google Drive');
      throw err;
    }
  };

  // Initialize Firebase Auth Listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (user: User, token: string) => {
        updateSession({
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
          accessToken: token,
        });
      },
      () => {
        // Do not immediately wipe stored session on transient auth change if we have stored session
      }
    );
    return () => unsubscribe();
  }, []);

  // Logout Handler
  const handleLogout = async () => {
    await logout();
    updateSession(null);
  };

  const handleDeleteAccount = async () => {
    try {
      await deleteAccount();
      updateSession(null);
    } catch (e: any) {
      if (e.code === 'auth/requires-recent-login') {
        alert('Please log in again to delete your account.');
        handleLogout();
      } else {
        alert('Failed to delete account: ' + e.message);
      }
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const res = await googleSignIn();
      if (res) {
        updateSession({
          uid: res.user.uid,
          displayName: res.user.displayName,
          email: res.user.email,
          photoURL: res.user.photoURL,
          accessToken: res.accessToken
        });
      }
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const handleEmailLogin = async (email: string, pass: string) => {
    const res = await emailSignIn(email, pass);
    updateSession({
      uid: res.user.uid,
      displayName: res.user.displayName,
      email: res.user.email,
      photoURL: res.user.photoURL,
      accessToken: res.accessToken
    });
  };

  const handleEmailSignUp = async (email: string, pass: string, name: string) => {
    const res = await emailSignUp(email, pass, name);
    updateSession({
      uid: res.user.uid,
      displayName: res.user.displayName,
      email: res.user.email,
      photoURL: res.user.photoURL,
      accessToken: res.accessToken
    });
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 transition-colors flex font-sans relative">
      
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        userSession={userSession}
        onLogin={handleGoogleLogin}
        onLogout={handleLogout}
        syncState={syncState}
        onSync={handleDriveSync}
        lastSyncedAt={lastSyncedAt}
        driveFolderUrl={driveFolderUrl}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
      />

      {/* Main Wrapper with Dynamic Left Padding for Sidebar */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${isCollapsed ? 'md:pl-20' : 'md:pl-64'}`}>
        
        {/* Navigation Header */}
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          userSession={userSession}
          onLogin={handleGoogleLogin}
          onLogout={handleLogout}
          onDeleteAccount={handleDeleteAccount}
          syncState={syncState}
          onSync={handleDriveSync}
          lastSyncedAt={lastSyncedAt}
          driveFolderUrl={driveFolderUrl}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          isCollapsed={isCollapsed}
          setIsCollapsed={setIsCollapsed}
          setIsMobileOpen={setIsMobileOpen}
        />

        {/* Main Container */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Drive Auth & Validation Alert Banner */}
        {driveSaveError && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl backdrop-blur-md">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-400 mt-0.5 shrink-0 animate-pulse" />
              <div>
                <h4 className="text-sm font-bold text-amber-300 font-serif">Google Drive Save & Auth Validator Alert</h4>
                <p className="text-xs text-amber-200/90 mt-0.5 leading-relaxed">{driveSaveError}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {tokenExpiredWarning && (
                <button
                  type="button"
                  onClick={async () => {
                    await handleGoogleLogin();
                    setTokenExpiredWarning(false);
                    setDriveSaveError(null);
                    refreshDrive();
                  }}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Re-Authenticate with Google</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setDriveSaveError(null);
                  setTokenExpiredWarning(false);
                }}
                className="p-1.5 rounded-lg text-amber-400/80 hover:text-amber-200 hover:bg-amber-500/20 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {!userSession ? (
          <LoginGate 
            onLogin={handleGoogleLogin} 
            onEmailLogin={handleEmailLogin} 
            onEmailSignUp={handleEmailSignUp} 
          />
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardOverview
                memories={memories}
                driveFiles={driveFiles}
                userSession={userSession}
                syncState={syncState}
                lastSyncedAt={lastSyncedAt}
                driveFolderUrl={driveFolderUrl}
                onSync={handleDriveSync}
                onSelectTab={(tab) => setActiveTab(tab)}
              />
            )}

            {activeTab === 'mcp' && (
              <ClaudeMcpHub
                memories={memories}
                userSession={userSession}
                onSaveFileToDrive={handleUploadFile}
                onSaveNewMemory={(newMem) => setMemories(prev => [newMem, ...prev])}
              />
            )}

            {activeTab === 'drive' && (
              <DriveExplorer
                userSession={userSession}
                driveFiles={driveFiles}
                driveFolderUrl={driveFolderUrl}
                onRefreshDrive={() => refreshDrive(true)}
                onUploadFile={handleUploadFile}
                onDeleteFile={handleDeleteFile}
                onDownloadFile={handleDownloadFile}
                onLogin={handleGoogleLogin}
                isLoading={isDriveLoading}
              />
            )}

            {activeTab === 'integrations' && (
              <IntegrationsTab
                memories={memories}
                userSession={userSession}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-slate-50 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Nexia AI • Google Drive Sync & Claude MCP Server Enabled</span>
          <span>Claude 3.7 • Grok 3 • ChatGPT • Gemini 2.5</span>
        </div>
      </footer>
    </div>

    </div>
  );
}
