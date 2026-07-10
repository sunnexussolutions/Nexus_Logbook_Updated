require("dotenv").config();
const pool = require("../../src/config/db");
const { todayIST, nowIST } = require("../../src/utils/istTime");

// Vercel Cron Handler — runs at 1:30 PM UTC = 7:00 PM IST daily
module.exports = async (req, res) => {
  // Security: only allow Vercel cron calls
  if (req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const today = todayIST();
    const currentMonth = today.slice(0, 7);

    const checkedIn = await pool.query(`
      SELECT a.user_id, a.id AS aid, u.name
      FROM attendance a
      JOIN users u ON u.id = a.user_id
      WHERE a.date = $1 AND a.status = 'CHECKED_IN'
        AND a.check_in IS NOT NULL AND a.check_out IS NULL
    `, [today]);

    let processed = 0;

    for (const row of checkedIn.rows) {
      const rpt = await pool.query(
        `SELECT 1 FROM work_reports WHERE user_id=$1 AND report_type='DAILY' AND report_date=$2 LIMIT 1`,
        [row.user_id, today]
      );
      const hasReport = rpt.rows.length > 0;

      if (hasReport) {
        await pool.query(
          `UPDATE attendance SET check_out = NOW(), status = 'PRESENT' WHERE id = $1`,
          [row.aid]
        );
        await pool.query(
          `INSERT INTO notifications (user_id, message, is_read, created_at) VALUES ($1, $2, false, NOW())`,
          [row.user_id, '⚠️ You forgot to checkout today but your work report was submitted. Auto-checked out.']
        );
      } else {
        await pool.query(
          `UPDATE attendance SET check_out = NOW(), status = 'MISSED_CHECKOUT' WHERE id = $1`,
          [row.aid]
        );
        await pool.query(
          `INSERT INTO missed_checkouts (user_id, date, auto_checkout_at, status)
           VALUES ($1, $2, NOW(), 'PENDING')
           ON CONFLICT (user_id, date) DO NOTHING`,
          [row.user_id, today]
        );

        const countRes = await pool.query(
          `SELECT COUNT(*)::int AS total FROM missed_checkouts
           WHERE user_id = $1 AND TO_CHAR(date, 'YYYY-MM') = $2`,
          [row.user_id, currentMonth]
        );
        const missedCount = countRes.rows[0].total;

        let penaltyMsg = '';
        if (missedCount <= 5) {
          penaltyMsg = `⚠️ WARNING (${missedCount}/5): You missed checkout and didn't submit your work report today. Your check-in is BLOCKED until you submit the missed checkout report. After 5 warnings, leave will be deducted.`;
        } else {
          penaltyMsg = `🚨 PENALTY: Missed checkout #${missedCount} this month (exceeded 5 warnings). 1 day leave has been deducted. Check-in is BLOCKED until you submit the report.`;

          const year = nowIST().getUTCFullYear();
          await pool.query(
            `UPDATE leave_balances SET used = used + 1, remaining = GREATEST(remaining - 1, 0) WHERE user_id = $1 AND year = $2`,
            [row.user_id, year]
          );

          const adminRes = await pool.query(`SELECT id FROM users WHERE role = 'ADMIN'`);
          for (const admin of adminRes.rows) {
            await pool.query(
              `INSERT INTO notifications (user_id, message, is_read, created_at) VALUES ($1, $2, false, NOW())`,
              [admin.id, `🚨 ${row.name} has ${missedCount} missed checkouts this month. 1 day leave deducted as penalty.`]
            );
          }
        }

        await pool.query(
          `INSERT INTO notifications (user_id, message, is_read, created_at) VALUES ($1, $2, false, NOW())`,
          [row.user_id, penaltyMsg]
        );
      }
      processed++;
    }

    console.log(`✅ Auto-checkout cron done: ${processed} users processed`);
    res.json({ success: true, processed });
  } catch (err) {
    console.error("Auto-checkout cron error:", err);
    res.status(500).json({ error: err.message });
  }
};
