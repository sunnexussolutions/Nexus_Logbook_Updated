require('dotenv').config();
const pool = require('./src/config/db');

pool.query(`
  SELECT a.user_id, u.name, a.date, a.status, a.early_checkout_minutes
  FROM attendance a
  JOIN users u ON u.id = a.user_id
  WHERE a.date = '2026-07-12' AND a.status = 'PRESENT'
`).then(r => {
  console.log('Matches for 12 Jul SUN PRESENT:');
  r.rows.forEach(x => console.log(` - ${x.name} (${x.user_id})`));
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
