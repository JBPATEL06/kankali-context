import React from 'react';
import { Share2, Database, Github, FileText, FileJson, Plus, Bot, Zap, History } from 'lucide-react';
import { UserSession } from '../types';

interface DashboardOverviewProps {
  memories: any[];
  driveFiles: any[];
  userSession: UserSession | null;
  syncState: string;
  lastSyncedAt: Date | null;
  driveFolderUrl: string | null;
  onSync: () => void;
  onSelectTab: (tab: string) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  onSelectTab,
}) => {
  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col xl:flex-row gap-8 pb-12">
      
      {/* Main Content Area */}
      <div className="flex-1 min-w-0">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-slate-900 mb-1">Overview</h1>
          <p className="text-sm text-slate-600">Manage your AI context integrations.</p>
        </div>

        {/* Active MCP Links */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Share2 className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-medium text-slate-900">Active MCP Links</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Claude Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col shadow-sm">
              <div className="flex items-start justify-between mb-4">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 border border-emerald-200">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span className="text-xs font-semibold text-emerald-700">Connected</span>
                </div>
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-1">Claude 3.5 Sonnet</h3>
              <p className="text-sm text-slate-600 mb-6 flex-1">
                Primary reasoning engine. Full access to codebase context.
              </p>
              <div className="flex justify-end">
                <button 
                  onClick={() => onSelectTab('mcp')}
                  className="px-4 py-2 rounded-full border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors"
                >
                  Configure
                </button>
              </div>
            </div>

            {/* Grok Card */}
            <div className="bg-white border border-slate-200 border-dashed rounded-xl p-5 flex flex-col shadow-sm">
              <div className="flex items-start justify-between mb-4">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                  <Zap className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200">
                  <span className="text-xs font-semibold text-slate-600">Available</span>
                </div>
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-1">Grok 2.0</h3>
              <p className="text-sm text-slate-600 mb-6 flex-1">
                Fast analysis and live data synthesis.
              </p>
              <div className="flex justify-end">
                <button 
                  onClick={() => onSelectTab('mcp')}
                  className="px-4 py-2 rounded-full bg-[#003B95] text-white text-sm font-medium hover:bg-blue-800 transition-colors"
                >
                  Initialize Link
                </button>
              </div>
            </div>

          </div>
        </section>

        {/* Context Sources */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-medium text-slate-900">Context Sources</h2>
            </div>
            <button 
              onClick={() => onSelectTab('integrations')}
              className="text-sm font-medium text-blue-700 hover:text-blue-800"
            >
              View All
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center text-center shadow-sm">
              <div className="w-10 h-10 mb-2 rounded-full bg-white border border-slate-200 flex items-center justify-center">
                <Github className="w-5 h-5 text-slate-700" />
              </div>
              <span className="text-sm font-medium text-slate-900 mb-1">GitHub Repo</span>
              <span className="text-[11px] text-emerald-600 font-medium">Synced just now</span>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center text-center shadow-sm">
              <div className="w-10 h-10 mb-2 rounded-full bg-white border border-slate-200 flex items-center justify-center">
                <FileText className="w-5 h-5 text-slate-700" />
              </div>
              <span className="text-sm font-medium text-slate-900 mb-1">Local Docs</span>
              <span className="text-[11px] text-slate-500 font-medium">Synced 2h ago</span>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center text-center shadow-sm">
              <div className="w-10 h-10 mb-2 rounded-full bg-white border border-slate-200 flex items-center justify-center">
                <FileJson className="w-5 h-5 text-slate-700" />
              </div>
              <span className="text-sm font-medium text-slate-900 mb-1">Notion Wiki</span>
              <span className="text-[11px] text-slate-500 font-medium">Synced 1d ago</span>
            </div>

            <button 
              onClick={() => onSelectTab('integrations')}
              className="bg-white border border-slate-200 border-dashed rounded-xl p-4 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
            >
              <div className="w-10 h-10 mb-2 rounded-full flex items-center justify-center">
                <Plus className="w-6 h-6 text-slate-400" />
              </div>
              <span className="text-sm font-medium text-slate-600">Add Source</span>
            </button>

          </div>
        </section>
      </div>

      {/* Right Sidebar - Recent Activity */}
      <div className="xl:w-80 shrink-0">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm h-full">
          <div className="flex items-center gap-2 mb-6">
            <History className="w-4 h-4 text-slate-900" />
            <h2 className="text-base font-semibold text-slate-900">Recent Activity</h2>
          </div>

          <div className="relative border-l border-slate-200 ml-2 space-y-6">
            
            {/* Activity 1 */}
            <div className="relative pl-5">
              <div className="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full bg-blue-600 ring-4 ring-white"></div>
              <div className="flex justify-between items-start mb-1">
                <span className="text-sm font-medium text-blue-700">Claude 3.5</span>
                <span className="text-[11px] text-slate-500">10m ago</span>
              </div>
              <p className="text-sm text-slate-800 mb-1">Updated <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-xs">architecture.md</code></p>
              <p className="text-xs text-slate-600 leading-relaxed">
                Revised service integration flow based on recent GitHub commits.
              </p>
            </div>

            {/* Activity 2 */}
            <div className="relative pl-5">
              <div className="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full bg-slate-300 ring-4 ring-white"></div>
              <div className="flex justify-between items-start mb-1">
                <span className="text-sm font-medium text-slate-700">Grok 2.0</span>
                <span className="text-[11px] text-slate-500">1h ago</span>
              </div>
              <p className="text-sm text-slate-800 mb-1">Scanned <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-xs">package.json</code></p>
              <p className="text-xs text-slate-600 leading-relaxed">
                Identified 3 outdated dependencies in frontend module.
              </p>
            </div>

            {/* Activity 3 */}
            <div className="relative pl-5">
              <div className="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full bg-slate-300 ring-4 ring-white"></div>
              <div className="flex justify-between items-start mb-1">
                <span className="text-sm font-medium text-slate-700">System</span>
                <span className="text-[11px] text-slate-500">3h ago</span>
              </div>
              <p className="text-sm text-slate-800 mb-1">Sync Complete</p>
              <p className="text-xs text-slate-600 leading-relaxed">
                Notion Wiki integration refreshed.
              </p>
            </div>

          </div>
        </div>
      </div>
      
    </div>
  );
};
