import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../config/prisma";
import { ensureInvoice } from "./invoice.service";
import { getStoreSettings } from "./store.service";

function round2(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }

type CreditPayload = {
  sourceKey: string;
  orderId: string;
  invoiceId: string;
  returnRequestId?: string | null;
  issuedAt: Date;
  reason: string;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  taxTotal: number;
  grandTotal: number;
  lines: any[];
};

async function createCreditNote(payload: CreditPayload) {
  const existing = await prisma.creditNote.findUnique({ where: { sourceKey: payload.sourceKey } });
  if (existing) return existing;
  return prisma.$transaction(async (tx) => {
    const again = await tx.creditNote.findUnique({ where: { sourceKey: payload.sourceKey } });
    if (again) return again;
    const settings = await getStoreSettings(tx);
    const allocated = await tx.storeSetting.update({ where: { id: settings.id }, data: { creditNoteNextNumber: { increment: 1 } } });
    const sequence = allocated.creditNoteNextNumber - 1;
    const year = payload.issuedAt.getFullYear();
    const creditNoteNumber = `${settings.creditNotePrefix || "RCN"}/${year}/${String(sequence).padStart(5, "0")}`;
    return tx.creditNote.create({
      data: {
        creditNoteNumber,
        sourceKey: payload.sourceKey,
        issuedAt: payload.issuedAt,
        invoiceId: payload.invoiceId,
        orderId: payload.orderId,
        returnRequestId: payload.returnRequestId || null,
        reason: payload.reason,
        taxableTotal: payload.taxableTotal,
        cgstTotal: payload.cgstTotal,
        sgstTotal: payload.sgstTotal,
        igstTotal: payload.igstTotal,
        taxTotal: payload.taxTotal,
        grandTotal: payload.grandTotal,
        lines: payload.lines as unknown as Prisma.InputJsonValue,
      },
    });
  });
}

export async function ensureCreditNoteForReturn(returnRequestId: string) {
  const sourceKey = `RETURN:${returnRequestId}`;
  const existing = await prisma.creditNote.findUnique({ where: { sourceKey } });
  if (existing) return existing;

  const returned = await prisma.returnRequest.findUnique({ where: { id: returnRequestId }, include: { items: { include: { orderItem: true } }, order: true } });
  if (!returned) throw new Error("RETURN_NOT_FOUND");
  if (returned.status !== "REFUNDED" || !returned.refundedAt) throw new Error("CREDIT_NOTE_NOT_AVAILABLE");

  const invoice = await ensureInvoice(returned.orderId);
  const invoiceLines = Array.isArray(invoice.lines) ? invoice.lines as any[] : [];
  const invoiceLineMap = new Map(invoiceLines.map((line) => [String(line.orderItemId), line]));
  const lines = returned.items.map((row) => {
    const orderItem = row.orderItem;
    const refundGross = round2(Number(row.unitRefundAmount || 0) * row.quantity);
    const rate = Math.max(0, Number(orderItem.gstRate || 0));
    const taxable = rate > 0 ? round2(refundGross / (1 + rate / 100)) : refundGross;
    const tax = round2(refundGross - taxable);
    const original: any = invoiceLineMap.get(orderItem.id);
    const interstate = Number(original?.igstAmount || 0) > 0;
    const cgst = interstate ? 0 : round2(tax / 2);
    const sgst = interstate ? 0 : round2(tax - cgst);
    const igst = interstate ? tax : 0;
    return { orderItemId: orderItem.id, productName: orderItem.productName, variantName: orderItem.variantName, sku: orderItem.sku, hsnCode: orderItem.hsnCode, quantity: row.quantity, gstRate: rate, taxableAmount: taxable, cgstAmount: cgst, sgstAmount: sgst, igstAmount: igst, taxAmount: tax, lineTotal: refundGross };
  });
  return createCreditNote({
    sourceKey,
    orderId: returned.orderId,
    invoiceId: invoice.id,
    returnRequestId,
    issuedAt: returned.refundedAt,
    reason: returned.reason || "Returned goods / refund",
    taxableTotal: round2(lines.reduce((sum, line) => sum + line.taxableAmount, 0)),
    cgstTotal: round2(lines.reduce((sum, line) => sum + line.cgstAmount, 0)),
    sgstTotal: round2(lines.reduce((sum, line) => sum + line.sgstAmount, 0)),
    igstTotal: round2(lines.reduce((sum, line) => sum + line.igstAmount, 0)),
    taxTotal: round2(lines.reduce((sum, line) => sum + line.taxAmount, 0)),
    grandTotal: round2(Number(returned.refundAmount)),
    lines,
  });
}

