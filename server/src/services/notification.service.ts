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
