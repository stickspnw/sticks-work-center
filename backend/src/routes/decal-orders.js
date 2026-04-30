import { Router } from "express";
import Stripe from "stripe";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { nextOrderNumber } from "../lib/orderNumber.js";
import { saveProofFromDataUrl } from "../lib/proofs.js";

// Load storefront pricing (min order + flat-rate shipping). Returns sane
// defaults if the setting row is missing or malformed.
async function loadStorefrontPricing(prisma) {
  const defaults = { minOrderPrice: 9.99, shippingFlatFee: 0 };
  try {
    const row = await prisma.setting.findUnique({ where: { key: "storefront_pricing" } });
    if (!row?.value) return defaults;
    const parsed = JSON.parse(row.value);
    return {
      minOrderPrice: Number.isFinite(Number(parsed.minOrderPrice)) ? Number(parsed.minOrderPrice) : defaults.minOrderPrice,
      shippingFlatFee: Number.isFinite(Number(parsed.shippingFlatFee)) ? Number(parsed.shippingFlatFee) : defaults.shippingFlatFee,
    };
  } catch {
    return defaults;
  }
}

// Returns { itemsSubtotal, minBumpedSubtotal, shippingFee, finalTotal, minBumpApplied }
function applyStorefrontPricing(itemsSubtotal, pricing) {
  const sub = Math.max(0, Number(itemsSubtotal) || 0);
  const minBumped = Math.max(sub, pricing.minOrderPrice);
  const shippingFee = Math.max(0, Number(pricing.shippingFlatFee) || 0);
  const finalTotal = Number((minBumped + shippingFee).toFixed(2));
  return {
    itemsSubtotal: Number(sub.toFixed(2)),
    minBumpedSubtotal: Number(minBumped.toFixed(2)),
    shippingFee: Number(shippingFee.toFixed(2)),
    finalTotal,
    minBumpApplied: minBumped > sub,
  };
}

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Stripe with environment variable (if available)
let stripeInstance = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);
}

