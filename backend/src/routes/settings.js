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
router.get("/branding", requireAuth, requireRole(["ADMIN"]), async (req, res) => {
  const prisma = req.prisma;

  const rows = await prisma.setting.findMany({
    where: { key: { in: ["company_name", "logo_path"] } },
  });

  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  res.json({
    companyName: map.company_name || "",
    logoUrl: map.logo_path || "",
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

export default router;
