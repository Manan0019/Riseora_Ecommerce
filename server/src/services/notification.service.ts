import { env } from "../config/env";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value: unknown) { return `₹${Number(value || 0).toFixed(0)}`; }

type OrderEmailShape = {
  orderNumber: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string;
  totalAmount: unknown;
  paymentMethod: string;
  status: string;
  shipment?: { carrier?: string | null; trackingNumber?: string | null; trackingUrl?: string | null } | null;
};

async function send(input: { to: string; subject: string; html: string; idempotencyKey?: string }) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [input.to], subject: input.subject, html: input.html }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Email delivery failed (${response.status}) ${body.slice(0, 300)}`);
  }
}

export async function sendOrderPlacedNotifications(order: OrderEmailShape) {
  const tasks: Promise<unknown>[] = [];
  if (order.customerEmail) {
    tasks.push(send({
      to: order.customerEmail,
      subject: `Riseora order ${order.orderNumber} received`,
      idempotencyKey: `order-placed/${order.orderNumber}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#173326"><h2>Thank you, ${escapeHtml(order.customerName)}.</h2><p>Your Riseora order <strong>${escapeHtml(order.orderNumber)}</strong> has been received.</p><p><strong>Total:</strong> ${money(order.totalAmount)}<br/><strong>Payment:</strong> ${escapeHtml(order.paymentMethod)}</p><p>We will email you again as the order moves forward.</p></div>`,
    }));
  }
  if (env.ADMIN_NOTIFICATION_EMAIL) {
    tasks.push(send({
      to: env.ADMIN_NOTIFICATION_EMAIL,
      subject: `New Riseora order ${order.orderNumber}`,
      idempotencyKey: `admin-order-placed/${order.orderNumber}`,
      html: `<div style="font-family:Arial,sans-serif"><h2>New order</h2><p><strong>${escapeHtml(order.orderNumber)}</strong></p><p>${escapeHtml(order.customerName)} · ${escapeHtml(order.customerPhone)} · ${money(order.totalAmount)}</p></div>`,
    }));
  }
  await Promise.allSettled(tasks);
}

export async function sendOrderStatusNotification(order: OrderEmailShape) {
  if (!order.customerEmail) return;
  const tracking = order.shipment?.trackingNumber
    ? `<p><strong>Courier:</strong> ${escapeHtml(order.shipment.carrier || "Courier")}<br/><strong>Tracking:</strong> ${escapeHtml(order.shipment.trackingNumber)}${order.shipment.trackingUrl ? `<br/><a href="${escapeHtml(order.shipment.trackingUrl)}">Track shipment</a>` : ""}</p>`
    : "";
  await send({
    to: order.customerEmail,
    subject: `Riseora order ${order.orderNumber}: ${order.status}`,
    idempotencyKey: `order-status/${order.orderNumber}/${order.status}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#173326"><h2>Order update</h2><p>Your order <strong>${escapeHtml(order.orderNumber)}</strong> is now <strong>${escapeHtml(order.status)}</strong>.</p>${tracking}<p>Total: ${money(order.totalAmount)}</p></div>`,
  });
}

type ReturnEmailShape = {
  returnNumber: string;
  status: string;
  refundAmount: unknown;
  reason?: string | null;
  reverseCarrier?: string | null;
  reverseTrackingNumber?: string | null;
  reverseTrackingUrl?: string | null;
  order?: { orderNumber?: string | null; customerEmail?: string | null } | null;
  user?: { email?: string | null; firstName?: string | null } | null;
};

