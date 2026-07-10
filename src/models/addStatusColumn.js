require("dotenv").config();
const pool = require("../config/db");

const addStatusColumn = async () => {
    try {
        await pool.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ACTIVE'
        `);
        console.log("✅ users.status column ensured");
    } catch (err) {
        console.error("❌ Error adding status column:", err.message);
    }
};

if (require.main === module) {
    addStatusColumn().then(() => process.exit(0));
}

module.exports = addStatusColumn;
