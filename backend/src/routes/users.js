// backend/src/routes/users.js
import express from "express";
import bcrypt from "bcryptjs";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

/**
 * Admin guard:
 * assumes requireAuth sets req.user with { id, role, ... }
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
}

/**
 * initials guard (2–3 letters)
 */
function requireInitials(req, res) {
  const initials = String(req.body?.initials || "").trim().toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(initials)) {
    res.status(400).json({ error: "Initials must be 2–3 letters" });
    return null;
  }
  return initials;
}

function getActorId(req) {
  // your auth middleware might set one of these
  return req.user?.id || req.user?.sub || req.userId || null;
}

/**
 * Audit logger
 * IMPORTANT: Your AuditLog model does NOT have `details`.
 * Put human-readable text into detailsJson instead.
 */
async function logAudit(
  prisma,
  req,
  { action, targetUserId = null, details = "", detailsJson = null, initials = null }
) {
  const actorId = getActorId(req);

  // don't block the action; just skip logging if actor missing
  if (!actorId) {
    console.warn("[AUDIT] Missing actorId on req.user:", req.user);
    return;
  }

  await prisma.auditLog.create({
    data: {
      action,
      targetUserId,
      initials,

      // Store your readable message + any extra json payload here
      detailsJson: {
        message: details || "",
        ...(detailsJson ?? {}),
      },

      // relation (correct way)
      actorUser: { connect: { id: actorId } },
    },
  });
}

// GET /api/users (admin only) - list users
router.get("/", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.prisma;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      name: true,
      displayName: true,
      role: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  res.json(users);
});

// PATCH /api/users/:id/status (admin only) - enable/disable (initials required)
router.patch("/:id/status", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.prisma;
  const userId = req.params.id;

  const initials = requireInitials(req, res);
  if (!initials) return;

  const next = String(req.body?.status || "").toUpperCase();
  if (!["ACTIVE", "DISABLED"].includes(next)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  // don't let admin disable themselves
  if (getActorId(req) === userId && next === "DISABLED") {
    return res.status(400).json({ error: "Cannot disable yourself" });
  }

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) return res.status(404).json({ error: "User not found" });

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { status: next },
    select: {
      id: true,
      username: true,
      name: true,
      displayName: true,
      role: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  await logAudit(prisma, req, {
    action: "USER_STATUS_CHANGED",
    targetUserId: userId,
    details: `Status set to ${next}`,
    detailsJson: { status: next },
    initials,
  });

  res.json(updated);
});

// PATCH /api/users/:id/role (admin only) - update role (initials required)
router.patch("/:id/role", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.prisma;
  const id = req.params.id;

  const initials = requireInitials(req, res);
  if (!initials) return;

  const role = String(req.body?.role || "").toUpperCase();
  const allowed = ["ADMIN", "STANDARD", "READ_ONLY"];
  if (!allowed.includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }

  // safety: don't allow changing your own role
  if (getActorId(req) === id) {
    return res.status(400).json({ error: "You cannot change your own role" });
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "User not found" });

  const updated = await prisma.user.update({
    where: { id },
    data: { role },
    select: {
      id: true,
      username: true,
      name: true,
      displayName: true,
      role: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  await logAudit(prisma, req, {
    action: "USER_ROLE_CHANGED",
    targetUserId: id,
    details: `Role set to ${role}`,
    detailsJson: { role },
    initials,
  });

  res.json(updated);
});

// POST /api/users (admin only) - create user
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.prisma;

  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "").trim();
  const roleRaw = String(req.body?.role || "STANDARD").trim().toUpperCase();
  const displayNameRaw =
    req.body?.displayName === null ? "" : String(req.body?.displayName || "").trim();

  if (username.length < 3)
    return res.status(400).json({ error: "Username must be at least 3 characters" });
  if (password.length < 4)
    return res.status(400).json({ error: "Password must be at least 4 characters" });

  const allowed = ["ADMIN", "STANDARD", "READ_ONLY"];
  const role = allowed.includes(roleRaw) ? roleRaw : "STANDARD";

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) return res.status(409).json({ error: "Username already exists" });

  const passwordHash = await bcrypt.hash(password, 10);

  // Prisma requires name (String). Always set it.
  const safeDisplayName = displayNameRaw.length ? displayNameRaw : null;
  const name = safeDisplayName || username;

  const created = await prisma.user.create({
    data: {
      username,
      passwordHash,
      role,
      status: "ACTIVE",
      name,
      displayName: safeDisplayName,
      lastLoginAt: null,
    },
    select: {
      id: true,
      username: true,
      name: true,
      displayName: true,
      role: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  await logAudit(prisma, req, {
    action: "USER_CREATED",
    targetUserId: created.id,
    details: `Created user ${created.username}`,
    detailsJson: { username: created.username },
    initials: "SYS",
  });

  res.json(created);
});

// POST /api/users/:id/reset-password (admin only)
router.post("/:id/reset-password", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.prisma;
  const id = req.params.id;

  const password = String(req.body?.password || "").trim();
  if (password.length < 4)
    return res.status(400).json({ error: "Password must be at least 4 characters" });

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.update({
    where: { id },
    data: { passwordHash },
  });

  await logAudit(prisma, req, {
    action: "USER_PASSWORD_RESET",
    targetUserId: id,
    details: "Password reset",
    detailsJson: {},
    initials: "SYS",
  });

  res.json({ ok: true });
});


// POST /api/users/:id/delete (admin only) - soft delete (DISABLED)
router.post("/:id/delete", requireAuth, requireAdmin, async (req, res) => {
  const prisma = req.prisma;
  const id = String(req.params.id);
  const initials = requireInitials(req, res);
  if (!initials) return;

  const actorId = getActorId(req);
  if (!actorId) return res.status(401).json({ error: "Invalid auth token" });

  if (id === actorId) {
    return res.status(400).json({ error: "You cannot delete your own user." });
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "User not found" });

  const updated = await prisma.user.update({
    where: { id },
    data: { status: "DISABLED" },
  });

  await logAudit(prisma, {
    actorUserId: actorId,
    targetUserId: id,
    action: "USER_DELETED",
    initials,
    details: `Deleted user ${existing.username}`,
    detailsJson: { username: existing.username },
  });

  res.json({ ok: true, user: updated });
});

export default router;
