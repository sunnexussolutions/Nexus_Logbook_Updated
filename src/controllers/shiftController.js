const pool = require("../config/db");

/* ================= CREATE SHIFT ================= */
exports.createShift = async (req, res) => {
  try {
    const { name, check_in_time, last_checkin_time, check_out_time } = req.body;

    await pool.query(
      `
      INSERT INTO shifts (name, check_in_time, last_checkin_time, check_out_time)
      VALUES ($1, $2, $3, $4)
      `,
      [name, check_in_time, last_checkin_time, check_out_time || null]
    );

    res.json({ message: "Shift saved successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating shift" });
  }
};

exports.getAllShifts = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM shifts ORDER BY id`
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error loading shifts" });
  }
};



/* ================= GET ALL SHIFTS ================= */

/* ================= ASSIGN SHIFT TO USER ================= */
exports.assignShiftToUser = async (req, res) => {
  try {
    const { user_id, shift_id } = req.body;

    if (!user_id || !shift_id) {
      return res.status(400).json({ message: "User and shift required" });
    }

    await pool.query(
      `
      UPDATE users
      SET shift_id = $1
      WHERE id = $2
      `,
      [shift_id, user_id]
    );

    res.json({ message: "Shift assigned successfully" });

  } catch (err) {
    console.error("Assign shift error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
exports.updateShift = async (req, res) => {
  try {
    const { id } = req.params;
    const { check_in_time, last_checkin_time, check_out_time } = req.body;

    // Build dynamic SET clause — only update columns that were provided
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    if (check_in_time !== undefined) {
      setClauses.push(`check_in_time = $${paramIndex++}`);
      values.push(check_in_time);
    }
    if (last_checkin_time !== undefined) {
      setClauses.push(`last_checkin_time = $${paramIndex++}`);
      values.push(last_checkin_time);
    }
    if (check_out_time !== undefined) {
      setClauses.push(`check_out_time = $${paramIndex++}`);
      values.push(check_out_time);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    values.push(id);
    await pool.query(
      `UPDATE shifts SET ${setClauses.join(", ")} WHERE id = $${paramIndex}`,
      values
    );

    res.json({ message: "Shift updated successfully" });

  } catch (err) {
    console.error("Update shift error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
exports.deleteShift = async (req, res) => {
  try {
    const shiftId = req.params.id;

    // 1️⃣ Remove shift from users
    await pool.query(
      `UPDATE users
       SET shift_id = NULL
       WHERE shift_id = $1`,
      [shiftId]
    );

    // 2️⃣ Delete shift
    await pool.query(
      `DELETE FROM shifts
       WHERE id = $1`,
      [shiftId]
    );

    res.json({ message: "Shift deleted successfully" });

  } catch (err) {
    console.error("Delete shift error:", err);
    res.status(500).json({ message: "Failed to delete shift" });
  }
};
