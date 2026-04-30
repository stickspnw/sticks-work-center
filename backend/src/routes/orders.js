import express from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { nextOrderNumber } from "../lib/orderNumber.js";
import PDFDocument from "pdfkit";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

// Storage root for per-order proof uploads
const PROOFS_ROOT = path.resolve("order-files");
if (!fs.existsSync(PROOFS_ROOT)) fs.mkdirSync(PROOFS_ROOT, { recursive: true });

const proofStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const orderId = req.params.id;
    const dir = path.join(PROOFS_ROOT, orderId, "proofs");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const safeBase = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, "_");
    const stamp = Date.now();
    cb(null, `${stamp}_${safeBase}`);
  },
});
const proofUpload = multer({
  storage: proofStorage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype);
    if (!ok) return cb(new Error("Only image uploads are allowed (PNG, JPG, WebP, GIF)"));
    cb(null, true);
  },
});
function csvEscape(v) {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
}

function requireInitials(req, res) {
  const initials = String(req.body?.initials || "").trim().toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(initials)) {
    res.status(400).json({ error: "Initials must be 2–3 letters" });
    return null;
  }
  return initials;
}

const InitialsSchema = z.string().regex(/^[A-Za-z]{2,3}$/);

const CreateOrderSchema = z.object({
  customerId: z.string().min(1),
  // optional initial line items
  lineItems: z.array(z.object({
    productId: z.string().min(1),
    qty: z.number().int().min(1),
    overridePrice: z.number().nonnegative().optional().nullable(),
    overrideReason: z.string().optional().nullable(),
  })).optional(),
});

