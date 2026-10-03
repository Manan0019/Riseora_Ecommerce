import { prisma } from "../config/prisma";
import { ensureInvoice } from "./invoice.service";
import { ensureCreditNoteForCancelledOrder, ensureCreditNoteForReturn } from "./credit-note.service";

const money = (value: unknown) => Number(value || 0);
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export type FinanceDateRange = { from: Date; to: Date };

export function parseFinanceRange(query: any): FinanceDateRange {
  const now = new Date();
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const defaultTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  const from = typeof query.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.from) ? new Date(`${query.from}T00:00:00.000Z`) : defaultFrom;
  const to = typeof query.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.to) ? new Date(`${query.to}T23:59:59.999Z`) : defaultTo;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new Error("INVALID_RANGE");
  if (to.getTime() - from.getTime() > 370 * 24 * 60 * 60 * 1000) throw new Error("RANGE_TOO_LARGE");
  return { from, to };
}

function paymentReconciliation(order: any) {
  const payment = order.payment;
  if (!payment) return { status: "REVIEW_REQUIRED" as const, note: "Payment record is missing" };
  const orderTotal = money(order.totalAmount);
  const paymentAmount = money(payment.amount);
  const refunded = money(payment.refundedAmount);
  const amountMismatch = Math.abs(orderTotal - paymentAmount) > 0.01;
  if (amountMismatch) return { status: "REVIEW_REQUIRED" as const, note: `Order total ₹${orderTotal.toFixed(2)} does not match payment amount ₹${paymentAmount.toFixed(2)}` };
  if (refunded < -0.001 || refunded - paymentAmount > 0.01) return { status: "REVIEW_REQUIRED" as const, note: "Refund total is outside the captured payment amount" };

  if (order.paymentMethod === "ONLINE") {
    if (["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(payment.status) && (!payment.providerPaymentId || !payment.paidAt)) {
      return { status: "REVIEW_REQUIRED" as const, note: "Online payment is marked collected but provider payment ID / paid timestamp is missing" };
    }
    if (payment.status === "REFUNDED" && Math.abs(refunded - paymentAmount) > 0.01) return { status: "REVIEW_REQUIRED" as const, note: "Payment is marked fully refunded but refunded amount is incomplete" };
    if (payment.status === "PARTIALLY_REFUNDED" && (refunded <= 0 || refunded + 0.01 >= paymentAmount)) return { status: "REVIEW_REQUIRED" as const, note: "Partial refund status does not match refunded amount" };
    if (order.status === "CANCELLED" && payment.status === "PAID") return { status: "REVIEW_REQUIRED" as const, note: "Cancelled order still has a paid, non-refunded online payment" };
  } else {
    if (order.status === "DELIVERED" && payment.status !== "PAID") return { status: "REVIEW_REQUIRED" as const, note: "Delivered COD order has not been marked collected" };
    if (payment.status === "PAID" && !payment.paidAt) return { status: "REVIEW_REQUIRED" as const, note: "COD payment is marked paid without a collection timestamp" };
  }
  return { status: "MATCHED" as const, note: "Order and payment records are internally consistent" };
}

export async function reconcileFinancePayments(range: FinanceDateRange) {
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: range.from, lte: range.to } },
    include: { payment: true },
  });
  let matched = 0;
  let reviewRequired = 0;
  const now = new Date();
  for (const order of orders) {
    if (!order.payment) continue;
    const result = paymentReconciliation(order);
    if (result.status === "MATCHED") matched += 1; else reviewRequired += 1;
    await prisma.payment.update({
      where: { id: order.payment.id },
      data: { reconciliationStatus: result.status, reconciledAt: now, reconciliationNote: result.note },
    });
  }
  return { checked: orders.filter((order) => Boolean(order.payment)).length, matched, reviewRequired, reconciledAt: now };
}

export async function issueMissingInvoices(range: FinanceDateRange) {
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: range.from, lte: range.to }, status: { notIn: ["PENDING", "CANCELLED"] }, invoice: null },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  let issued = 0;
  const errors: string[] = [];
  for (const order of orders) {
    try { await ensureInvoice(order.id); issued += 1; }
    catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  }
  return { eligible: orders.length, issued, failed: errors.length, errors: [...new Set(errors)].slice(0, 10) };
}

