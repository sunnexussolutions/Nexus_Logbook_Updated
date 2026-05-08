const pool = require("../config/db");
const { todayIST, nowIST } = require('../utils/istTime');


exports.forceCheckoutAll = async (req, res) => {
  try {
    // 🔐 Admin only
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Access denied" });
    }

    const today = todayIST();

    // Force checkout everyone who is checked in but not checked out
    const result = await pool.query(
      `
      UPDATE attendance
      SET check_out = CURRENT_TIMESTAMP
      WHERE "date" = $1
        AND check_in IS NOT NULL
        AND check_out IS NULL
      `,
      [today]
    );

    res.json({
      message: "Force checkout completed",
      checked_out_users: result.rowCount
    });

  } catch (err) {
    console.error("Force checkout all error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getTodayAttendance = async (req, res) => {
  try {
    const query = `
      WITH day_meta AS (
        SELECT EXISTS (
          SELECT 1 FROM holidays WHERE holiday_date = CURRENT_DATE
        ) OR EXTRACT(DOW FROM CURRENT_DATE) = 0 AS is_holiday
      )
      SELECT 
        u.user_id,
        u.name,
        u.role,
        a.check_in,
        a.check_out,
        a.status,
        dm.is_holiday
      FROM users u
      CROSS JOIN day_meta dm
      LEFT JOIN attendance a
        ON u.id = a.user_id
        AND a.date = CURRENT_DATE
      ORDER BY u.id;
    `;

    const { rows } = await pool.query(query);

    const data = rows.map(r => {
      let status = "ABSENT";
      if (r.status === "HOLIDAY" || r.is_holiday) status = "HOLIDAY";
      if (r.check_in && !r.check_out) status = "CHECKED_IN";
      if (r.check_in && r.check_out) status = "PRESENT";

      return {
        user_id: r.user_id,
        name: r.name,
        role: r.role,
        check_in: r.check_in,
        check_out: r.check_out,
        status
      };
    });

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch attendance" });
  }
};
exports.getDashboardSummary = async (req, res) => {
  try {
    const today = todayIST();

    // total users
    const totalUsers = await pool.query(
      "SELECT COUNT(*) FROM users"
    );

    // present
    const present = await pool.query(`
      SELECT COUNT(*) FROM attendance
      WHERE date = $1
        AND check_in IS NOT NULL
        AND check_out IS NOT NULL
    `, [today]);

    // checked in only
    const checkedIn = await pool.query(`
      SELECT COUNT(*) FROM attendance
      WHERE date = $1
        AND check_in IS NOT NULL
        AND check_out IS NULL
    `, [today]);

    // approved leave for today
    const onLeave = await pool.query(`
      SELECT COUNT(DISTINCT user_id) FROM leave_requests
      WHERE status = 'APPROVED'
        AND $1 BETWEEN from_date AND to_date
    `, [today]);

    // holiday rows created for today
    const holiday = await pool.query(`
      SELECT COUNT(*) FROM attendance
      WHERE date = $1
        AND status = 'HOLIDAY'
    `, [today]);

    // on pause
    const onPause = await pool.query(`
      SELECT COUNT(DISTINCT user_id) FROM user_pauses
      WHERE $1 BETWEEN start_date AND end_date
    `, [today]);

    // absent = total - present - checkedin - onleave - holiday - onpause
    const totalUsersCount = Number(totalUsers.rows[0].count);
    const presentCount = Number(present.rows[0].count);
    const checkedInCount = Number(checkedIn.rows[0].count);
    const onLeaveCount = Number(onLeave.rows[0].count);
    const holidayCount = Number(holiday.rows[0].count);
    const onPauseCount = Number(onPause.rows[0].count);
    const absent =
      totalUsersCount -
      presentCount -
      checkedInCount -
      onLeaveCount -
      holidayCount -
      onPauseCount;

    res.json({
      total_users: totalUsersCount,
      present: presentCount,
      checked_in: checkedInCount,
      on_leave: onLeaveCount,
      holiday: holidayCount,
      on_pause: onPauseCount,
      absent: Math.max(0, Number(absent))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Dashboard error" });
  }
};
exports.getDailyAttendanceReport = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: "Date is required" });
    }

    const query = `
      WITH day_meta AS (
        SELECT EXISTS (
          SELECT 1 FROM holidays WHERE holiday_date = $1::date
        ) OR EXTRACT(DOW FROM $1::date) = 0 AS is_holiday
      )
      SELECT 
        u.user_id,
        u.name,
        u.role,
        a.check_in,
        a.check_out,
        lr.id AS leave_id,
        up.id AS pause_id,
        a.status,
        dm.is_holiday
      FROM users u
      CROSS JOIN day_meta dm
      LEFT JOIN attendance a
        ON u.id = a.user_id
        AND a.date = $1
      LEFT JOIN leave_requests lr
        ON lr.user_id = u.id
        AND lr.status = 'APPROVED'
        AND $1 BETWEEN lr.from_date AND lr.to_date
      LEFT JOIN user_pauses up
        ON up.user_id = u.id
        AND $1 BETWEEN up.start_date AND up.end_date
      ORDER BY u.id;
    `;

    const { rows } = await pool.query(query, [date]);

    const result = rows.map(r => {
      let status = "ABSENT";

      if (r.pause_id) status = "PAUSED";
      else if (r.leave_id) status = "ON_LEAVE";
      else if (r.status === "HOLIDAY" || r.is_holiday) status = "HOLIDAY";
      else if (r.check_in && r.check_out) status = "PRESENT";
      else if (r.check_in && !r.check_out) status = "CHECKED_IN";

      return {
        user_id: r.user_id,
        name: r.name,
        role: r.role,
        check_in: r.check_in,
        check_out: r.check_out,
        status
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Daily report error" });
  }
};
exports.exportDailyAttendanceCSV = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: "Date is required" });
    }

    // Period: 2nd of the month of the requested date → requested date
    const [ey, em, ed] = date.split('-').map(Number);
    const periodStart = `${ey}-${String(em).padStart(2,'0')}-02`;
    const periodEnd = date;

    const result = await pool.query(`
      WITH day_meta AS (
        SELECT EXISTS (
          SELECT 1 FROM holidays WHERE holiday_date = $1::date
        ) OR EXTRACT(DOW FROM $1::date) = 0 AS is_holiday
      ),
      period_working AS (
        SELECT COUNT(*)::int AS working_days
        FROM (
          SELECT d::date AS day
          FROM generate_series($2::date, $3::date, interval '1 day') d
          WHERE EXTRACT(DOW FROM d::date) <> 0
            AND NOT EXISTS (SELECT 1 FROM holidays h WHERE h.holiday_date = d::date)
        ) wd
      )
      SELECT
        u.user_id,
        u.name,
        u.role,
        a.check_in,
        a.check_out,
        a.status,
        dm.is_holiday,
        pw.working_days AS period_working_days,
        (
          SELECT COUNT(DISTINCT att2.date)::int
          FROM attendance att2
          WHERE att2.user_id = u.id
            AND att2.date BETWEEN $2 AND $3
            AND att2.check_in IS NOT NULL
            AND att2.check_out IS NOT NULL
        ) AS period_present,
        (
          SELECT COUNT(DISTINCT lday)::int
          FROM (
            SELECT generate_series(lr2.from_date, lr2.to_date, interval '1 day')::date AS lday
            FROM leave_requests lr2
            WHERE lr2.user_id = u.id AND lr2.status = 'APPROVED'
          ) lrd
          WHERE lrd.lday BETWEEN $2 AND $3
        ) AS period_leave,
        -- Overall: working days from GREATEST(2026-03-02, user created_at)
        (
          SELECT COUNT(*)::int
          FROM (
            SELECT d::date AS day
            FROM generate_series(GREATEST('2026-03-02'::date, u.created_at::date), $3::date, interval '1 day') d
            WHERE EXTRACT(DOW FROM d::date) <> 0
              AND NOT EXISTS (SELECT 1 FROM holidays h WHERE h.holiday_date = d::date)
          ) wd
        ) AS overall_working_days,
        -- Overall: present days
        (
          SELECT COUNT(DISTINCT att3.date)::int
          FROM attendance att3
          WHERE att3.user_id = u.id
            AND att3.date BETWEEN GREATEST('2026-03-02'::date, u.created_at::date) AND $3::date
            AND att3.check_in IS NOT NULL
            AND att3.check_out IS NOT NULL
        ) AS overall_present,
        -- Overall: leave days
        (
          SELECT COUNT(DISTINCT lday)::int
          FROM (
            SELECT generate_series(lr3.from_date, lr3.to_date, interval '1 day')::date AS lday
            FROM leave_requests lr3
            WHERE lr3.user_id = u.id AND lr3.status = 'APPROVED'
          ) lrd3
          WHERE lrd3.lday BETWEEN GREATEST('2026-03-02'::date, u.created_at::date) AND $3::date
        ) AS overall_leave
      FROM users u
      CROSS JOIN day_meta dm
      CROSS JOIN period_working pw
      LEFT JOIN attendance a
        ON a.user_id = u.id
        AND a.date = $1
      ORDER BY u.id
    `, [date, periodStart, periodEnd]);

    let csv = `User ID,Name,Role,Check In,Check Out,Status,Att % (2nd-${date}),Overall %\n`;

    result.rows.forEach(r => {
      const status = r.status || (r.is_holiday ? "HOLIDAY" : "ABSENT");
      const wDays = r.period_working_days || 0;
      const pDays = r.period_present || 0;
      const attPct = wDays === 0 ? 100 : Math.min(Math.round((pDays / wDays) * 100), 100);
      const ovWDays = r.overall_working_days || 0;
      const ovPDays = r.overall_present || 0;
      const ovPct = ovWDays === 0 ? 100 : Math.min(Math.round((ovPDays / ovWDays) * 100), 100);
      csv += `${r.user_id},"${r.name}",${r.role},${r.check_in || ""},${r.check_out || ""},${status},${attPct}%,${ovPct}%\n`;
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=attendance_${date}.csv`
    );

    res.send(csv);

  } catch (err) {
    console.error("Daily CSV export error:", err);
    res.status(500).json({ message: "CSV export failed" });
  }
};

const ExcelJS = require("exceljs");

exports.exportDailyAttendanceExcel = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: "Date is required" });
    }

    // ── Attendance % period: 2nd of the month of the requested date → requested date ──
    const [dy, dm2, dd] = date.split('-').map(Number);
    const periodStart = `${dy}-${String(dm2).padStart(2,'0')}-02`;
    const periodEnd = date;

    // ── Query: attendance + work reports + shifts + leave ──
    const result = await pool.query(`
      WITH day_meta AS (
        SELECT EXISTS (
          SELECT 1 FROM holidays WHERE holiday_date = $1::date
        ) OR EXTRACT(DOW FROM $1::date) = 0 AS is_holiday
      ),
      period_working AS (
        SELECT COUNT(*)::int AS working_days
        FROM (
          SELECT d::date AS day
          FROM generate_series($2::date, $3::date, interval '1 day') d
          WHERE EXTRACT(DOW FROM d::date) <> 0
            AND NOT EXISTS (SELECT 1 FROM holidays h WHERE h.holiday_date = d::date)
        ) wd
      )
      SELECT
        u.id AS user_db_id,
        u.name,
        a.date AS att_date,
        a.check_in,
        a.check_out,
        a.status,
        dm.is_holiday,
        s.name AS shift_name,
        s.check_in_time AS shift_start,
        wr.work_done,
        wr.created_at AS submitted_at,
        lr.id AS leave_id,
        -- present days in period
        (
          SELECT COUNT(DISTINCT att2.date)::int
          FROM attendance att2
          WHERE att2.user_id = u.id
            AND att2.date BETWEEN $2 AND $3
            AND att2.check_in IS NOT NULL
            AND att2.check_out IS NOT NULL
        ) AS period_present,
        -- leave days in period
        (
          SELECT COUNT(DISTINCT lday)::int
          FROM (
            SELECT generate_series(lr2.from_date, lr2.to_date, interval '1 day')::date AS lday
            FROM leave_requests lr2
            WHERE lr2.user_id = u.id AND lr2.status = 'APPROVED'
          ) lrd
          WHERE lrd.lday BETWEEN $2 AND $3
        ) AS period_leave,
        pw.working_days AS period_working_days,
        -- Overall: working days from GREATEST(2026-03-02, user created_at)
        (
          SELECT COUNT(*)::int
          FROM (
            SELECT d::date AS day
            FROM generate_series(GREATEST('2026-03-02'::date, u.created_at::date), $3::date, interval '1 day') d
            WHERE EXTRACT(DOW FROM d::date) <> 0
              AND NOT EXISTS (SELECT 1 FROM holidays h WHERE h.holiday_date = d::date)
          ) wd
        ) AS overall_working_days,
        -- Overall: present days
        (
          SELECT COUNT(DISTINCT att3.date)::int
          FROM attendance att3
          WHERE att3.user_id = u.id
            AND att3.date BETWEEN GREATEST('2026-03-02'::date, u.created_at::date) AND $3::date
            AND att3.check_in IS NOT NULL
            AND att3.check_out IS NOT NULL
        ) AS overall_present,
        -- Overall: leave days
        (
          SELECT COUNT(DISTINCT lday)::int
          FROM (
            SELECT generate_series(lr3.from_date, lr3.to_date, interval '1 day')::date AS lday
            FROM leave_requests lr3
            WHERE lr3.user_id = u.id AND lr3.status = 'APPROVED'
          ) lrd3
          WHERE lrd3.lday BETWEEN GREATEST('2026-03-02'::date, u.created_at::date) AND $3::date
        ) AS overall_leave
      FROM users u
      CROSS JOIN day_meta dm
      CROSS JOIN period_working pw
      LEFT JOIN attendance a
        ON a.user_id = u.id
        AND a.date = $1
      LEFT JOIN shifts s
        ON s.id = a.shift_id
      LEFT JOIN work_reports wr
        ON wr.user_id = u.id
        AND wr.report_date = $1
        AND wr.report_type = 'DAILY'
      LEFT JOIN leave_requests lr
        ON lr.user_id = u.id
        AND lr.status = 'APPROVED'
        AND $1 BETWEEN lr.from_date AND lr.to_date
      ORDER BY u.name
    `, [date, periodStart, periodEnd]);

    // ── Summary counts ──
    const totalResult = await pool.query("SELECT COUNT(*)::int AS total FROM users");
    const totalStudents = totalResult.rows[0].total;

    let presentCount = 0;
    let absentCount = 0;
    let checkedInCount = 0;
    let onLeaveCount = 0;
    let holidayCount = 0;

    result.rows.forEach(r => {
      let st = "ABSENT";
      if (r.leave_id) { st = "ON_LEAVE"; onLeaveCount++; }
      else if (r.status === "HOLIDAY" || r.is_holiday) { st = "HOLIDAY"; holidayCount++; }
      else if (r.check_in && r.check_out) { st = "PRESENT"; presentCount++; }
      else if (r.check_in && !r.check_out) { st = "CHECKED_IN"; checkedInCount++; }
      else { absentCount++; }
    });

    // ── Fetch shift timings from DB ──
    const shiftsResult = await pool.query("SELECT name, check_in_time, last_checkin_time FROM shifts ORDER BY id");
    const shiftTimings = shiftsResult.rows.length > 0
      ? shiftsResult.rows.map(s => s.name + ": " + s.check_in_time + " - " + s.last_checkin_time).join(" | ")
      : "No shifts configured";

    // ── Date display (parse string directly to avoid UTC timezone shift) ──
    const [yyyy, mm, day] = date.split("-").map(Number);
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const dayNum = day;
    const suffix = [11, 12, 13].includes(dayNum) ? "th" : { 1: "st", 2: "nd", 3: "rd" }[dayNum % 10] || "th";
    const dayOfWeek = new Date(Date.UTC(yyyy, mm - 1, day, 12, 0, 0)).getUTCDay();
    const dateDisplay = dayNum + suffix + " " + months[mm - 1] + " & " + dayNames[dayOfWeek];

    // ── Helper: format UTC timestamp to IST HH:MM:SS ──
    const fmtIST = (raw) => {
      if (!raw) return "";
      const d = new Date(raw);
      return d.toLocaleTimeString("en-IN", {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false, timeZone: "Asia/Kolkata"
      });
    };

    // Format submitted as "YYYY-MM-DD\nHH:MM:SS" (date + time stacked)
    const fmtSubmitted = (raw) => {
      if (!raw) return "";
      const d = new Date(raw);
      const dateStr = d.toLocaleDateString("en-IN", {
        year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Kolkata"
      }).split("/").reverse().join("-");
      const timeStr = d.toLocaleTimeString("en-IN", {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false, timeZone: "Asia/Kolkata"
      });
      return dateStr + "\n" + timeStr;
    };

    // ── Colors ──
    const BLUE_HEADER = "1F4E79";
    const LIGHT_BLUE = "D6E4F0";
    const WHITE = "FFFFFF";
    const BLACK = "000000";
    const DARK_BLUE = "0D3B66";
    const DATA_BLUE = "1F4E79";

    const thinBorder = {
      top: { style: "thin" }, left: { style: "thin" },
      bottom: { style: "thin" }, right: { style: "thin" }
    };

    // ── Build workbook ──
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SUN NEXUS SOLUTIONS";
    const sheet = workbook.addWorksheet("Daily Report");

    // Column widths
    sheet.columns = [
      { width: 24 }, // A - Student Name
      { width: 14 }, // B - Date
      { width: 12 }, // C - Check-In
      { width: 12 }, // D - Check-Out
      { width: 42 }, // E - Work Summary
      { width: 20 }, // F - Submitted
      { width: 18 }, // G - Att % (Month)
      { width: 18 }, // H - Overall %
    ];

    // ═══════ ROW 1: Company Title ═══════
    sheet.mergeCells("A1:H1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "SUN NEXUS SOLUTIONS Daily Report";
    titleCell.font = { name: "Calibri", size: 16, bold: true, color: { argb: DARK_BLUE } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 36;

    // ═══════ ROW 3: Attendance Summary Header ═══════
    const summaryStart = 3;
    sheet.mergeCells("A" + summaryStart + ":C" + summaryStart);
    const summaryHeader = sheet.getCell("A" + summaryStart);
    summaryHeader.value = "Attendance Summary";
    summaryHeader.font = { name: "Calibri", size: 13, bold: true, color: { argb: BLACK } };
    summaryHeader.alignment = { horizontal: "center", vertical: "middle" };
    summaryHeader.border = thinBorder;
    sheet.getCell("D" + summaryStart).border = thinBorder;
    sheet.mergeCells("D" + summaryStart + ":H" + summaryStart);

    // ═══════ Summary Rows ═══════
    const summaryData = [
      ["Date & Day:", dateDisplay],
      ["Total Students:", totalStudents],
      ["Absent:", absentCount],
      ["Present:", presentCount],
      ["Checked In:", checkedInCount],
      ["On Leave:", onLeaveCount],
      ["Holiday:", holidayCount],
      ["Official Club Timing:", shiftTimings],
    ];

    summaryData.forEach((item, i) => {
      const rowIdx = summaryStart + 1 + i;
      sheet.mergeCells("A" + rowIdx + ":C" + rowIdx);
      const labelCell = sheet.getCell("A" + rowIdx);
      labelCell.value = item[0];
      labelCell.font = { name: "Calibri", size: 11, bold: true };
      labelCell.alignment = { horizontal: "right", vertical: "middle" };
      labelCell.border = thinBorder;

      sheet.mergeCells("D" + rowIdx + ":H" + rowIdx);
      const valCell = sheet.getCell("D" + rowIdx);
      valCell.value = item[1];
      valCell.font = { name: "Calibri", size: 11, bold: true, color: { argb: BLUE_HEADER } };
      valCell.alignment = { horizontal: "left", vertical: "middle" };
      valCell.border = thinBorder;
    });

    // ═══════ Section Title: Daily Attendance Report Overview ═══════
    const sectionTitleRow = summaryStart + summaryData.length + 2;
    sheet.mergeCells("A" + sectionTitleRow + ":H" + sectionTitleRow);
    const sectionTitle = sheet.getCell("A" + sectionTitleRow);
    sectionTitle.value = "Daily Attendance Report Overview";
    sectionTitle.font = { name: "Calibri", size: 13, bold: true, color: { argb: BLACK } };
    sectionTitle.alignment = { horizontal: "center", vertical: "middle" };
    sectionTitle.border = thinBorder;
    sheet.getRow(sectionTitleRow).height = 28;

    // ═══════ Table Header ═══════
    const headerRowNum = sectionTitleRow + 1;
    const headers = ["Student Name", "Date", "Check-In", "Check-Out", "Work Summary", "Submitted", `Att %\n(2nd–${date})`, "Overall %\n(Since Joining)"];
    const hRow = sheet.getRow(headerRowNum);
    headers.forEach((h, i) => {
      const cell = hRow.getCell(i + 1);
      cell.value = h;
      cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: WHITE } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE_HEADER } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = thinBorder;
    });
    hRow.height = 24;

    // ═══════ DATA ROWS ═══════
    let dataRowIdx = headerRowNum + 1;
    result.rows.forEach((r, i) => {
      const row = sheet.getRow(dataRowIdx);

      // Determine status
      let status = "ABSENT";
      if (r.leave_id) status = "ON_LEAVE";
      else if (r.status === "HOLIDAY" || r.is_holiday) status = "HOLIDAY";
      else if (r.check_in && r.check_out) status = "PRESENT";
      else if (r.check_in && !r.check_out) status = "CHECKED_IN";

      // Compute per-user monthly attendance percentage (2nd to date)
      // Leaves count as absent — not subtracted from denominator
      const wDays = r.period_working_days || 0;
      const pDays = r.period_present || 0;
      const attPct = wDays === 0 ? 100 : Math.min(Math.round((pDays / wDays) * 100), 100);

      // Compute overall attendance percentage (since joining)
      const ovWDays = r.overall_working_days || 0;
      const ovPDays = r.overall_present || 0;
      const ovPct = ovWDays === 0 ? 100 : Math.min(Math.round((ovPDays / ovWDays) * 100), 100);

      const rowValues = [
        r.name || "",
        date,
        fmtIST(r.check_in),
        fmtIST(r.check_out),
        r.work_done || "No work summary",
        fmtSubmitted(r.submitted_at),
        attPct + "%",
        ovPct + "%"
      ];

      rowValues.forEach((val, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = val;
        // Student Name = bold + blue, percentage = colored by value, rest = blue
        if (ci === 0) {
          cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: DATA_BLUE } };
        } else if (ci === 6 || ci === 7) {
          // Attendance % color: green >=75, orange 50-74, red <50
          const pctVal = parseInt(val) || 0;
          const pctColor = pctVal >= 75 ? "15803D" : pctVal >= 50 ? "B45309" : "DC2626";
          cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: pctColor } };
          cell.alignment = { horizontal: "center", vertical: "middle" };
        } else {
          cell.font = { name: "Calibri", size: 10, color: { argb: DATA_BLUE } };
        }
        if (ci !== 6 && ci !== 7) cell.alignment = { vertical: "middle", wrapText: (ci === 4 || ci === 5) };
        cell.border = thinBorder;
      });

      // Adjust row height for multi-line content
      if (r.work_done && r.work_done.length > 60) {
        row.height = Math.min(80, 24 + Math.floor(r.work_done.length / 40) * 14);
      } else {
        row.height = 30; // enough for 2-line submitted column
      }

      dataRowIdx++;
    });

    // ── Send response ──
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=daily_report_" + date + ".xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("Daily Excel export error:", err);
    res.status(500).json({ message: "Excel export failed" });
  }
};
exports.getMonthlyAttendanceSummary = async (req, res) => {
  try {
    const { month } = req.query; // format: YYYY-MM

    if (!month) {
      return res.status(400).json({ message: "Month is required (YYYY-MM)" });
    }

    const startDate = `${month}-01`;
    const endDate = `${month}-31`; // safe upper bound

    const query = `
      SELECT
        u.user_id,
        u.name,
        u.role,

        COUNT(DISTINCT a.date) FILTER (
          WHERE a.check_in IS NOT NULL AND a.check_out IS NOT NULL
        ) AS present_days,

        COUNT(DISTINCT a.date) FILTER (
          WHERE a.check_in IS NOT NULL AND a.check_out IS NULL
        ) AS checked_in_days,

        COUNT(DISTINCT lr_days.day) AS leave_days

      FROM users u

      LEFT JOIN attendance a
        ON u.id = a.user_id
        AND a.date BETWEEN $1 AND $2

      LEFT JOIN (
        SELECT 
          user_id,
          generate_series(from_date, to_date, interval '1 day')::date AS day
        FROM leave_requests
        WHERE status = 'APPROVED'
      ) lr_days
        ON lr_days.user_id = u.id
        AND lr_days.day BETWEEN $1 AND $2

      GROUP BY u.id
      ORDER BY u.id;
    `;

    const { rows } = await pool.query(query, [startDate, endDate]);

    const daysInMonth = new Date(
      Number(month.split("-")[0]),
      Number(month.split("-")[1]),
      0
    ).getDate();
    const holidayDaysResult = await pool.query(
      `SELECT COUNT(*)::int AS holiday_days
       FROM (
         SELECT d::date AS day
         FROM generate_series($1::date, $2::date, interval '1 day') d
         WHERE EXTRACT(DOW FROM d::date) = 0
            OR EXISTS (
              SELECT 1
              FROM holidays h
              WHERE h.holiday_date = d::date
            )
       ) non_working`,
      [startDate, endDate]
    );
    const holidayDays = Number(holidayDaysResult.rows[0]?.holiday_days || 0);

    const summary = rows.map(r => {
      const present = Number(r.present_days);
      const checkedIn = Number(r.checked_in_days);
      const onLeave = Number(r.leave_days);

      const absent =
        daysInMonth - holidayDays - present - checkedIn - onLeave;

      return {
        user_id: r.user_id,
        name: r.name,
        role: r.role,
        present_days: present,
        checked_in_days: checkedIn,
        on_leave_days: onLeave,
        absent_days: absent < 0 ? 0 : absent
      };
    });

    res.json({
      month,
      days_in_month: daysInMonth,
      holiday_days: holidayDays,
      summary
    });
  } catch (err) {
    console.error("Monthly attendance error:", err);
    res.status(500).json({ message: "Monthly attendance report failed" });
  }
};
exports.exportMonthlyAttendanceCSV = async (req, res) => {
  try {
    const { month } = req.query; // YYYY-MM

    if (!month) {
      return res.status(400).json({ message: "Month is required (YYYY-MM)" });
    }

    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    const query = `
      SELECT
        u.user_id,
        u.name,
        u.role,

        COUNT(DISTINCT a.date) FILTER (
          WHERE a.check_in IS NOT NULL AND a.check_out IS NOT NULL
        ) AS present_days,

        COUNT(DISTINCT a.date) FILTER (
          WHERE a.check_in IS NOT NULL AND a.check_out IS NULL
        ) AS checked_in_days,

        COUNT(DISTINCT lr_days.day) AS leave_days

      FROM users u

      LEFT JOIN attendance a
        ON u.id = a.user_id
        AND a.date BETWEEN $1 AND $2

      LEFT JOIN (
        SELECT 
          user_id,
          generate_series(from_date, to_date, interval '1 day')::date AS day
        FROM leave_requests
        WHERE status = 'APPROVED'
      ) lr_days
        ON lr_days.user_id = u.id
        AND lr_days.day BETWEEN $1 AND $2

      GROUP BY u.id
      ORDER BY u.id;
    `;

    const { rows } = await pool.query(query, [startDate, endDate]);

    const daysInMonth = new Date(
      Number(month.split("-")[0]),
      Number(month.split("-")[1]),
      0
    ).getDate();
    const holidayDaysResult = await pool.query(
      `SELECT COUNT(*)::int AS holiday_days
       FROM (
         SELECT d::date AS day
         FROM generate_series($1::date, $2::date, interval '1 day') d
         WHERE EXTRACT(DOW FROM d::date) = 0
            OR EXISTS (
              SELECT 1
              FROM holidays h
              WHERE h.holiday_date = d::date
            )
       ) non_working`,
      [startDate, endDate]
    );
    const holidayDays = Number(holidayDaysResult.rows[0]?.holiday_days || 0);

    // CSV header
    let csv = "User ID,Name,Role,Present Days,Checked-in Days,On Leave Days,Absent Days\n";

    rows.forEach(r => {
      const present = Number(r.present_days);
      const checkedIn = Number(r.checked_in_days);
      const onLeave = Number(r.leave_days);
      const absent = Math.max(daysInMonth - holidayDays - present - checkedIn - onLeave, 0);

      csv += `${r.user_id},${r.name},${r.role},${present},${checkedIn},${onLeave},${absent}\n`;
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=attendance_${month}.csv`
    );

    res.send(csv);
  } catch (err) {
    console.error("CSV export error:", err);
    res.status(500).json({ message: "CSV export failed" });
  }
};


