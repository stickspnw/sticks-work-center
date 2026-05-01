import { Router } from "express";
import PDFDocument from "pdfkit";
import opentype from "opentype.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// ---- Cut file naming helpers ---------------------------------------------
// Strip only the WC "ORD" prefix; preserve any leading zeros in order numbers.
function cleanOrderNumberForFilename(orderNumber) {
  if (orderNumber === null || orderNumber === undefined) return null;
  const str = String(orderNumber).trim();
  if (!str) return null;
  // Drop "ORD" prefix
  const stripped = str.replace(/^ORD/i, "");
  return stripped;
}

// Build a short color code for filenames. Prefers an explicit short code (e.g.
// "WHT", "BLK", "RED") if one is provided; otherwise derives one from the
// color's display name.
function shortColorCodeFor(opts) {
  const explicit = (opts.vinylShortCode || opts.colorCode || "").toString().trim();
  if (/^[a-zA-Z0-9]{1,5}$/.test(explicit)) return explicit.toUpperCase();
  const name = (opts.colorName || "UNK").toString();
  const safe = name.replace(/[^a-zA-Z0-9]/g, "");
  if (!safe) return "UNK";
  return safe.toUpperCase().slice(0, 3);
}

// Build full filename. If orderNumber is provided, use the new format
// "{orderNumber} {COLOR}{suffix}.pdf". Otherwise fall back to the legacy
// "DECAL{n}_{COLOR}_{layer}.pdf" naming used for unsaved/manual downloads.
function buildCutFilename({
  orderNumber,
  vinylShortCode,
  colorName,
  suffix = "",
  legacyPrefix = "Vinyl",
  legacyDecalNum,
  legacyLayerName,
  layerIndex,
  layerCount,
}) {
  const cleanOrder = cleanOrderNumberForFilename(orderNumber);
  const colorCode = shortColorCodeFor({ vinylShortCode, colorName });
  if (cleanOrder) {
    const idx = Number.isFinite(Number(layerIndex)) ? Number(layerIndex) : 1;
    const total = Number.isFinite(Number(layerCount)) ? Number(layerCount) : 1;
    return `${cleanOrder} ${colorCode} (${idx}-${total}).pdf`;
  }
  // Legacy ad-hoc download filename
  return `DECAL${legacyDecalNum} ${colorCode}_${legacyLayerName || "text"}.pdf`;
}

// Where paid cut files are saved on disk (single configurable folder).
function cutLayerOutputDir(isBackgroundLayer) {
  return isBackgroundLayer
    ? path.join(__dirname, "../../cut-back-files")
    : path.join(__dirname, "../../cut-files");
}

// Calculate text metrics using opentype.js
function measureText(font, text, fontSize, letterSpacing) {
  const advanceWidth = font.getAdvanceWidth(text, fontSize, { letterSpacing });
  return advanceWidth;
}

// Generate a rectangular background cut file (multi-row decal mode).
// Draws a single rectangle (the entire bg piece) per quantity unit, with
// the standard bounding/weeding box and registration squares around it.
async function generateBgRectCutFile(req, res, { widthIn, heightIn, qty, colorName, orderId, orderNumber, vinylShortCode, fileSuffix, layerIndex, layerCount }) {
  try {
    if (!Number.isFinite(widthIn) || !Number.isFinite(heightIn) || widthIn <= 0 || heightIn <= 0) {
      return res.status(400).json({ error: "bgWidthIn and bgHeightIn must be positive numbers" });
    }
    const decalNum = orderId ? parseInt(orderId) : nextDecalNumber();

    const graphicW = widthIn;
    const graphicH = heightIn;

    // Bounding box: 1" taller and wider (0.5" each side)
    const boxW = graphicW + 1;
    const boxH = graphicH + 1;

    // Nesting: arrange units within 24" material width
    const cols = Math.max(1, Math.floor(MATERIAL_WIDTH / boxW));
    const rows = Math.ceil(qty / cols);
    const totalW = MATERIAL_WIDTH;
    const totalH = rows * boxH;

    const pdfDoc = new PDFDocument({ size: [totalW * PT, totalH * PT], margin: 0 });
    const chunks = [];
    pdfDoc.on("data", (c) => chunks.push(c));
    pdfDoc.on("end", () => {
      const pdfBuffer = Buffer.concat(chunks);
      const filename = buildCutFilename({
        orderNumber,
        vinylShortCode,
        colorName,
        suffix: fileSuffix || "BG",
        legacyDecalNum: decalNum,
        legacyLayerName: "background",
        layerIndex,
        layerCount,
      });
      if (orderNumber) {
        try {
          const dir = cutLayerOutputDir(true);
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, filename), pdfBuffer);
        } catch (e) {
          console.error("Error saving rect bg cut file:", e);
        }
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    });

    for (let i = 0; i < qty; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const boxX = col * boxW;
      const boxY = row * boxH;
      const graphicX = boxX + (boxW - graphicW) / 2;
      const graphicY = boxY + (boxH - graphicH) / 2;

      // Bounding box (no fill)
      pdfDoc.save();
      pdfDoc.lineWidth(STROKE_WIDTH);
      pdfDoc.rect(boxX * PT, boxY * PT, boxW * PT, boxH * PT);
      pdfDoc.strokeColor("#000000");
      pdfDoc.stroke();
      pdfDoc.restore();

      // Filled rectangle = the bg piece itself
      pdfDoc.save();
      pdfDoc.lineWidth(STROKE_WIDTH);
      pdfDoc.strokeColor("#000000");
      pdfDoc.fillColor("#000000");
      pdfDoc.rect(graphicX * PT, graphicY * PT, graphicW * PT, graphicH * PT);
      pdfDoc.fillAndStroke();
      pdfDoc.restore();

      // Registration squares around the graphic
      const regSize = 0.25;
      const regBuf = 0.5; // gap from BG envelope to reg mark (no touching)
      const regPositions = [
        { x: graphicX - regSize - regBuf, y: graphicY + graphicH / 2 - regSize / 2 },
        { x: graphicX + graphicW / 2 - regSize / 2, y: graphicY - regSize - regBuf },
        { x: graphicX + graphicW + regBuf, y: graphicY + graphicH / 2 - regSize / 2 },
      ];
      pdfDoc.save();
      pdfDoc.lineWidth(STROKE_WIDTH);
      pdfDoc.strokeColor("#000000");
      regPositions.forEach((p) => {
        pdfDoc.rect(p.x * PT, p.y * PT, regSize * PT, regSize * PT);
        pdfDoc.stroke();
      });
      pdfDoc.restore();
    }

    pdfDoc.end();
  } catch (err) {
    console.error("Rect bg cut file error:", err);
    res.status(500).json({ error: "Failed to generate rectangular background cut file: " + err.message });
  }
}

