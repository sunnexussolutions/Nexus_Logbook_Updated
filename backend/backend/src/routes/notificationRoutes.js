const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");

const {
  getMyNotifications,
  markAsRead,
  markAllRead
} = require("../controllers/notificationController");

router.get("/my-notifications", verifyToken, getMyNotifications);
// ⚠️ /mark-all-read MUST come before /:id/read — Express matches routes top-down
router.patch("/mark-all-read", verifyToken, markAllRead);
router.patch("/:id/read", verifyToken, markAsRead);

module.exports = router;
