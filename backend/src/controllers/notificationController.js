const pool = require("../config/db");


// Get notifications for logged-in user
exports.getMyNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `
      SELECT id, message, is_read, created_at
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Mark a single notification as read
exports.markAsRead = async (req, res) => {
  const userId = req.user.id;
  const notificationId = req.params.id;

  try {
    const result = await pool.query(
      `
      UPDATE notifications
      SET is_read = true
      WHERE id = $1 AND user_id = $2
      `,
      [notificationId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.json({ message: "Notification marked as read" });
  } catch (err) {
    console.error("Mark read error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

// Mark ALL unread notifications as read for the logged-in user
exports.markAllRead = async (req, res) => {
  const userId = req.user.id;

  try {
    await pool.query(
      `
      UPDATE notifications
      SET is_read = true
      WHERE user_id = $1 AND is_read = false
      `,
      [userId]
    );

    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    console.error("Mark all read error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};
