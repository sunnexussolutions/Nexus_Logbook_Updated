require("dotenv").config();
const pool = require("../../src/config/db");
const { todayIST } = require("../../src/utils/istTime");

// Vercel Cron Handler — runs at 6:00 PM UTC = 11:30 PM IST daily
module.exports = async (req, res) => {
  if (req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const today = todayIST();

    const holidayRes = await pool.query(
      `SELECT 1 FROM holidays
       WHERE holiday_date = $1
          OR EXTRACT(DOW FROM $1::date) = 0
       LIMIT 1`,
      [today]
    );
    const fallbackStatus = holidayRes.rows.length > 0 ? "HOLIDAY" : "ABSENT";

    const result = await pool.query(`
      INSERT INTO attendance (user_id, date, status)
      SELECT u.id, $1, $2
      FROM users u
      WHERE NOT EXISTS (
        SELECT 1 FROM attendance a
        WHERE a.user_id = u.id AND a.date = $1
      )
    `, [today, fallbackStatus]);

    console.log(`✅ Seed attendance cron done: ${result.rowCount} rows inserted as ${fallbackStatus}`);
    res.json({ success: true, inserted: result.rowCount, status: fallbackStatus });
  } catch (err) {
    console.error("Seed attendance cron error:", err);
    res.status(500).json({ error: err.message });
  }
};
