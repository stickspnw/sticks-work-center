import { Router } from "express";
import PDFDocument from "pdfkit";
import opentype from "opentype.js";
import fs from "fs";
import path from "path";

const router = Router();

// 1 inch = 72 PDF points
const PT = 72;
const MATERIAL_WIDTH = 24; // inches
const STROKE_WIDTH = 0.01 * PT; // 0.01 inch stroke
const BOX_PAD = 0.5; // 0.5" each side = 1" total taller/wider

// DECAL# counter — persists in memory, never repeats
let decalCounter = 0;
try {
  const counterFile = path.resolve("decal-counter.txt");
  if (fs.existsSync(counterFile)) {
    decalCounter = parseInt(fs.readFileSync(counterFile, "utf8"), 10) || 0;
  }
} catch {}

function nextDecalNumber() {
  decalCounter++;
  try {
    fs.writeFileSync(path.resolve("decal-counter.txt"), String(decalCounter));
  } catch {}
  return decalCounter;
}

// Font file mapping (Windows system fonts)
const FONT_DIR = "C:\\Windows\\Fonts";
const FONT_MAP = {
  "Impact":                   { regular: "impact.ttf",    bold: "impact.ttf",    italic: "impact.ttf",    boldItalic: "impact.ttf" },
  "Stencil":                  { regular: "STENCIL.TTF",   bold: "STENCIL.TTF",   italic: "STENCIL.TTF",   boldItalic: "STENCIL.TTF" },
  "Arial Black":              { regular: "arialbd.ttf",   bold: "arialbd.ttf",   italic: "arialbi.ttf",   boldItalic: "arialbi.ttf" },
  "Felix Titling":            { regular: "FELIXTI.TTF",   bold: "FELIXTI.TTF",   italic: "FELIXTI.TTF",   boldItalic: "FELIXTI.TTF" },
  "Onyx":                     { regular: "ONYX.TTF",      bold: "ONYX.TTF",      italic: "ONYX.TTF",      boldItalic: "ONYX.TTF" },
  "Playbill":                 { regular: "PLAYBILL.TTF",  bold: "PLAYBILL.TTF",  italic: "PLAYBILL.TTF",  boldItalic: "PLAYBILL.TTF" },
  "Old English Text MT":      { regular: "OLDENGL.TTF",   bold: "OLDENGL.TTF",   italic: "OLDENGL.TTF",   boldItalic: "OLDENGL.TTF" },
  "Rage Italic":              { regular: "RAGE.TTF",      bold: "RAGE.TTF",      italic: "RAGE.TTF",      boldItalic: "RAGE.TTF" },
  "Matura MT Script Capitals":{ regular: "MATURASC.TTF",  bold: "MATURASC.TTF",  italic: "MATURASC.TTF",  boldItalic: "MATURASC.TTF" },
  "Mistral":                  { regular: "MISTRAL.TTF",   bold: "MISTRAL.TTF",   italic: "MISTRAL.TTF",   boldItalic: "MISTRAL.TTF" },
  "Forte":                    { regular: "FORTE.TTF",     bold: "FORTE.TTF",     italic: "FORTE.TTF",     boldItalic: "FORTE.TTF" },
  "Freestyle Script":         { regular: "FRSCRIPT.TTF",  bold: "FRSCRIPT.TTF",  italic: "FRSCRIPT.TTF",  boldItalic: "FRSCRIPT.TTF" },
  "Brush Script MT":          { regular: "SCRIPTBL.TTF",  bold: "SCRIPTBL.TTF",  italic: "SCRIPTBL.TTF",  boldItalic: "SCRIPTBL.TTF" },
  "Vladimir Script":          { regular: "VLADIMIR.TTF",  bold: "VLADIMIR.TTF",  italic: "VLADIMIR.TTF",  boldItalic: "VLADIMIR.TTF" },
  "Curlz MT":                 { regular: "CURLZ___.TTF",  bold: "CURLZ___.TTF",  italic: "CURLZ___.TTF",  boldItalic: "CURLZ___.TTF" },
  "Jokerman":                 { regular: "JOKERMAN.TTF",  bold: "JOKERMAN.TTF",  italic: "JOKERMAN.TTF",  boldItalic: "JOKERMAN.TTF" },
  "Niagara Engraved":         { regular: "NIAGENG.TTF",   bold: "NIAGENG.TTF",   italic: "NIAGENG.TTF",   boldItalic: "NIAGENG.TTF" },
  "Niagara Solid":            { regular: "NIAGSOL.TTF",   bold: "NIAGSOL.TTF",   italic: "NIAGSOL.TTF",   boldItalic: "NIAGSOL.TTF" },
  "Cooper Black":             { regular: "COOPBL.TTF",    bold: "COOPBL.TTF",    italic: "COOPBL.TTF",    boldItalic: "COOPBL.TTF" },
  "Gill Sans Ultra Bold":     { regular: "GILSANUB.TTF",  bold: "GILSANUB.TTF",  italic: "GILSANUB.TTF",  boldItalic: "GILSANUB.TTF" },
  "Rockwell Extra Bold":      { regular: "ROCKEB.TTF",    bold: "ROCKEB.TTF",    italic: "ROCKEB.TTF",    boldItalic: "ROCKEB.TTF" },
  "Showcard Gothic":          { regular: "SHOWG.TTF",     bold: "SHOWG.TTF",     italic: "SHOWG.TTF",     boldItalic: "SHOWG.TTF" },
  "Magneto":                  { regular: "MAGNETOB.TTF",  bold: "MAGNETOB.TTF",  italic: "MAGNETOB.TTF",  boldItalic: "MAGNETOB.TTF" },
  "Ravie":                    { regular: "RAVIE.TTF",     bold: "RAVIE.TTF",     italic: "RAVIE.TTF",     boldItalic: "RAVIE.TTF" },
  "Papyrus":                  { regular: "PAPYRUS.TTF",   bold: "PAPYRUS.TTF",   italic: "PAPYRUS.TTF",   boldItalic: "PAPYRUS.TTF" },
  "Goudy Old Style":          { regular: "GOUDOS.TTF",    bold: "GOUDOSB.TTF",   italic: "GOUDOSI.TTF",   boldItalic: "GOUDOSB.TTF" },
  "Copperplate Gothic":       { regular: "COPRGTB.TTF",   bold: "COPRGTB.TTF",   italic: "COPRGTB.TTF",   boldItalic: "COPRGTB.TTF" },
  "Engravers MT":             { regular: "ENGR.TTF",      bold: "ENGR.TTF",      italic: "ENGR.TTF",      boldItalic: "ENGR.TTF" },
  "OCR A Extended":           { regular: "OCRAEXT.TTF",   bold: "OCRAEXT.TTF",   italic: "OCRAEXT.TTF",   boldItalic: "OCRAEXT.TTF" },
  "Century Gothic":           { regular: "GOTHIC.TTF",    bold: "GOTHICB.TTF",   italic: "GOTHICI.TTF",   boldItalic: "GOTHICBI.TTF" },
  "Arial":                    { regular: "arial.ttf",     bold: "arialbd.ttf",   italic: "ariali.ttf",    boldItalic: "arialbi.ttf" },
  "Helvetica":                { regular: "arial.ttf",     bold: "arialbd.ttf",   italic: "ariali.ttf",    boldItalic: "arialbi.ttf" },
  "Times New Roman":          { regular: "times.ttf",      bold: "timesbd.ttf",   italic: "timesi.ttf",    boldItalic: "timesbi.ttf" },
  "Courier New":              { regular: "cour.ttf",       bold: "courbd.ttf",    italic: "couri.ttf",     boldItalic: "courbi.ttf" },
  "Georgia":                  { regular: "georgia.ttf",    bold: "georgiab.ttf",  italic: "georgiai.ttf",  boldItalic: "georgiaz.ttf" },
  "Verdana":                  { regular: "verdana.ttf",    bold: "verdanab.ttf",  italic: "verdanai.ttf",  boldItalic: "verdanaz.ttf" },
  "Trebuchet MS":             { regular: "trebuc.ttf",     bold: "trebucbd.ttf",  italic: "trebucit.ttf",  boldItalic: "trebucbi.ttf" },
  "Lucida Console":           { regular: "lucon.ttf",      bold: "lucon.ttf",     italic: "lucon.ttf",     boldItalic: "lucon.ttf" },
  "Futura":                   { regular: "arial.ttf",      bold: "arialbd.ttf",   italic: "ariali.ttf",    boldItalic: "arialbi.ttf" },
};

