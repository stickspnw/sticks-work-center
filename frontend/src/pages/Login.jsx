import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setAuth } from "../api.js";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const auth = await api.login(username.trim(), password);
      setAuth(auth);
      navigate("/work-in-progress");
    } catch (e) {
      setErr(e.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="card" style={{ width: 420, maxWidth:"100%" }}>
        <div className="logo" style={{ display:"inline-block", marginBottom:14 }}>Sticks Work Center</div>
        <div className="h1" style={{ marginBottom:10 }}>Log In</div>
        {err && <div className="notice" style={{ marginBottom:12 }}>{err}</div>}
        <form onSubmit={submit}>
          <div style={{ marginBottom:10, fontWeight:800, color:"var(--muted)" }}>Username</div>
          <input className="input" value={username} onChange={(e)=>setUsername(e.target.value)} />
          <div style={{ marginTop:12, marginBottom:10, fontWeight:800, color:"var(--muted)" }}>Password</div>
          <input className="input" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} />
          <div style={{ display:"flex", gap:10, marginTop:16 }}>
            <button className="btn primary" disabled={loading} style={{ flex:1 }}>
              {loading ? "Signing in..." : "Log In"}
            </button>
          </div>
          <div style={{ marginTop:14, color:"var(--muted)", fontWeight:700, fontSize:12 }}>
            Default users (seeded): jordan.admin / 739204 • kaden.standard / 418672
          </div>
        </form>
      </div>
    </div>
  );
}
