import express from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const router = express.Router();
const prisma = new PrismaClient();

// Vinyl Color Routes
router.get("/colors", async (req, res) => {
  try {
    const includeInactive = String(req.query.includeInactive || "").toLowerCase() === "true";
    const colors = await prisma.vinylColor.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: { product: true },
      orderBy: { name: "asc" }
    });
    res.json(colors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/colors", async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1),
      colorCode: z.string().min(1),
      productId: z.string().optional()
    });
    
    const { name, colorCode, productId } = schema.parse(req.body);
    
    const color = await prisma.vinylColor.create({
      data: { name, colorCode, productId },
      include: { product: true }
    });
    
    res.json(color);
  } catch (error) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input data" });
    }
    res.status(500).json({ error: error.message });
  }
});

router.put("/colors/:id", async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1).optional(),
      colorCode: z.string().min(1).optional(),
      productId: z.string().optional(),
      isActive: z.boolean().optional()
    });
    
    const updates = schema.parse(req.body);
    
    const color = await prisma.vinylColor.update({
      where: { id: req.params.id },
      data: updates,
      include: { product: true }
    });
    
    res.json(color);
  } catch (error) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input data" });
    }
    res.status(500).json({ error: error.message });
  }
});

router.delete("/colors/:id", async (req, res) => {
  try {
    await prisma.vinylColor.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });
    res.json({ message: "Color deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Vinyl Product Routes
router.get("/products", async (req, res) => {
  try {
    const products = await prisma.vinylProduct.findMany({
      include: {
        vinylColor: true,
        product: true
      },
      where: { isActive: true },
      orderBy: { name: "asc" }
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/products", async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1),
      pricePerSqInch: z.number().min(0),
      vinylColorId: z.string(),
      productId: z.string().optional()
    });
    
    const { name, pricePerSqInch, vinylColorId, productId } = schema.parse(req.body);
    
    const product = await prisma.vinylProduct.create({
      data: { 
        name, 
        pricePerSqInch,
        vinylColorId,
        productId
      },
      include: {
        vinylColor: true,
        product: true
      }
    });
    
    res.json(product);
  } catch (error) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input data" });
    }
    res.status(500).json({ error: error.message });
  }
});

router.put("/products/:id", async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1).optional(),
      pricePerSqInch: z.number().min(0).optional(),
      vinylColorId: z.string().optional(),
      productId: z.string().optional(),
      isActive: z.boolean().optional()
    });
    
    const updates = schema.parse(req.body);
    
    const product = await prisma.vinylProduct.update({
      where: { id: req.params.id },
      data: updates,
      include: {
        vinylColor: true,
        product: true
      }
    });
    
    res.json(product);
  } catch (error) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input data" });
    }
    res.status(500).json({ error: error.message });
  }
});

router.delete("/products/:id", async (req, res) => {
  try {
    await prisma.vinylProduct.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });
    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Printed Decal Pricing Routes
router.get("/pricing", async (req, res) => {
  try {
    let pricing = await prisma.printedDecalPricing.findFirst({
      where: { isActive: true }
    });
    
    // Create default if none exists
    if (!pricing) {
      pricing = await prisma.printedDecalPricing.create({
        data: { name: "Printed Decal Price", pricePerSqInch: 0.60 }
      });
    }
    
    res.json(pricing);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/pricing", async (req, res) => {
  try {
    const schema = z.object({
      pricePerSqInch: z.number().min(0)
    });
    
    const { pricePerSqInch } = schema.parse(req.body);
    
    let pricing = await prisma.printedDecalPricing.findFirst({
      where: { isActive: true }
    });
    
    if (pricing) {
      pricing = await prisma.printedDecalPricing.update({
        where: { id: pricing.id },
        data: { pricePerSqInch }
      });
    } else {
      pricing = await prisma.printedDecalPricing.create({
        data: { name: "Printed Decal Price", pricePerSqInch }
      });
    }
    
    res.json(pricing);
  } catch (error) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input data" });
    }
    res.status(500).json({ error: error.message });
  }
});

// Transfer Tape Pricing Routes (stored as a setting key)
router.get("/transfer-tape-price", async (req, res) => {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: "transfer_tape_price_per_sq_ft" } });
    const pricePerSqFt = setting ? parseFloat(setting.value) : 0.05;
    res.json({ pricePerSqFt });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/transfer-tape-price", async (req, res) => {
  try {
    const schema = z.object({ pricePerSqFt: z.number().min(0) });
    const { pricePerSqFt } = schema.parse(req.body);
    await prisma.setting.upsert({
      where: { key: "transfer_tape_price_per_sq_ft" },
      update: { value: String(pricePerSqFt) },
      create: { key: "transfer_tape_price_per_sq_ft", value: String(pricePerSqFt) },
    });
    res.json({ pricePerSqFt });
  } catch (error) {
    if (error.name === "ZodError") return res.status(400).json({ error: "Invalid input" });
    res.status(500).json({ error: error.message });
  }
});

export default router;
