/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Menu, Sparkles, Moon, Sun } from "lucide-react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import UploadData from "./components/UploadData";
import ShortlinkGenerator from "./components/ShortlinkGenerator";
import Login from "./components/Login";
import { StatsRow } from "./types";

export default function App() {
  const [activeTab, setActiveTab ] = useState<"dashboard" | "upload" | "shortlink">("dashboard");
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string>("");
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);
  
  // Theme state - Light by default
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const savedTheme = localStorage.getItem("buyer_dashboard_dark_mode");
    return savedTheme === "true";
  });

  // USD to IDR rate conversion state
  const [usdRate, setUsdRate] = useState<number>(16300);

  // Core aggregated data state pools
  const [statsRows, setStatsRows] = useState<StatsRow[]>([]);
  const [statsPlatform, setStatsPlatform] = useState<string>("PropellerAds");
  const [statsFileName, setStatsFileName] = useState<string>("default_stats.csv");

  const [clicksMap, setClicksMap] = useState<Record<string, number>>({});
  const [clicksFileName, setClicksFileName] = useState<string>("");

  const [phConversionMap, setPhConversionMap] = useState<Record<string, { earningsUsd: number; orders: number }>>({});
  const [phFileName, setPhFileName] = useState<string>("");

  const [idCommissionMap, setIdCommissionMap] = useState<Record<string, { commissionIdr: number; orders: number }>>({});
  const [idFileName, setIdFileName] = useState<string>("");

  const [zonePlatforms, setZonePlatforms] = useState<Record<string, string>>({});
  const [zoneMarkets, setZoneMarkets] = useState<Record<string, Set<string>>>({});

  // Real-time server uploaded files tracker
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);

  // Notification Toast state
  const [notif, setNotif] = useState<{ text: string; type: "success" | "info" } | null>(null);

  const triggerNotif = (text: string, type: "success" | "info" = "success") => {
    setNotif({ text, type });
    setTimeout(() => setNotif(null), 4000);
  };

  // Authenticate session check on boot
  useEffect(() => {
    const checkAuthStatus = async () => {
      const token = localStorage.getItem("buyer_dashboard_auth_token");
      if (!token) {
        setCheckingAuth(false);
        return;
      }

      try {
        const response = await fetch("/api/auth/status", {
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        });
        const data = await response.json();
        if (response.ok && data.authenticated) {
          setAuthToken(token);
          setUsername(data.username || "admin");
        } else {
          localStorage.removeItem("buyer_dashboard_auth_token");
        }
      } catch (err) {
        console.error("Boot connection handshake failed:", err);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkAuthStatus();
  }, []);

  // Sync exchange rate on boot from backend database
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch("/api/config");
        if (response.ok) {
          const data = await response.json();
          if (data.usdToIdrRate) {
            setUsdRate(data.usdToIdrRate);
          }
        }
      } catch (err) {
        console.warn("Could not query config from database:", err);
      }
    };
    fetchConfig();
  }, []);

  // Fetch persistent reports history on boot once authenticated
  useEffect(() => {
    if (!authToken) return;
    const fetchUploads = async () => {
      try {
        const response = await fetch("/api/uploads", {
          headers: {
            "Authorization": `Bearer ${authToken}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setUploadedFiles(data || []);
        }
      } catch (err) {
        console.error("Failed to fetch persistent CSV files list:", err);
      }
    };
    fetchUploads();
  }, [authToken]);

  const handleDeleteZone = async (zoneId: string) => {
    try {
      const response = await fetch(`/api/zones/${zoneId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${authToken}`
        }
      });
      if (response.ok) {
        const result = await response.json();
        setUploadedFiles(result.files || []);
        triggerNotif(`Berhasil: Data untuk Zone ID "${zoneId}" telah dihapus sepenuhnya.`);
      } else {
        triggerNotif(`Gagal menghapus data Zone ID ${zoneId}.`, "info");
      }
    } catch (err) {
      console.error(err);
      triggerNotif("Koneksi gagal menghubungi server delete.", "info");
    }
  };

  // Aggregate active uploaded files reactively down to the constituent components
  useEffect(() => {
    let statsTemp: StatsRow[] = [];
    let clicksTemp: Record<string, number> = {};
    let phTemp: Record<string, { earningsUsd: number; orders: number }> = {};
    let idTemp: Record<string, { commissionIdr: number; orders: number }> = {};
    let platformsTemp: Record<string, string> = {};
    let marketsTemp: Record<string, Set<string>> = {};

    let statsFile = "";
    let clicksFile = "";
    let phFile = "";
    let idFile = "";
    let statsPlat = "PropellerAds";

    // Trace oldest first so that newer items dynamically overwrite/aggregate correctly
    const sortedFiles = [...uploadedFiles].reverse();

    sortedFiles.forEach(file => {
      const type = file.fileType;
      
      if (type === "stats") {
        statsFile = file.filename;
        statsPlat = file.platform || "PropellerAds";
        file.data.forEach((row: any) => {
          const existingIdx = statsTemp.findIndex(r => r.zoneId === row.zoneId);
          if (existingIdx !== -1) {
            statsTemp[existingIdx] = row;
          } else {
            statsTemp.push(row);
          }
          platformsTemp[row.zoneId] = file.platform || "PropellerAds";
        });
      }

      else if (type === "clicks") {
        clicksFile = file.filename;
        file.data.forEach((row: any) => {
          clicksTemp[row.zoneId] = (clicksTemp[row.zoneId] || 0) + row.clicks;
        });
      }

      else if (type === "shopee_ph") {
        phFile = file.filename;
        file.data.forEach((row: any) => {
          if (!phTemp[row.zoneId]) {
            phTemp[row.zoneId] = { earningsUsd: 0, orders: 0 };
          }
          phTemp[row.zoneId].earningsUsd += row.earningsUsd;
          phTemp[row.zoneId].orders += row.orders;

          if (!marketsTemp[row.zoneId]) marketsTemp[row.zoneId] = new Set();
          marketsTemp[row.zoneId].add("ph");
        });
      }

      else if (type === "shopee_id") {
        idFile = file.filename;
        file.data.forEach((row: any) => {
          if (!idTemp[row.zoneId]) {
            idTemp[row.zoneId] = { commissionIdr: 0, orders: 0 };
          }
          idTemp[row.zoneId].commissionIdr += row.commissionIdr;
          idTemp[row.zoneId].orders += row.orders;

          if (!marketsTemp[row.zoneId]) marketsTemp[row.zoneId] = new Set();
          marketsTemp[row.zoneId].add("id");
        });
      }

      else if (type === "manual") {
        file.data.forEach((row: any) => {
          const existingIdx = statsTemp.findIndex(r => r.zoneId === row.zoneId);
          const statsRowObj = {
            zoneId: row.zoneId,
            impressions: Number(row.impressions) || 0,
            clicks: Number(row.statsClicks) || Number(row.clicks) || 0,
            cost: Number(row.costUsd) || 0,
          };
          if (existingIdx !== -1) {
            statsTemp[existingIdx] = statsRowObj;
          } else {
            statsTemp.push(statsRowObj);
          }
          platformsTemp[row.zoneId] = row.platform || "PropellerAds";

          // tracker clicks
          clicksTemp[row.zoneId] = (clicksTemp[row.zoneId] || 0) + (Number(row.clicks) || 0);

          // ph commission
          const commUsd = Number(row.commissionUsd) || 0;
          if (commUsd > 0) {
            if (!phTemp[row.zoneId]) {
              phTemp[row.zoneId] = { earningsUsd: 0, orders: 0 };
            }
            phTemp[row.zoneId].earningsUsd += commUsd;
            phTemp[row.zoneId].orders += Number(row.orders) || 1;

            if (!marketsTemp[row.zoneId]) marketsTemp[row.zoneId] = new Set();
            marketsTemp[row.zoneId].add("ph");
          }

          // id commission
          const commIdr = Number(row.commissionIdr) || 0;
          if (commIdr > 0) {
            if (!idTemp[row.zoneId]) {
              idTemp[row.zoneId] = { commissionIdr: 0, orders: 0 };
            }
            idTemp[row.zoneId].commissionIdr += commIdr;
            idTemp[row.zoneId].orders += Number(row.orders) || 1;

            if (!marketsTemp[row.zoneId]) marketsTemp[row.zoneId] = new Set();
            marketsTemp[row.zoneId].add("id");
          }

          // explicit manual market tags fallback
          if (row.market) {
            if (!marketsTemp[row.zoneId]) marketsTemp[row.zoneId] = new Set();
            if (row.market.toLowerCase().includes("id")) marketsTemp[row.zoneId].add("id");
            if (row.market.toLowerCase().includes("ph")) marketsTemp[row.zoneId].add("ph");
          }
        });
      }
    });

    setStatsRows(statsTemp);
    setClicksMap(clicksTemp);
    setPhConversionMap(phTemp);
    setIdCommissionMap(idTemp);
    setZonePlatforms(platformsTemp);
    setZoneMarkets(marketsTemp);

    setStatsFileName(statsFile);
    setClicksFileName(clicksFile);
    setPhFileName(phFile);
    setIdFileName(idFile);
    setStatsPlatform(statsPlat);

  }, [uploadedFiles]);

  // Apply visual theme selection
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("buyer_dashboard_dark_mode", String(darkMode));
  }, [darkMode]);

  const handleLoginSuccess = (token: string) => {
    localStorage.setItem("buyer_dashboard_auth_token", token);
    setAuthToken(token);
    setUsername("admin");
  };

  const handleLogout = () => {
    localStorage.removeItem("buyer_dashboard_auth_token");
    setAuthToken(null);
    setUsername("");
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  if (checkingAuth) {
    return (
      <div id="loader-wrapper" className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-605 dark:text-slate-400">
        <div className="text-center space-y-4">
          <div className="inline-block relative h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-semibold tracking-wide font-mono">Securing persistent architecture...</p>
        </div>
      </div>
    );
  }

  // Session login screen fallback
  if (!authToken) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors">
        <main className="py-12">
          <Login onLoginSuccess={handleLoginSuccess} />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans overflow-hidden transition-colors duration-300">
      
      {/* Toast notifications */}
      {notif && (
        <div
          id="global-toast-notification"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 p-4 rounded-xl shadow-2xl border text-sm transition-all bg-slate-900 border-blue-500/30 text-white font-medium"
        >
          <Sparkles className="h-4 w-4 text-blue-400" />
          <span>{notif.text}</span>
        </div>
      )}

      {/* Sidebar Navigation Panel */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        username={username}
        onLogout={handleLogout}
        darkMode={darkMode}
        toggleDarkMode={toggleDarkMode}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
      />

      {/* Main Core Area Viewport */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Sticky Mobile/Desktop Top Header bar */}
        <header className="h-16 shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800/80 px-4 sm:px-6 flex items-center justify-between transition-colors duration-300">
          
          {/* Mobile hamburger menu & Page Title indicator */}
          <div className="flex items-center gap-3">
            <button
              id="mobile-sidebar-hamburger"
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 text-slate-505 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              title="Open Navigation Menu"
            >
              <span className="font-bold text-lg">☰</span>
            </button>
            
            {/* Page header text detail */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest hidden sm:inline">Affiliate Suite</span>
              <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>
              <span className="text-sm font-bold text-slate-900 dark:text-white tracking-wide uppercase">
                {activeTab === "dashboard" ? "Dashboard & Hasil" : activeTab === "upload" ? "Upload Data & Riwayat" : "Shortlink Parameters"}
              </span>
            </div>
          </div>

          {/* Quick status actions */}
          <div className="flex items-center gap-2 font-mono">
            <div className="hidden sm:inline-block bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-905/30 px-2.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
              ONLINE
            </div>
            
            {/* Live conversion rate helper widget */}
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1 rounded-lg text-xs font-bold text-blue-600 dark:text-blue-400">
              USD/IDR: Rp {usdRate.toLocaleString("id-ID")}
            </div>
          </div>

        </header>

        {/* Dynamic scrollable viewport content page flow */}
        <div id="app-viewport-scroll" className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 transition-colors duration-300 p-4 sm:p-6 lg:p-8 space-y-8">
          
          <main className="w-full">
            {activeTab === "dashboard" ? (
              <Dashboard
                usdRate={usdRate}
                setUsdRate={setUsdRate}
                authToken={authToken}
                darkMode={darkMode}
                statsRows={statsRows}
                statsPlatform={statsPlatform}
                statsFileName={statsFileName}
                clicksMap={clicksMap}
                clicksFileName={clicksFileName}
                phConversionMap={phConversionMap}
                phFileName={phFileName}
                idCommissionMap={idCommissionMap}
                idFileName={idFileName}
                zonePlatforms={zonePlatforms}
                zoneMarkets={zoneMarkets}
                setActiveTab={setActiveTab}
                onDeleteZone={handleDeleteZone}
              />
            ) : activeTab === "upload" ? (
              <UploadData
                usdRate={usdRate}
                setUsdRate={setUsdRate}
                statsRows={statsRows}
                statsFileName={statsFileName}
                statsPlatform={statsPlatform}
                clicksMap={clicksMap}
                clicksFileName={clicksFileName}
                phConversionMap={phConversionMap}
                phFileName={phFileName}
                idCommissionMap={idCommissionMap}
                idFileName={idFileName}
                uploadedFiles={uploadedFiles}
                setUploadedFiles={setUploadedFiles}
                triggerNotif={triggerNotif}
                authToken={authToken}
              />
            ) : (
              <ShortlinkGenerator authToken={authToken} />
            )}
          </main>

          {/* Corporate Page footer */}
          <footer className="w-full text-center pt-8 border-t border-slate-200 dark:border-slate-850/60 pb-6 text-xs text-slate-400 dark:text-slate-500 transition-colors">
            <p>© 2026 Media Buying & Affiliate Consolidation Management Suite. All rights resolved.</p>
            <p className="mt-1 text-[10px] font-mono text-slate-400/50">Single-User Secure Architecture (Secure Cookie Auth Mode)</p>
          </footer>

        </div>

      </div>

    </div>
  );
}
