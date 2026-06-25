/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Sun, Moon, LogOut, LayoutDashboard, Link2, TrendingUp, ShieldCheck } from "lucide-react";

interface NavbarProps {
  activeTab: "dashboard" | "shortlink";
  setActiveTab: (tab: "dashboard" | "shortlink") => void;
  username: string;
  onLogout: () => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
}

export default function Navbar({
  activeTab,
  setActiveTab,
  username,
  onLogout,
  darkMode,
  toggleDarkMode,
}: NavbarProps) {
  return (
    <header id="app-navbar" className="sticky top-0 z-40 w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-850 shadow-sm transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          
          {/* Logo Brand */}
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-600 rounded-lg text-white">
              <TrendingUp className="h-5 w-5" />
            </div>
            <span className="font-bold text-lg text-slate-900 dark:text-white tracking-tight hidden sm:inline-block">
              Affiliate Consolidation
            </span>
            <span className="font-bold text-lg text-slate-900 dark:text-white tracking-tight sm:hidden">
              Consolidation
            </span>
          </div>

          {/* Navigation Links / Tabs */}
          <nav className="flex space-x-1" aria-label="Tabs">
            <button
              id="tab-dashboard"
              onClick={() => setActiveTab("dashboard")}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                activeTab === "dashboard"
                  ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden md:inline">Dashboard</span>
            </button>
            <button
              id="tab-shortlink"
              onClick={() => setActiveTab("shortlink")}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                activeTab === "shortlink"
                  ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Link2 className="h-4 w-4" />
              <span className="hidden md:inline">Shortlink Generator</span>
            </button>
          </nav>

          {/* Right Area Controls */}
          <div className="flex items-center gap-3">
            
            {/* User Indicator Badge */}
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-50 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 font-mono">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              <span>Admin: {username}</span>
            </div>

            {/* Dark Mode switcher */}
            <button
              id="theme-toggle-btn"
              onClick={toggleDarkMode}
              className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-850 cursor-pointer transition-all"
              title={darkMode ? "Switch to light theme" : "Switch to dark theme"}
            >
              {darkMode ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </button>

            {/* Logout control button */}
            <button
              id="logout-btn"
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/25 rounded-lg border border-red-200 dark:border-red-900/50 transition-all cursor-pointer"
              title="Logout session"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>

        </div>
      </div>
    </header>
  );
}
