import React, { useEffect, useState } from "react";
import AppShell from "../components/AppShell.jsx";
import { api } from "../api.js";
import InitialsModal from "../components/InitialsModal.jsx"; // reserved for edits later

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name:"", phone:"", email:"", shippingAddress:"" });

  async function load() {
    try {
      setErr("");
      const data = await api.customers(q);
      setCustomers(data);
    } catch (e) {
      setErr(e.message);
    }
  }
  useEffect(()=>{ load(); }, []);

  async function addCustomer() {
    try {
      setErr("");
      await api.createCustomer({
        name: form.name,
        phone: form.phone || null,
        email: form.email || null,
        shippingAddress: form.shippingAddress,
      });
      setShowAdd(false);
      setForm({ name:"", phone:"", email:"", shippingAddress:"" });
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <AppShell onSearch={()=>{}}>
      <div className="row" style={{ alignItems:"center", marginBottom:12 }}>
        <div className="col">
          <div className="h1">Customers</div>
          <div className="h2">Manage customer records</div>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <input className="input" placeholder="Search customers" value={q} onChange={(e)=>setQ(e.target.value)} style={{ width:280 }} />
          <button className="btn outline" onClick={load}>Search</button>
          <button className="btn primary" onClick={()=>setShowAdd(true)}>+ Add Customer</button>
        </div>
      </div>

      {err && <div className="notice" style={{ marginBottom:12 }}>{err}</div>}

      {showAdd && (
        <div className="card" style={{ marginBottom:12 }}>
          <div className="h2">New Customer</div>
          <div className="row">
            <div className="col">
              <div style={{ fontWeight:800, color:"var(--muted)", marginBottom:6 }}>Customer Name</div>
              <input className="input" value={form.name} onChange={(e)=>setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="col">
              <div style={{ fontWeight:800, color:"var(--muted)", marginBottom:6 }}>Phone</div>
              <input className="input" value={form.phone} onChange={(e)=>setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="col">
              <div style={{ fontWeight:800, color:"var(--muted)", marginBottom:6 }}>Email</div>
              <input className="input" value={form.email} onChange={(e)=>setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div style={{ marginTop:10, fontWeight:800, color:"var(--muted)", marginBottom:6 }}>Shipping Address</div>
          <textarea className="input" style={{ borderRadius:"var(--radius)", height:80 }} value={form.shippingAddress} onChange={(e)=>setForm({ ...form, shippingAddress: e.target.value })} />
          <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:12 }}>
            <button className="btn outline" onClick={()=>setShowAdd(false)}>Cancel</button>
            <button className="btn primary" onClick={addCustomer}>Save Customer</button>
          </div>
          <div style={{ marginTop:8, color:"var(--muted)", fontWeight:700, fontSize:12 }}>
            Required: Name + Shipping Address + (Phone or Email)
          </div>
        </div>
      )}

      <table className="table">
        <thead>
          <tr>
            <th>Name</th><th>Phone</th><th>Email</th><th>Date Added</th>
          </tr>
        </thead>
        <tbody>
          {customers.map(c => (
            <tr key={c.id}>
              <td style={{ fontWeight:800 }}>{c.name}</td>
              <td>{c.phone || "-"}</td>
              <td>{c.email || "-"}</td>
              <td>{new Date(c.dateAdded).toLocaleString()}</td>
            </tr>
          ))}
          {customers.length === 0 && (
            <tr><td colSpan="4" style={{ color:"var(--muted)" }}>No customers yet.</td></tr>
          )}
        </tbody>
      </table>
    </AppShell>
  );
}
