const pool = require("../config/db");
const { todayIST, getWeekRangeIST } = require("../utils/istTime");

/* ================= HELPER: WEEK RANGE ================= */
const getWeekRange = () => getWeekRangeIST();

/* ================= DAILY REPORT ================= */
exports.submitDailyReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, work_done } = req.body;

    if (!work_done) {
      return res.status(400).json({ message: "Work details are required" });
    }

    const today = todayIST();

    await pool.query(
      `INSERT INTO work_reports (user_id, report_type, report_date, title, work_done)
       VALUES ($1, 'DAILY', $2, $3, $4)`,
      [userId, today, title || null, work_done]
    );

    res.json({ message: "Daily work report submitted" });

  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ message: "Daily report already submitted" });
    }
    console.error("Daily report error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= WEEKLY REPORT ================= */
exports.submitWeeklyReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, work_done, skills_learned, project_update } = req.body;

    if (!work_done || !skills_learned || !project_update) {
      return res.status(400).json({ message: "All weekly report fields are required (work done, skills learned, and project update)" });
    }

    const { weekStart, weekEnd } = getWeekRange();

    await pool.query(
      `INSERT INTO work_reports (user_id, report_type, week_start, week_end, title, work_done, skills_learned, project_update)
       VALUES ($1, 'WEEKLY', $2, $3, $4, $5, $6, $7)`,
      [userId, weekStart, weekEnd, title || null, work_done, skills_learned, project_update]
    );

    res.json({ message: "Weekly report submitted successfully" });

  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ message: "Weekly report already submitted for this week" });
    }
    console.error("Weekly report error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getMyReports = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type } = req.query;

    if (!["DAILY", "WEEKLY"].includes(type)) {
      return res.status(400).json({ message: "Invalid report type" });
    }

    const result = await pool.query(
      `SELECT id, report_type, report_date, week_start, week_end, title, work_done,
              skills_learned, project_update, created_at
       FROM work_reports
       WHERE user_id = $1 AND report_type = $2
       ORDER BY created_at DESC`,
      [userId, type]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Get my reports error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= CHECK TODAY'S REPORT ================= */
exports.checkTodayReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const today = todayIST();

    const result = await pool.query(
      `SELECT 1 FROM work_reports
       WHERE user_id = $1 AND report_type = 'DAILY' AND report_date = $2
       LIMIT 1`,
      [userId, today]
    );

    res.json({ submitted: result.rows.length > 0 });

  } catch (err) {
    console.error("Check today report error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= CHECK THIS WEEK'S REPORT ================= */
exports.checkWeeklyReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const { weekStart } = getWeekRange();

    const result = await pool.query(
      `SELECT 1 FROM work_reports
       WHERE user_id = $1 AND report_type = 'WEEKLY' AND week_start = $2
       LIMIT 1`,
      [userId, weekStart]
    );

    res.json({ submitted: result.rows.length > 0 });

  } catch (err) {
    console.error("Check weekly report error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= PENDING MISSED CHECKOUTS ================= */
exports.getPendingMissed = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, date, auto_checkout_at FROM missed_checkouts
       WHERE user_id = $1 AND status = 'PENDING' ORDER BY date DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get pending missed error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= SUBMIT MISSED REPORT ================= */
exports.submitMissedReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id, work_done, late_reason } = req.body;

    if (!work_done || !late_reason) {
      return res.status(400).json({ message: "Work done and reason are required" });
    }

    const check = await pool.query(
      `SELECT id, date FROM missed_checkouts WHERE id = $1 AND user_id = $2 AND status = 'PENDING'`,
      [id, userId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ message: "Record not found" });
    }

    const missedDate = check.rows[0].date;

    await pool.query(
      `UPDATE missed_checkouts SET work_done = $1, late_reason = $2, submitted_at = NOW(), status = 'SUBMITTED' WHERE id = $3`,
      [work_done, late_reason, id]
    );

    // Also insert actual daily work report for that date
    try {
      await pool.query(
        `INSERT INTO work_reports (user_id, report_type, report_date, work_done) VALUES ($1, 'DAILY', $2, $3)`,
        [userId, missedDate, work_done]
      );
    } catch (dupErr) {
      if (dupErr.code !== '23505') throw dupErr;
    }

    res.json({ message: "Late report submitted successfully" });
  } catch (err) {
    console.error("Submit missed report error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
