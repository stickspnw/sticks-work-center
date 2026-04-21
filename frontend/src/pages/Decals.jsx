import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DecalConfigurator from "../components/DecalConfigurator.jsx";
import { api } from "../api.js";

export default function Decals() {
  const [logoUrl, setLogoUrl] = useState("");

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

  return (
    <div style={{ padding: '20px' }}>
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
          <button style={{ padding: '12px 24px', backgroundColor: '#0056b3', color: 'white', border: 'none', borderRadius: '6px', cursor: 'default', fontSize: '16px', fontWeight: 'bold' }}>
            Cut Vinyl
          </button>
          <Link to="/printed-decals" style={{ textDecoration: 'none' }}>
            <button style={{ padding: '12px 24px', backgroundColor: '#444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '16px' }}>
              Printed Decals
            </button>
          </Link>
        </div>
      </div>

      <p style={{ textAlign: 'center', marginBottom: '20px' }}>Design your own custom vinyl decal below.</p>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <DecalConfigurator />
      </div>
    </div>
  );
}