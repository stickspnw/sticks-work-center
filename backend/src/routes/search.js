import express from "express";
import { requireAuth } from "../middleware/auth.js";


const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  const prisma = req.prisma;
  const qRaw = (req.query.q || "").toString().trim();

  if (!qRaw) return res.json([]);

  // Normalize search (helpful for "ord000021" vs "ORD000021")
  const q = qRaw;
  const qUpper = qRaw.toUpperCase();

  // ORD prefix detection (optional but helps)
  const looksLikeOrder = qUpper.startsWith("ORD") || /^[0-9]{3,}$/.test(qUpper);

  // Find Orders (by orderNumber OR customer snapshots)
  const orders = await prisma.order.findMany({
    where: {
      status: { not: "DELETED" },
      OR: [
        { orderNumber: { contains: qUpper, mode: "insensitive" } },
        { customerNameSnapshot: { contains: q, mode: "insensitive" } },
        { customerPhoneSnapshot: { contains: q, mode: "insensitive" } },
        { customerEmailSnapshot: { contains: q, mode: "insensitive" } },
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

  // Find Customers (by name/phone/email)
  const customers = await prisma.customer.findMany({
    where: {
      isArchived: false,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { dateAdded: "desc" },
    take: 10,
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
    },
  });

  // Shape results for the frontend dropdown
  const orderResults = orders.map(o => ({
    type: "order",
    id: o.id,
    label: `${o.orderNumber} — ${o.customerNameSnapshot}`,
    orderNumber: o.orderNumber,
    customerName: o.customerNameSnapshot,
    status: o.status,
  }));

  const customerResults = customers.map(c => ({
    type: "customer",
    id: c.id,
    label: c.name,
    name: c.name,
    phone: c.phone,
    email: c.email,
  }));

  // If it looks like an order search, put Orders first
  const results = looksLikeOrder
    ? [...orderResults, ...customerResults]
    : [...customerResults, ...orderResults];

  res.json(results.slice(0, 12));
});

export default router;
