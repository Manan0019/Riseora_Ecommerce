import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { deleteUserNotification, getUnreadNotificationCount, getUserNotifications, markAllNotificationsRead, markNotificationRead } from "../services/notification-center.service";

const router = Router();
router.use(requireAuth);

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
