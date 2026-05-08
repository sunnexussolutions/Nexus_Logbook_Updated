

const express = require("express");
const router = express.Router();

const { verifyToken, isAdmin } = require("../middleware/authMiddleware");
const adminController = require("../controllers/adminController");


// ================= ADMIN CONTROLLER =================
const {
  createTeamLead,
  createTeamMember,
  deleteTeamMember,
  deleteTeamLead,
  toggleUserStatus,


} = require("../controllers/adminController");
const attendanceController = require("../controllers/attendanceController");

const shiftController = require("../controllers/shiftController");


const { getAllTeamLeads } = require("../controllers/adminController");

const { getTeamMembers } = require("../controllers/adminController");

// ================= PROJECT / ROADMAP CONTROLLER =================

const projectController = require("../controllers/projectController");
const {
  createProject,
  getTeamLeadProjects,
  assignMembersToProject,
  getProjectMembers,
  createRoadmap,
  getLeadRoadmap,
  updateRoadmapStep,
  addRoadmapStep,
  deleteRoadmapStep,
  getRoadmapProgress,
  getAllMembersForLead,
  getMemberRoadmaps
} = projectController;
const { getAllProjects } = require("../controllers/projectController");




const {
  autoProcessAttendance,
  getGeoSetting,
  updateGeoSetting,
  getOfficeSettings,
  updateOfficeSettings,
  getEarlyCheckoutsToday,
  getOvertimeToday
} = require("../controllers/adminAttendanceController");



const {
  forceCheckoutAll,
} = require("../controllers/adminAttendanceController");

const {
  getTodayAttendance,
  getDashboardSummary,
  getDailyAttendanceReport,
  getMonthlyAttendanceSummary,
  exportMonthlyAttendanceCSV,
  exportMonthlyAttendanceExcel,
  exportDailyAttendanceCSV,
  exportDailyAttendanceExcel
} = require("../controllers/adminAttendanceController");
const {
  getTodayAttendanceDashboard
} = require("../controllers/adminAttendanceController");
const { allowLateCheckIn } = require("../controllers/attendanceController");
const {
  getTodayAttendanceList
} = require("../controllers/attendanceController");
const {
  addHoliday,
  getHolidays,
  deleteHoliday
} = require("../controllers/attendanceController");

router.get(
  "/projects/export/excel",
  verifyToken,
  isAdmin,
  projectController.exportProjectsExcel
);

router.get(
  "/projects",
  verifyToken,
  isAdmin,
  getAllProjects
);

const {
  getProjectMembersForAdmin,
} = require("../controllers/adminController");

const {
  removeMemberFromProject
} = require("../controllers/adminController");
const adminWorkController = require("../controllers/adminWorkController");
const { toggleGeoSetting } =
  require("../controllers/adminAttendanceController");





/* ================= ADMIN ROUTES ================= */

// Admin dashboard
router.get("/dashboard", verifyToken, isAdmin, (req, res) => {
  res.json({ message: "Welcome Admin 👑" });
});

// Create team lead
router.post("/create-team-lead", verifyToken, isAdmin, createTeamLead);

// Create team member
router.post("/create-team-member", verifyToken, isAdmin, createTeamMember);



// Create project
//router.post("/create-project", verifyToken, isAdmin, createProject);
router.post("/projects", verifyToken, isAdmin, createProject);


// Set office timing (attendance)



const { deleteProject } = require("../controllers/projectController");


/* ================= TEAM LEAD ROUTES ================= */

// Team lead: view assigned projects
router.get("/my-projects", verifyToken, getTeamLeadProjects);

// Team lead: assign members to project
router.post("/assign-members", verifyToken, assignMembersToProject);

// View members of a project
router.get("/project-members/:project_id", verifyToken, getProjectMembers);

// Create roadmap
router.post("/create-roadmap", verifyToken, createRoadmap);

// Add a single roadmap step
router.post("/roadmap-step/add", verifyToken, addRoadmapStep);

// Delete a single roadmap step
router.delete("/roadmap-step/:step_id", verifyToken, deleteRoadmapStep);

// Update roadmap step (checkbox)
router.patch(
  "/roadmap-step",
  verifyToken,
  projectController.updateRoadmapStep
);


// Admin: view roadmap progress
router.get(
  "/roadmap-progress/:project_id",
  verifyToken,
  isAdmin,
  getRoadmapProgress
);
// Admin: force checkout all users
router.post(
  "/force-checkout",
  verifyToken,
  forceCheckoutAll
);
// Delete team member (Admin)
router.delete(
  "/team-member/:id",
  verifyToken,
  isAdmin,
  deleteTeamMember
);


router.get(
  "/dashboard/summary",
  verifyToken,
  getDashboardSummary
);

router.get(
  "/attendance/monthly",
  verifyToken,
  getMonthlyAttendanceSummary
);
router.get(
  "/attendance/monthly/export",
  verifyToken,
  exportMonthlyAttendanceCSV
);
router.get(
  "/attendance/monthly/export-excel",
  verifyToken,
  exportMonthlyAttendanceExcel
);

router.get(
  "/attendance/today",
  verifyToken,
  getTodayAttendanceDashboard
);
// Delete team lead (Admin)
router.delete(
  "/team-lead/:id",
  verifyToken,
  isAdmin,
  deleteTeamLead
);
// Delete project (Admin)

router.get(
  "/admin-project-members/:project_id",
  verifyToken,
  isAdmin,
  getProjectMembersForAdmin
);
router.get(
  "/roadmap/member",
  verifyToken,
  projectController.getMemberRoadmaps
);
router.get(
  "/roadmap/:project_id",
  verifyToken,
  getLeadRoadmap
);

