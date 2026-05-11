function toDateString(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clampDateRange(fromDate, toDate, rangeStart, rangeEnd) {
  let start = toDateString(fromDate);
  let end = toDateString(toDate);

  if (!start || !end || start > end) {
    return null;
  }

  if (rangeStart) {
    start = start > rangeStart ? start : rangeStart;
  }

  if (rangeEnd) {
    end = end < rangeEnd ? end : rangeEnd;
  }

  if (start > end) {
    return null;
  }

  return { start, end };
}

function* iterateDateRange(startDate, endDate) {
  const current = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  while (current <= end) {
    yield current.toISOString().slice(0, 10);
    current.setUTCDate(current.getUTCDate() + 1);
  }
}

function isSunday(dateStr) {
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay() === 0;
}

async function getHolidayDateSet(pool, startDate, endDate) {
  if (!startDate || !endDate || startDate > endDate) {
    return new Set();
  }

  const result = await pool.query(
    `SELECT holiday_date
     FROM holidays
     WHERE holiday_date BETWEEN $1::date AND $2::date`,
    [startDate, endDate]
  );

  return new Set(result.rows.map(row => toDateString(row.holiday_date)));
}

async function getEffectiveLeaveDates(pool, fromDate, toDate, options = {}) {
  const overlap = clampDateRange(fromDate, toDate, options.rangeStart, options.rangeEnd);

  if (!overlap) {
    return [];
  }

  const holidayDates = options.holidayDates || await getHolidayDateSet(pool, overlap.start, overlap.end);
  const dates = [];

  for (const date of iterateDateRange(overlap.start, overlap.end)) {
    if (isSunday(date) || holidayDates.has(date)) {
      continue;
    }

    dates.push(date);
  }

  return dates;
}

async function countEffectiveLeaveDays(pool, fromDate, toDate, options = {}) {
  const dates = await getEffectiveLeaveDates(pool, fromDate, toDate, options);
  return dates.length;
}

async function summarizeEffectiveLeaveRequests(pool, requests, options = {}) {
  const normalized = [];

  for (const request of requests || []) {
    const overlap = clampDateRange(
      request.from_date ?? request.fromDate,
      request.to_date ?? request.toDate,
      options.rangeStart,
      options.rangeEnd
    );

    if (!overlap) {
      if (request.id != null) {
        normalized.push({
          id: request.id,
          userKey: String(request.user_id ?? request.userId ?? request.user_db_id ?? "single"),
          overlap: null
        });
      }
      continue;
    }

    normalized.push({
      id: request.id ?? null,
      userKey: String(request.user_id ?? request.userId ?? request.user_db_id ?? "single"),
      overlap
    });
  }

  const overlapping = normalized.filter(entry => entry.overlap);

  if (!overlapping.length) {
    return {
      totalDays: 0,
      byUser: new Map(),
      byRequest: new Map()
    };
  }

  let globalStart = overlapping[0].overlap.start;
  let globalEnd = overlapping[0].overlap.end;

  for (const entry of overlapping) {
    if (entry.overlap.start < globalStart) globalStart = entry.overlap.start;
    if (entry.overlap.end > globalEnd) globalEnd = entry.overlap.end;
  }

  const holidayDates = await getHolidayDateSet(pool, globalStart, globalEnd);
  const byUserSets = new Map();
  const byRequest = new Map();

  for (const entry of normalized) {
    if (!entry.overlap) {
      if (entry.id != null) {
        byRequest.set(entry.id, 0);
      }
      continue;
    }

    if (!byUserSets.has(entry.userKey)) {
      byUserSets.set(entry.userKey, new Set());
    }

    const userDates = byUserSets.get(entry.userKey);
    const requestDates = new Set();

    for (const date of iterateDateRange(entry.overlap.start, entry.overlap.end)) {
      if (isSunday(date) || holidayDates.has(date)) {
        continue;
      }

      userDates.add(date);
      requestDates.add(date);
    }

    if (entry.id != null) {
      byRequest.set(entry.id, requestDates.size);
    }
  }

  const byUser = new Map();
  let totalDays = 0;

  for (const [userKey, dates] of byUserSets.entries()) {
    byUser.set(userKey, dates.size);
    totalDays += dates.size;
  }

  return { totalDays, byUser, byRequest };
}

module.exports = {
  countEffectiveLeaveDays,
  getEffectiveLeaveDates,
  summarizeEffectiveLeaveRequests,
  toDateString
};