function getFontFile(fontName, isBold, isItalic) {
  const map = FONT_MAP[fontName] || FONT_MAP["Arial"];
  if (isBold && isItalic) return map.boldItalic;
  if (isBold) return map.bold;
  if (isItalic) return map.italic;
  return map.regular;
}

function loadFont(fontName, isBold, isItalic) {
  const fileName = getFontFile(fontName, isBold, isItalic);
  const filePath = path.join(FONT_DIR, fileName);
  try {
    const buf = fs.readFileSync(filePath);
    return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  } catch (e) {
    // Fallback to Arial
    try {
      const buf = fs.readFileSync(path.join(FONT_DIR, "arial.ttf"));
      return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    } catch (e2) {
      throw new Error("Failed to load font: " + e.message + " / " + e2.message);
    }
  }
}

// Convert text to SVG path data using opentype.js
function textToPathData(font, text, fontSize, x, y, letterSpacing) {
  const path = font.getPath(text, x, y, fontSize, { letterSpacing });
  return path.toPathData();
}

// Calculate text metrics using opentype.js
function measureText(font, text, fontSize, letterSpacing) {
  const advanceWidth = font.getAdvanceWidth(text, fontSize, { letterSpacing });
  return advanceWidth;
}

// POST /api/decal-files/cut-vinyl
router.post("/cut-vinyl", (req, res) => {
  try {
    const {
      text, height, font, isBold, isItalic, charSpacing,
      hasOffset, offsetSize, layer, colorName, qty
    } = req.body;

    if (!text || !height) {
      return res.status(400).json({ error: "text and height are required" });
    }

    const hIn = parseFloat(height);
    const qtyNum = parseInt(qty) || 1;
    const offsetIn = hasOffset ? parseFloat(offsetSize || 0) : 0;
    const charSpacingPercent = parseFloat(charSpacing) || 0;
    // Convert percent to PDF points: (percent/100) * fontSize
    const charSpacingPt = (charSpacingPercent / 100) * (hIn * PT);
    const decalNum = nextDecalNumber();

    // Load font and convert text to outlines
    const otFont = loadFont(font, isBold, isItalic);
    const fontSize = hIn * PT; // font size in points

    // Measure text width
    const textWidthPt = measureText(otFont, text, fontSize, charSpacingPt);
    const textWidthIn = textWidthPt / PT;

    // Determine which layer
    const isOffsetLayer = layer === "offset";

    // Single unit dimensions (graphic + bounding box)
    // Graphic width includes offset padding if offset layer
    let graphicW, graphicH;
    if (isOffsetLayer) {
      // Offset: text + offset on each side
      graphicW = textWidthIn + offsetIn * 2;
      graphicH = hIn + offsetIn * 2;
    } else {
      graphicW = textWidthIn;
      graphicH = hIn;
    }

    // Bounding box: 1" taller and wider (0.5" each side)
    const boxW = graphicW + 1; // +1 inch total
    const boxH = graphicH + 1;

    // Nesting: arrange units within 24" material width
    const cols = Math.max(1, Math.floor(MATERIAL_WIDTH / boxW));
    const rows = Math.ceil(qtyNum / cols);
    const totalW = MATERIAL_WIDTH;
    const totalH = rows * boxH;

    // Create PDF
    const pdfDoc = new PDFDocument({
      size: [totalW * PT, totalH * PT],
      margin: 0,
    });

    const chunks = [];
    pdfDoc.on("data", (chunk) => chunks.push(chunk));
    pdfDoc.on("end", () => {
      const pdfBuffer = Buffer.concat(chunks);
      const safeColor = (colorName || "unknown").replace(/[^a-zA-Z0-9]/g, "");
      const layerName = isOffsetLayer ? "offset" : "text";
      const filename = `DECAL${decalNum}_${safeColor}_${layerName}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    });

    // Draw each unit
    for (let i = 0; i < qtyNum; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);

      // Top-left of this unit's bounding box
      const boxX = col * boxW;
      const boxY = row * boxH;

      // Center graphic within box
      const graphicX = boxX + (boxW - graphicW) / 2;
      const graphicY = boxY + (boxH - graphicH) / 2;

      // Draw bounding box (no fill, 0.01" stroke)
      pdfDoc.save();
      pdfDoc.lineWidth(STROKE_WIDTH);
      pdfDoc.rect(boxX * PT, boxY * PT, boxW * PT, boxH * PT);
      pdfDoc.strokeColor("#000000");
      pdfDoc.stroke();
      pdfDoc.restore();

      // Registration squares: 3 x 0.5" squares centered along top of bounding box
      // Same position on BOTH text and offset files so they align when stacked
      const regSize = 0.5; // inches
      const regGap = 0.25; // gap between squares
      const regGroupW = 3 * regSize + 2 * regGap; // 2.0" total
      const regStartX = boxX + (boxW - regGroupW) / 2; // centered
      const regY = boxY + 0.05; // just inside top of box

      pdfDoc.save();
      pdfDoc.lineWidth(STROKE_WIDTH);
      pdfDoc.strokeColor("#000000");
      for (let s = 0; s < 3; s++) {
        const sx = (regStartX + s * (regSize + regGap)) * PT;
        const sy = regY * PT;
        pdfDoc.rect(sx, sy, regSize * PT, regSize * PT);
        pdfDoc.stroke();
      }
      pdfDoc.restore();

      // Draw text outlines
      if (isOffsetLayer) {
        // Offset layer: one solid piece — draw text as filled shape with thick stroke
        // This creates a single merged outline (no internal cuts)
        const textX = (graphicX + offsetIn) * PT;
        const textY = (graphicY + offsetIn + hIn) * PT; // baseline
        const svgPath = textToPathData(otFont, text, fontSize, textX, textY, charSpacingPt);

        pdfDoc.save();
        pdfDoc.lineWidth(Math.max(STROKE_WIDTH, offsetIn * PT * 2));
        pdfDoc.strokeColor("#000000");
        pdfDoc.fillColor("#000000");

        // Draw as filled + stroked to create solid offset shape
        // First fill the text shape
        drawSvgPath(pdfDoc, svgPath);
        pdfDoc.fill();

        // Then stroke with offset width to expand outward
        drawSvgPath(pdfDoc, svgPath);
        pdfDoc.stroke();

        pdfDoc.restore();
      } else {
        // Text layer: outlines only, no fill, 0.01" stroke
        const textX = graphicX * PT;
        const textY = (graphicY + hIn) * PT; // baseline
        const svgPath = textToPathData(otFont, text, fontSize, textX, textY, charSpacingPt);

        pdfDoc.save();
        pdfDoc.lineWidth(STROKE_WIDTH);
        pdfDoc.strokeColor("#000000");

        drawSvgPath(pdfDoc, svgPath);
        pdfDoc.stroke();

        pdfDoc.restore();
      }
    }

    pdfDoc.end();
  } catch (err) {
    console.error("Cut vinyl PDF error:", err);
    res.status(500).json({ error: "Failed to generate cut file: " + err.message });
  }
});

// POST /api/decal-files/printed-decal
router.post("/printed-decal", (req, res) => {
  try {
    const {
      width, height, shape, backgroundColor, colorName, qty,
      imageData, imageScale, imagePosX, imagePosY,
      previewWidth, previewHeight
    } = req.body;

    if (!width || !height) {
      return res.status(400).json({ error: "width and height are required" });
    }

    const wIn = parseFloat(width);
    const hIn = parseFloat(height);
    const qtyNum = parseInt(qty) || 1;
    const decalNum = nextDecalNumber();
    const imgScale = parseFloat(imageScale) || 1;
    const imgPosX = parseFloat(imagePosX) || 0;
    const imgPosY = parseFloat(imagePosY) || 0;
    const prevW = parseFloat(previewWidth) || 360;
    const prevH = parseFloat(previewHeight) || 360;

    // Bounding box: 1" taller and wider
    const boxW = wIn + 1;
    const boxH = hIn + 1;

    // Nesting within 24" material width
    const cols = Math.max(1, Math.floor(MATERIAL_WIDTH / boxW));
    const rows = Math.ceil(qtyNum / cols);
    const totalW = MATERIAL_WIDTH;
    const totalH = rows * boxH;

    // Parse base64 image data
    let imgBuffer = null;
    let imgExt = "png";
    if (imageData) {
      const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        imgExt = matches[1] === "jpeg" ? "jpg" : matches[1];
        imgBuffer = Buffer.from(matches[2], "base64");
      }
    }

    const pdfDoc = new PDFDocument({
      size: [totalW * PT, totalH * PT],
      margin: 0,
    });

    const chunks = [];
    pdfDoc.on("data", (chunk) => chunks.push(chunk));
    pdfDoc.on("end", () => {
      const pdfBuffer = Buffer.concat(chunks);
      const safeColor = (colorName || "unknown").replace(/[^a-zA-Z0-9]/g, "");
      const filename = `DECAL${decalNum}_${safeColor}_print.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    });

    for (let i = 0; i < qtyNum; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const boxX = col * boxW;
      const boxY = row * boxH;

      // Shape position (centered in bounding box)
      const shapeX = boxX + 0.5;
      const shapeY = boxY + 0.5;

      // Draw background color inside shape (if not transparent)
      if (backgroundColor && backgroundColor !== "transparent") {
        pdfDoc.save();
        if (shape === "circle") {
          const cx = (shapeX + wIn / 2) * PT;
          const cy = (shapeY + hIn / 2) * PT;
          const r = Math.min(wIn, hIn) / 2 * PT;
          pdfDoc.circle(cx, cy, r);
        } else {
          const rr = shape === "rectangle" ? 0 : 12;
          pdfDoc.roundedRect(shapeX * PT, shapeY * PT, wIn * PT, hIn * PT, rr);
        }
        pdfDoc.fillColor(backgroundColor);
        pdfDoc.fill();
        pdfDoc.restore();
      }

      // Draw image inside shape (clipped)
      if (imgBuffer) {
        pdfDoc.save();

        // Create clip path from shape
        if (shape === "circle") {
          const cx = (shapeX + wIn / 2) * PT;
          const cy = (shapeY + hIn / 2) * PT;
          const r = Math.min(wIn, hIn) / 2 * PT;
          pdfDoc.circle(cx, cy, r);
        } else {
          const rr = shape === "rectangle" ? 0 : 12;
          pdfDoc.roundedRect(shapeX * PT, shapeY * PT, wIn * PT, hIn * PT, rr);
        }
        pdfDoc.clip();

        // Calculate image placement
        // The preview uses backgroundSize: scale*100% and backgroundPosition: posX, posY
        // The image fills the shape at scale, then is offset by posX/posY
        // Convert preview coordinates to PDF coordinates
        const pxToIn = wIn / prevW; // preview pixels to inches ratio
        const imgW = wIn * imgScale; // image width in inches at current scale
        const imgH = hIn * imgScale;
        const imgX = shapeX + (imgPosX * pxToIn);
        const imgY = shapeY + (imgPosY * pxToIn);

        try {
          pdfDoc.image(imgBuffer, imgX * PT, imgY * PT, {
            width: imgW * PT,
            height: imgH * PT,
          });
        } catch (e) {
          console.error("Image embed error:", e.message);
        }

        pdfDoc.restore();
      }

      // Draw cut path (shape outline) — no fill, 0.01" stroke
      pdfDoc.save();
      pdfDoc.lineWidth(STROKE_WIDTH);
      pdfDoc.strokeColor("#000000");

      if (shape === "circle") {
        const cx = (shapeX + wIn / 2) * PT;
        const cy = (shapeY + hIn / 2) * PT;
        const r = Math.min(wIn, hIn) / 2 * PT;
        pdfDoc.circle(cx, cy, r);
        pdfDoc.stroke();
      } else {
        const rr = shape === "rectangle" ? 0 : 12;
        pdfDoc.roundedRect(shapeX * PT, shapeY * PT, wIn * PT, hIn * PT, rr);
        pdfDoc.stroke();
      }
      pdfDoc.restore();

      // Bounding box
      pdfDoc.save();
      pdfDoc.lineWidth(STROKE_WIDTH);
      pdfDoc.strokeColor("#000000");
      pdfDoc.rect(boxX * PT, boxY * PT, boxW * PT, boxH * PT);
      pdfDoc.stroke();
      pdfDoc.restore();
    }

    pdfDoc.end();
  } catch (err) {
    console.error("Printed decal PDF error:", err);
    res.status(500).json({ error: "Failed to generate print file: " + err.message });
  }
});