router.get("/", requireAuth, async (req, res) => {
  const status = (req.query.status || "WIP").toString();
  const prisma = req.prisma;

  const where = status === "ALL" ? { status: { not: "DELETED" } } : { status };
  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { customer: true, lineItems: true },
  });
  res.json(orders);
});
// -----------------------
// Export: Completed orders CSV (ADMIN only)
// IMPORTANT: keep this ABOVE any router.get("/:id") routes
// -----------------------
router.get("/export/completed", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.prisma;

  // initials come from query string on GET
  const initials = String(req.query.initials || "").trim().toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(initials)) {
    return res.status(400).json({ error: "Initials must be 2–3 letters" });
  }

  // pull finished orders + line items + product names
  const orders = await prisma.order.findMany({
    where: { status: "FINISHED" },
    orderBy: { finishedAt: "desc" },
    include: {
      customer: true,
      lineItems: {
  include: { productRef: true },
},

    },
  });

  const header = [
    "orderNumber",
    "customer",
    "completedAt",
    "products",
    "totalQty",
    "totalPrice",
  ];

  const lines = [header.join(",")];

  for (const o of orders) {
    const items = Array.isArray(o.lineItems) ? o.lineItems : [];

    const products = items
      .map((li) => {
        const nm = li.productRef?.name || "";
        return nm ? `${nm} x${li.qty}` : `Item x${li.qty}`;
      })
      .join(" | ");

    const totalQty = items.reduce((sum, li) => sum + (Number(li.qty) || 0), 0);

    const totalPrice = items.reduce((sum, li) => {
      const qty = Number(li.qty) || 0;
      const unit =
        li.overridePrice !== null && li.overridePrice !== undefined
          ? Number(li.overridePrice) || 0
          : Number(li.productRef?.price) || 0;
      return sum + qty * unit;
    }, 0);

    const row = [
      csvEscape(o.orderNumber || ""),
      csvEscape(o.customerNameSnapshot || o.customer?.name || ""),
      csvEscape(o.finishedAt ? new Date(o.finishedAt).toISOString() : ""),
      csvEscape(products),
      csvEscape(totalQty),
      csvEscape(totalPrice.toFixed(2)),
    ];

    lines.push(row.join(","));
  }

  const csv = lines.join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="completed-orders.csv"`);
  res.status(200).send(csv);
});

// -----------------------
// Attachments (Google links + versioning)
// -----------------------

const InitialsSchema2 = z.string().regex(/^[A-Za-z]{2,3}$/);

const CreateAttachmentSchema = z.object({
  label: z.string().min(1),
  googleUrl: z.string().min(1),
  initials: z.string().min(2).max(3),
  note: z.string().optional().nullable(),
});

const AddAttachmentVersionSchema = z.object({
  googleUrl: z.string().min(1),
  initials: z.string().min(2).max(3),
  note: z.string().optional().nullable(),
});

// List attachments for an order (with versions)
router.get("/:id/attachments", requireAuth, async (req, res) => {
  const prisma = req.prisma;

  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!order) return res.status(404).json({ error: "Not found" });

  const attachments = await prisma.attachment.findMany({
    where: { orderId: req.params.id, isArchived: false },
    orderBy: { createdAt: "desc" },
    include: {
      versions: { orderBy: { versionNumber: "desc" } },
    },
  });

  // Add a computed currentVersion object for the frontend
  const shaped = attachments.map((a) => {
    const current =
      a.versions.find((v) => v.isCurrent) || a.versions[0] || null;

    return {
      id: a.id,
      orderId: a.orderId,
      label: a.label,
      attachmentType: a.attachmentType,
      createdAt: a.createdAt,
      isArchived: a.isArchived,
      currentVersion: current
        ? {
            id: current.id,
            versionNumber: current.versionNumber,
            googleUrl: current.googleUrl,
            note: current.note,
            isCurrent: current.isCurrent,
            createdAt: current.createdAt,
          }
        : null,
    };
  });

  res.json(shaped);
});


// Create attachment + version 1 (current)
router.post("/:id/attachments", requireAuth, async (req, res) => {
  const prisma = req.prisma;

  const parsed = CreateAttachmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const initials = String(parsed.data.initials).trim().toUpperCase();
  if (!InitialsSchema2.safeParse(initials).success) {
    return res.status(400).json({ error: "Initials must be 2–3 letters" });
  }

  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!order) return res.status(404).json({ error: "Not found" });

  const label = parsed.data.label.trim();
  const googleUrl = parsed.data.googleUrl.trim();
  const note = parsed.data.note ?? null;

  try {
    const created = await prisma.attachment.create({
      data: {
        orderId: order.id,
        label,
        attachmentType: "GOOGLE_LINK",
        createdByInitials: initials,
        versions: {
          create: {
            versionNumber: 1,
            googleUrl,
            note,
            isCurrent: true,
            createdByInitials: initials,
          },
        },
      },
      include: { versions: { orderBy: { versionNumber: "desc" } } },
    });

    res.json(created);
  } catch (e) {
    // Friendly duplicate label error (because @@unique([orderId, label]))
    const msg = String(e?.message || "");
    if (msg.includes("Unique constraint") || msg.includes("@@unique")) {
      return res.status(400).json({ error: "That attachment label already exists on this order." });
    }
    return res.status(500).json({ error: "Failed to create attachment" });
  }
});

// Add a new version (makes it current; older versions become not current)
router.post("/:id/attachments/:attachmentId/versions", requireAuth, async (req, res) => {
  const prisma = req.prisma;

  const parsed = AddAttachmentVersionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const initials = String(parsed.data.initials).trim().toUpperCase();
  if (!InitialsSchema2.safeParse(initials).success) {
    return res.status(400).json({ error: "Initials must be 2–3 letters" });
  }

  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!order) return res.status(404).json({ error: "Not found" });

  const att = await prisma.attachment.findFirst({
    where: { id: req.params.attachmentId, orderId: order.id },
    include: { versions: { orderBy: { versionNumber: "desc" } } },
  });
  if (!att) return res.status(404).json({ error: "Attachment not found" });

  const googleUrl = parsed.data.googleUrl.trim();
  const note = parsed.data.note ?? null;

  const nextVersion =
    att.versions.length > 0 ? Number(att.versions[0].versionNumber) + 1 : 1;

  const updated = await prisma.$transaction(async (tx) => {
    // mark all existing versions non-current
    await tx.attachmentVersion.updateMany({
      where: { attachmentId: att.id, isCurrent: true },
      data: { isCurrent: false },
    });

    // create new version as current
    await tx.attachmentVersion.create({
      data: {
        attachmentId: att.id,
        versionNumber: nextVersion,
        googleUrl,
        note,
        isCurrent: true,
        createdByInitials: initials,
      },
    });

    // return attachment with newest versions
    return tx.attachment.findUnique({
      where: { id: att.id },
      include: { versions: { orderBy: { versionNumber: "desc" } } },
    });
  });

  res.json(updated);
});
router.get("/search", requireAuth, async (req, res) => {
  const prisma = req.prisma;
  const q = String(req.query.q || "").trim();

  if (q.length < 2) return res.json([]);

  const upper = q.toUpperCase();

  const results = await prisma.order.findMany({
    where: {
      status: { not: "DELETED" },
      OR: [
        { orderNumber: { contains: upper, mode: "insensitive" } },
        { customerNameSnapshot: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      orderNumber: true,
      customerNameSnapshot: true,
      status: true,
      createdAt: true,
    },
  });

  res.json(results);
});
// GET /api/orders/export/completed?initials=JS  (admin only)
router.get("/export/completed", requireAuth, async (req, res) => {
  const prisma = req.prisma;

  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin only" });
  }

  const initials = String(req.query?.initials || "").trim().toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(initials)) {
    return res.status(400).json({ error: "Initials must be 2–3 letters" });
  }

  const orders = await prisma.order.findMany({
    where: { status: "FINISHED" },
    orderBy: { finishedAt: "desc" },
    include: {
      customer: { select: { name: true } },
      items: { include: { product: { select: { name: true } } } },
    },
  });

  const header = ["Order #", "Customer", "Finished date", "Created date", "Products", "Total"];
  const lines = [header.join(",")];

  for (const o of orders) {
    const products = (o.items || [])
      .map((it) => {
        const qty = Number(it.qty || 0);
        const nm = it.product?.name || it.nameSnapshot || "Item";
        return qty ? `${qty}x ${nm}` : nm;
      })
      .join(" | ");

    // If your schema uses different fields, adjust here:
    const total = Number(o.totalPrice || o.total || 0);

    lines.push(
      [
        csvEscape(o.orderNumber),
        csvEscape(o.customerNameSnapshot || o.customer?.name || ""),
        csvEscape(o.finishedAt ? new Date(o.finishedAt).toLocaleString() : ""),
        csvEscape(o.createdAt ? new Date(o.createdAt).toLocaleString() : ""),
        csvEscape(products),
        csvEscape(total.toFixed(2)),
      ].join(",")
    );
  }

  // Audit it if you want:
  try {
    await prisma.auditLog.create({
      data: {
        action: "ORDERS_EXPORTED_COMPLETED",
        details: `Exported ${orders.length} completed orders`,
        initials,
        detailsJson: { count: orders.length },
        actorUser: { connect: { id: req.user.id } },
      },
    });
  } catch {
    // don't block download if audit fails
  }

  const csv = lines.join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="completed-orders.csv"`);
  res.send(csv);
});

router.get("/:id", requireAuth, async (req, res) => {
  const prisma = req.prisma;
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      lineItems: true,
      attachments: { include: { versions: { orderBy: { versionNumber: "desc" } } } },
      history: { orderBy: { timestamp: "asc" } },
      customer: true,
    }
  });
  if (!order) return res.status(404).json({ error: "Not found" });
  res.json(order);
});

