import React, { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";

export default function PrintedDecals() {
  const [logoUrl, setLogoUrl] = useState("");
  const [shape, setShape] = useState("rectangle");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [width, setWidth] = useState(6);
  const [height, setHeight] = useState(4);
  const [scale, setScale] = useState(1);
  const [qty, setQty] = useState(1);
  const [backgroundColor, setBackgroundColor] = useState("transparent");

  const [positionX, setPositionX] = useState(0);
  const [positionY, setPositionY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [startPosX, setStartPosX] = useState(0);
  const [startPosY, setStartPosY] = useState(0);
  const previewRef = useRef(null);
  const printCaptureRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const b = await api.brandingGet();
        if (b && typeof b === "object") {
          const rawLogo = b.logoUrl || b.logoPath || b.logo_path || "";
          const fullLogo = rawLogo && rawLogo.startsWith("/") ? `${window.location.origin}${rawLogo}` : rawLogo;
          setLogoUrl(fullLogo);
        }
      } catch {}
    })();
  }, []);

  // Fetch pricing from API
  const [pricePerSqInch, setPricePerSqInch] = useState(0.60);
  
  useEffect(() => {
    async function loadPricing() {
      try {
        const pricing = await api.printedDecalPricing();
        setPricePerSqInch(Number(pricing.pricePerSqInch));
      } catch (e) {
        console.log('Failed to load pricing, using default');
      }
    }
    loadPricing();
  }, []);

  // Admin-controlled visibility of bottom action buttons
  const [pdToggles, setPdToggles] = useState({ printFile: true, printQuote: true });
  // Storefront pricing (min order + flat-rate shipping)
  const [storefrontPricing, setStorefrontPricing] = useState({ minOrderPrice: 9.99, shippingFlatFee: 0 });
  useEffect(() => {
    (async () => {
      try {
        const t = await api.getDecalPageToggles();
        if (t && t.printedDecals) setPdToggles(t.printedDecals);
      } catch {}
      try {
        const p = await api.getStorefrontPricing();
        if (p && typeof p === 'object') setStorefrontPricing({
          minOrderPrice: Number(p.minOrderPrice) || 0,
          shippingFlatFee: Number(p.shippingFlatFee) || 0,
        });
      } catch {}
    })();
  }, []);

  // Natural pixel dimensions of the uploaded raster image (PNG/JPG only).
  // Used to compute effective DPI of the print and warn on low-quality input.
  const [imageNaturalDims, setImageNaturalDims] = useState(null);
  useEffect(() => {
    if (!previewUrl) { setImageNaturalDims(null); return; }
    if (!(file?.type?.startsWith("image/")) || file?.type === "image/svg+xml") {
      setImageNaturalDims(null); // vector formats: DPI doesn't apply
      return;
    }
    const img = new Image();
    img.onload = () => setImageNaturalDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => setImageNaturalDims(null);
    img.src = previewUrl;
  }, [previewUrl, file]);

  // Compute effective print DPI = min(imgPx / printIn) for both axes.
  // Returns null when no raster image is loaded so we don't show a warning.
  const effectiveDpi = (() => {
    if (!imageNaturalDims || !width || !height) return null;
    const dpiW = imageNaturalDims.w / Number(width || 1);
    const dpiH = imageNaturalDims.h / Number(height || 1);
    return Math.floor(Math.min(dpiW, dpiH));
  })();
  // Quality bands tuned for sticker/decal print output.
  const dpiQuality =
    effectiveDpi == null ? null :
    effectiveDpi < 100 ? 'poor' :
    effectiveDpi < 150 ? 'fair' :
    effectiveDpi < 250 ? 'good' : 'excellent';

  const PRICE_PER_SQ_INCH = pricePerSqInch;
  const area = Number((width * height).toFixed(1));
  const itemsSubtotal = Number((area * PRICE_PER_SQ_INCH * qty).toFixed(2));
  const minOrderApplied = itemsSubtotal < Number(storefrontPricing.minOrderPrice || 0);
  const minBumpedSubtotal = Math.max(itemsSubtotal, Number(storefrontPricing.minOrderPrice || 0));
  const shippingFee = Number(storefrontPricing.shippingFlatFee || 0);
  const totalPrice = (minBumpedSubtotal + shippingFee).toFixed(2);

  // Preview is responsive: square box that fills its parent up to 400px on
  // desktop and shrinks proportionally on mobile. We measure the rendered
  // width via ResizeObserver so the absolute-positioned mask + measurement
  // bars never overflow the viewport.
  const PREVIEW_MAX = 400;
  const [previewSize, setPreviewSize] = useState(PREVIEW_MAX);
  useEffect(() => {
    if (!previewRef.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setPreviewSize(Math.max(220, Math.round(w)));
      }
    });
    ro.observe(previewRef.current);
    return () => ro.disconnect();
  }, []);
  const maxMask = Math.round(previewSize * 0.9);
  const maskWidth = shape === "rectangle" ? (width / Math.max(width, height)) * maxMask : maxMask;
  const maskHeight = shape === "rectangle" ? (height / Math.max(width, height)) * maxMask : maxMask;
  const measurePad = 20;

  useEffect(() => {
    if (shape === "circle" || shape === "square") {
      setHeight(width);
    }
  }, [shape, width]);

  useEffect(() => {
    setPositionX(-(maskWidth * (scale - 1)) / 2);
    setPositionY(-(maskHeight * (scale - 1)) / 2);
  }, [maskWidth, maskHeight, scale]);

  const handleMouseDown = (e) => {
    setDragging(true);
    setStartX(e.clientX);
    setStartY(e.clientY);
    setStartPosX(positionX);
    setStartPosY(positionY);
  };

  const handleMouseMove = (e) => {
    if (dragging) {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      setPositionX(startPosX + deltaX);
      setPositionY(startPosY + deltaY);
    }
  };

  const handleMouseUp = () => {
    setDragging(false);
  };

  const handleCenter = () => {
    setPositionX(-(maskWidth * (scale - 1)) / 2);
    setPositionY(-(maskHeight * (scale - 1)) / 2);
  };

  function handleFileChange(event) {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
  }

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target.result);
    };
    reader.readAsDataURL(file);
  }, [file]);

  const isImage = file?.type?.startsWith("image/");
  const isPdf = file?.type === "application/pdf";
  const isSvg = file?.type === "image/svg+xml";
  const isEps = file?.type === "application/postscript" || file?.type === "application/eps";

  return (
    <div style={{ padding: 'clamp(8px, 3vw, 20px)', width: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
      {/* Logo */}
      {logoUrl && (
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <img src={logoUrl} alt="Logo" style={{ height: 80, maxWidth: 400, objectFit: 'contain', borderRadius: 12 }} />
        </div>
      )}

      {/* Navigation Bar */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '20px', position: 'relative' }}>
        <Link to="/login" style={{ textDecoration: 'none', position: 'absolute', left: 0 }}>
          <button style={{ padding: '6px 12px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
            Log In
          </button>
        </Link>

        <div style={{ display: 'flex', gap: '12px' }}>
          <Link to="/decals" style={{ textDecoration: 'none' }}>
            <button style={{ padding: '12px 24px', backgroundColor: '#444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '16px' }}>
              Cut Vinyl
            </button>
          </Link>
          <button style={{ padding: '12px 24px', backgroundColor: '#0056b3', color: 'white', border: 'none', borderRadius: '6px', cursor: 'default', fontSize: '16px', fontWeight: 'bold' }}>
            Printed Decals
          </button>
        </div>
      </div>

      <p style={{ textAlign: 'center', marginBottom: '20px' }}>Design your own printed decal below.</p>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ padding: '16px', maxWidth: '520px', width: '100%', boxSizing: 'border-box', background: '#fff', borderRadius: '10px', color: '#000' }}>
          <h2 style={{ textAlign: 'center' }}>Printed Decals</h2>

      {/* Visual Preview — responsive square (max 400px, shrinks on mobile) */}
      <div ref={previewRef} style={{ width: `min(100%, ${PREVIEW_MAX}px)`, aspectRatio: '1 / 1', height: `${previewSize}px`, margin: "0 auto 20px", background: '#333', position: 'relative' }}>
        {/* Measurement bars (match cut-vinyl preview style) */}
        <div style={{ position: 'absolute', left: `${(previewSize - maskWidth) / 2}px`, width: `${maskWidth}px`, top: `${(previewSize - maskHeight) / 2 - measurePad}px`, height: '1px', background: 'rgba(255,255,255,0.85)', zIndex: 3 }} />
        <div style={{ position: 'absolute', left: `${(previewSize - maskWidth) / 2}px`, top: `${(previewSize - maskHeight) / 2 - measurePad - 5}px`, width: '1px', height: '11px', background: 'rgba(255,255,255,0.85)', zIndex: 3 }} />
        <div style={{ position: 'absolute', left: `${(previewSize + maskWidth) / 2}px`, top: `${(previewSize - maskHeight) / 2 - measurePad - 5}px`, width: '1px', height: '11px', background: 'rgba(255,255,255,0.85)', zIndex: 3 }} />
        <div style={{ position: 'absolute', top: `${(previewSize - maskHeight) / 2 - measurePad - 16}px`, left: '50%', transform: 'translateX(-50%)', color: 'white', fontSize: '11px', background: 'rgba(0,0,0,0.7)', padding: '1px 5px', borderRadius: '3px', whiteSpace: 'nowrap', zIndex: 3 }}>
          W {width}"
        </div>

        <div style={{ position: 'absolute', left: `${(previewSize - maskWidth) / 2 - measurePad}px`, top: `${(previewSize - maskHeight) / 2}px`, height: `${maskHeight}px`, width: '1px', background: 'rgba(255,255,255,0.85)', zIndex: 3 }} />
        <div style={{ position: 'absolute', left: `${(previewSize - maskWidth) / 2 - measurePad - 5}px`, top: `${(previewSize - maskHeight) / 2}px`, width: '11px', height: '1px', background: 'rgba(255,255,255,0.85)', zIndex: 3 }} />
        <div style={{ position: 'absolute', left: `${(previewSize - maskWidth) / 2 - measurePad - 5}px`, top: `${(previewSize + maskHeight) / 2}px`, width: '11px', height: '1px', background: 'rgba(255,255,255,0.85)', zIndex: 3 }} />
        <div style={{ position: 'absolute', left: `${(previewSize - maskWidth) / 2 - measurePad - 6}px`, top: '50%', transform: 'translate(-100%, -50%)', color: 'white', fontSize: '11px', background: 'rgba(0,0,0,0.7)', padding: '1px 5px', borderRadius: '3px', whiteSpace: 'nowrap', zIndex: 3 }}>
          H {height}"
        </div>

        {previewUrl ? (
          (isImage || isSvg || isEps) ? (
            <div
              ref={printCaptureRef}
              style={{
                position: 'absolute',
                width: `${maskWidth}px`,
                height: `${maskHeight}px`,
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                border: '2px solid black',
                borderRadius: shape === "circle" ? "50%" : "12px",
                backgroundColor: backgroundColor === "transparent" ? 'transparent' : backgroundColor,
                backgroundImage: `url(${previewUrl})`,
                backgroundSize: `${scale * 100}%`,
                backgroundPosition: `${positionX}px ${positionY}px`,
                backgroundRepeat: 'no-repeat',
                overflow: 'hidden',
                zIndex: 1,
                cursor: dragging ? 'grabbing' : 'grab'
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onDragStart={(e) => e.preventDefault()}
            />
          ) : isPdf ? (
              <div
                ref={printCaptureRef}
                style={{ position: 'absolute', width: `${maskWidth}px`, height: `${maskHeight}px`, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', border: '2px solid black', borderRadius: shape === "circle" ? "50%" : "12px", background: 'rgba(255,255,255,0.1)', overflow: 'hidden', zIndex: 1 }}
              >
              <object data={previewUrl} type="application/pdf" style={{ width: '100%', height: '100%', zIndex: 1 }}>
                <div style={{ color: "white", padding: "10px", textAlign: "center" }}>
                  PDF preview not available in this browser.
                </div>
              </object>
            </div>
          ) : (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: "white", textAlign: "center", padding: "16px", zIndex: 1 }}>
              {file ? `Preview not available for ${file.name}` : "Upload a file to preview."}
            </div>
          )
        ) : (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: "white", textAlign: "center", padding: "16px", zIndex: 1 }}>
            Upload your art to preview here.
          </div>
        )}
      </div>

      <div style={{ marginBottom: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
        <div>
          <label>Shape:</label>
          <select value={shape} onChange={(e) => setShape(e.target.value)} style={inputStyle}>
            <option value="rectangle">Rectangle</option>
            <option value="square">Square</option>
            <option value="circle">Circle</option>
          </select>
        </div>

        <div>
          <label>Background Color:</label>
          <select value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} style={inputStyle}>
            <option value="transparent">Transparent</option>
            <option value="white">White</option>
            <option value="black">Black</option>
            <option value="red">Red</option>
            <option value="blue">Blue</option>
            <option value="yellow">Yellow</option>
            <option value="green">Green</option>
            <option value="orange">Orange</option>
            <option value="purple">Purple</option>
            <option value="pink">Pink</option>
          </select>
        </div>

        <div>
          <label>Upload File:</label>
          <input type="file" accept=".png,.jpg,.jpeg,.svg,.pdf,.eps" onChange={handleFileChange} style={inputStyle} />
        </div>

        <div>
          <label>Width (inches):</label>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button type="button" onClick={() => setWidth(Math.max(1, width - 1))} style={btnStyle}>-</button>
            <input type="number" min="1" max="48" step="1" value={width} onChange={(e) => setWidth(Math.max(1, parseFloat(e.target.value) || 1))} style={{...inputStyle, textAlign: 'center', flex: 1}} />
            <button type="button" onClick={() => setWidth(Math.min(48, width + 1))} style={btnStyle}>+</button>
          </div>
        </div>

        <div>
          <label>Height (inches):</label>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button type="button" onClick={() => setHeight(Math.max(1, height - 1))} disabled={shape === "circle" || shape === "square"} style={{...btnStyle, opacity: shape === "circle" || shape === "square" ? 0.5 : 1}}>-</button>
            <input type="number" min="1" max="48" step="1" value={height} onChange={(e) => setHeight(Math.max(1, parseFloat(e.target.value) || 1))} style={{...inputStyle, textAlign: 'center', flex: 1}} disabled={shape === "circle" || shape === "square"} />
            <button type="button" onClick={() => setHeight(Math.min(48, height + 1))} disabled={shape === "circle" || shape === "square"} style={{...btnStyle, opacity: shape === "circle" || shape === "square" ? 0.5 : 1}}>+</button>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
        <div>
          <label>Scale:</label>
          <input type="range" min="0.5" max="1.5" step="0.05" value={scale} onChange={(e) => setScale(parseFloat(e.target.value))} style={{ width: "100%" }} />
          <div style={{ marginTop: "6px", color: "#555" }}>Scale {Math.round(scale * 100)}%</div>
        </div>

        <div>
          <label>Quantity:</label>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} style={btnStyle}>-</button>
            <input type="number" min="1" step="1" value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))} style={{...inputStyle, textAlign: 'center', flex: 1}} />
            <button type="button" onClick={() => setQty(qty + 1)} style={btnStyle}>+</button>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <button onClick={handleCenter} style={{ padding: "10px 16px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>
          Center Image
        </button>
      </div>

      {/* Image quality / DPI warning */}
      {dpiQuality && (
        <div
          style={{
            margin: "0 0 12px 0",
            padding: "12px 14px",
            borderRadius: 8,
            border: `1px solid ${dpiQuality === 'poor' ? '#dc3545' : dpiQuality === 'fair' ? '#e0a800' : '#28a745'}`,
            background: dpiQuality === 'poor' ? '#fff5f5' : dpiQuality === 'fair' ? '#fffaf0' : '#f3fbf6',
            color: dpiQuality === 'poor' ? '#721c24' : dpiQuality === 'fair' ? '#856404' : '#155724',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 4 }}>
            Image quality: {dpiQuality.toUpperCase()} • {effectiveDpi} DPI at {width}" × {height}"
          </div>
          {dpiQuality === 'poor' && (
            <div>Heads up — this image is too low resolution for the requested print size. Expect visible pixelation, blurry edges, and posterized colors. Use a higher-resolution file (≥150 DPI) or print smaller.</div>
          )}
          {dpiQuality === 'fair' && (
            <div>This image is borderline for the requested size. Some pixelation may be visible up close. We recommend ≥150 DPI for clean prints, ≥300 DPI for crisp results.</div>
          )}
          {dpiQuality === 'good' && (
            <div>Solid resolution for this size. Should print cleanly.</div>
          )}
          {dpiQuality === 'excellent' && (
            <div>Excellent resolution for this size — should print crisp.</div>
          )}
          {imageNaturalDims && (
            <div style={{ marginTop: 4, fontWeight: 500, color: '#555' }}>
              Source image: {imageNaturalDims.w}×{imageNaturalDims.h} px
            </div>
          )}
        </div>
      )}

      <div style={{ background: "#f8f9fd", borderRadius: "10px", padding: "16px", border: "1px solid #e5e9f2" }}>
        <h3 style={{ marginTop: 0 }}>Order Summary</h3>
        <div style={{ display: "grid", gap: "8px", fontSize: "15px" }}>
          <div>Shape: <strong>{shape}</strong></div>
          <div>Background: <strong>{backgroundColor === "transparent" ? "Transparent" : backgroundColor.charAt(0).toUpperCase() + backgroundColor.slice(1)}</strong></div>
          <div>Size: <strong>{width}" x {height}"</strong></div>
          <div>Area: <strong>{area} sq in</strong></div>
          <div>Qty: <strong>{qty}</strong></div>
          <div>Price per unit: <strong>${(area * PRICE_PER_SQ_INCH).toFixed(2)}</strong></div>
          <div>Subtotal: <strong>${itemsSubtotal.toFixed(2)}</strong></div>
          {minOrderApplied && (
            <div style={{ color: '#b06000' }}>
              Order Minimum (${Number(storefrontPricing.minOrderPrice).toFixed(2)}): <strong>+${(minBumpedSubtotal - itemsSubtotal).toFixed(2)}</strong>
            </div>
          )}
          {shippingFee > 0 && (
            <div>Shipping: <strong>${shippingFee.toFixed(2)}</strong></div>
          )}
          <div style={{ marginTop: "8px" }}><strong>Total: ${totalPrice}</strong></div>
          <div style={{ fontSize: "13px", color: "#555" }}>Accepted: PNG, JPG, SVG, PDF, EPS</div>
        </div>
      </div>

      {/* Generate Print File */}
      <div style={{ marginTop: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {pdToggles.printFile !== false && (
        <button
          onClick={async () => {
            // Quality gate: if the source image is too low resolution for the
            // requested print size, force the user to acknowledge before we
            // generate the print file.
            if (dpiQuality === 'poor') {
              const ok = window.confirm(
                `Low image quality detected\n\n` +
                `Effective ${effectiveDpi} DPI at ${width}" × ${height}".\n` +
                `Expect visible pixelation and soft edges in the printed result.\n\n` +
                `Continue anyway?`
              );
              if (!ok) return;
            }
            try {
              let snapshotData = null;
              if (previewRef.current) {
                const h2c = await import('html2canvas').then(m => m.default || m);
                const nodeToCapture = printCaptureRef.current || previewRef.current;
                const canvas = await h2c(nodeToCapture, { backgroundColor: null, scale: 3, useCORS: true, logging: false });
                snapshotData = canvas.toDataURL('image/png');
              }
              await api.generatePrintedDecalFile({
                width, height, shape, backgroundColor, colorName: backgroundColor === 'transparent' ? 'Transparent' : backgroundColor, qty,
                imageData: snapshotData,
                previewWidth: maskWidth,
                previewHeight: maskHeight,
              });
            } catch (e) { alert('Error generating print file: ' + e.message); }
          }}
          style={{ padding: '10px 18px', background: '#28a745', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
        >
          Print File (PDF)
        </button>
        )}
        {pdToggles.printQuote !== false && (
        <button
          onClick={async () => {
            try {
              let previewImage = null;
              if (previewRef.current) {
                const h2c = await import('html2canvas').then(m => m.default || m);
                // Crop to the actual decal mask rect so the embedded image's
                // aspect ratio matches the real (e.g. 6"×4") decal, not the
                // square preview box.
                const pad = 6;
                const cropX = Math.max(0, Math.floor((previewSize - maskWidth) / 2 - pad));
                const cropY = Math.max(0, Math.floor((previewSize - maskHeight) / 2 - pad));
                const cropW = Math.ceil(maskWidth + pad * 2);
                const cropH = Math.ceil(maskHeight + pad * 2);
                const canvas = await h2c(previewRef.current, {
                  backgroundColor: '#333333',
                  scale: 3,
                  useCORS: true,
                  logging: false,
                  x: cropX, y: cropY, width: cropW, height: cropH,
                });
                previewImage = canvas.toDataURL('image/png');
              }
              await api.generateQuote({
                type: 'printed-decal',
                shape, backgroundColor, width, height,
                area, unitPrice: (area * PRICE_PER_SQ_INCH).toFixed(2), totalPrice, qty,
                previewImage,
              });
            } catch (e) { alert('Error generating quote: ' + e.message); }
          }}
          style={{ padding: '10px 18px', background: '#6f42c1', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
        >
          Print Quote
        </button>
        )}
      </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle = { width: "100%", padding: "10px", marginTop: "6px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "15px" };
const btnStyle = { padding: '8px 14px', background: '#007bff', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', minWidth: '40px' };
