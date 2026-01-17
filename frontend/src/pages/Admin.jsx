import React, { useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell.jsx";
import { api, getUser } from "../api.js";

const AUDIT_STEP = 75;
const AUDIT_MAX = 200; // backend caps at 200

export default function Admin() {
  const user = getUser();
  const isAdmin = user?.role === "ADMIN";

  const [section, setSection] = useState("users");

  // -----------------------
  // Products
  // -----------------------
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsErr, setProductsErr] = useState("");

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [editingPrice, setEditingPrice] = useState("");

  // -----------------------
  // Users
  // -----------------------
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersErr, setUsersErr] = useState("");

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("STANDARD");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [createUserErr, setCreateUserErr] = useState("");

  // -----------------------
  // Audit Log
  // -----------------------
  const [auditRows, setAuditRows] = useState([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditErr, setAuditErr] = useState("");
  const [auditTake, setAuditTake] = useState(AUDIT_STEP);

  // -----------------------
  // Branding
  // -----------------------
  const [branding, setBranding] = useState({ companyName: "", logoUrl: "" });
  const [brandingLoading, setBrandingLoading] = useState(true);
  const [brandingErr, setBrandingErr] = useState("");
  const [companyNameDraft, setCompanyNameDraft] = useState("");
  const [logoFile, setLogoFile] = useState(null);

  // -----------------------
  // Customers
  // -----------------------
  const [customerQ, setCustomerQ] = useState("");
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customersErr, setCustomersErr] = useState("");

  async function refreshProducts() {
    setProductsErr("");
    setProductsLoading(true);
    try {
      const data = await api.products();
      setProducts(Array.isArray(data) ? data : []);
    } catch (e) {
      setProductsErr(e.message || "Failed to load products");
    } finally {
      setProductsLoading(false);
    }
  }

  async function refreshUsers() {
    if (!isAdmin) return;
    setUsersErr("");
    setUsersLoading(true);
    try {
      const data = await api.users();
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      setUsersErr(e.message || "Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  }

  async function refreshAudit(take = auditTake) {
    if (!isAdmin) return;
    setAuditErr("");
    setAuditLoading(true);
    try {
      const data = await api.audit(take);
      setAuditRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setAuditErr(e.message || "Failed to load audit log");
    } finally {
      setAuditLoading(false);
    }
  }

  async function refreshBranding() {
    if (!isAdmin) return;
    setBrandingErr("");
    setBrandingLoading(true);
    try {
      const b = await api.brandingGet();
      setBranding({
        companyName: b?.companyName || "",
        logoUrl: b?.logoUrl || "",
      });
      setCompanyNameDraft(b?.companyName || "");
    } catch (e) {
      setBrandingErr(e.message || "Failed to load branding");
    } finally {
      setBrandingLoading(false);
    }
  }

  async function refreshCustomers() {
    if (!isAdmin) return;
    setCustomersErr("");
    setCustomersLoading(true);
    try {
      const data = await api.customers(customerQ);
      setCustomers(Array.isArray(data) ? data : []);
    } catch (e) {
      setCustomersErr(e.message || "Failed to load customers");
    } finally {
      setCustomersLoading(false);
    }
  }

  useEffect(() => {
    refreshProducts();
    refreshUsers();
    refreshAudit(AUDIT_STEP);
    refreshBranding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeCount = useMemo(
    () => products.filter((p) => p.status === "ACTIVE").length,
    [products]
  );

  // -----------------------
  // Products handlers
  // -----------------------
  async function onCreateProduct(e) {
    e.preventDefault();
    setProductsErr("");

    const trimmed = name.trim();
    const num = Number(price);

    if (trimmed.length < 2) return setProductsErr("Product name must be at least 2 characters.");
    if (Number.isNaN(num) || num < 0) return setProductsErr("Price must be a valid non-negative number.");

    try {
      await api.createProduct({ name: trimmed, price: num });
      setName("");
      setPrice("");
      await refreshProducts();
      await refreshAudit(auditTake);
    } catch (e2) {
      setProductsErr(e2.message || "Failed to create product");
    }
  }

  function startEdit(p) {
    setEditingId(p.id);
    setEditingName(p.name);
    setEditingPrice(String(p.price));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
    setEditingPrice("");
  }

  async function saveEdit(p) {
    setProductsErr("");

    const trimmed = editingName.trim();
    const num = Number(editingPrice);

    if (trimmed.length < 2) return setProductsErr("Product name must be at least 2 characters.");
    if (Number.isNaN(num) || num < 0) return setProductsErr("Price must be a valid non-negative number.");

    try {
      await api.updateProduct(p.id, { name: trimmed, price: num });
      cancelEdit();
      await refreshProducts();
      await refreshAudit(auditTake);
    } catch (e2) {
      setProductsErr(e2.message || "Failed to update product");
    }
  }

  async function toggleStatus(p) {
    setProductsErr("");
    try {
      await api.setProductStatus(p.id, p.status === "ACTIVE" ? "DISABLED" : "ACTIVE");
      await refreshProducts();
      await refreshAudit(auditTake);
    } catch (e2) {
      setProductsErr(e2.message || "Failed to update status");
    }
  }

  // -----------------------
  // Users handlers
  // -----------------------
  async function onCreateUser(e) {
    e.preventDefault();
    if (!isAdmin) return;

    setCreateUserErr("");

    const u = newUsername.trim();
    const p = newPassword.trim();
    const dn = newDisplayName.trim();

    if (u.length < 3) return setCreateUserErr("Username must be at least 3 characters.");
    if (p.length < 4) return setCreateUserErr("Password must be at least 4 characters.");

    try {
      await api.createUser({
        username: u,
        password: p,
        role: newRole,
        displayName: dn ? dn : null,
      });

      setNewUsername("");
      setNewPassword("");
      setNewRole("STANDARD");
      setNewDisplayName("");

      await refreshUsers();
      await refreshAudit(auditTake);
    } catch (err) {
      setCreateUserErr(err.message || "Failed to create user");
    }
  }

  // -----------------------
  // Branding handlers
  // -----------------------
  async function saveCompanyName() {
    if (!isAdmin) return;
    const initials = prompt("Enter initials (2–3 letters) to confirm:");
    if (!initials) return;

    setBrandingErr("");
    try {
      await api.brandingSetCompanyName(companyNameDraft.trim(), initials.trim().toUpperCase());
      await refreshBranding();
      await refreshAudit(auditTake);
      alert("Saved.");
    } catch (e) {
      setBrandingErr(e.message || "Failed to save company name");
    }
  }

  async function uploadLogo() {
    if (!isAdmin) return;
    if (!logoFile) {
      setBrandingErr("Pick a logo file first.");
      return;
    }

    const initials = prompt("Enter initials (2–3 letters) to confirm logo upload:");
    if (!initials) return;

    setBrandingErr("");
    try {
      await api.brandingUploadLogo(logoFile, initials.trim().toUpperCase());
      setLogoFile(null);
      await refreshBranding();
      await refreshAudit(auditTake);
      alert("Logo uploaded.");
    } catch (e) {
      setBrandingErr(e.message || "Failed to upload logo");
    }
  }

  // -----------------------
  // Exports
  // -----------------------
 async function downloadCompletedCsv() {
  if (!isAdmin) return;

  // Ask for initials
  const initials = prompt("Enter initials (2–3 letters) to export completed orders:");
  if (!initials) return;

  try {
    await api.downloadCompletedOrdersCsv(initials.trim().toUpperCase());
  } catch (e) {
    alert(e.message || "Failed to download export");
  }
}



  function SectionTabs() {
    const tabs = [
      ["users", "Users"],
      ["audit", "Audit Log"],
      ["products", "Products"],
      ["customers", "Customers"],
      ["branding", "Branding"],
      ["exports", "Exports"],
    ];

    return (
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`btn ${section === id ? "primary" : "outline"}`}
              onClick={() => {
                setSection(id);
                if (id === "customers") refreshCustomers();
                if (id === "branding") refreshBranding();
                if (id === "audit") refreshAudit(auditTake);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <div className="h1">Admin</div>

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 900 }}>Logged in as</div>
        <div style={{ color: "var(--muted)", fontWeight: 800 }}>
          {user?.name} ({user?.username})
        </div>
      </div>

      <SectionTabs />

      {/* USERS */}
      {section === "users" && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="h2">Users</div>
              <div style={{ color: "var(--muted)", fontWeight: 700 }}>Admin-only list</div>
            </div>
            <button className="btn" type="button" onClick={refreshUsers}>
              Refresh
            </button>
          </div>

          {!isAdmin ? (
            <div style={{ marginTop: 10, color: "var(--muted)", fontWeight: 800 }}>You are not an admin.</div>
          ) : usersErr ? (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid var(--red)", color: "var(--red)", fontWeight: 800 }}>
              {usersErr}
            </div>
          ) : (
            <>
              <form onSubmit={onCreateUser} style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
                <input className="input" placeholder="Username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} style={{ minWidth: 180 }} />
                <input className="input" placeholder="Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={{ minWidth: 180 }} />
                <input className="input" placeholder="Display name (optional)" value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} style={{ minWidth: 220 }} />
                <select className="input" value={newRole} onChange={(e) => setNewRole(e.target.value)} style={{ width: 180 }}>
                  <option value="ADMIN">ADMIN</option>
                  <option value="STANDARD">STANDARD</option>
                  <option value="READ_ONLY">READ_ONLY</option>
                </select>

                <button className="btn primary" type="submit">
                  Create User
                </button>
              </form>

              {createUserErr && (
                <div style={{ marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid var(--red)", color: "var(--red)", fontWeight: 800 }}>
                  {createUserErr}
                </div>
              )}

              <table className="table" style={{ marginTop: 14 }}>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Display Name</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Last Login</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {usersLoading ? (
                    <tr>
                      <td colSpan={7}>Loading…</td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={7}>No users returned.</td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id} style={{ opacity: u.status === "DISABLED" ? 0.55 : 1 }}>
                        <td style={{ fontWeight: 900 }}>{u.username}</td>
                        <td style={{ fontWeight: 800 }}>{u.displayName || u.name || "—"}</td>
                        <td style={{ fontWeight: 800 }}>
                          <select
                            className="input"
                            style={{ width: 160 }}
                            value={u.role}
                            onChange={async (e) => {
                              const nextRole = e.target.value;
                              if (nextRole === u.role) return;

                              const initials = prompt("Enter initials (2–3 letters) to confirm role change:");
                              if (!initials) return;

                              try {
                                await api.setUserRole(u.id, nextRole, initials.trim().toUpperCase());
                                await refreshUsers();
                                await refreshAudit(auditTake);
                              } catch (err) {
                                alert(err.message || "Failed to update role");
                                await refreshUsers();
                              }
                            }}
                            disabled={!isAdmin || u.id === user?.id}
                            title={u.id === user?.id ? "You cannot change your own role" : ""}
                          >
                            <option value="ADMIN">ADMIN</option>
                            <option value="STANDARD">STANDARD</option>
                            <option value="READ_ONLY">READ_ONLY</option>
                          </select>
                        </td>

                        <td style={{ fontWeight: 800 }}>{u.status || "—"}</td>
                        <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "—"}</td>
                        <td>{u.createdAt ? new Date(u.createdAt).toLocaleString() : "—"}</td>

                        <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            className="btn"
                            type="button"
                            onClick={async () => {
                              const pw = prompt("New password (min 4 chars):");
                              if (!pw) return;
                              const initials = prompt("Enter initials (2–3 letters) to confirm:");
                              if (!initials) return;

                              try {
                                await api.resetUserPassword(u.id, pw.trim());
                                alert("Password reset.");
                                await refreshAudit(auditTake);
                              } catch (e) {
                                alert(e.message || "Failed to reset password");
                              }
                            }}
                            disabled={!isAdmin || u.id === user?.id}
                            title={u.id === user?.id ? "You cannot reset your own password here" : ""}
                          >
                            Reset PW
                          </button>

                          <button
                            className={`btn ${u.status === "ACTIVE" ? "danger" : "primary"}`}
                            type="button"
                            onClick={async () => {
                              const initials = prompt("Enter initials (2–3 letters) to confirm:");
                              if (!initials) return;

                              try {
                                const nextStatus = u.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
                                await api.setUserStatus(u.id, nextStatus, initials.trim().toUpperCase());
                                await refreshUsers();
                                await refreshAudit(auditTake);
                              } catch (e) {
                                alert(e.message || "Failed to update user status");
                              }
                            }}
                            disabled={u.id === user?.id}
                            title={u.id === user?.id ? "You cannot disable yourself" : ""}
                          >
                            {u.status === "ACTIVE" ? "Disable" : "Enable"}
                          </button>

                          <button
                            className="btn danger"
                            type="button"
                            onClick={async () => {
                              if (u.id === user?.id) return;
                              const initials = prompt("Enter initials (2–3 letters) to confirm DELETE:");
                              if (!initials) return;

                              const ok = window.confirm(`Delete user '${u.username}'? This will disable the account.`);
                              if (!ok) return;

                              try {
                                await api.deleteUser(u.id, initials.trim().toUpperCase());
                                await refreshUsers();
                                await refreshAudit(auditTake);
                              } catch (e) {
                                alert(e.message || "Failed to delete user");
                              }
                            }}
                            disabled={u.id === user?.id}
                            title={u.id === user?.id ? "You cannot delete yourself" : ""}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* AUDIT */}
      {section === "audit" && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="h2">Audit Log</div>
              <div style={{ color: "var(--muted)", fontWeight: 700 }}>Admin-only history (most recent first)</div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setAuditTake(AUDIT_STEP);
                  refreshAudit(AUDIT_STEP);
                }}
              >
                Refresh
              </button>
              <button
                className="btn outline"
                type="button"
                onClick={() => {
                  const next = Math.min(auditTake + AUDIT_STEP, AUDIT_MAX);
                  setAuditTake(next);
                  refreshAudit(next);
                }}
                disabled={auditTake >= AUDIT_MAX}
              >
                Load More
              </button>
              <button
                className="btn outline"
                type="button"
                onClick={() => {
                  setAuditTake(AUDIT_MAX);
                  refreshAudit(AUDIT_MAX);
                }}
                disabled={auditTake >= AUDIT_MAX}
              >
                View All
              </button>
            </div>
          </div>

          {!isAdmin ? (
            <div style={{ marginTop: 10, color: "var(--muted)", fontWeight: 800 }}>You are not an admin.</div>
          ) : auditErr ? (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid var(--red)", color: "var(--red)", fontWeight: 800 }}>
              {auditErr}
            </div>
          ) : (
            <table className="table" style={{ marginTop: 14 }}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Target</th>
                  <th>Initials</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLoading ? (
                  <tr>
                    <td colSpan={6}>Loading…</td>
                  </tr>
                ) : auditRows.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No audit rows.</td>
                  </tr>
                ) : (
                  auditRows.map((r) => (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}</td>
                      <td style={{ fontWeight: 900 }}>{r.action}</td>
                      <td style={{ fontWeight: 800 }}>{r.actor?.displayName || r.actor?.username || "—"}</td>
                      <td style={{ fontWeight: 800 }}>{r.target?.displayName || r.target?.username || r.targetUserId || "—"}</td>
                      <td>{r.initials || "—"}</td>
                      <td style={{ color: "var(--muted)", fontWeight: 700 }}>{r.details || ""}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* PRODUCTS */}
      {section === "products" && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div className="h2">Products</div>
              <div style={{ color: "var(--muted)", fontWeight: 700 }}>Active: {activeCount} / {products.length}</div>
            </div>
            <button className="btn" onClick={refreshProducts} type="button">
              Refresh
            </button>
          </div>

          {productsErr && (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid var(--red)", color: "var(--red)", fontWeight: 800 }}>
              {productsErr}
            </div>
          )}

          <form onSubmit={onCreateProduct} style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <input className="input" placeholder="Product name" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="input" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: 140 }} />
            <button className="btn primary" type="submit">
              Add Product
            </button>
          </form>

          <table className="table" style={{ marginTop: 14 }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Price</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {productsLoading ? (
                <tr>
                  <td colSpan={4}>Loading…</td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={4}>No products yet.</td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id} style={{ opacity: p.status === "DISABLED" ? 0.6 : 1 }}>
                    <td>
                      {editingId === p.id ? (
                        <input className="input" value={editingName} onChange={(e) => setEditingName(e.target.value)} />
                      ) : (
                        <strong>{p.name}</strong>
                      )}
                    </td>

                    <td>
                      {editingId === p.id ? (
                        <input className="input" value={editingPrice} onChange={(e) => setEditingPrice(e.target.value)} style={{ width: 120 }} />
                      ) : (
                        `$${Number(p.price).toFixed(2)}`
                      )}
                    </td>

                    <td>{p.status}</td>

                    <td>
                      {editingId === p.id ? (
                        <>
                          <button className="btn primary" onClick={() => saveEdit(p)} type="button">
                            Save
                          </button>
                          <button className="btn" onClick={cancelEdit} type="button">
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="btn" onClick={() => startEdit(p)} type="button">
                            Edit
                          </button>
                          <button className="btn danger" onClick={() => toggleStatus(p)} type="button">
                            {p.status === "ACTIVE" ? "Disable" : "Enable"}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* CUSTOMERS */}
      {section === "customers" && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="h2">Customers</div>
              <div style={{ color: "var(--muted)", fontWeight: 700 }}>Archive customers from the system</div>
            </div>
            <button className="btn" type="button" onClick={refreshCustomers}>
              Refresh
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
            <input className="input" placeholder="Search customers…" value={customerQ} onChange={(e) => setCustomerQ(e.target.value)} style={{ minWidth: 280 }} />
            <button className="btn outline" type="button" onClick={refreshCustomers}>
              Search
            </button>
          </div>

          {customersErr && (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid var(--red)", color: "var(--red)", fontWeight: 800 }}>
              {customersErr}
            </div>
          )}

          <table className="table" style={{ marginTop: 14 }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Shipping Address</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customersLoading ? (
                <tr>
                  <td colSpan={5}>Loading…</td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ color: "var(--muted)" }}>No customers.</td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 900 }}>{c.name}</td>
                    <td>{c.phone || "—"}</td>
                    <td>{c.email || "—"}</td>
                    <td style={{ maxWidth: 460 }}>{c.shippingAddress || "—"}</td>
                    <td>
                      <button
                        className="btn danger"
                        type="button"
                        onClick={async () => {
                          const initials = prompt("Enter initials (2–3 letters) to archive this customer:");
                          if (!initials) return;

                          const ok = window.confirm(`Archive customer '${c.name}'?`);
                          if (!ok) return;

                          try {
                            await api.archiveCustomer(c.id, initials.trim().toUpperCase());
                            await refreshCustomers();
                            await refreshAudit(auditTake);
                          } catch (e) {
                            alert(e.message || "Failed to archive customer");
                          }
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* BRANDING */}
      {section === "branding" && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="h2">Branding</div>
              <div style={{ color: "var(--muted)", fontWeight: 700 }}>Upload logo + set company name</div>
            </div>
            <button className="btn" type="button" onClick={refreshBranding}>
              Refresh
            </button>
          </div>

          {!isAdmin ? (
            <div style={{ marginTop: 10, color: "var(--muted)", fontWeight: 800 }}>You are not an admin.</div>
          ) : brandingErr ? (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid var(--red)", color: "var(--red)", fontWeight: 800 }}>
              {brandingErr}
            </div>
          ) : (
            <>
              {brandingLoading ? (
                <div style={{ marginTop: 14, color: "var(--muted)", fontWeight: 800 }}>Loading…</div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 14, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ minWidth: 320 }}>
                      <div style={{ fontWeight: 900, marginBottom: 6 }}>Company name (optional)</div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <input className="input" value={companyNameDraft} onChange={(e) => setCompanyNameDraft(e.target.value)} placeholder="Your company name" />
                        <button className="btn primary" type="button" onClick={saveCompanyName}>
                          Save
                        </button>
                      </div>
                    </div>

                    <div style={{ minWidth: 360 }}>
                      <div style={{ fontWeight: 900, marginBottom: 6 }}>Logo</div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        <input
                          className="input"
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                          style={{ width: 260 }}
                        />
                        <button className="btn primary" type="button" onClick={uploadLogo}>
                          Upload
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 900, marginBottom: 8 }}>Preview</div>
                    <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 14, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                      {branding.logoUrl ? (
                        <img
                          src={branding.logoUrl}
                          alt="Logo"
                          style={{ maxHeight: 120, maxWidth: 420, width: "auto", height: "auto", objectFit: "contain" }}
                        />
                      ) : (
                        <div style={{ width: 120, height: 60, borderRadius: 14, background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "var(--muted)" }}>
                          No Logo
                        </div>
                      )}
                      <div>
                        <div style={{ fontWeight: 900 }}>Sticks Work Center</div>
                        <div style={{ color: "var(--muted)", fontWeight: 800 }}>{branding.companyName || "(no company name set)"}</div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* EXPORTS */}
      {section === "exports" && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="h2">Exports</div>
          <div style={{ color: "var(--muted)", fontWeight: 700, marginTop: 6 }}>Download a list of completed orders (CSV)</div>

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn primary" type="button" onClick={downloadCompletedCsv}>
              Download Completed Orders CSV
            </button>
          </div>

          <div style={{ marginTop: 10, color: "var(--muted)", fontWeight: 700 }}>
            CSV columns: Order #, Customer, Finished date, Created date, Products, Total.
          </div>
        </div>
      )}
    </AppShell>
  );
}
