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
import vinylRouter from "./src/routes/vinyl.js";
import decalFilesRouter from "./src/routes/decal-files.js";

dotenv.config();

const prisma = new PrismaClient();
const app = express();
app.set("trust proxy", true);

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({ limit: "50mb" }));

// Prisma available in routes as req.prisma
app.use((req, _res, next) => {
  req.prisma = prisma;
  next();
});

// Serve uploaded branding assets
app.use("/uploads", express.static(path.resolve("uploads")));

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
app.use("/api/vinyl", vinylRouter);
app.use("/api/decal-files", decalFilesRouter);

// ---- Serve built frontend (IMPORTANT) ----
const frontendDist = path.resolve("..", "frontend", "dist");
app.use(express.static(frontendDist));

// SPA fallback BUT do NOT catch /api or /uploads
app.get(/^\/(?!api|uploads).*/, (req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

const port = process.env.PORT || 4001;

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
