import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';

const DecalConfigurator = () => {
  const [text, setText] = useState('YOUR TEXT');
  const [height, setHeight] = useState(2);
  const [qty, setQty] = useState(1);
  const [color, setColor] = useState('white');
  const [hasOffset, setHasOffset] = useState(false);
  const [offsetColor, setOffsetColor] = useState('black');
  const [offsetSize, setOffsetSize] = useState(0.5);
  const [font, setFont] = useState('Impact');
  const [isBold, setIsBold] = useState(true);
  const [isItalic, setIsItalic] = useState(false);
  const [charSpacing, setCharSpacing] = useState(0);
  const previewRef = useRef(null);

  // Vinyl colors from database
  const [vinylColors, setVinylColors] = useState([]);
  const [colorsLoading, setColorsLoading] = useState(true);

  useEffect(() => {
    async function loadColors() {
      try {
        const colors = await api.vinylColors();
        setVinylColors(colors);
        if (colors.length > 0 && !colors.find(c => c.colorCode === color)) {
          setColor(colors[0].colorCode);
        }
      } catch (e) {
        console.log('Failed to load vinyl colors, using defaults');
      } finally {
        setColorsLoading(false);
      }
    }
    loadColors();
  }, []);

  // Get price per sq inch from selected color's linked product
  const selectedColor = vinylColors.find(c => c.colorCode === color);
  const colorName = selectedColor?.name || color;
  const offsetColorName = hasOffset ? (vinylColors.find(c => c.colorCode === offsetColor)?.name || offsetColor) : '';
  const PRICE_PER_SQ_INCH = selectedColor?.product?.price ? Number(selectedColor.product.price) : 0.50;
  const OFFSET_PER_SQ_INCH = 0.25;

  // Helper functions for increment buttons
  const increment = (setter, value, step = 1, max = 100) => setter(Math.min(max, Number((parseFloat(value) + step).toFixed(1))));
  const decrement = (setter, value, step = 1, min = 0.5) => setter(Math.max(min, Number((parseFloat(value) - step).toFixed(1))));

  const previewWidth = 460;
  const previewHeight = 150;
  const baseFontSize = 72;

  // Buffer zone for measurement markers
  const BUFFER_X = 35;
  const BUFFER_Y = 25;
  const availableWidth = previewWidth - (BUFFER_X * 2);
  const availableHeight = previewHeight - (BUFFER_Y * 2);

  // Measure actual text width using canvas
  const [measuredWidth, setMeasuredWidth] = useState(100);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${isBold ? 'bold ' : ''}${isItalic ? 'italic ' : ''}${baseFontSize}px ${font}`;
    const metrics = ctx.measureText(text);
    const spacingTotal = text.length > 1 ? (text.length - 1) * charSpacing : 0;
    setMeasuredWidth(metrics.width + spacingTotal);
  }, [text, font, isBold, isItalic, charSpacing, baseFontSize]);

  const rawTextWidth = Math.max(50, measuredWidth);

  // Scale to fit within buffer zone
  const scale = Math.min(
    1,
    availableWidth / rawTextWidth,
    availableHeight / baseFontSize
  );

  const displayFontSize = baseFontSize * scale;
  const offsetStroke = Math.max(1, Math.round(offsetSize * 4));
  const displayedTextWidth = rawTextWidth * scale;
  const textOffsetLeft = (previewWidth - displayedTextWidth) / 2;
  const displayedTextHeight = displayFontSize;
  const textOffsetTop = (previewHeight - displayedTextHeight) / 2;

  // Convert measured pixel width to real-world inches
  const estimatedWidth = Number(((measuredWidth / baseFontSize) * height).toFixed(1));
  const area = Number((estimatedWidth * height).toFixed(1));
  const offsetCost = hasOffset ? Number((area * OFFSET_PER_SQ_INCH).toFixed(2)) : 0;
  const TRANSFER_TAPE_PER_SQ_FT = 0.05;
  const transferTapeCost = Number(((area / 144) * TRANSFER_TAPE_PER_SQ_FT).toFixed(2));
  const unitPrice = (area * PRICE_PER_SQ_INCH + offsetCost + transferTapeCost).toFixed(2);
  const totalPrice = (Number(unitPrice) * qty).toFixed(2);

  return (
    <div style={{ padding: '20px', maxWidth: '520px', background: '#fff', borderRadius: '10px', color: '#000' }}>
      <h2 style={{ textAlign: 'center' }}>Cut Vinyl</h2>

      {/* Visual Preview Box */}
      <div ref={previewRef} style={{
        height: `${previewHeight}px`, background: '#333', display: 'flex',
        alignItems: 'center', justifyContent: 'center', position: 'relative',
        marginBottom: '20px', borderRadius: '5px', overflow: 'hidden', width: '100%', maxWidth: `${previewWidth}px`, margin: '0 auto 20px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
      }}>
        {/* Measurement guides */}
        <div style={{ position: 'absolute', left: '20px', right: '20px', top: '20px', height: '1px', background: 'rgba(255,255,255,0.75)' }} />
        <div style={{ position: 'absolute', left: '20px', top: `${textOffsetTop}px`, height: `${displayedTextHeight}px`, width: '1px', background: 'rgba(255,255,255,0.75)' }} />
        <div style={{ position: 'absolute', top: '10px', left: `${textOffsetLeft + displayedTextWidth / 2}px`, transform: 'translateX(-50%)', color: 'white', fontSize: '12px', background: 'rgba(0,0,0,0.65)', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
          W {estimatedWidth}"
        </div>
        <div style={{ position: 'absolute', left: '4px', top: `${textOffsetTop + displayedTextHeight / 2}px`, transform: 'translateY(-50%)', color: 'white', fontSize: '12px', background: 'rgba(0,0,0,0.65)', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
          H {height}"
        </div>

        {hasOffset && (
          <div style={{
            position: 'absolute', left: '50%', top: '50%', color: offsetColor,
            fontSize: `${displayFontSize}px`,
            fontWeight: isBold ? 'bold' : 'normal',
            fontStyle: isItalic ? 'italic' : 'normal',
            fontFamily: font,
            letterSpacing: `${charSpacing * scale}px`,
            zIndex: 1,
            WebkitTextStroke: `${offsetStroke}px ${offsetColor}`,
            textStroke: `${offsetStroke}px ${offsetColor}`,
            whiteSpace: 'nowrap',
            transform: 'translate(-50%, -50%)',
            transformOrigin: 'center center'
          }}>
            {text}
          </div>
        )}
        <div style={{
          position: 'absolute', left: '50%', top: '50%', color: color,
          fontSize: `${displayFontSize}px`,
          fontWeight: isBold ? 'bold' : 'normal',
          fontStyle: isItalic ? 'italic' : 'normal',
          fontFamily: font,
          letterSpacing: `${charSpacing * scale}px`,
          zIndex: 2,
          whiteSpace: 'nowrap',
          transform: 'translate(-50%, -50%)',
          transformOrigin: 'center center'
        }}>
          {text}
        </div>
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
          <select value={font} onChange={(e) => setFont(e.target.value)} style={inputStyle}>
            <option value="Impact">Impact</option>
            <option value="Stencil">Stencil</option>
            <option value="Arial Black">Arial Black</option>
            <option value="Felix Titling">Felix Titling</option>
            <option value="Onyx">Onyx</option>
            <option value="Playbill">Playbill</option>
            <option value="Old English Text MT">Old English Text MT</option>
            <option value="Rage Italic">Rage Italic</option>
            <option value="Matura MT Script Capitals">Matura MT Script Capitals</option>
            <option value="Mistral">Mistral</option>
            <option value="Forte">Forte</option>
            <option value="Freestyle Script">Freestyle Script</option>
            <option value="Brush Script MT">Brush Script MT</option>
            <option value="Vladimir Script">Vladimir Script</option>
            <option value="Curlz MT">Curlz MT</option>
            <option value="Jokerman">Jokerman</option>
            <option value="Niagara Engraved">Niagara Engraved</option>
            <option value="Niagara Solid">Niagara Solid</option>
            <option value="Cooper Black">Cooper Black</option>
            <option value="Gill Sans Ultra Bold">Gill Sans Ultra Bold</option>
            <option value="Rockwell Extra Bold">Rockwell Extra Bold</option>
            <option value="Showcard Gothic">Showcard Gothic</option>
            <option value="Magneto">Magneto</option>
            <option value="Ravie">Ravie</option>
            <option value="Papyrus">Papyrus</option>
            <option value="Goudy Old Style">Goudy Old Style</option>
            <option value="Copperplate Gothic">Copperplate Gothic</option>
            <option value="Engravers MT">Engravers MT</option>
            <option value="OCR A Extended">OCR A Extended</option>
            <option value="Century Gothic">Century Gothic</option>
            <option value="Arial">Arial</option>
            <option value="Helvetica">Helvetica</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
            <option value="Georgia">Georgia</option>
            <option value="Verdana">Verdana</option>
            <option value="Trebuchet MS">Trebuchet MS</option>
            <option value="Lucida Console">Lucida Console</option>
            <option value="Futura">Futura</option>
          </select>
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label>Character Spacing:</label>
          <input
            type="range"
            min="0"
            max="20"
            step="1"
            value={charSpacing}
            onChange={(e) => setCharSpacing(parseInt(e.target.value))}
            style={{ width: '100%' }}
          />
          <div style={{ textAlign: 'center', fontSize: '12px', color: '#666' }}>
            {charSpacing}px spacing
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
          <input type="checkbox" checked={hasOffset} onChange={(e) => setHasOffset(e.target.checked)} />
          Add Offset Background
        </label>
      </div>

      {/* Offset Controls - Only show when hasOffset is true */}
      {hasOffset && (
        <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(0,0,0,0.05)', borderRadius: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label>Offset Color:</label>
            <select value={offsetColor} onChange={(e) => setOffsetColor(e.target.value)} style={inputStyle}>
              <option value="black">Black</option>
              <option value="white">White</option>
              <option value="red">Red</option>
              <option value="blue">Blue</option>
              <option value="#00ff00">Neon Green</option>
              <option value="#ff7f00">Orange</option>
              <option value="#ffd700">Gold</option>
            </select>
          </div>
          <div>
            <label>Offset Size:</label>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <button type="button" onClick={() => decrement(setOffsetSize, offsetSize, 0.25, 0.25)} style={btnStyle}>-</button>
              <input type="number" value={offsetSize} min="0.25" max="6" step="0.25" onChange={(e) => setOffsetSize(Math.max(0.25, parseFloat(e.target.value) || 0.25))} style={{...inputStyle, textAlign: 'center', flex: 1}} />
              <button type="button" onClick={() => increment(setOffsetSize, offsetSize, 0.25, 6)} style={btnStyle}>+</button>
            </div>
          </div>
        </div>
      )}

      {/* Quote Summary */}
      <div style={{ background: '#f0f7ff', padding: '15px', borderRadius: '5px', borderLeft: '4px solid #007bff', marginTop: '15px' }}>
        <strong>Total: ${totalPrice}</strong><br />
        <small>Unit: ${unitPrice}</small><br />
        <small>Size: {estimatedWidth}" x {height}"</small><br />
        <small>Vinyl Usage: {area} sq in</small><br />
        <small>Transfer Tape: ${transferTapeCost.toFixed(2)} per unit</small><br />
        {hasOffset && (
          <small>Offset: {offsetColor}, {offsetSize.toFixed(1)}" — ${offsetCost.toFixed(2)} per unit</small>
        )}
      </div>

      {/* Generate Cut Files */}
      <div style={{ marginTop: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button
          onClick={async () => {
            try {
              await api.generateCutVinylFile({
                text, height, font, isBold, isItalic, charSpacing, hasOffset: false, offsetSize: 0, layer: 'text', colorName, qty
              });
            } catch (e) { alert('Error generating text file: ' + e.message); }
          }}
          style={{ padding: '10px 18px', background: '#28a745', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
        >
          Cut File (Text)
        </button>
        {hasOffset && (
          <button
            onClick={async () => {
              try {
                await api.generateCutVinylFile({
                  text, height, font, isBold, isItalic, charSpacing, hasOffset, offsetSize, layer: 'offset', colorName: offsetColorName, qty
                });
              } catch (e) { alert('Error generating offset file: ' + e.message); }
            }}
            style={{ padding: '10px 18px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
          >
            Cut File (Offset)
          </button>
        )}
      </div>

      {/* Print Quote */}
      <div style={{ marginTop: '10px' }}>
        <button
          onClick={async () => {
            try {
              // Capture preview as image using html2canvas-style approach
              let previewImage = null;
              if (previewRef.current) {
                const canvas = await import('html2canvas').then(m => m.default || m).then(h2c => h2c(previewRef.current, { backgroundColor: '#333333', scale: 2 })).catch(() => null);
                if (canvas) previewImage = canvas.toDataURL('image/png');
              }
              await api.generateQuote({
                type: 'cut-vinyl',
                text, height, font, isBold, isItalic, charSpacing,
                colorName, hasOffset, offsetColorName, offsetSize,
                estimatedWidth, area, unitPrice, totalPrice, qty,
                transferTapeCost, offsetCost,
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
};

const inputStyle = { width: '100%', padding: '8px', margin: '10px 0', borderRadius: '4px', border: '1px solid #ccc' };
const btnStyle = { padding: '8px 12px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', minWidth: '36px' };

export default DecalConfigurator;
