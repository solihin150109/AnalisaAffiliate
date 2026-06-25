/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { PrismaClient } from "@prisma/client";
import { exec } from "child_process";

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

// Automatic DB synchronization helper
function pushPrismaSchema(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!process.env.DATABASE_URL) {
      console.warn("[PRISMA-BOOT] DATABASE_URL is not defined. Skipping database schema setup.");
      return resolve(false);
    }
    console.log("[PRISMA-BOOT] DATABASE_URL found. Running auto-migration ('npx prisma db push --accept-data-loss') to configure Supabase tables...");
    exec("npx prisma db push --accept-data-loss", (error, stdout, stderr) => {
      if (error) {
        console.error("[PRISMA-BOOT] Critical: Automatic schema push to Supabase failed:", error);
        console.error("[PRISMA-BOOT] Stderr output:", stderr);
        resolve(false);
      } else {
        console.log("[PRISMA-BOOT] Great success! Database schema pushed and tables created in Supabase.");
        console.log(stdout);
        resolve(true);
      }
    });
  });
}

const app = express();
const PORT = 3000;

app.use(express.json());

// In-memory persistence for shortlinks and config
let shortlinks: any[] = [];
let globalUsdRate = 16300; // Default sensible conversion rate
let uploadedFiles: any[] = [];

async function syncToPrismaDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn("[PRISMA-SYNC] DATABASE_URL is not defined. Skipping postgres synchronization.");
    return;
  }
  try {
    console.log("[PRISMA-SYNC] Starting synchronization of uploaded files to database...");
    
    let statsTemp: Record<string, any> = {};
    let clicksTemp: Record<string, number> = {};
    let phTemp: Record<string, { commissionUsd: number }> = {};
    let idTemp: Record<string, { commissionIdr: number }> = {};
    let platformsTemp: Record<string, string> = {};
    let marketsTemp: Record<string, Set<string>> = {};

    const sortedFiles = [...uploadedFiles].reverse();

    sortedFiles.forEach(file => {
      const type = file.fileType;
      
      if (type === "stats") {
        file.data.forEach((row: any) => {
          statsTemp[row.zoneId] = row;
          platformsTemp[row.zoneId] = file.platform || "PropellerAds";
        });
      }

      else if (type === "clicks") {
        file.data.forEach((row: any) => {
          clicksTemp[row.zoneId] = (clicksTemp[row.zoneId] || 0) + (row.clicks || 0);
        });
      }

      else if (type === "shopee_ph") {
        file.data.forEach((row: any) => {
          if (!phTemp[row.zoneId]) {
            phTemp[row.zoneId] = { commissionUsd: 0 };
          }
          phTemp[row.zoneId].commissionUsd += (row.earningsUsd || 0);

          if (!marketsTemp[row.zoneId]) marketsTemp[row.zoneId] = new Set();
          marketsTemp[row.zoneId].add("ph");
        });
      }

      else if (type === "shopee_id") {
        file.data.forEach((row: any) => {
          if (!idTemp[row.zoneId]) {
            idTemp[row.zoneId] = { commissionIdr: 0 };
          }
          idTemp[row.zoneId].commissionIdr += (row.commissionIdr || 0);

          if (!marketsTemp[row.zoneId]) marketsTemp[row.zoneId] = new Set();
          marketsTemp[row.zoneId].add("id");
        });
      }

      else if (type === "manual") {
        file.data.forEach((row: any) => {
          statsTemp[row.zoneId] = {
            zoneId: row.zoneId,
            impressions: parseInt(row.impressions) || 0,
            clicks: parseInt(row.statsClicks) || parseInt(row.clicks) || 0,
            costUsd: parseFloat(row.costUsd) || 0.0,
            spend: parseFloat(row.costUsd) || 0.0,
          };
          platformsTemp[row.zoneId] = row.platform || "PropellerAds";

          clicksTemp[row.zoneId] = (clicksTemp[row.zoneId] || 0) + (parseInt(row.clicks) || 0);

          if (!marketsTemp[row.zoneId]) marketsTemp[row.zoneId] = new Set();
          if (row.market) {
            if (row.market.toLowerCase().includes("id")) marketsTemp[row.zoneId].add("id");
            if (row.market.toLowerCase().includes("ph")) marketsTemp[row.zoneId].add("ph");
          }

          if (row.commissionUsd) {
            if (!phTemp[row.zoneId]) phTemp[row.zoneId] = { commissionUsd: 0 };
            phTemp[row.zoneId].commissionUsd += parseFloat(row.commissionUsd) || 0.0;
          }

          if (row.commissionIdr) {
            if (!idTemp[row.zoneId]) idTemp[row.zoneId] = { commissionIdr: 0 };
            idTemp[row.zoneId].commissionIdr += parseFloat(row.commissionIdr) || 0.0;
          }
        });
      }
    });

    const allZoneIds = new Set([
      ...Object.keys(statsTemp),
      ...Object.keys(clicksTemp),
      ...Object.keys(phTemp),
      ...Object.keys(idTemp)
    ]);

    await prisma.zoneReport.deleteMany({});

    if (allZoneIds.size > 0) {
      const dataToInsert = Array.from(allZoneIds).map((zoneId: any) => {
        const stats = statsTemp[zoneId] || {};
        const impressions = parseInt(stats.impressions) || 0;
        const statsClicks = parseInt(stats.clicks) || 0;
        const trackerClicks = clicksTemp[zoneId] || 0;
        const costUsd = parseFloat(stats.costUsd || stats.spend) || 0.0;
        const commissionUsd = phTemp[zoneId]?.commissionUsd || 0.0;
        const commissionIdr = idTemp[zoneId]?.commissionIdr || 0.0;
        const platformTag = platformsTemp[zoneId] || "PropellerAds";
        
        const marketSet = marketsTemp[zoneId];
        let marketTag = "unmatched";
        if (marketSet) {
          if (marketSet.has("id") && marketSet.has("ph")) {
            marketTag = "id + ph";
          } else if (marketSet.has("id")) {
            marketTag = "id";
          } else if (marketSet.has("ph")) {
            marketTag = "ph";
          }
        }

        return {
          zoneId,
          impressions,
          statsClicks,
          trackerClicks,
          costUsd,
          commissionUsd,
          commissionIdr,
          platformTag,
          marketTag,
        };
      });

      await prisma.zoneReport.createMany({
        data: dataToInsert
      });
    }

    console.log(`[PRISMA-SYNC] DB Synchronization successful! ${allZoneIds.size} zones aggregated and written to PostgreSQL/Supabase.`);
  } catch (syncErr) {
    console.error("[PRISMA-SYNC] Critical error during database synchronization:", syncErr);
  }
}

