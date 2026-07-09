require("dotenv").config();
const pool = require("../config/db");

const createAttendanceTables = async () => {
  try {
    // Admin-defined office timing
    await pool.query(`
      CREATE TABLE IF NOT EXISTS office_timings (
        id SERIAL PRIMARY KEY,
        check_in_time TIME NOT NULL,
        check_out_time TIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Attendance table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        date DATE NOT NULL,
        check_in TIMESTAMP,
        check_out TIMESTAMP,
        status VARCHAR(20) DEFAULT 'ABSENT',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, date)
      )
    `);

    // Leave requests table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leave_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        from_date DATE NOT NULL,
        to_date DATE NOT NULL,
        reason TEXT,
        status VARCHAR(20) DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Leave balances table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leave_balances (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE,
        total_quota INTEGER DEFAULT 20,
        used INTEGER DEFAULT 0,
        pending INTEGER DEFAULT 0,
        remaining INTEGER DEFAULT 20,
        year INTEGER NOT NULL
      )
    `);

    // Missed checkouts — tracks auto-checkouts requiring late report
    await pool.query(`
      CREATE TABLE IF NOT EXISTS missed_checkouts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        date DATE NOT NULL,
        auto_checkout_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        work_done TEXT,
        late_reason TEXT,
        submitted_at TIMESTAMP,
        status VARCHAR(20) DEFAULT 'PENDING',
        UNIQUE (user_id, date)
      )
    `);

    // Admin-managed holidays
    await pool.query(`
      CREATE TABLE IF NOT EXISTS holidays (
        id SERIAL PRIMARY KEY,
        holiday_date DATE NOT NULL UNIQUE,
        name VARCHAR(120),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add weekly report columns to work_reports (idempotent)
    try {
      await pool.query(`ALTER TABLE work_reports ADD COLUMN IF NOT EXISTS skills_learned TEXT`);
      await pool.query(`ALTER TABLE work_reports ADD COLUMN IF NOT EXISTS project_update TEXT`);
      console.log("✅ Weekly report columns ensured on work_reports");
    } catch (e) {
      console.log("ℹ️ work_reports columns check:", e.message);
    }

    console.log("✅ Attendance tables created successfully");
  } catch (err) {
    console.error("❌ Error creating attendance tables:", err.message);
  }
};

createAttendanceTables();
