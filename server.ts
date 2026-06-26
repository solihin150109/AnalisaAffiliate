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
import { fileURLToPath } from "url";

// ====== LOAD ENVIRONMENT VARIABLES ======
dotenv.config();

// ====== FILE PATH UTILITIES ======
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ====== PRISMA CLIENT ======
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

// ====== EXPRESS APP ======
const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ====== MIDDLEWARE ======

// CORS Middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// JSON Parser
app.use(express.json());

// Logging Middleware (hanya di development)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });
}

// ====== GLOBAL ERROR HANDLER ======
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[ERROR]', err);
  res.status(500).json({ 
    error: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// ====== CONFIGURATION ======

// Session Token
const SESSION_TOKEN = "session-auth-token-web-consolidator-123";

// In-memory data stores
let shortlinks: any[] = [];
let globalUsdRate = 16300;
let uploadedFiles: any[] = [];

// Admin credentials
const getAdminCredentials = () => {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "password123";
  return { username, password };
};

// Log credentials on startup
const creds = getAdminCredentials();
console.log(`[AUTH-INFO] Credentials: User: "${creds.username}" | Pass: "${"*".repeat(creds.password.length)}"`);

// ====== DATA PERSISTENCE ======

// Gunakan /tmp untuk Vercel production
const DATA_FILE = path.join(
  process.env.NODE_ENV === 'production' ? '/tmp' : process.cwd(),
  "dashboard_data.json"
);

console.log(`[DATA] Using data file: ${DATA_FILE}`);

// Load data dari file
function loadDataFromFile() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const rawData = fs.readFileSync(DATA_FILE, "utf-8");
      const data = JSON.parse(rawData);
      if (Array.isArray(data.shortlinks)) {
        shortlinks = data.shortlinks;
        console.log(`[DATA] Loaded ${shortlinks.length} shortlinks`);
      }
      if (typeof data.globalUsdRate === "number") {
        globalUsdRate = data.globalUsdRate;
        console.log(`[DATA] Loaded exchange rate: ${globalUsdRate}`);
      }
      if (Array.isArray(data.uploadedFiles)) {
        uploadedFiles = data.uploadedFiles;
        console.log(`[DATA] Loaded ${uploadedFiles.length} uploaded files`);
      }
    }
  } catch (err) {
    console.error("[DATA] Failed to load from file:", err);
  }
}

// Save data ke file
function saveDataToFile() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      DATA_FILE, 
      JSON.stringify({ shortlinks, globalUsdRate, uploadedFiles }, null, 2), 
      "utf-8"
    );
    console.log(`[DATA] Saved to file: ${DATA_FILE}`);
  } catch (err) {
    console.error("[DATA] Failed to save to file:", err);
  }
}

// Load data saat startup
loadDataFromFile();

// ====== PRISMA DATABASE FUNCTIONS ======

// Auto push schema to database
function pushPrismaSchema(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!process.env.DATABASE_URL) {
      console.warn("[PRISMA-BOOT] DATABASE_URL is not defined. Skipping database schema setup.");
      return resolve(false);
    }
    console.log("[PRISMA-BOOT] DATABASE_URL found. Running auto-migration...");
    
    const timeout = setTimeout(() => {
      console.warn("[PRISMA-BOOT] Schema push timeout, continuing...");
      resolve(false);
    }, 10000);

    exec("npx prisma db push --accept-data-loss --skip-generate", (error, stdout, stderr) => {
      clearTimeout(timeout);
      if (error) {
        console.error("[PRISMA-BOOT] Schema push failed:", error.message);
        console.error("[PRISMA-BOOT] Stderr:", stderr);
        resolve(false);
      } else {
        console.log("[PRISMA-BOOT] Schema pushed successfully!");
        console.log(stdout);
        resolve(true);
      }
    });
  });
}

// Sync uploaded files to Prisma database
async function syncToPrismaDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn("[PRISMA-SYNC] DATABASE_URL is not defined. Skipping sync.");
    return;
  }
  
  try {
    console.log("[PRISMA-SYNC] Starting synchronization...");
    
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

    console.log(`[PRISMA-SYNC] Sync successful! ${allZoneIds.size} zones synchronized.`);
  } catch (syncErr) {
    console.error("[PRISMA-SYNC] Error:", syncErr);
  }
}

