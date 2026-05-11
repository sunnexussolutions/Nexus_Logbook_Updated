const cron = require("node-cron");
const pool = require("../config/db");
const { todayIST } = require("../utils/istTime");

/**
 * IMPORTANT: The auto-checkout with penalty logic lives in
 * src/scheduler/emailScheduler.js (7:00 PM IST).
 *
 * This cron only seeds missing attendance rows (ABSENT/HOLIDAY)
 * for users who never checked in at all. It runs at 11:30 PM IST
 * (well after the penalty job) so it never interferes.
 */
const runAttendanceAutomation = () => {

  // Runs every day at 11:30 PM IST — just ensures all users have a row
  cron.schedule("30 23 * * *", async () => {
    console.log("⏳ Running attendance row seeder (ABSENT/HOLIDAY fallback)...");

    try {
      const today = todayIST();
      const holidayRes = await pool.query(
        `SELECT 1
         FROM holidays
         WHERE holiday_date = $1
            OR EXTRACT(DOW FROM $1::date) = 0
         LIMIT 1`,
        [today]
      );
      const fallbackStatus = holidayRes.rows.length > 0 ? "HOLIDAY" : "ABSENT";

      // Ensure all users have an attendance record for today
      const result = await pool.query(`
        INSERT INTO attendance (user_id, date, status)
        SELECT u.id, $1, $2
        FROM users u
        WHERE NOT EXISTS (
            SELECT 1
            FROM user_pauses up
            WHERE up.user_id = u.id
              AND $1::date BETWEEN up.start_date AND up.end_date
          )
          AND NOT EXISTS (
            SELECT 1 FROM attendance a
            WHERE a.user_id = u.id
              AND a.date = $1
          )
      `, [today, fallbackStatus]);

      console.log(`✅ Attendance row seeder done (${result.rowCount} rows inserted as ${fallbackStatus})`);

    } catch (err) {
      console.error("❌ Attendance row seeder error:", err);
    }
  }, { timezone: "Asia/Kolkata" });

};

module.exports = runAttendanceAutomation;
