import { env } from "../config/env";
import { escapeEmailHtml, moneyText, renderRiseoraEmail, sendRiseoraEmail } from "./email.service";

const baseUrl = () => (env.PUBLIC_SITE_URL || env.CLIENT_URL).replace(/\/$/, "");

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

export async function sendOrderPlacedNotifications(order: OrderEmailShape) {
  const tasks: Promise<unknown>[] = [];
  if (order.customerEmail) tasks.push(sendRiseoraEmail({
    to: order.customerEmail,
    subject: `Riseora order ${order.orderNumber} received`,
    template: "order-placed",
    idempotencyKey: `order-placed/${order.orderNumber}`,
    html: renderRiseoraEmail({ eyebrow: "ORDER RECEIVED", title: `Thank you, ${order.customerName}.`, bodyHtml: `<p>Your Riseora order <strong>${escapeEmailHtml(order.orderNumber)}</strong> has been received.</p><p><strong>Total:</strong> ${moneyText(order.totalAmount)}<br/><strong>Payment:</strong> ${escapeEmailHtml(order.paymentMethod)}</p><p>We’ll keep you updated as your order moves through preparation and delivery.</p>`, ctaLabel: "View order", ctaUrl: `${baseUrl()}/orders/${encodeURIComponent(order.orderNumber)}` }),
  }));
  if (env.ADMIN_NOTIFICATION_EMAIL) tasks.push(sendRiseoraEmail({
    to: env.ADMIN_NOTIFICATION_EMAIL,
    subject: `New Riseora order ${order.orderNumber}`,
    template: "admin-order-placed",
    idempotencyKey: `admin-order-placed/${order.orderNumber}`,
    html: renderRiseoraEmail({ eyebrow: "NEW ORDER", title: order.orderNumber, bodyHtml: `<p>${escapeEmailHtml(order.customerName)} · ${escapeEmailHtml(order.customerPhone)}</p><p><strong>${moneyText(order.totalAmount)}</strong></p>`, ctaLabel: "Open Admin orders", ctaUrl: `${baseUrl()}/admin/orders` }),
  }));
  await Promise.allSettled(tasks);
}

export async function sendOrderStatusNotification(order: OrderEmailShape) {
  if (!order.customerEmail) return;
  const tracking = order.shipment?.trackingNumber
    ? `<p><strong>Courier:</strong> ${escapeEmailHtml(order.shipment.carrier || "Courier")}<br/><strong>Tracking:</strong> ${escapeEmailHtml(order.shipment.trackingNumber)}${order.shipment.trackingUrl ? `<br/><a href="${escapeEmailHtml(order.shipment.trackingUrl)}">Track with courier</a>` : ""}</p>`
    : "";
  await sendRiseoraEmail({
    to: order.customerEmail,
    subject: `Riseora order ${order.orderNumber}: ${order.status}`,
    template: "order-status",
    idempotencyKey: `order-status/${order.orderNumber}/${order.status}`,
    html: renderRiseoraEmail({ eyebrow: "ORDER UPDATE", title: `Your order is ${order.status.toLowerCase().replaceAll("_", " ")}.`, bodyHtml: `<p>Order <strong>${escapeEmailHtml(order.orderNumber)}</strong> has moved to <strong>${escapeEmailHtml(order.status)}</strong>.</p>${tracking}<p>Total: ${moneyText(order.totalAmount)}</p>`, ctaLabel: "View order journey", ctaUrl: `${baseUrl()}/orders/${encodeURIComponent(order.orderNumber)}` }),
  });
}

type ReturnEmailShape = {
  returnNumber: string; status: string; refundAmount: unknown; reason?: string | null;
  reverseCarrier?: string | null; reverseTrackingNumber?: string | null; reverseTrackingUrl?: string | null;
  order?: { orderNumber?: string | null; customerEmail?: string | null } | null;
  user?: { email?: string | null; firstName?: string | null } | null;
};

export async function sendReturnStatusNotification(request: ReturnEmailShape) {
  const email = request.user?.email || request.order?.customerEmail || null;
  if (!email) return;
  const tracking = request.reverseTrackingNumber ? `<p><strong>Return courier:</strong> ${escapeEmailHtml(request.reverseCarrier || "Courier")}<br/><strong>Tracking:</strong> ${escapeEmailHtml(request.reverseTrackingNumber)}${request.reverseTrackingUrl ? `<br/><a href="${escapeEmailHtml(request.reverseTrackingUrl)}">Track return pickup</a>` : ""}</p>` : "";
  await sendRiseoraEmail({
    to: email, subject: `Riseora return ${request.returnNumber}: ${request.status}`, template: "return-status", idempotencyKey: `return-status/${request.returnNumber}/${request.status}`,
    html: renderRiseoraEmail({ eyebrow: "RETURN UPDATE", title: `Return ${request.status.toLowerCase().replaceAll("_", " ")}`, bodyHtml: `<p>Your return <strong>${escapeEmailHtml(request.returnNumber)}</strong>${request.order?.orderNumber ? ` for order <strong>${escapeEmailHtml(request.order.orderNumber)}</strong>` : ""} is now <strong>${escapeEmailHtml(request.status)}</strong>.</p>${tracking}<p>Expected refund value: ${moneyText(request.refundAmount)}</p>`, footnote: "Refund arrival times can vary by bank or payment provider after Riseora processes the refund." }),
  });
}

