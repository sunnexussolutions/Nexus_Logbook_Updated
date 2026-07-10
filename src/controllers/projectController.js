const pool = require("../config/db");
const { nowIST } = require('../utils/istTime');


// Admin: create project
exports.createProject = async (req, res) => {
  try {
    const { project_name, description, team_lead_id } = req.body;

    // 🔐 VALIDATION
    if (!project_name || !team_lead_id) {
      return res.status(400).json({
        message: "Project name and Team Lead are required"
      });
    }

    await pool.query(
      `
      INSERT INTO projects (project_name, description, assigned_to, status)
      VALUES ($1, $2, $3, 'ASSIGNED')
      `,
      [project_name, description || null, Number(team_lead_id)]
    );

    res.json({ message: "Project created successfully" });
  } catch (err) {
    console.error("Create project error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


// Team Lead: view assigned projects
exports.getTeamLeadProjects = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT * FROM projects
      WHERE assigned_to = $1
      `,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// Team Lead: assign members
exports.assignMembersToProject = async (req, res) => {
  try {
    const { project_id, member_ids } = req.body;

    // Verify project belongs to this team lead
    const projectCheck = await pool.query(
      "SELECT id FROM projects WHERE id = $1 AND assigned_to = $2",
      [project_id, req.user.id]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Begin member replacement
    // First, remove existing members for this project
    await pool.query(
      "DELETE FROM project_members WHERE project_id = $1",
      [project_id]
    );

    // Then, insert the newly selected members
    for (const memberId of member_ids) {
      await pool.query(
        `
        INSERT INTO project_members (project_id, member_id, selected_by)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
        `,
        [project_id, memberId, req.user.id]
      );
    }

    res.json({ message: "Members assigned successfully" });

  } catch (err) {
    console.error("Assign members error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Team Lead: view project members
exports.getProjectMembers = async (req, res) => {
  try {
    const { project_id } = req.params;

    const result = await pool.query(
      `
      SELECT u.id, u.user_id, u.name, u.email, u.domain
      FROM project_members pm
      JOIN users u ON pm.member_id = u.id
      WHERE pm.project_id = $1
      `,
      [project_id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// Team Lead: create roadmap
// Team Lead: create roadmap (original version)
exports.createRoadmap = async (req, res) => {
  try {
    const { project_id, steps } = req.body;
    const userId = req.user.id;

    if (!project_id || !Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ message: "Invalid roadmap data" });
    }

    // Verify project belongs to this team lead
    const projectCheck = await pool.query(
      `
      SELECT id
      FROM projects
      WHERE id = $1
        AND assigned_to = $2
      `,
      [project_id, userId]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(403).json({ message: "Not authorized for this project" });
    }

    // Create roadmap (new one every time)
    const roadmapResult = await pool.query(
      `
      INSERT INTO roadmaps (project_id, created_by)
      VALUES ($1, $2)
      RETURNING id
      `,
      [project_id, userId]
    );

    const roadmapId = roadmapResult.rows[0].id;

    // Insert steps
    for (const step of steps) {
      await pool.query(
        `
        INSERT INTO roadmap_steps (roadmap_id, step_title)
        VALUES ($1, $2)
        `,
        [roadmapId, step]
      );
    }

    res.json({ message: "Roadmap created successfully" });

  } catch (err) {
    console.error("Create roadmap error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Team Lead / Member: update roadmap step status
exports.updateRoadmapStep = async (req, res) => {
  try {
    const { step_id, is_completed } = req.body;

    await pool.query(
      `
      UPDATE roadmap_steps
      SET 
        is_completed = $1,
        updated_by = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      `,
      [is_completed, req.user.id, step_id]
    );

    res.json({ message: "Roadmap step updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Team Lead: Add a single step to an existing roadmap
exports.addRoadmapStep = async (req, res) => {
  try {
    const { project_id, step_title } = req.body;
    const userId = req.user.id;

    if (!project_id || !step_title) {
      return res.status(400).json({ message: "Invalid roadmap step data" });
    }

    // Verify project belongs to this team lead
    const projectCheck = await pool.query(
      `SELECT id FROM projects WHERE id = $1 AND assigned_to = $2`,
      [project_id, userId]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(403).json({ message: "Not authorized for this project" });
    }

    // Find roadmap for this project, or create one if it doesn't exist
    let roadmapResult = await pool.query(
      `SELECT id FROM roadmaps WHERE project_id = $1`,
      [project_id]
    );

    let roadmapId;
    if (roadmapResult.rows.length > 0) {
      roadmapId = roadmapResult.rows[0].id;
    } else {
      const newRoadmap = await pool.query(
        `INSERT INTO roadmaps (project_id, created_by) VALUES ($1, $2) RETURNING id`,
        [project_id, userId]
      );
      roadmapId = newRoadmap.rows[0].id;
    }

    // Insert new step
    const stepResult = await pool.query(
      `
      INSERT INTO roadmap_steps (roadmap_id, step_title)
      VALUES ($1, $2)
      RETURNING id, step_title
      `,
      [roadmapId, step_title]
    );

    res.json({ message: "Step added successfully", step: stepResult.rows[0] });

  } catch (err) {
    console.error("Add roadmap step error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Team Lead: Delete a roadmap step
exports.deleteRoadmapStep = async (req, res) => {
  try {
    const { step_id } = req.params;
    const userId = req.user.id;

    // Verify step belongs to a project assigned to this lead
    const stepCheck = await pool.query(
      `
      SELECT rs.id 
      FROM roadmap_steps rs
      JOIN roadmaps r ON rs.roadmap_id = r.id
      JOIN projects p ON r.project_id = p.id
      WHERE rs.id = $1 AND p.assigned_to = $2
      `,
      [step_id, userId]
    );

    if (stepCheck.rows.length === 0) {
      return res.status(403).json({ message: "Not authorized to delete this step" });
    }

    await pool.query(`DELETE FROM roadmap_steps WHERE id = $1`, [step_id]);

    res.json({ message: "Step deleted successfully" });
  } catch (err) {
    console.error("Delete roadmap step error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
// Admin: view roadmap progress for a project
exports.getRoadmapProgress = async (req, res) => {
  try {
    const { project_id } = req.params;

    const stepsResult = await pool.query(
      `
      SELECT 
        rs.id,
        rs.step_title,
        rs.is_completed,
        u.name AS updated_by,
        rs.updated_at
      FROM roadmap_steps rs
      JOIN roadmaps r ON rs.roadmap_id = r.id
      LEFT JOIN users u ON rs.updated_by = u.id
      WHERE r.project_id = $1
      ORDER BY rs.id
      `,
      [project_id]
    );

    // ✅ STEP 2 FIX: handle NO roadmap / NO steps clearly
    if (stepsResult.rows.length === 0) {
      return res.json({
        progress: "0%",
        steps: [],
        message: "No roadmap created yet"
      });
    }

    const total = stepsResult.rows.length;
    const completed = stepsResult.rows.filter(
      step => step.is_completed
    ).length;

    const progress = Math.round((completed / total) * 100);

    res.json({
      progress: `${progress}%`,
      steps: stepsResult.rows
    });

  } catch (err) {
    console.error("Get roadmap progress error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getAllProjects = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.id,
        p.project_name,
        p.description,
        p.status,
        p.created_at,
        u.name AS team_lead_name,
        u.user_id AS team_lead_code,
        COALESCE(mc.member_count, 0)::int AS member_count,
        COALESCE(rs_total.total_steps, 0)::int AS total_steps,
        COALESCE(rs_done.completed_steps, 0)::int AS completed_steps
      FROM projects p
      LEFT JOIN users u ON u.id = p.assigned_to
      LEFT JOIN (
        SELECT project_id, COUNT(*)::int AS member_count
        FROM project_members
        GROUP BY project_id
      ) mc ON mc.project_id = p.id
      LEFT JOIN (
        SELECT r.project_id, COUNT(rs.id)::int AS total_steps
        FROM roadmaps r
        JOIN roadmap_steps rs ON rs.roadmap_id = r.id
        GROUP BY r.project_id
      ) rs_total ON rs_total.project_id = p.id
      LEFT JOIN (
        SELECT r.project_id, COUNT(rs.id)::int AS completed_steps
        FROM roadmaps r
        JOIN roadmap_steps rs ON rs.roadmap_id = r.id
        WHERE rs.is_completed = true
        GROUP BY r.project_id
      ) rs_done ON rs_done.project_id = p.id
      ORDER BY
        CASE WHEN p.status = 'COMPLETED' THEN 1 ELSE 0 END,
        p.id DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Get all projects error:", err);
    res.status(500).json({ message: "Failed to fetch projects" });
  }
};

// ================= COMPLETE PROJECT (LEAD) =================
exports.completeProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;

    // Verify project belongs to this lead
    const projectCheck = await pool.query(
      `SELECT id, status FROM projects WHERE id = $1 AND assigned_to = $2`,
      [projectId, userId]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(403).json({ message: "Not authorized for this project" });
    }

    if (projectCheck.rows[0].status === 'COMPLETED') {
      return res.status(400).json({ message: "Project is already completed" });
    }

    await pool.query(
      `UPDATE projects SET status = 'COMPLETED' WHERE id = $1`,
      [projectId]
    );

    res.json({ message: "Project marked as completed" });

  } catch (err) {
    console.error("Complete project error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
// Team Lead: view roadmap for assigned project
exports.getLeadRoadmap = async (req, res) => {
  try {
    const projectId = req.params.project_id;
    const userId = req.user.id;

    console.log("JWT USER 👉", req.user);
    console.log("PROJECT ID 👉", projectId);

    // 1️⃣ Verify project belongs to this team lead
    const projectCheck = await pool.query(
      `
      SELECT id
      FROM projects
      WHERE id = $1
        AND assigned_to = $2
      `,
      [projectId, userId]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(403).json({ message: "Not authorized for this project" });
    }

    // 2️⃣ Load roadmap steps
    const stepsResult = await pool.query(
      `
      SELECT 
        rs.id,
        rs.step_title,
        rs.is_completed,
        u.name AS updated_by,
        rs.updated_at
      FROM roadmap_steps rs
      JOIN roadmaps r ON rs.roadmap_id = r.id
      LEFT JOIN users u ON rs.updated_by = u.id
      WHERE r.project_id = $1
      ORDER BY rs.id
      `,
      [projectId]
    );

    const total = stepsResult.rows.length;
    const completed = stepsResult.rows.filter(s => s.is_completed).length;

    const progress =
      total === 0 ? "0%" : `${Math.round((completed / total) * 100)}%`;

    res.json({
      progress,
      steps: stepsResult.rows
    });

  } catch (err) {
    console.error("Lead roadmap error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ================= DELETE PROJECT (ADMIN) =================
exports.deleteProject = async (req, res) => {
  const client = await pool.connect();

  try {
    const projectId = req.params.id;

    await client.query("BEGIN");

    // Check project exists
    const projectCheck = await client.query(
      `SELECT id FROM projects WHERE id = $1`,
      [projectId]
    );

    if (projectCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Project not found" });
    }

    // Delete project members
    await client.query(
      `DELETE FROM project_members WHERE project_id = $1`,
      [projectId]
    );

    // Delete roadmap steps
    await client.query(`
      DELETE FROM roadmap_steps
      WHERE roadmap_id IN (
        SELECT id FROM roadmaps WHERE project_id = $1
      )
    `, [projectId]);

    // Delete roadmap
    await client.query(
      `DELETE FROM roadmaps WHERE project_id = $1`,
      [projectId]
    );

    // Delete project
    await client.query(
      `DELETE FROM projects WHERE id = $1`,
      [projectId]
    );

    await client.query("COMMIT");

    res.json({ message: "Project deleted successfully" });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Delete project error:", err);
    res.status(500).json({ message: "Server error while deleting project" });
  } finally {
    client.release();
  }
};
exports.getProjectWithMembers = async (req, res) => {
  try {
    const { projectId } = req.params;

    // Project + Team Lead
    const projectResult = await pool.query(
      `
      SELECT 
        p.id,
        p.project_name,
        u.id AS team_lead_id,
        u.name AS team_lead_name,
        u.user_id AS team_lead_code
      FROM projects p
      JOIN users u ON u.id = p.assigned_to
      WHERE p.id = $1
      `,
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Only MEMBERS (not team lead)
    const membersResult = await pool.query(
      `
      SELECT 
        u.id,
        u.user_id,
        u.name,
        u.email,
        u.domain
      FROM project_members pm
      JOIN users u ON u.id = pm.member_id
      WHERE pm.project_id = $1
        AND u.role = 'MEMBER'
      ORDER BY u.name
      `,
      [projectId]
    );

    res.json({
      project: projectResult.rows[0],
      members: membersResult.rows
    });

  } catch (err) {
    console.error("Admin project members error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
// Team Lead: get all members (multi-project allowed)
exports.getAllMembersForLead = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        user_id,
        name,
        email,
        domain
      FROM users
      WHERE role = 'MEMBER'
      ORDER BY name
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Get members for lead error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
// Member: get all assigned project roadmaps

// MEMBER: get assigned project
// MEMBER: get roadmap for assigned project
exports.getMemberRoadmaps = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(`
      SELECT
        p.id AS project_id,
        p.project_name,
        rs.id AS step_id,
        rs.step_title,
        rs.is_completed
      FROM project_members pm
      JOIN projects p ON p.id = pm.project_id
      LEFT JOIN roadmaps r ON r.project_id = p.id
      LEFT JOIN roadmap_steps rs ON rs.roadmap_id = r.id
      WHERE pm.member_id = $1
      ORDER BY p.id, rs.id
    `, [userId]);

    if (result.rows.length === 0) {
      return res.json([]);
    }

    const projects = {};

    result.rows.forEach(row => {
      if (!projects[row.project_id]) {
        projects[row.project_id] = {
          project_id: row.project_id,
          project_name: row.project_name,
          steps: []
        };
      }

      if (row.step_id) {
        projects[row.project_id].steps.push({
          id: row.step_id,
          step_title: row.step_title,
          is_completed: row.is_completed
        });
      }
    });

    res.json(Object.values(projects));

  } catch (err) {
    console.error("Member roadmap error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ================= MY PROJECT STATS (MEMBER / LEAD) =================
exports.getMyProjectStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let activeQuery, completedQuery;

    if (userRole === "TEAM_LEAD") {
      activeQuery = `
        SELECT p.id, p.project_name, p.created_at, p.status,
          COALESCE(mc.cnt, 0)::int AS member_count,
          COALESCE(rs_t.total, 0)::int AS total_steps,
          COALESCE(rs_d.done, 0)::int AS completed_steps
        FROM projects p
        LEFT JOIN (SELECT project_id, COUNT(*)::int AS cnt FROM project_members GROUP BY project_id) mc ON mc.project_id = p.id
        LEFT JOIN (SELECT r.project_id, COUNT(rs.id)::int AS total FROM roadmaps r JOIN roadmap_steps rs ON rs.roadmap_id = r.id GROUP BY r.project_id) rs_t ON rs_t.project_id = p.id
        LEFT JOIN (SELECT r.project_id, COUNT(rs.id)::int AS done FROM roadmaps r JOIN roadmap_steps rs ON rs.roadmap_id = r.id WHERE rs.is_completed = true GROUP BY r.project_id) rs_d ON rs_d.project_id = p.id
        WHERE p.assigned_to = $1 AND p.status != 'COMPLETED'
        ORDER BY p.created_at DESC
      `;
      completedQuery = `
        SELECT p.id, p.project_name, p.created_at, p.status,
          COALESCE(mc.cnt, 0)::int AS member_count
        FROM projects p
        LEFT JOIN (SELECT project_id, COUNT(*)::int AS cnt FROM project_members GROUP BY project_id) mc ON mc.project_id = p.id
        WHERE p.assigned_to = $1 AND p.status = 'COMPLETED'
        ORDER BY p.created_at DESC
      `;
    } else {
      activeQuery = `
        SELECT p.id, p.project_name, p.created_at, p.status,
          u.name AS team_lead_name,
          COALESCE(rs_t.total, 0)::int AS total_steps,
          COALESCE(rs_d.done, 0)::int AS completed_steps
        FROM project_members pm
        JOIN projects p ON p.id = pm.project_id
        LEFT JOIN users u ON u.id = p.assigned_to
        LEFT JOIN (SELECT r.project_id, COUNT(rs.id)::int AS total FROM roadmaps r JOIN roadmap_steps rs ON rs.roadmap_id = r.id GROUP BY r.project_id) rs_t ON rs_t.project_id = p.id
        LEFT JOIN (SELECT r.project_id, COUNT(rs.id)::int AS done FROM roadmaps r JOIN roadmap_steps rs ON rs.roadmap_id = r.id WHERE rs.is_completed = true GROUP BY r.project_id) rs_d ON rs_d.project_id = p.id
        WHERE pm.member_id = $1 AND p.status != 'COMPLETED'
        ORDER BY p.created_at DESC
      `;
      completedQuery = `
        SELECT p.id, p.project_name, p.created_at, p.status,
          u.name AS team_lead_name
        FROM project_members pm
        JOIN projects p ON p.id = pm.project_id
        LEFT JOIN users u ON u.id = p.assigned_to
        WHERE pm.member_id = $1 AND p.status = 'COMPLETED'
        ORDER BY p.created_at DESC
      `;
    }

    const activeResult = await pool.query(activeQuery, [userId]);
    const completedResult = await pool.query(completedQuery, [userId]);

    const now = nowIST();
    const activeProjects = activeResult.rows.map(p => {
      const created = new Date(p.created_at);
      const daysElapsed = Math.max(1, Math.ceil((now - created) / (1000 * 60 * 60 * 24)));
      const progress = p.total_steps > 0 ? Math.round((p.completed_steps / p.total_steps) * 100) : 0;
      return { ...p, days_elapsed: daysElapsed, progress };
    });

    const completedProjects = completedResult.rows.map(p => {
      const created = new Date(p.created_at);
      const daysTaken = Math.max(1, Math.ceil((now - created) / (1000 * 60 * 60 * 24)));
      return { ...p, days_taken: daysTaken };
    });

    res.json({
      status: activeProjects.length > 0 ? "ASSIGNED" : "FREE",
      active_count: activeProjects.length,
      completed_count: completedProjects.length,
      active_projects: activeProjects,
      completed_projects: completedProjects
    });

  } catch (err) {
    console.error("Project stats error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ================= EXPORT PROJECTS TO EXCEL =================
const ExcelJS = require("exceljs");

exports.exportProjectsExcel = async (req, res) => {
  try {
    // ── 1. All projects with stats ──
    const result = await pool.query(`
      SELECT
        p.id,
        p.project_name,
        p.description,
        p.status,
        p.created_at,
        u.name AS team_lead_name,
        u.user_id AS team_lead_code,
        COALESCE(mc.member_count, 0)::int AS member_count,
        COALESCE(rs_total.total_steps, 0)::int AS total_steps,
        COALESCE(rs_done.completed_steps, 0)::int AS completed_steps
      FROM projects p
      LEFT JOIN users u ON u.id = p.assigned_to
      LEFT JOIN (
        SELECT project_id, COUNT(*)::int AS member_count
        FROM project_members
        GROUP BY project_id
      ) mc ON mc.project_id = p.id
      LEFT JOIN (
        SELECT r.project_id, COUNT(rs.id)::int AS total_steps
        FROM roadmaps r
        JOIN roadmap_steps rs ON rs.roadmap_id = r.id
        GROUP BY r.project_id
      ) rs_total ON rs_total.project_id = p.id
      LEFT JOIN (
        SELECT r.project_id, COUNT(rs.id)::int AS completed_steps
        FROM roadmaps r
        JOIN roadmap_steps rs ON rs.roadmap_id = r.id
        WHERE rs.is_completed = true
        GROUP BY r.project_id
      ) rs_done ON rs_done.project_id = p.id
      ORDER BY
        CASE WHEN p.status = 'COMPLETED' THEN 1 ELSE 0 END,
        p.id DESC
    `);

    const projects = result.rows;

    // ── 2. Get members for each project ──
    const membersResult = await pool.query(`
      SELECT pm.project_id, u.name, u.user_id, u.email, u.domain
      FROM project_members pm
      JOIN users u ON u.id = pm.member_id
      ORDER BY pm.project_id, u.name
    `);

    const membersByProject = {};
    membersResult.rows.forEach(m => {
      if (!membersByProject[m.project_id]) membersByProject[m.project_id] = [];
      membersByProject[m.project_id].push(m);
    });

    // ── 3. Stats ──
    const totalProjects = projects.length;
    const ongoingCount = projects.filter(p => p.status !== "COMPLETED").length;
    const completedCount = projects.filter(p => p.status === "COMPLETED").length;
    const totalMembers = projects.reduce((s, p) => s + p.member_count, 0);

    // ── 4. Colors & Styles ──
    const BLUE = "1F4E79";
    const DARK_BLUE = "0D3B66";
    const WHITE = "FFFFFF";
    const BLACK = "000000";
    const LIGHT_BLUE = "D6E4F0";
    const GREEN = "00875A";
    const ORANGE = "FF8B00";

    const thinBorder = {
      top: { style: "thin" }, left: { style: "thin" },
      bottom: { style: "thin" }, right: { style: "thin" }
    };

    // ── 5. Build workbook ──
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SUN NEXUS SOLUTIONS";
    const sheet = workbook.addWorksheet("Projects Report");

    sheet.columns = [
      { width: 6 },   // A - #
      { width: 24 },  // B - Project Name
      { width: 30 },  // C - Description
      { width: 18 },  // D - Team Lead
      { width: 10 },  // E - Members
      { width: 18 },  // F - Roadmap Progress
      { width: 14 },  // G - Status
      { width: 16 },  // H - Created
    ];

    // ═══════ ROW 1: Company Title ═══════
    sheet.mergeCells("A1:H1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "SUN NEXUS SOLUTIONS — Projects Report";
    titleCell.font = { name: "Calibri", size: 16, bold: true, color: { argb: DARK_BLUE } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 36;

    // ═══════ ROW 3: Summary Header ═══════
    const sRow = 3;
    sheet.mergeCells("A" + sRow + ":D" + sRow);
    const sumHeader = sheet.getCell("A" + sRow);
    sumHeader.value = "Project Portfolio Summary";
    sumHeader.font = { name: "Calibri", size: 13, bold: true, color: { argb: BLACK } };
    sumHeader.alignment = { horizontal: "center", vertical: "middle" };
    sumHeader.border = thinBorder;
    sheet.mergeCells("E" + sRow + ":H" + sRow);
    sheet.getCell("E" + sRow).border = thinBorder;

    const summaryItems = [
      ["Total Projects:", totalProjects],
      ["Ongoing:", ongoingCount],
      ["Completed:", completedCount],
      ["Total Members Assigned:", totalMembers],
    ];

    summaryItems.forEach((item, i) => {
      const rowIdx = sRow + 1 + i;
      sheet.mergeCells("A" + rowIdx + ":D" + rowIdx);
      const lbl = sheet.getCell("A" + rowIdx);
      lbl.value = item[0];
      lbl.font = { name: "Calibri", size: 11, bold: true };
      lbl.alignment = { horizontal: "right", vertical: "middle" };
      lbl.border = thinBorder;

      sheet.mergeCells("E" + rowIdx + ":H" + rowIdx);
      const val = sheet.getCell("E" + rowIdx);
      val.value = item[1];
      val.font = { name: "Calibri", size: 11, bold: true, color: { argb: BLUE } };
      val.alignment = { horizontal: "left", vertical: "middle" };
      val.border = thinBorder;
    });

    // ═══════ Section Title ═══════
    const secRow = sRow + summaryItems.length + 2;
    sheet.mergeCells("A" + secRow + ":H" + secRow);
    const secTitle = sheet.getCell("A" + secRow);
    secTitle.value = "All Projects — Detailed Overview";
    secTitle.font = { name: "Calibri", size: 13, bold: true, color: { argb: BLACK } };
    secTitle.alignment = { horizontal: "center", vertical: "middle" };
    secTitle.border = thinBorder;
    sheet.getRow(secRow).height = 28;

    // ═══════ Table Header ═══════
    const hdrRow = secRow + 1;
    const headers = ["#", "Project Name", "Description", "Team Lead", "Members", "Roadmap Progress", "Status", "Created"];
    const hRow = sheet.getRow(hdrRow);
    headers.forEach((h, i) => {
      const cell = hRow.getCell(i + 1);
      cell.value = h;
      cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: WHITE } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = thinBorder;
    });
    hRow.height = 24;

    // ═══════ Data Rows ═══════
    let dataIdx = hdrRow + 1;

    projects.forEach((p, i) => {
      const row = sheet.getRow(dataIdx);
      const progress = p.total_steps > 0
        ? Math.round((p.completed_steps / p.total_steps) * 100) + "%"
        : "No roadmap";
      const progressDetail = p.total_steps > 0
        ? p.completed_steps + "/" + p.total_steps + " steps"
        : "";

      const created = p.created_at
        ? new Date(p.created_at).toLocaleDateString("en-IN", {
          day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata"
        })
        : "—";

      const isCompleted = p.status === "COMPLETED";
      const statusColor = isCompleted ? GREEN : ORANGE;

      const vals = [
        i + 1,
        p.project_name,
        p.description || "—",
        p.team_lead_name ? p.team_lead_name + " (" + (p.team_lead_code || "") + ")" : "—",
        p.member_count,
        progress + (progressDetail ? "\n" + progressDetail : ""),
        p.status || "—",
        created
      ];

      vals.forEach((v, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = v;
        cell.font = { name: "Calibri", size: 10, color: { argb: BLUE } };
        cell.alignment = { vertical: "middle", wrapText: (ci === 2 || ci === 5) };
        cell.border = thinBorder;

        // Bold project name
        if (ci === 1) cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: DARK_BLUE } };
        // Status color
        if (ci === 6) cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: statusColor } };
      });

      row.height = 28;
      dataIdx++;

      // ── Members sub-rows ──
      const members = membersByProject[p.id] || [];
      if (members.length > 0) {
        const mHeaderRow = sheet.getRow(dataIdx);
        sheet.mergeCells("B" + dataIdx + ":C" + dataIdx);
        const mhCell = mHeaderRow.getCell(2);
        mhCell.value = "Assigned Members:";
        mhCell.font = { name: "Calibri", size: 9, bold: true, italic: true };
        mhCell.alignment = { horizontal: "left", vertical: "middle" };
        mhCell.border = thinBorder;
        // Fill remaining cells border
        for (let c = 1; c <= 8; c++) {
          if (c !== 2 && c !== 3) mHeaderRow.getCell(c).border = thinBorder;
        }
        mHeaderRow.getCell(1).border = thinBorder;
        sheet.mergeCells("D" + dataIdx + ":H" + dataIdx);
        const memberNames = members.map(m => m.name + " (" + m.user_id + ")").join(", ");
        const mnCell = mHeaderRow.getCell(4);
        mnCell.value = memberNames;
        mnCell.font = { name: "Calibri", size: 9, color: { argb: BLUE } };
        mnCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
        mnCell.border = thinBorder;
        mHeaderRow.height = 22;

        dataIdx++;
      }
    });

    // ── Send response ──
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=projects_report.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("Projects Excel export error:", err);
    res.status(500).json({ message: "Excel export failed" });
  }
};
