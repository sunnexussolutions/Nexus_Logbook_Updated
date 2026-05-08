require('dotenv').config();
const pool = require('../config/db');

const createUserPausesTable = async () => {
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
    console.log('User pauses table created or already exists');
  } catch (err) {
    console.error('Error creating user_pauses table:', err);
    throw err;
  }
};

module.exports = createUserPausesTable;

if (require.main === module) {
  createUserPausesTable()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