router.post("/", requireAuth, async (req, res) => {
  const prisma = req.prisma;
// ADMIN: delete (soft-delete) a completed order — initials required
router.patch("/:id/delete", requireAuth, async (req, res) => {
  const prisma = req.prisma;

  // Admin only
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin only" });
  }

  const id = req.params.id;
  const initials = String(req.body?.initials || "").trim().toUpperCase();

  if (!/^[A-Z]{2,3}$/.test(initials)) {
    return res.status(400).json({ error: "Initials must be 2–3 letters" });
  }

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return res.status(404).json({ error: "Order not found" });

  if (order.status !== "FINISHED") {
    return res.status(400).json({ error: "Only completed orders can be deleted" });
  }

  const updated = await prisma.order.update({
    where: { id },
    data: { status: "DELETED" },
  });

  // audit log
  try {
    await prisma.auditLog.create({
      data: {
        action: "ORDER_DELETED",
        details: `Deleted order ${order.orderNumber}`,
        initials,
        detailsJson: { orderId: id, orderNumber: order.orderNumber },
        actorUser: { connect: { id: req.user.id } },
      },
    });
  } catch (e) {
    console.warn("Audit log failed:", e?.message);
  }

  res.json(updated);
});

  // Accept BOTH shapes:
  // - { customerId, lineItems: [...] } (your current frontend log shows this)
  // - { customerId, items: [...] }     (optional alternate shape)
  const BodySchema = z.object({
    customerId: z.string().min(1),

    items: z.array(z.object({
      productId: z.string().min(1),
      qty: z.number().int().min(1),
      overrideUnitPrice: z.number().nonnegative().optional().nullable(),
      widthIn: z.number().positive().optional().nullable(),
      heightIn: z.number().positive().optional().nullable(),
    })).optional(),

    lineItems: z.array(z.object({
      productId: z.string().min(1),
      qty: z.number().int().min(1),
      overridePrice: z.number().nonnegative().optional().nullable(),
      overrideReason: z.string().optional().nullable(),
      widthIn: z.number().positive().optional().nullable(),
      heightIn: z.number().positive().optional().nullable(),
    })).optional(),
  });

  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const customer = await prisma.customer.findUnique({ where: { id: parsed.data.customerId } });
  if (!customer) return res.status(400).json({ error: "Customer not found" });

  // Normalize incoming items into one list
  const incoming =
    (parsed.data.items || []).map(i => ({
      productId: i.productId,
      qty: i.qty,
      overrideUnitPrice: i.overrideUnitPrice ?? null,
      widthIn: i.widthIn ?? null,
      heightIn: i.heightIn ?? null,
    }))
    .concat(
      (parsed.data.lineItems || []).map(li => ({
        productId: li.productId,
        qty: li.qty,
        overrideUnitPrice: li.overridePrice ?? null,
        widthIn: li.widthIn ?? null,
        heightIn: li.heightIn ?? null,
      }))
    );

  const orderNumber = await nextOrderNumber(prisma);

  // Build DB line items with product snapshots + totals
  const createLineItems = [];
  if (incoming.length > 0) {
    const uniqueIds = [...new Set(incoming.map(i => i.productId))];
    const products = await prisma.product.findMany({ where: { id: { in: uniqueIds } } });
    const byId = new Map(products.map(p => [p.id, p]));

    for (const i of incoming) {
      const p = byId.get(i.productId);
      if (!p) return res.status(400).json({ error: "Product not found" });

      const catalog = Number(p.price);
      const overridden = i.overrideUnitPrice !== null && i.overrideUnitPrice !== undefined;
      const qty = Number(i.qty);

      // Sized-decal: when widthIn and heightIn are provided, treat product price
      // as $/sq-in and compute the unit price as widthIn * heightIn * price.
      const isSized = i.widthIn != null && i.heightIn != null;
      const widthIn = isSized ? Number(i.widthIn) : null;
      const heightIn = isSized ? Number(i.heightIn) : null;
      const sqIn = isSized ? Number((widthIn * heightIn).toFixed(4)) : null;

      let unitFinal;
      if (overridden) {
        unitFinal = Number(i.overrideUnitPrice);
      } else if (isSized) {
        unitFinal = Number((sqIn * catalog).toFixed(2));
      } else {
        unitFinal = catalog;
      }

      const lineTotal = Number((qty * unitFinal).toFixed(2));

      const nameSnapshot = isSized
        ? `${p.name} — Sized Decal ${widthIn}" x ${heightIn}" (${sqIn} sq in)`
        : p.name;

      createLineItems.push({
        productId: p.id,
        productNameSnapshot: nameSnapshot,
        catalogUnitPriceSnapshot: catalog,
        unitPriceFinal: unitFinal,
        qty,
        lineTotal,
        isPriceOverridden: overridden,
        overrideReason: null, // keep history/internal; PDF won't show reasons anyway
        widthIn,
        heightIn,
        sqIn,
      });
    }
  }

  const created = await prisma.order.create({
    data: {
      orderNumber,
      status: "WIP",
      customerId: customer.id,

      customerNameSnapshot: customer.name,
      customerPhoneSnapshot: customer.phone,
      customerEmailSnapshot: customer.email,
      customerShippingAddressSnapshot: customer.shippingAddress,

      ...(createLineItems.length > 0
        ? { lineItems: { create: createLineItems } }
        : {}),

      history: {
        create: [
          {
            eventType: "ORDER_CREATED",
            initials: null,
            actorUserId: req.user.sub,
            summary: "Order created",
            detailsJson: { orderNumber, customerId: customer.id },
          },
          ...(createLineItems.length > 0
            ? [{
                eventType: "LINE_ITEMS_ADDED",
                initials: null,
                actorUserId: req.user.sub,
                summary: `Line items added: ${createLineItems.length}`,
                detailsJson: { count: createLineItems.length },
              }]
            : []),
        ],
      },
    },
    include: { lineItems: true },
  });

  res.json(created);
});



// Mark as completed (initials required)
router.post("/:id/complete", requireAuth, async (req, res) => {
  const initials = (req.body.initials || "").toString().trim().toUpperCase();
  const ok = InitialsSchema.safeParse(initials).success;
  if (!ok) return res.status(400).json({ error: "Initials must be 2–3 letters" });

  const prisma = req.prisma;

  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order) return res.status(404).json({ error: "Not found" });
  if (order.status !== "WIP") return res.status(400).json({ error: "Only WIP orders can be completed" });

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: "FINISHED",
      finishedAt: new Date(),
      history: {
        create: {
          eventType: "STATUS_CHANGED",
          initials,
          actorUserId: req.user.sub,
          summary: "Status changed: Work In Progress → Completed Works",
          detailsJson: { from: "WIP", to: "FINISHED" }
        }
      }
    }
  });

  res.json(updated);
});



// PDF - clean: NO history, NO override reasons
// -----------------------
// Attachments (Google links + versioning)
// -----------------------

