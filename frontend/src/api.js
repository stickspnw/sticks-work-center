// frontend/src/api.js

const API_BASE = "/api";



// -----------------------
// Auth helpers
// -----------------------
export function getToken() {
  return localStorage.getItem("swc_token") || "";
}

export function setAuth(auth) {
  if (auth?.token) localStorage.setItem("swc_token", auth.token);
  if (auth?.user) localStorage.setItem("swc_user", JSON.stringify(auth.user));
}

export function clearAuth() {
  localStorage.removeItem("swc_token");
  localStorage.removeItem("swc_user");
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem("swc_user") || "null");
  } catch {
    return null;
  }
}

// -----------------------
// Core request helper
// -----------------------
async function request(path, { method = "GET", body } = {}) {
  const token = getToken();

  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = data && data.error ? data.error : typeof data === "string" ? data : "Request failed";
    throw new Error(msg);
  }
  return data;
}

// -----------------------
// Search
// -----------------------
export async function searchOrders(q) {
  return request(`/search?q=${encodeURIComponent(q)}`);
}

// -----------------------
// Downloads (fetch -> blob)
// -----------------------
export async function downloadOrderPdf(orderId, filename = "work-order.pdf") {
  const token = getToken();
  if (!token) throw new Error("Missing login token. Please refresh and log in again.");

  const res = await fetch(`${API_BASE}/orders/${orderId}/pdf`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || "Failed to download PDF");
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.URL.revokeObjectURL(url);
}

