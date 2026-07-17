require('dotenv').config();
const pool = require('./src/config/db');
const { summarizeEffectiveLeaveRequests } = require('./src/utils/leaveDays.js');

async function test() {
  const userId = 212;
  const approvedResult = await pool.query("SELECT id, user_id, from_date, to_date FROM leave_requests WHERE user_id = $1 AND status = 'APPROVED'", [userId]);
  const approvedSummary = await summarizeEffectiveLeaveRequests(pool, approvedResult.rows, { rangeStart: '2026-07-10', rangeEnd: '2026-12-31' });
  console.log('Summary:', approvedSummary);
  process.exit(0);
}
test();