// POST /api/decal-orders/checkout
// Body: {
//   customer: { name, email?, phone?, shippingAddress? },
//   pricing: { unitPrice, totalPrice, qty },
//   description?: string,            // line item description / snapshot
//   stripePaymentMethodId?: string,  // (future) for Stripe-confirmed payments
// }
//
// Effects:
//   - Stripe payment (if configured), else simulated success
//   - Find/create Customer in the WC database
//   - Create a real Order (status=WIP) with a single descriptive line item
//   - Add an ORDER_PAID history entry
//   - Returns { orderId, orderNumber, total, simulated }
router.post("/checkout", async (req, res) => {
  try {
    const prisma = req.prisma;
    const body = req.body || {};
    const customerInput = body.customer || {};
    const pricing = body.pricing || {};
    const description = String(body.description || "Online Decal Order").slice(0, 240);
    const previewImage = body.previewImage && typeof body.previewImage === "string" ? body.previewImage : null;

    const name = String(customerInput.name || "").trim();
    if (!name) return res.status(400).json({ error: "Customer name is required" });

    const email = customerInput.email ? String(customerInput.email).trim() : null;
    const phone = customerInput.phone ? String(customerInput.phone).trim() : null;
    const shippingAddress = String(customerInput.shippingAddress || customerInput.address || "Online order").trim() || "Online order";

    const qty = Math.max(1, parseInt(pricing.qty, 10) || 1);
    const unitPrice = Number(pricing.unitPrice || 0);
    const totalPrice = Number(pricing.totalPrice || (unitPrice * qty));

    if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
      return res.status(400).json({ error: "Invalid total price" });
    }

    // ---- Apply storefront pricing (min order + flat-rate shipping) ----
    const storefront = await loadStorefrontPricing(prisma);
    const breakdown = applyStorefrontPricing(totalPrice, storefront);
    const chargedTotal = breakdown.finalTotal;

    // ---- Stripe payment (if configured) -------------------------------
    let simulated = true;
    let paymentIntentId = null;
    if (stripeInstance) {
      try {
        const intent = await stripeInstance.paymentIntents.create({
          amount: Math.round(chargedTotal * 100),
          currency: "usd",
          automatic_payment_methods: { enabled: true },
          metadata: { source: "decal-configurator", customerName: name, customerEmail: email || "" },
        });
        paymentIntentId = intent.id;
        // We accept the intent here as the "payment hook"; in a real flow the
        // browser would confirm via Stripe Elements before this point.
        simulated = false;
      } catch (e) {
        console.error("Stripe error:", e?.message || e);
        return res.status(502).json({ error: "Payment processing failed: " + (e?.message || "Stripe error") });
      }
    }

    // ---- Find or create Customer --------------------------------------
    let customer = null;
    if (email) {
      customer = await prisma.customer.findFirst({ where: { email, isArchived: false } });
    }
    if (!customer && phone) {
      customer = await prisma.customer.findFirst({ where: { phone, isArchived: false } });
    }
    if (!customer) {
      customer = await prisma.customer.create({
        data: { name, email, phone, shippingAddress },
      });
    } else {
      // Update missing fields if customer exists but lacks data
      const patch = {};
      if (!customer.shippingAddress && shippingAddress) patch.shippingAddress = shippingAddress;
      if (!customer.phone && phone) patch.phone = phone;
      if (!customer.email && email) patch.email = email;
      if (Object.keys(patch).length) {
        customer = await prisma.customer.update({ where: { id: customer.id }, data: patch });
      }
    }

    // ---- Create Order with a descriptive line item plus min/shipping ----
    const lineItemsToCreate = [
      {
        productId: "decal-cut-vinyl",
        productNameSnapshot: description,
        catalogUnitPriceSnapshot: unitPrice,
        unitPriceFinal: unitPrice,
        qty,
        lineTotal: Number((unitPrice * qty).toFixed(2)),
        isPriceOverridden: false,
      },
    ];
    if (breakdown.minBumpApplied) {
      const bumpAmount = Number((breakdown.minBumpedSubtotal - breakdown.itemsSubtotal).toFixed(2));
      lineItemsToCreate.push({
        productId: "min-order-adjustment",
        productNameSnapshot: `Order Minimum Adjustment ($${storefront.minOrderPrice.toFixed(2)} min)`,
        catalogUnitPriceSnapshot: bumpAmount,
        unitPriceFinal: bumpAmount,
        qty: 1,
        lineTotal: bumpAmount,
        isPriceOverridden: false,
      });
    }
    if (breakdown.shippingFee > 0) {
      lineItemsToCreate.push({
        productId: "shipping",
        productNameSnapshot: "Shipping",
        catalogUnitPriceSnapshot: breakdown.shippingFee,
        unitPriceFinal: breakdown.shippingFee,
        qty: 1,
        lineTotal: breakdown.shippingFee,
        isPriceOverridden: false,
      });
    }

    const orderNumber = await nextOrderNumber(prisma);
    const created = await prisma.order.create({
      data: {
        orderNumber,
        status: "WIP",
        customerId: customer.id,
        customerNameSnapshot: customer.name,
        customerPhoneSnapshot: customer.phone,
        customerEmailSnapshot: customer.email,
        customerShippingAddressSnapshot: customer.shippingAddress,
        lineItems: { create: lineItemsToCreate },
        history: {
          create: [
            {
              eventType: "ORDER_CREATED",
              summary: simulated
                ? "Order created via Decal Configurator (simulated payment)"
                : "Order created via Decal Configurator",
              detailsJson: { customerId: customer.id, paymentIntentId, breakdown },
            },
            {
              eventType: "ORDER_PAID",
              summary: `Payment received: $${chargedTotal.toFixed(2)}${simulated ? " (simulated)" : ""}`,
              detailsJson: { chargedTotal, breakdown, paymentIntentId, simulated },
            },
          ],
        },
      },
      include: { lineItems: true },
    });

    // Attach the preview snapshot as a proof so it appears on the work order PDF
    if (previewImage) {
      try {
        await saveProofFromDataUrl(prisma, created.id, previewImage, {
          filename: `${created.orderNumber}_preview.png`,
          eventSummary: "Decal preview attached at order creation",
        });
      } catch (e) {
        console.warn("Failed to attach decal preview proof:", e?.message || e);
      }
    }

    res.json({
      ok: true,
      orderId: created.id,
      orderNumber: created.orderNumber,
      total: chargedTotal,
      breakdown,
      simulated,
      paymentIntentId,
    });
  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).json({ error: "Checkout failed: " + (err?.message || "unknown") });
  }
});

