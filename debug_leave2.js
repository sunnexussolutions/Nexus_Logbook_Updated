require('dotenv').config();
const pool = require('./src/config/db');

async function test() {
  const userId = 212;
  const approvedResult = await pool.query("SELECT id, user_id, from_date, to_date FROM leave_requests WHERE user_id = $1 AND status = 'APPROVED'", [userId]);
  console.log('Approved Result rows:', approvedResult.rows);
  process.exit(0);
}
test();
