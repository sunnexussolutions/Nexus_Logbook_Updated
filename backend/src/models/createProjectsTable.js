require("dotenv").config();
const pool = require("../config/db");


const createProjectsTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        project_name VARCHAR(100) NOT NULL,
        description TEXT,
        assigned_to INTEGER,
        status VARCHAR(30),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("✅ projects table created successfully");
  } catch (err) {
    console.error("❌ Error creating projects table:", err.message);
  }
};

createProjectsTable();
