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

  async function downloadWorkOrder() {
  const token = localStorage.getItem("swc_token");

  if (!token) {
    alert("Missing token");
    return;
  }

  const res = await fetch(
    `http://localhost:4000/api/orders/${id}/pdf`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

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
                </tbody>
              </table>
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