export async function ensureCreditNoteForCancelledOrder(orderId: string) {
  const sourceKey = `ORDER_REFUND:${orderId}`;
  const existing = await prisma.creditNote.findUnique({ where: { sourceKey } });
  if (existing) return existing;
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payment: true, invoice: true } });
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (order.status !== "CANCELLED" || order.payment?.status !== "REFUNDED" || !order.payment.refundedAt) throw new Error("CREDIT_NOTE_NOT_AVAILABLE");
  if (!order.invoice) return null; // No tax invoice was issued, so there is nothing to reverse.
  const invoice = order.invoice;
  const lines = Array.isArray(invoice.lines) ? invoice.lines as any[] : [];
  return createCreditNote({
    sourceKey,
    orderId,
    invoiceId: invoice.id,
    issuedAt: order.payment.refundedAt,
    reason: "Cancelled order / full payment refund",
    taxableTotal: Number(invoice.taxableTotal),
    cgstTotal: Number(invoice.cgstTotal),
    sgstTotal: Number(invoice.sgstTotal),
    igstTotal: Number(invoice.igstTotal),
    taxTotal: Number(invoice.taxTotal),
    grandTotal: Number(invoice.grandTotal),
    lines,
  });
}

export async function getCreditNoteForCustomer(returnNumber: string, userId: string) {
  const returned = await prisma.returnRequest.findFirst({ where: { returnNumber, userId }, include: { creditNote: true, order: { include: { items: true } } } });
  if (!returned) throw new Error("RETURN_NOT_FOUND");
  const creditNote = returned.creditNote || (returned.status === "REFUNDED" ? await ensureCreditNoteForReturn(returned.id) : null);
  if (!creditNote) throw new Error("CREDIT_NOTE_NOT_AVAILABLE");
  const invoice = await prisma.invoice.findUnique({ where: { id: creditNote.invoiceId } });
  return { creditNote, invoice, returnRequest: returned, order: returned.order };
}

export async function getCreditNoteForAdmin(returnRequestId: string) {
  const returned = await prisma.returnRequest.findUnique({ where: { id: returnRequestId }, include: { creditNote: true, order: { include: { items: true } } } });
  if (!returned) throw new Error("RETURN_NOT_FOUND");
  const creditNote = returned.creditNote || (returned.status === "REFUNDED" ? await ensureCreditNoteForReturn(returned.id) : null);
  if (!creditNote) throw new Error("CREDIT_NOTE_NOT_AVAILABLE");
  const invoice = await prisma.invoice.findUnique({ where: { id: creditNote.invoiceId } });
  return { creditNote, invoice, returnRequest: returned, order: returned.order };
}

export async function getCreditNoteByIdForAdmin(creditNoteId: string) {
  const creditNote = await prisma.creditNote.findUnique({ where: { id: creditNoteId }, include: { invoice: true, returnRequest: true, order: { include: { items: true } } } });
  if (!creditNote) throw new Error("CREDIT_NOTE_NOT_FOUND");
  return { creditNote, invoice: creditNote.invoice, returnRequest: creditNote.returnRequest || { returnNumber: "Order cancellation", reason: creditNote.reason, refundMethod: creditNote.order.paymentMethod, refundReference: null }, order: creditNote.order };
}