async function loadFromPrismaDatabase() {
  if (!process.env.DATABASE_URL) return;
  try {
    console.log("[PRISMA-BOOT] Fetching configuration & resources from PostgreSQL/Supabase database...");
    const settings = await prisma.globalSetting.findUnique({ where: { id: "default" } });
    if (settings) {
      globalUsdRate = settings.exchangeRate;
      console.log(`[PRISMA-BOOT] Loaded custom Exchange Rate: ${globalUsdRate}`);
    }

    const dbShortlinks = await prisma.shortlink.findMany({
      orderBy: { createdAt: "desc" },
    });
    if (dbShortlinks && dbShortlinks.length > 0) {
      shortlinks = dbShortlinks.map((sl: any) => ({
        id: sl.id,
        originalUrl: sl.originalUrl,
        zoneId: sl.zoneId,
        platform: sl.platform,
        market: sl.market,
        shortlink: sl.generatedUrl,
        createdAt: sl.createdAt.toISOString(),
      }));
      console.log(`[PRISMA-BOOT] Loaded ${dbShortlinks.length} persistent shortlinks from database.`);
    }

    // Proactively synchronize any preexisting uploaded files on start
    await syncToPrismaDatabase();
  } catch (err) {
    console.warn("[PRISMA-BOOT] Warning loading configuration from PostgreSQL database:", err);
  }
}

// Try to load any previously saved shortlinks or configuration from working disk if present
// FIX: Use /tmp for Vercel production
const DATA_FILE = path.join(
  process.env.NODE_ENV === 'production' ? '/tmp' : process.cwd(),
  "dashboard_data.json"
);

if (fs.existsSync(DATA_FILE)) {
  try {
    const rawData = fs.readFileSync(DATA_FILE, "utf-8");
    const data = JSON.parse(rawData);
    if (Array.isArray(data.shortlinks)) {
      shortlinks = data.shortlinks;
    }
    if (typeof data.globalUsdRate === "number") {
      globalUsdRate = data.globalUsdRate;
    }
    if (Array.isArray(data.uploadedFiles)) {
      uploadedFiles = data.uploadedFiles;
    }
  } catch (err) {
    console.error("Could not parse existing database file:", err);
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ shortlinks, globalUsdRate, uploadedFiles }, null, 2), "utf-8");
  } catch (err) {
    console.log("Could not save persistent database:", err);
  }
}

// Simple Token-based session management
const SESSION_TOKEN = "session-auth-token-web-consolidator-123";

// Determine admin credentials with reliable fallback
const getAdminCredentials = () => {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "password123";
  return { username, password };
};

// Log warning to server console on boot for developer awareness
const creds = getAdminCredentials();
console.log(`[AUTH-INFO] Operational Credentials. User: "${creds.username}" | Pass: "${"*".repeat(creds.password.length)}"`);

