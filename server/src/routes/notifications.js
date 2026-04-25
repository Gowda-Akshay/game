import { Router } from "express";
import { Notification } from "../models/Notification.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// get all notifications for logged-in user (newest first)
router.get("/", requireAuth, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(100);
    const unreadCount = await Notification.countDocuments({ userId: req.user.id, isRead: false });
    return res.json({ notifications, unreadCount });
  } catch {
    return res.status(500).json({ message: "Unable to load notifications." });
  }
});

// mark all as read
router.patch("/read-all", requireAuth, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user.id, isRead: false }, { isRead: true });
    return res.json({ message: "All marked as read." });
  } catch {
    return res.status(500).json({ message: "Unable to mark as read." });
  }
});

// mark single as read
router.patch("/:id/read", requireAuth, async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { isRead: true }
    );
    return res.json({ message: "Marked as read." });
  } catch {
    return res.status(500).json({ message: "Unable to mark as read." });
  }
});

export default router;
