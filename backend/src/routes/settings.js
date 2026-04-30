import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

const uploadDir = path.resolve("uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, "logo" + path.extname(file.originalname).toLowerCase()),
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 } });

router.get("/", requireAuth, async (req, res) => {
  const prisma = req.prisma;
  const settings = await prisma.setting.findMany();
  res.json(Object.fromEntries(settings.map(s => [s.key, s.value])));
});
// GET /api/settings/branding (admin auth required)
router.get("/branding",   async (req, res) => {
  const prisma = req.prisma;

  const rows = await prisma.setting.findMany({
    where: { key: { in: ["company_name", "logo_path"] } },
  });

  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  res.json({
    companyName: map.company_name || "",
    logoUrl: map.logo_path
  ? `${req.protocol}://${req.get("host")}${map.logo_path}`
  : "",

  });
});

// POST /api/settings/branding/company-name (admin only)
router.post("/branding/company-name", requireAuth, requireRole(["ADMIN"]), async (req, res) => {
  const prisma = req.prisma;
  const companyName = String(req.body?.companyName || "").trim();

  await prisma.setting.upsert({
    where: { key: "company_name" },
    update: { value: companyName },
    create: { key: "company_name", value: companyName },
  });

  res.json({ ok: true, companyName });
});



router.post("/branding/logo", requireAuth, requireRole(["ADMIN"]), upload.single("logo"), async (req, res) => {
  const prisma = req.prisma;
  const relPath = `/uploads/${req.file.filename}`;
  await prisma.setting.upsert({
    where: { key: "logo_path" },
    update: { value: relPath },
    create: { key: "logo_path", value: relPath }
  });
  res.json({ ok: true, logoPath: relPath });
});

router.get("/branding/logo", async (_req, res) => {
  const logoCandidates = ["logo.png","logo.jpg","logo.jpeg","logo.svg"];
  for (const f of logoCandidates) {
    const p = path.join(uploadDir, f);
    if (fs.existsSync(p)) return res.sendFile(p);
  }
  return res.status(404).send("No logo uploaded");
});

// -----------------------
// Decal page button toggles (Cut Vinyl + Printed Decals action buttons)
// -----------------------
const TOGGLES_KEY = "decal_page_toggles";
const DEFAULT_TOGGLES = {
  cutVinyl: {
    textFile: true,
    strokeFile: true,
    build: true,
    payNow: true,
    printQuote: true,
  },
  printedDecals: {
    printFile: true,
    printQuote: true,
  },
};

function mergeToggles(saved) {
  // Deep-merge saved values over defaults so newly added buttons get a
  // sensible default (true) without requiring a DB update.
  const out = JSON.parse(JSON.stringify(DEFAULT_TOGGLES));
  if (saved && typeof saved === "object") {
    for (const page of Object.keys(out)) {
      if (saved[page] && typeof saved[page] === "object") {
        for (const key of Object.keys(out[page])) {
          if (typeof saved[page][key] === "boolean") {
            out[page][key] = saved[page][key];
          }
        }
      }
    }
  }
  return out;
}

// GET /api/settings/decal-page-toggles  (public; needed by storefront pages)
router.get("/decal-page-toggles", async (req, res) => {
  const prisma = req.prisma;
  try {
    const row = await prisma.setting.findUnique({ where: { key: TOGGLES_KEY } });
    let saved = null;
    if (row?.value) {
      try { saved = JSON.parse(row.value); } catch {}
    }
    res.json(mergeToggles(saved));
  } catch (e) {
    console.error("Failed to load decal page toggles:", e);
    res.json(DEFAULT_TOGGLES);
  }
});

// PUT /api/settings/decal-page-toggles  (admin only)
router.put("/decal-page-toggles", requireAuth, requireRole(["ADMIN"]), async (req, res) => {
  const prisma = req.prisma;
  const incoming = mergeToggles(req.body || {});
  await prisma.setting.upsert({
    where: { key: TOGGLES_KEY },
    update: { value: JSON.stringify(incoming) },
    create: { key: TOGGLES_KEY, value: JSON.stringify(incoming) },
  });
  res.json(incoming);
});

// -----------------------
// Storefront pricing (min order + flat-rate shipping)
// -----------------------
const STOREFRONT_KEY = "storefront_pricing";
const DEFAULT_STOREFRONT = {
  minOrderPrice: 9.99,
  shippingFlatFee: 0,
};

function mergeStorefront(saved) {
  const out = { ...DEFAULT_STOREFRONT };
  if (saved && typeof saved === "object") {
    if (Number.isFinite(Number(saved.minOrderPrice))) out.minOrderPrice = Number(saved.minOrderPrice);
    if (Number.isFinite(Number(saved.shippingFlatFee))) out.shippingFlatFee = Number(saved.shippingFlatFee);
  }
  return out;
}

router.get("/storefront-pricing", async (req, res) => {
  const prisma = req.prisma;
  try {
    const row = await prisma.setting.findUnique({ where: { key: STOREFRONT_KEY } });
    let saved = null;
    if (row?.value) { try { saved = JSON.parse(row.value); } catch {} }
    res.json(mergeStorefront(saved));
  } catch (e) {
    console.error("Failed to load storefront pricing:", e);
    res.json(DEFAULT_STOREFRONT);
  }
});

router.put("/storefront-pricing", requireAuth, requireRole(["ADMIN"]), async (req, res) => {
  const prisma = req.prisma;
  const incoming = mergeStorefront(req.body || {});
  // Clamp to non-negative reasonable values
  incoming.minOrderPrice = Math.max(0, Number(incoming.minOrderPrice.toFixed(2)));
  incoming.shippingFlatFee = Math.max(0, Number(incoming.shippingFlatFee.toFixed(2)));
  await prisma.setting.upsert({
    where: { key: STOREFRONT_KEY },
    update: { value: JSON.stringify(incoming) },
    create: { key: STOREFRONT_KEY, value: JSON.stringify(incoming) },
  });
  res.json(incoming);
});

export default router;
