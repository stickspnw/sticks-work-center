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

  const PRICE_PER_SQ_INCH = pricePerSqInch;
  const area = Number((width * height).toFixed(1));
  const totalPrice = (area * PRICE_PER_SQ_INCH * qty).toFixed(2);

  const maxMask = 360;
  const maskWidth = shape === "rectangle" ? (width / Math.max(width, height)) * maxMask : maxMask;
  const maskHeight = shape === "rectangle" ? (height / Math.max(width, height)) * maxMask : maxMask;

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
    <div style={{ padding: "20px", maxWidth: "720px", margin: "0 auto", background: "#fff", borderRadius: "10px", color: "#000" }}>
      {/* Logo */}
      {logoUrl && (
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <img src={logoUrl} alt="Logo" style={{ height: 80, maxWidth: 400, objectFit: 'contain', borderRadius: 12 }} />
        </div>
      )}

      {/* Navigation Bar */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '20px', position: 'relative' }}>
        {/* Login - small, on the left */}
        <Link to="/login" style={{ textDecoration: 'none', position: 'absolute', left: 0 }}>
          <button style={{ padding: '6px 12px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
            Log In
          </button>
        </Link>

        {/* Main Menu Buttons - in the center */}
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

      <p style={{ textAlign: 'center', marginBottom: '20px' }}>Upload art, choose a shape, scale it, and select quantity + size.</p>

      {/* Visual Preview */}
      <div ref={previewRef} style={{ width: "400px", height: "400px", margin: "0 auto 20px", background: '#333', position: 'relative' }}>
        {/* Measurement guides */}
        <div style={{ position: 'absolute', left: '20px', right: '20px', top: '50%', height: '1px', background: 'rgba(255,255,255,0.75)', zIndex: 2 }} />
        <div style={{ position: 'absolute', left: '50%', top: '20px', bottom: '20px', width: '1px', background: 'rgba(255,255,255,0.75)', zIndex: 2 }} />
        <div style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', color: 'white', fontSize: '12px', background: 'rgba(0,0,0,0.65)', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap', zIndex: 2 }}>
          W {width}"
        </div>
        <div style={{ position: 'absolute', left: '4px', top: '50%', transform: 'translateY(-50%)', color: 'white', fontSize: '12px', background: 'rgba(0,0,0,0.65)', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap', zIndex: 2 }}>
          H {height}"
        </div>
        <div style={{ position: 'absolute', left: '20px', top: '18px', width: '8px', height: '8px', background: 'white', borderRadius: '50%', zIndex: 2 }} />
        <div style={{ position: 'absolute', left: '18px', top: '20px', width: '8px', height: '8px', background: 'white', borderRadius: '50%', zIndex: 2 }} />

        {previewUrl ? (
          (isImage || isSvg || isEps) ? (
            <div style={{ position: 'absolute', width: `${maskWidth}px`, height: `${maskHeight}px`, top: shape === "rectangle" ? '50%' : '20px', left: shape === "rectangle" ? '50%' : '20px', transform: shape === "rectangle" ? 'translate(-50%, -50%)' : 'none', border: '2px solid black', borderRadius: shape === "circle" ? "50%" : "12px", backgroundColor: backgroundColor === "transparent" ? 'transparent' : backgroundColor, backgroundImage: `url(${previewUrl})`, backgroundSize: `${scale * 100}%`, backgroundPosition: `${positionX}px ${positionY}px`, backgroundRepeat: 'no-repeat', overflow: 'hidden', zIndex: 1, cursor: dragging ? 'grabbing' : 'grab' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDragStart={(e) => e.preventDefault()}></div>
          ) : isPdf ? (
              <div style={{ position: 'absolute', width: `${maskWidth}px`, height: `${maskHeight}px`, top: shape === "rectangle" ? '50%' : '20px', left: shape === "rectangle" ? '50%' : '20px', transform: shape === "rectangle" ? 'translate(-50%, -50%)' : 'none', border: '2px solid black', borderRadius: shape === "circle" ? "50%" : "12px", background: 'rgba(255,255,255,0.1)', overflow: 'hidden', zIndex: 1 }}>
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

      <div style={{ background: "#f8f9fd", borderRadius: "10px", padding: "16px", border: "1px solid #e5e9f2" }}>
        <h3 style={{ marginTop: 0 }}>Order Summary</h3>
        <div style={{ display: "grid", gap: "8px", fontSize: "15px" }}>
          <div>Shape: <strong>{shape}</strong></div>
          <div>Background: <strong>{backgroundColor === "transparent" ? "Transparent" : backgroundColor.charAt(0).toUpperCase() + backgroundColor.slice(1)}</strong></div>
          <div>Size: <strong>{width}" x {height}"</strong></div>
          <div>Area: <strong>{area} sq in</strong></div>
          <div>Qty: <strong>{qty}</strong></div>
          <div>Price per sq inch: <strong>${PRICE_PER_SQ_INCH.toFixed(2)}</strong></div>
          <div>Price per unit: <strong>${(area * PRICE_PER_SQ_INCH).toFixed(2)}</strong></div>
          <div style={{ marginTop: "8px" }}><strong>Total: ${totalPrice}</strong></div>
          <div style={{ fontSize: "13px", color: "#555" }}>Accepted: PNG, JPG, SVG, PDF, EPS</div>
        </div>
      </div>

      {/* Generate Print File */}
      <div style={{ marginTop: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button
          onClick={async () => {
            try {
              await api.generatePrintedDecalFile({
                width, height, shape, backgroundColor, colorName: backgroundColor === "transparent" ? "Transparent" : backgroundColor, qty,
                imageData: previewUrl || null,
                imageScale: scale,
                imagePosX: positionX,
                imagePosY: positionY,
                previewWidth: maskWidth,
                previewHeight: maskHeight,
              });
            } catch (e) { alert('Error generating print file: ' + e.message); }
          }}
          style={{ padding: '10px 18px', background: '#28a745', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
        >
          Print File (PDF)
        </button>
        <button
          onClick={async () => {
            try {
              let previewImage = null;
              if (previewRef.current) {
                const canvas = await import('html2canvas').then(m => m.default || m).then(h2c => h2c(previewRef.current, { backgroundColor: '#333333', scale: 2 })).catch(() => null);
                if (canvas) previewImage = canvas.toDataURL('image/png');
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
      </div>
    </div>
  );
}

const inputStyle = { width: "100%", padding: "10px", marginTop: "6px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "15px" };
const btnStyle = { padding: '8px 14px', background: '#007bff', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', minWidth: '40px' };