// ---------------- Stripe Hosted Checkout (recommended) -------------------
// Frontend flow:
//   1) POST /create-checkout-session with { customer, pricing, description, successPath }
//   2) Backend stores pending data keyed by sessionId, returns the hosted URL
//   3) Frontend redirects browser to that URL; user pays on Stripe
//   4) Stripe redirects to success_url with ?stripeSessionId={CHECKOUT_SESSION_ID}
//   5) Frontend POSTs /checkout-success { sessionId } -> backend verifies paid
//      and creates the WC Customer + Order; returns { orderId, orderNumber }

const PENDING_DIR = path.join(__dirname, "../../decal-orders/pending");

function siteOriginFromReq(req) {
  // Prefer x-forwarded-host (behind tunnel/proxy), fall back to Host header
  const proto = (req.headers["x-forwarded-proto"] || req.protocol || "https").toString();
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString();
  if (!host) return process.env.PUBLIC_SITE_URL || "http://localhost:5179";
  return `${proto}://${host}`;
}

router.post("/create-checkout-session", async (req, res) => {
  try {
    if (!stripeInstance) {
      return res.status(503).json({ error: "Stripe is not configured (missing STRIPE_SECRET_KEY)" });
    }
    const body = req.body || {};
    const customer = body.customer || {};
    const pricing = body.pricing || {};
    const description = String(body.description || "Cut Vinyl Order").slice(0, 240);
    const successPath = (body.successPath || "/decals").replace(/[^A-Za-z0-9_\-/?=&.]/g, "");
    const previewImage = body.previewImage && typeof body.previewImage === "string" ? body.previewImage : null;

    const name = String(customer.name || "").trim();
    if (!name) return res.status(400).json({ error: "Customer name is required" });
    const totalPrice = Number(pricing.totalPrice || 0);
    const qty = Math.max(1, parseInt(pricing.qty, 10) || 1);
    if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
      return res.status(400).json({ error: "Invalid total price" });
    }

    const origin = siteOriginFromReq(req);

    // Apply storefront pricing (min order + flat-rate shipping)
    const storefront = await loadStorefrontPricing(req.prisma);
    const breakdown = applyStorefrontPricing(totalPrice, storefront);

    const stripeLineItems = [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(breakdown.minBumpedSubtotal * 100),
          product_data: {
            name: description.slice(0, 120),
            description: breakdown.minBumpApplied
              ? `Quantity: ${qty} (adjusted to $${storefront.minOrderPrice.toFixed(2)} min order)`
              : `Quantity: ${qty}`,
          },
        },
      },
    ];
    if (breakdown.shippingFee > 0) {
      stripeLineItems.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(breakdown.shippingFee * 100),
          product_data: { name: "Shipping" },
        },
      });
    }

    const session = await stripeInstance.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: stripeLineItems,
      customer_email: customer.email || undefined,
      success_url: `${origin}${successPath}${successPath.includes("?") ? "&" : "?"}stripeSessionId={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${successPath}${successPath.includes("?") ? "&" : "?"}stripeCancelled=1`,
      metadata: {
        source: "decal-configurator",
        customerName: name,
        chargedTotal: String(breakdown.finalTotal),
      },
    });

    // Persist pending order data keyed by Stripe sessionId
    await fs.mkdir(PENDING_DIR, { recursive: true });
    let previewImageFile = null;
    if (previewImage) {
      // Save the preview snapshot to a sibling file so the JSON metadata
      // stays small. We'll re-attach it as a proof during /checkout-success.
      const m = previewImage.match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,(.+)$/i);
      if (m) {
        const ext = m[1].includes("jpeg") || m[1].includes("jpg") ? ".jpg" : ".png";
        previewImageFile = `${session.id}.preview${ext}`;
        await fs.writeFile(path.join(PENDING_DIR, previewImageFile), Buffer.from(m[2], "base64"));
      }
    }
    await fs.writeFile(
      path.join(PENDING_DIR, `${session.id}.json`),
      JSON.stringify(
        {
          sessionId: session.id,
          createdAt: new Date().toISOString(),
          customer,
          pricing: { ...pricing, totalPrice, qty },
          description,
          previewImageFile,
          breakdown,
          storefront,
        },
        null,
        2
      )
    );

    res.json({ ok: true, url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("create-checkout-session error:", err);
    res.status(500).json({ error: "Failed to create checkout session: " + (err?.message || "unknown") });
  }
});