// Generate logo cut file
async function generateLogoCutFile(req, res, { selectedColor, height, width, qty, layer, orderId, orderNumber, vinylShortCode, fileSuffix, layerIndex, layerCount }) {
  try {
    const decalNum = orderId ? parseInt(orderId) : nextDecalNumber();
    
    // Convert base64 image to buffer
    const base64Data = selectedColor.processedImage.replace(/^data:image\/png;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    // Get image dimensions
    const sharp = require('sharp');
    const metadata = await sharp(imageBuffer).metadata();
    const aspectRatio = metadata.width / metadata.height;
    
    // Adjust dimensions to maintain aspect ratio
    let finalWidth = width;
    let finalHeight = height;
    
    if (aspectRatio > 1) {
      finalHeight = width / aspectRatio;
    } else {
      finalWidth = height * aspectRatio;
    }
    
    // Bounding box: 1" taller and wider (0.5" each side)
    const boxW = finalWidth + 1;
    const boxH = finalHeight + 1;
    
    // Nesting: arrange units within 24" material width
    const cols = Math.max(1, Math.floor(MATERIAL_WIDTH / boxW));
    const rows = Math.ceil(qty / cols);
    const totalW = MATERIAL_WIDTH;
    const totalH = rows * boxH;
    
    // Create PDF
    const pdfDoc = new PDFDocument({
      size: [totalW * PT, totalH * PT],
      margin: 0,
    });
    
    const chunks = [];
    pdfDoc.on("data", (chunk) => chunks.push(chunk));
    pdfDoc.on("end", async () => {
      const pdfBuffer = Buffer.concat(chunks);
      const layerName = layer === "offset" ? "background" : "text";
      const filename = buildCutFilename({
        orderNumber,
        vinylShortCode,
        colorName: selectedColor?.hex || "logo",
        suffix: fileSuffix || (layerName === "background" ? "BG" : ""),
        legacyDecalNum: decalNum,
        legacyLayerName: layerName,
        layerIndex,
        layerCount,
      });
      if (orderNumber) {
        try {
          const dir = cutLayerOutputDir(layerName === "background");
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, filename), pdfBuffer);
          console.log(`Saved logo cut file for order ${orderNumber}: ${filename}`);
        } catch (error) {
          console.error('Error saving logo cut files:', error);
        }
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    });
    
    // Draw each unit
    for (let i = 0; i < qty; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      
      // Top-left of this unit's bounding box
      const boxX = col * boxW;
      const boxY = row * boxH;
      
      // Center graphic within box
      const graphicX = boxX + (boxW - finalWidth) / 2;
      const graphicY = boxY + (boxH - finalHeight) / 2;
      
      // Draw bounding box
      pdfDoc.save();
      pdfDoc.lineWidth(STROKE_WIDTH);
      pdfDoc.rect(boxX * PT, boxY * PT, boxW * PT, boxH * PT);
      pdfDoc.strokeColor("#000000");
      pdfDoc.stroke();
      pdfDoc.restore();
      
      // Weeding box
      const weedBuf = 0.5;
      const weedW = finalWidth + weedBuf * 2;
      const weedH = finalHeight + weedBuf * 2;
      const weedX = boxX + (boxW - weedW) / 2;
      const weedY = boxY + (boxH - weedH) / 2;
      
      pdfDoc.save();
      pdfDoc.lineWidth(STROKE_WIDTH);
      pdfDoc.strokeColor("#000000");
      pdfDoc.rect(weedX * PT, weedY * PT, weedW * PT, weedH * PT);
      pdfDoc.stroke();
      pdfDoc.restore();
      
      // Registration squares — only emitted on the background (offset) layer
      // so cutters can align the BG cut to the text/logo cut. Pure single-
      // layer cut files don't need them.
      if (layer === "offset") {
        const regSize = 0.25;
        const regBuf = 0.5; // gap from BG envelope to reg mark (no touching)
        const regPositions = [
          { x: graphicX - regSize - regBuf, y: graphicY + finalHeight / 2 - regSize / 2 }, // left
          { x: graphicX + finalWidth / 2 - regSize / 2, y: graphicY - regSize - regBuf }, // top
          { x: graphicX + finalWidth + regBuf, y: graphicY + finalHeight / 2 - regSize / 2 }, // right
        ];
        pdfDoc.save();
        pdfDoc.lineWidth(STROKE_WIDTH);
        pdfDoc.strokeColor("#000000");
        regPositions.forEach(pos => {
          pdfDoc.rect(pos.x * PT, pos.y * PT, regSize * PT, regSize * PT);
          pdfDoc.stroke();
        });
        pdfDoc.restore();
      }
      
      // Draw logo image
      pdfDoc.save();
      pdfDoc.image(imageBuffer, graphicX * PT, graphicY * PT, {
        width: finalWidth * PT,
        height: finalHeight * PT
      });
      pdfDoc.restore();
    }
    
    pdfDoc.end();
  } catch (error) {
    console.error('Error generating logo cut file:', error);
    res.status(500).json({ error: 'Failed to generate logo cut file' });
  }
}

