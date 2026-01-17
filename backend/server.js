import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { PrismaClient } from "@prisma/client";

import authRouter from "./src/routes/auth.js";
import customersRouter from "./src/routes/customers.js";
import productsRouter from "./src/routes/products.js";
import ordersRouter from "./src/routes/orders.js";
import settingsRouter from "./src/routes/settings.js";
import usersRouter from "./src/routes/users.js";
import auditRouter from "./src/routes/audit.js";
import searchRouter from "./src/routes/search.js";

dotenv.config();

const prisma = new PrismaClient();
const app = express();

app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));

// Prisma available in routes as req.prisma
app.use((req, _res, next) => {
  req.prisma = prisma;
  next();
});

// Serve uploaded branding assets
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Routes
app.use("/api/auth", authRouter);
app.use("/api/customers", customersRouter);
app.use("/api/products", productsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/users", usersRouter);
app.use("/api/audit", auditRouter);
app.use("/api/search", searchRouter);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