// List attachments for an order (with versions)
router.get("/:id/attachments", requireAuth, async (req, res) => {
  const prisma = req.prisma;

  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });

  const attachments = await prisma.attachment.findMany({
    where: { orderId: req.params.id, isArchived: false },
    orderBy: { createdAt: "asc" },
    include: {
      versions: { orderBy: { versionNumber: "desc" } },
    },
  });

  res.json(attachments);
});

// Create a brand-new attachment (v1 current)
router.post("/:id/attachments", requireAuth, async (req, res) => {
  const prisma = req.prisma;

  const label = (req.body.label || "").toString().trim();
  const googleUrl = (req.body.googleUrl || "").toString().trim();
  const initials = (req.body.initials || "").toString().trim().toUpperCase();
  const note = (req.body.note || "").toString().trim() || null;

  if (!label) return res.status(400).json({ error: "Label is required" });
  if (!googleUrl) return res.status(400).json({ error: "Google URL is required" });
  if (!/^[A-Z]{2,3}$/.test(initials)) return res.status(400).json({ error: "Initials must be 2–3 letters" });

  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });

  try {
    const created = await prisma.attachment.create({
      data: {
        orderId: req.params.id,
        label,
        createdByInitials: initials,
        versions: {
          create: {
            versionNumber: 1,
            googleUrl,
            note,
            isCurrent: true,
            createdByInitials: initials,
          },
        },
      },
      include: { versions: { orderBy: { versionNumber: "desc" } } },
    });

    res.json(created);
  } catch (e) {
    // Most common: duplicate label for the same order due to @@unique([orderId,label])
    return res.status(400).json({ error: "Attachment label already exists on this order" });
  }
});

// Add a new version to an existing attachment (increments versionNumber, sets current)
router.post("/:id/attachments/:attachmentId/versions", requireAuth, async (req, res) => {
  const prisma = req.prisma;

  const googleUrl = (req.body.googleUrl || "").toString().trim();
  const initials = (req.body.initials || "").toString().trim().toUpperCase();
  const note = (req.body.note || "").toString().trim() || null;

  if (!googleUrl) return res.status(400).json({ error: "Google URL is required" });
  if (!/^[A-Z]{2,3}$/.test(initials)) return res.status(400).json({ error: "Initials must be 2–3 letters" });

  // Verify attachment belongs to this order
  const att = await prisma.attachment.findFirst({
    where: { id: req.params.attachmentId, orderId: req.params.id },
    include: { versions: { orderBy: { versionNumber: "desc" } } },
  });
  if (!att) return res.status(404).json({ error: "Attachment not found" });

  const nextVersion = (att.versions?.[0]?.versionNumber || 0) + 1;

  // Flip old versions to not-current, create new version as current
  await prisma.attachmentVersion.updateMany({
    where: { attachmentId: att.id, isCurrent: true },
    data: { isCurrent: false },
  });

  const createdVersion = await prisma.attachmentVersion.create({
    data: {
      attachmentId: att.id,
      versionNumber: nextVersion,
      googleUrl,
      note,
      isCurrent: true,
      createdByInitials: initials,
    },
  });

  // Return refreshed attachment
  const refreshed = await prisma.attachment.findUnique({
    where: { id: att.id },
    include: { versions: { orderBy: { versionNumber: "desc" } } },
  });

  res.json({ attachment: refreshed, createdVersion });
});
// --------------------
// Attachments + Versions
// --------------------
const AttachmentLabelSchema = z.string().min(1).max(80);
const GoogleUrlSchema = z.string().url();

router.post("/:id/attachments", requireAuth, async (req, res) => {
  const prisma = req.prisma;
  const orderId = req.params.id;

  const initials = (req.body.initials || "").toString().trim().toUpperCase();
  const okInitials = InitialsSchema.safeParse(initials).success;
  if (!okInitials) return res.status(400).json({ error: "Initials must be 2–3 letters" });

  const label = (req.body.label || "").toString().trim();
  const googleUrl = (req.body.googleUrl || "").toString().trim();
  const note = (req.body.note || "").toString().trim() || null;

  if (!AttachmentLabelSchema.safeParse(label).success) {
    return res.status(400).json({ error: "Label is required (max 80 chars)" });
  }
  if (!GoogleUrlSchema.safeParse(googleUrl).success) {
    return res.status(400).json({ error: "googleUrl must be a valid URL" });
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return res.status(404).json({ error: "Not found" });

  try {
    const created = await prisma.attachment.create({
      data: {
        orderId,
        label,
        attachmentType: "GOOGLE_LINK",
        createdByInitials: initials,
        versions: {
          create: {
            versionNumber: 1,
            googleUrl,
            note,
            isCurrent: true,
            createdByInitials: initials,
          },
        },
      },
      include: { versions: { orderBy: { versionNumber: "desc" } } },
    });

    // optional history entry (internal only)
    await prisma.orderHistory.create({
      data: {
        orderId,
        eventType: "ATTACHMENT_CREATED",
        initials,
        actorUserId: req.user.sub,
        summary: `Attachment added: ${label}`,
        detailsJson: { attachmentId: created.id, label, versionNumber: 1 },
      },
    });

    res.json(created);
  } catch (e) {
    // handles @@unique(orderId,label)
    res.status(400).json({ error: "Attachment label already exists for this order" });
  }
});

router.post("/:id/attachments/:attachmentId/versions", requireAuth, async (req, res) => {
  const prisma = req.prisma;
  const orderId = req.params.id;
  const attachmentId = req.params.attachmentId;

  const initials = (req.body.initials || "").toString().trim().toUpperCase();
  const okInitials = InitialsSchema.safeParse(initials).success;
  if (!okInitials) return res.status(400).json({ error: "Initials must be 2–3 letters" });

  const googleUrl = (req.body.googleUrl || "").toString().trim();
  const note = (req.body.note || "").toString().trim() || null;

  if (!GoogleUrlSchema.safeParse(googleUrl).success) {
    return res.status(400).json({ error: "googleUrl must be a valid URL" });
  }

  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, orderId, isArchived: false },
    include: { versions: { orderBy: { versionNumber: "desc" } } },
  });
  if (!attachment) return res.status(404).json({ error: "Attachment not found" });

  const nextVersion = (attachment.versions[0]?.versionNumber || 0) + 1;

  // transaction: flip current -> false, create new current
  const updated = await prisma.$transaction(async (tx) => {
    await tx.attachmentVersion.updateMany({
      where: { attachmentId, isCurrent: true },
      data: { isCurrent: false },
    });

    await tx.attachmentVersion.create({
      data: {
        attachmentId,
        versionNumber: nextVersion,
        googleUrl,
        note,
        isCurrent: true,
        createdByInitials: initials,
      },
    });

    return tx.attachment.findUnique({
      where: { id: attachmentId },
      include: { versions: { orderBy: { versionNumber: "desc" } } },
    });
  });

  // optional history entry
  await prisma.orderHistory.create({
    data: {
      orderId,
      eventType: "ATTACHMENT_VERSION_ADDED",
      initials,
      actorUserId: req.user.sub,
      summary: `Attachment updated: ${attachment.label} v${nextVersion}`,
      detailsJson: { attachmentId, label: attachment.label, versionNumber: nextVersion },
    },
  });

  res.json(updated);
});

