import React, { useState } from "react";

export default function InitialsModal({ open, title="Enter Initials", onCancel, onConfirm }) {
  const [initials, setInitials] = useState("");

  if (!open) return null;

  const valid = /^[A-Za-z]{2,3}$/.test(initials.trim());

  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,.35)",
      display:"grid", placeItems:"center", padding:20, zIndex:50
    }}>
      <div className="card" style={{ width:420, maxWidth:"100%" }}>
        <div className="h1" style={{ fontSize:18, marginBottom:6 }}>{title}</div>
        <div style={{ color:"var(--muted)", fontWeight:700, marginBottom:12 }}>
          Initials are required for this action.
        </div>
        <input
          className="input"
          placeholder="JD"
          value={initials}
          onChange={(e)=>setInitials(e.target.value.toUpperCase())}
          maxLength={3}
        />
        {!valid && initials.length>0 && (
          <div style={{ marginTop:8, color:"var(--red)", fontWeight:800 }}>
            Initials must be 2–3 letters.
          </div>
        )}
        <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:14 }}>
          <button className="btn outline" onClick={()=>{ setInitials(""); onCancel?.(); }}>Cancel</button>
          <button className="btn primary" disabled={!valid} onClick={()=>{ const v=initials.trim().toUpperCase(); setInitials(""); onConfirm?.(v); }}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