export async function sendReturnStatusNotification(request: ReturnEmailShape) {
  const email = request.user?.email || request.order?.customerEmail || null;
  if (!email) return;
  const tracking = request.reverseTrackingNumber
    ? `<p><strong>Return courier:</strong> ${escapeHtml(request.reverseCarrier || "Courier")}<br/><strong>Tracking:</strong> ${escapeHtml(request.reverseTrackingNumber)}${request.reverseTrackingUrl ? `<br/><a href="${escapeHtml(request.reverseTrackingUrl)}">Track return pickup</a>` : ""}</p>`
    : "";
  await send({
    to: email,
    subject: `Riseora return ${request.returnNumber}: ${request.status}`,
    idempotencyKey: `return-status/${request.returnNumber}/${request.status}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#173326"><h2>Return update</h2><p>Your return <strong>${escapeHtml(request.returnNumber)}</strong>${request.order?.orderNumber ? ` for order <strong>${escapeHtml(request.order.orderNumber)}</strong>` : ""} is now <strong>${escapeHtml(request.status)}</strong>.</p>${tracking}<p>Expected refund value: ${money(request.refundAmount)}</p></div>`,
  });
}

export async function sendBackInStockNotification(input: {
  email: string;
  name?: string | null;
  productName: string;
  productSlug: string;
  variantName: string;
}) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false;
  const base = (env.PUBLIC_SITE_URL || env.CLIENT_URL).replace(/\/$/, "");
  const url = `${base}/product/${encodeURIComponent(input.productSlug)}`;
  await send({
    to: input.email,
    subject: `${input.productName} is back in stock at Riseora`,
    idempotencyKey: `stock-alert/${input.productSlug}/${input.variantName}/${input.email}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#173326"><h2>It's back.</h2><p>${input.name ? `${escapeHtml(input.name)}, ` : ""}<strong>${escapeHtml(input.productName)}</strong> (${escapeHtml(input.variantName)}) is available again.</p><p><a href="${escapeHtml(url)}" style="display:inline-block;background:#173326;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px">Shop now</a></p><p style="color:#68776e;font-size:13px">Stock can move quickly and availability is not reserved by this notification.</p></div>`,
  });
  return true;
}

export async function sendPasswordResetEmail(input: { email: string; firstName?: string | null; resetUrl: string }) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false;
  await send({
    to: input.email,
    subject: "Reset your Riseora password",
    idempotencyKey: `password-reset/${input.email}/${input.resetUrl.slice(-24)}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#173326"><h2>Reset your password</h2><p>${input.firstName ? `${escapeHtml(input.firstName)}, ` : ""}we received a request to reset your Riseora account password.</p><p><a href="${escapeHtml(input.resetUrl)}" style="display:inline-block;background:#173326;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px">Reset password</a></p><p style="color:#68776e;font-size:13px">This link expires in 60 minutes. If you did not request a reset, you can ignore this email.</p></div>`,
  });
  return true;
}

export async function sendCartRecoveryEmail(input: {
  email: string;
  name?: string | null;
  cartToken: string;
  subtotal: unknown;
  reminderNumber: number;
  items: Array<{ productName?: string; variantName?: string; quantity?: number }>;
}) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false;
  const base = (env.PUBLIC_SITE_URL || env.CLIENT_URL).replace(/\/$/, "");
  const recoveryUrl = `${base}/recover-cart/${encodeURIComponent(input.cartToken)}`;
  const lines = input.items.slice(0, 4).map((item) => `<li>${escapeHtml(item.productName || "Riseora product")}${item.variantName ? ` · ${escapeHtml(item.variantName)}` : ""} × ${Number(item.quantity || 1)}</li>`).join("");
  await send({
    to: input.email,
    subject: input.reminderNumber > 1 ? "Your Riseora cart is still waiting" : "You left something in your Riseora cart",
    idempotencyKey: `cart-recovery/${input.cartToken}/${input.reminderNumber}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#173326"><h2>${input.name ? `${escapeHtml(input.name)}, your` : "Your"} cart is waiting.</h2><p>You asked Riseora to remind you if you left checkout before finishing.</p><ul style="padding-left:20px">${lines}</ul><p><strong>Cart value:</strong> ${money(input.subtotal)}</p><p><a href="${escapeHtml(recoveryUrl)}" style="display:inline-block;background:#173326;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px">Return to cart</a></p><p style="color:#68776e;font-size:13px">Prices and stock are checked again when you return. This reminder does not reserve products.</p></div>`,
  });
  return true;
}
