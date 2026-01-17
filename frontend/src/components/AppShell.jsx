import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, searchOrders, clearAuth, getUser } from "../api.js";

export default function AppShell({ children }) {
  const loc = useLocation();
  const nav = useNavigate();

  const user = getUser();
  const isAdmin = user?.role === "ADMIN";

  const [branding, setBranding] = useState({ companyName: "", logoUrl: "" });

  // Search (header)
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [searchErr, setSearchErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const b = await api.brandingGet();
        if (b && typeof b === "object") {
          const rawLogo = b.logoUrl || b.logoPath || b.logo_path || "";
const fullLogo =
  rawLogo && rawLogo.startsWith("/")
    ? `http://localhost:4000${rawLogo}`
    : rawLogo;

setBranding({
  companyName: b.companyName || "",
  logoUrl: fullLogo,
});

        }
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const term = q.trim();
      if (!term) {
        setResults([]);
        setOpen(false);
        setSearchErr("");
        return;
      }

      try {
        setSearchErr("");
        const data = await searchOrders(term);
        if (cancelled) return;
        setResults(Array.isArray(data) ? data : []);
        setOpen(true);
      } catch (e) {
        if (cancelled) return;
        setSearchErr(e.message || "Search failed");
        setResults([]);
        setOpen(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [q]);

  function logout() {
    clearAuth();
    nav("/login");
  }

  const tab = (to, label) => {
    const active = loc.pathname === to;
    return (
      <Link to={to} className={active ? "tab active" : "tab"}>
        {label}
      </Link>
    );
  };

  return (
    <div>
      <div className="topbar">
        <div className="topbar-inner">
          <div className="brand" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt="Logo"
                style={{
                  height: 64,
                  maxWidth: 320,
                  objectFit: "contain",
                  borderRadius: 12,
                }}
              />
            ) : (
              <div className="logo" />
            )}

            <div>
              <div className="appTitle">Sticks Work Center</div>
              {branding.companyName ? (
                <div style={{ color: "var(--muted)", fontWeight: 800, marginTop: -2 }}>
                  {branding.companyName}
                </div>
              ) : null}
            </div>
          </div>

          <div className="searchWrap" style={{ position: "relative" }}>
            <input
              className="input"
              placeholder="Search orders/customers…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => {
                if (q.trim()) setOpen(true);
              }}
            />

            {open && (results.length > 0 || searchErr) && (
              <div className="dropdown">
                {searchErr ? (
                  <div className="dropItem" style={{ color: "var(--red)", fontWeight: 900 }}>
                    {searchErr}
                  </div>
                ) : (
                  results.map((r) => (
                    <button
                      key={r.id}
                      className="dropItem"
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        setQ("");
                        if (r.type === "order") nav(`/orders/${r.id}`);
else nav(`/customers`);

                      }}
                    >
                      <div style={{ fontWeight: 900 }}>
                        {r.type === "order" ? r.orderNumber : r.name}
                      </div>
                      <div style={{ color: "var(--muted)", fontWeight: 800 }}>
                        {r.type === "order"
                          ? `${r.customerNameSnapshot || ""} • ${r.status}`
                          : r.shippingAddress || ""}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="topRight">
            <div className="userChip">
              <div style={{ fontWeight: 900 }}>
                {user?.displayName || user?.name || user?.username}
              </div>
              <div style={{ color: "var(--muted)", fontWeight: 800, fontSize: 12 }}>
                {user?.role || ""}
              </div>
            </div>
            <button className="btn outline" onClick={logout}>
              Logout
            </button>
          </div>
        </div>

        <div className="nav">
          {tab("/create-order", "Create Order")}
          {tab("/work-in-progress", "Work In Progress")}
          {tab("/completed-works", "Completed Works")}
          {tab("/customers", "Customers")}
          {isAdmin ? tab("/admin", "Admin") : null}
        </div>
      </div>

      <div className="container">{children}</div>
    </div>
  );
}
