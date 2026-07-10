const pool = require("../config/db");

const addShiftCheckoutColumns = async () => {
    try {
        // Add check_out_time to shifts table
        await pool.query(`
      ALTER TABLE shifts ADD COLUMN IF NOT EXISTS check_out_time TIME
    `);
        console.log("✅ shifts.check_out_time column ensured");

        // Add early_checkout_minutes and overtime_minutes to attendance table
        await pool.query(`
      ALTER TABLE attendance ADD COLUMN IF NOT EXISTS early_checkout_minutes INTEGER DEFAULT 0
    `);
        await pool.query(`
      ALTER TABLE attendance ADD COLUMN IF NOT EXISTS overtime_minutes INTEGER DEFAULT 0
    `);
        console.log("✅ attendance.early_checkout_minutes & overtime_minutes columns ensured");

    } catch (err) {
        console.error("❌ Error adding shift checkout columns:", err.message);
    }
};

module.exports = addShiftCheckoutColumns;
