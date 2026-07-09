require('dotenv').config();
const db = require('./src/config/db');
const fs = require('fs');
db.query("SELECT a.id, a.user_id, a.check_in, a.check_out, a.early_checkout_minutes, a.overtime_minutes, u.role, u.name FROM attendance a JOIN users u ON a.user_id = u.id WHERE a.check_out IS NOT NULL AND u.role='MEMBER' ORDER BY a.date DESC LIMIT 10")
    .then(r => {
        fs.writeFileSync('out.json', JSON.stringify(r.rows, null, 2));
        process.exit(0);
    })
    .catch(console.error);
