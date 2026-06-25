/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import {
  SlidersHorizontal,
  DollarSign,
  TrendingUp,
  Download,
  Percent,
  Search,
  ShoppingCart,
  Layers,
  ArrowUpDown,
  Sparkles,
  Info,
  ChevronRight,
  Database,
  ArrowRight
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { parseNumber } from "../utils/csv";
import { StatsRow, ConsolidatedRow } from "../types";

interface DashboardProps {
  usdRate: number;
  setUsdRate: (rate: number) => void;
  authToken: string | null;
  darkMode: boolean;
  statsRows: StatsRow[];
  statsPlatform: string;
  statsFileName: string;
  clicksMap: Record<string, number>;
  clicksFileName: string;
  phConversionMap: Record<string, { earningsUsd: number; orders: number }>;
  phFileName: string;
  idCommissionMap: Record<string, { commissionIdr: number; orders: number }>;
  idFileName: string;
  zonePlatforms: Record<string, string>;
  zoneMarkets: Record<string, Set<string>>;
  setActiveTab: (tab: "dashboard" | "upload" | "shortlink") => void;
  onDeleteZone?: (zoneId: string) => Promise<void>;
}

export default function Dashboard({
  usdRate,
  setUsdRate,
  authToken,
  darkMode,
  statsRows,
  statsPlatform,
  statsFileName,
  clicksMap,
  clicksFileName,
  phConversionMap,
  phFileName,
  idCommissionMap,
  idFileName,
  zonePlatforms,
  zoneMarkets,
  setActiveTab,
  onDeleteZone,
}: DashboardProps) {

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [zoneToDelete, setZoneToDelete] = useState<string | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<string>("ALL");
  const [filterMarket, setFilterMarket] = useState<string>("ALL");
  const [minCtr, setMinCtr] = useState<number>(0);

  // Sorting
  const [sortField, setSortField] = useState<keyof ConsolidatedRow>("zoneId");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Custom alert state
  const [notif, setNotif] = useState<{ text: string; type: "success" | "info" } | null>(null);

  const triggerNotif = (text: string, type: "success" | "info" = "success") => {
    setNotif({ text, type });
    setTimeout(() => setNotif(null), 400);
  };

  // 1. DATA CONSOLIDATION LOGIC
  const consolidatedData = useMemo(() => {
    // Build union of all possible Zone IDs found in any file
    const allZoneIds = new Set<string>();
    statsRows.forEach(r => allZoneIds.add(r.zoneId));
    Object.keys(clicksMap).forEach(id => allZoneIds.add(id));
    Object.keys(phConversionMap).forEach(id => allZoneIds.add(id));
    Object.keys(idCommissionMap).forEach(id => allZoneIds.add(id));

    return Array.from(allZoneIds).map((zoneId) => {
      // Platform resolution
      const platform = zonePlatforms[zoneId] || "OtherDSP";

      // Identify markets
      const marketSet = zoneMarkets[zoneId];
      let marketStr = "Unmatched";
      if (marketSet && marketSet.size > 0) {
        marketStr = Array.from(marketSet).map(m => m.toUpperCase()).join(" + ");
      }

      // Impressions, Click, and Cost stats from Slot 1 report
      const stats = statsRows.find(item => item.zoneId === zoneId);
      const impressions = stats ? stats.impressions : 0;
      const parsedClicks = stats ? stats.clicks : 0;
      const costUsd = stats ? stats.cost : 0;

      // Tracked clicks from Slot 2
      const trackerClicks = clicksMap[zoneId] || 0;

      // CTR calculation (tracker clicks / impression) or fallback matching
      const ctr = impressions > 0 ? (trackerClicks / impressions) * 100 : 0;

      // Currency conversion of ad spend cost
      const konversiCostRp = costUsd * usdRate;

      // Earnings calculation: Sum PH in USD (and convert to IDR) + direct Shopee ID direct Rp
      const phStats = phConversionMap[zoneId];
      const phEarningsUsd = phStats ? phStats.earningsUsd : 0;
      const phEarningsRp = phEarningsUsd * usdRate;
      const phOrders = phStats ? phStats.orders : 0;

      const idStats = idCommissionMap[zoneId];
      const idEarningsRp = idStats ? idStats.commissionIdr : 0;
      const idOrders = idStats ? idStats.orders : 0;

      const komisiRp = phEarningsRp + idEarningsRp;
      const orderCount = phOrders + idOrders;

      return {
        zoneId,
        platform,
        market: marketStr,
        clicks: trackerClicks,
        impressions,
        ctr,
        costUsd,
        konversiCostRp,
        komisiRp,
        orderCount,
      } as ConsolidatedRow;
    });
  }, [statsRows, clicksMap, phConversionMap, idCommissionMap, zonePlatforms, zoneMarkets, usdRate]);

  // Filters formulation
  const filteredData = useMemo(() => {
    return consolidatedData.filter((row) => {
      const matchesSearch = row.zoneId.toLowerCase().includes(searchQuery.trim().toLowerCase());
      
      const matchesPlatform = filterPlatform === "ALL" || row.platform === filterPlatform;

      let matchesMarket = true;
      if (filterMarket === "ID") {
        matchesMarket = row.market.includes("ID") && !row.market.includes("PH");
      } else if (filterMarket === "PH") {
        matchesMarket = row.market.includes("PH") && !row.market.includes("ID");
      } else if (filterMarket === "BOTH") {
        matchesMarket = row.market.includes("PH") && row.market.includes("ID");
      }

      const matchesCtr = row.ctr >= minCtr;

      return matchesSearch && matchesPlatform && matchesMarket && matchesCtr;
    });
  }, [consolidatedData, searchQuery, filterPlatform, filterMarket, minCtr]);

  // Currency formats
  const formatIDR = (num: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(num);
  };

  const formatUSD = (num: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(num);
  };

  // KPI Computations
  const kpiMetrics = useMemo(() => {
    let totalCostUsd = 0;
    let totalCostIdr = 0;
    let totalClicks = 0;
    let totalImpressions = 0;
    let totalCommissionIdr = 0;
    let totalOrders = 0;

    filteredData.forEach((row) => {
      totalCostUsd += row.costUsd;
      totalCostIdr += row.konversiCostRp;
      totalClicks += row.clicks;
      totalImpressions += row.impressions;
      totalCommissionIdr += row.komisiRp;
      totalOrders += row.orderCount;
    });

    const profit = totalCommissionIdr - totalCostIdr;
    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const orderToImpressionRatio = totalImpressions > 0 ? (totalOrders / totalImpressions) * 100 : 0;

    return {
      totalCostUsd,
      totalCostIdr,
      totalCommissionIdr,
      profit,
      totalClicks,
      totalImpressions,
      avgCtr,
      totalOrders,
      orderToImpressionRatio,
    };
  }, [filteredData]);

  // Chart preparation (top 8 spenders)
  const chartData = useMemo(() => {
    const list = [...filteredData]
      .sort((a, b) => b.konversiCostRp - a.konversiCostRp)
      .slice(0, 8);

    return list.map(item => ({
      zoneId: item.zoneId,
      "Spend (IDR)": Math.round(item.konversiCostRp),
      "Commission (IDR)": Math.round(item.komisiRp),
    }));
  }, [filteredData]);

  // Sorting list logic
  const handleSort = (field: keyof ConsolidatedRow) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (typeof valA === "string") {
        return sortDirection === "asc"
          ? (valA as string).localeCompare(valB as string)
          : (valB as string).localeCompare(valA as string);
      }

      return sortDirection === "asc"
        ? (valA as number) - (valB as number)
        : (valB as number) - (valA as number);
    });
  }, [filteredData, sortField, sortDirection]);

  // Paginated elements
  const totalPages = Math.max(1, Math.ceil(sortedData.length / itemsPerPage));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(start, start + itemsPerPage);
  }, [sortedData, currentPage]);

  const exportToCSV = () => {
    if (filteredData.length === 0) return;

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Zone ID,Platform,Markets,Clicks,Impressions,CTR %,Cost USD,Converted Cost IDR,Commission IDR,Net Profit,Orders\n";

    filteredData.forEach((row) => {
      const profit = row.komisiRp - row.konversiCostRp;
      csvContent += `${row.zoneId},${row.platform},${row.market},${row.clicks},${row.impressions},${row.ctr.toFixed(3)},${row.costUsd},${Math.round(row.konversiCostRp)},${Math.round(row.komisiRp)},${Math.round(profit)},${row.orderCount}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `affiliate_consolidated_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerNotif("CSV laporan konsolidasi berhasil diunduh!");
  };

  return (
    <div className="space-y-8 animate-fadeIn" id="dashboard-wrapper">
      
      {/* Toast Alert Indicator */}
      {notif && (
        <div
          id="toast-notification"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 p-4 rounded-xl shadow-2xl border text-sm transition-all bg-slate-900 border-blue-500/30 text-white font-medium"
        >
          <Sparkles className="h-4 w-4 text-blue-400" />
          <span>{notif.text}</span>
        </div>
      )}

      {/* Header Block with Actions */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-colors">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Operations Dashboard
            </span>
            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              {statsRows.length > 0 ? "Data Terkonsolidasi" : "Menunggu Data"}
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-1 tracking-tight">Hasil Analisis & Konsolidasi</h1>
          <p className="text-xs text-slate-550 dark:text-slate-400 mt-1 leading-relaxed">
            Menyelaraskan statistik penayangan iklan dengan komisi affiliate Shopee PH dan Shopee ID berdasarkan ID Zone.
          </p>
        </div>

        {statsRows.length === 0 && (
          <button
            onClick={() => setActiveTab("upload")}
            className="flex items-center gap-1.5 px-4.5 py-2 hover:shadow-xs text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer transition-all shrink-0"
          >
            <span>Unggah Data CSV Baru</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* KPI METRICS ROW TILES */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4" id="kpi-metrics-row">
        
        {/* KPI: Spend */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
          <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
            <DollarSign className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-[10px] uppercase font-bold tracking-wider">Pengeluaran Iklan</span>
          </div>
          <div className="mt-2 font-extrabold text-slate-900 dark:text-white text-base tracking-tight font-mono">
            {formatIDR(kpiMetrics.totalCostIdr)}
          </div>
          <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-1 font-mono">
            {formatUSD(kpiMetrics.totalCostUsd)} USD
          </div>
        </div>

        {/* KPI: Earned Commissions */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
          <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-[10px] uppercase font-bold tracking-wider">Komisi Diterima</span>
          </div>
          <div className="mt-2 font-extrabold text-emerald-600 dark:text-emerald-400 text-base tracking-tight font-mono">
            {formatIDR(kpiMetrics.totalCommissionIdr)}
          </div>
          <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
            Shopee PH & ID Combined
          </div>
        </div>

        {/* KPI: Net Profit Margin */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
          <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
            <Layers className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase font-bold tracking-wider">Profit Bersih</span>
          </div>
          <div className={`mt-2 font-extrabold text-base tracking-tight font-mono ${kpiMetrics.profit >= 0 ? "text-blue-650 dark:text-blue-400" : "text-rose-600"}`}>
            {formatIDR(kpiMetrics.profit)}
          </div>
          <div className="text-[10px] font-semibold mt-1">
            {kpiMetrics.totalCostIdr > 0 ? (
              <span className={kpiMetrics.profit >= 0 ? "text-emerald-605 font-bold" : "text-rose-500"}>
                {Math.round((kpiMetrics.profit / kpiMetrics.totalCostIdr) * 100)}% Profit Margin
              </span>
            ) : "0% Margin"}
          </div>
        </div>

        {/* KPI: Total Clicks */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
          <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
            <Percent className="h-3.5 w-3.5 text-indigo-500" />
            <span className="text-[10px] uppercase font-bold tracking-wider">Rasio CTR Klik</span>
          </div>
          <div className="mt-2 font-extrabold text-slate-900 dark:text-white text-base tracking-tight font-mono">
            {kpiMetrics.avgCtr.toFixed(3)}%
          </div>
          <div className="text-[10px] font-semibold text-slate-550 dark:text-slate-400 mt-1 font-mono">
            {kpiMetrics.totalClicks.toLocaleString()} klik pelacak
          </div>
        </div>

        {/* KPI: Order/Impression Ratio Metric */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors col-span-2 md:col-span-1">
          <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
            <ShoppingCart className="h-3.5 w-3.5 text-violet-500" />
            <span className="text-[10px] uppercase font-bold tracking-wider">Rasio Konversi</span>
          </div>
          <div className="mt-2 font-extrabold text-slate-900 dark:text-white text-base tracking-tight font-mono">
            {kpiMetrics.orderToImpressionRatio.toFixed(4)}%
          </div>
          <div className="text-[10px] font-semibold text-slate-550 dark:text-slate-400 mt-1 font-mono">
            {kpiMetrics.totalOrders.toLocaleString()} total order
          </div>
        </div>

      </div>

      {/* DASHBOARD GRAPHICAL VISUALIZATIONS */}
      {filteredData.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm transition-colors" id="dashboard-visuals">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-4 tracking-tight uppercase">Komparasi Pendapatan: Pengeluaran Ad Spend vs Komisi Shopee (Top 8 Spend Zone)</h3>
          <div className="h-80 w-full" id="bar-chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? "#1e293b" : "#f1f5f9"} />
                <XAxis dataKey="zoneId" stroke={darkMode ? "#94a3b8" : "#64748b"} fontSize={10} tickLine={false} />
                <YAxis stroke={darkMode ? "#94a3b8" : "#64748b"} fontSize={10} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "rgba(99, 102, 241, 0.05)" }}
                  contentStyle={{
                    backgroundColor: darkMode ? "#0f172a" : "#ffffff",
                    borderColor: darkMode ? "#334155" : "#e2e8f0",
                    borderRadius: "12px",
                    color: darkMode ? "#f8fafc" : "#0f172a",
                  }}
                  formatter={(value) => formatIDR(value as number)}
                />
                <Legend iconType="circle" />
                <Bar name="Pengeluaran (Rp)" dataKey="Spend (IDR)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar name="Komisi (Rp)" dataKey="Commission (IDR)" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 3. CONSOLIDATED DATA REPORT TABLE VIEW */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm transition-colors" id="consolidated-table-section">
        
        {/* Controls, Search and CTR filters */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col xl:flex-row gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 w-full">
            
            {/* Search ID filter */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Search className="h-4 w-4" />
              </span>
              <input
                id="search-zone-input"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Cari ID Zone..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-850 rounded-xl text-slate-800 dark:text-slate-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Platform dropdown selector */}
            <div>
              <select
                id="filter-platform-select"
                value={filterPlatform}
                onChange={(e) => {
                  setFilterPlatform(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full bg-slate-50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-850 rounded-xl px-3 py-2 text-slate-700 dark:text-slate-250 text-xs focus:outline-none"
              >
                <option value="ALL">Semua Platform Sumber</option>
                <option value="PropellerAds">PropellerAds</option>
                <option value="Clickadu">Clickadu</option>
                <option value="GalaksionAds">GalaksionAds</option>
              </select>
            </div>

            {/* Market dropdown select */}
            <div>
              <select
                id="filter-market-select"
                value={filterMarket}
                onChange={(e) => {
                  setFilterMarket(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full bg-slate-50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-850 rounded-xl px-3 py-2 text-slate-700 dark:text-slate-250 text-xs focus:outline-none"
              >
                <option value="ALL">Semua Market Sasar</option>
                <option value="ID">Shopee ID Saja [ID]</option>
                <option value="PH">Shopee PH Saja [PH]</option>
                <option value="BOTH">Konvergensi Kedua Market</option>
              </select>
            </div>

            {/* CTR filter slider handles */}
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950/20 px-3 py-2 border border-slate-200 dark:border-slate-850 rounded-xl text-xs text-slate-500">
              <SlidersHorizontal className="h-4 w-4 text-blue-400 shrink-0" />
              <span className="shrink-0 font-bold font-mono text-[10px]">Min CTR %: </span>
              <input
                id="ctr-filter-range"
                type="range"
                min="0"
                max="5"
                step="0.05"
                value={minCtr}
                onChange={(e) => {
                  setMinCtr(parseFloat(e.target.value));
                  setCurrentPage(1);
                }}
                className="w-full accent-blue-550"
              />
              <span className="font-bold text-slate-900 dark:text-slate-205 shrink-0 font-mono text-[11px]">{minCtr}%</span>
            </div>

          </div>

          <div className="shrink-0 flex items-center justify-end">
            <button
              id="export-csv-btn"
              onClick={exportToCSV}
              disabled={filteredData.length === 0}
              className="flex items-center gap-1.5 px-4.5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 rounded-xl cursor-pointer shadow-xs hover:shadow transition-all w-full sm:w-auto text-center justify-center"
            >
              <Download className="h-4 w-4" />
              <span>Ekspor CSV Gabungan</span>
            </button>
          </div>
        </div>

        {/* Main interactive Table component */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse" id="reports-table-element">
            <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th
                  onClick={() => handleSort("zoneId")}
                  className="px-6 py-3 text-[10px] font-bold tracking-wider text-slate-500 uppercase cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-900"
                >
                  <div className="flex items-center gap-1">
                    <span>ZONE ID</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("platform")}
                  className="px-6 py-3 text-[10px] font-bold tracking-wider text-slate-500 uppercase cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-900"
                >
                  <div className="flex items-center gap-1">
                    <span>DSP PLATFORM</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("market")}
                  className="px-6 py-3 text-[10px] font-bold tracking-wider text-slate-500 uppercase cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-900"
                >
                  <div className="flex items-center gap-1">
                    <span>MARKETS</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("clicks")}
                  className="px-6 py-3 text-[10px] font-bold tracking-wider text-slate-500 uppercase cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-900"
                >
                  <div className="flex items-center gap-1">
                    <span>TAG CLICKS</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("impressions")}
                  className="px-6 py-3 text-[10px] font-bold tracking-wider text-slate-500 uppercase cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-900"
                >
                  <div className="flex items-center gap-1">
                    <span>IMPRESSION</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("ctr")}
                  className="px-6 py-3 text-[10px] font-bold tracking-wider text-slate-500 uppercase cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-900"
                >
                  <div className="flex items-center gap-1">
                    <span>CTR %</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("costUsd")}
                  className="px-6 py-3 text-[10px] font-bold tracking-wider text-slate-500 uppercase cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-900"
                >
                  <div className="flex items-center gap-1">
                    <span>COST USD</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("konversiCostRp")}
                  className="px-6 py-3 text-[10px] font-bold tracking-wider text-slate-500 uppercase cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-900"
                >
                  <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                    <span>COST (IDR)</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("komisiRp")}
                  className="px-6 py-3 text-[10px] font-bold tracking-wider text-slate-500 uppercase cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-900"
                >
                  <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <span>EST KOMISI (IDR)</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("orderCount")}
                  className="px-6 py-3 text-[10px] font-bold tracking-wider text-slate-500 uppercase cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-900"
                >
                  <div className="flex items-center gap-1">
                    <span>ORDERS</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                {onDeleteZone && (
                  <th className="px-6 py-3 text-[10px] font-bold tracking-wider text-slate-500 uppercase text-right">
                    AKSI
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {paginatedData.length > 0 ? (
                paginatedData.map((row) => {
                  const lineProfit = row.komisiRp - row.konversiCostRp;
                  const ratio = row.impressions > 0 ? (row.orderCount / row.impressions) * 100 : 0;
                  return (
                    <tr
                      id={`row-${row.zoneId}`}
                      key={row.zoneId}
                      className="hover:bg-blue-50/10 dark:hover:bg-blue-950/10 transition-all font-mono text-[12px] text-slate-650 dark:text-slate-300"
                    >
                      <td className="px-6 py-3.5 text-slate-900 dark:text-white font-bold tracking-tight">
                        {row.zoneId}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="px-2 py-0.5 bg-blue-50 dark:bg-slate-800 text-blue-700 dark:text-blue-400 text-[9px] uppercase font-bold rounded">
                          {row.platform}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="text-slate-500 text-[11px] font-semibold">
                          {row.market}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 font-semibold font-mono">
                        {row.clicks.toLocaleString()}
                      </td>
                      <td className="px-6 py-3.5 font-mono text-slate-500">
                        {row.impressions.toLocaleString()}
                      </td>
                      <td className="px-6 py-3.5 font-semibold font-mono text-indigo-650 dark:text-indigo-400">
                        {row.ctr.toFixed(3)}%
                      </td>
                      <td className="px-6 py-3.5 font-mono text-slate-400">
                        {formatUSD(row.costUsd)}
                      </td>
                      <td className="px-6 py-3.5 font-semibold font-mono text-slate-800 dark:text-slate-400">
                        {formatIDR(row.konversiCostRp)}
                      </td>
                      <td className="px-6 py-3.5 font-bold font-mono text-emerald-600 dark:text-emerald-450">
                        {formatIDR(row.komisiRp)}
                      </td>
                      <td className="px-6 py-3.5 text-xs font-semibold">
                        <div className="flex items-center gap-1">
                          <span className="text-blue-500 font-bold font-mono">{row.orderCount} ords</span>
                          <span className="text-slate-400 text-[9px] font-mono">({ratio.toFixed(4)}%)</span>
                        </div>
                      </td>
                      {onDeleteZone && (
                        <td className="px-6 py-3.5 text-right">
                          <button
                            onClick={() => setZoneToDelete(row.zoneId)}
                            className="p-1 px-2.2 bg-rose-55 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-955/40 text-rose-600 dark:text-rose-400 rounded-lg border border-rose-200 dark:border-rose-900/40 text-[10px] font-bold cursor-pointer transition-all inline-flex items-center gap-1"
                            title="Hapus baris data ini"
                          >
                            <span>Hapus</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={onDeleteZone ? 11 : 10} className="px-6 py-16 text-center text-slate-400 text-sm">
                    {statsRows.length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-8 text-center max-w-sm mx-auto space-y-4">
                        <div className="p-3.5 bg-blue-50 dark:bg-slate-950 border border-blue-100 dark:border-blue-900 rounded-full text-blue-500">
                          <Database className="h-6 w-6" />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800 dark:text-white">Tidak Ada Data CSV Terbaca</h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                            Buka modul **Upload Data** di panel navigasi sidebar kiri untuk mengimpor file statistik pengeluaran ad network dan komisi affiliate shopee.
                          </p>
                        </div>
                        <button
                          onClick={() => setActiveTab("upload")}
                          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white font-semibold text-xs rounded-lg hover:bg-blue-700 cursor-pointer shadow-xs transition-colors"
                        >
                          <span>Buka Modul Upload Data</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      "Tidak ada hasil yang cocok dengan kombinasi filter Anda saat ini."
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {sortedData.length > 0 && (
          <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-450 dark:text-slate-500 font-mono">
              Menampilkan {Math.min(sortedData.length, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(sortedData.length, currentPage * itemsPerPage)} dari {sortedData.length} baris
            </span>
            <div className="flex items-center gap-1">
              <button
                id="prev-page-btn"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
                className="px-3 py-1 bg-white hover:bg-slate-50 disabled:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 dark:disabled:bg-slate-950 text-xs font-semibold border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer text-slate-700 dark:text-slate-300 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
              >
                Sebelumnya
              </button>
              <span className="px-3 text-xs font-semibold font-mono text-slate-500">
                {currentPage} / {totalPages}
              </span>
              <button
                id="next-page-btn"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
                className="px-3 py-1 bg-white hover:bg-slate-50 disabled:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 dark:disabled:bg-slate-950 text-xs font-semibold border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer text-slate-700 dark:text-slate-300 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
              >
                Selanjutnya
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Confirmation modal for zone deletion */}
      {zoneToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-xl space-y-4">
            <div className="text-center space-y-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-tight">Hapus Data Zone Permanen</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Apakah Anda yakin ingin menghapus seluruh data untuk Zone ID <span className="font-mono font-bold text-blue-600 dark:text-blue-400">"{zoneToDelete}"</span> secara permanen dari basis data?
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setZoneToDelete(null)}
                className="flex-1 py-2 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-350 text-xs font-bold rounded-xl cursor-pointer transition-all"
              >
                Batal
              </button>
              <button
                onClick={async () => {
                  try {
                    if (onDeleteZone) {
                      await onDeleteZone(zoneToDelete);
                    }
                  } finally {
                    setZoneToDelete(null);
                  }
                }}
                className="flex-1 py-2 px-4 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl cursor-pointer transition-all shadow-xs"
              >
                Ya, Hapus!
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
