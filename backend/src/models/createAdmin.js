// Load env variables
require("dotenv").config();

const bcrypt = require("bcrypt");
const pool = require("../config/db");


const createAdmin = async () => {
  try {
    const hashedPassword = await bcrypt.hash("admin123", 10);

    await pool.query(
      `
      INSERT INTO users (user_id, name, email, password, role)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO NOTHING
      `,
      [
        "ADMIN001",
        "Super Admin",
        "admin@startup.com",
        hashedPassword,
        "ADMIN",
      ]
    );

    console.log("✅ Admin user created successfully");
  } catch (err) {
    console.error("❌ Error creating admin:", err.message);
  }
};

createAdmin();
