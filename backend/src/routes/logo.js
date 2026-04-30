import express from "express";
import multer from "multer";
import sharp from "sharp";
import path from "path";
import fs from "fs/promises";

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Helper function to extract colors from image
async function extractColors(imageBuffer) {
  try {
    // Resize image to reasonable size for processing
    const { data, info } = await sharp(imageBuffer)
      .resize(200, 200, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = new Uint8ClampedArray(data);
    const colorMap = new Map();

    // Sample pixels and count colors
    for (let i = 0; i < pixels.length; i += info.channels * 4) { // Sample every 4th pixel
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const a = pixels[i + 3];

      if (a < 128) continue; // Skip transparent pixels

      // Round colors to reduce variations
      const roundedR = Math.round(r / 32) * 32;
      const roundedG = Math.round(g / 32) * 32;
      const roundedB = Math.round(b / 32) * 32;

      const hex = `#${roundedR.toString(16).padStart(2, '0')}${roundedG.toString(16).padStart(2, '0')}${roundedB.toString(16).padStart(2, '0')}`;
      
      colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
    }

    // Sort by frequency and get top colors
    const sortedColors = Array.from(colorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([hex, count]) => ({
        hex,
        count,
        percentage: (count / (pixels.length / (info.channels * 4))) * 100
      }));

    return sortedColors;
  } catch (error) {
    console.error('Error extracting colors:', error);
    throw error;
  }
}

// Helper function to isolate color and create processed image
async function isolateColor(imageBuffer, targetHex) {
  try {
    // Convert hex to RGB
    const r = parseInt(targetHex.slice(1, 3), 16);
    const g = parseInt(targetHex.slice(3, 5), 16);
    const b = parseInt(targetHex.slice(5, 7), 16);

    // Process image to isolate color
    const processedBuffer = await sharp(imageBuffer)
      .ensureAlpha()
      .composite([{
        input: Buffer.from(
          await sharp(imageBuffer)
            .ensureAlpha()
            .raw()
            .toBuffer()
            .then(data => {
              const pixels = new Uint8ClampedArray(data);
              const { width, height, channels } = sharp(imageBuffer).metadata();
              
              for (let i = 0; i < pixels.length; i += channels) {
                const pixelR = pixels[i];
                const pixelG = pixels[i + 1];
                const pixelB = pixels[i + 2];
                const pixelA = pixels[i + 3];

                // Check if pixel matches target color (with tolerance)
                const tolerance = 50;
                const diff = Math.abs(pixelR - r) + Math.abs(pixelG - g) + Math.abs(pixelB - b);
                
                if (diff > tolerance || pixelA < 128) {
                  // Make pixel transparent
                  pixels[i + 3] = 0;
                } else {
                  // Keep pixel opaque
                  pixels[i + 3] = 255;
                }
              }
              
              return pixels;
            })
        ),
        raw: { width: (await sharp(imageBuffer).metadata()).width, height: (await sharp(imageBuffer).metadata()).height, channels: 4 },
        blend: 'over'
      }])
      .png()
      .toBuffer();

    return processedBuffer;
  } catch (error) {
    console.error('Error isolating color:', error);
    throw error;
  }
}

// Process logo and extract colors
router.post("/process", upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const imageBuffer = req.file.buffer;
    
    // Extract colors from the image
    const colors = await extractColors(imageBuffer);
    
    // Get image dimensions
    const metadata = await sharp(imageBuffer).metadata();
    const aspectRatio = metadata.width / metadata.height;
    
    // Calculate reasonable dimensions for cut file (max 12 inches)
    let width = 4;
    let height = 4;
    
    if (aspectRatio > 1) {
      width = Math.min(12, aspectRatio * 4);
      height = width / aspectRatio;
    } else {
      height = Math.min(12, 4 / aspectRatio);
      width = height * aspectRatio;
    }

    // Process each color to create isolated versions
    const processedColors = await Promise.all(
      colors.map(async (color) => {
        try {
          const processedImage = await isolateColor(imageBuffer, color.hex);
          const base64Image = `data:image/png;base64,${processedImage.toString('base64')}`;
          
          return {
            ...color,
            processedImage: base64Image,
            dimensions: {
              width: Number(width.toFixed(1)),
              height: Number(height.toFixed(1))
            }
          };
        } catch (error) {
          console.error(`Error processing color ${color.hex}:`, error);
          return {
            ...color,
            processedImage: null,
            dimensions: {
              width: Number(width.toFixed(1)),
              height: Number(height.toFixed(1))
            }
          };
        }
      })
    );

    res.json({ colors: processedColors });
  } catch (error) {
    console.error('Error processing logo:', error);
    res.status(500).json({ error: "Failed to process logo" });
  }
});

export default router;
