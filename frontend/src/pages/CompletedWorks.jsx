import React, { useEffect, useState } from "react";
import AppShell from "../components/AppShell.jsx";
import { api, getUser } from "../api.js";

async function downloadWorkOrder(orderId, orderNumber) {
  const token = localStorage.getItem("swc_token");

  if (!token) {
    alert("Missing login token. Please refresh and log in again.");
    return;
  }

  const res = await fetch(`/api/orders/${orderId}/pdf`, {
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
  const [deletingId, setDeletingId] = useState(null);

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
    if (deletingId) return; // prevent double-click spam

    if (!window.confirm(`Permanently delete order ${o.orderNumber}? This cannot be undone.`)) return;

    // Optimistic UI remove (so it disappears instantly)
    const prev = orders;
    setDeletingId(o.id);
    setOrders((cur) => cur.filter((x) => x.id !== o.id));

    try {
      await api.deleteOrder(o.id, "");

      // Re-sync from server (in case anything else changed)
      await load();
      alert("Deleted.");
    } catch (e) {
      // Roll back UI if delete failed
      setOrders(prev);
      alert(e.message || "Failed to delete order");
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <AppShell>
      <div className="row" style={{ alignItems: "center", marginBottom: 12 }}>
        <div className="col">
          <div className="h1">Completed Works</div>
          <div className="h2">Finished orders (read-only)</div>
        </div>
        <button className="btn outline" onClick={load} disabled={!!deletingId}>
          Refresh
        </button>
      </div>

      {err && (
        <div className="notice" style={{ marginBottom: 12 }}>
          {err}
        </div>
      )}

      <table className="table">
        <thead>
          <tr>
            <th>Order #</th>
            <th>Customer</th>
            <th>Completed</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} style={deletingId === o.id ? { opacity: 0.6 } : undefined}>
              <td style={{ fontWeight: 900, color: "var(--red)" }}>{o.orderNumber}</td>
              <td style={{ fontWeight: 800 }}>{o.customerNameSnapshot}</td>
              <td>{o.finishedAt ? new Date(o.finishedAt).toLocaleString() : "-"}</td>
              <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="btn"
                  onClick={() => downloadWorkOrder(o.id, o.orderNumber)}
                  disabled={deletingId === o.id}
                >
                  Download Work Order
                </button>

                {isAdmin && (
                  <button
                    className="btn danger"
                    type="button"
                    onClick={() => onDelete(o)}
                    disabled={deletingId === o.id}
                    title={deletingId === o.id ? "Deleting..." : "Delete"}
                  >
                    {deletingId === o.id ? "Deleting..." : "Delete"}
                  </button>
                )}
              </td>
            </tr>
          ))}

          {orders.length === 0 && (
            <tr>
              <td colSpan="4" style={{ color: "var(--muted)" }}>
                No completed orders yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </AppShell>
  );
}
