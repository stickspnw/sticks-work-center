
import AttachmentsPanel from "../components/AttachmentsPanel.jsx";
import React, { useEffect, useState } from "react";


import AppShell from "../components/AppShell.jsx";
import { api } from "../api.js";
import InitialsModal from "../components/InitialsModal.jsx";
async function downloadWorkOrder(orderId, orderNumber) {
  const token = localStorage.getItem("swc_token");

  const res = await fetch(`http://localhost:4000/api/orders/${orderId}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    alert(`PDF download failed (${res.status}) ${text}`);
    return;
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${orderNumber}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}



export default function WorkInProgress() {

  const [orders, setOrders] = useState([]);
  const [err, setErr] = useState("");
  const [completeId, setCompleteId] = useState(null);
  const [attachmentsOrderId, setAttachmentsOrderId] = useState("");


  async function load() {
    try {
      setErr("");
      const data = await api.ordersByStatus("WIP");
      setOrders(data);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(()=>{ load(); }, []);

  async function complete(initials) {
    try {
      await api.completeOrder(completeId, initials);
      setCompleteId(null);
      await load();
    } catch (e) {
      setErr(e.message);
      setCompleteId(null);
    }
  }

  return (
    <AppShell>
      <div className="row" style={{ alignItems:"center", marginBottom:12 }}>
        <div className="col">
          <div className="h1">Work In Progress</div>
          <div className="h2">Active work orders</div>
        </div>
        <button className="btn outline" onClick={load}>Refresh</button>
      </div>

      {err && <div className="notice" style={{ marginBottom:12 }}>{err}</div>}

      <table className="table">
        <thead>
          <tr>
            <th>Order #</th><th>Customer</th><th>Created</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
  <tr key={o.id}>
    <td>
  <button
    type="button"
    className="btn"
    style={{
      fontWeight: 900,
      color: "var(--red)",
      background: "transparent",
      border: "none",
      padding: 0,
      cursor: "pointer",
      textDecoration: "underline",
    }}
    onClick={() => {
      console.log("clicked order:", o.id);
      window.location.href = `/orders/${o.id}`;
    }}
  >
    {o.orderNumber}
  </button>
</td>


    <td style={{ fontWeight: 800 }}>{o.customerNameSnapshot}</td>
    <td>{new Date(o.createdAt).toLocaleString()}</td>
    <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button
  className="btn"
  type="button"
  onClick={() => downloadWorkOrder(o.id, o.orderNumber)}
>
  Download Work Order
</button>



      <button
        className="btn"
        type="button"
        onClick={() => {
          // TEMP: confirms click works
          console.log("Attachments clicked for", o.id);
          setAttachmentsOrderId(o.id);
        }}
      >
        Attachments
      </button>

      <button
        className="btn primary"
        type="button"
        onClick={() => setCompleteId(o.id)}
      >
        Mark as Completed
      </button>
    </td>
  </tr>
))}

{orders.length === 0 && (
  <tr>
    <td colSpan="4" style={{ color: "var(--muted)" }}>
      No WIP orders yet.
    </td>
  </tr>
)}

          {orders.length===0 && <tr><td colSpan="4" style={{ color:"var(--muted)" }}>No WIP orders yet.</td></tr>}
          

        </tbody>
      </table>

      <InitialsModal
        open={!!completeId}
        title="Enter Initials to Complete"
        onCancel={()=>setCompleteId(null)}
        onConfirm={complete}
      />
      {attachmentsOrderId && (
  <AttachmentsPanel
    orderId={attachmentsOrderId}
    onClose={() => setAttachmentsOrderId("")}
  />
)}

    </AppShell>
  );
}
