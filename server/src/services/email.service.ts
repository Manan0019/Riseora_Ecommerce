import { prisma } from "../config/prisma";
import { env } from "../config/env";

export function escapeEmailHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function moneyText(value: unknown) { return `₹${Number(value || 0).toFixed(0)}`; }

export function renderRiseoraEmail(input: {
  preheader?: string;
  eyebrow?: string;
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footnote?: string;
}) {
  const preheader = escapeEmailHtml(input.preheader || input.title);
  const cta = input.ctaLabel && input.ctaUrl
    ? `<p style="margin:26px 0 8px"><a href="${escapeEmailHtml(input.ctaUrl)}" style="display:inline-block;background:#173b2a;color:#fff;text-decoration:none;padding:13px 20px;border-radius:999px;font-weight:800">${escapeEmailHtml(input.ctaLabel)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f5f3ed;font-family:Arial,sans-serif;color:#173326"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f3ed;padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff;border:1px solid #e3e6df;border-radius:24px;overflow:hidden"><tr><td style="background:#0e3b2d;padding:22px 28px;color:#fff"><div style="font-size:12px;letter-spacing:.22em;font-weight:900">RISEORA</div><div style="margin-top:4px;font-size:11px;color:#cfe0d6">Herbal care · thoughtful support</div></td></tr><tr><td style="padding:30px 28px"><div style="font-size:11px;letter-spacing:.16em;font-weight:900;color:#7a8a80">${escapeEmailHtml(input.eyebrow || "RISEORA UPDATE")}</div><h1 style="margin:8px 0 18px;font-size:28px;line-height:1.15;color:#15372a">${escapeEmailHtml(input.title)}</h1><div style="font-size:15px;line-height:1.7;color:#4d5e54">${input.bodyHtml}</div>${cta}${input.footnote ? `<p style="margin:26px 0 0;padding-top:18px;border-top:1px solid #edf0eb;color:#7b877f;font-size:12px;line-height:1.6">${escapeEmailHtml(input.footnote)}</p>` : ""}</td></tr><tr><td style="padding:18px 28px;background:#f7f8f5;color:#7c887f;font-size:11px;line-height:1.6">Riseora Herbals · This is a transactional message related to your Riseora activity.</td></tr></table></td></tr></table></body></html>`;
}

async function logDelivery(input: { to: string; subject: string; template: string; status: "SENT" | "FAILED"; idempotencyKey?: string; providerMessageId?: string | null; errorMessage?: string | null }) {
  try {
    await prisma.emailDeliveryLog.create({ data: {
      toEmail: input.to.toLowerCase(), subject: input.subject, template: input.template, status: input.status,
      idempotencyKey: input.idempotencyKey || null, providerMessageId: input.providerMessageId || null,
      errorMessage: input.errorMessage ? input.errorMessage.slice(0, 2000) : null,
    } });
  } catch (error) {
    console.error("Email delivery log failed", error);
  }
}

export async function sendRiseoraEmail(input: { to: string; subject: string; html: string; template: string; idempotencyKey?: string }) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return { sent: false, configured: false };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
      },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [input.to], subject: input.subject, html: input.html }),
    });
    const raw = await response.text().catch(() => "");
    if (!response.ok) {
      await logDelivery({ to: input.to, subject: input.subject, template: input.template, status: "FAILED", idempotencyKey: input.idempotencyKey, errorMessage: `HTTP ${response.status}: ${raw.slice(0, 1500)}` });
      throw new Error(`Email delivery failed (${response.status}) ${raw.slice(0, 300)}`);
    }
    let providerMessageId: string | null = null;
    try { providerMessageId = String(JSON.parse(raw || "{}").id || "") || null; } catch { /* provider body is optional */ }
    await logDelivery({ to: input.to, subject: input.subject, template: input.template, status: "SENT", idempotencyKey: input.idempotencyKey, providerMessageId });
    return { sent: true, configured: true, providerMessageId };
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith("Email delivery failed"))) {
      await logDelivery({ to: input.to, subject: input.subject, template: input.template, status: "FAILED", idempotencyKey: input.idempotencyKey, errorMessage: error instanceof Error ? error.message : String(error) });
    }
    throw error;
  }
}