export async function sendBackInStockNotification(input: { email: string; name?: string | null; productName: string; productSlug: string; variantName: string }) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false;
  const url = `${baseUrl()}/product/${encodeURIComponent(input.productSlug)}`;
  await sendRiseoraEmail({ to: input.email, subject: `${input.productName} is back in stock at Riseora`, template: "back-in-stock", idempotencyKey: `stock-alert/${input.productSlug}/${input.variantName}/${input.email}`, html: renderRiseoraEmail({ eyebrow: "BACK IN STOCK", title: "It’s back.", bodyHtml: `<p>${input.name ? `${escapeEmailHtml(input.name)}, ` : ""}<strong>${escapeEmailHtml(input.productName)}</strong> (${escapeEmailHtml(input.variantName)}) is available again.</p>`, ctaLabel: "Shop now", ctaUrl: url, footnote: "Stock can move quickly and availability is not reserved by this notification." }) });
  return true;
}

export async function sendPasswordResetEmail(input: { email: string; firstName?: string | null; resetUrl: string }) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false;
  await sendRiseoraEmail({ to: input.email, subject: "Reset your Riseora password", template: "password-reset", idempotencyKey: `password-reset/${input.email}/${input.resetUrl.slice(-24)}`, html: renderRiseoraEmail({ eyebrow: "ACCOUNT SECURITY", title: "Reset your password", bodyHtml: `<p>${input.firstName ? `${escapeEmailHtml(input.firstName)}, ` : ""}we received a request to reset your Riseora account password.</p>`, ctaLabel: "Reset password", ctaUrl: input.resetUrl, footnote: "This link expires in 60 minutes. If you did not request a reset, you can ignore this email." }) });
  return true;
}

export async function sendCartRecoveryEmail(input: { email: string; name?: string | null; cartToken: string; subtotal: unknown; reminderNumber: number; items: Array<{ productName?: string; variantName?: string; quantity?: number }> }) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false;
  const recoveryUrl = `${baseUrl()}/recover-cart/${encodeURIComponent(input.cartToken)}`;
  const lines = input.items.slice(0, 4).map((item) => `<li>${escapeEmailHtml(item.productName || "Riseora product")}${item.variantName ? ` · ${escapeEmailHtml(item.variantName)}` : ""} × ${Number(item.quantity || 1)}</li>`).join("");
  await sendRiseoraEmail({ to: input.email, subject: input.reminderNumber > 1 ? "Your Riseora cart is still waiting" : "You left something in your Riseora cart", template: "cart-recovery", idempotencyKey: `cart-recovery/${input.cartToken}/${input.reminderNumber}`, html: renderRiseoraEmail({ eyebrow: "SAVED CART", title: `${input.name ? `${input.name}, your` : "Your"} cart is waiting.`, bodyHtml: `<p>You asked Riseora to remind you if you left checkout before finishing.</p><ul style="padding-left:20px">${lines}</ul><p><strong>Cart value:</strong> ${moneyText(input.subtotal)}</p>`, ctaLabel: "Return to cart", ctaUrl: recoveryUrl, footnote: "Prices and stock are checked again when you return. This reminder does not reserve products." }) });
  return true;
}

export async function sendPriceDropNotification(input: { email: string; name?: string | null; productName: string; productSlug: string; variantName: string; previousPrice: unknown; currentPrice: unknown }) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false;
  const url = `${baseUrl()}/product/${encodeURIComponent(input.productSlug)}`;
  const saving = Math.max(0, Number(input.previousPrice || 0) - Number(input.currentPrice || 0));
  await sendRiseoraEmail({ to: input.email, subject: `Price drop: ${input.productName} at Riseora`, template: "price-drop", idempotencyKey: `price-alert/${input.productSlug}/${input.variantName}/${input.email}/${Number(input.currentPrice || 0).toFixed(2)}`, html: renderRiseoraEmail({ eyebrow: "PRICE WATCH", title: "A better price is live.", bodyHtml: `<p>${input.name ? `${escapeEmailHtml(input.name)}, ` : ""}<strong>${escapeEmailHtml(input.productName)}</strong> (${escapeEmailHtml(input.variantName)}) has dropped from <strong>${moneyText(input.previousPrice)}</strong> to <strong>${moneyText(input.currentPrice)}</strong>.</p>${saving > 0 ? `<p>You save <strong>${moneyText(saving)}</strong> versus the price when you created this alert.</p>` : ""}`, ctaLabel: "View product", ctaUrl: url, footnote: "Prices and stock can change. This alert does not reserve inventory." }) });
  return true;
}

