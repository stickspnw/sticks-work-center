import express from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

const ProductSchema = z.object({
  name: z.string().min(2),
  price: z.number().nonnegative(),
  status: z.enum(["ACTIVE","DISABLED"]).optional(),
});

router.get("/", requireAuth, async (req, res) => {
  const prisma = req.prisma;
  const onlyActive = (req.query.active || "false").toString() === "true";
  const where = onlyActive ? { status: "ACTIVE" } : {};
  const products = await prisma.product.findMany({ where, orderBy: { name: "asc" } });
  res.json(products.map(p => ({
    ...p,
    price: Number(p.price),
  })));
});

router.post("/", requireAuth, requireRole(["ADMIN"]), async (req, res) => {
  const prisma = req.prisma;

  try {
    const name = String(req.body?.name || "").trim();
    const price = Number(req.body?.price || 0);

    if (!name) return res.status(400).json({ error: "Product name is required" });

    const created = await prisma.product.create({
      data: {
        name,
        price,
      },
    });

    return res.json(created);
  } catch (e) {
    // Duplicate unique field (name)
    if (e?.code === "P2002") {
      return res.status(409).json({
        error: "That product name already exists. Use a different name or edit the existing product.",
      });
    }

    console.error("Create product failed:", e);
    return res.status(500).json({ error: "Failed to create product" });
  }
});


router.put("/:id", requireAuth, requireRole(["ADMIN"]), async (req, res) => {
  const parsed = ProductSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const prisma = req.prisma;
  const updated = await prisma.product.update({ where: { id: req.params.id }, data: {
    name: parsed.data.name,
    price: parsed.data.price,
    status: parsed.data.status || "ACTIVE"
  }});
  res.json({ ...updated, price: Number(updated.price) });
});
router.patch("/:id/status", requireAuth, requireRole(["ADMIN"]), async (req, res) => {
  const prisma = req.prisma;

  const bodyStatus = req.body?.status;

  const existing = await prisma.product.findUnique({
    where: { id: req.params.id },
  });

  if (!existing) {
    return res.status(404).json({ error: "Not found" });
  }

  const nextStatus =
    bodyStatus === "ACTIVE" || bodyStatus === "DISABLED"
      ? bodyStatus
      : existing.status === "ACTIVE"
        ? "DISABLED"
        : "ACTIVE";

  const updated = await prisma.product.update({
    where: { id: req.params.id },
    data: { status: nextStatus },
  });

  res.json({ ...updated, price: Number(updated.price) });
});

export default router;
