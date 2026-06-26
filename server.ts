import express from "express";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ====== MIDDLEWARE ======

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// Logging (hanya di development)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });
}

// ====== CONFIG ======

const SESSION_TOKEN = "session-auth-token-web-consolidator-123";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "password123";

// Gunakan /tmp untuk Vercel
const DATA_FILE = path.join(
  process.env.NODE_ENV === 'production' ? '/tmp' : process.cwd(),
  "dashboard_data.json"
);

console.log(`[DATA] Using data file: ${DATA_FILE}`);

// ====== DATA PERSISTENCE ======

let shortlinks = [];
let uploadedFiles = [];
let globalUsdRate = 16300;

// Load data dari file (jika ada)
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const rawData = fs.readFileSync(DATA_FILE, "utf-8");
      const data = JSON.parse(rawData);
      if (Array.isArray(data.shortlinks)) shortlinks = data.shortlinks;
      if (typeof data.globalUsdRate === "number") globalUsdRate = data.globalUsdRate;
      if (Array.isArray(data.uploadedFiles)) uploadedFiles = data.uploadedFiles;
      console.log('[DATA] Loaded from file');
    }
  } catch (err) {
    console.error('[DATA] Failed to load:', err);
  }
}

// Save data ke file
function saveData() {
  try {
    // Pastikan direktori ada
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify({ shortlinks, globalUsdRate, uploadedFiles }, null, 2));
    console.log('[DATA] Saved to file');
  } catch (err) {
    console.error('[DATA] Failed to save:', err);
  }
}

// Load data saat startup
loadData();

// ====== AUTH ======

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${SESSION_TOKEN}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

// ====== API ENDPOINTS ======

// HEALTH
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: process.env.DATABASE_URL ? "Configured" : "Not Configured"
  });
});

// LOGIN
app.post("/api/auth/login", (req, res) => {
  console.log('[AUTH] Login attempt');
  
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    // Log untuk debugging (tidak menampilkan password)
    console.log(`[AUTH] Attempt: ${username} | Expected: ${ADMIN_USERNAME}`);

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      console.log('[AUTH] ✅ Login successful');
      return res.json({ 
        success: true, 
        token: SESSION_TOKEN 
      });
    } else {
      console.log('[AUTH] ❌ Login failed');
      return res.status(401).json({ 
        error: "Invalid credentials" 
      });
    }
  } catch (error) {
    console.error('[AUTH] Error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// AUTH STATUS
app.get("/api/auth/status", (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader === `Bearer ${SESSION_TOKEN}`) {
      res.json({ authenticated: true, username: ADMIN_USERNAME });
    } else {
      res.json({ authenticated: false });
    }
  } catch (error) {
    console.error('[AUTH] Status error:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// CONFIG
app.get("/api/config", (req, res) => {
  try {
    res.json({ usdToIdrRate: globalUsdRate });
  } catch (error) {
    console.error('[CONFIG] Error:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/config", requireAuth, (req, res) => {
  try {
    const { usdToIdrRate } = req.body;
    if (typeof usdToIdrRate === "number" && usdToIdrRate > 0) {
      globalUsdRate = usdToIdrRate;
      saveData();
      res.json({ success: true, usdToIdrRate });
    } else {
      res.status(400).json({ error: "Invalid exchange rate" });
    }
  } catch (error) {
    console.error('[CONFIG] Error:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// SHORTLINKS
app.get("/api/shortlinks", requireAuth, (req, res) => {
  res.json(shortlinks);
});

app.post("/api/shortlinks", requireAuth, (req, res) => {
  try {
    const { originalUrl, zoneId, platform, market, shortlink } = req.body;
    
    if (!originalUrl || !shortlink) {
      return res.status(400).json({ error: "Missing required fields" });
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
    res.status(201).json(payload);
  } catch (error) {
    console.error('[SHORTLINKS] Error:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// UPLOADS
app.get("/api/uploads", requireAuth, (req, res) => {
  res.json(uploadedFiles);
});

app.post("/api/uploads", requireAuth, (req, res) => {
  try {
    const { filename, fileType, rowCount, platform, data } = req.body;

    if (!filename || !fileType || !Array.isArray(data)) {
      return res.status(400).json({ error: "Missing required fields" });
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
    res.status(201).json(uploadedFiles);
  } catch (error) {
    console.error('[UPLOADS] Error:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/api/uploads/:id", requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const initialLength = uploadedFiles.length;
    uploadedFiles = uploadedFiles.filter((item) => item.id !== id);

    if (uploadedFiles.length === initialLength) {
      return res.status(404).json({ error: "File not found" });
    }

    saveData();
    res.json({ success: true, files: uploadedFiles });
  } catch (error) {
    console.error('[UPLOADS] Error:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// MANUAL ENTRY
app.post("/api/manual-entry", requireAuth, (req, res) => {
  try {
    const { zoneId, platform, market, impressions, clicks, costUsd, commissionIdr, commissionUsd, orders } = req.body;

    if (!zoneId) {
      return res.status(400).json({ error: "Zone ID required" });
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
      const idx = manualFile.data.findIndex((item) => item.zoneId === entry.zoneId);
      if (idx !== -1) {
        manualFile.data[idx] = { ...manualFile.data[idx], ...entry };
      } else {
        manualFile.data.push(entry);
      }
      manualFile.uploadedAt = new Date().toISOString();
      manualFile.rowCount = manualFile.data.length;
    }

    saveData();
    res.json({ success: true, files: uploadedFiles });
  } catch (error) {
    console.error('[MANUAL] Error:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE ZONE
app.delete("/api/zones/:zoneId", requireAuth, (req, res) => {
  try {
    const { zoneId } = req.params;
    if (!zoneId) {
      return res.status(400).json({ error: "Missing zoneId" });
    }

    const cleanZoneId = String(zoneId).trim();
    let totalPurgedCount = 0;
    
    uploadedFiles = uploadedFiles.map((file) => {
      const originalLength = file.data.length;
      const filteredData = file.data.filter((item) => String(item.zoneId).trim() !== cleanZoneId);
      totalPurgedCount += (originalLength - filteredData.length);
      return {
        ...file,
        rowCount: filteredData.length,
        data: filteredData
      };
    });

    saveData();
    res.json({ success: true, files: uploadedFiles, totalPurgedCount });
  } catch (error) {
    console.error('[ZONE] Error:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// REDIRECT
app.get("/r", (req, res) => {
  try {
    const { url, sub1, sub2, market } = req.query;
    if (typeof url === "string" && url) {
      console.log(`[TRACKING] Zone: ${sub1} | Platform: ${sub2} | Market: ${market} -> ${url}`);
      res.redirect(url);
    } else {
      res.status(400).send("<h3>Invalid Redirect: URL parameter missing</h3>");
    }
  } catch (error) {
    console.error('[REDIRECT] Error:', error);
    res.status(500).send("<h3>Internal server error</h3>");
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// ====== START ======

// Untuk Vercel: export app
export default app;

// Untuk local: start server
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, "0.0.0.0", () => {
    console.log('='.repeat(60));
    console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
    console.log(`🔗 Health: http://localhost:${PORT}/api/health`);
    console.log(`🔗 Config: http://localhost:${PORT}/api/config`);
    console.log('='.repeat(60));
    console.log(`🔐 Username: ${ADMIN_USERNAME}`);
    console.log(`🔐 Password: ${ADMIN_PASSWORD}`);
    console.log('='.repeat(60));
  });
}