// Helper for creating an OrderProof from a base64 data URL.
// Used by decal order creation flows so the storefront preview snapshot is
// stored on the order and rendered on the work order PDF automatically.

import fs from "fs";
import path from "path";

const PROOFS_ROOT = path.resolve("order-files");

export async function saveProofFromDataUrl(prisma, orderId, dataUrl, {
  filename = "preview.png",
  initials = null,
  eventSummary = "Preview snapshot attached at order creation",
} = {}) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,(.+)$/i);
  if (!m) return null;
  const mimeType = m[1].toLowerCase();
  const buffer = Buffer.from(m[2], "base64");

  const dir = path.join(PROOFS_ROOT, orderId, "proofs");
  fs.mkdirSync(dir, { recursive: true });

  // Determine extension from MIME type
  const extMap = { "image/png": ".png", "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/webp": ".webp", "image/gif": ".gif" };
  const ext = extMap[mimeType] || ".png";
  const safeBase = path.basename(filename, path.extname(filename)).replace(/[^a-zA-Z0-9._-]/g, "_") || "preview";
  const stamp = Date.now();
  const finalName = `${stamp}_${safeBase}${ext}`;
  const storedPath = path.join(dir, finalName);
  fs.writeFileSync(storedPath, buffer);

  const created = await prisma.orderProof.create({
    data: {
      orderId,
      filename: `${safeBase}${ext}`,
      storedPath,
      mimeType,
      createdByInitials: initials,
    },
  });

  try {
    await prisma.orderHistory.create({
      data: {
        orderId,
        eventType: "PROOF_UPLOADED",
        initials,
        summary: eventSummary,
        detailsJson: { proofId: created.id, filename: created.filename, source: "decal-configurator" },
      },
    });
  } catch (e) {
    // Non-fatal: a missing history entry shouldn't break order creation.
    console.warn("Failed to add proof-history entry:", e?.message || e);
  }

  return created;
}