// POST /api/decal-files/cut-vinyl
router.post("/cut-vinyl", async (req, res) => {
  try {
    const {
      text, height, font, isBold, isItalic, charSpacing,
      hasOffset, offsetSize, layer, colorName, qty,
      logoMode, selectedColor, logoWidth, orderId,
      textWidthIn: requestedTextWidthIn,
      bgRect, bgWidthIn, bgHeightIn,
      orderNumber, vinylShortCode, fileSuffix, layerIndex, layerCount,
    } = req.body;

    // Handle logo mode
    if (logoMode && selectedColor) {
      await generateLogoCutFile(req, res, {
        selectedColor,
        height: parseFloat(height),
        width: parseFloat(logoWidth || 4),
        qty: parseInt(qty) || 1,
        layer,
        orderId,
        orderNumber,
        vinylShortCode,
        fileSuffix,
        layerIndex,
        layerCount,
      });
      return;
    }

    // Handle rectangular background mode (used for multi-row decals where the
    // background piece wraps the entire stacked content as one rectangle).
    if (bgRect) {
      await generateBgRectCutFile(req, res, {
        widthIn: parseFloat(bgWidthIn),
        heightIn: parseFloat(bgHeightIn),
        qty: parseInt(qty) || 1,
        colorName: colorName || "background",
        orderId,
        orderNumber,
        vinylShortCode,
        fileSuffix,
        layerIndex,
        layerCount,
      });
      return;
    }

    // Original text-based logic
    if (!text || !height) {
      return res.status(400).json({ error: "text and height are required" });
    }

    const hIn = parseFloat(height);
    const qtyNum = parseInt(qty) || 1;
    const offsetIn = hasOffset ? parseFloat(offsetSize || 0) : 0;
    const charSpacingPercent = parseFloat(charSpacing) || 0;
    // Convert percent to PDF points: (percent/100) * fontSize
    const charSpacingPt = (charSpacingPercent / 100) * (hIn * PT);
    const decalNum = orderId ? parseInt(orderId) : nextDecalNumber();

    // Load font and convert text to outlines
    const otFont = loadFont(font, isBold, isItalic);
    const fontSize = hIn * PT; // font size in points

    // Measure text width — prefer frontend-provided value so the cut file
    // matches the W shown in the preview exactly. Fall back to opentype measurement.
    const otAdvanceIn = measureText(otFont, text, fontSize, charSpacingPt) / PT;
    const textWidthIn = (requestedTextWidthIn != null && !isNaN(parseFloat(requestedTextWidthIn)))
      ? parseFloat(requestedTextWidthIn)
      : otAdvanceIn;

    // Determine which layer
    const isOffsetLayer = layer === "offset";

    // Both layers use identical bounding box (based on TEXT dimensions only)
    // so the PDFs are the same size and align perfectly when stacked in the cutter
    const graphicW = textWidthIn;
    const graphicH = hIn;

    // Bounding box: 1" taller and wider (0.5" each side)
    const boxW = graphicW + 1;
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
    pdfDoc.on("end", async () => {
      const pdfBuffer = Buffer.concat(chunks);
      const layerName = isOffsetLayer ? "offset" : "text";
      const filename = buildCutFilename({
        orderNumber,
        vinylShortCode,
        colorName,
        suffix: fileSuffix || (isOffsetLayer ? "BG" : ""),
        legacyDecalNum: decalNum,
        legacyLayerName: layerName,
        layerIndex,
        layerCount,
      });
      if (orderNumber) {
        try {
          const dir = cutLayerOutputDir(isOffsetLayer);
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, filename), pdfBuffer);
          console.log(`Saved cut file for order ${orderNumber}: ${filename}`);
        } catch (error) {
          console.error('Error saving cut files:', error);
        }
      }
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

      // Weeding box: 0.5" buffer around the actual text (same on both layers for alignment)
      // For text layer: around textWidthIn x hIn
      // For offset layer: around (textWidthIn + offsetIn*2) x (hIn + offsetIn*2)
      // We always base weeding box on the TEXT dimensions so both layers align
      const weedBuf = 0.5;
      const weedW = textWidthIn + weedBuf * 2;
      const weedH = hIn + weedBuf * 2;
      const weedX = boxX + (boxW - weedW) / 2;
      const weedY = boxY + (boxH - weedH) / 2;

      pdfDoc.save();
      pdfDoc.lineWidth(STROKE_WIDTH);
      pdfDoc.strokeColor("#000000");
      pdfDoc.rect(weedX * PT, weedY * PT, weedW * PT, weedH * PT);
      pdfDoc.stroke();
      pdfDoc.restore();

      // Registration squares — only on the background (offset) layer so the
      // cutter can align text and BG. Plain text cuts don't need them.
      if (isOffsetLayer) {
        // Position reg marks around the BG envelope (text + offset on each
        // side), with a 0.5" buffer so they never touch the halo.
        const regSize = 0.25;
        const regBuf = 0.5;
        const envW = textWidthIn + offsetIn * 2;
        const envH = hIn + offsetIn * 2;
        const envX = graphicX - offsetIn;
        const envY = graphicY - offsetIn;
        const regPositions = [
          { x: envX - regSize - regBuf, y: envY + envH / 2 - regSize / 2 }, // left
          { x: envX + envW / 2 - regSize / 2, y: envY - regSize - regBuf }, // top
          { x: envX + envW + regBuf, y: envY + envH / 2 - regSize / 2 }, // right
        ];
        pdfDoc.save();
        pdfDoc.lineWidth(STROKE_WIDTH);
        pdfDoc.strokeColor("#000000");
        regPositions.forEach(pos => {
          pdfDoc.rect(pos.x * PT, pos.y * PT, regSize * PT, regSize * PT);
          pdfDoc.stroke();
        });
        pdfDoc.restore();
      }

      // Render text path with natural opentype proportions (no distortion).
      // We scale ONLY along X so the rendered advance width equals textWidthIn
      // (which matches the W shown in the preview). Y stays natural so glyphs
      // keep their proper proportions, font size = hIn (EM box).
      const naturalPath = otFont.getPath(text, 0, 0, fontSize, { letterSpacing: charSpacingPt });
      const naturalBB = naturalPath.getBoundingBox();
      const naturalAdvancePt = naturalBB.x2 - naturalBB.x1; // visible advance, in points
      const targetWidthPt = textWidthIn * PT;
      const xScale = naturalAdvancePt > 0 ? targetWidthPt / naturalAdvancePt : 1;
      // Translate so the bbox left edge lands at graphicX, baseline at graphicY+hIn
      const txPt = graphicX * PT - naturalBB.x1 * xScale;
      const tyPt = (graphicY + hIn) * PT;
      const svgPath = naturalPath.toPathData();

      if (isOffsetLayer) {
        // Background layer: outer glyph silhouettes only, fat-stroked so the
        // resulting cut piece is a solid backing extending offsetIn outward.
        // Inner contours (R/O/A counters) are excluded so the bg piece has
        // no internal holes.
        const bgSvgPath = outerOnlyPath(naturalPath).toPathData();
        pdfDoc.save();
        pdfDoc.transform(xScale, 0, 0, 1, txPt, tyPt);
        pdfDoc.lineWidth(offsetIn * 2 * PT);
        pdfDoc.strokeColor("#000000");
        pdfDoc.fillColor("#000000");
        pdfDoc.lineJoin("miter");
        pdfDoc.miterLimit(2);
        drawSvgPath(pdfDoc, bgSvgPath);
        pdfDoc.fillAndStroke();
        pdfDoc.restore();
      } else {
        // Text layer: outlines only, 0.01" stroke
        pdfDoc.save();
        pdfDoc.transform(xScale, 0, 0, 1, txPt, tyPt);
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
    const decalNum = nextDecalNumber();

    // Parse base64 image data (canvas snapshot PNG)
    let imgBuffer = null;
    if (imageData) {
      const matches = imageData.match(/^data:image\/\w+;base64,(.+)$/);
      if (matches) {
        imgBuffer = Buffer.from(matches[1], "base64");
      }
    }

    // Page is sized exactly to the decal — no bounding box, no weeding box,
    // no cut path, no nesting. Just one copy of the artwork.
    const pdfDoc = new PDFDocument({
      size: [wIn * PT, hIn * PT],
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

    if (imgBuffer) {
      try {
        pdfDoc.image(imgBuffer, 0, 0, { width: wIn * PT, height: hIn * PT });
      } catch (e) {
        console.error("Snapshot embed error:", e.message);
      }
    } else if (backgroundColor && backgroundColor !== "transparent") {
      // No snapshot: solid background fill the size of the decal.
      const cssToHex = { white: "#ffffff", black: "#000000", red: "#ff0000", blue: "#0000ff", yellow: "#ffff00", green: "#008000", orange: "#ff7f00", purple: "#800080", pink: "#ffc0cb" };
      const hexColor = cssToHex[backgroundColor] || backgroundColor;
      pdfDoc.rect(0, 0, wIn * PT, hIn * PT).fillColor(hexColor).fill();
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
      colorName, colorHex, hasOffset, offsetColorName, offsetColorHex, offsetSize,
      estimatedWidth, area, unitPrice, totalPrice, qty,
      transferTapeCost, offsetCost,
      // Printed decal fields
      shape, backgroundColor, width,
      // Preview image (used for printed decals; cut vinyl is rendered server-side)
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

    // --- LAYOUT: large preview first (centered, with W/H bars + soft shape
    //  shadow), specs underneath. Vertical stack prevents overlaps. ---

    // Two sets of dimensions:
    //   * envelope = full PNG bounds including the bg halo padding. Used to
    //     size the image so its aspect ratio matches the captured snapshot
    //     (otherwise PDFKit's `fit:` letter-boxes and the stroke looks too
    //     thick because the image gets squished into a smaller box).
    //   * inner = the actual content (text/logo) the user typed. Used for
    //     the visible W/H bars + labels so the dimensions on the PDF match
    //     what the configurator shows.
    const innerWIn = type === "printed-decal"
      ? (parseFloat(width) || 1)
      : (parseFloat(estimatedWidth) || parseFloat(height) || 1);
    const innerHIn = parseFloat(height) || 1;
    const haloIn = (type !== "printed-decal" && hasOffset)
      ? Math.max(0, parseFloat(offsetSize) || 0)
      : 0;
    const envWIn = innerWIn + haloIn * 2;
    const envHIn = innerHIn + haloIn * 2;

    // We always render the preview block as long as we have valid decal
    // dimensions. For cut vinyl, render server-side (matches cut file
    // exactly). For printed decals, fall back to the html2canvas snapshot.
    const havePreview = (type === "cut-vinyl" && text)
      || (type === "printed-decal" && previewBuffer);

    if (havePreview) {
      try {
        // Envelope reserved for the preview image (NOT including measurement
        // bar gutters). About half the usable page width — substantial.
        const envelopeMaxW = 320;
        const envelopeMaxH = 220;
        const previewScale = Math.min(envelopeMaxW / envWIn, envelopeMaxH / envHIn);
        const dispEnvW = envWIn * previewScale;
        const dispEnvH = envHIn * previewScale;
        const dispInnerW = innerWIn * previewScale;
        const dispInnerH = innerHIn * previewScale;
        const haloPx = haloIn * previewScale;

        // Reserve gutters for measurement labels
        const leftGutter = 38;   // room for H bar + label on the left
        const topGutter = 26;    // room for W bar + label above

        const blockW = dispEnvW + leftGutter;
        const blockX = (pageW - blockW) / 2;
        const imgX = blockX + leftGutter;
        const imgY = y + topGutter;

        if (type === "cut-vinyl") {
          // Render the decal preview server-side using the same opentype
          // glyph path + miter-stroke code the cut file uses. Guarantees
          // the PDF preview is *exactly* the cut shape, just colored.
          drawCutVinylDecalPreview(pdfDoc, {
            x: imgX,
            y: imgY,
            ptPerIn: previewScale,
            contentWIn: innerWIn,
            contentHIn: innerHIn,
            offsetIn: haloIn,
            text,
            font,
            isBold,
            isItalic,
            charSpacingPercent: parseFloat(charSpacing) || 0,
            textColor: colorHex || "#000000",
            bgColor: offsetColorHex || "#000000",
          });
        } else if (previewBuffer) {
          // Printed decals still use the cropped html2canvas snapshot.
          pdfDoc.image(previewBuffer, imgX, imgY, { fit: [dispEnvW, dispEnvH] });
        }

        // Coordinates of the INNER content within the placed image. The
        // halo padding sits between the envelope edge and the inner content.
        const innerX = imgX + haloPx;
        const innerY = imgY + haloPx;

        // --- W measurement bar (above), bracketing inner content ---
        const wBarY = imgY - 12;
        pdfDoc.save();
        pdfDoc.lineWidth(0.6).strokeColor("#666666");
        pdfDoc.moveTo(innerX, wBarY).lineTo(innerX + dispInnerW, wBarY).stroke();
        pdfDoc.moveTo(innerX, wBarY - 4).lineTo(innerX, wBarY + 4).stroke();
        pdfDoc.moveTo(innerX + dispInnerW, wBarY - 4).lineTo(innerX + dispInnerW, wBarY + 4).stroke();
        pdfDoc.restore();
        pdfDoc.font("Helvetica-Bold").fontSize(9).fillColor("#1a1a1a");
        pdfDoc.text(`W ${innerWIn}"`, innerX, wBarY - 12, { ...opts, width: dispInnerW, align: "center", lineBreak: false });

        // --- H measurement bar (left), bracketing inner content ---
        const hBarX = imgX - 12;
        pdfDoc.save();
        pdfDoc.lineWidth(0.6).strokeColor("#666666");
        pdfDoc.moveTo(hBarX, innerY).lineTo(hBarX, innerY + dispInnerH).stroke();
        pdfDoc.moveTo(hBarX - 4, innerY).lineTo(hBarX + 4, innerY).stroke();
        pdfDoc.moveTo(hBarX - 4, innerY + dispInnerH).lineTo(hBarX + 4, innerY + dispInnerH).stroke();
        pdfDoc.restore();
        pdfDoc.font("Helvetica-Bold").fontSize(9).fillColor("#1a1a1a");
        pdfDoc.text(`H ${innerHIn}"`, blockX - 4, innerY + dispInnerH / 2 - 5, { ...opts, width: leftGutter, align: "center", lineBreak: false });

        y = imgY + dispEnvH + 22; // advance below the preview block
      } catch (e) {
        console.error("Preview image error:", e.message);
      }
    }

    // --- Specs (full width) below the preview ---
    const specsX = margin;
    const specsW = pageW - margin * 2;
    const labelW = 150;
    const rowH = 16;

    function specRow(label, value) {
      pdfDoc.fontSize(9).font("Helvetica").fillColor("#777777");
      pdfDoc.text(label, specsX, y, { ...opts, width: labelW });
      pdfDoc.font("Helvetica-Bold").fillColor("#1a1a1a").fontSize(9);
      pdfDoc.text(String(value), specsX + labelW + 10, y, { ...opts, width: specsW - labelW - 10 });
      y += rowH;
    }

    if (type === "cut-vinyl") {
      specRow("Type", "Cut Vinyl");
      specRow("Text", text || "—");
      specRow("Font", font || "—");
      specRow("Text Height", `${height}"`);
      specRow("Estimated Width", `${estimatedWidth}"`);
      specRow("Color", colorName || "—");
      specRow("Character Spacing", `${charSpacing}%`);
      if (hasOffset) {
        specRow("Background Layer", "Yes");
        specRow("Background Color", offsetColorName || "—");
        specRow("Background Height", `${offsetSize}"`);
      }
      specRow("Quantity", qty);
      specRow("Transfer Tape", `$${(transferTapeCost || 0).toFixed(2)}/unit`);
      if (hasOffset) specRow("Background Cost", `$${(offsetCost || 0).toFixed(2)}/unit`);
      specRow("Unit Price", `$${unitPrice}`);
    } else {
      specRow("Type", "Printed Decal");
      specRow("Shape", shape || "—");
      specRow("Size", `${width}" x ${height}"`);
      specRow("Background", backgroundColor === "transparent" ? "Transparent" : (backgroundColor || "—"));
      specRow("Quantity", qty);
      specRow("Unit Price", `$${unitPrice}`);
    }

    y += 14; // breathing room before total bar

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

// Helper: render a colored cut-vinyl decal preview directly in PDFKit so the
// quote PDF and the cut file share the *exact same* glyph paths, miter
// limits, and bg halo math. Drawing this server-side avoids any html2canvas
// rendering quirks (the live configurator preview can keep using WebKit
// text-stroke; only the embedded PDF preview uses this).
//
// {
//   x, y           top-left of the bg envelope in PDF points
//   ptPerIn        PDF points per inch for sizing
//   contentWIn     text width in inches (no halo)
//   contentHIn     text height in inches (no halo)
//   offsetIn       halo width per side in inches (0 if no bg)
//   text, font, isBold, isItalic, charSpacingPercent
//   textColor      hex string, e.g. "#000000"
//   bgColor        hex string, used when offsetIn > 0
// }
// Given an opentype.js Path (commands array), return a new Path containing
// only the OUTER subpaths (clockwise / positive signed area). Used for the BG
// halo so it forms a solid inflated glyph silhouette without holes — the bg
// halo should never bleed into letter counters (the inside of "R", "O", etc.).
function outerOnlyPath(srcPath) {
  const groups = [];
  let cur = null;
  for (const c of srcPath.commands) {
    if (c.type === "M") {
      cur = [c];
      groups.push(cur);
    } else if (cur) {
      cur.push(c);
    }
  }
  function signedArea(g) {
    let a = 0;
    let lastX = 0, lastY = 0;
    let startX = 0, startY = 0;
    for (let i = 0; i < g.length; i++) {
      const c = g[i];
      if (c.type === "M") {
        startX = c.x; startY = c.y;
        lastX = c.x; lastY = c.y;
      } else if (c.type === "L" || c.type === "C" || c.type === "Q") {
        const x = c.x, y = c.y;
        a += lastX * y - x * lastY;
        lastX = x; lastY = y;
      } else if (c.type === "Z") {
        a += lastX * startY - startX * lastY;
        lastX = startX; lastY = startY;
      }
    }
    return a;
  }
  // For TrueType glyph paths in opentype.js, Y is positive-down; outer
  // contours wind clockwise → positive shoelace area in this convention.
  const outer = groups.filter((g) => signedArea(g) > 0).flat();
  const out = new opentype.Path();
  out.commands = outer;
  return out;
}

function drawCutVinylDecalPreview(pdfDoc, opts) {
  const {
    x, y, ptPerIn,
    contentWIn, contentHIn, offsetIn = 0,
    text, font, isBold, isItalic, charSpacingPercent = 0,
    textColor = "#000000",
    bgColor = "#000000",
  } = opts;
  if (!text || !contentWIn || !contentHIn) return;

  let otFont;
  try { otFont = loadFont(font || "Arial", !!isBold, !!isItalic); } catch { return; }

  const fontSize = contentHIn * ptPerIn;
  const charSpacingPt = (Number(charSpacingPercent) / 100) * fontSize;
  const naturalPath = otFont.getPath(text, 0, 0, fontSize, { letterSpacing: charSpacingPt });
  const naturalBB = naturalPath.getBoundingBox();
  const naturalAdvancePt = naturalBB.x2 - naturalBB.x1;
  const targetWidthPt = contentWIn * ptPerIn;
  const xScale = naturalAdvancePt > 0 ? targetWidthPt / naturalAdvancePt : 1;

  // Place the text inside the bg envelope. Envelope top-left = (x, y); text
  // top-left = envelope top-left + offsetIn padding; baseline at text bottom.
  const txPt = x + offsetIn * ptPerIn - naturalBB.x1 * xScale;
  const tyPt = y + (offsetIn + contentHIn) * ptPerIn;
  const svgPath = naturalPath.toPathData();

  // Background halo (drawn first so the text fill sits on top). Use OUTER
  // subpaths only so the halo doesn't bleed into letter counters (the
  // hollow inside of "R", "O", etc.) — the bg piece is a solid backing.
  if (offsetIn > 0) {
    const outerSvgPath = outerOnlyPath(naturalPath).toPathData();
    pdfDoc.save();
    pdfDoc.transform(xScale, 0, 0, 1, txPt, tyPt);
    pdfDoc.lineWidth(offsetIn * 2 * ptPerIn);
    pdfDoc.strokeColor(bgColor);
    pdfDoc.fillColor(bgColor);
    pdfDoc.lineJoin("miter");
    pdfDoc.miterLimit(2);
    drawSvgPath(pdfDoc, outerSvgPath);
    pdfDoc.fillAndStroke();
    pdfDoc.restore();
  }

  // Foreground text fill
  pdfDoc.save();
  pdfDoc.transform(xScale, 0, 0, 1, txPt, tyPt);
  pdfDoc.fillColor(textColor);
  drawSvgPath(pdfDoc, svgPath);
  pdfDoc.fill();
  pdfDoc.restore();
}

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

// POST /api/decal-files/cut-vinyl-multi
// Renders multiple rows (text and/or logo) onto a SINGLE cut-vinyl PDF, using
// the layout positions provided by the frontend (in inches, top-left origin).
// Supports two layer modes:
//   layer: "text"   -> outline text + raw logo image at given positions
//   layer: "offset" -> stroke each text path with `offsetSize` inches of fat
//                       stroke, producing a halo / "stroke turned into object"
//                       cut path. Logo offset rendering is currently skipped.
router.post("/cut-vinyl-multi", async (req, res) => {
  try {
    const {
      rows = [],
      bbox = {},
      qty: qtyRaw = 1,
      layer = "text",
      offsetSize = 0,
      colorName = "Vinyl",
      vinylShortCode,
      orderId,
      orderNumber,
      fileSuffix,
      layerIndex,
      layerCount,
    } = req.body || {};

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "rows must be a non-empty array" });
    }
    const qtyNum = Math.max(1, parseInt(qtyRaw) || 1);
    const isOffsetLayer = layer === "offset";
    const offsetIn = isOffsetLayer ? Math.max(0, parseFloat(offsetSize) || 0) : 0;
    const decalNum = orderId ? parseInt(orderId) : nextDecalNumber();

    // Compute composite bounding box from rows if not supplied. The bbox is
    // expressed in inches, top-left = (0,0).
    let bboxW = parseFloat(bbox.widthIn);
    let bboxH = parseFloat(bbox.heightIn);
    if (!Number.isFinite(bboxW) || !Number.isFinite(bboxH) || bboxW <= 0 || bboxH <= 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      rows.forEach((r) => {
        const x = Number(r.xIn || 0);
        const y = Number(r.yIn || 0);
        const w = Number(r.widthIn || 0);
        const h = Number(r.heightIn || 0);
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x + w > maxX) maxX = x + w;
        if (y + h > maxY) maxY = y + h;
      });
      bboxW = Math.max(0.1, maxX - minX);
      bboxH = Math.max(0.1, maxY - minY);
    }
    // Inflate bbox by offsetIn on each side so fat strokes don't get clipped
    // by the bounding/weeding boxes.
    const pad = isOffsetLayer ? offsetIn / 2 : 0;
    const graphicW = bboxW + pad * 2;
    const graphicH = bboxH + pad * 2;

    // Bounding box: 1" taller and wider (0.5" each side)
    const boxW = graphicW + 1;
    const boxH = graphicH + 1;

    // Nesting: arrange units within 24" material width
    const cols = Math.max(1, Math.floor(MATERIAL_WIDTH / boxW));
    const rows2 = Math.ceil(qtyNum / cols);
    const totalW = MATERIAL_WIDTH;
    const totalH = rows2 * boxH;

    const pdfDoc = new PDFDocument({ size: [totalW * PT, totalH * PT], margin: 0 });
    const chunks = [];
    pdfDoc.on("data", (c) => chunks.push(c));
    pdfDoc.on("end", () => {
      const pdfBuffer = Buffer.concat(chunks);
      const layerName = isOffsetLayer ? "offset" : "text";
      const filename = buildCutFilename({
        orderNumber,
        vinylShortCode,
        colorName,
        suffix: fileSuffix || (isOffsetLayer ? "BG" : "TXT"),
        legacyDecalNum: decalNum,
        legacyLayerName: layerName,
        layerIndex,
        layerCount,
      });
      if (orderNumber) {
        try {
          const dir = cutLayerOutputDir(isOffsetLayer);
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, filename), pdfBuffer);
        } catch (e) {
          console.error("Error saving multi-row cut file:", e);
        }
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    });

    for (let unit = 0; unit < qtyNum; unit++) {
      const col = unit % cols;
      const row = Math.floor(unit / cols);
      const boxX = col * boxW;
      const boxY = row * boxH;
      const graphicX = boxX + (boxW - graphicW) / 2;
      const graphicY = boxY + (boxH - graphicH) / 2;

      // Bounding box (no fill)
      pdfDoc.save();
      pdfDoc.lineWidth(STROKE_WIDTH);
      pdfDoc.rect(boxX * PT, boxY * PT, boxW * PT, boxH * PT);
      pdfDoc.strokeColor("#000000");
      pdfDoc.stroke();
      pdfDoc.restore();

      // Weeding box: 0.5" buffer around the graphic envelope
      const weedBuf = 0.5;
      const weedW = graphicW + weedBuf * 2;
      const weedH = graphicH + weedBuf * 2;
      const weedX = boxX + (boxW - weedW) / 2;
      const weedY = boxY + (boxH - weedH) / 2;
      pdfDoc.save();
      pdfDoc.lineWidth(STROKE_WIDTH);
      pdfDoc.strokeColor("#000000");
      pdfDoc.rect(weedX * PT, weedY * PT, weedW * PT, weedH * PT);
      pdfDoc.stroke();
      pdfDoc.restore();

      // Registration squares — only on the background (offset) layer so
      // cutters can align the BG cut against the text/logo cut. Single-
      // layer text-only cut files don't get them.
      if (isOffsetLayer) {
        const regSize = 0.25;
        const regPositions = [
          { x: graphicX - regSize - 0.1, y: graphicY + graphicH / 2 - regSize / 2 },
          { x: graphicX + graphicW / 2 - regSize / 2, y: graphicY - regSize - 0.1 },
          { x: graphicX + graphicW + 0.1, y: graphicY + graphicH / 2 - regSize / 2 },
        ];
        pdfDoc.save();
        pdfDoc.lineWidth(STROKE_WIDTH);
        pdfDoc.strokeColor("#000000");
        regPositions.forEach((p) => {
          pdfDoc.rect(p.x * PT, p.y * PT, regSize * PT, regSize * PT);
          pdfDoc.stroke();
        });
        pdfDoc.restore();
      }

      // Render each row at its provided (xIn, yIn) within the bbox.
      for (const r of rows) {
        const rxIn = Number(r.xIn || 0) + pad;
        const ryIn = Number(r.yIn || 0) + pad;
        const rwIn = Number(r.widthIn || 0);
        const rhIn = Number(r.heightIn || 0);
        if (!rwIn || !rhIn) continue;

        // Place row's top-left in PDF space
        const rxPt = (graphicX + rxIn) * PT;
        const ryPt = (graphicY + ryIn) * PT;

        if (r.type === "logo") {
          if (isOffsetLayer) {
            // Raster-logo halo: emit a rounded rectangle equal to the logo's
            // bounding rect inflated by `offsetIn` on each side. It's not a
            // tight silhouette trace, but it gives the cutter a usable
            // background-piece path so the BACKGROUND FILE button produces a
            // valid cut PDF in logo mode. (True silhouette dilation requires
            // bitmap potrace — TODO.)
            const inflate = offsetIn;
            const rxIn2 = rxIn - inflate;
            const ryIn2 = ryIn - inflate;
            const rwIn2 = rwIn + inflate * 2;
            const rhIn2 = rhIn + inflate * 2;
            const rPt = Math.min(rwIn2, rhIn2) * 0.1 * PT; // gentle corner radius
            pdfDoc.save();
            pdfDoc.lineWidth(STROKE_WIDTH);
            pdfDoc.strokeColor("#000000");
            pdfDoc.fillColor("#000000");
            pdfDoc.roundedRect(
              (graphicX + rxIn2) * PT,
              (graphicY + ryIn2) * PT,
              rwIn2 * PT,
              rhIn2 * PT,
              rPt
            );
            pdfDoc.fillAndStroke();
            pdfDoc.restore();
            continue;
          }
          if (!r.imageDataUrl) continue;
          const m = String(r.imageDataUrl).match(/^data:image\/(\w+);base64,(.+)$/);
          if (!m) continue;
          try {
            const buf = Buffer.from(m[2], "base64");
            pdfDoc.save();
            pdfDoc.image(buf, rxPt, ryPt, { width: rwIn * PT, height: rhIn * PT });
            pdfDoc.restore();
          } catch (e) {
            console.error("Logo embed failed:", e.message);
          }
          continue;
        }

        // Text row
        const text = String(r.text || "");
        if (!text) continue;
        const otFont = loadFont(r.font || "Arial", !!r.isBold, !!r.isItalic);
        const fontSize = rhIn * PT;
        const charSpacingPt = ((parseFloat(r.charSpacing) || 0) / 100) * fontSize;
        const naturalPath = otFont.getPath(text, 0, 0, fontSize, { letterSpacing: charSpacingPt });
        const naturalBB = naturalPath.getBoundingBox();
        const naturalAdvancePt = naturalBB.x2 - naturalBB.x1;
        const targetWidthPt = rwIn * PT;
        const xScale = naturalAdvancePt > 0 ? targetWidthPt / naturalAdvancePt : 1;
        const txPt = rxPt - naturalBB.x1 * xScale;
        const tyPt = ryPt + rhIn * PT; // baseline at row bottom
        const svgPath = naturalPath.toPathData();

        if (isOffsetLayer) {
          // Outer glyph silhouettes only — inner counters excluded so the
          // bg piece is a solid backing with no internal holes.
          const bgSvgPath = outerOnlyPath(naturalPath).toPathData();
          pdfDoc.save();
          pdfDoc.transform(xScale, 0, 0, 1, txPt, tyPt);
          pdfDoc.lineWidth(offsetIn * 2 * PT);
          pdfDoc.strokeColor("#000000");
          pdfDoc.fillColor("#000000");
          pdfDoc.lineJoin("miter");
          pdfDoc.miterLimit(2);
          drawSvgPath(pdfDoc, bgSvgPath);
          pdfDoc.fillAndStroke();
          pdfDoc.restore();
        } else {
          pdfDoc.save();
          pdfDoc.transform(xScale, 0, 0, 1, txPt, tyPt);
          pdfDoc.lineWidth(STROKE_WIDTH);
          pdfDoc.strokeColor("#000000");
          drawSvgPath(pdfDoc, svgPath);
          pdfDoc.stroke();
          pdfDoc.restore();
        }
      }
    }

    pdfDoc.end();
  } catch (err) {
    console.error("Multi-row cut file error:", err);
    res.status(500).json({ error: "Failed to generate combined cut file: " + err.message });
  }
});

export default router;
