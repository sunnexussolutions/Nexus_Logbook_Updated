const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const workReportController = require("../controllers/workReportController");

router.post("/daily", authMiddleware.verifyToken, workReportController.submitDailyReport);
router.post("/weekly", authMiddleware.verifyToken, workReportController.submitWeeklyReport);
router.get("/my", authMiddleware.verifyToken, workReportController.getMyReports);
router.get("/check-today", authMiddleware.verifyToken, workReportController.checkTodayReport);
router.get("/check-weekly", authMiddleware.verifyToken, workReportController.checkWeeklyReport);

// Missed checkout (auto-checkout) routes
router.get("/pending-missed", authMiddleware.verifyToken, workReportController.getPendingMissed);
router.post("/submit-missed", authMiddleware.verifyToken, workReportController.submitMissedReport);

module.exports = router;