// Load data from Prisma database
async function loadFromPrismaDatabase() {
  if (!process.env.DATABASE_URL) return;
  
  try {
    console.log("[PRISMA-BOOT] Loading data from PostgreSQL...");
    
    // Test connection
    try {
      await prisma.$connect();
      console.log("[PRISMA-BOOT] Database connected successfully!");
    } catch (connErr) {
      console.error("[PRISMA-BOOT] Database connection failed:", connErr);
      return;
    }
    
    // Load exchange rate
    try {
      const settings = await prisma.globalSetting.findUnique({ where: { id: "default" } });
      if (settings) {
        globalUsdRate = settings.exchangeRate;
        console.log(`[PRISMA-BOOT] Loaded Exchange Rate: ${globalUsdRate}`);
      }
    } catch (err) {
      console.warn("[PRISMA-BOOT] Could not load exchange rate:", err);
    }

    // Load shortlinks
    try {
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
        console.log(`[PRISMA-BOOT] Loaded ${dbShortlinks.length} shortlinks.`);
      }
    } catch (err) {
      console.warn("[PRISMA-BOOT] Could not load shortlinks:", err);
    }

    await syncToPrismaDatabase();
  } catch (err) {
    console.warn("[PRISMA-BOOT] Warning loading from database:", err);
  }
}

// ====== AUTH MIDDLEWARE ======