router.post("/checkout-success", async (req, res) => {
  try {
    if (!stripeInstance) {
      return res.status(503).json({ error: "Stripe is not configured" });
    }
    const sessionId = String(req.body?.sessionId || "").trim();
    if (!sessionId) return res.status(400).json({ error: "sessionId is required" });

    // Verify the session is paid
    const session = await stripeInstance.checkout.sessions.retrieve(sessionId);
    if (!session) return res.status(404).json({ error: "Stripe session not found" });
    if (session.payment_status !== "paid") {
      return res.status(402).json({ error: `Payment not completed (status=${session.payment_status})` });
    }

    // Avoid double-creating an order if the same session is hit twice.
    // We use a tiny marker file alongside the pending data.
    const pendingPath = path.join(PENDING_DIR, `${sessionId}.json`);
    let pending;
    try {
      pending = JSON.parse(await fs.readFile(pendingPath, "utf8"));
    } catch (e) {
      return res.status(404).json({ error: "Pending decal order data missing for this session" });
    }
    if (pending.fulfilledOrderId) {
      // Already created an order — return the existing record
      return res.json({
        ok: true,
        orderId: pending.fulfilledOrderId,
        orderNumber: pending.fulfilledOrderNumber,
        alreadyFulfilled: true,
      });
    }

    const prisma = req.prisma;
    const customerInput = pending.customer || {};
    const description = String(pending.description || "Cut Vinyl Order").slice(0, 240);
    const totalPrice = Number(pending.pricing?.totalPrice || 0);
    const qty = Math.max(1, parseInt(pending.pricing?.qty, 10) || 1);
    const unitPrice = Number(pending.pricing?.unitPrice || (totalPrice / qty));

    const name = String(customerInput.name || "").trim() || "Decal Customer";
    const email = customerInput.email ? String(customerInput.email).trim() : null;
    const phone = customerInput.phone ? String(customerInput.phone).trim() : null;
    const shippingAddress = String(customerInput.shippingAddress || customerInput.address || "Online order").trim() || "Online order";

    // Find or create customer
    let customer = null;
    if (email) customer = await prisma.customer.findFirst({ where: { email, isArchived: false } });
    if (!customer && phone) customer = await prisma.customer.findFirst({ where: { phone, isArchived: false } });
    if (!customer) {
      customer = await prisma.customer.create({ data: { name, email, phone, shippingAddress } });
    }

    // Recompute breakdown if missing (older pending files won't have it)
    const storefront = pending.storefront || (await loadStorefrontPricing(prisma));
    const breakdown = pending.breakdown || applyStorefrontPricing(totalPrice, storefront);

    const lineItemsToCreate = [
      {
        productId: "decal-cut-vinyl",
        productNameSnapshot: description,
        catalogUnitPriceSnapshot: unitPrice,
        unitPriceFinal: unitPrice,
        qty,
        lineTotal: Number((unitPrice * qty).toFixed(2)),
        isPriceOverridden: false,
      },
    ];
    if (breakdown.minBumpApplied) {
      const bumpAmount = Number((breakdown.minBumpedSubtotal - breakdown.itemsSubtotal).toFixed(2));
      lineItemsToCreate.push({
        productId: "min-order-adjustment",
        productNameSnapshot: `Order Minimum Adjustment ($${Number(storefront.minOrderPrice).toFixed(2)} min)`,
        catalogUnitPriceSnapshot: bumpAmount,
        unitPriceFinal: bumpAmount,
        qty: 1,
        lineTotal: bumpAmount,
        isPriceOverridden: false,
      });
    }
    if (breakdown.shippingFee > 0) {
      lineItemsToCreate.push({
        productId: "shipping",
        productNameSnapshot: "Shipping",
        catalogUnitPriceSnapshot: breakdown.shippingFee,
        unitPriceFinal: breakdown.shippingFee,
        qty: 1,
        lineTotal: breakdown.shippingFee,
        isPriceOverridden: false,
      });
    }

    // Create the WC order
    const orderNumber = await nextOrderNumber(prisma);
    const created = await prisma.order.create({
      data: {
        orderNumber,
        status: "WIP",
        customerId: customer.id,
        customerNameSnapshot: customer.name,
        customerPhoneSnapshot: customer.phone,
        customerEmailSnapshot: customer.email,
        customerShippingAddressSnapshot: customer.shippingAddress,
        lineItems: { create: lineItemsToCreate },
        history: {
          create: [
            { eventType: "ORDER_CREATED", summary: "Order created via Decal Configurator (Stripe Checkout)", detailsJson: { stripeSessionId: sessionId, customerId: customer.id, breakdown } },
            { eventType: "ORDER_PAID", summary: `Payment received: $${breakdown.finalTotal.toFixed(2)} via Stripe`, detailsJson: { breakdown, stripeSessionId: sessionId, paymentIntentId: session.payment_intent || null } },
          ],
        },
      },
    });

    // Attach the saved preview snapshot as a proof so it shows on the work order PDF
    if (pending.previewImageFile) {
      try {
        const previewPath = path.join(PENDING_DIR, pending.previewImageFile);
        const buf = await fs.readFile(previewPath);
        const mime = pending.previewImageFile.toLowerCase().endsWith(".jpg") ? "image/jpeg" : "image/png";
        const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
        await saveProofFromDataUrl(prisma, created.id, dataUrl, {
          filename: `${created.orderNumber}_preview${path.extname(pending.previewImageFile)}`,
          eventSummary: "Decal preview attached at order creation (Stripe Checkout)",
        });
        try { await fs.unlink(previewPath); } catch {}
      } catch (e) {
        console.warn("Failed to attach Stripe-flow preview proof:", e?.message || e);
      }
    }

    // Mark the pending file as fulfilled to make this idempotent
    try {
      await fs.writeFile(
        pendingPath,
        JSON.stringify({ ...pending, fulfilledOrderId: created.id, fulfilledOrderNumber: created.orderNumber, fulfilledAt: new Date().toISOString() }, null, 2)
      );
    } catch {}

    res.json({ ok: true, orderId: created.id, orderNumber: created.orderNumber });
  } catch (err) {
    console.error("checkout-success error:", err);
    res.status(500).json({ error: "Failed to finalize order: " + (err?.message || "unknown") });
  }
});

