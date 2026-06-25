/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const minCtr = parseFloat(searchParams.get("minCtr")) || 0;
    const maxCtr = parseFloat(searchParams.get("maxCtr")) || 100;
    const platformTag = searchParams.get("platformTag") || "ALL";
    const marketTag = searchParams.get("marketTag") || "ALL";
    const page = parseInt(searchParams.get("page")) || 1;
    const limit = parseInt(searchParams.get("limit")) || 10;
    const search = searchParams.get("search") || "";

    // Load physical conversion config from Database
    let exchangeRate = 16300.0;
    try {
      const setting = await prisma.globalSetting.findUnique({
        where: { id: "default" },
      });
      if (setting) {
        exchangeRate = setting.exchangeRate;
      }
    } catch (confErr) {
      console.warn("Prisma reading setting config failed:", confErr.message);
    }

    // Query all rows
    let rawReports = [];
    try {
       rawReports = await prisma.zoneReport.findMany();
    } catch (dbErr) {
       console.error("Prisma loading zoneReports failed:", dbErr.message);
       return NextResponse.json({
         data: [],
         pagination: { totalItems: 0, totalPages: 1, currentPage: 1, limit },
         summary: { totalCostUsd: 0, totalCostIdr: 0, totalCommissionIdr: 0, totalProfitIdr: 0, totalClicks: 0, totalImpressions: 0, avgCtr: 0 },
         exchangeRate,
         warning: "Database is unmigrated or unavailable. Run prisma migrate."
       });
    }

    // Perform calculated transformations
    let reports = rawReports.map((row) => {
      const clicks = row.trackerClicks > 0 ? row.trackerClicks : row.statsClicks;
      const impressions = row.impressions;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0.0;

      const costUsd = row.costUsd;
      const konversiCostRp = costUsd * exchangeRate;
      const komisiRp = row.commissionIdr + (row.commissionUsd * exchangeRate);
      const profitRp = komisiRp - konversiCostRp;

      return {
        zoneId: row.zoneId,
        clicks,
        impressions,
        ctr,
        costUsd,
        konversiCostRp,
        komisiRp,
        profitRp,
        platform: row.platformTag,
        market: row.marketTag,
        updatedAt: row.updatedAt,
      };
    });

    // Apply search filter
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      reports = reports.filter(r => r.zoneId.toLowerCase().includes(q));
    }

    // Apply Platform Filters
    if (platformTag !== "ALL") {
      reports = reports.filter(
        (r) => r.platform.toLowerCase() === platformTag.toLowerCase()
      );
    }

    // Apply Market Filters
    if (marketTag !== "ALL") {
      reports = reports.filter((r) => {
        if (!r.market) return false;
        const normMarket = r.market.toLowerCase();
        if (marketTag === "id") {
          return normMarket.includes("id") && !normMarket.includes("ph");
        }
        if (marketTag === "ph") {
          return normMarket.includes("ph") && !normMarket.includes("id");
        }
        if (marketTag === "both") {
          return normMarket.includes("id") && normMarket.includes("ph");
        }
        return normMarket.includes(marketTag.toLowerCase());
      });
    }

    // Apply CTR filters
    reports = reports.filter((r) => r.ctr >= minCtr && r.ctr <= maxCtr);

    // Compute aggregate summary of the filtered set
    let totalCostUsd = 0;
    let totalCostIdr = 0;
    let totalCommissionIdr = 0;
    let totalClicks = 0;
    let totalImpressions = 0;

    reports.forEach((r) => {
      totalCostUsd += r.costUsd;
      totalCostIdr += r.konversiCostRp;
      totalCommissionIdr += r.komisiRp;
      totalClicks += r.clicks;
      totalImpressions += r.impressions;
    });

    const totalItems = reports.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const startIndex = (page - 1) * limit;
    const paginatedData = reports.slice(startIndex, startIndex + limit);

    return NextResponse.json({
      data: paginatedData,
      pagination: {
        totalItems,
        totalPages,
        currentPage: page,
        limit,
      },
      summary: {
        totalCostUsd,
        totalCostIdr,
        totalCommissionIdr,
        totalProfitIdr: totalCommissionIdr - totalCostIdr,
        totalClicks,
        totalImpressions,
        avgCtr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      },
      exchangeRate,
    });
  } catch (err) {
    console.error("Critical: loading dynamic reports failed:", err);
    return NextResponse.json(
      { error: "Internal server error reading dynamic report: " + err.message },
      { status: 500 }
    );
  }
}
