import { Router } from "express";
import { z } from "zod";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { getLifecycleOverview, runLifecycleJob } from "../services/lifecycle.service";
import { accountCartHealth } from "../services/account-cart.service";

const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/overview", asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await getLifecycleOverview() });
}));

router.get("/saved-bag-health", asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await accountCartHealth() });
}));

router.post("/run", asyncHandler(async (req, res) => {
  const parsed = z.object({ job: z.enum(["ALL", "CART_RECOVERY", "STOCK_ALERTS", "PRICE_ALERTS", "REFILLS"]).default("ALL") }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid lifecycle job" });
  const data = await runLifecycleJob(parsed.data.job);
  res.json({ success: true, data, message: parsed.data.job === "ALL" ? "Lifecycle automations processed." : `${parsed.data.job.replaceAll("_", " ")} processed.` });
}));

export default router;