router.post("/:id/attachments/:attachmentId/archive", requireAuth, async (req, res) => {
  const prisma = req.prisma;
  const orderId = req.params.id;
  const attachmentId = req.params.attachmentId;

  const initials = (req.body.initials || "").toString().trim().toUpperCase();
  const okInitials = InitialsSchema.safeParse(initials).success;
  if (!okInitials) return res.status(400).json({ error: "Initials must be 2–3 letters" });

  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, orderId },
  });
  if (!attachment) return res.status(404).json({ error: "Attachment not found" });

  const updated = await prisma.attachment.update({
    where: { id: attachmentId },
    data: { isArchived: true },
  });

  await prisma.orderHistory.create({
    data: {
      orderId,
      eventType: "ATTACHMENT_ARCHIVED",
      initials,
      actorUserId: req.user.sub,
      summary: `Attachment archived: ${attachment.label}`,
      detailsJson: { attachmentId, label: attachment.label },
    },
  });

  res.json(updated);
});

// ----- Proof uploads (image files saved to disk per-order) -----

// POST /api/orders/:id/proofs  (multipart, field: "file")
router.post("/:id/proofs", requireAuth, (req, res, next) => {
  proofUpload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "Upload failed" });
    next();
  });
}, async (req, res) => {
  const prisma = req.prisma;
  const orderId = req.params.id;
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return res.status(404).json({ error: "Order not found" });

  const initials = (req.body?.initials || "").toString().trim().toUpperCase() || null;

  const created = await prisma.orderProof.create({
    data: {
      orderId,
      filename: req.file.originalname,
      storedPath: req.file.path,
      mimeType: req.file.mimetype,
      createdByInitials: initials,
    },
  });

  await prisma.orderHistory.create({
    data: {
      orderId,
      eventType: "PROOF_UPLOADED",
      initials,
      actorUserId: req.user.sub,
      summary: `Proof uploaded: ${req.file.originalname}`,
      detailsJson: { proofId: created.id, filename: req.file.originalname },
    },
  });

  res.json(created);
});

// GET /api/orders/:id/proofs  -> list metadata
router.get("/:id/proofs", requireAuth, async (req, res) => {
  const prisma = req.prisma;
  const list = await prisma.orderProof.findMany({
    where: { orderId: req.params.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, filename: true, mimeType: true, createdAt: true, createdByInitials: true },
  });
  res.json(list);
});

// GET /api/orders/:id/proofs/:proofId/file  -> serve image
router.get("/:id/proofs/:proofId/file", requireAuth, async (req, res) => {
  const prisma = req.prisma;
  const proof = await prisma.orderProof.findUnique({ where: { id: req.params.proofId } });
  if (!proof || proof.orderId !== req.params.id) return res.status(404).json({ error: "Not found" });
  if (!fs.existsSync(proof.storedPath)) return res.status(404).json({ error: "File missing on disk" });
  res.setHeader("Content-Type", proof.mimeType);
  res.sendFile(path.resolve(proof.storedPath));
});

// DELETE /api/orders/:id/proofs/:proofId
router.delete("/:id/proofs/:proofId", requireAuth, async (req, res) => {
  const prisma = req.prisma;
  const proof = await prisma.orderProof.findUnique({ where: { id: req.params.proofId } });
  if (!proof || proof.orderId !== req.params.id) return res.status(404).json({ error: "Not found" });
  try { fs.unlinkSync(proof.storedPath); } catch {}
  await prisma.orderProof.delete({ where: { id: proof.id } });
  await prisma.orderHistory.create({
    data: {
      orderId: req.params.id,
      eventType: "PROOF_DELETED",
      actorUserId: req.user.sub,
      summary: `Proof deleted: ${proof.filename}`,
      detailsJson: { proofId: proof.id, filename: proof.filename },
    },
  });
  res.json({ ok: true });
});

