const pool = require("../config/db");
const { nowIST, todayIST } = require('../utils/istTime');
const {
  getEffectiveLeaveDates,
  summarizeEffectiveLeaveRequests
} = require("../utils/leaveDays");

const bcrypt = require("bcrypt");
const emailService = require("../services/emailService");

async function verifyAdminPassword(client, adminId, adminPassword) {
  if (!adminPassword || !String(adminPassword).trim()) {
    return { ok: false, status: 400, message: "Admin password is required" };
  }

  const adminResult = await client.query(
    `SELECT password FROM users WHERE id = $1 AND role = 'ADMIN'`,
    [adminId]
  );

  if (adminResult.rows.length === 0) {
    return { ok: false, status: 403, message: "Admin account not found" };
  }

  const isValid = await bcrypt.compare(
    String(adminPassword),
    adminResult.rows[0].password
  );

  if (!isValid) {
    return { ok: false, status: 401, message: "Incorrect admin password" };
  }

  return { ok: true };
}

async function sendWelcomeEmailSafely(userId, password) {
  if (typeof emailService.sendWelcomeEmail !== "function") {
    return;
  }

  try {
    await emailService.sendWelcomeEmail(userId, password);
  } catch (err) {
    console.warn("Welcome email failed (non-fatal):", err.message);
  }
}

