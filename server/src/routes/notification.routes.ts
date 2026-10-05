import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { deleteUserNotification, getUnreadNotificationCount, getUserNotifications, markAllNotificationsRead, markNotificationRead } from "../services/notification-center.service";
import { clearReadNotifications, getNotificationCenter, markNotificationSelectionRead } from "../services/notification-inbox.service";

const router = Router();
router.use(requireAuth);


router.get("/center", asyncHandler(async (req, res) => {
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 80;
  const data = await getNotificationCenter(req.user!.id, limit);
  res.json({ success: true, data });
}));

router.patch("/read-filter", asyncHandler(async (req, res) => {
  const parsed = z.object({
    category: z.enum(["ORDERS", "SUPPORT", "REFILLS", "SHOPPING", "RISEORA"]).optional(),
    actionableOnly: z.boolean().optional().default(false),
  }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid notification filter" });
  const result = await markNotificationSelectionRead(req.user!.id, parsed.data);
  res.json({ success: true, data: { updated: result.count } });
}));

router.delete("/read", asyncHandler(async (req, res) => {
  const result = await clearReadNotifications(req.user!.id);
  res.json({ success: true, data: { deleted: result.count } });
}));

router.get("/", asyncHandler(async (req, res) => {
  const unreadOnly = req.query.unread === "true";
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 40;
  const [data, unreadCount] = await Promise.all([
    getUserNotifications(req.user!.id, { unreadOnly, limit }),
    getUnreadNotificationCount(req.user!.id),
  ]);
  res.json({ success: true, data, unreadCount });
}));

router.get("/unread-count", asyncHandler(async (req, res) => {
  const count = await getUnreadNotificationCount(req.user!.id);
  res.json({ success: true, data: { count } });
}));

router.patch("/read-all", asyncHandler(async (req, res) => {
  const result = await markAllNotificationsRead(req.user!.id);
  res.json({ success: true, data: { updated: result.count } });
}));

router.patch("/:id/read", asyncHandler(async (req, res) => {
  const result = await markNotificationRead(req.user!.id, String(req.params.id));
  res.json({ success: true, data: { updated: result.count } });
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const result = await deleteUserNotification(req.user!.id, String(req.params.id));
  res.json({ success: true, data: { deleted: result.count } });
}));

export default router;
