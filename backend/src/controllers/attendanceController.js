const pool = require("../config/db");
const emailService = require('../services/emailService');
const { nowIST, todayIST, getWeekRangeIST, getMonthPeriodIST } = require('../utils/istTime');

function getIstNowShifted() { return nowIST(); }

function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = value => (value * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

async function getHolidayByDate(date) {
  const result = await pool.query(
    `SELECT id, holiday_date, name
     FROM holidays
     WHERE holiday_date = $1
     LIMIT 1`,
    [date]
  );
  return result.rows[0] || null;
}

function isSundayDate(date) {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay() === 0;
}

async function getNonWorkingMetaByDate(date) {
  const holiday = await getHolidayByDate(date);
  const isSunday = isSundayDate(date);
  return {
    holiday,
    isSunday,
    isNonWorking: Boolean(holiday) || isSunday
  };
}

async function getPauseStateForDate(userId, date) {
  const result = await pool.query(
    `
    SELECT
      u.status,
      EXISTS (
        SELECT 1
        FROM user_pauses up
        WHERE up.user_id = u.id
          AND $2 BETWEEN up.start_date AND up.end_date
      ) AS is_paused
    FROM users u
    WHERE u.id = $1
    LIMIT 1
    `,
    [userId, date]
  );

  if (result.rows.length === 0) {
    return { status: null, isPaused: false };
  }

  const row = result.rows[0];
  return {
    status: row.status,
    isPaused: row.status === "PAUSED" || row.is_paused
  };
}

async function seedDayAttendance(date) {
  const { isNonWorking } = await getNonWorkingMetaByDate(date);
  const fallbackStatus = isNonWorking ? "HOLIDAY" : "ABSENT";

  await pool.query(
    `
    INSERT INTO attendance (user_id, date, status)
    SELECT u.id, $1, $2
    FROM users u
    WHERE u.status = 'ACTIVE'
      AND NOT EXISTS (
      SELECT 1
      FROM attendance a
      WHERE a.user_id = u.id
        AND a.date = $1
    )
    `,
    [date, fallbackStatus]
  );

  return fallbackStatus;
}

/**
 * Convert a UTC timestamp from the DB into "HH:MM AM/PM" in IST.
 * We manually add 5h30m to avoid relying on Intl/ICU timezone support
 * which may be missing on Render.com's Node.js runtime.
 */
function formatUTCtoIST(raw) {
  if (!raw) return null;
  const utcMs = new Date(raw).getTime();
  // IST = UTC + 5:30 = UTC + 19800 seconds
  const istMs = utcMs + (5 * 60 + 30) * 60 * 1000;
  const d = new Date(istMs);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const period = h < 12 ? 'AM' : 'PM';
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  const displayMin = String(m).padStart(2, '0');
  return `${String(displayHour).padStart(2, '0')}:${displayMin} ${period}`;
}

// User check-in
exports.checkIn = async (req, res) => {
  try {
    console.log("📍 Received Location:", req.body);

    const userId = req.user.id;
    const userRole = req.user.role; // e.g. 'ADMIN', 'LEAD', 'MEMBER'
    const isAdmin = userRole === "ADMIN";

    const today = todayIST();
    const pauseState = await getPauseStateForDate(userId, today);
    if (pauseState.isPaused) {
      return res.status(403).json({
        message: "Your account is currently paused by admin. Check-in is unavailable."
      });
    }

    const { holiday, isSunday, isNonWorking } = await getNonWorkingMetaByDate(today);

    if (isNonWorking) {
      return res.status(400).json({
        message: holiday
          ? `Today is marked as a holiday${holiday.name ? ` (${holiday.name})` : ""}. Check-in is disabled.`
          : (isSunday ? "Sunday is a non-working day. Check-in is disabled." : "This is a non-working day. Check-in is disabled.")
      });
    }

    // Use IST for shift comparisons (Render.com runs in UTC)
    const nowISTVal = nowIST();

    const latitude = parseFloat(req.body.latitude);
    const longitude = parseFloat(req.body.longitude);

    // 🔹 Leave check
    const leaveCheck = await pool.query(`
      SELECT 1 FROM leave_requests
      WHERE user_id = $1
        AND status = 'APPROVED'
        AND CURRENT_DATE BETWEEN from_date AND to_date
    `, [userId]);

    if (leaveCheck.rows.length > 0) {
      return res.status(400).json({ message: "You are on approved leave" });
    }

    // 🔹 Prevent double check-in
    const existing = await pool.query(
      `SELECT * FROM attendance WHERE user_id = $1 AND date = $2`,
      [userId, today]
    );

    if (existing.rows.length > 0 && existing.rows[0].check_in) {
      return res.status(400).json({ message: "Already checked in today" });
    }

    // 🔹 Block check-in if pending missed checkout reports exist
    if (!isAdmin) {
      const pendingMissed = await pool.query(
        `SELECT COUNT(*)::int AS count FROM missed_checkouts
         WHERE user_id = $1 AND status = 'PENDING'`,
        [userId]
      );

      if (pendingMissed.rows[0].count > 0) {
        return res.status(403).json({
          message: `You have ${pendingMissed.rows[0].count} pending missed checkout report(s). Submit them before checking in.`
        });
      }
    }

    // 🔹 Geo restriction (skip for ADMIN)
    if (!isAdmin) {
      const geoSetting = await pool.query(`
        SELECT geo_enabled FROM system_settings LIMIT 1
      `);
      const geoEnabled = geoSetting.rows[0]?.geo_enabled;

      // Only enforce location checks when geo-fencing is enabled
      if (geoEnabled) {
        const office = await pool.query(`
          SELECT latitude, longitude, allowed_radius FROM office_settings LIMIT 1
        `);

        if (office.rows.length === 0) {
          return res.status(400).json({ message: "Office location not configured" });
        }

        if (isNaN(latitude) || isNaN(longitude)) {
          return res.status(400).json({ message: "Location required for check-in" });
        }

        const officeLat = parseFloat(office.rows[0].latitude);
        const officeLon = parseFloat(office.rows[0].longitude);
        const allowedRadius = parseFloat(office.rows[0].allowed_radius);
        const gpsAccuracy = parseFloat(req.body.accuracy) || 0;

        console.log(`📍 User coords: lat=${latitude}, lon=${longitude}, GPS accuracy: ~${gpsAccuracy.toFixed(0)}m`);
        console.log(`🏢 Office coords: lat=${officeLat}, lon=${officeLon}`);
        console.log(`📐 Allowed radius: ${allowedRadius}m`);

        const distance = getDistanceInMeters(latitude, longitude, officeLat, officeLon);

        // Account for GPS inaccuracy: if GPS says accuracy is 200m,
        // the real position could be up to 200m closer than reported
        const effectiveDistance = Math.max(0, distance - gpsAccuracy);

        console.log(`📏 Raw distance: ${distance.toFixed(2)}m | GPS accuracy: ~${gpsAccuracy.toFixed(0)}m | Effective distance: ${effectiveDistance.toFixed(2)}m | Allowed: ${allowedRadius}m`);

        if (effectiveDistance > allowedRadius) {
          return res.status(403).json({
            message: `You are outside office location (${Math.round(distance)}m away, GPS accuracy: ~${Math.round(gpsAccuracy)}m, allowed: ${allowedRadius}m)`
          });
        }
      } else {
        console.log("🌍 Geo-fencing disabled — skipping location check");
      }
    } else {
      console.log("👑 Admin user — skipping geo check");
    }

    // 🔹 Shift window check (skip for ADMIN)
    const shiftRes = await pool.query(`SELECT * FROM shifts ORDER BY check_in_time ASC`);

    if (shiftRes.rows.length < 2) {
      return res.status(500).json({ message: "Two shifts must be configured" });
    }

    const shift1 = shiftRes.rows[0];
    const shift2 = shiftRes.rows[1];

    // Build shift window times in IST (same timezone the admin used when entering times)
    function buildTimeIST(timeString) {
      const [h, m, s] = timeString.split(":");
      const t = new Date(nowISTVal);
      t.setUTCHours(Number(h), Number(m), Number(s || 0), 0);
      return t;
    }

    const shift1Last = buildTimeIST(shift1.last_checkin_time, nowISTVal);
    const shift2Last = buildTimeIST(shift2.last_checkin_time, nowISTVal);

    console.log(`🕐 Server UTC now: ${new Date().toISOString()}`);
    console.log(`🕐 IST now: ${nowISTVal.toISOString()}`);
    console.log(`🕐 Shift1 last check-in (IST): ${shift1.last_checkin_time} → ${shift1Last.toISOString()}`);
    console.log(`🕐 Shift2 last check-in (IST): ${shift2.last_checkin_time} → ${shift2Last.toISOString()}`);

    let selectedShift = null;

    if (isAdmin) {
      // Admin gets auto-assigned to whichever shift window is closest/current
      // If both windows passed, assign to shift2 (latest) — no blocking
      if (nowISTVal <= shift1Last) {
        selectedShift = shift1;
      } else if (nowISTVal <= shift2Last) {
        selectedShift = shift2;
      } else {
        // Admin can still check in even after all windows — assign to nearest shift
        selectedShift = shift2;
        console.log("👑 Admin checking in after shift windows — assigning to shift2");
      }
    } else {
      if (nowISTVal <= shift1Last) {
        selectedShift = shift1;
      } else if (nowISTVal <= shift2Last) {
        selectedShift = shift2;
      }
    }

    // 🔹 Missed both shifts (non-admin only)
    if (!selectedShift) {
      await pool.query(
        `INSERT INTO attendance (user_id, date, status)
         VALUES ($1, $2, 'LATE')
         ON CONFLICT (user_id, date)
         DO UPDATE SET status = 'LATE'`,
        [userId, today]
      );

      return res.status(403).json({
        message: "Missed all shift check-in windows. Contact admin."
      });
    }

    // ✅ Successful check-in
    await pool.query(
      `INSERT INTO attendance
       (user_id, date, check_in, status, shift_id)
       VALUES ($1, $2, NOW(), 'CHECKED_IN', $3)
       ON CONFLICT (user_id, date)
       DO UPDATE SET
         check_in = NOW(),
         status = 'CHECKED_IN',
         shift_id = $3`,
      [userId, today, selectedShift.id]
    );

    // 🔹 Late Arrival Email Check
    const shiftStart = buildTimeIST(selectedShift.check_in_time);

    if (nowISTVal > shiftStart) {
      const checkInTime = nowISTVal.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      console.log(`📧 User is late. Sending email for check-in at ${checkInTime}`);
      await emailService.sendLateArrivalEmail(userId, checkInTime);
    }

    res.json({ message: `Checked in under ${selectedShift.name}` });

  } catch (err) {
    console.error("Check-in error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
// User check-out
exports.checkOut = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const today = todayIST();

    const result = await pool.query(
      `SELECT * FROM attendance
       WHERE user_id = $1 AND date = $2`,
      [userId, today]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        message: "You have not checked in today"
      });
    }

    const record = result.rows[0];

    if (record.check_out) {
      return res.status(400).json({
        message: "Already checked out"
      });
    }

    // Daily report rule for all users:
    const dailyReportResult = await pool.query(
      `SELECT 1
       FROM work_reports
       WHERE user_id = $1
         AND report_type = 'DAILY'
         AND report_date = $2
       LIMIT 1`,
      [userId, today]
    );

    if (dailyReportResult.rows.length === 0) {
      const notificationMessage = "Checkout blocked: Submit today's daily work report before checkout.";

      await pool.query(
        `
        INSERT INTO notifications (user_id, message, is_read, created_at)
        SELECT $1, $2, FALSE, NOW()
        WHERE NOT EXISTS (
          SELECT 1
          FROM notifications
          WHERE user_id = $1
            AND message = $2
            AND created_at >= NOW() - INTERVAL '12 hours'
        )
        `,
        [userId, notificationMessage]
      );

      return res.status(400).json({
        message: "Please submit today's daily work report before checkout."
      });
    }

    // Saturday rule for LEAD and MEMBER:
    const istNow = getIstNowShifted();
    const isSaturdayIST = istNow.getUTCDay() === 6;
    const isLeadOrMember = userRole === "LEAD" || userRole === "MEMBER";

    if (isLeadOrMember && isSaturdayIST) {
      const { weekStart } = getWeekRangeIST();

      const weeklyReportResult = await pool.query(
        `SELECT 1
         FROM work_reports
         WHERE user_id = $1
           AND report_type = 'WEEKLY'
           AND week_start = $2
         LIMIT 1`,
        [userId, weekStart]
      );

      if (weeklyReportResult.rows.length === 0) {
        const notificationMessage = "Saturday checkout blocked: Submit this week's weekly report before checkout.";

        await pool.query(
          `
          INSERT INTO notifications (user_id, message, is_read, created_at)
          SELECT $1, $2, FALSE, NOW()
          WHERE NOT EXISTS (
            SELECT 1
            FROM notifications
            WHERE user_id = $1
              AND message = $2
              AND created_at >= NOW() - INTERVAL '12 hours'
          )
          `,
          [userId, notificationMessage]
        );

        return res.status(400).json({
          message: "On Saturdays, weekly report submission is mandatory before checkout."
        });
      }
    }

    // ===== Early Checkout / Overtime Detection =====
    const nowIST_CO = nowIST();

    let earlyMinutes = 0;
    let overtimeMinutes = 0;
    let shiftEndTimeFormatted = null;

    if (record.shift_id) {
      const shiftResult = await pool.query(
        `SELECT check_out_time, name FROM shifts WHERE id = $1`,
        [record.shift_id]
      );

      if (shiftResult.rows.length > 0 && shiftResult.rows[0].check_out_time) {
        const shift = shiftResult.rows[0];
        const [h, m, s] = shift.check_out_time.split(":").map(Number);

        // Build shift end time in IST-shifted frame for correct diff
        const shiftEnd = new Date(nowIST_CO);
        shiftEnd.setUTCHours(h, m, s || 0, 0);

        const diffMs = nowIST_CO.getTime() - shiftEnd.getTime();
        const diffMinutes = Math.round(diffMs / 60000);

        if (diffMinutes < 0) {
          earlyMinutes = Math.abs(diffMinutes);
        } else if (diffMinutes > 0) {
          overtimeMinutes = diffMinutes;
        }

        // Format shift end time directly from IST hours stored in DB
        const period = h < 12 ? 'AM' : 'PM';
        const displayHour = h % 12 === 0 ? 12 : h % 12;
        const displayMin = String(m).padStart(2, '0');
        shiftEndTimeFormatted = `${String(displayHour).padStart(2, '0')}:${displayMin} ${period}`;
      }
    }

    // Update attendance with checkout time
    await pool.query(
      `UPDATE attendance
       SET check_out = NOW(),
           status = 'PRESENT',
           early_checkout_minutes = $2,
           overtime_minutes = $3
       WHERE id = $1`,
      [record.id, earlyMinutes, overtimeMinutes]
    );

    // ===== Notifications =====
    const formatMinutes = (mins) => {
      if (mins >= 60) {
        const hrs = Math.floor(mins / 60);
        const remainMins = mins % 60;
        return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
      }
      return `${mins} minutes`;
    };

    let userName = '';
    if (earlyMinutes > 0) {
      const userRes = await pool.query(`SELECT name FROM users WHERE id = $1`, [userId]);
      userName = userRes.rows[0]?.name || 'A member';
    }

    if (earlyMinutes > 0 && shiftEndTimeFormatted) {
      const memberMsg = `⚠️ You checked out ${formatMinutes(earlyMinutes)} before your shift ends (Shift ends: ${shiftEndTimeFormatted})`;
      await pool.query(
        `INSERT INTO notifications (user_id, message, is_read, created_at) VALUES ($1, $2, false, NOW())`,
        [userId, memberMsg]
      );

      const adminMsg = `⚠️ ${userName} checked out ${formatMinutes(earlyMinutes)} early (Shift ends: ${shiftEndTimeFormatted})`;
      await pool.query(
        `INSERT INTO notifications (user_id, message, is_read, created_at)
         SELECT id, $1, false, NOW() FROM users WHERE role = 'ADMIN'`,
        [adminMsg]
      );
    }

    if (overtimeMinutes > 0 && shiftEndTimeFormatted) {
      const memberMsg = `💪 You worked ${formatMinutes(overtimeMinutes)} of overtime today (Shift ended: ${shiftEndTimeFormatted})`;
      await pool.query(
        `INSERT INTO notifications (user_id, message, is_read, created_at) VALUES ($1, $2, false, NOW())`,
        [userId, memberMsg]
      );
    }

    let responseMsg = "Checked out successfully";
    if (earlyMinutes > 0 && shiftEndTimeFormatted) {
      responseMsg += `. ⚠️ You left ${formatMinutes(earlyMinutes)} early (Shift ends: ${shiftEndTimeFormatted})`;
    } else if (overtimeMinutes > 0 && shiftEndTimeFormatted) {
      responseMsg += `. 💪 You worked ${formatMinutes(overtimeMinutes)} overtime (Shift ended: ${shiftEndTimeFormatted})`;
    }

    res.json({
      message: responseMsg,
      early_checkout_minutes: earlyMinutes,
      overtime_minutes: overtimeMinutes
    });

  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


// ================= ADMIN: MONTHLY ATTENDANCE SUMMARY =================

// Get logged-in user's today status
exports.getMyTodayStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const today = todayIST();
    const { isNonWorking } = await getNonWorkingMetaByDate(today);
    const pauseState = await getPauseStateForDate(userId, today);

    const result = await pool.query(`
      SELECT
        check_in,
        check_out,
        CASE
          WHEN status = 'HOLIDAY' THEN 'HOLIDAY'
          WHEN check_in IS NOT NULL AND check_out IS NOT NULL THEN 'PRESENT'
          WHEN check_in IS NOT NULL AND check_out IS NULL THEN 'CHECKED_IN'
          ELSE 'ABSENT'
        END AS status
      FROM attendance
      WHERE user_id = $1 AND date = $2
    `, [userId, today]);

    if (pauseState.isPaused) {
      const pausedRecord = result.rows[0] || {};
      return res.json({
        check_in: pausedRecord.check_in || null,
        check_out: pausedRecord.check_out || null,
        status: "PAUSED"
      });
    }

    if (result.rows.length === 0) {
      return res.json({ status: isNonWorking ? "HOLIDAY" : "ABSENT" });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to get status" });
  }
};
// ================= ADMIN: ALLOW LATE CHECK-IN =================


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

        COUNT(DISTINCT lr_day.day) AS leave_days

      FROM users u

      LEFT JOIN attendance a
        ON u.id = a.user_id
        AND a.date BETWEEN $1 AND $2

      LEFT JOIN (
        SELECT user_id, generate_series(from_date, to_date, interval '1 day')::date AS day
        FROM leave_requests
        WHERE status = 'APPROVED'
      ) lr_day
        ON lr_day.user_id = u.id
        AND lr_day.day BETWEEN $1 AND $2

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

    const result = rows.map(r => {
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
      summary: result
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Monthly report error" });
  }
};

// ================= ADMIN: ALLOW LATE CHECK-IN =================
exports.allowLateCheckIn = async (req, res) => {
  try {
    const { userId, shiftId } = req.body;

    const result = await pool.query(
      `UPDATE attendance
       SET status = 'CHECKED_IN',
           check_in = NOW(),
           shift_id = $2
       WHERE user_id = $1
         AND date = CURRENT_DATE
       RETURNING *`,
      [userId, shiftId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "No late record found" });
    }

    // 🔔 Send notification to user
    const notifMessage = `✅ Your late check-in exception for today has been approved by Admin. You are now checked in.`;
    await pool.query(
      `INSERT INTO notifications (user_id, message, is_read, created_at)
       VALUES ($1, $2, false, NOW())`,
      [userId, notifMessage]
    );

    res.json({ message: "Late check-in approved" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};


exports.autoCreateTodayAttendance = async () => {
  try {
    const today = todayIST();
    const status = await seedDayAttendance(today);
    console.log(`✅ Today attendance auto-created with fallback status: ${status}`);

  } catch (err) {
    console.error("❌ Auto attendance error:", err);
  }
};

// ================= ADMIN: TODAY ATTENDANCE DASHBOARD =================
exports.getTodayAttendanceDashboard = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(u.id) AS total_users,

        COUNT(a.id) FILTER (
          WHERE a.check_in IS NOT NULL
            AND a.check_out IS NULL
        ) AS checked_in,

        COUNT(a.id) FILTER (
          WHERE a.check_in IS NOT NULL
            AND a.check_out IS NOT NULL
        ) AS present,

        COUNT(lr.id) AS on_leave,

        COUNT(a.id) FILTER (
          WHERE a.status = 'HOLIDAY'
        ) AS holiday_count,

        COUNT(u.id)
        - COUNT(a.id) FILTER (
            WHERE a.check_in IS NOT NULL
              AND a.check_out IS NULL
          )
        - COUNT(a.id) FILTER (
            WHERE a.check_in IS NOT NULL
              AND a.check_out IS NOT NULL
          )
        - COUNT(lr.id)
        - COUNT(a.id) FILTER (
            WHERE a.status = 'HOLIDAY'
          ) AS absent

      FROM users u

      LEFT JOIN attendance a
        ON a.user_id = u.id
        AND a.date = CURRENT_DATE

      LEFT JOIN leave_requests lr
        ON lr.user_id = u.id
        AND lr.status = 'APPROVED'
        AND CURRENT_DATE BETWEEN lr.from_date AND lr.to_date
    `);

    const row = result.rows[0];

    res.json({
      total_users: Number(row.total_users),
      checked_in: Number(row.checked_in),
      present: Number(row.present),
      on_leave: Number(row.on_leave),
      holiday: Number(row.holiday_count),
      absent: Math.max(0, Number(row.absent))
    });

  } catch (err) {
    console.error("Today dashboard error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getTodayAttendanceList = async (req, res) => {
  try {
    const result = await pool.query(`
      WITH day_meta AS (
        SELECT EXISTS (
          SELECT 1 FROM holidays WHERE holiday_date = CURRENT_DATE
        ) OR EXTRACT(DOW FROM CURRENT_DATE) = 0 AS is_holiday
      )
      SELECT
        u.id AS user_db_id,
        u.user_id AS user_id,
        u.name,
        u.role,
        u.status AS user_status,
        a.check_in,
        a.check_out,
        CASE
          WHEN u.status = 'PAUSED' THEN 'PAUSED'
          WHEN a.status IS NOT NULL THEN a.status
          WHEN dm.is_holiday THEN 'HOLIDAY'
          WHEN lr.id IS NOT NULL THEN 'ON_LEAVE'
          ELSE 'ABSENT'
        END AS status
      FROM users u
      CROSS JOIN day_meta dm
      LEFT JOIN attendance a
        ON a.user_id = u.id
        AND a.date = CURRENT_DATE
      LEFT JOIN leave_requests lr
        ON lr.user_id = u.id
        AND lr.status = 'APPROVED'
        AND CURRENT_DATE BETWEEN lr.from_date AND lr.to_date
      ORDER BY u.id
    `);


    res.json(result.rows);
  } catch (err) {
    console.error("Today attendance list error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
exports.getLateUsersToday = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        a.user_id,
        u.user_id AS user_code,
        u.name
      FROM attendance a
      JOIN users u ON u.id = a.user_id
      WHERE a.date = CURRENT_DATE
        AND a.status = 'LATE'
    `);

    res.json(result.rows);

  } catch (err) {
    console.error("Get late users error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
exports.applyLeave = async (req, res) => {
  try {
    const userId = req.user.id;
    const { from_date, to_date, reason } = req.body;

    if (!from_date || !to_date || !reason) {
      return res.status(400).json({
        message: "All fields are required"
      });
    }

    if (from_date > to_date) {
      return res.status(400).json({
        message: "Invalid date range"
      });
    }

    // Calculate days requested
    const requestedDays = Math.ceil(
      (new Date(to_date) - new Date(from_date)) / (1000 * 60 * 60 * 24)
    ) + 1;

    // Check leave balance
    const year = nowIST().getUTCFullYear();
    const balRes = await pool.query(
      `SELECT remaining FROM leave_balances WHERE user_id = $1 AND year = $2`,
      [userId, year]
    );

    const remaining = balRes.rows.length > 0 ? balRes.rows[0].remaining : 18;
    const isExtraLeave = requestedDays > remaining;

    await pool.query(
      `INSERT INTO leave_requests
       (user_id, from_date, to_date, reason, status, applied_at)
       VALUES ($1, $2, $3, $4, 'PENDING', NOW())`,
      [userId, from_date, to_date, reason]
    );

    // Notify admin about extra leave
    if (isExtraLeave) {
      const userRes = await pool.query(`SELECT name FROM users WHERE id = $1`, [userId]);
      const userName = userRes.rows[0]?.name || 'A user';
      const adminRes = await pool.query(`SELECT id FROM users WHERE role = 'ADMIN'`);
      for (const admin of adminRes.rows) {
        await pool.query(
          `INSERT INTO notifications (user_id, message, is_read, created_at) VALUES ($1, $2, false, NOW())`,
          [admin.id, `⚠️ ${userName} applied for ${requestedDays} day(s) leave but only has ${remaining} remaining (quota: 18). Please review.`]
        );
      }
    }

    if (isExtraLeave) {
      res.json({
        message: `Leave request submitted. ⚠️ You have only ${remaining} leave(s) remaining out of 18. Admin will review your extra leave request.`
      });
    } else {
      res.json({ message: "Leave request submitted successfully" });
    }

  } catch (err) {
    console.error("Apply leave error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
/* ================= MY ATTENDANCE HISTORY ================= */
exports.getMyAttendanceHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const month = req.query.month || todayIST().slice(0, 7);
    const [year, monthNum] = month.split("-").map(Number);
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${String(new Date(Date.UTC(year, monthNum, 0)).getUTCDate()).padStart(2, "0")}`;

    const result = await pool.query(
      `
      WITH pause_days AS (
        SELECT generate_series(
          GREATEST(start_date, $2::date),
          LEAST(end_date, $3::date),
          interval '1 day'
        )::date AS date
        FROM user_pauses
        WHERE user_id = $1
          AND start_date <= $3::date
          AND end_date >= $2::date
      ),
      day_rows AS (
        SELECT a.date
        FROM attendance a
        WHERE a.user_id = $1
          AND a.date BETWEEN $2::date AND $3::date
        UNION
        SELECT pd.date
        FROM pause_days pd
      )
      SELECT
        d.date,
        a.check_in,
        a.check_out,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM user_pauses up
            WHERE up.user_id = $1
              AND d.date BETWEEN up.start_date AND up.end_date
          ) THEN 'PAUSED'
          ELSE COALESCE(a.status, 'ABSENT')
        END AS status,
        s.name AS shift_name,
        a.early_checkout_minutes,
        a.overtime_minutes
      FROM day_rows d
      LEFT JOIN attendance a
        ON a.user_id = $1
       AND a.date = d.date
      LEFT JOIN shifts s
        ON s.id = a.shift_id
      ORDER BY d.date DESC
      `,
      [userId, monthStart, monthEnd]
    );

    const formattedRows = result.rows.map(r => {
      return {
        ...r,
        check_in: r.check_in,
        check_out: r.check_out
      };
    });

    res.json(formattedRows);
  } catch (err) {
    console.error("My attendance history error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= MY LEAVE REQUESTS HISTORY ================= */
exports.getMyLeaveRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!userId) {
      return res.status(400).json({ message: "User ID not found in token" });
    }

    const result = await pool.query(
      `SELECT
         id,
         from_date,
         to_date,
         reason,
         status,
         applied_at
       FROM leave_requests
       WHERE user_id = $1
       ORDER BY applied_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("My leave requests error:", err.message, err.stack);
    res.status(500).json({ message: "Failed to fetch leave requests", error: err.message });
  }
};

/* ================= MY LEAVE BALANCE ================= */
exports.getMyLeaveBalance = async (req, res) => {
  try {
    const userId = req.user.id;
    const year = nowIST().getUTCFullYear();
    const QUOTA = 18; // Annual leave quota

    // 1. Count ONLY approved leave request days (single source of truth)
    //    ON_LEAVE attendance rows are just a display status and must NOT be double-counted
    const approvedResult = await pool.query(
      `SELECT COALESCE(SUM((to_date::date - from_date::date) + 1), 0) AS used_days
       FROM leave_requests
       WHERE user_id = $1
         AND status = 'APPROVED'
         AND EXTRACT(YEAR FROM from_date::date) = $2`,
      [userId, year]
    );

    // 2. Count pending leave requests
    const pendingResult = await pool.query(
      `SELECT COALESCE(SUM((to_date::date - from_date::date) + 1), 0) AS pending_days
       FROM leave_requests
       WHERE user_id = $1
         AND status = 'PENDING'
         AND EXTRACT(YEAR FROM from_date::date) = $2`,
      [userId, year]
    );

    const used = parseInt(approvedResult.rows[0].used_days, 10);

    console.log("LEAVE BALANCE DEBUG for user", userId, ": used (from approved requests only)=", used);
    const pending = parseInt(pendingResult.rows[0].pending_days, 10);
    const remaining = Math.max(0, QUOTA - used);

    res.json({
      quota: QUOTA,
      used,
      remaining,
      pending,
      year,
      breakdown: {
        from_leave_requests: used,
        from_admin_leaves: 0
      }
    });

  } catch (err) {
    console.error("Leave balance error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= HOLIDAYS (ADMIN) ================= */
exports.getHolidays = async (req, res) => {
  try {
    const { from, to } = req.query;
    const params = [];
    let where = "";

    if (from && to) {
      where = "WHERE holiday_date BETWEEN $1::date AND $2::date";
      params.push(from, to);
    } else if (from) {
      where = "WHERE holiday_date >= $1::date";
      params.push(from);
    } else if (to) {
      where = "WHERE holiday_date <= $1::date";
      params.push(to);
    }

    const result = await pool.query(
      `SELECT id, holiday_date, name, created_at
       FROM holidays
       ${where}
       ORDER BY holiday_date ASC`,
      params
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Get holidays error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.addHoliday = async (req, res) => {
  try {
    const { holiday_date, name } = req.body;

    if (!holiday_date) {
      return res.status(400).json({ message: "holiday_date is required" });
    }

    const insertResult = await pool.query(
      `INSERT INTO holidays (holiday_date, name)
       VALUES ($1, NULLIF(TRIM($2), ''))
       ON CONFLICT (holiday_date)
       DO UPDATE SET name = EXCLUDED.name
       RETURNING id, holiday_date, name`,
      [holiday_date, name || null]
    );

    await seedDayAttendance(holiday_date);

    await pool.query(
      `UPDATE attendance
       SET status = 'HOLIDAY',
           check_in = NULL,
           check_out = NULL
       WHERE date = $1
         AND status = 'ABSENT'`,
      [holiday_date]
    );

    const announcementText = `📢 Admin Announcement: Holiday declared on ${holiday_date}${name ? ` (${name})` : ""}. This day will not be marked absent.`;
    await pool.query(
      `INSERT INTO notifications (user_id, message, is_read, created_at)
       SELECT id, $1, false, NOW()
       FROM users`,
      [announcementText]
    );

    res.json({
      message: "Holiday saved successfully",
      holiday: insertResult.rows[0]
    });
  } catch (err) {
    console.error("Add holiday error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= MY ATTENDANCE PERCENTAGE (from 2nd of current month) ================= */
exports.getMyAttendancePercentage = async (req, res) => {
  try {
    const userId = req.user.id;

    const { startStr, todayStr } = getMonthPeriodIST();

    const workingDaysResult = await pool.query(
      `SELECT COUNT(*)::int AS working_days
       FROM (
         SELECT d::date AS day
         FROM generate_series($1::date, $2::date, interval '1 day') d
         WHERE EXTRACT(DOW FROM d::date) NOT IN (0)
           AND NOT EXISTS (
             SELECT 1 FROM holidays h WHERE h.holiday_date = d::date
           )
           AND NOT EXISTS (
             SELECT 1
             FROM user_pauses up
             WHERE up.user_id = $3
               AND d::date BETWEEN up.start_date AND up.end_date
           )
       ) wd`,
      [startStr, todayStr, userId]
    );
    const workingDays = workingDaysResult.rows[0]?.working_days || 0;

    const presentResult = await pool.query(
      `SELECT COUNT(DISTINCT date)::int AS present_days
       FROM attendance
       WHERE user_id = $1
         AND date BETWEEN $2 AND $3
         AND check_in IS NOT NULL
         AND check_out IS NOT NULL`,
      [userId, startStr, todayStr]
    );
    const presentDays = presentResult.rows[0]?.present_days || 0;

    const leaveDaysResult = await pool.query(
      `SELECT COUNT(DISTINCT day)::int AS leave_days
       FROM (
         SELECT generate_series(from_date, to_date, interval '1 day')::date AS day
         FROM leave_requests
         WHERE user_id = $1
           AND status = 'APPROVED'
       ) lr
       WHERE day BETWEEN $2 AND $3`,
      [userId, startStr, todayStr]
    );
    const leaveDays = leaveDaysResult.rows[0]?.leave_days || 0;

    const percentage = workingDays === 0
      ? 100
      : Math.round((presentDays / workingDays) * 100);

    res.json({
      from: startStr,
      to: todayStr,
      working_days: workingDays,
      leave_days: leaveDays,
      effective_working_days: workingDays,
      present_days: presentDays,
      percentage: Math.min(percentage, 100)
    });

  } catch (err) {
    console.error('Attendance percentage error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= MY OVERALL ATTENDANCE PERCENTAGE (from joining date) ================= */
exports.getMyOverallAttendancePercentage = async (req, res) => {
  try {
    const userId = req.user.id;

    const userRes = await pool.query('SELECT created_at FROM users WHERE id = $1', [userId]);
    if (!userRes.rows.length) return res.status(404).json({ message: 'User not found' });
    const createdDate = new Date(userRes.rows[0].created_at).toISOString().split('T')[0];
    const startStr = createdDate > '2026-03-02' ? createdDate : '2026-03-02';

    const todayStr = todayIST();

    const workingDaysResult = await pool.query(
      `SELECT COUNT(*)::int AS working_days
       FROM (
         SELECT d::date AS day
         FROM generate_series($1::date, $2::date, interval '1 day') d
         WHERE EXTRACT(DOW FROM d::date) NOT IN (0)
           AND NOT EXISTS (
             SELECT 1 FROM holidays h WHERE h.holiday_date = d::date
           )
           AND NOT EXISTS (
             SELECT 1
             FROM user_pauses up
             WHERE up.user_id = $3
               AND d::date BETWEEN up.start_date AND up.end_date
           )
       ) wd`,
      [startStr, todayStr, userId]
    );
    const workingDays = workingDaysResult.rows[0]?.working_days || 0;

    const presentResult = await pool.query(
      `SELECT COUNT(DISTINCT date)::int AS present_days
       FROM attendance
       WHERE user_id = $1
         AND date BETWEEN $2 AND $3
         AND check_in IS NOT NULL
         AND check_out IS NOT NULL`,
      [userId, startStr, todayStr]
    );
    const presentDays = presentResult.rows[0]?.present_days || 0;

    const leaveDaysResult = await pool.query(
      `SELECT COUNT(DISTINCT day)::int AS leave_days
       FROM (
         SELECT generate_series(from_date, to_date, interval '1 day')::date AS day
         FROM leave_requests
         WHERE user_id = $1 AND status = 'APPROVED'
       ) lr
       WHERE day BETWEEN $2 AND $3`,
      [userId, startStr, todayStr]
    );
    const leaveDays = leaveDaysResult.rows[0]?.leave_days || 0;

    const percentage = workingDays === 0
      ? 100
      : Math.round((presentDays / workingDays) * 100);

    res.json({
      from: startStr,
      to: todayStr,
      working_days: workingDays,
      leave_days: leaveDays,
      effective_working_days: workingDays,
      present_days: presentDays,
      percentage: Math.min(percentage, 100)
    });

  } catch (err) {
    console.error('Overall attendance percentage error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteHoliday = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM holidays
       WHERE id = $1
       RETURNING holiday_date`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Holiday not found" });
    }

    const holidayDate = result.rows[0].holiday_date;

    await pool.query(
      `UPDATE attendance
       SET status = CASE
         WHEN EXTRACT(DOW FROM $2::date) = 0 THEN 'HOLIDAY'
         ELSE 'ABSENT'
       END
       WHERE date = $1
         AND status = 'HOLIDAY'
         AND check_in IS NULL
         AND check_out IS NULL`,
      [holidayDate, holidayDate]
    );

    res.json({ message: "Holiday removed successfully" });
  } catch (err) {
    console.error("Delete holiday error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