export async function issueMissingCreditNotes(range: FinanceDateRange) {
  const [rows, cancellations] = await Promise.all([
    prisma.returnRequest.findMany({ where: { refundedAt: { gte: range.from, lte: range.to }, status: "REFUNDED", creditNote: null }, select: { id: true }, orderBy: { refundedAt: "asc" } }),
    prisma.order.findMany({ where: { status: "CANCELLED", payment: { is: { status: "REFUNDED", refundedAt: { gte: range.from, lte: range.to } } }, invoice: { isNot: null }, creditNotes: { none: { sourceKey: { startsWith: "ORDER_REFUND:" } } } }, select: { id: true } }),
  ]);
  let issued = 0;
  const errors: string[] = [];
  for (const row of rows) {
    try { await ensureCreditNoteForReturn(row.id); issued += 1; } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  }
  for (const order of cancellations) {
    try { const note = await ensureCreditNoteForCancelledOrder(order.id); if (note) issued += 1; } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  }
  return { eligible: rows.length + cancellations.length, issued, failed: errors.length, errors: [...new Set(errors)].slice(0, 10) };
}

export async function financeOverview(range: FinanceDateRange) {
  const [orders, invoices, creditNotes, variants, settings] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      include: { payment: true, invoice: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.invoice.findMany({ where: { issuedAt: { gte: range.from, lte: range.to } }, orderBy: { issuedAt: "desc" } }),
    prisma.creditNote.findMany({ where: { issuedAt: { gte: range.from, lte: range.to } }, include: { returnRequest: { select: { returnNumber: true, orderId: true } }, order: { select: { orderNumber: true } }, invoice: { select: { invoiceNumber: true } } }, orderBy: { issuedAt: "desc" } }),
    prisma.productVariant.findMany({ where: { isActive: true, product: { isActive: true } }, select: { id: true, sku: true, name: true, hsnCode: true, gstRate: true, product: { select: { name: true } } } }),
    prisma.storeSetting.findUnique({ where: { id: "primary" } }),
  ]);

  const activeOrders = orders.filter((order) => order.status !== "CANCELLED");
  const grossOrders = round2(activeOrders.reduce((sum, order) => sum + money(order.totalAmount), 0));
  const collected = round2(activeOrders.reduce((sum, order) => sum + (order.payment && ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(order.payment.status) ? money(order.payment.amount) : 0), 0));
  const refunded = round2(activeOrders.reduce((sum, order) => sum + money(order.payment?.refundedAmount), 0));
  const netCollected = round2(collected - refunded);
  const eligibleForInvoice = activeOrders.filter((order) => !["PENDING"].includes(order.status));
  const issuedOrderIds = new Set(orders.filter((order) => order.invoice).map((order) => order.id));
  const missingInvoices = eligibleForInvoice.filter((order) => !issuedOrderIds.has(order.id));
  const reviewPayments = orders.filter((order) => order.payment?.reconciliationStatus === "REVIEW_REQUIRED");
  const uncheckedPayments = orders.filter((order) => order.payment?.reconciliationStatus === "UNCHECKED");
  const codOutstanding = orders.filter((order) => order.paymentMethod === "COD" && order.status === "DELIVERED" && order.payment?.status !== "PAID");

  const tax = invoices.reduce((acc, invoice) => {
    acc.taxable += money(invoice.taxableTotal); acc.cgst += money(invoice.cgstTotal); acc.sgst += money(invoice.sgstTotal); acc.igst += money(invoice.igstTotal); acc.tax += money(invoice.taxTotal); acc.gross += money(invoice.grandTotal); return acc;
  }, { taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0, gross: 0 });
  const credits = creditNotes.reduce((acc, note) => {
    acc.taxable += money(note.taxableTotal); acc.cgst += money(note.cgstTotal); acc.sgst += money(note.sgstTotal); acc.igst += money(note.igstTotal); acc.tax += money(note.taxTotal); acc.gross += money(note.grandTotal); return acc;
  }, { taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0, gross: 0 });

  const rateMap = new Map<number, { rate: number; taxable: number; tax: number; creditTaxable: number; creditTax: number }>();
  for (const invoice of invoices) for (const line of Array.isArray(invoice.lines) ? invoice.lines as any[] : []) {
    const rate = Number(line.gstRate || 0); const row = rateMap.get(rate) || { rate, taxable: 0, tax: 0, creditTaxable: 0, creditTax: 0 }; row.taxable += money(line.taxableAmount); row.tax += money(line.taxAmount); rateMap.set(rate, row);
  }
  for (const note of creditNotes) for (const line of Array.isArray(note.lines) ? note.lines as any[] : []) {
    const rate = Number(line.gstRate || 0); const row = rateMap.get(rate) || { rate, taxable: 0, tax: 0, creditTaxable: 0, creditTax: 0 }; row.creditTaxable += money(line.taxableAmount); row.creditTax += money(line.taxAmount); rateMap.set(rate, row);
  }

  return {
    range,
    setup: { gstin: settings?.gstin || null, pan: settings?.pan || null, state: settings?.state || null, invoicePrefix: settings?.invoicePrefix || "RISE", creditNotePrefix: settings?.creditNotePrefix || "RCN" },
    summary: {
      orders: orders.length, grossOrders, collected, refunded, netCollected,
      invoices: invoices.length, missingInvoices: missingInvoices.length,
      creditNotes: creditNotes.length,
      reconciliationReview: reviewPayments.length, reconciliationUnchecked: uncheckedPayments.length,
      codOutstanding: codOutstanding.length,
      netTaxable: round2(tax.taxable - credits.taxable), netCgst: round2(tax.cgst - credits.cgst), netSgst: round2(tax.sgst - credits.sgst), netIgst: round2(tax.igst - credits.igst), netTax: round2(tax.tax - credits.tax),
    },
    tax: { invoices: Object.fromEntries(Object.entries(tax).map(([k,v]) => [k, round2(v)])), credits: Object.fromEntries(Object.entries(credits).map(([k,v]) => [k, round2(v)])), rates: [...rateMap.values()].map((row) => ({ ...row, netTaxable: round2(row.taxable - row.creditTaxable), netTax: round2(row.tax - row.creditTax) })).sort((a,b) => a.rate - b.rate) },
    payments: orders.filter((order) => order.payment).map((order) => ({ orderId: order.id, orderNumber: order.orderNumber, createdAt: order.createdAt, customerName: order.customerName, method: order.paymentMethod, orderStatus: order.status, totalAmount: money(order.totalAmount), paymentStatus: order.payment!.status, refundedAmount: money(order.payment!.refundedAmount), reference: order.payment!.providerPaymentId || order.payment!.collectionReference || null, reconciliationStatus: order.payment!.reconciliationStatus, reconciliationNote: order.payment!.reconciliationNote, reconciledAt: order.payment!.reconciledAt })).slice(0, 250),
    creditNotes: creditNotes.map((note) => ({ id: note.id, creditNoteNumber: note.creditNoteNumber, issuedAt: note.issuedAt, grandTotal: money(note.grandTotal), taxTotal: money(note.taxTotal), returnRequestId: note.returnRequestId, returnNumber: note.returnRequest?.returnNumber || null, orderId: note.orderId, orderNumber: note.order.orderNumber, invoiceNumber: note.invoice.invoiceNumber, sourceKey: note.sourceKey })),
    missingInvoices: missingInvoices.slice(0, 100).map((order) => ({ id: order.id, orderNumber: order.orderNumber, createdAt: order.createdAt, customerName: order.customerName, totalAmount: money(order.totalAmount), status: order.status })),
    taxQa: { activeVariants: variants.length, missingHsn: variants.filter((variant) => !String(variant.hsnCode || "").trim()).length, zeroGst: variants.filter((variant) => Number(variant.gstRate || 0) === 0).length, rows: variants.filter((variant) => !String(variant.hsnCode || "").trim()).slice(0, 50).map((variant) => ({ id: variant.id, sku: variant.sku, productName: variant.product.name, variantName: variant.name, gstRate: Number(variant.gstRate || 0) })) },
  };
}
