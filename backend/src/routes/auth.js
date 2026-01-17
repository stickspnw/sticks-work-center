import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";

const router = express.Router();

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const { username, password } = parsed.data;
  const prisma = req.prisma;

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || user.status !== "ACTIVE") return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const token = jwt.sign(
    { sub: user.id, username: user.username, role: user.role, name: user.name },
    process.env.JWT_SECRET || "dev-secret",
    { expiresIn: "12h" }
  );

  res.json({ token, user: { id: user.id, username: user.username, role: user.role, name: user.name } });
});

export default router;
