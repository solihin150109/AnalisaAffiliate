/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from "react";
import {
  Upload,
  CheckCircle,
  FileText,
  Trash2,
  Coins,
  Database,
  Info,
  Calendar,
  Layers,
  Sparkles,
} from "lucide-react";
import { parseCSV, extractZoneId, parseNumber } from "../utils/csv";
import { StatsRow } from "../types";

interface UploadDataProps {
  usdRate: number;
  setUsdRate: (rate: number) => void;
  statsRows: StatsRow[];
  statsFileName: string;
  statsPlatform: string;
  clicksMap: Record<string, number>;
  clicksFileName: string;
  phConversionMap: Record<string, { earningsUsd: number; orders: number }>;
  phFileName: string;
  idCommissionMap: Record<string, { commissionIdr: number; orders: number }>;
  idFileName: string;
  uploadedFiles: any[];
  setUploadedFiles: (files: any[]) => void;
  triggerNotif: (text: string, type?: "success" | "info") => void;
  authToken: string | null;
}

export default function UploadData({
  usdRate,
  setUsdRate,
  statsRows,
  statsFileName,
  statsPlatform,
  clicksMap,
  clicksFileName,
  phConversionMap,
  phFileName,
  idCommissionMap,
  idFileName,
  uploadedFiles,
  setUploadedFiles,
  triggerNotif,
  authToken,
}: UploadDataProps) {

  // Form platform selection state for ad network statistics
  const [uploadPlatform, setUploadPlatform] = useState<string>("PropellerAds");
  
  // Input file references
  const fileInputStats = useRef<HTMLInputElement>(null);
  const fileInputClicks = useRef<HTMLInputElement>(null);
  const fileInputPh = useRef<HTMLInputElement>(null);
  const fileInputId = useRef<HTMLInputElement>(null);

  // Sync exchange rate on-the-fly back to database
  const saveExchangeRate = async (rate: number) => {
    try {
      const response = await fetch("/api/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ usdToIdrRate: rate })
      });
      if (response.ok) {
        console.log("Exchange rate successfully updated in backend context.");
      }
    } catch (err) {
      console.warn("Error syncing exchange rate to storage:", err);
    }
  };

  // Staged files for confirmation/save flow
  const [stagedStats, setStagedStats] = useState<{ filename: string; rowCount: number; data: any[]; platform: string } | null>(null);
  const [stagedClicks, setStagedClicks] = useState<{ filename: string; rowCount: number; data: any[] } | null>(null);
  const [stagedPh, setStagedPh] = useState<{ filename: string; rowCount: number; data: any[] } | null>(null);
  const [stagedId, setStagedId] = useState<{ filename: string; rowCount: number; data: any[] } | null>(null);

  // Tab and confirmation states
  const [activeSubTab, setActiveSubTab] = useState<"csv" | "manual">("csv");
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);

  // Manual input form states
  const [manualZoneId, setManualZoneId] = useState("");
  const [manualPlatform, setManualPlatform] = useState("PropellerAds");
  const [manualMarket, setManualMarket] = useState("id");
  const [manualImpressions, setManualImpressions] = useState("");
  const [manualClicks, setManualClicks] = useState("");
  const [manualCostUsd, setManualCostUsd] = useState("");
  const [manualCommissionIdr, setManualCommissionIdr] = useState("");
  const [manualCommissionUsd, setManualCommissionUsd] = useState("");
  const [manualOrders, setManualOrders] = useState("");
  const [isSavingManual, setIsSavingManual] = useState(false);

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanZoneId = extractZoneId(manualZoneId);
    if (!cleanZoneId) {
      triggerNotif("Kesalahan: ID Zone tidak valid (harus mengandung angka).", "info");
      return;
    }

    setIsSavingManual(true);
    try {
      const response = await fetch("/api/manual-entry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          zoneId: cleanZoneId,
          platform: manualPlatform,
          market: manualMarket,
          impressions: manualImpressions ? parseInt(manualImpressions) : 0,
          clicks: manualClicks ? parseInt(manualClicks) : 0,
          costUsd: manualCostUsd ? parseFloat(manualCostUsd) : 0,
          commissionIdr: manualCommissionIdr ? parseFloat(manualCommissionIdr) : 0,
          commissionUsd: manualCommissionUsd ? parseFloat(manualCommissionUsd) : 0,
          orders: manualOrders ? parseInt(manualOrders) : 1,
        })
      });

      if (response.ok) {
        const result = await response.json();
        setUploadedFiles(result.files || []);
        triggerNotif(`Berhasil: Menyimpan data manual untuk Zone ID "${manualZoneId}".`);
        
        // Reset inputs
        setManualZoneId("");
        setManualImpressions("");
        setManualClicks("");
        setManualCostUsd("");
        setManualCommissionIdr("");
        setManualCommissionUsd("");
        setManualOrders("");
      } else {
        const errObj = await response.json();
        triggerNotif(errObj.error || "Gagal menyimpan data manual.", "info");
      }
    } catch (err) {
      console.error(err);
      triggerNotif("Koneksi gagal saat menyimpan data manual.", "info");
    } finally {
      setIsSavingManual(false);
    }
  };

  // 1. Stats File local parser (Staged stage)
  const handleStatsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const parsed = parseCSV(text);
      
      let zoneCol = "";
      let impCol = "";
      let clickCol = "";
      let costCol = "";

      parsed.headers.forEach((h) => {
        const lower = h.toLowerCase().replace(/[\s_-]/g, "");
        if (lower.includes("zoneid") || lower === "zone" || lower === "tagid" || lower === "id") {
          zoneCol = h;
        } else if (lower.includes("impression")) {
          impCol = h;
        } else if (lower.includes("click")) {
          clickCol = h;
        } else if (lower.includes("cost") || lower.includes("spend")) {
          costCol = h;
        }
      });

      if (!zoneCol) zoneCol = parsed.headers[0] || "";
      if (!impCol) impCol = parsed.headers.find(h => h.toLowerCase().includes("imp")) || "";
      if (!clickCol) clickCol = parsed.headers.find(h => h.toLowerCase().includes("clk") || h.toLowerCase().includes("click")) || "";
      if (!costCol) costCol = parsed.headers.find(h => h.toLowerCase().includes("cst") || h.toLowerCase().includes("cost")) || "";

      if (!parsed.rows.length || !zoneCol) {
        triggerNotif("Kesalahan: Struktur CSV tidak dikenali. Kolom ID Zone tidak terbaca.", "info");
        return;
      }

      const mappedRows: StatsRow[] = parsed.rows.map((row) => {
        const rawZone = row[zoneCol] || "";
        const id = extractZoneId(rawZone);
        return {
          zoneId: id,
          impressions: parseNumber(row[impCol]),
          clicks: parseNumber(row[clickCol]),
          cost: parseNumber(row[costCol]),
        };
      }).filter(r => r.zoneId);

      setStagedStats({
        filename: file.name,
        rowCount: mappedRows.length,
        data: mappedRows,
        platform: uploadPlatform,
      });
      triggerNotif(`Terpilih: "${file.name}" siap diunggah ke database.`);
    };
    reader.readAsText(file);
    if (e.target) e.target.value = ""; // clear selector input channel
  };

  const submitStats = async () => {
    if (!stagedStats) return;
    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          filename: stagedStats.filename,
          fileType: "stats",
          rowCount: stagedStats.rowCount,
          platform: uploadPlatform, // use current selected platform
          data: stagedStats.data
        })
      });

      if (response.ok) {
        const nextFiles = await response.json();
        setUploadedFiles(nextFiles);
        triggerNotif(`Berhasil: Mengunggah ${stagedStats.rowCount} baris statistik untuk platform ${uploadPlatform}.`);
        setStagedStats(null);
      } else {
        triggerNotif("Gagal menyimpan file ke database server.", "info");
      }
    } catch (err) {
      console.error(err);
      triggerNotif("Gagal menghubungi server.", "info");
    }
  };

  // 2. Website Clicks report local parser (Staged stage)
  const handleWebsiteClicksUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const parsed = parseCSV(text);

      let tagCol = parsed.headers.find(h => h.toLowerCase().replace(/[\s_-]/g, "").includes("taglink")) || "";
      let clickNumCol = parsed.headers.find(h => h.toLowerCase().replace(/[\s_-]/g, "").includes("click") || h.toLowerCase().includes("count")) || "";

      if (!tagCol) tagCol = parsed.headers[0] || "";

      const updatedClicksMap: Record<string, number> = {};

      parsed.rows.forEach((row) => {
        const rawTag = row[tagCol] || "";
        const zoneId = extractZoneId(rawTag);
        if (!zoneId) return;

        const clicks = clickNumCol ? parseNumber(row[clickNumCol]) : 1;
        updatedClicksMap[zoneId] = (updatedClicksMap[zoneId] || 0) + clicks;
      });

      const mappedClicks = Object.keys(updatedClicksMap).map(id => ({
        zoneId: id,
        clicks: updatedClicksMap[id]
      }));

      setStagedClicks({
        filename: file.name,
        rowCount: mappedClicks.length,
        data: mappedClicks
      });
      triggerNotif(`Terpilih: "${file.name}" siap diunggah ke database.`);
    };
    reader.readAsText(file);
    if (e.target) e.target.value = "";
  };

  const submitWebsiteClicks = async () => {
    if (!stagedClicks) return;
    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          filename: stagedClicks.filename,
          fileType: "clicks",
          rowCount: stagedClicks.rowCount,
          data: stagedClicks.data
        })
      });

      if (response.ok) {
        const nextFiles = await response.json();
        setUploadedFiles(nextFiles);
        triggerNotif(`Berhasil: Membaca & menyimpan ${stagedClicks.rowCount} ID klik dari ${stagedClicks.filename}.`);
        setStagedClicks(null);
      } else {
        triggerNotif("Gagal menyimpan file ke database server.", "info");
      }
    } catch (err) {
      console.error(err);
      triggerNotif("Gagal menghubungi server.", "info");
    }
  };

  // 3. Shopee PH local conversions parser (Staged stage)
  const handlePhConversionUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const parsed = parseCSV(text);

      let subIdCol = parsed.headers.find(h => {
        const norm = h.toLowerCase().replace(/[\s_-]/g, "");
        return norm.includes("pubsub") || norm.includes("publishersubid1") || norm.includes("subid1") || norm.includes("sub1");
      }) || "";

      let earningsCol = parsed.headers.find(h => {
        const norm = h.toLowerCase().replace(/[\s_-]/g, "");
        return norm.includes("estimatedearnings") || norm.includes("earnings") || norm.includes("earn");
      }) || "";

      if (!subIdCol) subIdCol = parsed.headers[0] || "";
      if (!earningsCol) earningsCol = parsed.headers.find(h => h.toLowerCase().includes("usd") || h.toLowerCase().includes("val")) || "";

      const updatedPhMap: Record<string, { earningsUsd: number; orders: number }> = {};

      parsed.rows.forEach((row) => {
        const rawId = row[subIdCol] || "";
        const zoneId = extractZoneId(rawId);
        if (!zoneId) return;

        const usdEarning = parseNumber(row[earningsCol]);

        if (!updatedPhMap[zoneId]) {
          updatedPhMap[zoneId] = { earningsUsd: 0, orders: 0 };
        }
        updatedPhMap[zoneId].earningsUsd += usdEarning;
        updatedPhMap[zoneId].orders += 1;
      });

      const mappedPh = Object.keys(updatedPhMap).map(id => ({
        zoneId: id,
        earningsUsd: updatedPhMap[id].earningsUsd,
        orders: updatedPhMap[id].orders
      }));

      setStagedPh({
        filename: file.name,
        rowCount: mappedPh.length,
        data: mappedPh
      });
      triggerNotif(`Terpilih: "${file.name}" siap diunggah ke database.`);
    };
    reader.readAsText(file);
    if (e.target) e.target.value = "";
  };

  const submitPhConversion = async () => {
    if (!stagedPh) return;
    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          filename: stagedPh.filename,
          fileType: "shopee_ph",
          rowCount: stagedPh.rowCount,
          data: stagedPh.data
        })
      });

      if (response.ok) {
        const nextFiles = await response.json();
        setUploadedFiles(nextFiles);
        triggerNotif(`Berhasil: Menyimpan ${stagedPh.rowCount} data komisi Shopee PH.`);
        setStagedPh(null);
      } else {
        triggerNotif("Gagal menyimpan file ke database server.", "info");
      }
    } catch (err) {
      console.error(err);
      triggerNotif("Gagal menghubungi server.", "info");
    }
  };

  // 4. Affiliate Commission Report parser (Shopee ID Direct Rp) (Staged stage)
  const handleIdCommissionUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const parsed = parseCSV(text);

      let tagCol = parsed.headers.find(h => {
        const norm = h.toLowerCase().replace(/[\s_-]/g, "");
        return norm.includes("taglink1") || norm.includes("tag1") || norm.includes("taglink");
      }) || "";

      // Prioritize "Komisi Bersih Affiliate (Rp)" or similar Clean Affiliate commissions
      let commCol = parsed.headers.find(h => {
        const norm = h.toLowerCase().replace(/[\s_-]/g, "");
        return norm.includes("komisibersih") || norm.includes("bersihaffiliate");
      }) || parsed.headers.find(h => {
        const norm = h.toLowerCase().replace(/[\s_-]/g, "");
        return norm.includes("shopeeperpesanan") || norm.includes("komisishopee") || norm.includes("totalkomisi") || norm.includes("komisi") || norm.includes("commission") || norm.includes("rp");
      }) || "";

      if (!tagCol) tagCol = parsed.headers[0] || "";
      if (!commCol) commCol = parsed.headers.find(h => h.toLowerCase().includes("rp") || h.toLowerCase().includes("total")) || "";

      const updatedIdMap: Record<string, { commissionIdr: number; orders: number }> = {};

      parsed.rows.forEach((row) => {
        const rawId = row[tagCol] || "";
        const zoneId = extractZoneId(rawId);
        if (!zoneId) return;

        const commRp = parseNumber(row[commCol]);

        if (!updatedIdMap[zoneId]) {
          updatedIdMap[zoneId] = { commissionIdr: 0, orders: 0 };
        }
        updatedIdMap[zoneId].commissionIdr += commRp;
        updatedIdMap[zoneId].orders += 1;
      });

      const mappedId = Object.keys(updatedIdMap).map(id => ({
        zoneId: id,
        commissionIdr: updatedIdMap[id].commissionIdr,
        orders: updatedIdMap[id].orders
      }));

      setStagedId({
        filename: file.name,
        rowCount: mappedId.length,
        data: mappedId
      });
      triggerNotif(`Terpilih: "${file.name}" siap diunggah ke database.`);
    };
    reader.readAsText(file);
    if (e.target) e.target.value = "";
  };

  const submitIdCommission = async () => {
    if (!stagedId) return;
    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          filename: stagedId.filename,
          fileType: "shopee_id",
          rowCount: stagedId.rowCount,
          data: stagedId.data
        })
      });

      if (response.ok) {
        const nextFiles = await response.json();
        setUploadedFiles(nextFiles);
        triggerNotif(`Berhasil: Menyimpan ${stagedId.rowCount} data komisi Shopee ID ke database.`);
        setStagedId(null);
      } else {
        triggerNotif("Gagal menyimpan file ke database server.", "info");
      }
    } catch (err) {
      console.error(err);
      triggerNotif("Gagal menghubungi server.", "info");
    }
  };

  // Clear slot elements in the UI
  const handleClearSlot = async (slotNum: number) => {
    let typeToDel = "";
    if (slotNum === 1) typeToDel = "stats";
    else if (slotNum === 2) typeToDel = "clicks";
    else if (slotNum === 3) typeToDel = "shopee_ph";
    else if (slotNum === 4) typeToDel = "shopee_id";

    const fileToDel = uploadedFiles.find(f => f.fileType === typeToDel);
    if (!fileToDel) {
      triggerNotif("Tidak ada berkas laporan aktif di slot ini.", "info");
      return;
    }

    await handleDeleteFile(fileToDel.id, fileToDel.filename);
  };

  // Delete an individual uploaded file from database disk
  const handleDeleteFile = async (id: string, name: string) => {
    try {
      const response = await fetch(`/api/uploads/${id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${authToken}`
        }
      });
      if (response.ok) {
        const result = await response.json();
        setUploadedFiles(result.files || []);
        triggerNotif(`Laporan "${name}" berhasil dihapus dari history.`);
      } else {
        triggerNotif("Gagal memanggil fungsi hapus server.", "info");
      }
    } catch (err) {
      console.error(err);
      triggerNotif("Koneksi gagal menghubungi server.", "info");
    }
  };

  // Clear all uploaded datasets recursively
  const clearAllData = async () => {
    try {
      for (const item of uploadedFiles) {
        await fetch(`/api/uploads/${item.id}`, {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${authToken}`
          }
        });
      }
      setUploadedFiles([]);
      triggerNotif("Workspace kosong: Semua laporan di server berhasil dihapus.", "info");
    } catch (err) {
      console.warn(err);
      triggerNotif("Ada beberapa berkas tidak berhasil terhapus.", "info");
    }
  };

  const isAnyFileLoaded = uploadedFiles.length > 0;

  return (
    <div className="space-y-8 animate-fadeIn" id="upload-data-container">
      
      {/* 1. Header & Actions Area */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-colors">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Workspace Unggah Laporan
            </span>
            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              Single-User Persistent Database
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-1 tracking-tight">
            Import CSV & Konfigurasi Kurs
          </h1>
          <p className="text-xs text-slate-550 dark:text-slate-400 mt-1 leading-relaxed">
            Unggah file laporan statistik ad network dan nominal komisi Shopee Anda untuk disinkronkan langsung ke basis data permanen.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAnyFileLoaded && (
            <button
              onClick={() => setShowResetConfirmation(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 rounded-lg cursor-pointer transition-all"
              title="Clear all uploaded data"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Reset & Bersihkan Semua</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Conversion Exchange rate configuration widget */}
      <div className="bg-gradient-to-r from-slate-900 to-blue-950 text-white p-6 rounded-2xl shadow-md border border-slate-850 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-1 text-center md:text-left">
          <div className="flex items-center gap-2 justify-center md:justify-start">
            <Coins className="h-5 w-5 text-blue-400" />
            <h2 className="font-semibold text-base">Sinkronisasi Kurs Operasi</h2>
          </div>
          <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
            Konversikan nominal biaya ad spend (USD) dan komisi Shopee PH (USD) ke mata uang <strong>IDR (Rupiah)</strong> menggunakan nilai kurs real-time saat ini.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-slate-950/50 p-2 rounded-xl border border-slate-800 shrink-0 w-full md:w-auto justify-between">
          <div className="text-xs font-semibold text-slate-400 px-3 uppercase">Kurs Rp / $ :</div>
          <input
            id="usd-rate-input-upload"
            type="number"
            min="1"
            value={usdRate}
            onChange={(e) => {
              const val = parseNumber(e.target.value);
              setUsdRate(val);
              saveExchangeRate(val);
            }}
            className="w-28 bg-slate-900 border-none text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-2.5 py-1 text-center font-bold font-mono"
            placeholder="16300"
          />
        </div>
      </div>

      {/* 3. Slot Upload States Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" id="import-slots-summary">
        {[
          { label: "1. STATS REPORT", file: statsFileName, count: statsRows.length, desc: "Zones Stat", color: "text-blue-500" },
          { label: "2. CLICKS MAP", file: clicksFileName, count: Object.keys(clicksMap).length, desc: "Shortlinks Click", color: "text-emerald-500" },
          { label: "3. SHOPEE PH", file: phFileName, count: Object.keys(phConversionMap).length, desc: "PH Convs", color: "text-amber-500" },
          { label: "4. SHOPEE ID DIRECT", file: idFileName, count: Object.keys(idCommissionMap).length, desc: "ID Convs", color: "text-pink-500" },
        ].map((block, idx) => (
          <div key={idx} className="bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col justify-between shadow-xs transition-colors">
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{block.label}</div>
            <div className="mt-2.5 flex items-baseline gap-1.5">
              <span className="text-xl font-extrabold text-slate-850 dark:text-white font-mono">{block.count}</span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">{block.desc}</span>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
              <span className="truncate max-w-[70%] font-mono text-slate-400 dark:text-slate-500" title={block.file || "Belum ada file"}>
                {block.file ? block.file : "Kosong"}
              </span>
              {block.file ? (
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              ) : (
                <div className="h-1.5 w-1.5 rounded-full bg-slate-350 dark:bg-slate-700" />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Sub-tab navigation to separate CSV Upload and Manual Input */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-1 gap-1" id="import-type-subtabs">
        <button
          onClick={() => setActiveSubTab("csv")}
          className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer text-center ${
            activeSubTab === "csv"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-850"
          }`}
        >
          Unggah File CSV (Laporan)
        </button>
        <button
          onClick={() => setActiveSubTab("manual")}
          className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer text-center ${
            activeSubTab === "manual"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-850"
          }`}
        >
          Input Manual (Formulir)
        </button>
      </div>

      {activeSubTab === "csv" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="slots-upload-cards-grid">
        
        {/* Slot 1: Stats ad expenditure report */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm transition-colors flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-blue-50 dark:bg-slate-800 text-blue-700 dark:text-blue-400 rounded-md">
                Slot 1 - Biaya Iklan
              </span>
              {statsRows.length > 0 && <CheckCircle className="h-4 w-4 text-emerald-500" />}
            </div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-3 uppercase">1. STATS REPORT (AD SPEND)</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Laporan biasan impresi dsp ad network: <span className="font-mono text-blue-500 dark:text-blue-400 bg-slate-50 dark:bg-slate-950/40 px-1 py-0.5 rounded">Zone ID, Impressions, Clicks, Cost (USD)</span>.
            </p>
 
            <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-950/30 rounded-xl border border-slate-150 dark:border-slate-850/60 flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-slate-450 dark:text-slate-400 uppercase">DSP Plat:</span>
              <select
                id="platform-selection-opt"
                value={uploadPlatform}
                onChange={(e) => setUploadPlatform(e.target.value)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2.5 py-1 text-xs text-slate-700 dark:text-slate-350 font-bold focus:outline-none"
              >
                <option value="PropellerAds">PropellerAds</option>
                <option value="Clickadu">Clickadu</option>
                <option value="GalaksionAds">GalaksionAds</option>
                <option value="HilltopAds">HilltopAds</option>
                <option value="OtherDSP">Other DSP</option>
              </select>
            </div>
          </div>
 
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">

            {stagedStats ? (
              <div className="space-y-3">
                <div className="p-3 bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/30 rounded-xl flex items-center justify-between">
                  <div className="truncate max-w-[80%] space-y-0.5">
                    <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400 font-mono truncate">{stagedStats.filename}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{stagedStats.rowCount} baris terbaca</p>
                  </div>
                  <button
                    onClick={() => setStagedStats(null)}
                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-slate-655 text-sm font-bold cursor-pointer"
                    title="Batal"
                  >
                    ×
                  </button>
                </div>
                <button
                  id="submit-stats-btn"
                  onClick={submitStats}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition-all"
                >
                  <Database className="h-3.5 w-3.5" />
                  <span>Upload ke Database</span>
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="file"
                  ref={fileInputStats}
                  accept=".csv"
                  onChange={handleStatsUpload}
                  className="hidden"
                />
                <button
                  id="upload-stats-trigger"
                  onClick={() => fileInputStats.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 border border-dashed border-slate-300 dark:border-slate-750 hover:border-blue-500 dark:hover:border-blue-400 rounded-xl text-xs font-semibold text-slate-650 dark:text-slate-400 hover:text-blue-650 dark:hover:text-blue-400 bg-slate-50 dark:bg-slate-950/20 cursor-pointer transition-all"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Pilih File CSV Baru</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Slot 2: External tracker clicks report */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm transition-colors flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 rounded-md">
                Slot 2 - Klik Tracker
              </span>
              {Object.keys(clicksMap).length > 0 && <CheckCircle className="h-4 w-4 text-emerald-500" />}
            </div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-3 uppercase">2. WEBSITE CLICKS REPORT (TRACKER)</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Laporan kecocokan klik tracker pelacak: <span className="font-mono text-blue-500 dark:text-blue-400 bg-slate-50 dark:bg-slate-950/40 px-1 py-0.5 rounded">Tag_link</span> (e.g. "2092100----"). Digunakan mengukur rasio CTR murni.
            </p>
          </div>
 
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">

            {stagedClicks ? (
              <div className="space-y-3">
                <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900/30 rounded-xl flex items-center justify-between">
                  <div className="truncate max-w-[80%] space-y-0.5">
                    <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 font-mono truncate">{stagedClicks.filename}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{stagedClicks.rowCount} zone dicocokkan</p>
                  </div>
                  <button
                    onClick={() => setStagedClicks(null)}
                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-slate-655 text-sm font-bold cursor-pointer"
                    title="Batal"
                  >
                    ×
                  </button>
                </div>
                <button
                  id="submit-clicks-btn"
                  onClick={submitWebsiteClicks}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition-all"
                >
                  <Database className="h-3.5 w-3.5" />
                  <span>Upload ke Database</span>
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="file"
                  ref={fileInputClicks}
                  accept=".csv"
                  onChange={handleWebsiteClicksUpload}
                  className="hidden"
                />
                <button
                  id="upload-clicks-trigger"
                  onClick={() => fileInputClicks.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 border border-dashed border-slate-300 dark:border-slate-750 hover:border-blue-500 dark:hover:border-blue-400 rounded-xl text-xs font-semibold text-slate-650 dark:text-slate-400 hover:text-blue-650 dark:hover:text-blue-400 bg-slate-50 dark:bg-slate-950/20 cursor-pointer transition-all"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Pilih File CSV Baru</span>
                </button>
              </div>
            )}
          </div>
        </div>
 
        {/* Slot 3: Shopee PH Conversions (Involve Asia) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm transition-colors flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 rounded-md">
                Slot 3 - Filipina (PH)
              </span>
              {Object.keys(phConversionMap).length > 0 && <CheckCircle className="h-4 w-4 text-emerald-500" />}
            </div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-3 uppercase">3. SHOPEE PH COMMISSION (EST USD)</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
               Laporan konversi Shopee PH: <span className="font-mono text-blue-500 dark:text-blue-400 bg-slate-50 dark:bg-slate-950/40 px-1 py-0.5 rounded">Publisher Sub ID 1, Estimated Earnings (USD)</span>.
            </p>
          </div>
 
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">

            {stagedPh ? (
              <div className="space-y-3">
                <div className="p-3 bg-amber-50/50 dark:bg-amber-950/10 border border-amber-100 dark:border-amber-900/30 rounded-xl flex items-center justify-between">
                  <div className="truncate max-w-[80%] space-y-0.5">
                    <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 font-mono truncate">{stagedPh.filename}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{stagedPh.rowCount} baris terbaca</p>
                  </div>
                  <button
                    onClick={() => setStagedPh(null)}
                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-slate-655 text-sm font-bold cursor-pointer"
                    title="Batal"
                  >
                    ×
                  </button>
                </div>
                <button
                  id="submit-ph-btn"
                  onClick={submitPhConversion}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition-all"
                >
                  <Database className="h-3.5 w-3.5" />
                  <span>Upload ke Database</span>
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="file"
                  ref={fileInputPh}
                  accept=".csv"
                  onChange={handlePhConversionUpload}
                  className="hidden"
                />
                <button
                  id="upload-ph-trigger"
                  onClick={() => fileInputPh.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 border border-dashed border-slate-300 dark:border-slate-750 hover:border-blue-500 dark:hover:border-blue-400 rounded-xl text-xs font-semibold text-slate-650 dark:text-slate-400 hover:text-blue-650 dark:hover:text-blue-400 bg-slate-50 dark:bg-slate-950/20 cursor-pointer transition-all"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Pilih File CSV Baru</span>
                </button>
              </div>
            )}
          </div>
        </div>
 
        {/* Slot 4: Shopee ID Direct Rp Commissions */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm transition-colors flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-pink-50 dark:bg-pink-950 text-pink-700 dark:text-pink-400 rounded-md">
                Slot 4 - Indonesia (ID)
              </span>
              {Object.keys(idCommissionMap).length > 0 && <CheckCircle className="h-4 w-4 text-emerald-500" />}
            </div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-3 uppercase">4. SHOPEE ID COMMISSION (DIRECT IDR)</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Laporan komisi langsung IDR Shopee Indonesia. Memetakan <span className="font-mono text-blue-500 dark:text-blue-400 bg-slate-50 dark:bg-slate-950/40 px-1 py-0.5 rounded">Tag_link1, Komisi Shopee per Pesanan(Rp)</span> secara langsung.
            </p>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">

            {stagedId ? (
              <div className="space-y-3">
                <div className="p-3 bg-pink-50/50 dark:bg-pink-950/10 border border-pink-100 dark:border-pink-900/30 rounded-xl flex items-center justify-between">
                  <div className="truncate max-w-[80%] space-y-0.5">
                    <p className="text-[11px] font-bold text-pink-600 dark:text-pink-400 font-mono truncate">{stagedId.filename}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{stagedId.rowCount} baris terbaca</p>
                  </div>
                  <button
                    onClick={() => setStagedId(null)}
                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-slate-655 text-sm font-bold cursor-pointer"
                    title="Batal"
                  >
                    ×
                  </button>
                </div>
                <button
                  id="submit-id-btn"
                  onClick={submitIdCommission}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition-all"
                >
                  <Database className="h-3.5 w-3.5" />
                  <span>Upload ke Database</span>
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="file"
                  ref={fileInputId}
                  accept=".csv"
                  onChange={handleIdCommissionUpload}
                  className="hidden"
                />
                <button
                  id="upload-id-trigger"
                  onClick={() => fileInputId.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 border border-dashed border-slate-300 dark:border-slate-750 hover:border-blue-500 dark:hover:border-blue-400 rounded-xl text-xs font-semibold text-slate-650 dark:text-slate-400 hover:text-blue-650 dark:hover:text-blue-400 bg-slate-50 dark:bg-slate-950/20 cursor-pointer transition-all"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Pilih File CSV Baru</span>
                </button>
              </div>
            )}
          </div>
        </div>
 
      </div>
      )}

      {/* Manual Input Form */}
      {activeSubTab === "manual" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm transition-all" id="manual-data-entry-form">
        <div className="flex items-center gap-2 pb-4 mb-5 border-b border-slate-100 dark:border-slate-800/80">
          <Sparkles className="h-5 w-5 text-blue-500 animate-pulse shrink-0" />
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-tight">Formulir Input Data Zone Manual</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Gunakan form di bawah ini untuk menginput, memperbarui, atau menyunting metrik zone ID secara langsung tanpa harus membuat file CSV.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveManual} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            
            <div className="space-y-1.5">
              <label className="block text-slate-500 dark:text-slate-450 font-bold uppercase tracking-wider">ID Zone / Tag Link*</label>
              <input
                type="text"
                required
                value={manualZoneId}
                onChange={(e) => setManualZoneId(e.target.value)}
                placeholder="Contoh: 10993873"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-550 dark:focus:border-blue-400 focus:outline-none rounded-xl px-3 py-2 font-mono text-slate-900 dark:text-white font-bold"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-slate-500 dark:text-slate-450 font-bold uppercase tracking-wider">DSP Ad Network Platform</label>
              <select
                value={manualPlatform}
                onChange={(e) => setManualPlatform(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none rounded-xl px-3 py-2 text-slate-700 dark:text-slate-350 font-bold"
              >
                <option value="PropellerAds">PropellerAds</option>
                <option value="Clickadu">Clickadu</option>
                <option value="GalaksionAds">GalaksionAds</option>
                <option value="HilltopAds">HilltopAds</option>
                <option value="OtherDSP">Other DSP</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-slate-500 dark:text-slate-450 font-bold uppercase tracking-wider">Target Market Sasar</label>
              <select
                value={manualMarket}
                onChange={(e) => setManualMarket(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none rounded-xl px-3 py-2 text-slate-700 dark:text-slate-350 font-bold"
              >
                <option value="id">Indonesia (ID - Shopee Rp)</option>
                <option value="ph">Philippines (PH - Shopee $)</option>
                <option value="both">Both (ID + PH)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-slate-500 dark:text-slate-450 font-bold uppercase tracking-wider">Impresi (Impressions)</label>
              <input
                type="number"
                min="0"
                value={manualImpressions}
                onChange={(e) => setManualImpressions(e.target.value)}
                placeholder="Contoh: 150000"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none rounded-xl px-3 py-2 font-mono text-slate-900 dark:text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-slate-500 dark:text-slate-450 font-bold uppercase tracking-wider">Klik Tracker Website</label>
              <input
                type="number"
                min="0"
                value={manualClicks}
                onChange={(e) => setManualClicks(e.target.value)}
                placeholder="Contoh: 320"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none rounded-xl px-3 py-2 font-mono text-slate-900 dark:text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-slate-500 dark:text-slate-450 font-bold uppercase tracking-wider">Ad Spend / Cost (USD)</label>
              <input
                type="number"
                step="any"
                min="0"
                value={manualCostUsd}
                onChange={(e) => setManualCostUsd(e.target.value)}
                placeholder="Contoh: 24.50"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none rounded-xl px-3 py-2 font-mono text-slate-900 dark:text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-slate-500 dark:text-slate-450 font-bold uppercase tracking-wider">Komisi Bersih Shopee ID (Rp)</label>
              <input
                type="number"
                step="any"
                min="0"
                value={manualCommissionIdr}
                onChange={(e) => setManualCommissionIdr(e.target.value)}
                placeholder="Contoh: 280000"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none rounded-xl px-3 py-2 font-mono text-slate-900 dark:text-white font-bold"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-slate-500 dark:text-slate-450 font-bold uppercase tracking-wider">Komisi Shopee PH (USD $)</label>
              <input
                type="number"
                step="any"
                min="0"
                value={manualCommissionUsd}
                onChange={(e) => setManualCommissionUsd(e.target.value)}
                placeholder="Contoh: 18.2"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none rounded-xl px-3 py-2 font-mono text-slate-900 dark:text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-slate-500 dark:text-slate-450 font-bold uppercase tracking-wider">Jumlah Orders / Konversi</label>
              <input
                type="number"
                min="0"
                value={manualOrders}
                onChange={(e) => setManualOrders(e.target.value)}
                placeholder="Default: 1"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none rounded-xl px-3 py-2 font-mono text-slate-900 dark:text-white"
              />
            </div>

          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSavingManual}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-xl shadow-md cursor-pointer transition-all"
            >
              <Database className="h-4 w-4" />
              <span>{isSavingManual ? "Menyimpan data..." : "Simpan Data Manual ke Database"}</span>
            </button>
          </div>
        </form>
      </div>
      )}

      {/* 5. TABLE: Riwayat Unggahan Laporan / File History registry */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm transition-all overflow-hidden" id="file-history-timeline-section">
        <div className="p-5 border-b border-slate-150 dark:border-slate-800 flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white uppercase flex items-center gap-2 tracking-tight">
              <Database className="h-4.5 w-4.5 text-blue-500" />
              <span>Riwayat Unggahan Laporan (Database History)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Laporan terdaftar yang tersimpan permanen di penyimpanan aman. Hapus berkas di sini untuk membersihkan dari hasil konsolidasi.
            </p>
          </div>
          <span className="px-2.5 py-0.5 bg-blue-50 dark:bg-slate-800 text-blue-700 dark:text-blue-400 text-[10px] font-bold rounded-full font-mono uppercase shrink-0">
            {uploadedFiles.length} Berkas Aktif
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="px-6 py-3 font-semibold text-slate-500 uppercase tracking-wider">Nama Laporan</th>
                <th className="px-6 py-3 font-semibold text-slate-500 uppercase tracking-wider">Kategori Data</th>
                <th className="px-6 py-3 font-semibold text-slate-500 uppercase tracking-wider">Kapasitas</th>
                <th className="px-6 py-3 font-semibold text-slate-500 uppercase tracking-wider">Waktu Terdaftarkan</th>
                <th className="px-6 py-3 font-semibold text-slate-500 uppercase tracking-wider text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {uploadedFiles.length > 0 ? (
                uploadedFiles.map((file) => {
                  let badgeColor = "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300";
                  let categoryLabel = "Biaya Iklan (Stats)";
                  if (file.fileType === "clicks") {
                    badgeColor = "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300";
                    categoryLabel = "Klik Website Tracker";
                  } else if (file.fileType === "shopee_ph") {
                    badgeColor = "bg-amber-50 dark:bg-amber-955/40 text-amber-700 dark:text-amber-350";
                    categoryLabel = "Shopee Filipina (PH)";
                  } else if (file.fileType === "shopee_id") {
                    badgeColor = "bg-pink-50 dark:bg-pink-955/40 text-pink-700 dark:text-pink-350";
                    categoryLabel = "Shopee Indonesia (ID)";
                  } else if (file.fileType === "manual") {
                    badgeColor = "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300";
                    categoryLabel = "Input Manual (Formulir)";
                  }

                  return (
                    <tr
                      id={`file-row-${file.id}`}
                      key={file.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all text-slate-650 dark:text-slate-305 font-medium"
                    >
                      <td className="px-6 py-3.5 flex items-center gap-2 max-w-sm truncate text-slate-900 dark:text-white font-bold">
                        <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                        <span className="truncate font-mono tracking-tight" title={file.filename}>
                          {file.filename}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${badgeColor}`}>
                          {categoryLabel}
                        </span>
                        {file.fileType === "stats" && file.platform && (
                          <span className="ml-1 text-[10px] text-slate-400 font-bold font-mono">
                            [{file.platform}]
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 font-mono text-slate-500">
                        {file.rowCount} baris valid
                      </td>
                      <td className="px-6 py-3.5 text-slate-400 font-mono">
                        {new Date(file.uploadedAt).toLocaleString("id-ID", {
                          hour12: false,
                          dateStyle: "medium",
                          timeStyle: "short"
                        })}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <button
                          onClick={() => handleDeleteFile(file.id, file.filename)}
                          className="p-1 px-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:text-rose-700 border border-rose-250 dark:border-rose-900/40 rounded-lg cursor-pointer text-[11px] font-bold inline-flex items-center gap-1 transition-all"
                          title="Hapus berkas ini dari database"
                        >
                          <Trash2 className="h-3 w-3 shrink-0" />
                          <span>Hapus</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500 font-semibold font-mono">
                    Belum ada riwayat berkas digital yang disimpan permanen di server database disk.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation modal for resetting all workspace data */}
      {showResetConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-xl space-y-4">
            <div className="text-center space-y-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-tight">Kosongkan Semua Data</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Apakah Anda yakin ingin menghapus semua laporan dan mereset total konsolidasi secara permanen? Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowResetConfirmation(false)}
                className="flex-1 py-2 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-350 text-xs font-bold rounded-xl cursor-pointer transition-all"
              >
                Batal
              </button>
              <button
                onClick={async () => {
                  try {
                    await clearAllData();
                  } finally {
                    setShowResetConfirmation(false);
                  }
                }}
                className="flex-1 py-2 px-4 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl cursor-pointer transition-all shadow-xs"
              >
                Ya, Bersihkan!
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
