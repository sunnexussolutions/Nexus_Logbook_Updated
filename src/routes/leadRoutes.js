const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");

const {
  getTeamLeadProjects,
  getLeadRoadmap
} = require("../controllers/projectController");


/* ================= TEAM LEAD ROUTES ================= */

// Get projects assigned to logged-in team lead
router.get("/my-projects", verifyToken, getTeamLeadProjects);

// Get roadmap for a project (team lead view)
router.get("/roadmap/:projectId", verifyToken, getLeadRoadmap);
// GET roadmap for team lead's project




module.exports = router;
