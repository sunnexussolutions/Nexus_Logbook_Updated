const cron = require('node-cron');
const pool = require('../config/db');
const { todayIST, nowIST } = require('../utils/istTime');

// ⏰ AUTO-CHECKOUT at 7:00 PM IST — with penalty system
cron.schedule('0 19 * * *', async () => {
  console.log('⏰ Running: Auto-checkout with penalty system (7 PM IST)');
  try {
    const today = todayIST();
    const currentMonth = today.slice(0, 7); // YYYY-MM

    const checkedIn = await pool.query(`
      SELECT a.user_id, a.id AS aid, u.name
      FROM attendance a
      JOIN users u ON u.id = a.user_id
      WHERE a.date = $1 AND a.status = 'CHECKED_IN'
        AND a.check_in IS NOT NULL AND a.check_out IS NULL
    `, [today]);

    for (const row of checkedIn.rows) {
      // Check if daily report was submitted
      const rpt = await pool.query(
        `SELECT 1 FROM work_reports WHERE user_id=$1 AND report_type='DAILY' AND report_date=$2 LIMIT 1`,
        [row.user_id, today]
      );

      const hasReport = rpt.rows.length > 0;

      if (hasReport) {
        // Had report but forgot to click checkout — mark as PRESENT (minor offense)
        await pool.query(
          `UPDATE attendance SET check_out = NOW(), status = 'PRESENT' WHERE id = $1`,
          [row.aid]
        );
        await pool.query(
          `INSERT INTO notifications (user_id, message, is_read, created_at) VALUES ($1, $2, false, NOW())`,
          [row.user_id, '⚠️ You forgot to checkout today but your work report was submitted. Auto-checked out.']
        );
      } else {
        // No report AND no checkout — PENALTY
        await pool.query(
          `UPDATE attendance SET check_out = NOW(), status = 'MISSED_CHECKOUT' WHERE id = $1`,
          [row.aid]
        );

        // Create missed checkout record
        await pool.query(
          `INSERT INTO missed_checkouts (user_id, date, auto_checkout_at, status)
           VALUES ($1, $2, NOW(), 'PENDING')
           ON CONFLICT (user_id, date) DO NOTHING`,
          [row.user_id, today]
        );

        // Count missed checkouts this month for progressive penalty
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

          // Deduct from leave balance
          const year = nowIST().getUTCFullYear();
          await pool.query(
            `UPDATE leave_balances
             SET used = used + 1,
                 remaining = GREATEST(remaining - 1, 0)
             WHERE user_id = $1 AND year = $2`,
            [row.user_id, year]
          );

          // Notify all admins about penalty
          const adminRes = await pool.query(`SELECT id FROM users WHERE role = 'ADMIN'`);
          for (const admin of adminRes.rows) {
            await pool.query(
              `INSERT INTO notifications (user_id, message, is_read, created_at) VALUES ($1, $2, false, NOW())`,
              [admin.id, `🚨 ${row.name} has ${missedCount} missed checkouts this month. 1 day leave deducted as penalty.`]
            );
          }
        }

        // Notify the user
        await pool.query(
          `INSERT INTO notifications (user_id, message, is_read, created_at) VALUES ($1, $2, false, NOW())`,
          [row.user_id, penaltyMsg]
        );
      }
    }

    console.log(`✅ Auto-checkout with penalties done: ${checkedIn.rows.length} users processed`);
  } catch (error) {
    console.error('Auto-checkout with penalties failed:', error);
  }
}, { timezone: "Asia/Kolkata" });

// 🔔 Checkout reminder (5:50 PM IST, Mon–Sat)
cron.schedule('50 17 * * 1-6', async () => {
  try {
    const today = todayIST();
    const result = await pool.query(`
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
          SELECT 1
          FROM notifications n
          WHERE n.user_id = a.user_id
            AND n.message = 'Reminder: Please do manual checkout now.'
            AND n.created_at >= NOW() - INTERVAL '4 hours'
        )
      RETURNING user_id
    `, [today]);
    console.log(`✅ Checkout reminders sent: ${result.rowCount}`);
  } catch (error) {
    console.error('Checkout reminder failed:', error);
  }
}, { timezone: "Asia/Kolkata" });

// 🔔 Daily report reminder (4:30 PM and 5:30 PM IST, Mon–Sat)
cron.schedule('30 16,17 * * 1-6', async () => {
  try {
    const today = todayIST();
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
          SELECT 1
          FROM notifications n
          WHERE n.user_id = a.user_id
            AND n.message = 'Reminder: Submit today''s daily work report before checkout.'
            AND n.created_at >= NOW() - INTERVAL '90 minutes'
        )
    `, [today]);
    console.log('✅ Daily report reminders sent');
  } catch (error) {
    console.error('Daily report reminder failed:', error);
  }
}, { timezone: "Asia/Kolkata" });

console.log('✅ Attendance scheduler initialized (email-free)');

module.exports = {};
