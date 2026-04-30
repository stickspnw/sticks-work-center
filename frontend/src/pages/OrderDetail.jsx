import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell.jsx";
import AttachmentsPanel from "../components/AttachmentsPanel.jsx";

import { api, downloadOrderPdf } from "../api.js";


export default function OrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();

  const [order, setOrder] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAttachments, setShowAttachments] = useState(false);

  const [proofs, setProofs] = useState([]);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofErr, setProofErr] = useState("");

  async function reloadProofs() {
    try {
      const list = await api.listProofs(id);
      setProofs(list);
    } catch (e) {
      setProofErr(e.message || "Failed to load proofs");
    }
  }

  async function handleProofFile(file) {
    if (!file) return;
    setProofErr("");
    setUploadingProof(true);
    try {
      await api.uploadProof(id, file);
      await reloadProofs();
    } catch (e) {
      setProofErr(e.message || "Upload failed");
    } finally {
      setUploadingProof(false);
    }
  }

  async function deleteProof(proofId) {
    if (!confirm("Delete this proof?")) return;
    try {
      await api.deleteProof(id, proofId);
      await reloadProofs();
    } catch (e) {
      setProofErr(e.message || "Delete failed");
    }
  }

  async function downloadWorkOrder() {
  const token = localStorage.getItem("swc_token");

  if (!token) {
    alert("Missing token");
    return;
  }

  const res = await fetch(`/api/orders/${id}/pdf`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    alert(`PDF failed (${res.status}) ${text}`);
    return;
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${order.orderNumber}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.URL.revokeObjectURL(url);
}


  useEffect(() => {
    (async () => {
      try {
        setErr("");
        setLoading(true);
        const data = await api.orderDetail(id);
        setOrder(data);
      } catch (e) {
        setErr(e.message || "Failed to load order");
      } finally {
        setLoading(false);
      }
    })();
    reloadProofs();
  }, [id]);

  return (
    <AppShell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="h1">Order Detail</div>
          <div className="h2" style={{ marginTop: 4 }}>
            {order?.orderNumber || (loading ? "Loading..." : "")}
          </div>
        </div>

        <button className="btn" type="button" onClick={() => nav(-1)}>
          Back
        </button>
      </div>

      {err && <div className="notice" style={{ marginTop: 12 }}>{err}</div>}

      {loading ? (
        <div className="card" style={{ marginTop: 12 }}>Loading…</div>
      ) : !order ? (
        <div className="card" style={{ marginTop: 12 }}>Not found.</div>
      ) : (
        <>
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Status</div>
                <div style={{ fontWeight: 800, color: "var(--muted)" }}>{order.status}</div>
              </div>
              <div>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Created</div>
                <div style={{ fontWeight: 800, color: "var(--muted)" }}>
                  {new Date(order.createdAt).toLocaleString()}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
  className="btn"
  type="button"
  onClick={() => {
    console.log("✅ Order Detail download click");
    downloadWorkOrder();
  }}
>
  Download Work Order
</button><button
  className="btn"
  type="button"
  onClick={() => setShowAttachments(true)}
>
  Attachments
</button>



            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <div className="h2">Customer</div>
            <div style={{ marginTop: 6, fontWeight: 800 }}>{order.customerNameSnapshot}</div>
            {order.customerPhoneSnapshot && (
              <div style={{ color: "var(--muted)", fontWeight: 700 }}>{order.customerPhoneSnapshot}</div>
            )}
            {order.customerEmailSnapshot && (
              <div style={{ color: "var(--muted)", fontWeight: 700 }}>{order.customerEmailSnapshot}</div>
            )}
            <div style={{ marginTop: 8, color: "var(--muted)", fontWeight: 700 }}>
              {order.customerShippingAddressSnapshot}
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <div className="h2">Line Items</div>
            {(!order.lineItems || order.lineItems.length === 0) ? (
              <div style={{ marginTop: 8, color: "var(--muted)", fontWeight: 700 }}>
                No products on this order.
              </div>
              
            ) : (
              <table className="table" style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th style={{ textAlign: "right" }}>Qty</th>
                    <th style={{ textAlign: "right" }}>Unit</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lineItems.map((li) => (
                    <tr key={li.id}>
                      <td><strong>{li.productNameSnapshot}</strong></td>
                      <td style={{ textAlign: "right" }}>{li.qty}</td>
                      <td style={{ textAlign: "right" }}>${Number(li.unitPriceFinal).toFixed(2)}</td>
                      <td style={{ textAlign: "right" }}>${Number(li.lineTotal).toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3} style={{ textAlign: "right", fontWeight: 900, borderTop: "2px solid var(--border, #ddd)", paddingTop: 8 }}>
                      Order Total:
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 900, fontSize: 16, borderTop: "2px solid var(--border, #ddd)", paddingTop: 8 }}>
                      ${order.lineItems.reduce((s, li) => s + Number(li.lineTotal || 0), 0).toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div className="h2">Proofs</div>
              <label className="btn primary" style={{ cursor: uploadingProof ? "not-allowed" : "pointer" }}>
                {uploadingProof ? "Uploading…" : "Upload Proof"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                  style={{ display: "none" }}
                  disabled={uploadingProof}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) handleProofFile(f);
                  }}
                />
              </label>
            </div>

            {proofErr && <div className="notice" style={{ marginTop: 8 }}>{proofErr}</div>}

            {proofs.length === 0 ? (
              <div style={{ marginTop: 8, color: "var(--muted)", fontWeight: 700 }}>
                No proofs uploaded yet. Use Upload Proof to attach a JPG/PNG.
              </div>
            ) : (
              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
                {proofs.map((p) => (
                  <div key={p.id} style={{ border: "1px solid var(--border, #ddd)", borderRadius: 6, overflow: "hidden", background: "#fafafa" }}>
                    <a href={api.proofFileUrl(id, p.id) + `?t=${encodeURIComponent(localStorage.getItem('swc_token') || '')}`}
                       onClick={async (e) => {
                         e.preventDefault();
                         try {
                           const token = localStorage.getItem("swc_token");
                           const res = await fetch(api.proofFileUrl(id, p.id), { headers: { Authorization: `Bearer ${token}` } });
                           const blob = await res.blob();
                           const url = URL.createObjectURL(blob);
                           window.open(url, "_blank");
                         } catch {}
                       }}
                       style={{ display: "block", aspectRatio: "1", background: "#fff" }}>
                      <ProofThumb orderId={id} proofId={p.id} />
                    </a>
                    <div style={{ padding: 6, fontSize: 12 }}>
                      <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.filename}>{p.filename}</div>
                      <div style={{ color: "var(--muted)" }}>{new Date(p.createdAt).toLocaleString()}</div>
                      <button className="btn danger" type="button" style={{ marginTop: 6 }} onClick={() => deleteProof(p.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {showAttachments && (
  <div style={{ marginTop: 12 }}>
    <AttachmentsPanel
      orderId={id}
      onClose={() => setShowAttachments(false)}
    />
  </div>
)}

        </>
      )}
    </AppShell>
  );
}

function ProofThumb({ orderId, proofId }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let revoked = false;
    let objectUrl = null;
    (async () => {
      try {
        const token = localStorage.getItem("swc_token");
        const res = await fetch(`/api/orders/${orderId}/proofs/${proofId}/file`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!revoked) setSrc(objectUrl);
      } catch {}
    })();
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [orderId, proofId]);

  if (!src) {
    return <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 12 }}>Loading…</div>;
  }
  return <img src={src} alt="proof" style={{ width: "100%", height: "100%", objectFit: "contain" }} />;
}
