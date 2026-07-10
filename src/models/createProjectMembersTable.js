require("dotenv").config();
const pool = require("../config/db");


const createProjectMembersTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_members (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL,
        member_id INTEGER NOT NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("✅ project_members table created successfully");
  } catch (err) {
    console.error("❌ Error creating project_members table:", err.message);
  }
};

createProjectMembersTable();
