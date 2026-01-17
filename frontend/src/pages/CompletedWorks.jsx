import React, { useEffect, useState } from "react";
import AppShell from "../components/AppShell.jsx";
import { api, getUser } from "../api.js";

async function downloadWorkOrder(orderId, orderNumber) {
  const token = localStorage.getItem("swc_token");

  if (!token) {
    alert("Missing login token. Please refresh and log in again.");
    return;
  }

  const res = await fetch(`http://localhost:4000/api/orders/${orderId}/pdf`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const msg = await res.text();
    alert(`PDF failed (${res.status})\n${msg}`);
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

export default function CompletedWorks() {
    const user = getUser();
  const isAdmin = user?.role === "ADMIN";

  const [orders, setOrders] = useState([]);
  const [err, setErr] = useState("");

  async function load() {
    try {
      setErr("");
      const data = await api.ordersByStatus("FINISHED");
      setOrders(data);
    } catch (e) {
      setErr(e.message);
    }
  }
    async function onDelete(o) {
    if (!isAdmin) return;

    const initials = prompt("Enter initials (2–3 letters) to confirm delete:");
    if (!initials) return;

    try {
      await api.deleteOrder(o.id, initials.trim().toUpperCase());
      await load();
      alert("Deleted.");
    } catch (e) {
      alert(e.message || "Failed to delete order");
    }
  }


  useEffect(()=>{ load(); }, []);

  return (
    <AppShell>
      <div className="row" style={{ alignItems:"center", marginBottom:12 }}>
        <div className="col">
          <div className="h1">Completed Works</div>
          <div className="h2">Finished orders (read-only)</div>
        </div>
        <button className="btn outline" onClick={load}>Refresh</button>
      </div>

      {err && <div className="notice" style={{ marginBottom:12 }}>{err}</div>}

      <table className="table">
        <thead>
          <tr>
            <th>Order #</th><th>Customer</th><th>Completed</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map(o => (
            <tr key={o.id}>
              <td style={{ fontWeight:900, color:"var(--red)" }}>{o.orderNumber}</td>
              <td style={{ fontWeight:800 }}>{o.customerNameSnapshot}</td>
              <td>{o.finishedAt ? new Date(o.finishedAt).toLocaleString() : "-"}</td>
             <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
  <button className="btn" onClick={() => downloadWorkOrder(o.id, o.orderNumber)}>
    Download Work Order
  </button>

  {isAdmin && (
    <button className="btn danger" type="button" onClick={() => onDelete(o)}>
      Delete
    </button>
  )}
</td>

            </tr>
          ))}
          {orders.length===0 && <tr><td colSpan="4" style={{ color:"var(--muted)" }}>No completed orders yet.</td></tr>}
        </tbody>
      </table>
    </AppShell>
  );
}