router.get(
  "/team-members/export/excel",
  verifyToken,
  isAdmin,
  adminController.exportEmployeesExcel
);

router.get(
  "/team-members",
  verifyToken,
  isAdmin,
  getTeamMembers
);

router.delete(
  "/project/:project_id/member/:member_id",
  verifyToken,
  isAdmin,
  removeMemberFromProject
);
router.delete(
  "/projects/:id",
  verifyToken,
  isAdmin,
  deleteProject
);

// Lead: mark project as completed
router.patch(
  "/projects/:id/complete",
  verifyToken,
  projectController.completeProject
);

router.post(
  "/attendance/auto-process",
  verifyToken,
  isAdmin,
  autoProcessAttendance
);
router.post(
  "/attendance/allow-late/:userId",
  verifyToken,
  isAdmin,
  allowLateCheckIn
);




router.get("/team-leads", verifyToken, isAdmin, getAllTeamLeads);

router.get(
  "/attendance/today/list",
  verifyToken,
  isAdmin,
  getTodayAttendanceList
);

router.get(
  "/work-reports",
  verifyToken,
  isAdmin,
  adminWorkController.getAllWorkReports
);
router.get(
  "/work-reports/missing-today",
  verifyToken,
  isAdmin,
  adminWorkController.getUsersMissingDailyReport
);
router.get(
  "/compliance/today",
  verifyToken,
  isAdmin,
  adminWorkController.getTodayCompliance
);

router.get(
  "/compliance/weekly",
  verifyToken,
  isAdmin,
  adminWorkController.getWeeklyCompliance
);
router.get(
  "/lead/members",
  verifyToken,
  getAllMembersForLead
);
router.get(
  "/work-reports/export/csv",
  verifyToken,
  isAdmin,
  adminWorkController.exportWorkReportsCSV
);

router.get(
  "/work-reports/export/excel",
  verifyToken,
  isAdmin,
  adminWorkController.exportWorkReportsExcel
);

// ===== WEEKLY REPORTS =====
router.get(
  "/weekly-reports",
  verifyToken,
  isAdmin,
  adminWorkController.getAllWeeklyReports
);

router.get(
  "/weekly-reports/export/excel",
  verifyToken,
  isAdmin,
  adminWorkController.exportWeeklyReportsExcel
);

router.get(
  "/member/roadmap",
  verifyToken,
  projectController.getMemberRoadmaps
);

router.get(
  "/my-project-stats",
  verifyToken,
  projectController.getMyProjectStats
);

router.post("/shifts", verifyToken, isAdmin, shiftController.createShift);
router.get("/shifts", verifyToken, isAdmin, shiftController.getAllShifts);
router.put(
  "/shifts/:id",
  verifyToken,
  isAdmin,
  shiftController.updateShift
);
router.delete(
  "/shifts/:id",
  verifyToken,
  isAdmin,
  shiftController.deleteShift
);


router.post("/assign-shift", verifyToken, isAdmin, shiftController.assignShiftToUser);

router.get(
  "/attendance/late-users",
  verifyToken,
  attendanceController.getLateUsersToday
);

router.post(
  "/attendance/approve-late",
  verifyToken,
  attendanceController.allowLateCheckIn
);
router.get(
  "/work-reports/today",
  verifyToken,
  isAdmin,
  adminWorkController.getTodayWorkReportDashboard
);

router.get(
  "/missed-checkouts",
  verifyToken,
  isAdmin,
  adminWorkController.getMissedCheckouts
);
router.get(
  "/attendance/daily/export/csv",
  verifyToken,
  isAdmin,
  exportDailyAttendanceCSV
);

router.get(
  "/attendance/daily/export/excel",
  verifyToken,
  isAdmin,
  exportDailyAttendanceExcel
);
router.put(
  "/settings/geo",
  verifyToken,
  isAdmin,
  toggleGeoSetting
);

router.get(
  "/settings/geo-status",
  verifyToken,
  isAdmin,
  getGeoSetting
);
router.put(
  "/geo-setting",
  verifyToken,
  isAdmin,
  updateGeoSetting
);
router.get(
  "/geo-setting",
  verifyToken,
  isAdmin,
  getGeoSetting
);

router.get(
  "/leave-requests",
  verifyToken,
  isAdmin,
  adminController.getAllLeaveRequests
);

router.put(
  "/leave-requests/:id",
  verifyToken,
  isAdmin,
  adminController.reviewLeaveRequest
);

router.get("/holidays", verifyToken, isAdmin, getHolidays);
router.post("/holidays", verifyToken, isAdmin, addHoliday);
router.delete("/holidays/:id", verifyToken, isAdmin, deleteHoliday);

/* ================= OFFICE SETTINGS ROUTES ================= */
router.get("/office-settings", verifyToken, isAdmin, getOfficeSettings);
router.put("/office-settings", verifyToken, isAdmin, updateOfficeSettings);

/* ================= EARLY CHECKOUT / OVERTIME ================= */
router.get("/attendance/early-checkouts", verifyToken, isAdmin, getEarlyCheckoutsToday);
router.get("/attendance/overtime", verifyToken, isAdmin, getOvertimeToday);

/* ================== ANNOUNCEMENTS ================== */
const { broadcastAnnouncement, sendPersonalMessage } = require("../controllers/adminController");
router.post("/announcements", verifyToken, isAdmin, broadcastAnnouncement);
router.post("/send-message", verifyToken, isAdmin, sendPersonalMessage);
router.patch("/team-member/:id/status", verifyToken, isAdmin, toggleUserStatus);


module.exports = router;
