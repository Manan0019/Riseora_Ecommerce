import { Router } from "express";

const router = Router();

router.get("/status", (_req, res) => {
  res.json({ success: true, enabled: true, message: "ERP sync endpoint ready" });
});

router.post("/push", (_req, res) => {
  res.json({ success: true, message: "ERP sync queued" });
});

export default router;
