import { Router } from "express";
import PDFDocument from "pdfkit";

const router = Router();

// Helper: inches to PDF points (1 inch = 72 points)
const inToPt = (inches) => inches * 72;

// POST /api/decal-files/cut-vinyl
// Body: { text, height, font, isBold, isItalic, charSpacing, hasOffset, offsetSize }
// Returns PDF with text at actual size for vinyl cutting
router.post("/cut-vinyl", (req, res) => {
  try {
    const { text, height, font, isBold, isItalic, charSpacing, hasOffset, offsetSize, layer } = req.body;

    if (!text || !height) {
      return res.status(400).json({ error: "text and height are required" });
    }

    const hIn = parseFloat(height);
    const offsetIn = hasOffset ? parseFloat(offsetSize || 0) : 0;

    // Determine which layer to generate
    // "text" = just the text, "offset" = offset background only
    const isOffsetLayer = layer === "offset";

    // Calculate text width using PDFKit's measurement
    const doc = new PDFDocument({ size: [inToPt(48), inToPt(48)], margin: 0 });
    const fontName = mapFont(font);
    doc.font(fontName);
    if (isBold && !isOffsetLayer) doc.font(fontName + "-Bold");
    const fontSize = inToPt(hIn);
    doc.fontSize(fontSize);

    // Measure text width
    const textWidth = doc.widthOfString(text, { characterSpacing: inToPt(charSpacing || 0) / fontSize * fontSize });

    // Page size: text width + offset padding, height + offset padding
    const totalW = textWidth + inToPt(offsetIn * 2) + 36; // 36pt = 0.5" margin
    const totalH = fontSize + inToPt(offsetIn * 2) + 36;

    // Create the actual PDF with correct page size
    const pdfDoc = new PDFDocument({
      size: [totalW, totalH],
      margin: 0,
      autoFirstPage: true,
    });

    const chunks = [];
    pdfDoc.on("data", (chunk) => chunks.push(chunk));
    pdfDoc.on("end", () => {
      const pdfBuffer = Buffer.concat(chunks);
      const layerName = isOffsetLayer ? "offset" : "text";
      const filename = `cut-vinyl-${layerName}-${text.replace(/\s+/g, "-").toLowerCase()}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    });

    // Position text centered with offset padding
    const x = 18 + inToPt(offsetIn); // 18pt = 0.25" left margin
    const y = 18 + inToPt(offsetIn); // 18pt = 0.25" top margin

    pdfDoc.font(fontName);
    if (isBold) pdfDoc.font(fontName + "-Bold");

    if (isOffsetLayer) {
      // Offset layer: render text as outline/stroke only
      pdfDoc.fontSize(fontSize);
      pdfDoc.save();
      // Draw offset outline by rendering text with stroke
      const strokeW = inToPt(offsetIn);
      pdfDoc.lineWidth(strokeW);
      pdfDoc.strokeColor("#000000");
      // Use a path approach - render text, then stroke it
      pdfDoc.text(text, x, y, {
        characterSpacing: inToPt(charSpacing || 0) / fontSize * fontSize,
        lineBreak: false,
      });
      pdfDoc.restore();
    } else {
      // Text layer: render text as filled vector
      pdfDoc.fontSize(fontSize);
      pdfDoc.fillColor("#000000");
      pdfDoc.text(text, x, y, {
        characterSpacing: inToPt(charSpacing || 0) / fontSize * fontSize,
        lineBreak: false,
      });
    }

    pdfDoc.end();
  } catch (err) {
    console.error("Cut vinyl PDF error:", err);
    res.status(500).json({ error: "Failed to generate cut file" });
  }
});

// POST /api/decal-files/printed-decal
// Body: { width, height, shape, backgroundColor }
// Accepts multipart/form-data with image file
router.post("/printed-decal", (req, res) => {
  try {
    const { width, height, shape, backgroundColor } = req.body;

    if (!width || !height) {
      return res.status(400).json({ error: "width and height are required" });
    }

    const wIn = parseFloat(width);
    const hIn = parseFloat(height);

    // PDF page size = decal size + small margin
    const margin = 18; // 0.25"
    const pageW = inToPt(wIn) + margin * 2;
    const pageH = inToPt(hIn) + margin * 2;

    const pdfDoc = new PDFDocument({
      size: [pageW, pageH],
      margin: 0,
    });

    const chunks = [];
    pdfDoc.on("data", (chunk) => chunks.push(chunk));
    pdfDoc.on("end", () => {
      const pdfBuffer = Buffer.concat(chunks);
      const filename = `printed-decal-${wIn}x${hIn}-${shape}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    });

    // Draw background color if not transparent
    if (backgroundColor && backgroundColor !== "transparent") {
      pdfDoc.save();
      if (shape === "circle") {
        const cx = pageW / 2;
        const cy = pageH / 2;
        const r = Math.min(inToPt(wIn), inToPt(hIn)) / 2;
        pdfDoc.circle(cx, cy, r).fill(backgroundColor);
      } else {
        const rr = shape === "rectangle" ? 0 : 12;
        pdfDoc.roundedRect(margin, margin, inToPt(wIn), inToPt(hIn), rr).fill(backgroundColor);
      }
      pdfDoc.restore();
    }

    // Draw shape outline
    pdfDoc.save();
    pdfDoc.lineWidth(1);
    pdfDoc.strokeColor("#000000");
    if (shape === "circle") {
      const cx = pageW / 2;
      const cy = pageH / 2;
      const r = Math.min(inToPt(wIn), inToPt(hIn)) / 2;
      pdfDoc.circle(cx, cy, r).stroke();
    } else {
      const rr = shape === "rectangle" ? 0 : 12;
      pdfDoc.roundedRect(margin, margin, inToPt(wIn), inToPt(hIn), rr).stroke();
    }
    pdfDoc.restore();

    // Add note about image placement
    pdfDoc.fontSize(8);
    pdfDoc.fillColor("#999999");
    pdfDoc.text("Printed Decal - Place image within shape boundary", margin, pageH - 14, { width: pageW - margin * 2, align: "center" });

    pdfDoc.end();
  } catch (err) {
    console.error("Printed decal PDF error:", err);
    res.status(500).json({ error: "Failed to generate print file" });
  }
});

// Map frontend font names to PDFKit font names
function mapFont(font) {
  const map = {
    "Arial": "Helvetica",
    "Arial Black": "Helvetica",
    "Helvetica": "Helvetica",
    "Impact": "Helvetica",
    "Times New Roman": "Times-Roman",
    "Courier New": "Courier",
    "Georgia": "Times-Roman",
    "Verdana": "Helvetica",
    "Trebuchet MS": "Helvetica",
    "Lucida Console": "Courier",
    "Futura": "Helvetica",
  };
  return map[font] || "Helvetica";
}

export default router;
