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

export async function GET() {
  try {
    const setting = await prisma.globalSetting.findUnique({
      where: { id: "default" },
    });
    
    const rate = setting ? setting.exchangeRate : 16300.0;
    return NextResponse.json({ usdToIdrRate: rate });
  } catch (err) {
    // If DB is not migrated yet, return sensible default or error
    console.error("Prisma config read failed:", err);
    return NextResponse.json({ usdToIdrRate: 16300.0, warning: "Fallback loaded" });
  }
}

export async function POST(req) {
  try {
    if (!checkAuth(req)) {
      return NextResponse.json({ error: "Unauthorized session access." }, { status: 401 });
    }

    const { usdToIdrRate } = await req.json();
    const rateVal = parseFloat(usdToIdrRate);

    if (isNaN(rateVal) || rateVal <= 0) {
      return NextResponse.json({ error: "Invalid exchange rate parsed." }, { status: 400 });
    }

    const updated = await prisma.globalSetting.upsert({
      where: { id: "default" },
      update: { exchangeRate: rateVal },
      create: { id: "default", exchangeRate: rateVal },
    });

    return NextResponse.json({ success: true, usdToIdrRate: updated.exchangeRate });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update configuration rates: " + err.message },
      { status: 500 }
    );
  }
}