function getYearBounds(year) {
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`
  };
}

/* ================== CREATE TEAM LEAD ================== */
exports.createTeamLead = async (req, res) => {
  try {
    const name = req.body?.name?.trim();
    const email = req.body?.email?.trim();
    const password = req.body?.password;
    const domain = req.body?.domain;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Generate next TEAM_LEAD user_id (TL001, TL002...)
    const seqResult = await pool.query(
      "SELECT nextval('team_lead_seq')"
    );

    const user_id = `TL${String(seqResult.rows[0].nextval).padStart(3, "0")}`;


    const hashedPassword = await bcrypt.hash(password, 10);

    const insertResult = await pool.query(
      `
      INSERT INTO users (user_id, name, email, password, role, domain)
      VALUES ($1, $2, $3, $4, 'TEAM_LEAD', $5)
      RETURNING id
      `,
      [user_id, name, email, hashedPassword, domain || null]
    );

    await sendWelcomeEmailSafely(insertResult.rows[0].id, password);

    res.json({
      message: "Team Lead created successfully",
      user_id
    });

  } catch (err) {
    console.error("Create Team Lead error:", err);

    if (err.code === "23505") {
      return res.status(400).json({ message: "Email already exists" });
    }

    res.status(500).json({ message: "Server error" });
  }
};

/* ================== CREATE TEAM MEMBER ================== */
exports.createTeamMember = async (req, res) => {
  try {
    const name = req.body?.name?.trim();
    const email = req.body?.email?.trim();
    const password = req.body?.password;
    const domain = req.body?.domain;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Generate next MEMBER user_id (TM001, TM002...)
    const seqResult = await pool.query(
      "SELECT nextval('team_member_seq')"
    );

    const user_id = `TM${String(seqResult.rows[0].nextval).padStart(3, "0")}`;


    const hashedPassword = await bcrypt.hash(password, 10);

    const insertResult = await pool.query(
      `
      INSERT INTO users (user_id, name, email, password, role, domain)
      VALUES ($1, $2, $3, $4, 'MEMBER', $5)
      RETURNING id
      `,
      [user_id, name, email, hashedPassword, domain || null]
    );

    await sendWelcomeEmailSafely(insertResult.rows[0].id, password);

    res.json({
      message: "Team Member created successfully",
      user_id
    });

  } catch (err) {
    console.error("Create Team Member error:", err);

    if (err.code === "23505") {
      return res.status(400).json({ message: "Email already exists" });
    }

    res.status(500).json({ message: "Server error" });
  }
};

/* ================== GET TEAM MEMBERS ================== */
exports.getTeamMembers = async (req, res) => {
  try {
    const today = todayIST();
    const result = await pool.query(`
      SELECT
        u.id,
        u.user_id,
        u.name,
        u.email,
        u.role,
        u.shift_id,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM user_pauses up
            WHERE up.user_id = u.id
              AND $1::date BETWEEN up.start_date AND up.end_date
          ) THEN 'PAUSED'
          ELSE 'ACTIVE'
        END AS status,

        CASE
          WHEN u.role = 'TEAM_LEAD' AND EXISTS (
            SELECT 1 FROM projects p WHERE p.assigned_to = u.id AND p.status != 'COMPLETED'
          ) THEN true

          WHEN u.role = 'MEMBER' AND EXISTS (
            SELECT 1 FROM project_members pm
            JOIN projects p ON p.id = pm.project_id
            WHERE pm.member_id = u.id AND p.status != 'COMPLETED'
          ) THEN true

          ELSE false
        END AS is_assigned

      FROM users u
      WHERE u.role IN ('TEAM_LEAD', 'MEMBER')
      ORDER BY u.role, u.id
    `, [today]);

    res.json(result.rows);

  } catch (err) {
    console.error("Get team members error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================== SET OFFICE TIMING ================== */

// ================= DELETE TEAM MEMBER (ADMIN) =================
exports.deleteTeamMember = async (req, res) => {
  const client = await pool.connect();

  try {
    const memberId = req.params.id;
    const { admin_password: adminPassword } = req.body || {};

    await client.query("BEGIN");

    const authCheck = await verifyAdminPassword(client, req.user.id, adminPassword);
    if (!authCheck.ok) {
      await client.query("ROLLBACK");
      return res.status(authCheck.status).json({ message: authCheck.message });
    }

    // Ensure user exists and is MEMBER
    const userCheck = await client.query(
      `SELECT id FROM users WHERE id = $1 AND role = 'MEMBER'`,
      [memberId]
    );

    if (userCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Team member not found" });
    }

    // Remove from project_members
    await client.query(
      `DELETE FROM project_members WHERE member_id = $1`,
      [memberId]
    );

    // Remove attendance records
    await client.query(
      `DELETE FROM attendance WHERE user_id = $1`,
      [memberId]
    );

    // Remove leave requests (if table exists)
    await client.query(
      `DELETE FROM leave_requests WHERE user_id = $1`,
      [memberId]
    );

    // Finally delete user
    await client.query(
      `DELETE FROM users WHERE id = $1`,
      [memberId]
    );

    await client.query("COMMIT");

    res.json({ message: "Team member deleted successfully" });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Delete team member error:", err);
    res.status(500).json({ message: "Server error while deleting member" });
  } finally {
    client.release();
  }
};
// ================= DELETE TEAM LEAD (ADMIN) =================
exports.deleteTeamLead = async (req, res) => {
  const client = await pool.connect();

  try {
    const leadId = req.params.id;
    const { admin_password: adminPassword } = req.body || {};

    await client.query("BEGIN");

    const authCheck = await verifyAdminPassword(client, req.user.id, adminPassword);
    if (!authCheck.ok) {
      await client.query("ROLLBACK");
      return res.status(authCheck.status).json({ message: authCheck.message });
    }

    // Ensure user exists and is TEAM_LEAD
    const userCheck = await client.query(
      `SELECT id FROM users WHERE id = $1 AND role = 'TEAM_LEAD'`,
      [leadId]
    );

    if (userCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Team lead not found" });
    }

    // Check if projects are assigned
    const projectCheck = await client.query(
      `SELECT id FROM projects WHERE assigned_to = $1`,
      [leadId]
    );

    if (projectCheck.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Cannot delete team lead with active projects. Reassign or delete projects first."
      });
    }

    // Delete attendance
    await client.query(
      `DELETE FROM attendance WHERE user_id = $1`,
      [leadId]
    );

    // Delete leave requests
    await client.query(
      `DELETE FROM leave_requests WHERE user_id = $1`,
      [leadId]
    );

    // Delete user
    await client.query(
      `DELETE FROM users WHERE id = $1`,
      [leadId]
    );

    await client.query("COMMIT");

    res.json({ message: "Team lead deleted successfully" });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Delete team lead error:", err);
    res.status(500).json({ message: "Server error while deleting team lead" });
  } finally {
    client.release();
  }
};
exports.getProjectMembersForAdmin = async (req, res) => {
  try {
    const { project_id } = req.params;

    /* ================= PROJECT + TEAM LEAD ================= */
    const projectResult = await pool.query(
      `
      SELECT 
        p.id,
        p.project_name,
        u.name AS team_lead_name,
        u.user_id AS team_lead_code
      FROM projects p
      JOIN users u ON u.id = p.assigned_to
      WHERE p.id = $1
      `,
      [project_id]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ message: "Project not found" });
    }

    /* ================= ASSIGNED MEMBERS ================= */
    const membersResult = await pool.query(
      `
      SELECT 
        m.id,
        m.user_id,
        m.name,
        m.email,
        m.domain
      FROM project_members pm
      JOIN users m ON m.id = pm.member_id
      WHERE pm.project_id = $1
      ORDER BY m.name
      `,
      [project_id]
    );

    /* ================= FINAL RESPONSE ================= */
    res.json({
      project: {
        team_lead_name: projectResult.rows[0].team_lead_name,
        team_lead_code: projectResult.rows[0].team_lead_code
      },
      members: membersResult.rows
    });

  } catch (err) {
    console.error("Admin project members error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


// ================= REMOVE MEMBER FROM PROJECT (ADMIN) =================
exports.removeMemberFromProject = async (req, res) => {
  const client = await pool.connect();

  try {
    const { project_id, member_id } = req.params;

    await client.query("BEGIN");

    // Check membership exists
    const check = await client.query(
      `
      SELECT 1
      FROM project_members
      WHERE project_id = $1 AND member_id = $2
      `,
      [project_id, member_id]
    );

    if (check.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Member not assigned to this project" });
    }

    // Delete mapping
    await client.query(
      `
      DELETE FROM project_members
      WHERE project_id = $1 AND member_id = $2
      `,
      [project_id, member_id]
    );

    await client.query("COMMIT");

    res.json({ message: "Member removed from project successfully" });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Remove member error:", err);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
};


exports.assignShiftToUser = async (req, res) => {
  try {
    const { user_id, shift_id } = req.body;

    if (!user_id || !shift_id) {
      return res.status(400).json({ message: "User and shift required" });
    }

    await pool.query(
      `UPDATE users SET shift_id = $1 WHERE id = $2`,
      [shift_id, user_id]
    );

    res.json({ message: "Shift assigned successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};


// ================= GET ALL TEAM LEADS (ADMIN) =================
exports.getAllTeamLeads = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, user_id, name
      FROM users
      WHERE role = 'TEAM_LEAD'
      ORDER BY id
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Get team leads error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getAllLeaveRequests = async (req, res) => {
  try {
    const year = nowIST().getUTCFullYear();
    const { end: yearEnd } = getYearBounds(year);
    const yearStart = '2026-07-17'; // Reset counts from today onwards
    const result = await pool.query(`
      SELECT
        lr.id,
        lr.user_id AS user_db_id,
        u.user_id,
        u.name,
        u.role,
        lr.from_date,
        lr.to_date,
        lr.reason,
        lr.status,
        lr.applied_at,
        lr.reviewed_at
      FROM leave_requests lr
      JOIN users u ON u.id = lr.user_id
      ORDER BY lr.applied_at DESC
    `);

    const approvedLeaveSummary = await summarizeEffectiveLeaveRequests(
      pool,
      result.rows.filter(row => row.status === "APPROVED"),
      { rangeStart: yearStart, rangeEnd: yearEnd }
    );

    const leaveQuota = 14;
    const payload = result.rows.map(row => {
      const used = approvedLeaveSummary.byUser.get(String(row.user_db_id)) || 0;
      const remaining = Math.max(0, leaveQuota - used);

      return {
        ...row,
        leave_used: used,
        leave_remaining: remaining,
        leave_quota: leaveQuota
      };
    });

    res.json(payload);

  } catch (err) {
    console.error("Get leave error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.reviewLeaveRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejection_reason } = req.body;

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    await pool.query(
      `UPDATE leave_requests
       SET status = $1, reviewed_at = NOW(), reviewed_by = $2
       WHERE id = $3`,
      [status, req.user.id, id]
    );

    // Fetch leave + user details for notification
    const leave = await pool.query(
      `SELECT lr.user_id, lr.from_date, lr.to_date
       FROM leave_requests lr WHERE lr.id = $1`,
      [id]
    );

    if (leave.rows.length > 0) {
      const { user_id, from_date, to_date } = leave.rows[0];

      // Build notification — include rejection reason so member knows why
      const emoji = status === "APPROVED" ? "\u2705" : "\u274c";
      let notifMessage;
      if (status === "REJECTED" && rejection_reason && rejection_reason.trim()) {
        notifMessage = `${emoji} Your leave request (${from_date} \u2192 ${to_date}) has been REJECTED. Reason: ${rejection_reason.trim()}`;
      } else {
        notifMessage = `${emoji} Your leave request (${from_date} \u2192 ${to_date}) has been ${status} by Admin.`;
      }

      await pool.query(
        `INSERT INTO notifications (user_id, message, is_read, created_at)
         VALUES ($1, $2, false, NOW())`,
        [user_id, notifMessage]
      );

      // If APPROVED mark attendance as ON_LEAVE for those days
      if (status === "APPROVED") {
        const effectiveLeaveDates = await getEffectiveLeaveDates(pool, from_date, to_date);

        if (effectiveLeaveDates.length > 0) {
          await pool.query(`
            INSERT INTO attendance (user_id, date, status)
            SELECT $1, leave_day.day::date, 'ON_LEAVE'
            FROM unnest($2::date[]) AS leave_day(day)
            WHERE NOT EXISTS (
              SELECT 1 FROM attendance a
              WHERE a.user_id = $1 AND a.date = leave_day.day::date
            )
          `, [user_id, effectiveLeaveDates]);
        }
      }

      // Try email but NEVER crash the endpoint if it fails (Render email issues)
      try {
        if (status === "APPROVED") {
          await emailService.sendLeaveApprovedEmail(user_id, leave.rows[0]);
        } else {
          await emailService.sendLeaveRejectedEmail(user_id, leave.rows[0], rejection_reason);
        }
      } catch (emailErr) {
        console.warn("Email notification failed (non-fatal):", emailErr.message);
      }
    }

    res.json({ message: `Leave ${status.toLowerCase()} successfully` });

  } catch (err) {
    console.error("Review leave error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================== BROADCAST ANNOUNCEMENT ================== */
exports.broadcastAnnouncement = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ message: "Announcement message is required" });
    }

    const users = await pool.query(`SELECT id FROM users`);

    if (users.rows.length === 0) {
      return res.json({ message: "No users to notify", sent: 0 });
    }

    const text = `📢 Admin Announcement: ${message.trim()}`;

    // Insert one notification per user (simple, safe, works on all PG versions)
    for (const user of users.rows) {
      await pool.query(
        `INSERT INTO notifications (user_id, message, is_read, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [user.id, text, false]
      );
    }

    res.json({ message: `Announcement sent to ${users.rows.length} users`, sent: users.rows.length });

  } catch (err) {
    console.error("Broadcast announcement error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================== SEND PERSONAL MESSAGE ================== */
exports.sendPersonalMessage = async (req, res) => {
  try {
    const { userId, message } = req.body;

    if (!userId || !message || !message.trim()) {
      return res.status(400).json({ message: "User ID and message are required" });
    }

    const text = `✉️ Direct Message from Admin: ${message.trim()}`;

    await pool.query(
      `INSERT INTO notifications (user_id, message, is_read, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [userId, text, false]
    );

    res.json({ message: "Message sent successfully" });

  } catch (err) {
    console.error("Personal message error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================== TOGGLE USER STATUS ================== */
exports.toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, start_date, end_date } = req.body;
    const today = todayIST();

    if (!["ACTIVE", "PAUSED"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    if (status === "PAUSED") {
      // Insert a pause record. Expect start_date and end_date in ISO format.
      const sDate = start_date || today;
      const eDate = end_date || sDate; // default to same day if not provided
      if (eDate < sDate) {
        return res.status(400).json({ message: "Pause end date must be on or after the start date" });
      }
      await pool.query(`INSERT INTO user_pauses (user_id, start_date, end_date) VALUES ($1, $2, $3)`, [id, sDate, eDate]);
    } else if (status === "ACTIVE") {
      // If unpausing early, close any active pause by setting its end_date to yesterday.
      const yesterday = new Date(`${today}T00:00:00.000Z`);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yStr = yesterday.toISOString().split('T')[0];
      await pool.query(
        `UPDATE user_pauses
         SET end_date = $1
         WHERE user_id = $2
           AND end_date >= $3::date`,
        [yStr, id, today]
      );
    }

    const statusResult = await pool.query(
      `
      UPDATE users
      SET status = CASE
        WHEN EXISTS (
          SELECT 1
          FROM user_pauses up
          WHERE up.user_id = $1
            AND $2::date BETWEEN up.start_date AND up.end_date
        ) THEN 'PAUSED'
        ELSE 'ACTIVE'
      END
      WHERE id = $1
      RETURNING status
      `,
      [id, today]
    );

    const effectiveStatus = statusResult.rows[0]?.status || "ACTIVE";
    const scheduledFuturePause = status === "PAUSED" && effectiveStatus === "ACTIVE";

    res.json({
      message: scheduledFuturePause
        ? "Pause scheduled successfully. The member will stay ACTIVE until the pause start date."
        : `User status updated to ${effectiveStatus}`,
      status: effectiveStatus
    });
  } catch (err) {
    console.error("Toggle user status error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================== EXPORT EMPLOYEES EXCEL ================== */
const ExcelJS = require("exceljs");

exports.exportEmployeesExcel = async (req, res) => {
  try {
    const { status, role, search } = req.query;

    const result = await pool.query(`
      SELECT
        u.id, u.user_id, u.name, u.email, u.role, u.domain,
        s.name AS shift_name, s.check_in_time, s.check_out_time,
        CASE
          WHEN u.role = 'TEAM_LEAD' AND EXISTS (
            SELECT 1 FROM projects p WHERE p.assigned_to = u.id AND p.status != 'COMPLETED'
          ) THEN true
          WHEN u.role = 'MEMBER' AND EXISTS (
            SELECT 1 FROM project_members pm
            JOIN projects p ON p.id = pm.project_id
            WHERE pm.member_id = u.id AND p.status != 'COMPLETED'
          ) THEN true
          ELSE false
        END AS is_assigned,
        (
          SELECT string_agg(p.project_name, ', ')
          FROM projects p
          LEFT JOIN project_members pm ON pm.project_id = p.id
          WHERE (p.assigned_to = u.id OR pm.member_id = u.id)
            AND p.status != 'COMPLETED'
        ) AS assigned_projects
      FROM users u
      LEFT JOIN shifts s ON s.id = u.shift_id
      WHERE u.role IN ('TEAM_LEAD', 'MEMBER')
      ORDER BY u.role, u.name
    `);

    // Apply filters from query params
    let employees = result.rows;

    if (status === "assigned") {
      employees = employees.filter(e => e.is_assigned);
    } else if (status === "free") {
      employees = employees.filter(e => !e.is_assigned);
    }

    if (role) {
      employees = employees.filter(e => e.role === role);
    }

    if (search) {
      const s = search.toLowerCase();
      employees = employees.filter(e =>
        e.name.toLowerCase().includes(s) ||
        (e.user_id && e.user_id.toLowerCase().includes(s))
      );
    }
    const totalCount = employees.length;
    const assignedCount = employees.filter(e => e.is_assigned).length;
    const freeCount = totalCount - assignedCount;

    // Colors
    const BLUE = "1F4E79";
    const DARK_BLUE = "0D3B66";
    const WHITE = "FFFFFF";
    const BLACK = "000000";
    const GREEN = "00875A";
    const ORANGE = "FF8B00";

    const thinBorder = {
      top: { style: "thin" }, left: { style: "thin" },
      bottom: { style: "thin" }, right: { style: "thin" }
    };

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SUN NEXUS SOLUTIONS";
    const sheet = workbook.addWorksheet("Employees Report");

    sheet.columns = [
      { width: 6 },   // A - #
      { width: 12 },  // B - User ID
      { width: 22 },  // C - Name
      { width: 26 },  // D - Email
      { width: 14 },  // E - Role
      { width: 12 },  // F - Status
      { width: 20 },  // G - Shift
      { width: 14 },  // H - Domain
      { width: 28 },  // I - Assigned Projects
    ];

    // Title
    sheet.mergeCells("A1:I1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "SUN NEXUS SOLUTIONS — Employees Report";
    titleCell.font = { name: "Calibri", size: 16, bold: true, color: { argb: DARK_BLUE } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 36;

    // Summary
    const sRow = 3;
    sheet.mergeCells("A" + sRow + ":D" + sRow);
    const sumH = sheet.getCell("A" + sRow);
    sumH.value = "Workforce Summary";
    sumH.font = { name: "Calibri", size: 13, bold: true };
    sumH.alignment = { horizontal: "center", vertical: "middle" };
    sumH.border = thinBorder;
    sheet.mergeCells("E" + sRow + ":I" + sRow);
    sheet.getCell("E" + sRow).border = thinBorder;

    const summaryItems = [
      ["Total Employees:", totalCount],
      ["Assigned:", assignedCount],
      ["Free:", freeCount],
    ];

    summaryItems.forEach((item, i) => {
      const r = sRow + 1 + i;
      sheet.mergeCells("A" + r + ":D" + r);
      const lc = sheet.getCell("A" + r);
      lc.value = item[0];
      lc.font = { name: "Calibri", size: 11, bold: true };
      lc.alignment = { horizontal: "right", vertical: "middle" };
      lc.border = thinBorder;
      sheet.mergeCells("E" + r + ":I" + r);
      const vc = sheet.getCell("E" + r);
      vc.value = item[1];
      vc.font = { name: "Calibri", size: 11, bold: true, color: { argb: BLUE } };
      vc.alignment = { horizontal: "left", vertical: "middle" };
      vc.border = thinBorder;
    });

    // Section title
    const secRow = sRow + summaryItems.length + 2;
    sheet.mergeCells("A" + secRow + ":I" + secRow);
    const secT = sheet.getCell("A" + secRow);
    secT.value = "All Employees — Detailed Overview";
    secT.font = { name: "Calibri", size: 13, bold: true };
    secT.alignment = { horizontal: "center", vertical: "middle" };
    secT.border = thinBorder;
    sheet.getRow(secRow).height = 28;

    // Table Header
    const hdrRow = secRow + 1;
    const headers = ["#", "User ID", "Name", "Email", "Role", "Status", "Shift", "Domain", "Assigned Projects"];
    const hRow = sheet.getRow(hdrRow);
    headers.forEach((h, i) => {
      const c = hRow.getCell(i + 1);
      c.value = h;
      c.font = { name: "Calibri", size: 11, bold: true, color: { argb: WHITE } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      c.border = thinBorder;
    });
    hRow.height = 24;

    // Data rows
    let dIdx = hdrRow + 1;
    employees.forEach((e, i) => {
      const row = sheet.getRow(dIdx);
      const statusText = e.is_assigned ? "Assigned" : "Free";
      const statusColor = e.is_assigned ? ORANGE : GREEN;
      const shiftText = e.shift_name
        ? e.shift_name + " (" + e.check_in_time + " - " + e.check_out_time + ")"
        : "No shift";

      const vals = [
        i + 1,
        e.user_id,
        e.name,
        e.email,
        e.role,
        statusText,
        shiftText,
        e.domain || "—",
        e.assigned_projects || "—"
      ];

      vals.forEach((v, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = v;
        cell.font = { name: "Calibri", size: 10, color: { argb: BLUE } };
        cell.alignment = { vertical: "middle", wrapText: (ci === 8) };
        cell.border = thinBorder;
        if (ci === 2) cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: DARK_BLUE } };
        if (ci === 5) cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: statusColor } };
      });

      row.height = 22;
      dIdx++;
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=employees_report.xlsx");

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("Employees Excel export error:", err);
    res.status(500).json({ message: "Excel export failed" });
  }
};
