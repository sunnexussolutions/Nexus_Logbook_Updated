/**
 * IST (Indian Standard Time) date/time helpers
 * All "today" and "now" values in the backend must use these helpers
 * so that the server's UTC clock doesn't cause off-by-one date bugs.
 *
 * IST = UTC + 5:30
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Returns a Date object representing the current moment shifted to IST */
function nowIST() {
  return new Date(Date.now() + IST_OFFSET_MS);
}

/** Returns today's date string in IST as "YYYY-MM-DD" */
function todayIST() {
  return nowIST().toISOString().split("T")[0];
}

/**
 * Returns the Monday–Sunday week range for the current IST week.
 * Both dates are returned as "YYYY-MM-DD" strings.
 */
function getWeekRangeIST() {
  const now = nowIST();
  const day = now.getUTCDay(); // shifted UTC ≡ IST day-of-week
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diffToMonday);
  monday.setUTCHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);

  return {
    weekStart: monday.toISOString().split("T")[0],
    weekEnd: sunday.toISOString().split("T")[0],
  };
}

/**
 * Returns the 2nd-of-current-month start date and today's date in IST.
 * Used for monthly attendance percentage calculation.
 */
function getMonthPeriodIST() {
  const now = nowIST();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-indexed
  const startStr = `${year}-${String(month + 1).padStart(2, "0")}-02`;
  const todayStr = now.toISOString().split("T")[0];
  return { startStr, todayStr };
}

module.exports = { nowIST, todayIST, getWeekRangeIST, getMonthPeriodIST };
