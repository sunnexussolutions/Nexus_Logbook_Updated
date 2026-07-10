require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();

/* ================= MIDDLEWARE ================= */
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

/* ================= ROUTES ================= */
const authRoutes = require("./src/routes/authRoutes");
const adminRoutes = require("./src/routes/adminRoutes");
const attendanceRoutes = require("./src/routes/attendanceRoutes");
const workReportRoutes = require("./src/routes/workReportRoutes");
const leadRoutes = require("./src/routes/leadRoutes");
const notificationRoutes = require("./src/routes/notificationRoutes");
const testRoutes = require("./src/routes/testRoutes");

app.get("/", (req, res) =>
  res.status(200).json({ status: "OK", message: "API is running" })
);
app.get("/health", (req, res) =>
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() })
);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/work", workReportRoutes);
app.use("/api/lead", leadRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/test", testRoutes);

/* ================= DB INIT (runs async, non-blocking) ================= */
(async () => {
  try {
    require("./src/config/db");
    require("./src/models/initDb");
    require("./src/models/createAttendanceTables");
    const createUserPausesTable = require("./src/models/createUserPausesTable");
    const addShiftCheckoutColumns = require("./src/models/addShiftCheckoutColumns");
    await createUserPausesTable();
    await addShiftCheckoutColumns();
  } catch (e) {
    console.error("DB init error (non-fatal):", e.message);
  }
})();

/* ================= 404 FALLBACK ================= */
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.path} not found` });
});

/* ================= EXPORT FOR VERCEL ================= */
module.exports = app;

/* ================= LOCAL SERVER ================= */
if (require.main === module) {
  const { autoCreateTodayAttendance } = require("./src/controllers/attendanceController");
  const runAttendanceAutomation = require("./src/jobs/attendanceCron");
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await autoCreateTodayAttendance();
    runAttendanceAutomation();
  });
}