// Get next decal order number
async function getNextDecalOrderNumber() {
  try {
    const ordersDir = path.join(__dirname, '../../decal-orders');
    await fs.mkdir(ordersDir, { recursive: true });
    
    const files = await fs.readdir(ordersDir);
    const orderFiles = files.filter(file => file.startsWith('decal-order-') && file.endsWith('.json'));
    
    if (orderFiles.length === 0) {
      return 1;
    }
    
    const orderNumbers = orderFiles.map(file => {
      const match = file.match(/decal-order-(\d+)\.json/);
      return match ? parseInt(match[1]) : 0;
    });
    
    return Math.max(...orderNumbers) + 1;
  } catch (error) {
    console.error('Error getting next decal order number:', error);
    return 1;
  }
}

// Generate file name based on order details
function generateFileName(orderDetails, layer, orderNumber) {
  const { config } = orderDetails;
  const colorName = config.color === 'white' ? 'WHT' : 
                   config.color === 'black' ? 'BLK' : 
                   config.color === 'red' ? 'RED' : 
                   config.color === 'blue' ? 'BLU' : 'CLR';
  
  if (config.logoMode) {
    return `Logo ${orderNumber} ${colorName}`;
  } else {
    return `Vinyl ${orderNumber} ${colorName}`;
  }
}

