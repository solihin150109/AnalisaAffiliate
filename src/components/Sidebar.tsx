/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { 
  TrendingUp, 
  LayoutDashboard, 
  Link2, 
  ShieldCheck, 
  LogOut, 
  Sun, 
  Moon, 
  X,
  Upload
} from "lucide-react";

interface SidebarProps {
  activeTab: "dashboard" | "upload" | "shortlink";
  setActiveTab: (tab: "dashboard" | "upload" | "shortlink") => void;
  username: string;
  onLogout: () => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  username,
  onLogout,
  darkMode,
  toggleDarkMode,
  isOpen,
  setIsOpen,
}: SidebarProps) {
  
  const navItems = [
    {
      id: "dashboard" as const,
      label: "Dashboard & Hasil",
      icon: LayoutDashboard,
    },
    {
      id: "upload" as const,
      label: "Upload & Riwayat",
      icon: Upload,
    },
    {
      id: "shortlink" as const,
      label: "Shortlink Gen",
      icon: Link2,
    },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-colors duration-300">
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold shadow-sm">
            AC
          </div>
          <span className="font-bold text-[17px] tracking-tight text-slate-800 dark:text-white">
            AffiliateConsole
          </span>
        </div>
        
        {/* Mobile close button inside drawer */}
        <button
          onClick={() => setIsOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          title="Close Sidebar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation list Items */}
      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              id={`nav-item-${item.id}`}
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                setIsOpen(false); // Close on mobile navigation action
              }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${
                isActive
                  ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-l-4 border-blue-600 dark:border-blue-500 pl-3"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-500"}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Theme Quick Switcher inside Sidebar to save vertical header space */}
      <div className="px-4 py-2 mx-4 border-t border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Appearance</span>
        <button
          id="sidebar-darkmode-toggle"
          onClick={toggleDarkMode}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 cursor-pointer transition-all"
          title={darkMode ? "Switch to Light Theme" : "Switch to Dark Theme"}
        >
          {darkMode ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-blue-600" />}
        </button>
      </div>

      {/* Sidebar footer area */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
        {/* Logged in indicator */}
        <div className="bg-slate-50 dark:bg-slate-950/40 p-3 rounded-xl border border-slate-100 dark:border-slate-850 flex flex-col gap-1 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            <span>Administrator Session</span>
          </div>
          <span className="font-mono text-slate-400 dark:text-slate-500 truncate mt-0.5">
            Admin: {username}
          </span>
        </div>

        {/* Logout session button */}
        <button
          id="sidebar-logout-btn"
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/20 text-xs font-semibold text-red-600 dark:text-red-400 rounded-xl cursor-pointer transition-all"
        >
          <LogOut className="h-4 w-4" />
          <span>Exit Account</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar view (persistent) */}
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Slide-out container */}
      <div 
        className={`fixed inset-0 z-50 lg:hidden pointer-events-none transition-all duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0"
        }`}
      >
        {/* Semi-transparent dark blur backdrop list */}
        <div 
          onClick={() => setIsOpen(false)}
          className={`absolute inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity duration-300 ${
            isOpen ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* Sidebar Frame Container */}
        <div 
          className={`absolute top-0 bottom-0 left-0 w-64 max-w-xs transition-transform duration-300 shadow-2xl ${
            isOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {sidebarContent}
        </div>
      </div>
    </>
  );
}
