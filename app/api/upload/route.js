/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { prisma } from "../../lib/prisma";

const SESSION_TOKEN = "session-auth-token-web-consolidator-123";

// Helper for authentication check
function checkAuth(req) {
  const authHeader = req.headers.get("authorization");
  const cookieSession = req.cookies.get("admin_session")?.value;
  
  if (authHeader === `Bearer ${SESSION_TOKEN}` || cookieSession === SESSION_TOKEN) {
    return true;
  }
  return false;
}

export async function POST(req) {
  try {
    if (!checkAuth(req)) {
      return NextResponse.json({ error: "Unauthorized session access." }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const platformParam = formData.get("platform") || "PropellerAds";

    if (!file) {
      return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
    }

    const csvText = await file.text();
    
    // Parse the CSV
    let records;
    try {
      records = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (parseErr) {
      return NextResponse.json({ error: "Failed to parse CSV syntax: " + parseErr.message }, { status: 400 });
    }

    if (!records || records.length === 0) {
      return NextResponse.json({ error: "CSV file is empty." }, { status: 400 });
    }

    // Auto-detect file type based on headers
    const firstRow = records[0];
    const headers = Object.keys(firstRow);
    const normalizedHeaders = headers.map(h => h.toLowerCase().replace(/[\s_-]/g, ""));

    let fileType = "";
    
    // Detect Shopee PH / Publisher Report
    const hasPublisherSubId = normalizedHeaders.some(h => h.includes("publishersubid1") || h.includes("pubsub") || h.includes("subid1") || h.includes("sub1"));
    const hasEstEarnings = normalizedHeaders.some(h => h.includes("estimatedearnings") || h.includes("earnings") || h.includes("earn"));
    
    // Detect Shopee ID / Affiliate Report
    const hasTagLink1 = normalizedHeaders.some(h => h.includes("taglink1") || h.includes("tag1"));
    const hasTotalKomisi = normalizedHeaders.some(h => h.includes("totalkomisi") || h.includes("komisi") || h.includes("commission") || h.includes("rp"));

    // Detect Website Clicks
    const hasTagLink = normalizedHeaders.some(h => h === "taglink" || h.includes("taglink") || h === "tag");
    const hasClickCount = normalizedHeaders.some(h => h === "click" || h.includes("click") || h === "count" || h.includes("count"));

    if (hasPublisherSubId || (hasEstEarnings && !hasTotalKomisi)) {
      fileType = "shopee_ph";
    } else if (hasTagLink1 || hasTotalKomisi) {
      fileType = "shopee_id";
    } else if (hasTagLink && !hasTotalKomisi && !hasEstEarnings) {
      fileType = "website_clicks";
    } else {
      // Default fallback is Stats report
      fileType = "stats";
    }

    let processedCount = 0;

    if (fileType === "stats") {
      // Find columns
      let zoneCol = headers.find(h => {
        const lower = h.toLowerCase().replace(/[\s_-]/g, "");
        return lower.includes("zoneid") || lower === "zone" || lower === "tagid" || lower === "id";
      }) || headers[0];

      let impCol = headers.find(h => h.toLowerCase().includes("impression") || h.toLowerCase() === "imp" || h.toLowerCase() === "imps") || "";
      let clickCol = headers.find(h => h.toLowerCase().includes("click") || h.toLowerCase() === "clk" || h.toLowerCase() === "clks") || "";
      let costCol = headers.find(h => h.toLowerCase().includes("cost") || h.toLowerCase().includes("spend") || h.toLowerCase() === "cst") || "";

      for (const row of records) {
        const rawZone = row[zoneCol] || "";
        const zoneMatch = rawZone.match(/^(\d+)/);
        if (!zoneMatch) continue;
        const zoneId = zoneMatch[1];

        const impressions = parseInt(row[impCol]) || 0;
        const clicks = parseInt(row[clickCol]) || 0;
        const costVal = parseFloat(row[costCol] ? row[costCol].replace(/[^0-9.]/g, "") : "0") || 0.0;

        await prisma.zoneReport.upsert({
          where: { zoneId },
          update: {
            impressions,
            statsClicks: clicks,
            costUsd: costVal,
            platformTag: platformParam,
          },
          create: {
            zoneId,
            impressions,
            statsClicks: clicks,
            costUsd: costVal,
            platformTag: platformParam,
            marketTag: "unmatched",
          },
        });
        processedCount++;
      }

    } else if (fileType === "website_clicks") {
      // Group in-memory for performance
      let tagCol = headers.find(h => h.toLowerCase().replace(/[\s_-]/g, "").includes("taglink")) || headers[0];
      let clickNumCol = headers.find(h => h.toLowerCase().replace(/[\s_-]/g, "").includes("click") || h.toLowerCase().includes("count")) || "";

      const clickAggregation = {};

      for (const row of records) {
        const tagVal = row[tagCol] || "";
        const match = tagVal.match(/^(\d+)/);
        if (!match) continue;
        const zoneId = match[1];

        const clicksCount = clickNumCol ? (parseInt(row[clickNumCol]) || 1) : 1;
        clickAggregation[zoneId] = (clickAggregation[zoneId] || 0) + clicksCount;
      }

      for (const [zoneId, trackerClicks] of Object.entries(clickAggregation)) {
        await prisma.zoneReport.upsert({
          where: { zoneId },
          update: {
            trackerClicks,
          },
          create: {
            zoneId,
            trackerClicks,
            platformTag: platformParam,
            marketTag: "unmatched",
          },
        });
        processedCount++;
      }

    } else if (fileType === "shopee_ph") {
      // Shopee PH (Publisher Report)
      let subIdCol = headers.find(h => {
        const norm = h.toLowerCase().replace(/[\s_-]/g, "");
        return norm.includes("pubsub") || norm.includes("publishersubid1") || norm.includes("subid1") || norm.includes("sub1");
      }) || headers[0];

      let earningsCol = headers.find(h => {
        const norm = h.toLowerCase().replace(/[\s_-]/g, "");
        return norm.includes("estimatedearnings") || norm.includes("earnings") || norm.includes("earn");
      }) || "";

      const phAggregation = {};

      for (const row of records) {
        const subIdVal = row[subIdCol] || "";
        const match = subIdVal.match(/^(\d+)/);
        if (!match) continue;
        const zoneId = match[1];

        const earnText = row[earningsCol] ? row[earningsCol].replace(/[^0-9.]/g, "") : "0";
        const earnings = parseFloat(earnText) || 0.0;
        phAggregation[zoneId] = (phAggregation[zoneId] || 0.0) + earnings;
      }

      for (const [zoneId, commissionUsd] of Object.entries(phAggregation)) {
        const existing = await prisma.zoneReport.findUnique({ where: { zoneId } });
        let newMarketTag = "ph";
        if (existing && existing.marketTag && existing.marketTag.includes("id")) {
          newMarketTag = "id + ph";
        }

        await prisma.zoneReport.upsert({
          where: { zoneId },
          update: {
            commissionUsd,
            marketTag: newMarketTag,
          },
          create: {
            zoneId,
            commissionUsd,
            platformTag: platformParam,
            marketTag: "ph",
          },
        });
        processedCount++;
      }

    } else if (fileType === "shopee_id") {
      // Shopee ID (Direct Affiliate report in IDR)
      let tagCol = headers.find(h => {
        const norm = h.toLowerCase().replace(/[\s_-]/g, "");
        return norm.includes("taglink1") || norm.includes("tag1") || norm.includes("taglink");
      }) || headers[0];

      let commCol = headers.find(h => {
        const norm = h.toLowerCase().replace(/[\s_-]/g, "");
        return norm.includes("totalkomisi") || norm.includes("komisi") || norm.includes("commission") || norm.includes("rp");
      }) || "";

      const idAggregation = {};

      for (const row of records) {
        const tagLinkVal = row[tagCol] || "";
        const match = tagLinkVal.match(/^(\d+)/);
        if (!match) continue;
        const zoneId = match[1];

        const commText = row[commCol] ? row[commCol].replace(/[^0-9.]/g, "") : "0";
        const commValue = parseFloat(commText) || 0;

        idAggregation[zoneId] = (idAggregation[zoneId] || 0) + commValue;
      }

      for (const [zoneId, commissionIdr] of Object.entries(idAggregation)) {
        const existing = await prisma.zoneReport.findUnique({ where: { zoneId } });
        let newMarketTag = "id";
        if (existing && existing.marketTag && existing.marketTag.includes("ph")) {
          newMarketTag = "id + ph";
        }

        await prisma.zoneReport.upsert({
          where: { zoneId },
          update: {
            commissionIdr,
            marketTag: newMarketTag,
          },
          create: {
            zoneId,
            commissionIdr,
            platformTag: platformParam,
            marketTag: "id",
          },
        });
        processedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      fileType,
      processedCount,
      message: `Successfully processed ${processedCount} rows of file type: ${fileType.toUpperCase()}`,
    });

  } catch (err) {
    console.error("CSV Upload endpoint error:", err);
    return NextResponse.json(
      { error: "Internal server error reading csv upload package: " + err.message },
      { status: 500 }
    );
  }
}