export async function sendSupportTicketReceived(input: { email: string; name: string; ticketNumber: string; subject: string; signedIn: boolean }) {
  const url = input.signedIn ? `${baseUrl()}/support/${encodeURIComponent(input.ticketNumber)}` : `${baseUrl()}/help`;
  return sendRiseoraEmail({ to: input.email, subject: `Riseora support ${input.ticketNumber}: received`, template: "support-received", idempotencyKey: `support-received/${input.ticketNumber}`, html: renderRiseoraEmail({ eyebrow: "SUPPORT REQUEST RECEIVED", title: `We’re on it, ${input.name}.`, bodyHtml: `<p>Your support request <strong>${escapeEmailHtml(input.ticketNumber)}</strong> has been received.</p><p><strong>Subject:</strong> ${escapeEmailHtml(input.subject)}</p><p>Keep this ticket number for reference. Our team can reply through your Riseora support thread and email.</p>`, ctaLabel: input.signedIn ? "Open support thread" : "Visit Help Center", ctaUrl: url }) });
}

export async function sendSupportReplyNotification(input: { email: string; name?: string | null; ticketNumber: string; subject: string; reply: string; signedIn: boolean; replyId?: string }) {
  const url = input.signedIn ? `${baseUrl()}/support/${encodeURIComponent(input.ticketNumber)}` : `${baseUrl()}/help`;
  return sendRiseoraEmail({ to: input.email, subject: `Riseora support ${input.ticketNumber}: new reply`, template: "support-reply", idempotencyKey: `support-reply/${input.ticketNumber}/${input.replyId || Buffer.from(input.reply).toString("base64url").slice(0, 32)}`, html: renderRiseoraEmail({ eyebrow: "SUPPORT UPDATE", title: input.subject || "Riseora Support replied", bodyHtml: `<p>${input.name ? `${escapeEmailHtml(input.name)}, ` : ""}our support team replied to ticket <strong>${escapeEmailHtml(input.ticketNumber)}</strong>.</p><div style="margin:16px 0;padding:16px;background:#f6f8f4;border-radius:14px">${escapeEmailHtml(input.reply).replaceAll("\n", "<br/>")}</div>`, ctaLabel: input.signedIn ? "Reply in My Riseora" : "Help Center", ctaUrl: url }) });
}

export async function sendSupportAdminNotification(input: { ticketNumber: string; name: string; email: string; category: string; subject: string; priority: string }) {
  if (!env.ADMIN_NOTIFICATION_EMAIL) return false;
  await sendRiseoraEmail({ to: env.ADMIN_NOTIFICATION_EMAIL, subject: `Support ${input.priority}: ${input.ticketNumber}`, template: "admin-support-new", idempotencyKey: `admin-support/${input.ticketNumber}`, html: renderRiseoraEmail({ eyebrow: `${input.category} · ${input.priority}`, title: input.subject, bodyHtml: `<p><strong>${escapeEmailHtml(input.name)}</strong><br/>${escapeEmailHtml(input.email)}<br/>Ticket ${escapeEmailHtml(input.ticketNumber)}</p>`, ctaLabel: "Open Support queue", ctaUrl: `${baseUrl()}/admin/support` }) });
  return true;
}

export async function sendRefillReminderEmail(input: { email: string; firstName?: string | null; productName: string; productSlug: string; variantName: string; quantity: number; price: unknown; reminderId: string; dueKey: string }) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false;
  const url = `${baseUrl()}/refills`;
  await sendRiseoraEmail({
    to: input.email,
    subject: `Refill reminder: ${input.productName}`,
    template: "refill-reminder",
    idempotencyKey: `refill/${input.reminderId}/${input.dueKey}`,
    html: renderRiseoraEmail({
      eyebrow: "REFILL REMINDER",
      title: `${input.firstName ? `${input.firstName}, it` : "It"} may be time for a refill.`,
      bodyHtml: `<p>Your reminder for <strong>${escapeEmailHtml(input.productName)}</strong> (${escapeEmailHtml(input.variantName)}) is due.</p><p><strong>Planned quantity:</strong> ${Number(input.quantity || 1)}<br/><strong>Current price:</strong> ${moneyText(input.price)}</p><p>Riseora will always re-check current price, stock and purchase limits before anything is added to your cart.</p>`,
      ctaLabel: "Review my refills",
      ctaUrl: url,
      footnote: "This is a reminder only. Riseora never places or charges a recurring order without you confirming checkout.",
    }),
  });
  return true;
}

export async function sendNewsletterPreferenceEmail(input: { email: string; unsubscribeToken: string }) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false;
  const url = `${baseUrl()}/unsubscribe?token=${encodeURIComponent(input.unsubscribeToken)}`;
  await sendRiseoraEmail({
    to: input.email,
    subject: "Manage your Riseora email preference",
    template: "newsletter-preference",
    idempotencyKey: `newsletter-preference/${input.email}/${new Date().toISOString().slice(0, 10)}`,
    html: renderRiseoraEmail({
      eyebrow: "PRIVACY & EMAIL",
      title: "Manage your Riseora marketing email.",
      bodyHtml: "<p>You asked for a secure link to manage optional Riseora marketing email.</p><p>Order, payment, security, support and other service messages are separate from this marketing preference.</p>",
      ctaLabel: "Unsubscribe from marketing email",
      ctaUrl: url,
      footnote: "If you did not request this link, you can ignore this email.",
    }),
  });
  return true;
}