const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${SESSION_TOKEN}`) {
    return res.status(401).json({ error: "Unauthorized session access." });
  }
  next();
};

// ====== API ENDPOINTS ======

// Health Check
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: process.env.DATABASE_URL ? "Configured" : "Not Configured",
    uptime: process.uptime(),
    files: uploadedFiles.length,
    shortlinks: shortlinks.length
  });
});

// Login
app.post("/api/auth/login", (req, res) => {
  console.log('[AUTH] Login attempt');
  console.log('[AUTH] Body:', req.body);
  
  try {
    const { username, password } = req.body;
    const target = getAdminCredentials();

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    console.log(`[AUTH] Attempt: ${username} | Expected: ${target.username}`);

    if (username === target.username && password === target.password) {
      console.log('[AUTH] ✅ Login successful');
      return res.json({ 
        success: true, 
        token: SESSION_TOKEN 
      });
    } else {
      console.log('[AUTH] ❌ Login failed');
      return res.status(401).json({ 
        error: "Invalid username or password credentials." 
      });
    }
  } catch (error) {
    console.error('[AUTH] Error:', error);
    return res.status(500).json({ 
      error: "Internal server error during authentication" 
    });
  }
});

// Auth Status
app.get("/api/auth/status", (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader === `Bearer ${SESSION_TOKEN}`) {
      return res.json({ 
        authenticated: true, 
        username: getAdminCredentials().username 
      });
    } else {
      return res.json({ authenticated: false });
    }
  } catch (error) {
    console.error('[AUTH] Status error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Config
app.get("/api/config", (req, res) => {
  try {
    return res.json({ usdToIdrRate: globalUsdRate });
  } catch (error) {
    console.error('[CONFIG] Error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/config", requireAuth, async (req, res) => {
  try {
    const { usdToIdrRate } = req.body;
    if (typeof usdToIdrRate === "number" && usdToIdrRate > 0) {
      globalUsdRate = usdToIdrRate;
      saveDataToFile();

      if (process.env.DATABASE_URL) {
        try {
          await prisma.globalSetting.upsert({
            where: { id: "default" },
            update: { exchangeRate: usdToIdrRate },
            create: { id: "default", exchangeRate: usdToIdrRate },
          });
          console.log("[PRISMA-SYNC] Exchange rate saved to database.");
        } catch (err) {
          console.error("[PRISMA-SYNC] Failed to save exchange rate:", err);
        }
      }

      return res.json({ success: true, usdToIdrRate });
    } else {
      return res.status(400).json({ error: "Invalid exchange rate" });
    }
  } catch (error) {
    console.error('[CONFIG] Error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Shortlinks
app.get("/api/shortlinks", requireAuth, (req, res) => {
  try {
    return res.json(shortlinks);
  } catch (error) {
    console.error('[SHORTLINKS] Error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/shortlinks", requireAuth, async (req, res) => {
  try {
    const { originalUrl, zoneId, platform, market, shortlink } = req.body;

    if (!originalUrl || !shortlink) {
      return res.status(400).json({ error: "Missing required shortlink elements." });
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
    saveDataToFile();

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
        console.log("[PRISMA-SYNC] Shortlink saved to database.");
      } catch (err) {
        console.error("[PRISMA-SYNC] Failed to save shortlink:", err);
      }
    }

    return res.status(201).json(payload);
  } catch (error) {
    console.error('[SHORTLINKS] Error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Uploads
app.get("/api/uploads", requireAuth, (req, res) => {
  try {
    return res.json(uploadedFiles);
  } catch (error) {
    console.error('[UPLOADS] Error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/uploads", requireAuth, async (req, res) => {
  try {
    const { filename, fileType, rowCount, platform, data } = req.body;

    if (!filename || !fileType || !Array.isArray(data)) {
      return res.status(400).json({ error: "Missing required file elements." });
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
    saveDataToFile();

    await syncToPrismaDatabase();

    return res.status(201).json(uploadedFiles);
  } catch (error) {
    console.error('[UPLOADS] Error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/api/uploads/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const initialLength = uploadedFiles.length;
    uploadedFiles = uploadedFiles.filter((item: any) => item.id !== id);

    if (uploadedFiles.length === initialLength) {
      return res.status(404).json({ error: "File record not found." });
    }

    saveDataToFile();
    await syncToPrismaDatabase();

    return res.json({ success: true, files: uploadedFiles });
  } catch (error) {
    console.error('[UPLOADS] Error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Manual Entry
app.post("/api/manual-entry", requireAuth, async (req, res) => {
  try {
    const { zoneId, platform, market, impressions, clicks, costUsd, commissionIdr, commissionUsd, orders } = req.body;

    if (!zoneId) {
      return res.status(400).json({ error: "Zone ID is required for manual entry." });
    }

    const cleanZoneId = String(zoneId).trim();
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
      const idx = manualFile.data.findIndex((item: any) => item.zoneId === entry.zoneId);
      if (idx !== -1) {
        manualFile.data[idx] = { ...manualFile.data[idx], ...entry };
      } else {
        manualFile.data.push(entry);
      }
      manualFile.uploadedAt = new Date().toISOString();
      manualFile.rowCount = manualFile.data.length;
    }

    saveDataToFile();
    await syncToPrismaDatabase();

    return res.json({ success: true, files: uploadedFiles });
  } catch (error) {
    console.error('[MANUAL] Error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Delete Zone
app.delete("/api/zones/:zoneId", requireAuth, async (req, res) => {
  try {
    const { zoneId } = req.params;

    if (!zoneId) {
      return res.status(400).json({ error: "Missing zoneId parameter." });
    }

    const cleanZoneId = String(zoneId).trim();
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

    saveDataToFile();

    if (process.env.DATABASE_URL) {
      try {
        await prisma.zoneReport.deleteMany({
          where: { zoneId: cleanZoneId }
        });
        console.log(`[PRISMA-SYNC] Purged zone ${cleanZoneId} from database.`);
      } catch (err) {
        console.error(`[PRISMA-SYNC] Failed to delete zone:`, err);
      }
    }

    await syncToPrismaDatabase();

    return res.json({ success: true, files: uploadedFiles, totalPurgedCount });
  } catch (error) {
    console.error('[ZONE] Error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Redirect
app.get("/r", (req, res) => {
  try {
    const { url, sub1, sub2, market } = req.query;
    if (typeof url === "string" && url) {
      console.log(`[TRACKING] Zone: ${sub1} | Platform: ${sub2} | Market: ${market} -> ${url}`);
      return res.redirect(url);
    } else {
      return res.status(400).send("<h3>Invalid Redirect: URL destination parameter is missing from tracking request.</h3>");
    }
  } catch (error) {
    console.error('[REDIRECT] Error:', error);
    return res.status(500).send("<h3>Internal server error</h3>");
  }
});

// ====== SERVE STATIC FILES (FRONTEND) - HARUS SEBELUM ROOT ENDPOINT ======
if (process.env.NODE_ENV === "production") {
  const distPath = path.join(process.cwd(), "dist");
  console.log('[PRODUCTION] Dist path:', distPath);
  console.log('[PRODUCTION] Dist exists:', fs.existsSync(distPath));
  
  if (fs.existsSync(distPath)) {
    // Serve static files
    app.use(express.static(distPath));
    console.log('[PRODUCTION] ✅ Serving static files from:', distPath);
    
    // SPA fallback - untuk semua route non-API
    app.get("*", (req, res) => {
      // Jangan override API routes
      if (!req.path.startsWith("/api/") && req.path !== "/r") {
        const indexPath = path.join(distPath, "index.html");
        if (fs.existsSync(indexPath)) {
          return res.sendFile(indexPath);
        } else {
          return res.status(404).json({ error: "Frontend not found" });
        }
      }
    });
  } else {
    console.warn('[PRODUCTION] ⚠️ dist folder not found at:', distPath);
  }
}

// ====== ROOT ENDPOINT (Fallback jika static files tidak ada) ======
app.get("/", (req, res) => {
  // Jika static files ditemukan, Express sudah handle index.html
  // Jika sampai sini, berarti static files tidak ditemukan
  return res.json({
    name: "Affiliate Analytics API",
    version: "1.0.0",
    status: "running",
    message: "Frontend not found. Please build the frontend.",
    endpoints: {
      health: "/api/health",
      config: "/api/config",
      login: "POST /api/auth/login",
      authStatus: "/api/auth/status",
      shortlinks: "/api/shortlinks",
      uploads: "/api/uploads",
      manualEntry: "POST /api/manual-entry",
      zones: "DELETE /api/zones/:zoneId",
      redirect: "/r?url=...&sub1=..."
    }
  });
});

// ====== 404 HANDLER ======
app.use((req, res) => {
  console.log('[404] Not found:', req.method, req.url);
  return res.status(404).json({ 
    error: "Endpoint not found",
    path: req.url,
    method: req.method
  });
});

// ====== INITIALIZATION ======

async function initializeApp() {
  console.log('='.repeat(60));
  console.log('🚀 INITIALIZING APPLICATION');
  console.log('='.repeat(60));
  
  // 1. Push schema to database if configured
  if (process.env.DATABASE_URL) {
    await pushPrismaSchema();
    await loadFromPrismaDatabase();
  }

  console.log('='.repeat(60));
  console.log(`✅ Application initialized successfully`);
  console.log(`🔐 Username: ${getAdminCredentials().username}`);
  console.log(`📁 Data file: ${DATA_FILE}`);
  console.log(`📊 Uploaded files: ${uploadedFiles.length}`);
  console.log(`🔗 Shortlinks: ${shortlinks.length}`);
  console.log(`💱 Exchange rate: ${globalUsdRate}`);
  console.log('='.repeat(60));
}

// ====== START APPLICATION ======

// Jalankan inisialisasi (non-blocking untuk Vercel)
initializeApp().catch((err) => {
  console.error('❌ Failed to initialize application:', err);
});

// ====== EXPORT FOR VERCEL ======
export default app;

// ====== LOCAL DEVELOPMENT ======
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, "0.0.0.0", () => {
    console.log('='.repeat(60));
    console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
    console.log(`🔗 Health: http://localhost:${PORT}/api/health`);
    console.log(`🔗 Config: http://localhost:${PORT}/api/config`);
    console.log(`🌐 Frontend: http://localhost:${PORT}`);
    console.log('='.repeat(60));
    console.log(`🔐 Username: ${getAdminCredentials().username}`);
    console.log(`🔐 Password: ${getAdminCredentials().password}`);
    console.log('='.repeat(60));
  });
}