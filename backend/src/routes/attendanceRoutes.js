const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");

const { checkIn, checkOut, getMyTodayStatus } = require("../controllers/attendanceController");
const attendanceController = require("../controllers/attendanceController");

router.post("/check-in", verifyToken, checkIn);
router.post("/check-out", verifyToken, checkOut);
router.get("/my-status", verifyToken, getMyTodayStatus);
router.post("/apply-leave", verifyToken, attendanceController.applyLeave);
router.get("/my-history", verifyToken, attendanceController.getMyAttendanceHistory);
router.get("/my-leave-balance", verifyToken, attendanceController.getMyLeaveBalance);
router.get("/my-leave-requests", verifyToken, attendanceController.getMyLeaveRequests);
router.get("/my-percentage", verifyToken, attendanceController.getMyAttendancePercentage);
router.get("/my-overall-percentage", verifyToken, attendanceController.getMyOverallAttendancePercentage);

module.exports = router;
