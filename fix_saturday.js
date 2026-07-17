require('dotenv').config();
const pool = require('./src/config/db');

pool.query(`
  SELECT a.user_id, u.name, a.date, a.status, EXTRACT(DOW FROM a.date) as dow
  FROM attendance a
  JOIN users u ON u.id = a.user_id
  WHERE a.date BETWEEN '2026-07-01' AND '2026-07-17'
    AND a.status = 'HOLIDAY'
    AND u.name = 'Mallikarjuna Rao .C'
  ORDER BY a.date DESC
`).then(r => {
  console.log('HOLIDAY records for Mallikarjuna:');
  r.rows.forEach(x => console.log(` - ${x.date} DOW:${x.dow} | ${x.status}`));
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
