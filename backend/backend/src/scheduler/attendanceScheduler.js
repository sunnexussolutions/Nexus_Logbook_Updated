const cron = require("node-cron");
const pool = require("../config/db");
const { nowIST, getWeekRangeIST } = require("../utils/istTime");

function getWeekStartIST() {
  return getWeekRangeIST().weekStart;
}

console.log("Attendance scheduler loaded");

// Runs every minute
cron.schedule("* * * * *", async () => {
  try {
    const timingResult = await pool.query(`
      SELECT check_in_time, check_out_time
      FROM office_timings
      ORDER BY id DESC
      LIMIT 1
    `);

    if (timingResult.rows.length === 0) return;

    const { check_in_time, check_out_time } = timingResult.rows[0];
    // Use IST "now" for time comparisons
    const now = nowIST();

    const toTodayTime = (timeStr) => {
      const [h, m, s] = timeStr.split(":").map(Number);
      const d = nowIST();
      d.setUTCHours(h, m, s || 0, 0);
      return d;
    };

    const checkInTime = toTodayTime(check_in_time);
    const checkOutTime = toTodayTime(check_out_time);

    const diffInMinutes = (a, b) =>
      Math.floor((a.getTime() - b.getTime()) / 60000);

    const diffCheckIn = diffInMinutes(checkInTime, now);
    const diffCheckOut = diffInMinutes(checkOutTime, now);

    /* ================= CHECK-IN REMINDER ================= */
    if (diffCheckIn <= 10 && diffCheckIn > 9) {
      await pool.query(`
        INSERT INTO notifications (user_id, message)
        SELECT u.id, 'Check-in starts in 10 minutes'
        FROM users u
        WHERE NOT EXISTS (
          SELECT 1
          FROM notifications n
          WHERE n.user_id = u.id
            AND n.message = 'Check-in starts in 10 minutes'
            AND n.created_at >= NOW() - INTERVAL '2 minutes'
        )
      `);

      console.log("Check-in reminder sent");
    }

    /* ================= DAILY WORK REPORT REMINDER ================= */
    if (diffCheckOut <= 30 && diffCheckOut > 29) {
      await pool.query(`
        INSERT INTO notifications (user_id, message)
        SELECT a.user_id,
               'Reminder: Please submit today''s work report before checkout'
        FROM attendance a
        LEFT JOIN work_reports wr
          ON wr.user_id = a.user_id
          AND wr.report_type = 'DAILY'
          AND wr.report_date = CURRENT_DATE
        WHERE a.date = CURRENT_DATE
          AND a.check_in IS NOT NULL
          AND a.check_out IS NULL
          AND wr.id IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM notifications n
            WHERE n.user_id = a.user_id
              AND n.message = 'Reminder: Please submit today''s work report before checkout'
              AND n.created_at >= NOW() - INTERVAL '2 minutes'
          )
      `);

      console.log("Daily work report reminders sent");

      const isSaturdayIST = nowIST().getUTCDay() === 6;

      if (isSaturdayIST) {
        const weekStart = getWeekStartIST();

        await pool.query(
          `
          INSERT INTO notifications (user_id, message)
          SELECT a.user_id,
                 'Reminder: Saturday checkout requires weekly report submission.'
          FROM attendance a
          JOIN users u ON u.id = a.user_id
          LEFT JOIN work_reports wr
            ON wr.user_id = a.user_id
            AND wr.report_type = 'WEEKLY'
            AND wr.week_start = $1
          WHERE a.date = CURRENT_DATE
            AND a.check_in IS NOT NULL
            AND a.check_out IS NULL
            AND u.role IN ('LEAD', 'MEMBER')
            AND wr.id IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM notifications n
              WHERE n.user_id = a.user_id
                AND n.message = 'Reminder: Saturday checkout requires weekly report submission.'
                AND n.created_at >= NOW() - INTERVAL '2 minutes'
            )
          `,
          [weekStart]
        );

        console.log("Saturday weekly report reminders sent");
      }
    }

    /* ================= CHECK-OUT REMINDER ================= */
    if (diffCheckOut <= 10 && diffCheckOut > 9) {
      await pool.query(`
        INSERT INTO notifications (user_id, message)
        SELECT u.id, 'Check-out starts in 10 minutes'
        FROM users u
        WHERE NOT EXISTS (
          SELECT 1
          FROM notifications n
          WHERE n.user_id = u.id
            AND n.message = 'Check-out starts in 10 minutes'
            AND n.created_at >= NOW() - INTERVAL '2 minutes'
        )
      `);

      console.log("Check-out reminder sent");
    }
  } catch (err) {
    console.error("Attendance scheduler error:", err.message);
  }
});
