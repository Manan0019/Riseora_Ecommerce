import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../config/prisma";
import { getStoreSettings, sellerAddressSnapshot } from "./store.service";

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalized(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

type InvoiceLine = {
  orderItemId: string;
  productName: string;
  variantName: string | null;
  sku: string;
  hsnCode: string | null;
  quantity: number;
  grossAmount: number;
  discountShare: number;
  taxableAmount: number;
  gstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  taxAmount: number;
  lineTotal: number;
};

export async function ensureInvoice(orderId: string) {
  const existing = await prisma.invoice.findUnique({ where: { orderId } });
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    const again = await tx.invoice.findUnique({ where: { orderId } });
    if (again) return again;

    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (["PENDING", "CANCELLED"].includes(order.status)) throw new Error("INVOICE_NOT_AVAILABLE");

    const settings = await getStoreSettings(tx);
    const hasTaxedItems = order.items.some((item) => Number(item.gstRate || 0) > 0);
    if (hasTaxedItems && (!settings.gstin || !settings.state)) throw new Error("INVOICE_TAX_SETUP_INCOMPLETE");
    const allocated = await tx.storeSetting.update({
      where: { id: settings.id },
      data: { invoiceNextNumber: { increment: 1 } },
    });
    const sequence = allocated.invoiceNextNumber - 1;
    const year = new Date().getFullYear();
    const invoiceNumber = `${settings.invoicePrefix || "RISE"}/${year}/${String(sequence).padStart(5, "0")}`;

    const subtotal = Number(order.subtotal || 0);
    const discount = Number(order.discountAmount || 0);
    const sameState = Boolean(settings.state && normalized(settings.state) === normalized((order.shippingAddress as any)?.state));

    const snapshotDiscountTotal = round2(order.items.reduce((sum, item) => sum + Number(item.discountAmount || 0), 0));
    const useLineDiscountSnapshot = snapshotDiscountTotal > 0 && Math.abs(snapshotDiscountTotal - discount) <= 0.05;
    let allocatedDiscount = 0;
    const lastDiscountableIndex = order.items.reduce((last, item, index) => Number(item.lineTotal) > 0 ? index : last, -1);
    const lines: InvoiceLine[] = order.items.map((item, index) => {
      const gross = Number(item.lineTotal);
      const discountShare = useLineDiscountSnapshot
        ? Math.min(gross, Math.max(0, Number(item.discountAmount || 0)))
        : gross <= 0 ? 0 : index === lastDiscountableIndex
          ? round2(Math.max(0, discount - allocatedDiscount))
          : subtotal > 0 ? round2(discount * (gross / subtotal)) : 0;
      allocatedDiscount = round2(allocatedDiscount + discountShare);
      const discountedGross = Math.max(0, round2(gross - discountShare));
      const rate = Math.max(0, Number(item.gstRate || 0));
      const taxable = rate > 0 ? round2(discountedGross / (1 + rate / 100)) : discountedGross;
      const tax = round2(discountedGross - taxable);
      const cgst = sameState ? round2(tax / 2) : 0;
      const sgst = sameState ? round2(tax - cgst) : 0;
      const igst = sameState ? 0 : tax;
      return {
        orderItemId: item.id,
        productName: item.productName,
        variantName: item.variantName,
        sku: item.sku,
        hsnCode: item.hsnCode,
        quantity: item.quantity,
        grossAmount: round2(gross),
        discountShare,
        taxableAmount: taxable,
        gstRate: rate,
        cgstAmount: cgst,
        sgstAmount: sgst,
        igstAmount: igst,
        taxAmount: tax,
        lineTotal: discountedGross,
      };
    });

    const taxableTotal = round2(lines.reduce((sum, line) => sum + line.taxableAmount, 0));
    const cgstTotal = round2(lines.reduce((sum, line) => sum + line.cgstAmount, 0));
    const sgstTotal = round2(lines.reduce((sum, line) => sum + line.sgstAmount, 0));
    const igstTotal = round2(lines.reduce((sum, line) => sum + line.igstAmount, 0));
    const taxTotal = round2(lines.reduce((sum, line) => sum + line.taxAmount, 0));

    return tx.invoice.create({
      data: {
        orderId: order.id,
        invoiceNumber,
        sellerName: settings.legalName || settings.storeName,
        sellerGstin: settings.gstin || null,
        sellerPan: settings.pan || null,
        placeOfSupply: String((order.shippingAddress as any)?.state || "") || null,
        sellerAddress: sellerAddressSnapshot(settings) as unknown as Prisma.InputJsonValue,
        buyerName: order.customerName,
        buyerAddress: order.shippingAddress as Prisma.InputJsonValue,
        taxableTotal,
        cgstTotal,
        sgstTotal,
        igstTotal,
        taxTotal,
        grandTotal: order.totalAmount,
        lines: lines as unknown as Prisma.InputJsonValue,
      },
    });
  });
}

export async function getInvoiceWithOrder(orderId: string) {
  const invoice = await ensureInvoice(orderId);
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, payment: true, shipment: true },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");
  return { invoice, order };
}