router.get("/:id/pdf", requireAuth, async (req, res) => {
  const prisma = req.prisma;
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      lineItems: true,
      attachments: { include: { versions: true } },
      proofs: { orderBy: { createdAt: "asc" } },
    }
  });
  if (!order) return res.status(404).send("Not found");

  // Branding (matches quote PDF lookup keys: company_name, logo_path)
  const settings = await prisma.setting.findMany({
    where: { key: { in: ["company_name", "logo_path", "brand_name"] } },
  });
  const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const companyName = settingsMap.company_name || settingsMap.brand_name || "";
  let logoBuffer = null;
  if (settingsMap.logo_path) {
    try {
      const logoPath = path.resolve(String(settingsMap.logo_path).replace(/^\//, ""));
      if (fs.existsSync(logoPath)) logoBuffer = fs.readFileSync(logoPath);
    } catch {}
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${order.orderNumber}.pdf"`);

  // ---- Match the quote PDF: LETTER size, 50pt margin, manual layout ------
  const doc = new PDFDocument({ size: "LETTER", margin: 50 });
  doc.pipe(res);

  const pageW = 612;
  const pageH = 792;
  const margin = 45;
  const opts = { lineBreak: false };
  const money = (n) => `$${Number(n || 0).toFixed(2)}`;

  // Locate the first embeddable proof so we can show it next to specs on page 1
  const firstProof = (Array.isArray(order.proofs) ? order.proofs : []).find(
    (p) => p && /^image\/(png|jpe?g)$/i.test(p.mimeType) && fs.existsSync(p.storedPath)
  );

  let y = margin;

  // ---- HEADER: logo left, title + order# right ----
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, margin, y, { fit: [160, 55] });
    } catch {}
  }
  const hdrX = logoBuffer ? 215 : margin;
  doc.fontSize(22).font("Helvetica-Bold").fillColor("#1a1a1a");
  doc.text("WORK ORDER", hdrX, y, opts);
  doc.fontSize(11).font("Helvetica").fillColor("#666666");
  doc.text(`ORDER #${order.orderNumber}`, hdrX, y + 26, opts);
  if (companyName) {
    doc.fontSize(10).fillColor("#444444");
    doc.text(companyName, hdrX, y + 42, opts);
  }
  doc.fontSize(9).fillColor("#999999");
  const created = new Date(order.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  doc.text(`Created: ${created}`, hdrX, y + 56, opts);

  // Status pill on the far right
  const status = order.status === "WIP" ? "Work In Progress" : (order.status === "COMPLETED" ? "Completed" : String(order.status || ""));
  doc.fontSize(9).fillColor("#1a1a1a");
  doc.text(`Status: ${status}`, pageW - margin - 200, y + 56, { ...opts, width: 200, align: "right" });

  y += 70;

  // Divider
  doc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor("#cccccc").lineWidth(1).stroke();
  y += 12;

  // ---- CUSTOMER block (full width) ----
  doc.fontSize(10).font("Helvetica-Bold").fillColor("#1a1a1a");
  doc.text("CUSTOMER", margin, y, opts);
  y += 14;
  doc.fontSize(10).font("Helvetica").fillColor("#222");
  doc.text(`Name: ${order.customerNameSnapshot || "—"}`, margin, y, opts); y += 13;
  if (order.customerPhoneSnapshot) { doc.text(`Phone: ${order.customerPhoneSnapshot}`, margin, y, opts); y += 13; }
  if (order.customerEmailSnapshot) { doc.text(`Email: ${order.customerEmailSnapshot}`, margin, y, opts); y += 13; }
  if (order.customerShippingAddressSnapshot) {
    doc.text(`Ship to: ${order.customerShippingAddressSnapshot}`, margin, y, { ...opts, width: pageW - margin * 2 });
    y += 14;
  }
  y += 6;

  // Divider before two-column body
  doc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor("#cccccc").lineWidth(0.5).stroke();
  y += 12;

  // ---- TWO-COLUMN BODY ----
  // Left: items table   |   Right: first proof image (if any)
  const leftColX = margin;
  const leftColW = firstProof ? 310 : (pageW - margin * 2);
  const rightColX = leftColX + leftColW + 20;
  const rightColW = pageW - rightColX - margin;
  const bodyStartY = y;

  // Items header
  doc.fontSize(10).font("Helvetica-Bold").fillColor("#777");
  doc.text("ITEM", leftColX, y, { ...opts, width: 165 });
  doc.text("QTY", leftColX + 170, y, { ...opts, width: 30, align: "right" });
  doc.text("UNIT", leftColX + 205, y, { ...opts, width: 50, align: "right" });
  doc.text("TOTAL", leftColX + 260, y, { ...opts, width: 50, align: "right" });
  y += 14;
  doc.moveTo(leftColX, y).lineTo(leftColX + leftColW, y).strokeColor("#dddddd").lineWidth(0.5).stroke();
  y += 6;

  let subtotal = 0;
  doc.font("Helvetica").fontSize(10).fillColor("#1a1a1a");
  if (order.lineItems.length === 0) {
    doc.fillColor("#777").text("No products added.", leftColX, y, opts);
    y += 14;
    doc.fillColor("#1a1a1a");
  } else {
    order.lineItems.forEach((li) => {
      const lineTotal = Number(li.lineTotal || 0);
      subtotal += lineTotal;
      const rowY = y;
      doc.font("Helvetica").fontSize(10).fillColor("#1a1a1a");
      doc.text(String(li.productNameSnapshot || ""), leftColX, rowY, { width: 165 });
      doc.text(String(li.qty || 0), leftColX + 170, rowY, { ...opts, width: 30, align: "right" });
      doc.text(money(li.unitPriceFinal), leftColX + 205, rowY, { ...opts, width: 50, align: "right" });
      doc.text(money(lineTotal), leftColX + 260, rowY, { ...opts, width: 50, align: "right" });
      // The item name may wrap; advance y past the tallest column
      const nameH = doc.heightOfString(String(li.productNameSnapshot || ""), { width: 165 });
      y = rowY + Math.max(14, nameH + 2);

      // Sized line metadata in italics, just under the row
      if (li.widthIn != null && li.heightIn != null) {
        const w = Number(li.widthIn);
        const h = Number(li.heightIn);
        const sq = Number(li.sqIn || (w * h));
        const ppsi = Number(li.catalogUnitPriceSnapshot || 0);
        doc.font("Helvetica-Oblique").fontSize(9).fillColor("#666");
        doc.text(`Sized: ${w}" x ${h}"  •  ${sq.toFixed(2)} sq in  •  ${money(ppsi)}/sq in`, leftColX + 6, y, { ...opts, width: leftColW - 6 });
        y += 12;
        doc.font("Helvetica").fontSize(10).fillColor("#1a1a1a");
      }
      y += 4;
    });
  }

  // ---- Right column: first proof image (clipped to right column) ----
  if (firstProof) {
    try {
      const previewFitHeight = 260;
      doc.image(firstProof.storedPath, rightColX, bodyStartY, { fit: [rightColW, previewFitHeight] });
      doc.fontSize(8).font("Helvetica").fillColor("#888");
      doc.text(firstProof.filename, rightColX, bodyStartY + previewFitHeight + 4, { ...opts, width: rightColW, align: "center" });
    } catch (e) {
      console.warn("Failed to embed first proof image:", e?.message || e);
    }
  }

  // Make sure we sit below the right-column preview before drawing the total
  if (firstProof) {
    const previewBottom = bodyStartY + 260 + 16;
    if (y < previewBottom) y = previewBottom;
  }
  y += 6;

  // Divider before total
  doc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor("#cccccc").lineWidth(0.5).stroke();
  y += 12;

  // ---- TOTAL bar (matches quote PDF) ----
  doc.rect(margin, y, pageW - margin * 2, 36).fill("#f0f7ff");
  doc.fontSize(14).font("Helvetica-Bold").fillColor("#1a1a1a");
  doc.text("TOTAL:", margin + 10, y + 11, opts);
  doc.text(money(subtotal), margin + 110, y + 11, opts);
  y += 48;

  // Footer
  doc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor("#eeeeee").lineWidth(0.5).stroke();
  y += 8;
  doc.fontSize(8).font("Helvetica").fillColor("#aaaaaa");
  doc.text(`Work order ${order.orderNumber} • Generated ${new Date().toLocaleString()}`, margin, y, { width: pageW - margin * 2, align: "center", lineBreak: false });

  // ---- Additional proofs (skip the first one we already inlined) ----
  const extraProofs = (Array.isArray(order.proofs) ? order.proofs : []).filter((p) => p !== firstProof);
  for (const proof of extraProofs) {
    try {
      if (!proof || !fs.existsSync(proof.storedPath)) continue;
      doc.addPage();
      let py = margin;

      // Mini header so additional pages match style
      if (logoBuffer) {
        try { doc.image(logoBuffer, margin, py, { fit: [120, 40] }); } catch {}
      }
      doc.fontSize(16).font("Helvetica-Bold").fillColor("#1a1a1a");
      doc.text("PROOF", logoBuffer ? 180 : margin, py, opts);
      doc.fontSize(10).font("Helvetica").fillColor("#666");
      doc.text(`Order #${order.orderNumber}`, logoBuffer ? 180 : margin, py + 22, opts);
      doc.fillColor("#1a1a1a");
      py += 56;

      doc.moveTo(margin, py).lineTo(pageW - margin, py).strokeColor("#cccccc").lineWidth(1).stroke();
      py += 14;

      doc.fontSize(10).font("Helvetica").fillColor("#444");
      doc.text(proof.filename, margin, py, opts);
      py += 16;

      if (!/^image\/(png|jpe?g)$/i.test(proof.mimeType)) {
        doc.fontSize(9).fillColor("#888");
        doc.text(`(Format ${proof.mimeType} cannot be embedded; see file in job folder)`, margin, py, opts);
        continue;
      }

      const maxW = pageW - margin * 2;
      const maxH = pageH - py - margin;
      doc.image(proof.storedPath, margin, py, { fit: [maxW, maxH], align: "center" });
    } catch (e) {
      console.warn("Failed to embed proof:", proof?.id, e?.message || e);
    }
  }

  doc.end();
});
// PATCH /api/orders/:id/delete  (ADMIN only) - soft delete an order
router.patch("/:id/delete", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.prisma;
  const id = req.params.id;

  const initials = requireInitials(req, res);
  if (!initials) return;

  // Make sure order exists
  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "Order not found" });

  // Soft delete
  const updated = await prisma.order.update({
    where: { id },
    data: {
      status: "DELETED",
      deletedAt: new Date(), // only if your schema has deletedAt, otherwise remove this line
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      customerNameSnapshot: true,
      finishedAt: true,
      createdAt: true,
    },
  });

  // Optional: audit log (only if you have auditLog table wired already)
  // If this throws because your schema differs, delete this block.
  try {
    await prisma.auditLog.create({
      data: {
        action: "ORDER_DELETED",
        details: `Order ${updated.orderNumber} deleted`,
        initials,
        detailsJson: { orderId: id, orderNumber: updated.orderNumber },
        actorUser: { connect: { id: req.user.id } },
      },
    });
  } catch (e) {
    console.warn("[AUDIT] failed to log ORDER_DELETED", e?.message || e);
  }

  res.json(updated);
});


