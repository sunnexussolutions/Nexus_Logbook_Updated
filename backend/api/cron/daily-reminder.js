require("dotenv").config();
const pool = require("../../src/config/db");
const { todayIST } = require("../../src/utils/istTime");

// Vercel Cron Handler — runs at 11:00 AM UTC & 12:00 PM UTC = 4:30 PM & 5:30 PM IST (Mon–Sat)
module.exports = async (req, res) => {
  if (req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const today = todayIST();

    // Checkout reminder
    const checkoutResult = await pool.query(`
      INSERT INTO notifications (user_id, message, is_read, created_at)
      SELECT a.user_id,
             'Reminder: Please do manual checkout now.',
             FALSE,
             NOW()
      FROM attendance a
      WHERE a.date = $1
        AND a.check_in IS NOT NULL
        AND a.check_out IS NULL
        AND a.status = 'CHECKED_IN'
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.user_id = a.user_id
            AND n.message = 'Reminder: Please do manual checkout now.'
            AND n.created_at >= NOW() - INTERVAL '4 hours'
        )
      RETURNING user_id
    `, [today]);

    // Daily report reminder
    await pool.query(`
      INSERT INTO notifications (user_id, message, is_read, created_at)
      SELECT a.user_id,
             'Reminder: Submit today''s daily work report before checkout.',
             FALSE,
             NOW()
      FROM attendance a
      LEFT JOIN work_reports wr
        ON wr.user_id = a.user_id
       AND wr.report_type = 'DAILY'
       AND wr.report_date = $1
      WHERE a.date = $1
        AND a.status = 'CHECKED_IN'
        AND a.check_in IS NOT NULL
        AND a.check_out IS NULL
        AND wr.id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.user_id = a.user_id
            AND n.message = 'Reminder: Submit today''s daily work report before checkout.'
            AND n.created_at >= NOW() - INTERVAL '90 minutes'
        )
    `, [today]);

    console.log(`✅ Daily reminder cron done: ${checkoutResult.rowCount} checkout reminders sent`);
    res.json({ success: true, checkout_reminders: checkoutResult.rowCount });
  } catch (err) {
    console.error("Daily reminder cron error:", err);
    res.status(500).json({ error: err.message });
  }
};