// POST /api/decal-files/quote
// Generates a professional quote PDF with logo, preview, specs, pricing
router.post("/quote", async (req, res) => {
  try {
    const {
      type, // "cut-vinyl" or "printed-decal"
      decalNumber,
      // Cut vinyl fields
      text, height, font, isBold, isItalic, charSpacing,
      colorName, hasOffset, offsetColorName, offsetSize,
      estimatedWidth, area, unitPrice, totalPrice, qty,
      transferTapeCost, offsetCost,
      // Printed decal fields
      shape, backgroundColor, width,
      // Preview image
      previewImage,
    } = req.body;

    const decalNum = decalNumber || nextDecalNumber();

    // Try to load branding logo via req.prisma (with timeout to avoid hanging)
    let logoBuffer = null;
    let companyName = "";
    try {
      const prisma = req.prisma;
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000));
      const query = prisma.setting.findMany({ where: { key: { in: ["company_name", "logo_path"] } } });
      const rows = await Promise.race([query, timeout]);
      const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      companyName = map.company_name || "";
      if (map.logo_path) {
        const logoPath = path.resolve(map.logo_path.replace(/^\//, ""));
        if (fs.existsSync(logoPath)) {
          logoBuffer = fs.readFileSync(logoPath);
        }
      }
    } catch {}

    // Parse preview image
    let previewBuffer = null;
    if (previewImage) {
      const matches = previewImage.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        previewBuffer = Buffer.from(matches[2], "base64");
      }
    }

    const pdfDoc = new PDFDocument({
      size: "LETTER",
      margin: 50,
    });

    const chunks = [];
    pdfDoc.on("data", (chunk) => chunks.push(chunk));
    pdfDoc.on("end", () => {
      const pdfBuffer = Buffer.concat(chunks);
      const filename = `QUOTE_DECAL${decalNum}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    });

    const pageW = 612;
    const pageH = 792;
    const margin = 45;
    const opts = { lineBreak: false }; // prevent PDFKit from auto-flowing to new pages

    let y = margin;

    // --- HEADER: logo left, company name + QUOTE right ---
    if (logoBuffer) {
      try {
        pdfDoc.image(logoBuffer, margin, y, { fit: [160, 55] });
      } catch {}
    }
    const hdrX = logoBuffer ? 215 : margin;
    pdfDoc.fontSize(22).font("Helvetica-Bold").fillColor("#1a1a1a");
    pdfDoc.text("QUOTE", hdrX, y, opts);
    pdfDoc.fontSize(11).font("Helvetica").fillColor("#666666");
    pdfDoc.text(`DECAL #${decalNum}`, hdrX, y + 26, opts);
    if (companyName) {
      pdfDoc.fontSize(10).fillColor("#444444");
      pdfDoc.text(companyName, hdrX, y + 42, opts);
    }
    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    pdfDoc.fontSize(9).fillColor("#999999");
    pdfDoc.text(`Date: ${today}`, hdrX, y + 56, opts);

    y += 70;

    // Divider
    pdfDoc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor("#cccccc").lineWidth(1).stroke();
    y += 12;

    // --- TWO COLUMN LAYOUT ---
    // Left col: specs table  |  Right col: preview image
    const leftColX = margin;
    const leftColW = 310;
    const rightColX = leftColX + leftColW + 20;
    const rightColW = pageW - rightColX - margin;
    const rowH = 18;

    function specRow(label, value) {
      pdfDoc.fontSize(9).font("Helvetica").fillColor("#777777");
      pdfDoc.text(label, leftColX, y, { ...opts, width: 130 });
      pdfDoc.font("Helvetica-Bold").fillColor("#1a1a1a").fontSize(9);
      pdfDoc.text(String(value), leftColX + 135, y, { ...opts, width: leftColW - 135 });
      y += rowH;
    }

    const specsStartY = y;

    if (type === "cut-vinyl") {
      specRow("Type", "Cut Vinyl");
      specRow("Text", text || "—");
      specRow("Font", font || "—");
      specRow("Text Height", `${height}"`);
      specRow("Estimated Width", `${estimatedWidth}"`);
      specRow("Color", colorName || "—");
      specRow("Character Spacing", `${charSpacing}%`);
      if (hasOffset) {
        specRow("Offset Background", "Yes");
        specRow("Offset Color", offsetColorName || "—");
        specRow("Offset Size", `${offsetSize}"`);
      }
      specRow("Quantity", qty);
      specRow("Vinyl Area", `${area} sq in`);
      specRow("Transfer Tape", `$${(transferTapeCost || 0).toFixed(2)}/unit`);
      if (hasOffset) specRow("Offset Cost", `$${(offsetCost || 0).toFixed(2)}/unit`);
      specRow("Unit Price", `$${unitPrice}`);
    } else {
      specRow("Type", "Printed Decal");
      specRow("Shape", shape || "—");
      specRow("Size", `${width}" x ${height}"`);
      specRow("Background", backgroundColor === "transparent" ? "Transparent" : (backgroundColor || "—"));
      specRow("Quantity", qty);
      specRow("Area", `${area} sq in`);
      specRow("Unit Price", `$${unitPrice}`);
    }

    // Preview image in right column, aligned to specs start
    if (previewBuffer) {
      try {
        pdfDoc.image(previewBuffer, rightColX, specsStartY, { fit: [rightColW, 180] });
      } catch (e) {
        console.error("Preview image error:", e.message);
      }
    }

    y += 10;

    // Divider before total
    pdfDoc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor("#cccccc").lineWidth(0.5).stroke();
    y += 12;

    // --- TOTAL ---
    pdfDoc.rect(margin, y, pageW - margin * 2, 36).fill("#f0f7ff");
    pdfDoc.fontSize(14).font("Helvetica-Bold").fillColor("#1a1a1a");
    pdfDoc.text("TOTAL:", margin + 10, y + 11, opts);
    pdfDoc.text(`$${totalPrice}`, margin + 110, y + 11, opts);
    y += 48;

    // Footer
    pdfDoc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor("#eeeeee").lineWidth(0.5).stroke();
    y += 8;
    pdfDoc.fontSize(8).font("Helvetica").fillColor("#aaaaaa");
    pdfDoc.text("This is a quote only and does not constitute a binding contract. Prices subject to change.", margin, y, { width: pageW - margin * 2, align: "center", lineBreak: false });

    pdfDoc.end();
  } catch (err) {
    console.error("Quote PDF error:", err);
    res.status(500).json({ error: "Failed to generate quote: " + err.message });
  }
});

// Helper: draw SVG path data onto PDFKit document
function drawSvgPath(doc, svgPath) {
  // Parse SVG path commands and draw on PDFKit
  const commands = parseSvgPath(svgPath);
  for (const cmd of commands) {
    switch (cmd.type) {
      case "M":
        doc.moveTo(cmd.x, cmd.y);
        break;
      case "L":
        doc.lineTo(cmd.x, cmd.y);
        break;
      case "C":
        doc.bezierCurveTo(cmd.cp1x, cmd.cp1y, cmd.cp2x, cmd.cp2y, cmd.x, cmd.y);
        break;
      case "Q":
        doc.quadraticCurveTo(cmd.cpx, cmd.cpy, cmd.x, cmd.y);
        break;
      case "Z":
        doc.closePath();
        break;
    }
  }
}

// Minimal SVG path parser
function parseSvgPath(d) {
  const commands = [];
  if (!d) return commands;

  // Tokenize
  const re = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
  let match;
  const tokens = [];
  while ((match = re.exec(d)) !== null) {
    tokens.push(match[1] || parseFloat(match[2]));
  }

  let i = 0;
  let cx = 0, cy = 0; // current point

  while (i < tokens.length) {
    const cmd = tokens[i];
    if (typeof cmd === "string") {
      i++;
      switch (cmd) {
        case "M": {
          const x = tokens[i++]; const y = tokens[i++];
          cx = x; cy = y;
          commands.push({ type: "M", x, y });
          break;
        }
        case "m": {
          const x = cx + tokens[i++]; const y = cy + tokens[i++];
          cx = x; cy = y;
          commands.push({ type: "M", x, y });
          break;
        }
        case "L": {
          const x = tokens[i++]; const y = tokens[i++];
          cx = x; cy = y;
          commands.push({ type: "L", x, y });
          break;
        }
        case "l": {
          const x = cx + tokens[i++]; const y = cy + tokens[i++];
          cx = x; cy = y;
          commands.push({ type: "L", x, y });
          break;
        }
        case "H": {
          const x = tokens[i++]; cy = cy;
          cx = x;
          commands.push({ type: "L", x, y: cy });
          break;
        }
        case "h": {
          const x = cx + tokens[i++];
          cx = x;
          commands.push({ type: "L", x, y: cy });
          break;
        }
        case "V": {
          const y = tokens[i++];
          cy = y;
          commands.push({ type: "L", x: cx, y });
          break;
        }
        case "v": {
          const y = cy + tokens[i++];
          cy = y;
          commands.push({ type: "L", x: cx, y });
          break;
        }
        case "C": {
          const cp1x = tokens[i++], cp1y = tokens[i++];
          const cp2x = tokens[i++], cp2y = tokens[i++];
          const x = tokens[i++], y = tokens[i++];
          cx = x; cy = y;
          commands.push({ type: "C", cp1x, cp1y, cp2x, cp2y, x, y });
          break;
        }
        case "c": {
          const cp1x = cx + tokens[i++], cp1y = cy + tokens[i++];
          const cp2x = cx + tokens[i++], cp2y = cy + tokens[i++];
          const x = cx + tokens[i++], y = cy + tokens[i++];
          cx = x; cy = y;
          commands.push({ type: "C", cp1x, cp1y, cp2x, cp2y, x, y });
          break;
        }
        case "S": {
          const cp2x = tokens[i++], cp2y = tokens[i++];
          const x = tokens[i++], y = tokens[i++];
          cx = x; cy = y;
          commands.push({ type: "C", cp1x: cx, cp1y: cy, cp2x, cp2y, x, y });
          break;
        }
        case "Q": {
          const cpx = tokens[i++], cpy = tokens[i++];
          const x = tokens[i++], y = tokens[i++];
          cx = x; cy = y;
          commands.push({ type: "Q", cpx, cpy, x, y });
          break;
        }
        case "q": {
          const cpx = cx + tokens[i++], cpy = cy + tokens[i++];
          const x = cx + tokens[i++], y = cy + tokens[i++];
          cx = x; cy = y;
          commands.push({ type: "Q", cpx, cpy, x, y });
          break;
        }
        case "Z":
        case "z":
          commands.push({ type: "Z" });
          break;
        default:
          // Skip unknown commands
          break;
      }
    }
  }

  return commands;
}

export default router;