// Create payment intent and order
router.post('/create-payment-intent', async (req, res) => {
  try {
    const orderDetails = req.body;
    const orderNumber = await getNextDecalOrderNumber();
    
    // Create order record
    const order = {
      id: orderNumber,
      customerInfo: orderDetails.customerInfo,
      config: orderDetails.config,
      pricing: orderDetails.pricing,
      status: 'pending',
      createdAt: new Date().toISOString(),
      paymentIntentId: null
    };
    
    // Save order to file system
    const ordersDir = path.join(__dirname, '../../decal-orders');
    await fs.mkdir(ordersDir, { recursive: true });
    await fs.writeFile(
      path.join(ordersDir, `decal-order-${orderNumber}.json`),
      JSON.stringify(order, null, 2)
    );
    
    // Create Stripe payment intent if Stripe is configured
    if (stripeInstance) {
      const paymentIntent = await stripeInstance.paymentIntents.create({
        amount: Math.round(orderDetails.pricing.totalPrice * 100), // Convert to cents
        currency: 'usd',
        metadata: {
          orderId: orderNumber.toString(),
          customerEmail: orderDetails.customerInfo.email
        }
      });
      
      // Update order with payment intent ID
      order.paymentIntentId = paymentIntent.id;
      await fs.writeFile(
        path.join(ordersDir, `decal-order-${orderNumber}.json`),
        JSON.stringify(order, null, 2)
      );
      
      res.json({
        clientSecret: paymentIntent.client_secret,
        orderId: orderNumber
      });
    } else {
      // Stripe not configured - simulate successful payment
      res.json({
        clientSecret: 'simulated-success',
        orderId: orderNumber,
        simulated: true
      });
    }
    
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

// Confirm payment and update order status
router.post('/confirm-payment', async (req, res) => {
  try {
    const { paymentIntentId, orderId } = req.body;
    
    let paymentSuccessful = false;
    
    if (stripeInstance && paymentIntentId !== 'simulated-success') {
      // Retrieve payment intent from Stripe
      const paymentIntent = await stripeInstance.paymentIntents.retrieve(paymentIntentId);
      paymentSuccessful = paymentIntent.status === 'succeeded';
    } else if (paymentIntentId === 'simulated-success') {
      // Simulated payment - always successful
      paymentSuccessful = true;
    }
    
    if (paymentSuccessful) {
      // Update order status
      const ordersDir = path.join(__dirname, '../../decal-orders');
      const orderFile = path.join(ordersDir, `decal-order-${orderId}.json`);
      const orderData = await fs.readFile(orderFile, 'utf8');
      const order = JSON.parse(orderData);
      
      order.status = 'paid';
      order.paidAt = new Date().toISOString();
      
      await fs.writeFile(orderFile, JSON.stringify(order, null, 2));
      
      res.json({ success: true, order });
    } else {
      res.status(400).json({ error: 'Payment not successful' });
    }
    
  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({ error: 'Failed to confirm payment' });
  }
});

// Get order by ID
router.get('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const orderFile = path.join(__dirname, '../../decal-orders', `decal-order-${orderId}.json`);
    
    try {
      const orderData = await fs.readFile(orderFile, 'utf8');
      const order = JSON.parse(orderData);
      res.json(order);
    } catch (error) {
      if (error.code === 'ENOENT') {
        res.status(404).json({ error: 'Order not found' });
      } else {
        throw error;
      }
    }
    
  } catch (error) {
    console.error('Error getting order:', error);
    res.status(500).json({ error: 'Failed to get order' });
  }
});

// List all orders
router.get('/', async (req, res) => {
  try {
    const ordersDir = path.join(__dirname, '../../decal-orders');
    const files = await fs.readdir(ordersDir);
    const orderFiles = files.filter(file => file.startsWith('decal-order-') && file.endsWith('.json'));
    
    const orders = [];
    for (const file of orderFiles) {
      const orderData = await fs.readFile(path.join(ordersDir, file), 'utf8');
      orders.push(JSON.parse(orderData));
    }
    
    // Sort by order number (newest first)
    orders.sort((a, b) => b.id - a.id);
    
    res.json(orders);
    
  } catch (error) {
    console.error('Error listing orders:', error);
    res.status(500).json({ error: 'Failed to list orders' });
  }
});

export default router;
