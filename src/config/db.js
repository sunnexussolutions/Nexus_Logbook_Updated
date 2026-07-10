console.log("👉 db.js file loaded");

const { Pool, types } = require("pg");

// TIMESTAMP without time zone is OID 1114.
// Since we strictly force 'Asia/Kolkata' timezone on all connections, all
// timestamp without time zone fields from DB reflect IST time implicitly.
// We must append '+05:30' so the JS Date absolute UTC time is correctly represented.
types.setTypeParser(1114, str => new Date(str + "+05:30"));

const pool = new Pool({
  connectionString: `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
  ssl: {
    rejectUnauthorized: false,
  },
});

// 🔥 FORCE search_path and timezone for every new connection
pool.on("connect", async (client) => {
  try {
    await client.query("SET search_path TO public");
    await client.query("SET timezone = 'Asia/Kolkata'");
    console.log("✅ search_path=public, timezone=Asia/Kolkata");
  } catch (err) {
    console.error("❌ Failed to set session config:", err.message);
  }
});

// 🔥 Force a test connection
(async () => {
  try {
    await pool.query("SELECT 1");
    console.log("✅ PostgreSQL connected successfully");
  } catch (err) {
    console.error("❌ PostgreSQL connection failed:", err.message);
  }
})();

module.exports = pool;