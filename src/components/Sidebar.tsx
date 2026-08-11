import React from 'react';
import { 
  LayoutDashboard, 
  Share2, 
  Database, 
  History, 
  Settings,
  PanelLeftClose,
  PanelLeft,
  X
} from 'lucide-react';
import { UserSession } from '../types';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  userSession: UserSession | null;
  onLogin: () => void;
  onLogout: () => void;
  syncState: 'idle' | 'syncing' | 'error';
  onSync: () => void;
  lastSyncedAt: Date | null;
  driveFolderUrl: string | null;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  isCollapsed: boolean;
  setIsCollapsed: (val: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (val: boolean) => void;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'mcp', label: 'MCP Hub', icon: Share2 },
  { id: 'context', label: 'Context Sources', icon: Database },
  { id: 'sessions', label: 'Sessions', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  userSession,
  isCollapsed,
  setIsCollapsed,
  isMobileOpen,
  setIsMobileOpen,
}) => {
  const sidebarContent = (
    <div className="flex flex-col h-full w-full p-4 bg-slate-50 border-r border-slate-200">
      {/* Header / Logo Area */}
      <div className="flex items-start justify-between mb-8 px-2">
        {!isCollapsed && (
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-none mb-1">
              Nexia<br/>AI
            </h1>
            <p className="text-xs text-slate-500 font-medium">Professional<br/>Workspace</p>
          </div>
        )}
        
        {/* Desktop Collapse Button */}
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden md:flex p-1.5 rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
        >
          {isCollapsed ? <PanelLeft className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
        </button>

        {/* Mobile Close Button */}
        <button
          type="button"
          onClick={() => setIsMobileOpen(false)}
          className="md:hidden p-1.5 rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation List */}
      <nav className="space-y-2 flex-1 mt-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          // In Image 3, Context Sources is active and has a blue icon container and blue text
          const isActive = activeTab === item.id || (activeTab === 'integrations' && item.id === 'context');
          
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id === 'context' ? 'integrations' : item.id);
                setIsMobileOpen(false);
              }}
              className="w-full flex items-center gap-3 px-2 py-2 text-sm font-medium transition-colors group cursor-pointer"
            >
              <div className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 transition-colors ${
                isActive 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'bg-transparent text-slate-500 group-hover:bg-slate-200'
              }`}>
                <Icon className="w-4 h-4" />
              </div>
              {!isCollapsed && (
                <span className={`truncate ${
                  isActive ? 'text-blue-600 font-semibold' : 'text-slate-700 group-hover:text-slate-900'
                }`}>
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );

  return (
    <>
      <aside
        className={`hidden md:flex flex-col fixed top-0 left-0 bottom-0 z-40 bg-slate-50 transition-all duration-300 ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Backdrop & Sidebar */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div 
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" 
            onClick={() => setIsMobileOpen(false)} 
          />
          <aside className="relative z-10 w-64 max-w-[80vw] bg-slate-50 h-full flex flex-col">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
};
