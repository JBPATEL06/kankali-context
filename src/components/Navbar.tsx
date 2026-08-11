import React, { useState, useRef, useEffect } from 'react';
import { Search, Bell, UserCircle, Menu, LogOut, Trash2 } from 'lucide-react';
import { UserSession } from '../types';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  userSession: UserSession | null;
  onLogin: () => void;
  onLogout: () => void;
  syncState: string;
  onSync: () => void;
  lastSyncedAt: string | null;
  driveFolderUrl: string | null;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  isCollapsed: boolean;
  setIsCollapsed: (val: boolean) => void;
  setIsMobileOpen: (val: boolean) => void;
  onDeleteAccount?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  userSession,
  setIsMobileOpen,
  onLogout,
  onDeleteAccount
}) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 w-full bg-slate-50 border-b border-slate-200">
      <div className="flex items-center justify-between h-14 px-4 sm:px-6 lg:px-8">
        
        {/* Mobile Menu Button */}
        <button
          type="button"
          onClick={() => setIsMobileOpen(true)}
          className="md:hidden p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-200"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Center: Search Bar */}
        <div className="flex-1 flex justify-center max-w-2xl mx-auto hidden sm:flex">
          <div className="w-full max-w-md relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-full leading-5 bg-slate-100 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:text-sm transition-colors"
              placeholder="Search contexts, settings..."
            />
          </div>
        </div>

        {/* Right: Icons */}
        <div className="flex items-center gap-4 ml-auto">
          <button className="text-slate-500 hover:text-slate-700 transition-colors">
            <Bell className="w-5 h-5" />
          </button>
          
          {userSession ? (
            <div className="relative" ref={profileRef}>
              <button 
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="text-slate-500 hover:text-slate-700 transition-colors rounded-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                title="Profile"
              >
                {userSession.photoURL ? (
                  <img src={userSession.photoURL} alt="Profile" className="w-8 h-8 rounded-full" />
                ) : (
                  <UserCircle className="w-8 h-8" />
                )}
              </button>

              {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50">
                  <div className="px-4 py-3 border-b border-slate-100 mb-2">
                    <p className="text-sm font-semibold text-slate-900 truncate">{userSession.displayName || 'User'}</p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{userSession.email}</p>
                  </div>
                  
                  <button
                    onClick={() => {
                      setIsProfileOpen(false);
                      onLogout();
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4 text-slate-400" />
                    Sign Out
                  </button>
                  
                  {onDeleteAccount && (
                    <button
                      onClick={() => {
                        setIsProfileOpen(false);
                        onDeleteAccount();
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 mt-1 border-t border-slate-100 pt-2"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                      Delete Account
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <button className="text-slate-500 hover:text-slate-700 transition-colors">
              <UserCircle className="w-8 h-8" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
