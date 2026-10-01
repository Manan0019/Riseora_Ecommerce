import { Router } from "express";

const router = Router();

router.get("/erp-sync", (_req, res) => {
  res.json({ success: true, integrations: [], status: "ready" });
});

export default router;