// IMPORTANT: backend export route is POST /api/orders/export/completed (with {initials})
export async function downloadCompletedOrdersCsv(initials, filename = "completed-orders.csv") {
  const token = getToken();
  if (!token) throw new Error("Missing login token. Please refresh and log in again.");

  const res = await fetch(`${API_BASE}/orders/export/completed`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ initials }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || "Failed to download export");
  }

  const blob = await res.blob();
  if (!blob || blob.size === 0) throw new Error("Export returned an empty file (0 bytes).");

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// -----------------------
// API object used by pages
// -----------------------
export const api = {
  // health/auth
  health: () => request("/health"),
  login: (username, password) => request("/auth/login", { method: "POST", body: { username, password } }),

  // audit
  audit: (take = 50) => request(`/audit?take=${encodeURIComponent(take)}`),

  // -----------------------
  // Branding / Settings
  // -----------------------
  brandingGet: () => request("/settings/branding"),

  // Decal page button toggles (admin-controlled visibility on Cut Vinyl + Printed Decals)
  getDecalPageToggles: () => request("/settings/decal-page-toggles"),
  setDecalPageToggles: (toggles) => request("/settings/decal-page-toggles", { method: "PUT", body: toggles }),

  // Storefront pricing (min order price + flat-rate shipping fee)
  getStorefrontPricing: () => request("/settings/storefront-pricing"),
  setStorefrontPricing: (payload) => request("/settings/storefront-pricing", { method: "PUT", body: payload }),

  brandingSetCompanyName: (companyName, initials) =>
    request("/settings/branding/company-name", {
      method: "POST",
      body: { companyName, initials },
    }),

  brandingUploadLogo: async (file, initials) => {
    const token = getToken();
    if (!token) throw new Error("Missing login token. Please refresh and log in again.");

    const fd = new FormData();
    fd.append("logo", file);
    fd.append("initials", initials);

    const res = await fetch(`${API_BASE}/settings/branding/logo`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });

    const isJson = (res.headers.get("content-type") || "").includes("application/json");
    const data = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      const msg = data && data.error ? data.error : typeof data === "string" ? data : "Upload failed";
      throw new Error(msg);
    }
    return data;
  },

  // -----------------------
  // Exports
  // -----------------------
  downloadCompletedOrdersCsv: (initials) => downloadCompletedOrdersCsv(initials),

  // users
  users: () => request("/users"),
  createUser: ({ username, password, role, displayName }) =>
    request("/users", { method: "POST", body: { username, password, role, displayName } }),
  setUserStatus: (id, status, initials) => request(`/users/${id}/status`, { method: "PATCH", body: { status, initials } }),
  setUserRole: (id, role, initials) => request(`/users/${id}/role`, { method: "PATCH", body: { role, initials } }),
  resetUserPassword: (id, password) => request(`/users/${id}/reset-password`, { method: "POST", body: { password } }),
  deleteUser: (id, initials) => request(`/users/${id}`, { method: "DELETE", body: { initials } }),

  // customers
  customers: (q = "") => request(`/customers?q=${encodeURIComponent(q)}`),
  createCustomer: (payload) => request("/customers", { method: "POST", body: payload }),
  archiveCustomer: (id, initials) => request(`/customers/${id}/archive`, { method: "POST", body: { initials } }),

  // products
  products: () => request("/products?active=true"),
  createProduct: (payload) => request("/products", { method: "POST", body: payload }),
  updateProduct: (id, payload) => request(`/products/${id}`, { method: "PUT", body: payload }),
  setProductStatus: (id, status) => request(`/products/${id}/status`, { method: "PATCH", body: { status } }),

  // orders
  ordersByStatus: (status) => request(`/orders?status=${encodeURIComponent(status)}`),
  orderDetail: (id) => request(`/orders/${id}`),
  createOrder: (payload) => request("/orders", { method: "POST", body: payload }),
  completeOrder: (id, initials) => request(`/orders/${id}/complete`, { method: "POST", body: { initials } }),
  deleteOrder: (id, initials) => request(`/orders/${id}/delete`, { method: "PATCH", body: { initials } }),

  // proofs (image uploads stored on disk per order)
  listProofs: (orderId) => request(`/orders/${orderId}/proofs`),
  proofFileUrl: (orderId, proofId) => `${API_BASE}/orders/${orderId}/proofs/${proofId}/file`,
  uploadProof: async (orderId, file, initials) => {
    const token = getToken();
    if (!token) throw new Error("Missing login token. Please refresh and log in again.");
    const fd = new FormData();
    fd.append("file", file);
    if (initials) fd.append("initials", initials);
    const res = await fetch(`${API_BASE}/orders/${orderId}/proofs`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const isJson = (res.headers.get("content-type") || "").includes("application/json");
    const data = isJson ? await res.json() : await res.text();
    if (!res.ok) throw new Error((data && data.error) || (typeof data === "string" ? data : "Upload failed"));
    return data;
  },
  deleteProof: (orderId, proofId) => request(`/orders/${orderId}/proofs/${proofId}`, { method: "DELETE" }),

  // attachments
  listAttachments: (orderId) => request(`/orders/${orderId}/attachments`),
  createAttachment: (orderId, { label, googleUrl, initials, note }) =>
    request(`/orders/${orderId}/attachments`, { method: "POST", body: { label, googleUrl, initials, note: note ?? null } }),
  addAttachmentVersion: (orderId, attachmentId, { googleUrl, initials, note }) =>
    request(`/orders/${orderId}/attachments/${attachmentId}/versions`, { method: "POST", body: { googleUrl, initials, note: note ?? null } }),
  archiveAttachment: (orderId, attachmentId, initials) =>
    request(`/orders/${orderId}/attachments/${attachmentId}/archive`, { method: "POST", body: { initials } }),

  // vinyl colors
  vinylColors: (includeInactive = false) =>
    request(`/vinyl/colors${includeInactive ? "?includeInactive=true" : ""}`),
  createVinylColor: (payload) => request("/vinyl/colors", { method: "POST", body: payload }),
  updateVinylColor: (id, payload) => request(`/vinyl/colors/${id}`, { method: "PUT", body: payload }),
  deleteVinylColor: (id) => request(`/vinyl/colors/${id}`, { method: "DELETE" }),

  // vinyl products
  vinylProducts: () => request("/vinyl/products"),
  createVinylProduct: (payload) => request("/vinyl/products", { method: "POST", body: payload }),
  updateVinylProduct: (id, payload) => request(`/vinyl/products/${id}`, { method: "PUT", body: payload }),
  deleteVinylProduct: (id) => request(`/vinyl/products/${id}`, { method: "DELETE" }),

  // printed decal pricing
  printedDecalPricing: () => request("/vinyl/pricing"),
  updatePrintedDecalPricing: (pricePerSqInch) => request("/vinyl/pricing", { method: "PUT", body: { pricePerSqInch } }),

  // transfer tape pricing
  getTransferTapePrice: () => request("/vinyl/transfer-tape-price"),
  updateTransferTapePrice: (pricePerSqFt) => request("/vinyl/transfer-tape-price", { method: "PUT", body: { pricePerSqFt: Number(pricePerSqFt) } }),

  // decal file generation
  generateCutVinylFile: async (payload) => {
    const res = await fetch(`${API_BASE}/decal-files/cut-vinyl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || "Failed to generate cut file");
    }
    const blob = await res.blob();
    // Extract filename from Content-Disposition header
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^";\n]+)"?/);
    const filename = match ? match[1] : "cut-file.pdf";
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  generateCutVinylMulti: async (payload) => {
    const res = await fetch(`${API_BASE}/decal-files/cut-vinyl-multi`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || "Failed to generate combined cut file");
    }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^";\n]+)"?/);
    const filename = match ? match[1] : "cut-file.pdf";
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  generatePrintedDecalFile: async (payload) => {
    const res = await fetch(`${API_BASE}/decal-files/printed-decal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || "Failed to generate print file");
    }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^";\n]+)"?/);
    const filename = match ? match[1] : "print-file.pdf";
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  generateQuote: async (payload) => {
    const res = await fetch(`${API_BASE}/decal-files/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || "Failed to generate quote");
    }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^";\n]+)"?/);
    const filename = match ? match[1] : "quote.pdf";
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
};

export function canWrite(user) {
  if (!user) return false;
  return user.role === "ADMIN" || user.role === "STANDARD";
}
