import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { asyncHandler } from "../utils/async-handler";
import { financeOverview, issueMissingCreditNotes, issueMissingInvoices, parseFinanceRange, reconcileFinancePayments } from "../services/finance.service";
import { getCreditNoteByIdForAdmin, getCreditNoteForAdmin } from "../services/credit-note.service";

const router = Router();

function rangeOr400(req: any, res: any) {
  try { return parseFinanceRange(req.query); }
  catch (error) {
    const message = error instanceof Error ? error.message : "INVALID_RANGE";
    res.status(400).json({ success: false, message: message === "RANGE_TOO_LARGE" ? "Choose a finance range of 370 days or less" : "Invalid finance date range" });
    return null;
  }
}

router.get("/finance", asyncHandler(async (req, res) => {
  const range = rangeOr400(req, res); if (!range) return;
  res.json({ success: true, data: await financeOverview(range) });
}));

router.post("/finance/reconcile", asyncHandler(async (req, res) => {
  const range = rangeOr400(req, res); if (!range) return;
  const result = await reconcileFinancePayments(range);
  res.json({ success: true, data: result, message: `${result.checked} payment records checked; ${result.reviewRequired} need review.` });
}));

router.post("/finance/invoices/issue-missing", asyncHandler(async (req, res) => {
  const range = rangeOr400(req, res); if (!range) return;
  const result = await issueMissingInvoices(range);
  res.json({ success: true, data: result, message: `${result.issued} invoice(s) issued${result.failed ? `; ${result.failed} could not be issued` : ""}.` });
}));

router.post("/finance/credit-notes/issue-missing", asyncHandler(async (req, res) => {
  const range = rangeOr400(req, res); if (!range) return;
  const result = await issueMissingCreditNotes(range);
  res.json({ success: true, data: result, message: `${result.issued} credit note(s) issued${result.failed ? `; ${result.failed} could not be issued` : ""}.` });
}));

router.get("/finance/credit-notes/:returnRequestId", asyncHandler(async (req, res) => {
  try { res.json({ success: true, data: await getCreditNoteForAdmin(String(req.params.returnRequestId)) }); }
  catch (error) {
    const message = error instanceof Error ? error.message : "CREDIT_NOTE_NOT_AVAILABLE";
    if (message === "RETURN_NOT_FOUND") return res.status(404).json({ success: false, message: "Return request not found" });
    if (message === "CREDIT_NOTE_NOT_AVAILABLE") return res.status(409).json({ success: false, message: "Credit note is available after a refund is completed" });
    throw error;
  }
}));

router.get("/finance/credit-note/:creditNoteId", asyncHandler(async (req, res) => {
  try { res.json({ success: true, data: await getCreditNoteByIdForAdmin(String(req.params.creditNoteId)) }); }
  catch (error) {
    if (error instanceof Error && error.message === "CREDIT_NOTE_NOT_FOUND") return res.status(404).json({ success: false, message: "Credit note not found" });
    throw error;
  }
}));

const collectCodSchema = z.object({ reference: z.string().trim().max(120).optional().or(z.literal("")) });
router.post("/finance/cod/:orderId/collect", asyncHandler(async (req, res) => {
  const id = z.string().uuid().safeParse(String(req.params.orderId));
  const input = collectCodSchema.safeParse(req.body || {});
  if (!id.success || !input.success) return res.status(400).json({ success: false, message: "Invalid COD collection request" });
  const order = await prisma.order.findUnique({ where: { id: id.data }, include: { payment: true } });
  if (!order) return res.status(404).json({ success: false, message: "Order not found" });
  if (order.paymentMethod !== "COD" || !order.payment) return res.status(409).json({ success: false, message: "This order is not a COD payment" });
  if (order.status !== "DELIVERED") return res.status(409).json({ success: false, message: "Mark COD as collected only after the order is delivered" });
  if (order.payment.status === "PAID") return res.json({ success: true, message: "COD collection is already recorded" });
  const reference = input.data.reference?.trim() || `COD-${order.orderNumber}`;
  await prisma.payment.update({
    where: { id: order.payment.id },
    data: { status: "PAID", paidAt: new Date(), collectionReference: reference, reconciliationStatus: "MATCHED", reconciledAt: new Date(), reconciliationNote: "COD collection recorded after delivery" },
  });
  res.json({ success: true, message: "COD collection recorded and reconciled" });
}));

export default router;
