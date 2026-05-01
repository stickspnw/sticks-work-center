import express from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { resolveInitials } from "../lib/initials.js";

const router = express.Router();

const CustomerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  shippingAddress: z.string().min(3),
});

function hasPhoneOrEmail(data) {
  const phone = (data.phone || "").trim();
  const email = (data.email || "").trim();
  return phone.length > 0 || email.length > 0;
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
}

function requireInitials(req /* , res */) {
  return resolveInitials(req);
}

function getActorId(req) {
  return req.user?.id || req.user?.sub || req.userId || null;
}

async function logAudit(prisma, req, {
  action,
  targetUserId = null,
  details = "",
  detailsJson = null,
  initials = null,
}) {
  const actorId = getActorId(req);
  if (!actorId) return;
  await prisma.auditLog.create({
    data: {
      action,
      targetUserId,
      details,
      initials,
      detailsJson: detailsJson ?? {},
      actorUser: { connect: { id: actorId } },
    },
  });
}

// GET /api/customers?q=...
router.get("/", requireAuth, async (req, res) => {
  const q = (req.query.q || "").toString().trim();
  const prisma = req.prisma;

  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
        isArchived: false,
      }
    : { isArchived: false };

  const customers = await prisma.customer.findMany({
    where,
    orderBy: { dateAdded: "desc" },
  });

  res.json(customers);
});

// POST /api/customers
router.post("/", requireAuth, async (req, res) => {
  const parsed = CustomerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  if (!hasPhoneOrEmail(parsed.data)) {
    return res.status(400).json({ error: "Phone or Email is required" });
  }

  const prisma = req.prisma;
  const created = await prisma.customer.create({
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      email: parsed.data.email ? parsed.data.email.toLowerCase() : null,
      shippingAddress: parsed.data.shippingAddress,
    },
  });

  res.json(created);
});

// PUT /api/customers/:id
router.put("/:id", requireAuth, async (req, res) => {
  const parsed = CustomerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  if (!hasPhoneOrEmail(parsed.data)) {
    return res.status(400).json({ error: "Phone or Email is required" });
  }

  const prisma = req.prisma;
  const updated = await prisma.customer.update({
    where: { id: req.params.id },
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      email: parsed.data.email ? parsed.data.email.toLowerCase() : null,
      shippingAddress: parsed.data.shippingAddress,
    },
  });

  res.json(updated);
});

// POST /api/customers/:id/archive (admin only)
router.post("/:id/archive", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.prisma;
  const id = req.params.id;

  const initials = requireInitials(req, res);
  if (!initials) return;

  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "Customer not found" });

  const updated = await prisma.customer.update({
    where: { id },
    data: { isArchived: true },
  });

 // ✅ Audit (Customer archived) - do NOT use targetUserId/targetCustomerId (doesn't exist in schema)
const actorId = req.user?.id || req.user?.sub || req.userId || null;

if (actorId) {
  await prisma.auditLog.create({
    data: {
      action: "CUSTOMER_ARCHIVED",
      actorUser: { connect: { id: actorId } },
      // no targetUser here; customer isn't a User model
      detailsJson: {
        customerId: id,
        customerName: existing?.name ?? updated?.name ?? null,
      },
      initials,
    },
  });
}


  res.json(updated);
});

export default router;
