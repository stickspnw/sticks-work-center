import express from "express";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
}

// GET /api/audit?take=75  (admin only)
router.get("/", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.prisma;
  const takeRaw = Number(req.query.take || 50);
  const take = Math.min(Math.max(takeRaw, 1), 200);

  const rows = await prisma.auditLog.findMany({
    take,
    orderBy: { createdAt: "desc" },
    include: {
      actorUser: { select: { id: true, username: true, displayName: true, name: true } },
      
    },
  });

  // Shape it to match Admin.jsx expectations: r.actor / r.target
  const out = rows.map((r) => ({
    id: r.id,
    action: r.action,
    initials: r.initials,
    details: r.details,
    detailsJson: r.detailsJson,
    createdAt: r.createdAt,
    targetUserId: r.targetUserId,
    actor: r.actorUser
      ? {
          id: r.actorUser.id,
          username: r.actorUser.username,
          displayName: r.actorUser.displayName || r.actorUser.name || null,
        }
      : null,
    target: r.targetUser
      ? {
          id: r.targetUser.id,
          username: r.targetUser.username,
          displayName: r.targetUser.displayName || r.targetUser.name || null,
        }
      : null,
  }));

  res.json(out);
});

export default router;
