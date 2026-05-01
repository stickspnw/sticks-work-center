import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';

const FONT_LIST = [
  "Impact", "Stencil", "Arial Black", "Felix Titling", "Onyx", "Playbill",
  "Old English Text MT", "Rage Italic", "Matura MT Script Capitals", "Mistral",
  "Forte", "Freestyle Script", "Brush Script MT", "Vladimir Script", "Curlz MT",
  "Jokerman", "Niagara Engraved", "Niagara Solid", "Cooper Black",
  "Gill Sans Ultra Bold", "Rockwell Extra Bold", "Showcard Gothic", "Magneto",
  "Ravie", "Papyrus", "Goudy Old Style", "Copperplate Gothic", "Engravers MT",
  "OCR A Extended", "Century Gothic", "Arial", "Helvetica", "Times New Roman",
  "Courier New", "Georgia", "Verdana", "Trebuchet MS", "Lucida Console", "Futura"
];

const DecalConfigurator = () => {
  const [text, setText] = useState('YOUR TEXT');
  const [height, setHeight] = useState(2);
  const [qty, setQty] = useState(1);
  const [color, setColor] = useState('white');
  const [hasBackground, setHasBackground] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState('black');
  const [backgroundHeight, setBackgroundHeight] = useState(0.25);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [selectedPixel, setSelectedPixel] = useState(null);
  const [logoImageData, setLogoImageData] = useState(null);
  const [logoSelectedColor, setLogoSelectedColor] = useState(null);
  const [showColorModal, setShowColorModal] = useState(false);
  const [isProcessingLogo, setIsProcessingLogo] = useState(false);
  const [logoMode, setLogoMode] = useState(false);
  
  // Payment and order state
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerInfo, setCustomerInfo] = useState({
    name: '',
    address: '',
    email: '',
    phone: ''
  });
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [font, setFont] = useState('Impact');
  const [isBold, setIsBold] = useState(true);
  const [isItalic, setIsItalic] = useState(false);
  const [charSpacing, setCharSpacing] = useState(0); // percent (0-200)
  const previewRef = useRef(null);

  // Multi-line stack: additional lines stacked above/below the primary row.
  // Each line: { id, position: 'above'|'below', type: 'text'|'logo',
  //   text, font, isBold, isItalic, charSpacing, height, color,
  //   logoSelectedColor, logoFile, logoImageData,
  //   offsetXIn, offsetYIn  // drag offsets (inches) from auto-stack position }
  const [additionalLines, setAdditionalLines] = useState([]);
  const [lineSpacing, setLineSpacing] = useState(0.25); // inches between rows

  // Per-row drag offsets (inches). The primary row gets its own state; each
  // additional line stores its own `offsetXIn` / `offsetYIn` on the object.
  const [primaryOffsetIn, setPrimaryOffsetIn] = useState({ x: 0, y: 0 });
  const [draggingRow, setDraggingRow] = useState(null);
  // Latest pixels-per-inch from the preview, used to convert mouse pixel deltas
  // into inch offsets while a drag is in progress.
  const dragScaleRef = useRef(1);

  // Vinyl colors from database
  const [vinylColors, setVinylColors] = useState([]);
  const [colorsLoading, setColorsLoading] = useState(true);
  const [transferTapePerSqFt, setTransferTapePerSqFt] = useState(0.05);

  // Admin-controlled visibility of bottom action buttons
  const [pageToggles, setPageToggles] = useState({
    cutVinyl: { textFile: true, strokeFile: true, build: true, payNow: true, printQuote: true },
    printedDecals: { printFile: true, printQuote: true },
  });
  // Storefront pricing (min order + flat shipping)
  const [storefrontPricing, setStorefrontPricing] = useState({ minOrderPrice: 9.99, shippingFlatFee: 0 });
  useEffect(() => {
    (async () => {
      try {
        const t = await api.getDecalPageToggles();
        if (t && typeof t === 'object') setPageToggles(t);
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
  const cvToggles = pageToggles.cutVinyl || {};

  useEffect(() => {
    async function loadColors() {
      try {
        const colors = await api.vinylColors();
        setVinylColors(colors);
        const active = colors.filter((c) => c.isActive);
        // Pick text color: first active color the user hasn't already overridden.
        let pickedTextCode = color;
        if (active.length > 0 && !active.find((c) => c.colorCode === color)) {
          pickedTextCode = active[0].colorCode;
          setColor(pickedTextCode);
        }
        // Pick background color: first active color that's NOT the text color
        // so the halo is always visible by default. Falls back to the first
        // active color if there's only one option.
        if (active.length > 0 && !active.find((c) => c.colorCode === backgroundColor)) {
          const bgPick = active.find((c) => c.colorCode !== pickedTextCode) || active[0];
          setBackgroundColor(bgPick.colorCode);
        } else if (active.length > 1 && backgroundColor === pickedTextCode) {
          // Edge case: previous bg default happened to match the picked text.
          const bgPick = active.find((c) => c.colorCode !== pickedTextCode) || active[0];
          setBackgroundColor(bgPick.colorCode);
        }
      } catch (e) {
        console.log('Failed to load vinyl colors, using defaults');
      } finally {
        setColorsLoading(false);
      }
    }
    async function loadTransferTapePrice() {
      try {
        const data = await api.getTransferTapePrice();
        setTransferTapePerSqFt(Number(data.pricePerSqFt) || 0.05);
      } catch {}
    }
    loadColors();
    loadTransferTapePrice();

    // Keep tape price fresh: re-fetch when this tab/window regains focus,
    // so admin updates flow through without a hard refresh.
    const onFocus = () => { loadTransferTapePrice(); };
    const onVisibility = () => {
      if (document.visibilityState === "visible") loadTransferTapePrice();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    // Periodic safety refresh every 30s while the page is open.
    const intervalId = setInterval(loadTransferTapePrice, 30000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(intervalId);
    };
  }, []);

  // Logo processing functions
  const handleLogoUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsProcessingLogo(true);
    setLogoFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setLogoPreview(e.target.result);
      // Load image data for pixel selection
      const img = new Image();
      img.onload = () => {
        setLogoImageData(img);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    
    setIsProcessingLogo(false);
  };

  const handleLogoClick = (event) => {
    if (!logoImageData) return;

    const rect = event.target.getBoundingClientRect();
    // Display coordinates (relative to the rendered <img>)
    const dispX = event.clientX - rect.left;
    const dispY = event.clientY - rect.top;
    // Map to native image coordinates so pixel sampling is accurate
    const scaleX = logoImageData.width / rect.width;
    const scaleY = logoImageData.height / rect.height;
    const nx = Math.max(0, Math.min(logoImageData.width - 1, Math.round(dispX * scaleX)));
    const ny = Math.max(0, Math.min(logoImageData.height - 1, Math.round(dispY * scaleY)));

    // Extract color at this pixel right now so we can show a swatch immediately
    try {
      const c = document.createElement('canvas');
      c.width = logoImageData.width;
      c.height = logoImageData.height;
      const cctx = c.getContext('2d');
      cctx.drawImage(logoImageData, 0, 0);
      const px = cctx.getImageData(nx, ny, 1, 1).data;
      const hex = '#' + [px[0], px[1], px[2]].map(v => v.toString(16).padStart(2, '0')).join('');
      setSelectedPixel({ x: dispX, y: dispY, nx, ny, hex });
    } catch {
      setSelectedPixel({ x: dispX, y: dispY, nx, ny, hex: null });
    }
  };

  const processSelectedArea = async () => {
    if (!selectedPixel || !logoImageData) return;
    
    setIsProcessingLogo(true);
    
    try {
      // Create canvas to extract pixel color
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = logoImageData.width;
      canvas.height = logoImageData.height;
      ctx.drawImage(logoImageData, 0, 0);
      
      // Get the color at the selected pixel (use native image coords)
      const sx = selectedPixel.nx ?? selectedPixel.x;
      const sy = selectedPixel.ny ?? selectedPixel.y;
      const imageData = ctx.getImageData(sx, sy, 1, 1);
      const pixel = imageData.data;
      const r = pixel[0];
      const g = pixel[1];
      const b = pixel[2];
      const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
      
      // Create processed image with only selected color
      const processedCanvas = document.createElement('canvas');
      const processedCtx = processedCanvas.getContext('2d');
      processedCanvas.width = logoImageData.width;
      processedCanvas.height = logoImageData.height;
      
      // Draw original image
      processedCtx.drawImage(logoImageData, 0, 0);
      
      // Get all pixels and make non-matching colors transparent
      const fullImageData = processedCtx.getImageData(0, 0, processedCanvas.width, processedCanvas.height);
      const data = fullImageData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        const pr = data[i];
        const pg = data[i + 1];
        const pb = data[i + 2];
        
        // Check if pixel matches selected color (with tolerance for anti-aliased edges)
        const tolerance = 90; // sum of |dR|+|dG|+|dB|; ~30 per channel
        const diff = Math.abs(pr - r) + Math.abs(pg - g) + Math.abs(pb - b);

        if (diff > tolerance) {
          data[i + 3] = 0; // Make transparent
        }
      }
      
      processedCtx.putImageData(fullImageData, 0, 0);

      // Compute the bounding box of opaque (non-transparent) pixels so the
      // measurement labels reflect the visible artwork, not the original canvas.
      const W = processedCanvas.width;
      const H = processedCanvas.height;
      let minX = W, minY = H, maxX = -1, maxY = -1;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const a = data[(y * W + x) * 4 + 3];
          if (a > 0) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      let processedImage;
      let cropW, cropH, aspect;
      if (maxX < 0) {
        // No opaque pixels matched; fall back to full canvas to avoid divide-by-zero.
        processedImage = processedCanvas.toDataURL();
        cropW = W;
        cropH = H;
        aspect = W / Math.max(1, H);
      } else {
        cropW = maxX - minX + 1;
        cropH = maxY - minY + 1;
        aspect = cropW / cropH;
        // Crop to bounding box for display + cut file accuracy
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        const cropCtx = cropCanvas.getContext('2d');
        cropCtx.drawImage(processedCanvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
        processedImage = cropCanvas.toDataURL();
      }

      // Set logo selected color with processed image and TRUE measurements.
      // The aspect ratio is what the user-entered height should multiply by to
      // produce the displayed/cut width (so changing height re-scales correctly).
      setLogoSelectedColor({
        hex,
        processedImage,
        nativePixelWidth: cropW,
        nativePixelHeight: cropH,
        aspectRatio: aspect,
        dimensions: {
          width: 4,
          height: 4,
        },
      });
      
      setLogoMode(true);
      setSelectedPixel(null);
    } catch (error) {
      alert('Error processing selected area: ' + error.message);
    } finally {
      setIsProcessingLogo(false);
    }
  };

  const clearLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    setLogoImageData(null);
    setSelectedPixel(null);
    setLogoSelectedColor(null);
    setLogoMode(false);
  };

  // Build the description shown on the WC line item / Stripe checkout
  function buildOrderDescription() {
    const lines = [
      logoMode ? `Logo decal H=${height}"` : `Text "${text}" H=${height}"`,
      ...additionalLines.map((l) => `Line "${l.text}" H=${l.height}"`),
      hasBackground ? `Background ${backgroundColorName} H=${backgroundHeight}"` : null,
    ].filter(Boolean);
    return `Cut Vinyl: ${lines.join(' | ')}`.slice(0, 240);
  }

  // Build the array of cut-file API payloads matching `generateCutFiles`.
  // We can persist this across the Stripe redirect so files can be generated
  // server-side after payment without re-deriving from React state.
  function buildCutFilePayloads() {
    const payloads = [];
    const layerCount = 1 + (hasBackground ? 1 : 0);
    const { rows: layoutRows, bbox } = buildMultiRowLayout();
    payloads.push({
      kind: 'multi',
      rows: layoutRows,
      bbox,
      qty,
      layer: 'text',
      colorName,
      vinylShortCode: shortCodeFor(color),
      layerIndex: 1,
      layerCount,
    });
    if (hasBackground) {
      payloads.push({
        kind: 'multi',
        rows: layoutRows,
        bbox,
        qty,
        layer: 'offset',
        offsetSize: Number(backgroundHeight) || 0,
        colorName: backgroundColorName,
        vinylShortCode: shortCodeFor(backgroundColor),
        fileSuffix: 'BG',
        layerIndex: layerCount,
        layerCount,
      });
    }
    return payloads;
  }

  async function runSavedCutFilePayloads(payloads, orderId, orderNumber) {
    for (const p of payloads) {
      try {
        if (p.kind === 'multi') {
          // Strip the local 'kind' marker before sending
          const { kind, ...rest } = p;
          await api.generateCutVinylMulti({ ...rest, orderId, orderNumber });
        } else {
          // Backwards-compat for any older saved payloads
          await api.generateCutVinylFile({ ...p, orderId, orderNumber });
        }
      } catch (e) {
        console.error('Cut file generation failed for payload:', p, e);
      }
    }
  }

  const buildCutVinylOrder = async () => {
    const customerName = (prompt("Customer name for this build order:") || "").trim();
    if (!customerName) return;
    const customerPhone = (prompt("Customer phone (optional):") || "").trim();
    const customerEmail = (prompt("Customer email (optional):") || "").trim();
    const customerAddress = (prompt("Customer address (optional):") || "").trim();

    setIsProcessingPayment(true);
    try {
      const description = buildOrderDescription();
      const previewImage = await capturePreviewSnapshot();
      const checkoutRes = await fetch('/api/decal-orders/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: {
            name: customerName,
            phone: customerPhone || null,
            email: customerEmail || null,
            shippingAddress: customerAddress || null,
          },
          pricing: {
            unitPrice: Number(unitPrice),
            totalPrice: Number(totalPrice),
            qty: Number(qty),
          },
          description,
          previewImage,
        }),
      });
      const checkoutJson = await checkoutRes.json().catch(() => ({}));
      if (!checkoutRes.ok) {
        throw new Error(checkoutJson.error || `Build failed (${checkoutRes.status})`);
      }
      const { orderId, orderNumber } = checkoutJson;
      await generateCutFiles(orderId, orderNumber);
      alert(`Build complete for order ${orderNumber}. Cut files were generated and the order is in Work In Progress.`);
    } catch (error) {
      alert('Error building order: ' + (error.message || error));
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const processPayment = async () => {
    setIsProcessingPayment(true);
    try {
      const cName = (customerInfo.name || '').trim();
      if (!cName) throw new Error('Customer name is required');

      const description = buildOrderDescription();
      const customerPayload = {
        name: cName,
        email: customerInfo.email || null,
        phone: customerInfo.phone || null,
        shippingAddress: customerInfo.address || null,
      };
      const pricingPayload = {
        unitPrice: Number(unitPrice),
        totalPrice: Number(totalPrice),
        qty: Number(qty),
      };

      const previewImage = await capturePreviewSnapshot();

      // Try Stripe Checkout first (hosted page). If the backend reports Stripe
      // is not configured we fall back to the simulated checkout endpoint.
      let stripeRes;
      try {
        stripeRes = await fetch('/api/decal-orders/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer: customerPayload,
            pricing: pricingPayload,
            description,
            successPath: '/decals',
            previewImage,
          }),
        });
      } catch (e) {
        stripeRes = null;
      }

      if (stripeRes && stripeRes.ok) {
        const data = await stripeRes.json();
        if (data?.url && data?.sessionId) {
          // Persist the cut-file payloads keyed by Stripe session id so we
          // can replay them server-side after the user returns from Stripe.
          const payloads = buildCutFilePayloads();
          try {
            localStorage.setItem(
              `decalCheckout:${data.sessionId}`,
              JSON.stringify({ payloads, totalPrice: Number(totalPrice), description })
            );
          } catch {}
          // Redirect to Stripe-hosted checkout page
          window.location.href = data.url;
          return;
        }
      }

      // ---- Fallback: simulated/no-Stripe path -------------------------
      // Backend is not configured for Stripe — use the legacy /checkout
      // endpoint that creates the order without real payment.
      const checkoutRes = await fetch('/api/decal-orders/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer: customerPayload, pricing: pricingPayload, description, previewImage }),
      });
      const checkoutJson = await checkoutRes.json().catch(() => ({}));
      if (!checkoutRes.ok) {
        throw new Error(checkoutJson.error || `Checkout failed (${checkoutRes.status})`);
      }
      const { orderId, orderNumber, simulated } = checkoutJson;
      await generateCutFiles(orderId, orderNumber);
      alert(
        `Order ${orderNumber} created${simulated ? ' (simulated payment)' : ''}!\n` +
        `Cut files were saved and added to Work In Progress.`
      );
      setShowCustomerModal(false);
      setCustomerInfo({ name: '', address: '', email: '', phone: '' });
    } catch (error) {
      alert('Error processing payment: ' + (error.message || error));
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // ---- Handle return from Stripe Checkout --------------------------------
  // On mount, if the URL carries ?stripeSessionId=..., verify the payment
  // server-side, then replay the cut-file payloads we saved before redirect.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('stripeSessionId');
    const cancelled = params.get('stripeCancelled');
    if (cancelled) {
      alert('Payment was cancelled.');
      const url = new URL(window.location.href);
      url.searchParams.delete('stripeCancelled');
      window.history.replaceState({}, '', url.pathname + url.search);
      return;
    }
    if (!sessionId) return;
    let cancelledFlag = false;
    (async () => {
      try {
        const res = await fetch('/api/decal-orders/checkout-success', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        const j = await res.json().catch(() => ({}));
        if (cancelledFlag) return;
        if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
        const { orderId, orderNumber, alreadyFulfilled } = j;
        // Replay cut file payloads from localStorage
        const saved = localStorage.getItem(`decalCheckout:${sessionId}`);
        if (saved && !alreadyFulfilled) {
          try {
            const parsed = JSON.parse(saved);
            const payloads = parsed.payloads || [];
            await runSavedCutFilePayloads(payloads, orderId, orderNumber);
          } catch (e) {
            console.error('Failed to replay cut file payloads:', e);
          }
        }
        try { localStorage.removeItem(`decalCheckout:${sessionId}`); } catch {}
        alert(
          `Order ${orderNumber} created — payment received via Stripe.\n` +
          `Cut files have been saved and the order is in Work In Progress.`
        );
      } catch (e) {
        console.error(e);
        alert('Could not finalize Stripe order: ' + (e.message || e));
      } finally {
        // Clean up the URL so a refresh doesn't re-trigger this flow
        const url = new URL(window.location.href);
        url.searchParams.delete('stripeSessionId');
        window.history.replaceState({}, '', url.pathname + url.search);
      }
    })();
    return () => { cancelledFlag = true; };
  }, []);

  // Capture the preview area as a base64 PNG, cropped to the actual decal
  // content rect so the resulting image's aspect ratio matches the real
  // physical decal (not the 460×220 preview box, which would include the
  // W/H measurement bars and dark margins).
  //
  // We capture the full element, then crop to a second canvas. html2canvas's
  // x/y/width/height options behave inconsistently with absolutely-positioned
  // children, so manual cropping is more reliable.
  async function capturePreviewSnapshot() {
    if (!previewRef.current) return null;
    try {
      const h2c = await import('html2canvas').then((m) => m.default || m);
      const scale = 2;
      const fullCanvas = await h2c(previewRef.current, {
        backgroundColor: '#333333',
        scale,
        useCORS: true,
        logging: false,
      });
      // Pad the crop slightly so any sub-pixel rendering of the stroke isn't
      // cut off at the edges.
      const pad = 4;
      const sx = Math.max(0, Math.floor((contentLeft - pad) * scale));
      const sy = Math.max(0, Math.floor((contentTop - pad) * scale));
      const sw = Math.min(fullCanvas.width - sx, Math.ceil((displayedContentWidth + pad * 2) * scale));
      const sh = Math.min(fullCanvas.height - sy, Math.ceil((displayedContentHeight + pad * 2) * scale));
      if (sw <= 0 || sh <= 0) return fullCanvas.toDataURL('image/png');
      const cropped = document.createElement('canvas');
      cropped.width = sw;
      cropped.height = sh;
      const ctx = cropped.getContext('2d');
      ctx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
      return cropped.toDataURL('image/png');
    } catch (e) {
      console.warn('Preview snapshot failed:', e?.message || e);
      return null;
    }
  }

  // Build a `rows`+`bbox` payload for the /cut-vinyl-multi endpoint. Each
  // row's xIn/yIn is the top-left corner inside the envelope (origin 0,0),
  // accounting for the auto-stack layout plus the user's per-row drag offset.
  function buildMultiRowLayout() {
    const gap = Number(lineSpacing || 0);
    const placed = [];
    let cursorY = 0;
    orderedRows.forEach((r, idx) => {
      const widthIn = Number(r.widthIn || 0);
      const heightIn = Number(r.height || 0);
      const offX = (r.id === '__primary__' ? primaryOffsetIn.x : Number(r.offsetXIn || 0));
      const offY = (r.id === '__primary__' ? primaryOffsetIn.y : Number(r.offsetYIn || 0));
      // Auto-stack: each row is centered horizontally; cursorY is the row top.
      const autoX = -widthIn / 2; // relative to a shared center=0
      const autoY = cursorY;
      placed.push({
        ...r,
        widthIn,
        heightIn,
        finalX: autoX + offX,
        finalY: autoY + offY,
      });
      cursorY = autoY + heightIn + (idx < orderedRows.length - 1 ? gap : 0);
    });
    // Shift so min finalX/Y == 0 (top-left origin)
    const minX = placed.reduce((m, r) => Math.min(m, r.finalX), 0);
    const minY = placed.reduce((m, r) => Math.min(m, r.finalY), 0);
    let bboxW = 0;
    let bboxH = 0;
    const rows = placed.map((r) => {
      const xIn = r.finalX - minX;
      const yIn = r.finalY - minY;
      bboxW = Math.max(bboxW, xIn + r.widthIn);
      bboxH = Math.max(bboxH, yIn + r.heightIn);
      const base = {
        xIn: Number(xIn.toFixed(3)),
        yIn: Number(yIn.toFixed(3)),
        widthIn: Number(r.widthIn.toFixed(3)),
        heightIn: Number(r.heightIn.toFixed(3)),
      };
      if (r.type === 'logo') {
        return {
          ...base,
          type: 'logo',
          imageDataUrl: r.logoSelectedColor?.processedImage || null,
          vinylColorHex: r.color || null,
        };
      }
      return {
        ...base,
        type: 'text',
        text: r.text,
        font: r.font,
        isBold: !!r.isBold,
        isItalic: !!r.isItalic,
        charSpacing: Number(r.charSpacing || 0),
      };
    });
    return {
      rows,
      bbox: { widthIn: Number(bboxW.toFixed(3)), heightIn: Number(bboxH.toFixed(3)) },
    };
  }

  // Pull a short code from a vinyl color row (preferring an admin-set short code)
  function shortCodeFor(colorCodeValue) {
    const obj = vinylColors.find((c) => c.colorCode === colorCodeValue);
    if (obj?.colorCode && /^[a-zA-Z0-9]{1,5}$/.test(obj.colorCode)) return obj.colorCode.toUpperCase();
    if (obj?.name) return obj.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 3);
    return String(colorCodeValue || 'UNK').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 3);
  }

  const generateCutFiles = async (orderId, orderNumber) => {
    try {
      const layerCount = 1 + (hasBackground ? 1 : 0);
      const { rows: layoutRows, bbox } = buildMultiRowLayout();
      // 1) Combined text/logo cut file (one PDF for ALL rows, positioned to match preview)
      await api.generateCutVinylMulti({
        rows: layoutRows,
        bbox,
        qty,
        layer: 'text',
        colorName,
        vinylShortCode: shortCodeFor(color),
        orderId,
        orderNumber,
        layerIndex: 1,
        layerCount,
      });

      // 2) Combined stroke cut file (one PDF) when stroke outline is enabled
      if (hasBackground) {
        await api.generateCutVinylMulti({
          rows: layoutRows,
          bbox,
          qty,
          layer: 'offset',
          offsetSize: Number(backgroundHeight) || 0,
          colorName: backgroundColorName,
          vinylShortCode: shortCodeFor(backgroundColor),
          orderId,
          orderNumber,
          fileSuffix: 'BG',
          layerIndex: layerCount,
          layerCount,
        });
      }
    } catch (error) {
      console.error('Error generating cut files:', error);
    }
  };

  // Get price per sq inch from selected color's linked product
  const selectedColor = vinylColors.find(c => c.colorCode === color);
  const colorName = selectedColor?.name || color;
  const backgroundColorName = hasBackground ? (vinylColors.find(c => c.colorCode === backgroundColor)?.name || backgroundColor) : '';
  const PRICE_PER_SQ_INCH = selectedColor?.product?.price ? Number(selectedColor.product.price) : 0.50;
  const OFFSET_PER_SQ_INCH = 0.25;

  // Helper functions for increment buttons
  const increment = (setter, value, step = 1, max = 100) => setter(Math.min(max, Number((parseFloat(value) + step).toFixed(1))));
  const decrement = (setter, value, step = 1, min = 0.5) => setter(Math.max(min, Number((parseFloat(value) - step).toFixed(1))));

  // The preview box is responsive — it fills its parent up to 460px on desktop
  // but shrinks on mobile. We measure the rendered width via a ResizeObserver
  // so all internal absolute coordinates (W/H labels, content positioning,
  // drag math) stay accurate at any viewport size. Height scales proportionally.
  const PREVIEW_MAX_WIDTH = 460;
  const PREVIEW_BASE_HEIGHT = 220;
  const [measuredPreviewWidth, setMeasuredPreviewWidth] = useState(PREVIEW_MAX_WIDTH);
  useEffect(() => {
    if (!previewRef.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setMeasuredPreviewWidth(w);
      }
    });
    ro.observe(previewRef.current);
    return () => ro.disconnect();
  }, []);
  const previewWidth = Math.max(180, Math.round(measuredPreviewWidth));
  const previewHeight = Math.max(140, Math.round(previewWidth * (PREVIEW_BASE_HEIGHT / PREVIEW_MAX_WIDTH)));
  const baseFontSize = 72;

  // Buffer zone for measurement markers (stable margins so bars never touch content)
  const MARGIN_LEFT = 60;   // room for H bar + label
  const MARGIN_RIGHT = 30;
  const MARGIN_TOP = 35;    // room for W bar + label
  const MARGIN_BOTTOM = 25;

  // Measure actual text width using canvas
  const [measuredWidth, setMeasuredWidth] = useState(100);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${isBold ? 'bold ' : ''}${isItalic ? 'italic ' : ''}${baseFontSize}px ${font}`;
    const metrics = ctx.measureText(text);
    const spacingPx = (charSpacing / 100) * baseFontSize; // percent of font size
    const spacingTotal = text.length > 1 ? (text.length - 1) * spacingPx : 0;
    setMeasuredWidth(metrics.width + spacingTotal);
  }, [text, font, isBold, isItalic, charSpacing, baseFontSize]);

  const rawTextWidth = Math.max(50, measuredWidth);

  // ---- Additional-line helpers ------------------------------------------
  function addAdditionalLine(position) {
    const id = `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setAdditionalLines((prev) => [
      ...prev,
      {
        id,
        position, // 'above' | 'below'
        type: 'text',
        text: 'NEW LINE',
        font,
        isBold,
        isItalic,
        charSpacing: 0,
        height: Number(height) || 2,
        color,
        offsetXIn: 0,
        offsetYIn: 0,
      },
    ]);
  }

  function updateAdditionalLine(id, patch) {
    setAdditionalLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removeAdditionalLine(id) {
    setAdditionalLines((prev) => prev.filter((l) => l.id !== id));
  }

  // Begin a drag on a specific row. The handler stores the starting mouse
  // position and the row's current offset so the move handler can compute a
  // delta in inches.
  function beginRowDrag(e, rowId, currentOffsetIn) {
    e.stopPropagation();
    e.preventDefault();
    setDraggingRow({
      id: rowId,
      sx: e.clientX,
      sy: e.clientY,
      ox: Number(currentOffsetIn?.x || 0),
      oy: Number(currentOffsetIn?.y || 0),
    });
  }

  useEffect(() => {
    if (!draggingRow) return undefined;
    const onMove = (e) => {
      const ppi = dragScaleRef.current || 1;
      const dxIn = (e.clientX - draggingRow.sx) / ppi;
      const dyIn = (e.clientY - draggingRow.sy) / ppi;
      const nx = Number((draggingRow.ox + dxIn).toFixed(3));
      const ny = Number((draggingRow.oy + dyIn).toFixed(3));
      if (draggingRow.id === '__primary__') {
        setPrimaryOffsetIn({ x: nx, y: ny });
      } else {
        setAdditionalLines((prev) => prev.map((l) => (l.id === draggingRow.id ? { ...l, offsetXIn: nx, offsetYIn: ny } : l)));
      }
    };
    const onUp = () => setDraggingRow(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [draggingRow]);

  // ---- Per-row helpers ---------------------------------------------------
  // Measure a text row's width in inches at the given line height.
  function measureTextWidthIn(t, fontName, bold, italic, spacingPct, hIn) {
    const fontSizePx = baseFontSize; // arbitrary unit; ratio is what matters
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    ctx.font = `${bold ? 'bold ' : ''}${italic ? 'italic ' : ''}${fontSizePx}px ${fontName}`;
    const m = ctx.measureText(t || '');
    const sp = (Number(spacingPct) / 100) * fontSizePx;
    const total = (t && t.length > 1 ? (t.length - 1) * sp : 0);
    const measuredPx = m.width + total;
    return (measuredPx / fontSizePx) * Number(hIn);
  }

  // Compute width-in-inches for any row (text or logo).
  function rowWidthIn(row) {
    if (row.type === 'logo') {
      const aspect = Number(row.logoSelectedColor?.aspectRatio || 1);
      return Number((Number(row.height) * aspect).toFixed(2));
    }
    return Number(measureTextWidthIn(row.text, row.font, row.isBold, row.isItalic, row.charSpacing, row.height).toFixed(2));
  }

  // ---- Primary row + composite -----------------------------------------
  // Convert measured pixel width to real-world inches for the primary row.
  // In logo mode the visible width is the user-entered height multiplied by the
  // logo's true aspect ratio (cropped bounding box of opaque pixels).
  const textWidth = logoMode && logoSelectedColor
    ? Number((Number(height) * Number(logoSelectedColor.aspectRatio || 1)).toFixed(2))
    : Number(((measuredWidth / baseFontSize) * height).toFixed(1));

  // Build the full ordered list of rows (above-most first).
  const primaryRow = {
    id: '__primary__',
    type: logoMode ? 'logo' : 'text',
    text, font, isBold, isItalic, charSpacing,
    height, color,
    logoSelectedColor,
    widthIn: textWidth,
  };
  const aboveRows = additionalLines
    .filter((l) => l.position === 'above')
    .map((l) => ({ ...l, widthIn: rowWidthIn(l) }));
  const belowRows = additionalLines
    .filter((l) => l.position === 'below')
    .map((l) => ({ ...l, widthIn: rowWidthIn(l) }));
  const orderedRows = [...aboveRows, primaryRow, ...belowRows];

  // Composite content dims — width is max of any row; height is sum + gaps.
  const contentWidthIn = orderedRows.reduce((m, r) => Math.max(m, Number(r.widthIn) || 0), 0) || textWidth;
  const contentHeightIn =
    orderedRows.reduce((s, r) => s + Number(r.height || 0), 0) +
    Math.max(0, orderedRows.length - 1) * Number(lineSpacing || 0);

  // With the new "stroke turned into an object" model, the background piece
  // is a uniform halo around the content. Pad equals the stroke width on each
  // side. The visible envelope (used for the W/H label and PDF bbox) is
  // simply content + 2 * pad.
  const bgPadY = hasBackground ? Math.max(0, Number(backgroundHeight) || 0) : 0;
  const bgPieceHeight = hasBackground ? Number((contentHeightIn + bgPadY * 2).toFixed(2)) : 0;
  const bgWidth = hasBackground ? Number((contentWidthIn + bgPadY * 2).toFixed(2)) : 0;

  const actualWidth = hasBackground ? bgWidth : Number(contentWidthIn.toFixed(2));
  const actualHeight = hasBackground ? bgPieceHeight : Number(contentHeightIn.toFixed(2));
  
  // Usable area inside the preview, between fixed margins
  const usablePreviewWidth = previewWidth - MARGIN_LEFT - MARGIN_RIGHT;
  const usablePreviewHeight = previewHeight - MARGIN_TOP - MARGIN_BOTTOM;

  // displayScale = pixels per inch in the preview, ensuring full content (text + bg) fits
  const displayScale = Math.min(
    usablePreviewWidth / actualWidth,
    usablePreviewHeight / actualHeight
  );
  const pixelsPerInch = displayScale;

  const displayedContentWidth = actualWidth * pixelsPerInch;
  const displayedContentHeight = actualHeight * pixelsPerInch;

  // Center content within usable area (between margins)
  const contentLeft = MARGIN_LEFT + (usablePreviewWidth - displayedContentWidth) / 2;
  const contentTop = MARGIN_TOP + (usablePreviewHeight - displayedContentHeight) / 2;

  // For display purposes - show the overall dimensions
  const displayWidth = actualWidth;
  const displayHeight = actualHeight;

  // Itemized pricing: text/logo (primary) + each additional line + background
  const textArea = Number((textWidth * height).toFixed(2));
  const textCost = Number((textArea * PRICE_PER_SQ_INCH).toFixed(2));

  // Per-line cost helper: uses each line's own color's product price-per-sq-in
  function lineCost(line) {
    const colorObj = vinylColors.find((c) => c.colorCode === line.color);
    const ppsi = colorObj?.product?.price ? Number(colorObj.product.price) : 0.5;
    const a = Number(line.widthIn || 0) * Number(line.height || 0);
    return { area: Number(a.toFixed(2)), ppsi, cost: Number((a * ppsi).toFixed(2)) };
  }

  const additionalLineCosts = orderedRows
    .filter((r) => r.id !== '__primary__')
    .map((r) => ({ row: r, ...lineCost(r) }));
  const additionalLinesCost = Number(
    additionalLineCosts.reduce((s, l) => s + l.cost, 0).toFixed(2)
  );

  const bgColorObj = hasBackground ? vinylColors.find(c => c.colorCode === backgroundColor) : null;
  const BG_PRICE_PER_SQ_INCH = bgColorObj?.product?.price ? Number(bgColorObj.product.price) : OFFSET_PER_SQ_INCH;
  // Stroke-outline area approximation: sum of (perimeter * strokeWidth) per row.
  // This isn't a tight bound but is far closer than a wrapping rectangle and
  // matches the new "stroke turned into an object" model.
  const strokeWidthIn = hasBackground ? Math.max(0, Number(backgroundHeight) || 0) : 0;
  const bgArea = hasBackground ? Number(
    orderedRows.reduce((acc, r) => {
      const perim = 2 * (Number(r.widthIn || 0) + Number(r.height || 0));
      return acc + perim * strokeWidthIn;
    }, 0).toFixed(2)
  ) : 0;
  const backgroundCost = hasBackground ? Number((bgArea * BG_PRICE_PER_SQ_INCH).toFixed(2)) : 0;

  // Tape covers the largest applied piece (bg if present, else combined content)
  const allLinesArea = Number(
    (textArea + additionalLineCosts.reduce((s, l) => s + l.area, 0)).toFixed(2)
  );
  const totalAreaForTape = hasBackground ? bgArea : allLinesArea;
  const transferTapeCost = Number(((totalAreaForTape / 144) * transferTapePerSqFt).toFixed(2));

  // Kept for legacy quote payload compatibility
  const area = totalAreaForTape;

  const unitPrice = (textCost + additionalLinesCost + backgroundCost + transferTapeCost).toFixed(2);
  const itemsSubtotal = Number((Number(unitPrice) * qty).toFixed(2));
  const minOrderApplied = itemsSubtotal < Number(storefrontPricing.minOrderPrice || 0);
  const minBumpedSubtotal = Math.max(itemsSubtotal, Number(storefrontPricing.minOrderPrice || 0));
  const shippingFee = Number(storefrontPricing.shippingFlatFee || 0);
  const totalPrice = (minBumpedSubtotal + shippingFee).toFixed(2);

  return (
    <div style={{ padding: '16px', width: '100%', maxWidth: '520px', boxSizing: 'border-box', background: '#fff', borderRadius: '10px', color: '#000' }}>
      <h2 style={{ textAlign: 'center' }}>Cut Vinyl</h2>

      {/* Logo Upload Section */}
      <div style={{ marginBottom: '20px', padding: '15px', border: '2px dashed #ccc', borderRadius: '8px', textAlign: 'center' }}>
        {logoMode ? (
          <div>
            <div style={{ marginBottom: '10px' }}>
              <strong>Logo Mode Active</strong> - Click on areas to select parts to keep
            </div>
            <button
              onClick={clearLogo}
              style={{ padding: '8px 16px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Clear Logo
            </button>
          </div>
        ) : logoPreview ? (
          <div>
            <div style={{ marginBottom: '10px' }}>
              <strong>Click on the logo to select which part to keep</strong>
            </div>
            <div style={{ position: 'relative', display: 'inline-block', cursor: 'crosshair' }}>
              <img 
                src={logoPreview} 
                alt="Logo for selection" 
                style={{ maxWidth: '100%', maxHeight: '200px', border: '1px solid #ccc' }}
                onClick={handleLogoClick}
              />
              {selectedPixel && (
                <div style={{
                  position: 'absolute',
                  left: `${selectedPixel.x}px`,
                  top: `${selectedPixel.y}px`,
                  width: '10px',
                  height: '10px',
                  border: '2px solid #ff0000',
                  borderRadius: '50%',
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none'
                }} />
              )}
            </div>
            <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {selectedPixel && selectedPixel.hex && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: '#f8f9fa', border: '1px solid #ddd', borderRadius: '4px' }}>
                  <span style={{ fontSize: '12px', color: '#666' }}>Selected:</span>
                  <div style={{ width: '24px', height: '24px', background: selectedPixel.hex, border: '1px solid #999', borderRadius: '3px' }} />
                  <span style={{ fontSize: '12px', fontFamily: 'monospace' }}>{selectedPixel.hex.toUpperCase()}</span>
                </div>
              )}
              <button
                onClick={processSelectedArea}
                disabled={!selectedPixel}
                style={{
                  padding: '8px 16px',
                  background: selectedPixel ? '#28a745' : '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: selectedPixel ? 'pointer' : 'not-allowed'
                }}
              >
                Apply
              </button>
              <button
                onClick={clearLogo}
                style={{ padding: '8px 16px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor="logo-upload" style={{ cursor: 'pointer', display: 'block', marginBottom: '10px' }}>
              <div style={{ padding: '20px', background: '#f8f9fa', borderRadius: '4px' }}>
                {isProcessingLogo ? (
                  <div>Processing logo...</div>
                ) : (
                  <div>
                    <div style={{ fontSize: '24px', marginBottom: '10px' }}>📁</div>
                    <div>Click to upload logo image</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>PNG, JPG, GIF supported</div>
                  </div>
                )}
              </div>
            </label>
            <input
              id="logo-upload"
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              style={{ display: 'none' }}
              disabled={isProcessingLogo}
            />
          </div>
        )}
      </div>

      {/* Visual Preview Box (responsive: fills parent up to PREVIEW_MAX_WIDTH) */}
      <div ref={previewRef} style={{
        height: `${previewHeight}px`, background: '#333', display: 'flex',
        alignItems: 'center', justifyContent: 'center', position: 'relative',
        borderRadius: '5px', overflow: 'hidden',
        width: '100%', maxWidth: `${PREVIEW_MAX_WIDTH}px`, boxSizing: 'border-box',
        margin: '0 auto 20px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
      }}>
        {/* === Width measurement (always above content with stable buffer) === */}
        {(() => {
          const wBarY = contentTop - 18;            // 18px above the content
          const wLabelY = wBarY - 16;
          const wLeft = contentLeft;
          const wRight = contentLeft + displayedContentWidth;
          return (
            <>
              <div style={{ position: 'absolute', left: `${wLeft}px`, width: `${displayedContentWidth}px`, top: `${wBarY}px`, height: '1px', background: 'rgba(255,255,255,0.85)' }} />
              <div style={{ position: 'absolute', left: `${wLeft}px`, top: `${wBarY - 5}px`, width: '1px', height: '11px', background: 'rgba(255,255,255,0.85)' }} />
              <div style={{ position: 'absolute', left: `${wRight}px`, top: `${wBarY - 5}px`, width: '1px', height: '11px', background: 'rgba(255,255,255,0.85)' }} />
              <div style={{ position: 'absolute', top: `${wLabelY}px`, left: `${wLeft + displayedContentWidth / 2}px`, transform: 'translateX(-50%)', color: 'white', fontSize: '11px', background: 'rgba(0,0,0,0.7)', padding: '1px 5px', borderRadius: '3px', whiteSpace: 'nowrap' }}>
                W {displayWidth}"
              </div>
            </>
          );
        })()}

        {/* === Height measurement (always left of content with stable buffer) === */}
        {(() => {
          const hBarX = contentLeft - 22;
          const hLabelX = hBarX - 6;
          const hTop = contentTop;
          const hBottom = contentTop + displayedContentHeight;
          return (
            <>
              <div style={{ position: 'absolute', left: `${hBarX}px`, top: `${hTop}px`, height: `${displayedContentHeight}px`, width: '1px', background: 'rgba(255,255,255,0.85)' }} />
              <div style={{ position: 'absolute', left: `${hBarX - 5}px`, top: `${hTop}px`, width: '11px', height: '1px', background: 'rgba(255,255,255,0.85)' }} />
              <div style={{ position: 'absolute', left: `${hBarX - 5}px`, top: `${hBottom}px`, width: '11px', height: '1px', background: 'rgba(255,255,255,0.85)' }} />
              <div style={{ position: 'absolute', left: `${hLabelX}px`, top: `${hTop + displayedContentHeight / 2}px`, transform: 'translate(-100%, -50%)', color: 'white', fontSize: '11px', background: 'rgba(0,0,0,0.7)', padding: '1px 5px', borderRadius: '3px', whiteSpace: 'nowrap' }}>
                H {displayHeight}"
              </div>
            </>
          );
        })()}

        {/* === Multi-row stacked content === */}
        {(() => {
          // Keep latest ppi for drag math
          dragScaleRef.current = pixelsPerInch;

          const centerX = contentLeft + displayedContentWidth / 2;
          const stackTop = contentTop + (hasBackground ? bgPadY * displayScale : 0);
          const gapPx = Number(lineSpacing || 0) * displayScale;
          // Stroke width in display pixels (full visible thickness desired by user)
          const strokePx = hasBackground ? Math.max(0, Number(backgroundHeight) || 0) * displayScale : 0;

          // Compute each row's y-position (top edge) in display pixels
          let cursorY = stackTop;
          const rowLayout = orderedRows.map((r, idx) => {
            const rowHpx = Number(r.height || 0) * displayScale;
            const rowWpx = Number(r.widthIn || 0) * displayScale;
            const top = cursorY;
            cursorY = top + rowHpx + (idx < orderedRows.length - 1 ? gapPx : 0);
            const offX = (r.id === '__primary__' ? primaryOffsetIn.x : Number(r.offsetXIn || 0)) * displayScale;
            const offY = (r.id === '__primary__' ? primaryOffsetIn.y : Number(r.offsetYIn || 0)) * displayScale;
            return { ...r, top, rowHpx, rowWpx, offX, offY };
          });

          // 8-directional drop-shadow filter to fake a uniform stroke around
          // an arbitrary RGBA logo. Each shadow has 0 blur so edges are crisp.
          const logoStrokeFilter = (col, sPx) => {
            if (!sPx) return 'none';
            const dirs = [
              [sPx, 0], [-sPx, 0], [0, sPx], [0, -sPx],
              [sPx, sPx], [-sPx, sPx], [sPx, -sPx], [-sPx, -sPx],
            ];
            return dirs.map(([dx, dy]) => `drop-shadow(${dx}px ${dy}px 0 ${col})`).join(' ');
          };

          return (
            <>
              {hasBackground && strokePx > 0 && (
                // Single solid backing rectangle that wraps the entire content
                // stack. This matches real cut-vinyl backing: one closed
                // rectangle, no cut-outs around individual glyphs/logo edges.
                <div style={{
                  position: 'absolute',
                  left: `${contentLeft}px`,
                  top: `${contentTop}px`,
                  width: `${displayedContentWidth}px`,
                  height: `${displayedContentHeight}px`,
                  backgroundColor: backgroundColor,
                  zIndex: 0,
                  pointerEvents: 'none',
                }} />
              )}
              {rowLayout.map((r) => {
                const rowCenterY = r.top + r.rowHpx / 2 + r.offY;
                const rowCenterX = centerX + r.offX;
                const isDragTarget = draggingRow?.id === r.id;
                if (r.type === 'logo') {
                  if (!r.logoSelectedColor) return null;
                  // The vinyl color the user picked is on the row itself (`r.color`).
                  const vinylColor = r.color || '#ffffff';
                  return (
                    <div
                      key={r.id}
                      onMouseDown={(e) => beginRowDrag(e, r.id, { x: r.id === '__primary__' ? primaryOffsetIn.x : Number(r.offsetXIn || 0), y: r.id === '__primary__' ? primaryOffsetIn.y : Number(r.offsetYIn || 0) })}
                      style={{
                        position: 'absolute',
                        left: `${rowCenterX}px`,
                        top: `${rowCenterY}px`,
                        width: `${r.rowWpx}px`,
                        height: `${r.rowHpx}px`,
                        transform: 'translate(-50%, -50%)',
                        zIndex: 2,
                        cursor: isDragTarget ? 'grabbing' : 'grab',
                        userSelect: 'none',
                      }}
                    >
                      {/* Logo recolored to chosen vinyl color via CSS mask */}
                      <div style={{
                        position: 'absolute', inset: 0,
                        WebkitMaskImage: `url(${r.logoSelectedColor.processedImage})`,
                        maskImage: `url(${r.logoSelectedColor.processedImage})`,
                        WebkitMaskSize: '100% 100%', maskSize: '100% 100%',
                        WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                        backgroundColor: vinylColor,
                      }} />
                    </div>
                  );
                }

                const fontSizePx = r.rowHpx;
                const letterSpacingPx = (Number(r.charSpacing || 0) / 100) * fontSizePx;
                const baseTextStyle = {
                  position: 'absolute',
                  left: `${rowCenterX}px`,
                  top: `${rowCenterY}px`,
                  fontSize: `${fontSizePx}px`,
                  fontWeight: r.isBold ? 'bold' : 'normal',
                  fontStyle: r.isItalic ? 'italic' : 'normal',
                  fontFamily: r.font,
                  letterSpacing: `${letterSpacingPx}px`,
                  whiteSpace: 'nowrap',
                  transform: 'translate(-50%, -50%)',
                  transformOrigin: 'center center',
                  userSelect: 'none',
                };
                return (
                  <React.Fragment key={r.id}>
                    <div
                      onMouseDown={(e) => beginRowDrag(e, r.id, { x: r.id === '__primary__' ? primaryOffsetIn.x : Number(r.offsetXIn || 0), y: r.id === '__primary__' ? primaryOffsetIn.y : Number(r.offsetYIn || 0) })}
                      style={{ ...baseTextStyle, color: r.color, zIndex: 2, cursor: isDragTarget ? 'grabbing' : 'grab' }}
                    >
                      {r.text}
                    </div>
                  </React.Fragment>
                );
              })}
            </>
          );
        })()}
      </div>

      {/* Controls */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label>Text:</label>
          <input type="text" value={text} onChange={(e) => setText(e.target.value)} style={inputStyle} />
        </div>

        <div>
          <label>Height (inches):</label>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button type="button" onClick={() => decrement(setHeight, height, 0.5, 0.5)} style={btnStyle}>-</button>
            <input type="number" value={height} min="0.5" max="11" step="0.5" onChange={(e) => setHeight(Math.min(11, Math.max(0.5, parseFloat(e.target.value) || 0.5)))} style={{...inputStyle, textAlign: 'center', flex: 1}} />
            <button type="button" onClick={() => increment(setHeight, height, 0.5, 11)} style={btnStyle}>+</button>
          </div>
        </div>

        <div>
          <label>Quantity:</label>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} style={btnStyle}>-</button>
            <input type="number" value={qty} min="1" step="1" onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))} style={{...inputStyle, textAlign: 'center', flex: 1}} />
            <button type="button" onClick={() => setQty(qty + 1)} style={btnStyle}>+</button>
          </div>
        </div>

        <div>
          <label>Color:</label>
          <select value={color} onChange={(e) => setColor(e.target.value)} style={inputStyle} disabled={colorsLoading}>
            {colorsLoading ? (
              <option>Loading...</option>
            ) : vinylColors.length > 0 ? (
              vinylColors.filter(c => c.isActive).map((c) => (
                <option key={c.id} value={c.colorCode}>{c.name}</option>
              ))
            ) : (
              <>
                <option value="white">White</option>
                <option value="red">Red</option>
                <option value="#00ff00">Neon Green</option>
                <option value="black">Black</option>
                <option value="blue">Blue</option>
                <option value="yellow">Yellow</option>
                <option value="#ff7f00">Orange</option>
              </>
            )}
          </select>
        </div>

        <div>
          <label>Font:</label>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button type="button" onClick={() => {
              const idx = FONT_LIST.indexOf(font);
              if (idx > 0) setFont(FONT_LIST[idx - 1]);
            }} style={btnStyle}>&#9664;</button>
            <select value={font} onChange={(e) => setFont(e.target.value)} style={{...inputStyle, flex: 1, margin: 0}}>
              {FONT_LIST.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <button type="button" onClick={() => {
              const idx = FONT_LIST.indexOf(font);
              if (idx < FONT_LIST.length - 1) setFont(FONT_LIST[idx + 1]);
            }} style={btnStyle}>&#9654;</button>
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="checkbox" checked={isBold} onChange={(e) => setIsBold(e.target.checked)} />
          Bold
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="checkbox" checked={isItalic} onChange={(e) => setIsItalic(e.target.checked)} />
          Italic
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="checkbox" checked={hasBackground} onChange={(e) => setHasBackground(e.target.checked)} />
          Add Background
        </label>
      </div>

      {hasBackground && (
        <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(0,0,0,0.05)', borderRadius: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label>Background Color:</label>
            <select value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} style={inputStyle} disabled={colorsLoading}>
              {colorsLoading ? (
                <option>Loading...</option>
              ) : vinylColors.length > 0 ? (
                vinylColors.filter((c) => c.isActive).map((c) => (
                  <option key={c.id} value={c.colorCode}>{c.name}</option>
                ))
              ) : (
                <>
                  <option value="black">Black</option>
                  <option value="white">White</option>
                  <option value="red">Red</option>
                  <option value="blue">Blue</option>
                </>
              )}
            </select>
          </div>
          <div>
            <label>Background (inches):</label>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              {/* The input controls TOTAL background width = content + 2 * per-side padding.
                  Internal state (backgroundHeight) stays as per-side padding so all
                  geometry/PDF code keeps working without changes. */}
              <button
                type="button"
                onClick={() => setBackgroundHeight((p) => Math.max(0.05, Number(((Number(p) || 0) - 0.05).toFixed(3))))}
                style={btnStyle}
              >-</button>
              <input
                type="number"
                value={Number((Number(contentWidthIn || 0) + 2 * (Number(backgroundHeight) || 0)).toFixed(2))}
                min={Number((Number(contentWidthIn || 0) + 0.1).toFixed(2))}
                step="0.1"
                onChange={(e) => {
                  const total = parseFloat(e.target.value);
                  if (!Number.isFinite(total)) return;
                  const perSide = (total - Number(contentWidthIn || 0)) / 2;
                  setBackgroundHeight(Math.max(0.05, Number(perSide.toFixed(3))));
                }}
                style={{...inputStyle, textAlign: 'center', flex: 1}}
              />
              <button
                type="button"
                onClick={() => setBackgroundHeight((p) => Math.min(8, Number(((Number(p) || 0) + 0.05).toFixed(3))))}
                style={btnStyle}
              >+</button>
            </div>
            <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
              Padding: {Number(backgroundHeight).toFixed(2)}" each side
            </div>
          </div>
        </div>
      )}

      {/* Additional Lines (stack text rows above/below the primary) */}
      <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(0,123,255,0.06)', borderRadius: '8px', border: '1px solid rgba(0,123,255,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
          <strong>Additional Lines ({additionalLines.length})</strong>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="button" onClick={() => addAdditionalLine('above')} style={{ padding: '6px 10px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>+ Add Above</button>
            <button type="button" onClick={() => addAdditionalLine('below')} style={{ padding: '6px 10px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>+ Add Below</button>
          </div>
        </div>

        {/* Line spacing */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <label style={{ fontSize: '12px', minWidth: '110px' }}>Line Spacing (in):</label>
          <button type="button" onClick={() => setLineSpacing(Math.max(0, Number((Number(lineSpacing) - 0.125).toFixed(3))))} style={btnStyle}>-</button>
          <input
            type="number"
            value={lineSpacing}
            min="0"
            step="0.125"
            onChange={(e) => setLineSpacing(Math.max(0, parseFloat(e.target.value) || 0))}
            style={{ ...inputStyle, textAlign: 'center', width: '90px', margin: 0 }}
          />
          <button type="button" onClick={() => setLineSpacing(Number((Number(lineSpacing) + 0.125).toFixed(3)))} style={btnStyle}>+</button>
        </div>

        {additionalLines.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#666' }}>No additional lines. Use "Add Above" or "Add Below" to stack more text on the decal.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {additionalLines.map((l) => (
              <div key={l.id} style={{ padding: '8px', background: '#fff', borderRadius: '6px', border: '1px solid #ddd' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
                  <select
                    value={l.position}
                    onChange={(e) => updateAdditionalLine(l.id, { position: e.target.value })}
                    style={{ ...inputStyle, margin: 0, width: 'auto' }}
                  >
                    <option value="above">Above primary</option>
                    <option value="below">Below primary</option>
                  </select>
                  <span style={{ fontSize: '11px', color: '#666' }}>Text line</span>
                  <button
                    type="button"
                    onClick={() => removeAdditionalLine(l.id)}
                    style={{ marginLeft: 'auto', padding: '4px 8px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                  >
                    Remove
                  </button>
                </div>
                <input
                  type="text"
                  value={l.text}
                  onChange={(e) => updateAdditionalLine(l.id, { text: e.target.value })}
                  placeholder="Line text"
                  style={{ ...inputStyle, marginBottom: '6px' }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <div>
                    <label style={{ fontSize: '11px' }}>Height (in):</label>
                    <input
                      type="number"
                      value={l.height}
                      min="0.25"
                      step="0.25"
                      onChange={(e) => updateAdditionalLine(l.id, { height: Math.max(0.25, parseFloat(e.target.value) || 0.25) })}
                      style={{ ...inputStyle, marginTop: '2px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px' }}>Color:</label>
                    <select
                      value={l.color}
                      onChange={(e) => updateAdditionalLine(l.id, { color: e.target.value })}
                      style={{ ...inputStyle, marginTop: '2px' }}
                    >
                      {vinylColors.length > 0 ? (
                        vinylColors.filter((c) => c.isActive).map((c) => (
                          <option key={c.id} value={c.colorCode}>{c.name}</option>
                        ))
                      ) : (
                        <>
                          <option value="white">White</option>
                          <option value="red">Red</option>
                          <option value="black">Black</option>
                        </>
                      )}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px' }}>Font:</label>
                    <select
                      value={l.font}
                      onChange={(e) => updateAdditionalLine(l.id, { font: e.target.value })}
                      style={{ ...inputStyle, marginTop: '2px' }}
                    >
                      {FONT_LIST.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                      <input
                        type="checkbox"
                        checked={!!l.isBold}
                        onChange={(e) => updateAdditionalLine(l.id, { isBold: e.target.checked })}
                      />
                      Bold
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                      <input
                        type="checkbox"
                        checked={!!l.isItalic}
                        onChange={(e) => updateAdditionalLine(l.id, { isItalic: e.target.checked })}
                      />
                      Italic
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quote Summary */}
      <div style={{ background: '#f0f7ff', padding: '15px', borderRadius: '5px', borderLeft: '4px solid #007bff', marginTop: '15px', fontSize: '13px' }}>
        <div style={{ marginBottom: '8px', fontWeight: 'bold', fontSize: '15px' }}>Quote Summary</div>

        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontWeight: 'bold' }}>{logoMode ? 'Logo (primary)' : 'Text (primary)'}</div>
          <div>Color: {colorName}</div>
          <div>Dimensions: {textWidth}" × {height}"</div>
          <div>Area: {textArea} sq in</div>
          <div>Subtotal: ${textCost.toFixed(2)}</div>
        </div>

        {additionalLineCosts.map((l, idx) => {
          const colorObj = vinylColors.find((c) => c.colorCode === l.row.color);
          const cn = colorObj?.name || l.row.color;
          return (
            <div key={l.row.id} style={{ marginBottom: '8px' }}>
              <div style={{ fontWeight: 'bold' }}>Line {idx + 1} ({l.row.position}): "{l.row.text}"</div>
              <div>Color: {cn}</div>
              <div>Dimensions: {Number(l.row.widthIn).toFixed(2)}" × {Number(l.row.height).toFixed(2)}"</div>
              <div>Area: {l.area} sq in</div>
              <div>Subtotal: ${l.cost.toFixed(2)}</div>
            </div>
          );
        })}

        {additionalLines.length > 0 && (
          <div style={{ marginBottom: '8px', fontSize: '12px', color: '#666' }}>Line Spacing: {Number(lineSpacing).toFixed(3)}"</div>
        )}

        {hasBackground && (
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontWeight: 'bold' }}>Background</div>
            <div>Color: {backgroundColorName}</div>
            <div>Background Width: {(Number(contentWidthIn || 0) + 2 * Number(backgroundHeight || 0)).toFixed(2)}" (padding {Number(backgroundHeight).toFixed(2)}"/side)</div>
            <div>Area: {bgArea} sq in</div>
            <div>Subtotal: ${backgroundCost.toFixed(2)}</div>
          </div>
        )}

        <div style={{ marginBottom: '8px' }}>
          Transfer Tape: ${transferTapeCost.toFixed(2)}{' '}
          <span style={{ color: '#666', fontSize: '11px' }}>
            (${Number(transferTapePerSqFt).toFixed(3)}/sq ft × {(totalAreaForTape / 144).toFixed(3)} sq ft)
          </span>
        </div>
        <div>Quantity: {qty}</div>
        <div>Unit Price: ${unitPrice}</div>
        <div>Subtotal: ${itemsSubtotal.toFixed(2)}</div>
        {minOrderApplied && (
          <div style={{ color: '#b06000' }}>
            Order Minimum (${Number(storefrontPricing.minOrderPrice).toFixed(2)}): +${(minBumpedSubtotal - itemsSubtotal).toFixed(2)}
          </div>
        )}
        {shippingFee > 0 && (
          <div>Shipping: ${shippingFee.toFixed(2)}</div>
        )}
        <div style={{ marginTop: '6px', fontSize: '16px', fontWeight: 'bold' }}>Total: ${totalPrice}</div>
      </div>

      {/* Generate Cut Files */}
      <div style={{ marginTop: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {cvToggles.textFile !== false && (
        <button
          onClick={async () => {
            try {
              const { rows: layoutRows, bbox } = buildMultiRowLayout();
              await api.generateCutVinylMulti({
                rows: layoutRows,
                bbox,
                qty,
                layer: 'text',
                colorName,
                vinylShortCode: shortCodeFor(color),
              });
            } catch (e) { alert('Error generating text file: ' + e.message); }
          }}
          style={{ padding: '10px 18px', background: '#28a745', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
        >
          TEXT FILE{additionalLines.length > 0 ? ` (${1 + additionalLines.length} rows)` : ''}
        </button>
        )}
        {hasBackground && cvToggles.strokeFile !== false && (
          <button
            onClick={async () => {
              try {
                const { rows: layoutRows, bbox } = buildMultiRowLayout();
                await api.generateCutVinylMulti({
                  rows: layoutRows,
                  bbox,
                  qty,
                  layer: 'offset',
                  offsetSize: Number(backgroundHeight) || 0,
                  colorName: backgroundColorName,
                  vinylShortCode: shortCodeFor(backgroundColor),
                  fileSuffix: 'BG',
                });
              } catch (e) { alert('Error generating background file: ' + e.message); }
            }}
            style={{ padding: '10px 18px', background: '#28a745', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
          >
            BACKGROUND FILE
          </button>
        )}
        {cvToggles.build !== false && (
        <button
          onClick={buildCutVinylOrder}
          disabled={isProcessingPayment}
          style={{
            padding: '10px 18px',
            background: isProcessingPayment ? '#6c757d' : '#fd7e14',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: isProcessingPayment ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          {isProcessingPayment ? 'Building...' : 'Build for Cut Vinyl'}
        </button>
        )}
        {cvToggles.payNow !== false && (
        <button
          onClick={() => setShowCustomerModal(true)}
          style={{ padding: '10px 18px', background: '#007bff', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
        >
          Pay Now
        </button>
        )}
      </div>

      {/* Print Quote */}
      {cvToggles.printQuote !== false && (
      <div style={{ marginTop: '10px' }}>
        <button
          onClick={async () => {
            try {
              // Use the cropped capture so the embedded image matches the
              // actual decal's aspect ratio rather than the 460×220 preview box.
              const previewImage = await capturePreviewSnapshot();
              await api.generateQuote({
                type: 'cut-vinyl',
                text, height, font, isBold, isItalic, charSpacing,
                colorName, hasOffset: hasBackground, offsetColorName: backgroundColorName, offsetSize: backgroundHeight,
                estimatedWidth: textWidth, area, unitPrice, totalPrice, qty,
                transferTapeCost, offsetCost: backgroundCost,
                previewImage,
              });
            } catch (e) { alert('Error generating quote: ' + e.message); }
          }}
          style={{ padding: '10px 18px', background: '#6f42c1', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
        >
          Print Quote
        </button>
      </div>
      )}

      {/* Customer Information Modal */}
      {showCustomerModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '8px',
            maxWidth: '400px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Customer Information</h3>
            <p style={{ marginBottom: '20px', color: '#666' }}>Please enter your contact information:</p>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Name *</label>
              <input
                type="text"
                value={customerInfo.name}
                onChange={(e) => setCustomerInfo({...customerInfo, name: e.target.value})}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                placeholder="John Doe"
                required
              />
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Address *</label>
              <textarea
                value={customerInfo.address}
                onChange={(e) => setCustomerInfo({...customerInfo, address: e.target.value})}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', minHeight: '60px' }}
                placeholder="123 Main St, City, State 12345"
                required
              />
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Email *</label>
              <input
                type="email"
                value={customerInfo.email}
                onChange={(e) => setCustomerInfo({...customerInfo, email: e.target.value})}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                placeholder="john@example.com"
                required
              />
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Phone</label>
              <input
                type="tel"
                value={customerInfo.phone}
                onChange={(e) => setCustomerInfo({...customerInfo, phone: e.target.value})}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                placeholder="(555) 123-4567"
              />
            </div>
            
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCustomerModal(false)}
                disabled={isProcessingPayment}
                style={{
                  padding: '8px 16px',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isProcessingPayment ? 'not-allowed' : 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={processPayment}
                disabled={isProcessingPayment || !customerInfo.name || !customerInfo.address || !customerInfo.email}
                style={{
                  padding: '8px 16px',
                  background: (isProcessingPayment || !customerInfo.name || !customerInfo.address || !customerInfo.email) ? '#6c757d' : '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: (isProcessingPayment || !customerInfo.name || !customerInfo.address || !customerInfo.email) ? 'not-allowed' : 'pointer'
                }}
              >
                {isProcessingPayment ? 'Processing...' : 'Pay Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const inputStyle = { width: '100%', padding: '8px', margin: '10px 0', borderRadius: '4px', border: '1px solid #ccc' };
const btnStyle = { padding: '8px 12px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', minWidth: '36px' };

export default DecalConfigurator;
