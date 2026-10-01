import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { getUserNotifications, markNotificationRead } from "../services/notification-center.service";

const router = Router();

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  res.json({ success: true, data: await getUserNotifications(req.user.id) });
}));

router.patch("/:id/read", requireAuth, asyncHandler(async (req, res) => {
  await markNotificationRead(req.user.id, req.params.id);
  res.json({ success: true });
}));

export default router;