// NOTE: Additional endpoints (line items, products on order, attachments/versioning) will be added next.
const API_BASE = "http://localhost:4000/api";

export function getToken() {
  return localStorage.getItem("swc_token") || "";
}

export function setAuth(auth) {
  if (auth?.token) localStorage.setItem("swc_token", auth.token);
  if (auth?.user) localStorage.setItem("swc_user", JSON.stringify(auth.user));
}

export function clearAuth() {
  localStorage.removeItem("swc_token");
  localStorage.removeItem("swc_user");
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem("swc_user") || "null");
  } catch {
    return null;
  }
}
export async function searchOrders(q) {
  return request(`/search?q=${encodeURIComponent(q)}`);
}


async function request(path, { method = "GET", body } = {}) {
  const token = getToken();

  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = data && data.error ? data.error : typeof data === "string" ? data : "Request failed";
    throw new Error(msg);
  }
  return data;
}
export async function downloadCompletedOrdersCsv(initials, filename = "completed-orders.csv") {
  const token = getToken();
  if (!token) throw new Error("Missing login token. Please refresh and log in again.");

  const res = await fetch(
    `${API_BASE}/orders/export/completed?initials=${encodeURIComponent(initials)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || "Failed to download export");
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.URL.revokeObjectURL(url);
}

// ===== convenience helpers =====
export async function downloadOrderPdf(orderId, filename = "work-order.pdf") {
  const token = getToken();

  const res = await fetch(`${API_BASE}/orders/${orderId}/pdf`, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || "Failed to download PDF");
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.URL.revokeObjectURL(url);
}




export const api = {
    // -----------------------
  // Branding (Admin)
  // -----------------------
  brandingGet: () => request("/settings/branding"),
  downloadCompletedOrdersCsv: (initials) => downloadCompletedOrdersCsv(initials),



  brandingUploadLogo: async (file) => {
    const token = getToken();
    const fd = new FormData();
    fd.append("logo", file);

    const res = await fetch(`${API_BASE}/settings/branding/logo`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });

    const isJson = (res.headers.get("content-type") || "").includes("application/json");
    const data = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      const msg = (data && data.error) ? data.error : (typeof data === "string" ? data : "Upload failed");
      throw new Error(msg);
    }
    return data;
  },

  // health/auth
  health: () => request("/health"),
  login: (username, password) => request("/auth/login", { method: "POST", body: { username, password } }),

  // audit
  audit: (take = 50) => request(`/audit?take=${encodeURIComponent(take)}`),
  
brandingSetCompanyName: (companyName) =>
  request("/settings/branding/company-name", { method: "POST", body: { companyName } }),

   
  


  // settings / branding
  branding: () => request("/settings/branding"),
  setCompanyName: (companyName, initials) =>
    request("/settings/branding/company-name", { method: "POST", body: { companyName, initials } }),

  uploadLogo: async (file, initials) => {
    const token = getToken();
    const fd = new FormData();
    fd.append("logo", file);
    fd.append("initials", initials);

    const res = await fetch(`${API_BASE}/settings/logo`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });

    const isJson = (res.headers.get("content-type") || "").includes("application/json");
    const data = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      const msg = data && data.error ? data.error : typeof data === "string" ? data : "Upload failed";
      throw new Error(msg);
    }
    return data;
  },

  // users
  users: () => request("/users"),
  createUser: ({ username, password, role, displayName }) =>
    request("/users", { method: "POST", body: { username, password, role, displayName } }),
  setUserStatus: (id, status, initials) =>
    request(`/users/${id}/status`, { method: "PATCH", body: { status, initials } }),
  setUserRole: (id, role, initials) => request(`/users/${id}/role`, { method: "PATCH", body: { role, initials } }),
  resetUserPassword: (id, password) => request(`/users/${id}/reset-password`, { method: "POST", body: { password } }),
  deleteUser: (id, initials) => request(`/users/${id}`, { method: "DELETE", body: { initials } }),

  // customers
  customers: (q = "") => request(`/customers?q=${encodeURIComponent(q)}`),
  createCustomer: (payload) => request("/customers", { method: "POST", body: payload }),
  archiveCustomer: (id, initials) => request(`/customers/${id}/archive`, { method: "POST", body: { initials } }),

  // products
  products: () => request("/products?active=true"),
  createProduct: (payload) => request("/products", { method: "POST", body: payload }),
  updateProduct: (id, payload) => request(`/products/${id}`, { method: "PUT", body: payload }),
  setProductStatus: (id, status) => request(`/products/${id}/status`, { method: "PATCH", body: { status } }),

  // orders
  ordersByStatus: (status) => request(`/orders?status=${encodeURIComponent(status)}`),
downloadCompletedOrdersCsv: (initials) =>
  `${API_BASE}/orders/export/completed?initials=${encodeURIComponent(initials)}`,

  orderDetail: (id) => request(`/orders/${id}`),
  createOrder: (payload) => request("/orders", { method: "POST", body: payload }),
  completeOrder: (id, initials) => request(`/orders/${id}/complete`, { method: "POST", body: { initials } }),
  deleteOrder: (id, initials) => request(`/orders/${id}/delete`, { method: "PATCH", body: { initials } }),

  exportCompletedOrdersCsv: async (filename = "completed-orders.csv") => {
    const token = getToken();
    const res = await fetch(`${API_BASE}/orders/export/completed`, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || "Export failed");
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    window.URL.revokeObjectURL(url);
  },

  // attachments (Google links + versioning)
  listAttachments: (orderId) => request(`/orders/${orderId}/attachments`),
  createAttachment: (orderId, { label, googleUrl, initials, note }) =>
    request(`/orders/${orderId}/attachments`, {
      method: "POST",
      body: { label, googleUrl, initials, note: note ?? null },
    }),
  addAttachmentVersion: (orderId, attachmentId, { googleUrl, initials, note }) =>
    request(`/orders/${orderId}/attachments/${attachmentId}/versions`, {
      method: "POST",
      body: { googleUrl, initials, note: note ?? null },
    }),
  archiveAttachment: (orderId, attachmentId, initials) =>
    request(`/orders/${orderId}/attachments/${attachmentId}/archive`, {
      method: "POST",
      body: { initials },
    }),
    downloadCompletedOrdersCsv: async (initials) => {
  const token = getToken();
  if (!token) throw new Error("Missing auth token");

  const res = await fetch(
    `${API_BASE}/orders/export/completed`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ initials }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Export failed");
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "completed-orders.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.URL.revokeObjectURL(url);
},

};

export function canWrite(user) {
  if (!user) return false;
  return user.role === "ADMIN" || user.role === "STANDARD";
}
// -----------------------
// Export completed orders (CSV) – Admin only
// POST /api/orders/export/completed
// -----------------------
// Export completed orders as CSV (ADMIN)
router.post("/export/completed", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.prisma;

  const initials = String(req.body?.initials || "").trim().toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(initials)) {
    return res.status(400).json({ error: "Initials must be 2–3 letters" });
  }

  const orders = await prisma.order.findMany({
    where: { status: "FINISHED" },
    orderBy: { finishedAt: "desc" },
    include: {
      customer: true,
      lineItems: true, // <-- IMPORTANT: no product include, your schema has snapshots
    },
  });

  const header = [
    "Order #",
    "Customer",
    "Created Date",
    "Finished Date",
    "Products",
    "Total",
  ];

  const rows = orders.map((o) => {
    const products = (o.lineItems || [])
      .map((li) => `${li.qty}x ${li.productNameSnapshot || "Item"}`)
      .join(" | ");

    // Use stored lineTotal if available (best), else fallback to unitPriceFinal * qty
    const totalNum = (o.lineItems || []).reduce((sum, li) => {
      const lineTotal =
        li.lineTotal !== null && li.lineTotal !== undefined
          ? Number(li.lineTotal)
          : Number(li.unitPriceFinal || 0) * Number(li.qty || 0);
      return sum + (Number.isFinite(lineTotal) ? lineTotal : 0);
    }, 0);

    return [
      o.orderNumber,
      o.customerNameSnapshot || o.customer?.name || "",
      o.createdAt ? new Date(o.createdAt).toLocaleDateString() : "",
      o.finishedAt ? new Date(o.finishedAt).toLocaleDateString() : "",
      products,
      totalNum.toFixed(2),
    ];
  });

  function csvEscape(v) {
    const s = v === null || v === undefined ? "" : String(v);
    if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  const csv =
    [header, ...rows]
      .map((r) => r.map(csvEscape).join(","))
      .join("\n") + "\n";

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=completed-orders.csv");
  res.send(csv);
});


export default router;
