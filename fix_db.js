require('dotenv').config();
const pool = require('./src/config/db');

async function fix() {
  await pool.query("UPDATE leave_requests SET from_date = '2026-07-11', to_date = '2026-07-15' WHERE id = 111");
  await pool.query("UPDATE attendance SET status = 'ON_LEAVE' WHERE user_id = 212 AND date IN ('2026-07-11', '2026-07-13', '2026-07-14', '2026-07-15')");
  await pool.query("UPDATE attendance SET status = 'ABSENT' WHERE user_id = 212 AND date = '2026-07-16'");
  console.log('Fixed DB');
  process.exit(0);
}
fix();