// Auth middleware helper
const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${SESSION_TOKEN}`) {
    res.status(401).json({ error: "Unauthorized session access." });
    return;
  }
  next();
};

// API Endpoint - Login
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  const target = getAdminCredentials();

  if (username === target.username && password === target.password) {
    res.json({ success: true, token: SESSION_TOKEN });
  } else {
    res.status(401).json({ error: "Invalid username or password credentials." });
  }
});

// API Endpoint - Auth Status Check
app.get("/api/auth/status", (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${SESSION_TOKEN}`) {
    res.json({ authenticated: true, username: getAdminCredentials().username });
  } else {
    res.json({ authenticated: false });
  }
});

// API Endpoint - Fetch Shortlinks
app.get("/api/shortlinks", requireAuth, (req, res) => {
  res.json(shortlinks);
});

// API Endpoint - Create Shortlink
app.post("/api/shortlinks", requireAuth, async (req, res) => {
  const { originalUrl, zoneId, platform, market, shortlink } = req.body;

  if (!originalUrl || !shortlink) {
    res.status(400).json({ error: "Missing required shortlink elements." });
    return;
  }

  const payload = {
    id: `sl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    originalUrl,
    zoneId: zoneId || "Global",
    platform: platform || "Direct",
    market: market || "Universal",
    shortlink,
    createdAt: new Date().toISOString(),
  };

  shortlinks.unshift(payload);
  saveData();

  if (process.env.DATABASE_URL) {
    try {
      await prisma.shortlink.create({
        data: {
          id: payload.id,
          originalUrl: payload.originalUrl,
          zoneId: payload.zoneId,
          platform: payload.platform,
          market: payload.market,
          generatedUrl: payload.shortlink,
          createdAt: new Date(payload.createdAt),
        }
      });
      console.log("[PRISMA-SYNC] Successfully synchronized Shortlink to PostgreSQL/Supabase.");
    } catch (err) {
      console.error("[PRISMA-SYNC] Failed to sync Shortlink to PostgreSQL:", err);
    }
  }

  res.status(201).json(payload);
});

// API Endpoint - Get / Update global details
app.get("/api/config", (req, res) => {
  res.json({ usdToIdrRate: globalUsdRate });
});

app.post("/api/config", requireAuth, async (req, res) => {
  const { usdToIdrRate } = req.body;
  if (typeof usdToIdrRate === "number" && usdToIdrRate > 0) {
    globalUsdRate = usdToIdrRate;
    saveData();

    if (process.env.DATABASE_URL) {
      try {
        await prisma.globalSetting.upsert({
          where: { id: "default" },
          update: { exchangeRate: usdToIdrRate },
          create: { id: "default", exchangeRate: usdToIdrRate },
        });
        console.log("[PRISMA-SYNC] Successfully synchronized global Exchange Rate to PostgreSQL/Supabase.");
      } catch (err) {
        console.error("[PRISMA-SYNC] Failed to sync Exchange Rate to PostgreSQL:", err);
      }
    }

    res.json({ success: true, usdToIdrRate });
  } else {
    res.status(400).json({ error: "Invalid exchange rate parsed." });
  }
});

// API Endpoint - Fetch Uploaded Files History
app.get("/api/uploads", requireAuth, (req, res) => {
  res.json(uploadedFiles);
});

// API Endpoint - Add a parsed CSV File
app.post("/api/uploads", requireAuth, async (req, res) => {
  const { filename, fileType, rowCount, platform, data } = req.body;

  if (!filename || !fileType || !Array.isArray(data)) {
    res.status(400).json({ error: "Missing required file elements." });
    return;
  }

  const payload = {
    id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    filename,
    fileType,
    rowCount: rowCount || data.length,
    platform: platform || "PropellerAds",
    uploadedAt: new Date().toISOString(),
    data,
  };

  uploadedFiles.unshift(payload);
  saveData();

  await syncToPrismaDatabase();

  res.status(201).json(uploadedFiles);
});

// API Endpoint - Delete an uploaded file by ID
app.delete("/api/uploads/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const initialLength = uploadedFiles.length;
  uploadedFiles = uploadedFiles.filter((item: any) => item.id !== id);

  if (uploadedFiles.length === initialLength) {
    res.status(404).json({ error: "File record not found." });
    return;
  }

  saveData();
  await syncToPrismaDatabase();

  res.json({ success: true, files: uploadedFiles });
});

// API Endpoint - Add / Edit manual data record
app.post("/api/manual-entry", requireAuth, async (req, res) => {
  const { zoneId, platform, market, impressions, clicks, costUsd, commissionIdr, commissionUsd, orders } = req.body;

  if (!zoneId) {
    res.status(400).json({ error: "Zone ID is required for manual entry." });
    return;
  }

  const cleanZoneId = String(zoneId).trim();

  // Find if standard "Manual Input" file exists
  let manualFile = uploadedFiles.find(f => f.fileType === "manual");
  
  const entry = {
    zoneId: cleanZoneId,
    platform: platform || "PropellerAds",
    market: market || "id",
    impressions: parseInt(impressions) || 0,
    clicks: parseInt(clicks) || 0,
    costUsd: parseFloat(costUsd) || 0.0,
    commissionIdr: parseFloat(commissionIdr) || 0.0,
    commissionUsd: parseFloat(commissionUsd) || 0.0,
    orders: parseInt(orders) || 1,
  };

  if (!manualFile) {
    // Create new manual file
    manualFile = {
      id: `manual-file-${Date.now()}`,
      filename: "Input Manual",
      fileType: "manual",
      uploadedAt: new Date().toISOString(),
      rowCount: 1,
      data: [entry]
    };
    uploadedFiles.unshift(manualFile);
  } else {
    // If it exists, check if zone already exists in its data list
    const idx = manualFile.data.findIndex((item: any) => item.zoneId === entry.zoneId);
    if (idx !== -1) {
      manualFile.data[idx] = { ...manualFile.data[idx], ...entry };
    } else {
      manualFile.data.push(entry);
    }
    manualFile.uploadedAt = new Date().toISOString();
    manualFile.rowCount = manualFile.data.length;
  }

  saveData();
  await syncToPrismaDatabase();

  res.json({ success: true, files: uploadedFiles });
});

// API Endpoint - Delete a single zone row completely from all database files
app.delete("/api/zones/:zoneId", requireAuth, async (req, res) => {
  const { zoneId } = req.params;

  if (!zoneId) {
    res.status(400).json({ error: "Missing zoneId parameter." });
    return;
  }

  const cleanZoneId = String(zoneId).trim();

  // Purge from all data sets in uploadedFiles history
  let totalPurgedCount = 0;
  uploadedFiles = uploadedFiles.map((file: any) => {
    const originalLength = file.data.length;
    const filteredData = file.data.filter((item: any) => String(item.zoneId).trim() !== cleanZoneId);
    totalPurgedCount += (originalLength - filteredData.length);
    return {
      ...file,
      rowCount: filteredData.length,
      data: filteredData
    };
  });

  // Keep uploadedFiles clean (remove file structures if they become entirely empty, except maybe keep manual files or general history)
  // Let's keep files with 0 rows, which is perfectly safe or clean them up.

  saveData();

  // If Supabase postgres database has this zone, delete it instantly
  if (process.env.DATABASE_URL) {
    try {
      await prisma.zoneReport.deleteMany({
        where: { zoneId: cleanZoneId }
      });
      console.log(`[PRISMA-SYNC] Purged zone ${cleanZoneId} directly from postgres.`);
    } catch (err) {
      console.error(`[PRISMA-SYNC] Failed to delete zone ${cleanZoneId} from database SQL:`, err);
    }
  }

  // Re-synchronize clean database metrics
  await syncToPrismaDatabase();

  res.json({ success: true, files: uploadedFiles, totalPurgedCount });
});

// Redirect endpoint for generated tracker link
app.get("/r", (req, res) => {
  const { url, sub1, sub2, market } = req.query;
  if (typeof url === "string" && url) {
    console.log(`[TRACKING-REDIRECT] Zone ID: ${sub1} | Platform: ${sub2} | Market: ${market} -> ${url}`);
    res.redirect(url);
  } else {
    res.status(400).send("<h3>Invalid Redirect: URL destination parameter is missing from tracking request.</h3>");
  }
});

// Initialize Vite and setup endpoints
async function initializeApp() {
  // 1. Automatically push schema / sync tables to Supabase if configured
  await pushPrismaSchema();

  // 2. Load initial settings and shortlinks from Prisma PostgreSQL/Supabase if configured
  await loadFromPrismaDatabase();

  // 3. Setup static files untuk production
  if (process.env.NODE_ENV === "production") {
    const distPath = path.join(process.cwd(), "dist");
    // Cek apakah dist folder ada
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    } else {
      console.warn("[VERCEL] dist folder not found, serving API only");
    }
  } else {
    // Development mode dengan Vite
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }
}

// ====== KONFIGURASI UNTUK VERCEL ======
// Panggil initializeApp untuk development
if (process.env.NODE_ENV !== 'production') {
  initializeApp().catch((err) => {
    console.error("Critical: Initialization of App Failed", err);
  });
  
  // Running di local
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
  });
} else {
  // Production: inisialisasi async tanpa blocking
  initializeApp().catch((err) => {
    console.error("[VERCEL] Initialization failed:", err);
  });
}

// Export app untuk Vercel
export default app;