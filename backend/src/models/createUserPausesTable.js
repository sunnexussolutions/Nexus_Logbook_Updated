require('dotenv').config();
const pool = require('../config/db');

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_pauses (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ user_pauses table created / already exists');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error creating user_pauses table:', err);
    process.exit(1);
  }
})();
