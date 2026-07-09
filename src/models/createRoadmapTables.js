require("dotenv").config();
const pool = require("../config/db");

const createRoadmapTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS roadmaps (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL,
        created_by INTEGER NOT NULL,
        status VARCHAR(30) DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS roadmap_steps (
        id SERIAL PRIMARY KEY,
        roadmap_id INTEGER NOT NULL,
        step_title TEXT NOT NULL,
        is_completed BOOLEAN DEFAULT FALSE,
        updated_by INTEGER,
        updated_at TIMESTAMP
      )
    `);

    console.log("✅ roadmap tables created successfully");
  } catch (err) {
    console.error("❌ Error creating roadmap tables:", err.message);
  }
};

createRoadmapTables();
