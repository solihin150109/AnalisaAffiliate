/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextResponse } from "next/server";
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

export async function GET(req) {
  try {
    if (!checkAuth(req)) {
      return NextResponse.json({ error: "Unauthorized session access." }, { status: 401 });
    }

    try {
      const shortlinks = await prisma.shortlink.findMany({
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json(shortlinks);
    } catch (dbErr) {
      console.warn("Prisma reading shortlinks failed, returning empty list:", dbErr.message);
      return NextResponse.json([]);
    }
  } catch (err) {
    return NextResponse.json(
      { error: "Internal server error fetching shortlinks: " + err.message },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    if (!checkAuth(req)) {
      return NextResponse.json({ error: "Unauthorized session access." }, { status: 401 });
    }

    const { baseUrl, zoneId, platform, market } = await req.json();

    if (!baseUrl) {
      return NextResponse.json({ error: "Missing required parameter: baseUrl" }, { status: 400 });
    }

    const targetZoneId = zoneId || "Global";
    const targetPlatform = platform || "Direct";
    const targetMarket = market || "Universal";

    // Auto-detect server domain recursively using headers
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
    const proto = req.headers.get("x-forwarded-proto") || "http";
    const domain = `${proto}://${host}`;

    // Construct tracking redirect structure
    const generatedUrl = `${domain}/r?url=${encodeURIComponent(baseUrl)}&sub1=${targetZoneId}&sub2=${targetPlatform}&market=${targetMarket}`;

    const newShortlink = await prisma.shortlink.create({
      data: {
        id: `sl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        originalUrl: baseUrl,
        zoneId: targetZoneId,
        platform: targetPlatform,
        market: targetMarket,
        generatedUrl,
      },
    });

    return NextResponse.json(newShortlink, { status: 201 });
  } catch (err) {
    console.error("Failed to generate shortlink:", err);
    return NextResponse.json(
      { error: "Internal server error generating tracking link: " + err.message },
      { status: 500 }
    );
  }
}
