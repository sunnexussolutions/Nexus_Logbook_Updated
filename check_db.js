require('dotenv').config();
const pool = require('./src/config/db');

async function test() {
  const att = await pool.query("SELECT TO_CHAR(date, 'YYYY-MM-DD') as d, status FROM attendance WHERE user_id = 212 ORDER BY date DESC LIMIT 10");
  console.log("Attendance:");
  console.log(att.rows);
  
  const leaves = await pool.query("SELECT id, status, TO_CHAR(from_date, 'YYYY-MM-DD') as f, TO_CHAR(to_date, 'YYYY-MM-DD') as t FROM leave_requests WHERE user_id = 212 ORDER BY id DESC");
  console.log("Leaves:");
  console.log(leaves.rows);
  process.exit(0);
}
test();
