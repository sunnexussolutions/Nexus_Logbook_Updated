require('dotenv').config();
const pool = require('./src/config/db');
const { summarizeEffectiveLeaveRequests } = require('./src/utils/leaveDays.js');
const { getYearBounds } = require('./src/utils/dateUtils.js');

async function test() {
  const userId = 212;
  const { start: yearStart, end: yearEnd } = getYearBounds(2026);
  const approvedResult = await pool.query("SELECT id, user_id, from_date, to_date FROM leave_requests WHERE user_id = $1 AND status = 'APPROVED' AND to_date >= $2::date AND from_date <= $3::date", [userId, yearStart, yearEnd]);
  console.log('Approved Result rows:', approvedResult.rows);
  const approvedSummary = await summarizeEffectiveLeaveRequests(pool, approvedResult.rows, { rangeStart: yearStart, rangeEnd: yearEnd });
  console.log('Approved Summary:', approvedSummary);
  process.exit(0);
}
test();
