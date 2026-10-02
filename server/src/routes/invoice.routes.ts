import { Router } from "express";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { getInvoiceWithOrder } from "../services/invoice.service";

const router = Router();
router.use(requireAuth);

router.get(
  "/my/:orderNumber",
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findFirst({
      where: { orderNumber: String(req.params.orderNumber), userId: req.user!.id },
      select: { id: true },
    });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    try {
      const data = await getInvoiceWithOrder(order.id);
      res.json({ success: true, data });
    } catch (error) {
      if (error instanceof Error && error.message === "INVOICE_NOT_AVAILABLE") {
        return res.status(409).json({ success: false, message: "Invoice will be available after the order is confirmed" });
      }
      if (error instanceof Error && error.message === "INVOICE_TAX_SETUP_INCOMPLETE") {
        return res.status(409).json({ success: false, message: "Riseora tax-invoice setup is incomplete. Please contact support." });
      }
      throw error;
    }
  }),
);

export default router;
