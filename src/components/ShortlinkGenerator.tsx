/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Link2, ArrowRight, Copy, Check, ExternalLink, RefreshCw, Calendar, Trash2 } from "lucide-react";
import { Shortlink } from "../types";

interface ShortlinkGeneratorProps {
  authToken: string;
}

export default function ShortlinkGenerator({ authToken }: ShortlinkGeneratorProps) {
  const [baseId, setBaseId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [platform, setPlatform] = useState("PropellerAds");
  const [market, setMarket] = useState("id");
  
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recentLinks, setRecentLinks] = useState<Shortlink[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Fetch recent links on load
  const fetchRecentLinks = async () => {
    setLoadingHistory(true);
    try {
      const response = await fetch("/api/shortlinks", {
        headers: {
          "Authorization": `Bearer ${authToken}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setRecentLinks(data);
      }
    } catch (err) {
      console.error("Error loading shortlinks history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchRecentLinks();
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCopied(false);

    if (!baseId.trim()) {
      setError("Please key in a valid base affiliate destination URL.");
      return;
    }

    // Validate if base URL begins with http/https
    if (!/^https?:\/\//i.test(baseId.trim())) {
      setError("Base affiliate link must present correct network schemes (http:// or https://).");
      return;
    }

    const cleanZoneId = zoneId.trim() || "Global";
    const appOrigin = window.location.origin;
    
    // Construct shortlink format: E.g., http://host/r?url=base_url&sub1=zoneid&sub2=platform
    const queryParams = new URLSearchParams({
      url: baseId.trim(),
      sub1: cleanZoneId,
      sub2: platform,
      market: market,
    });
    
    const targetShortlink = `${appOrigin}/r?${queryParams.toString()}`;
    setGeneratedLink(targetShortlink);

    // Save to server persistence database
    try {
      const response = await fetch("/api/shortlinks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          originalUrl: baseId.trim(),
          zoneId: cleanZoneId,
          platform: platform,
          market: market,
          shortlink: targetShortlink,
        }),
      });

      if (response.ok) {
        const newRecord = await response.json();
        setRecentLinks(prev => [newRecord, ...prev]);
        // Trigger quick feedback
        setBaseId("");
        setZoneId("");
      } else {
        const errData = await response.json();
        setError(errData.error || "Persistence failed.");
      }
    } catch (err) {
      console.warn("Saving trace failed, but generated shortlink locally:", err);
    }
  };

  const copyToClipboard = async (linkText: string) => {
    try {
      await navigator.clipboard.writeText(linkText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Clipboard copy failed:", err);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn" id="shortlink-generator-page">
      
      {/* Intro Banner */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">Shortlink Generator</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Craft redirect tracking links pre-tagged with custom Zone ID & ad networks to audit downstream click-attribution logs correctly.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column - Creator Form */}
        <div className="lg:col-span-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm transition-all h-fit">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-6 border-b border-slate-100 dark:border-slate-800 pb-3">
            <Link2 className="h-5 w-5 text-blue-500" />
            <span>Generate Trackable link</span>
          </h2>

          {error && (
            <div id="generator-error" className="mb-4 p-3.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-600 dark:text-rose-400 rounded-xl leading-relaxed">
              {error}
            </div>
          )}

          <form onSubmit={handleGenerate} className="space-y-5">
            {/* Base URL */}
            <div className="space-y-1.5">
              <label htmlFor="base-affiliate-input" className="text-xs font-semibold text-slate-500 uppercase">
                Base Affiliate URL *
              </label>
              <input
                id="base-affiliate-input"
                type="text"
                required
                value={baseId}
                onChange={(e) => setBaseId(e.target.value)}
                placeholder="https://shopee.co.id/product/..."
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-850 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Zone ID input */}
            <div className="space-y-1.5">
              <label htmlFor="zone-id-tag-input" className="text-xs font-semibold text-slate-500 uppercase">
                Zone ID *
              </label>
              <input
                id="zone-id-tag-input"
                type="text"
                required
                value={zoneId}
                onChange={(e) => setZoneId(e.target.value)}
                placeholder="e.g. 2092100"
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-850 rounded-xl text-sm text-slate-850 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-[10px] text-slate-400 block font-sans">
                Corresponds to sub1 parameter in URL redirector.
              </span>
            </div>

            {/* Platform Selection */}
            <div className="space-y-1.5">
              <label htmlFor="platform-generator-select" className="text-xs font-semibold text-slate-500 uppercase">
                Ad platform Source
              </label>
              <select
                id="platform-generator-select"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-850 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-250 text-sm focus:outline-none"
              >
                <option value="PropellerAds">PropellerAds</option>
                <option value="Clickadu">Clickadu</option>
                <option value="GalaksionAds">GalaksionAds</option>
                <option value="Direct">Direct / Search Traffic</option>
              </select>
            </div>

            {/* Market Selection */}
            <div className="space-y-1.5">
              <label htmlFor="market-generator-select" className="text-xs font-semibold text-slate-500 uppercase">
                Shopee Market Tag
              </label>
              <select
                id="market-generator-select"
                value={market}
                onChange={(e) => setMarket(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-850 rounded-xl px-3 py-2.5 text-slate-700 dark:text-slate-250 text-sm focus:outline-none"
              >
                <option value="id">Shopee ID [id]</option>
                <option value="ph">Shopee PH [ph]</option>
              </select>
            </div>

            <button
              id="generate-link-btn"
              type="submit"
              className="w-full font-semibold py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow cursor-pointer transition-all flex items-center justify-center gap-1.5 text-sm"
            >
              <span>Compile Shortlink</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Form Output Area */}
          {generatedLink && (
            <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-950 border border-slate-255 dark:border-slate-855 rounded-xl space-y-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Active tracking target</span>
              <div className="text-xs break-all text-slate-600 dark:text-slate-300 font-mono select-all select-none p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800">
                {generatedLink}
              </div>

              <div className="flex gap-2">
                <button
                  id="copy-link-btn"
                  onClick={() => copyToClipboard(generatedLink)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100/85 text-xs font-bold text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900/50 rounded-lg cursor-pointer transition-all"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? "Copied!" : "Copy"}</span>
                </button>
                <a
                  id="preview-link-btn"
                  href={generatedLink}
                  target="_blank"
                  rel="noreferrer referrer"
                  className="flex items-center justify-center p-1.5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer"
                  title="Test redirect link"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Directory and Recent items */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm transition-all">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-500" />
              <span>Recent shortlink parameters log</span>
            </h2>
            <button
              id="refresh-history-btn"
              onClick={fetchRecentLinks}
              disabled={loadingHistory}
              className="p-2 text-slate-400 hover:text-blue-500 rounded-lg bg-slate-50 dark:bg-slate-850 hover:bg-slate-100 cursor-pointer text-xs"
              title="Refresh tracking parameters logs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingHistory ? "animate-spin text-blue-500" : ""}`} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" id="shortlinks-history-table">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-400 uppercase">
                  <th className="py-3 px-3">Zone ID</th>
                  <th className="py-3 px-3">Network</th>
                  <th className="py-3 px-3">Market</th>
                  <th className="py-3 px-3">Short Redirect Target</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 dark:divide-slate-800/60 font-mono text-xs text-slate-600 dark:text-slate-300">
                {recentLinks.length > 0 ? (
                  recentLinks.map((link) => (
                    <tr id={`link-row-${link.id}`} key={link.id} className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition-colors">
                      <td className="py-3 px-3 font-bold text-slate-800 dark:text-white">
                        {link.zoneId}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 font-bold text-[10px] rounded text-slate-600 dark:text-slate-400 uppercase">
                          {link.platform}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-blue-600 dark:text-blue-400 font-bold uppercase">
                        {link.market}
                      </td>
                      <td className="py-3 px-3 truncate max-w-xs" title={link.shortlink}>
                        <span className="text-blue-500 hover:underline cursor-pointer break-all text-xs" onClick={() => copyToClipboard(link.shortlink)}>
                          {link.shortlink}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            id={`copy-recent-${link.id}`}
                            onClick={() => copyToClipboard(link.shortlink)}
                            className="p-1 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-slate-400 hover:text-blue-500 rounded cursor-pointer"
                            title="Copy shortlink parameter alignment tracker"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <a
                            id={`test-recent-${link.id}`}
                            href={link.shortlink}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-slate-400 hover:text-blue-500 rounded cursor-pointer"
                            title="Launch link redirect live test"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      {loadingHistory ? "Processing tracking history..." : "No trackable links stored in system logs yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