exports.exportMonthlyAttendanceExcel = async (req, res) => {
  try {
    const { month } = req.query; // YYYY-MM

    if (!month) {
      return res.status(400).json({ message: "Month is required (YYYY-MM)" });
    }

    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    const query = `
      SELECT
        u.user_id,
        u.name,
        u.role,

        COUNT(DISTINCT a.date) FILTER (
          WHERE a.check_in IS NOT NULL AND a.check_out IS NOT NULL
        ) AS present_days,

        COUNT(DISTINCT a.date) FILTER (
          WHERE a.check_in IS NOT NULL AND a.check_out IS NULL
        ) AS checked_in_days,

        COUNT(DISTINCT lr_days.day) AS leave_days

      FROM users u

      LEFT JOIN attendance a
        ON u.id = a.user_id
        AND a.date BETWEEN $1 AND $2

      LEFT JOIN (
        SELECT 
          user_id,
          generate_series(from_date, to_date, interval '1 day')::date AS day
        FROM leave_requests
        WHERE status = 'APPROVED'
      ) lr_days
        ON lr_days.user_id = u.id
        AND lr_days.day BETWEEN $1 AND $2

      GROUP BY u.id
      ORDER BY u.id;
    `;

    const { rows } = await pool.query(query, [startDate, endDate]);

    const daysInMonth = new Date(
      Number(month.split("-")[0]),
      Number(month.split("-")[1]),
      0
    ).getDate();
    const holidayDaysResult = await pool.query(
      `SELECT COUNT(*)::int AS holiday_days
       FROM (
         SELECT d::date AS day
         FROM generate_series($1::date, $2::date, interval '1 day') d
         WHERE EXTRACT(DOW FROM d::date) = 0
            OR EXISTS (
              SELECT 1
              FROM holidays h
              WHERE h.holiday_date = d::date
            )
       ) non_working`,
      [startDate, endDate]
    );
    const holidayDays = Number(holidayDaysResult.rows[0]?.holiday_days || 0);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Attendance");

    sheet.columns = [
      { header: "User ID", key: "user_id", width: 15 },
      { header: "Name", key: "name", width: 20 },
      { header: "Role", key: "role", width: 15 },
      { header: "Present Days", key: "present", width: 15 },
      { header: "Checked-in Days", key: "checkedIn", width: 18 },
      { header: "On Leave Days", key: "onLeave", width: 15 },
      { header: "Absent Days", key: "absent", width: 15 }
    ];

    rows.forEach(r => {
      const present = Number(r.present_days);
      const checkedIn = Number(r.checked_in_days);
      const onLeave = Number(r.leave_days);
      const absent = Math.max(daysInMonth - holidayDays - present - checkedIn - onLeave, 0);

      sheet.addRow({
        user_id: r.user_id,
        name: r.name,
        role: r.role,
        present,
        checkedIn,
        onLeave,
        absent
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=attendance_${month}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("Excel export error:", err);
    res.status(500).json({ message: "Excel export failed" });
  }
};
exports.getTodayAttendanceDashboard = async (req, res) => {
  try {
    // Calculate start of percentage period: 2nd of current month (IST)
    const nowISTVal = nowIST();
    const istYear = nowISTVal.getUTCFullYear();
    const istMonth = nowISTVal.getUTCMonth();
    const monthStart2nd = `${istYear}-${String(istMonth + 1).padStart(2, '0')}-02`;
    const todayStr = nowISTVal.toISOString().split('T')[0];

    const result = await pool.query(`
      SELECT
        u.id,
        u.user_id,
        u.name,
        u.role,
        a.check_in,
        a.check_out,
        CASE
          WHEN up.id IS NOT NULL THEN 'PAUSED'
          WHEN a.status = 'HOLIDAY' THEN 'HOLIDAY'
          WHEN lr.id IS NOT NULL THEN 'ON_LEAVE'
          WHEN a.status = 'LATE' THEN 'LATE'
          WHEN a.check_in IS NOT NULL AND a.check_out IS NOT NULL THEN 'PRESENT'
          WHEN a.check_in IS NOT NULL AND a.check_out IS NULL THEN 'CHECKED_IN'
          ELSE 'ABSENT'
        END AS status,
        -- Period working days (excluding Sundays, Holidays, and Paused days)
        (
          SELECT COUNT(*)::int
          FROM (
            SELECT d::date AS day
            FROM generate_series($1::date, $2::date, interval '1 day') d
            WHERE EXTRACT(DOW FROM d::date) <> 0
              AND NOT EXISTS (SELECT 1 FROM holidays h WHERE h.holiday_date = d::date)
              AND NOT EXISTS (SELECT 1 FROM user_pauses up2 WHERE up2.user_id = u.id AND d::date BETWEEN up2.start_date AND up2.end_date)
          ) wd
        ) AS period_working_days,
        -- Present days in period
        (
          SELECT COUNT(DISTINCT att.date)::int
          FROM attendance att
          WHERE att.user_id = u.id
            AND att.date BETWEEN $1 AND $2
            AND att.check_in IS NOT NULL
            AND att.check_out IS NOT NULL
        ) AS period_present,
        -- Overall: working days (excluding Sundays, Holidays, and Paused days)
        (
          SELECT COUNT(*)::int
          FROM (
            SELECT d::date AS day
            FROM generate_series(GREATEST('2026-03-02'::date, u.created_at::date), $2::date, interval '1 day') d
            WHERE EXTRACT(DOW FROM d::date) <> 0
              AND NOT EXISTS (SELECT 1 FROM holidays h WHERE h.holiday_date = d::date)
              AND NOT EXISTS (SELECT 1 FROM user_pauses up3 WHERE up3.user_id = u.id AND d::date BETWEEN up3.start_date AND up3.end_date)
          ) wd
        ) AS overall_working_days,
        -- Overall: present days
        (
          SELECT COUNT(DISTINCT att3.date)::int
          FROM attendance att3
          WHERE att3.user_id = u.id
            AND att3.date BETWEEN GREATEST('2026-03-02'::date, u.created_at::date) AND $2::date
            AND att3.check_in IS NOT NULL
            AND att3.check_out IS NOT NULL
        ) AS overall_present,
        GREATEST('2026-03-02'::date, u.created_at::date) AS joined_date
      FROM users u
      LEFT JOIN attendance a
        ON a.user_id = u.id
        AND a.date = CURRENT_DATE
      LEFT JOIN leave_requests lr
        ON lr.user_id = u.id
        AND lr.status = 'APPROVED'
        AND CURRENT_DATE BETWEEN lr.from_date AND lr.to_date
      LEFT JOIN user_pauses up
        ON up.user_id = u.id
        AND CURRENT_DATE BETWEEN up.start_date AND up.end_date
      ORDER BY u.id
    `, [monthStart2nd, todayStr]);


    const rows = result.rows.map(r => {
      // Monthly % (2nd to today)
      const workDays = r.period_working_days || 0;
      const presentDays = r.period_present || 0;
      const pct = workDays === 0 ? 100 : Math.min(Math.round((presentDays / workDays) * 100), 100);

      // Overall % (since joining)
      const ovWDays = r.overall_working_days || 0;
      const ovPDays = r.overall_present || 0;
      const ovPct = ovWDays === 0 ? 100 : Math.min(Math.round((ovPDays / ovWDays) * 100), 100);

      return {
        ...r,
        attendance_percentage: pct,
        overall_percentage: ovPct,
        overall_present: ovPDays,
        overall_working_days: ovWDays,
        joined_date: r.joined_date,
        period_from: monthStart2nd,
        period_to: todayStr
      };
    });

    res.json(rows);

  } catch (err) {
    console.error("Admin attendance dashboard error:", err);
    res.status(500).json({ message: "Failed to fetch attendance dashboard" });
  }
};

exports.autoProcessAttendance = async (req, res) => {
  try {
    const today = todayIST();
    const holidayRes = await pool.query(
      `SELECT 1
       FROM holidays
       WHERE holiday_date = $1
          OR EXTRACT(DOW FROM $1::date) = 0
       LIMIT 1`,
      [today]
    );
    const fallbackStatus = holidayRes.rows.length > 0 ? "HOLIDAY" : "ABSENT";

    await pool.query(`
      INSERT INTO attendance (user_id, date, status)
      SELECT
        u.id,
        $1,
        $2
      FROM users u
      WHERE NOT EXISTS (
        SELECT 1 FROM attendance a
        WHERE a.user_id = u.id
          AND a.date = $1
      )
    `, [today, fallbackStatus]);

    res.json({ message: `Attendance auto processed successfully (${fallbackStatus})` });

  } catch (err) {
    console.error("Auto attendance error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
exports.toggleGeoSetting = async (req, res) => {
  try {
    const geo_enabled = req.body.geo_enabled ?? req.body.is_enabled;

    await pool.query(`
      UPDATE system_settings
      SET geo_enabled = $1,
          updated_at = CURRENT_TIMESTAMP
    `, [geo_enabled]);

    res.json({
      message: geo_enabled
        ? "Geo restriction enabled"
        : "Geo restriction disabled"
    });

  } catch (err) {
    console.error("Toggle geo error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
exports.getGeoSetting = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT geo_enabled FROM system_settings LIMIT 1
    `);

    res.json(result.rows[0]);

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};
exports.updateGeoSetting = async (req, res) => {

  try {
    const { is_enabled } = req.body;

    await pool.query(
      `
      UPDATE system_settings
      SET geo_enabled = $1
      WHERE id = 1
      `,
      [is_enabled]
    );

    res.json({ message: "Geo setting updated successfully" });

  } catch (err) {
    console.error("Update geo setting error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= OFFICE SETTINGS ================= */

exports.getOfficeSettings = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT latitude, longitude, allowed_radius FROM office_settings LIMIT 1
    `);

    if (result.rows.length === 0) {
      return res.json({ latitude: null, longitude: null, allowed_radius: 100 });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Get office settings error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateOfficeSettings = async (req, res) => {
  try {
    const { latitude, longitude, allowed_radius } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ message: "Latitude and longitude are required" });
    }

    const existing = await pool.query(`SELECT id FROM office_settings LIMIT 1`);

    if (existing.rows.length > 0) {
      await pool.query(`
        UPDATE office_settings
        SET latitude = $1, longitude = $2, allowed_radius = $3
        WHERE id = $4
      `, [latitude, longitude, allowed_radius || 100, existing.rows[0].id]);
    } else {
      await pool.query(`
        INSERT INTO office_settings (latitude, longitude, allowed_radius)
        VALUES ($1, $2, $3)
      `, [latitude, longitude, allowed_radius || 100]);
    }

    res.json({ message: "Office location updated successfully" });
  } catch (err) {
    console.error("Update office settings error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= EARLY CHECKOUT / OVERTIME LOGS ================= */

exports.getEarlyCheckoutsToday = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.user_id,
        u.name,
        u.role,
        a.early_checkout_minutes,
        a.check_out,
        s.name AS shift_name,
        s.check_out_time AS shift_end_time
      FROM attendance a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN shifts s ON s.id = a.shift_id
      WHERE a.date = CURRENT_DATE
        AND a.early_checkout_minutes > 0
      ORDER BY a.early_checkout_minutes DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Early checkouts query error:", err);
    res.status(500).json({ message: "Failed to fetch early checkouts" });
  }
};

exports.getOvertimeToday = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.user_id,
        u.name,
        u.role,
        a.overtime_minutes,
        a.check_out,
        s.name AS shift_name,
        s.check_out_time AS shift_end_time
      FROM attendance a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN shifts s ON s.id = a.shift_id
      WHERE a.date = CURRENT_DATE
        AND a.overtime_minutes > 0
      ORDER BY a.overtime_minutes DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Overtime query error:", err);
    res.status(500).json({ message: "Failed to fetch overtime records" });
  }
};
