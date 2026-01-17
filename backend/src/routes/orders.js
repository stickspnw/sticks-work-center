import express from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { nextOrderNumber } from "../lib/orderNumber.js";
import PDFDocument from "pdfkit";

const router = express.Router();
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
    include: { customer: true },
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
    })).optional(),

    lineItems: z.array(z.object({
      productId: z.string().min(1),
      qty: z.number().int().min(1),
      overridePrice: z.number().nonnegative().optional().nullable(),
      overrideReason: z.string().optional().nullable(),
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
    }))
    .concat(
      (parsed.data.lineItems || []).map(li => ({
        productId: li.productId,
        qty: li.qty,
        overrideUnitPrice: li.overridePrice ?? null,
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
      const unitFinal = overridden ? Number(i.overrideUnitPrice) : catalog;
      const qty = Number(i.qty);
      const lineTotal = qty * unitFinal;

      createLineItems.push({
        productId: p.id,
        productNameSnapshot: p.name,
        catalogUnitPriceSnapshot: catalog,
        unitPriceFinal: unitFinal,
        qty,
        lineTotal,
        isPriceOverridden: overridden,
        overrideReason: null, // keep history/internal; PDF won't show reasons anyway
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

router.get("/:id/pdf", requireAuth, async (req, res) => {
  const prisma = req.prisma;
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      lineItems: true,
      attachments: { include: { versions: true } },
    }
  });
  if (!order) return res.status(404).send("Not found");

  const settings = await prisma.setting.findMany();
  const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]));
  const brandName = settingsMap.brand_name || "Sticks Work Center";

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${order.orderNumber}.pdf"`);

  const doc = new PDFDocument({ margin: 36 });
  doc.pipe(res);

  // Header
  doc.fontSize(18).text(brandName, { align: "left" });
  doc.moveDown(0.2);
  doc.fontSize(14).text("Work Order", { align: "left" });
  doc.moveDown(0.4);
  doc.moveTo(36, doc.y).lineTo(576, doc.y).stroke();
  doc.moveDown(0.6);

  doc.fontSize(12).text(`Order #: ${order.orderNumber}`);
  doc.text(`Status: ${order.status === "WIP" ? "Work In Progress" : "Completed Works"}`);
  doc.text(`Created: ${order.createdAt.toLocaleString()}`);
  if (order.finishedAt) doc.text(`Completed: ${order.finishedAt.toLocaleString()}`);
  doc.moveDown(0.6);

  // Customer snapshot
  doc.fontSize(12).text("Customer", { underline: true });
  doc.moveDown(0.2);
  doc.fontSize(11).text(`Name: ${order.customerNameSnapshot}`);
  if (order.customerPhoneSnapshot) doc.text(`Phone: ${order.customerPhoneSnapshot}`);
  if (order.customerEmailSnapshot) doc.text(`Email: ${order.customerEmailSnapshot}`);
  doc.text("Shipping Address:");
  doc.text(order.customerShippingAddressSnapshot);
  doc.moveDown(0.6);

   // Products / Charges (NO override indicators on PDF)
  doc.fontSize(12).text("Products / Charges", { underline: true });
  doc.moveDown(0.2);

  const money = (n) => `$${Number(n || 0).toFixed(2)}`;

  let subtotal = 0;

  if (order.lineItems.length === 0) {
    doc.fontSize(11).text("No products added.");
  } else {
    // Column positions
    const xItem = 36;
    const xQty = 320;
    const xUnit = 380;
    const xTotal = 500;

    // Header row
    const y0 = doc.y;
    doc.fontSize(10).font("Helvetica-Bold");
    doc.text("Item", xItem, y0);
    doc.text("Qty", xQty, y0, { width: 40, align: "right" });
    doc.text("Unit", xUnit, y0, { width: 80, align: "right" });
    doc.text("Total", xTotal, y0, { width: 76, align: "right" });

    doc.moveDown(0.3);
    doc.moveTo(36, doc.y).lineTo(576, doc.y).stroke();
    doc.moveDown(0.4);

    doc.font("Helvetica").fontSize(10);

    order.lineItems.forEach((li) => {
      const lineTotal = Number(li.lineTotal || 0);
      subtotal += lineTotal;

      const rowY = doc.y;

      // Item name (no override mark)
      doc.text(String(li.productNameSnapshot || ""), xItem, rowY, { width: 270 });

      // Qty
      doc.text(String(li.qty || 0), xQty, rowY, { width: 40, align: "right" });

      // Unit price (final, but no explanation)
      doc.text(money(li.unitPriceFinal), xUnit, rowY, { width: 80, align: "right" });

      // Line total
      doc.text(money(lineTotal), xTotal, rowY, { width: 76, align: "right" });

      doc.moveDown(0.2);

      // Prevent text overlap if item name wrapped
      if (doc.y < rowY + 14) doc.moveDown(0.6);
    });

    doc.moveDown(0.3);
    doc.save();
doc.strokeColor("#b00020").lineWidth(2);
doc.moveTo(36, doc.y).lineTo(576, doc.y).stroke();
doc.restore();

    doc.moveDown(0.4);

    doc.font("Helvetica-Bold").fontSize(11);
    doc.text(`Subtotal: ${money(subtotal)}`, { align: "right" });
    doc.text(`Total: ${money(subtotal)}`, { align: "right" });
    doc.font("Helvetica").fontSize(11);
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
