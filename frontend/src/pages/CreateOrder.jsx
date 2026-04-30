import React, { useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell.jsx";
import { api } from "../api.js";

function newLine() {
  return {
    rowId: crypto.randomUUID(),
    productId: "",
    qty: 1,
    catalogPrice: 0,
    overrideOn: false,
    overridePrice: 0,
    sized: false,
    widthIn: "",
    heightIn: "",
  };
}

function newSizedLine() {
  return {
    rowId: crypto.randomUUID(),
    productId: "",
    qty: 1,
    catalogPrice: 0, // interpreted as $/sq in for sized lines
    overrideOn: false,
    overridePrice: 0,
    sized: true,
    widthIn: "",
    heightIn: "",
  };
}

export default function CreateOrder() {
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("");

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState("");

  const [lines, setLines] = useState([newLine()]);

  const [err, setErr] = useState("");
  const [created, setCreated] = useState(null);

  // Load customers
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.customers("");
        if (!cancelled) setCustomers(data);
      } catch (e) {
        if (!cancelled) setErr(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load ACTIVE products for dropdown
  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      setProductsError("");
      setProductsLoading(true);
      try {
        // active=true already in api.products()
        const list = await api.products(true);
        if (!cancelled) setProducts(list);
      } catch (e) {
        if (!cancelled) setProductsError(e.message || "Failed to load products");
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    }

    loadProducts();
    return () => {
      cancelled = true;
    };
  }, []);

  function getProductById(id) {
    return products.find((p) => p.id === id) || null;
  }

  function updateLine(rowId, patch) {
    setLines((prev) =>
      prev.map((l) => (l.rowId === rowId ? { ...l, ...patch } : l))
    );
  }

  function removeLine(rowId) {
    setLines((prev) => prev.filter((l) => l.rowId !== rowId));
  }

  function addLine() {
    setLines((prev) => [...prev, newLine()]);
  }

  function addSizedLine() {
    setLines((prev) => [...prev, newSizedLine()]);
  }

  function unitPriceFor(l) {
    if (l.overrideOn) return Number(l.overridePrice) || 0;
    if (l.sized) {
      const w = Number(l.widthIn) || 0;
      const h = Number(l.heightIn) || 0;
      const ppsi = Number(l.catalogPrice) || 0;
      return Number((w * h * ppsi).toFixed(2));
    }
    return Number(l.catalogPrice) || 0;
  }

  const subtotal = useMemo(() => {
    return lines.reduce((sum, l) => {
      const qty = Number(l.qty) || 0;
      return sum + qty * unitPriceFor(l);
    }, 0);
  }, [lines]);

  async function create() {
    try {
      setErr("");
      setCreated(null);

      if (!customerId) return setErr("Select a customer first.");

      // Validate line items
      const cleaned = lines
        .filter((l) => l.productId) // must have a product
        .map((l) => {
          const qty = Number(l.qty);
          const overrideOn = !!l.overrideOn;
          const overridePrice = overrideOn ? Number(l.overridePrice) : null;

          if (!Number.isFinite(qty) || qty <= 0) {
            throw new Error("Each line must have a quantity of 1 or more.");
          }
          if (overrideOn && (!Number.isFinite(overridePrice) || overridePrice < 0)) {
            throw new Error("Override price must be a valid non-negative number.");
          }

          let widthIn = null;
          let heightIn = null;
          if (l.sized) {
            const w = Number(l.widthIn);
            const h = Number(l.heightIn);
            if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) {
              throw new Error("Sized decal lines need positive width and height in inches.");
            }
            widthIn = w;
            heightIn = h;
          }

          return {
            productId: l.productId,
            qty,
            overrideUnitPrice: overrideOn ? overridePrice : null,
            widthIn,
            heightIn,
          };
        });

      if (cleaned.length === 0) {
        return setErr("Add at least one product line item before creating the order.");
      }

      const order = await api.createOrder({
        customerId,
        lineItems: cleaned.map((i) => ({
          productId: i.productId,
          qty: i.qty,
          overridePrice: i.overrideUnitPrice ?? null,
          widthIn: i.widthIn,
          heightIn: i.heightIn,
        })),
      });


      setCreated(order);

      // Reset
      setLines([newLine()]);
      setCustomerId("");
    } catch (e) {
      setErr(e.message || "Failed to create order");
    }
  }

  return (
    <AppShell>
      <div className="h1">Create Order</div>
      <div className="h2">Select a customer, add products, and create a Work In Progress order</div>

      {err && <div className="notice" style={{ margin: "12px 0" }}>{err}</div>}
      {created && (
        <div className="notice" style={{ margin: "12px 0" }}>
          Created {created.orderNumber} — now in Work In Progress.
        </div>
      )}

      <div className="card">
        <div className="h2">Customer</div>

        <select
          className="input"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
        >
          <option value="">Select customer...</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <div style={{ marginTop: 14 }}>
          <div className="h2">Products</div>

          {productsLoading && (
            <div style={{ color: "var(--muted)", fontWeight: 700, marginTop: 8 }}>
              Loading products…
            </div>
          )}

          {productsError && (
            <div className="notice" style={{ marginTop: 8 }}>
              {productsError}
            </div>
          )}

          <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn" onClick={addLine}>+ Add Line</button>
            <button className="btn" onClick={addSizedLine}>+ Add Sized Decal</button>
          </div>

          <div style={{ marginTop: 10, overflowX: "auto" }}>
            <table className="table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Product</th>
                  <th style={{ textAlign: "left" }}>Qty</th>
                  <th style={{ textAlign: "left" }}>Unit Price</th>
                  <th style={{ textAlign: "left" }}>Override</th>
                  <th style={{ textAlign: "left" }}>Line Total</th>
                  <th style={{ textAlign: "left" }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {lines.map((l) => {
                  const prod = l.productId ? getProductById(l.productId) : null;
                  const qty = Number(l.qty) || 0;
                  const unit = unitPriceFor(l);
                  const total = qty * unit;
                  const sqIn = l.sized ? (Number(l.widthIn) || 0) * (Number(l.heightIn) || 0) : 0;

                  return (
                    <tr key={l.rowId}>
                      <td style={{ minWidth: 260 }}>
                        {l.sized && (
                          <div style={{ marginBottom: 4, fontWeight: 900, color: "#0a7", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
                            Sized Decal
                          </div>
                        )}
                        <select
                          className="input"
                          value={l.productId}
                          onChange={(e) => {
                            const nextId = e.target.value;
                            const p = getProductById(nextId);
                            updateLine(l.rowId, {
                              productId: nextId,
                              catalogPrice: p ? Number(p.price) : 0,
                              // if override was on, keep it as-is, otherwise follow catalog
                              overridePrice: l.overrideOn ? l.overridePrice : (p ? Number(p.price) : 0),
                            });
                          }}
                        >
                          <option value="">Select product…</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (${Number(p.price).toFixed(2)}{l.sized ? "/sq in" : ""})
                            </option>
                          ))}
                        </select>
                        {prod ? (
                          <div style={{ marginTop: 4, color: "var(--muted)", fontWeight: 700, fontSize: 12 }}>
                            Catalog: ${Number(prod.price).toFixed(2)}{l.sized ? "/sq in" : ""}
                          </div>
                        ) : null}
                        {l.sized && (
                          <div style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
                            <input
                              className="input"
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="W (in)"
                              value={l.widthIn}
                              onChange={(e) => updateLine(l.rowId, { widthIn: e.target.value })}
                              style={{ width: 80 }}
                            />
                            <span style={{ fontWeight: 900 }}>×</span>
                            <input
                              className="input"
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="H (in)"
                              value={l.heightIn}
                              onChange={(e) => updateLine(l.rowId, { heightIn: e.target.value })}
                              style={{ width: 80 }}
                            />
                            <span style={{ fontWeight: 700, fontSize: 12, color: "var(--muted)" }}>
                              = {sqIn ? sqIn.toFixed(2) : "0.00"} sq in
                            </span>
                          </div>
                        )}
                      </td>

                      <td style={{ width: 120 }}>
                        <input
                          className="input"
                          value={l.qty}
                          onChange={(e) => updateLine(l.rowId, { qty: e.target.value })}
                          style={{ width: 90 }}
                        />
                      </td>

                      <td style={{ width: 140, fontWeight: 900 }}>
                        ${Number(unit).toFixed(2)}
                      </td>

                      <td style={{ minWidth: 220 }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 800 }}>
                            <input
                              type="checkbox"
                              checked={l.overrideOn}
                              onChange={(e) => {
                                const on = e.target.checked;
                                updateLine(l.rowId, {
                                  overrideOn: on,
                                  overridePrice: on ? (Number(l.overridePrice) || Number(l.catalogPrice) || 0) : 0,
                                });
                              }}
                            />
                            Override
                          </label>

                          {l.overrideOn ? (
                            <input
                              className="input"
                              value={l.overridePrice}
                              onChange={(e) => updateLine(l.rowId, { overridePrice: e.target.value })}
                              style={{ width: 110 }}
                              placeholder="Override $"
                            />
                          ) : (
                            <span style={{ color: "var(--muted)", fontWeight: 700, fontSize: 12 }}>
                              —
                            </span>
                          )}
                        </div>
                      </td>

                      <td style={{ width: 140, fontWeight: 900 }}>
                        ${Number(total).toFixed(2)}
                      </td>

                      <td style={{ width: 120 }}>
                        <button
                          className="btn danger"
                          type="button"
                          onClick={() => removeLine(l.rowId)}
                          disabled={lines.length === 1}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>
                Subtotal: ${Number(subtotal).toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn primary" onClick={create}>
            Create Order
          </button>
        </div>

        
      </div>
    </AppShell>
  );
}
