require("dotenv").config();

const bcrypt = require("bcrypt");
const pool = require("./src/config/db");

(async () => {
  try {
    const users = [
      { user_id: "ADMIN001", password: "admin123" },
      { user_id: "TL001", password: "frontend123" },
      { user_id: "TM001", password: "frontend123" },
    ];

    for (let u of users) {
      const hash = await bcrypt.hash(u.password, 10);
      await pool.query(
        "UPDATE users SET password = $1 WHERE user_id = $2",
        [hash, u.user_id]
      );
      console.log(`✅ Password reset for ${u.user_id}`);
    }

    console.log("🎉 All passwords reset successfully");
    process.exit(0);
  } catch (err) {
    console.error("❌ Password reset failed:", err.message);
    process.exit(1);
  }
})();
