
/***********************
 * CONFIG
 ***********************/
const API_BASE = "https://nexus-logbook-updated.vercel.app";
const token = localStorage.getItem("token");

if (!token) {
  AppDialog.alert({
    title: "Session Expired",
    message: "Please login again."
  }).finally(() => {
    window.location.href = "../index.html";
  });
  throw new Error("Missing auth token");
}

/* ================= LOGOUT ================= */
function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  window.location.href = "../index.html";
}

/* ================= TOAST UTILITY ================= */
function showToast(message, type = "success") {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.style.cssText = "position:fixed;top:64px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.style.cssText = `background:${type === "success" ? "#00875a" : "#de350b"};color:white;padding:10px 18px;border-radius:4px;font-size:13px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,0.18);opacity:0;transition:opacity 0.2s;max-width:320px;`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = "1"; }, 10);
  setTimeout(() => { toast.style.opacity = "0"; setTimeout(() => toast.remove(), 300); }, 3000);
}


/***********************
 * COMMON FETCH
 ***********************/
async function apiRequest(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;

    try {
      const data = await res.json();
      message = data?.message || message;
    } catch (_) {
      const text = await res.text();
      if (text) message = text;
    }

    throw new Error(message);
  }

  return res.json();
}

async function loadHolidays() {
  const tbody = document.getElementById("holidayTableBody");
  if (!tbody) return;

  try {
    const holidays = await apiRequest(`${API_BASE}/api/admin/holidays`);

    if (!Array.isArray(holidays) || holidays.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-3">No holidays added</td></tr>`;
      return;
    }

    tbody.innerHTML = holidays.map(h => `
      <tr>
        <td>${h.holiday_date}</td>
        <td>${h.name || "—"}</td>
        <td>
          <button class="btn btn-sm btn-outline-danger" onclick="removeHoliday(${h.id})">Remove</button>
        </td>
      </tr>
    `).join("");
  } catch (err) {
    console.error("Failed to load holidays:", err.message);
    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-danger py-3">Failed to load holidays</td></tr>`;
  }
}

async function addHoliday() {
  const date = document.getElementById("holidayDate")?.value;
  const name = document.getElementById("holidayName")?.value?.trim();
  const message = document.getElementById("holidayMessage");

  if (!date) {
    if (message) message.innerHTML = `<span class="text-danger">Please select a holiday date</span>`;
    return;
  }

  try {
    const data = await apiRequest(`${API_BASE}/api/admin/holidays`, {
      method: "POST",
      body: JSON.stringify({
        holiday_date: date,
        name: name || null
      })
    });

    if (message) message.innerHTML = `<span class="text-success">${data.message || "Holiday saved"}</span>`;
    document.getElementById("holidayDate").value = "";
    document.getElementById("holidayName").value = "";
    loadHolidays();
    loadDashboardSummary();
    loadTodayAttendance();
  } catch (err) {
    if (message) message.innerHTML = `<span class="text-danger">Failed to save holiday</span>`;
  }
}

async function removeHoliday(id) {
  const confirmed = await AppDialog.confirm({
    title: "Remove Holiday",
    message: "Remove this holiday?",
    confirmText: "Remove",
    intent: "danger"
  });
  if (!confirmed) return;
  const message = document.getElementById("holidayMessage");

  try {
    const data = await apiRequest(`${API_BASE}/api/admin/holidays/${id}`, {
      method: "DELETE"
    });

    if (message) message.innerHTML = `<span class="text-success">${data.message || "Holiday removed"}</span>`;
    loadHolidays();
    loadDashboardSummary();
    loadTodayAttendance();
  } catch (err) {
    if (message) message.innerHTML = `<span class="text-danger">Failed to remove holiday</span>`;
  }
}

/**
 * Format a UTC timestamp (ISO string or Date) as IST time: "09:45 AM"
 * Used wherever the backend returns raw UTC timestamps.
 */
function fmtIST(raw) {
  if (!raw) return "—";
  return new Date(raw).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata"
  });
}

/***********************
 * DASHBOARD SUMMARY
 ***********************/
async function loadDashboardSummary() {
  try {
    const data = await apiRequest(
      `${API_BASE}/api/admin/dashboard/summary`
    );

    document.getElementById("totalUsers").innerText =
      data.total_users ?? 0;

    document.getElementById("presentCount").innerText =
      data.present ?? 0;

    document.getElementById("absentCount").innerText =
      data.absent ?? 0;
    document.getElementById("checkedInCount").innerText =
      data.checked_in ?? 0;
    document.getElementById("pausedCount").innerText =
      data.on_pause ?? 0;


  } catch (err) {
    console.error("Dashboard summary failed", err);
  }
}


/***********************
 * PROJECTS (DROPDOWN)
 ***********************/
async function loadAdminProjects() {
  try {
    const projects = await apiRequest(`${API_BASE}/api/admin/projects`);
    const select = document.getElementById("projectSelect");

    select.innerHTML =
      `<option value="">Select project context...</option>`;

    projects.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.project_name;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Failed to load projects:", err.message);
  }
}
document.getElementById("projectSelect").addEventListener("change", e => {
  const projectId = e.target.value;

  if (!projectId) {
    document.getElementById("adminRoadmapSteps").innerHTML = "";
    document.getElementById("adminProgressBar").style.width = "0%";
    return;
  }

  // ✅ Load assigned members
  loadAdminProjectMembers(projectId);

  // ✅ Load roadmap progress
  loadRoadmapProgress(projectId);
});


async function loadTeamLeads() {
  try {
    const leads = await apiRequest(`${API_BASE}/api/admin/team-leads`);
    const select = document.getElementById("teamLeadSelect");

    select.innerHTML = `<option value="">Assign Lead...</option>`;

    leads.forEach(lead => {
      const opt = document.createElement("option");
      opt.value = lead.id;
      opt.textContent = `${lead.name} (${lead.user_id})`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Failed to load team leads:", err.message);
  }
}



loadTeamLeads();


/***********************
 * DELETE PROJECT
 ***********************/
async function deleteProject() {
  const projectId = document.getElementById("projectSelect").value;
  if (!projectId) return alert("Select a project first");

  const confirmed = await AppDialog.confirm({
    title: "Delete Project",
    message: "Delete this project?",
    confirmText: "Delete",
    intent: "danger"
  });
  if (!confirmed) return;

  try {
    await apiRequest(
      `${API_BASE}/api/admin/projects/${projectId}`,
      { method: "DELETE" }
    );

    loadAdminProjects();
    loadDashboardSummary();
    loadWorkReportDashboard();
    showToast("✅ Project deleted");
  } catch (err) {
    alert(err.message);
  }
}

/***********************
 * CREATE TEAM LEAD
 ***********************/
async function createTeamLead() {
  const name = document.getElementById("tlName").value.trim();
  const email = document.getElementById("tlEmail").value.trim();
  const password = document.getElementById("tlPassword").value;

  if (!name || !email || !password) return alert("All fields are required");

  try {
    const res = await apiRequest(
      `${API_BASE}/api/admin/create-team-lead`,
      { method: "POST", body: JSON.stringify({ name, email, password }) }
    );

    // Clear inputs & refresh
    document.getElementById("tlName").value = "";
    document.getElementById("tlEmail").value = "";
    document.getElementById("tlPassword").value = "";
    loadDashboardSummary();
    loadTeamLeads();       // refresh lead dropdown
    loadTodayAttendance();
    // Show inline toast instead of alert
    showToast(`✅ Team Lead created: ${res.user_id}`);
  } catch (err) {
    alert(err.message);
  }
}

/***********************
 * CREATE TEAM MEMBER
 ***********************/
async function createTeamMember() {
  const name = document.getElementById("tmName").value.trim();
  const email = document.getElementById("tmEmail").value.trim();
  const password = document.getElementById("tmPassword").value;

  if (!name || !email || !password) return alert("All fields are required");

  try {
    const res = await apiRequest(
      `${API_BASE}/api/admin/create-team-member`,
      { method: "POST", body: JSON.stringify({ name, email, password }) }
    );

    // Clear inputs & refresh
    document.getElementById("tmName").value = "";
    document.getElementById("tmEmail").value = "";
    document.getElementById("tmPassword").value = "";
    loadDashboardSummary();
    loadTodayAttendance();
    showToast(`✅ Team Member created: ${res.user_id}`);
  } catch (err) {
    alert(err.message);
  }
}

/***********************
 * CREATE PROJECT
 ***********************/
async function createProject() {
  const project_name =
    document.getElementById("projectName").value;
  const description =
    document.getElementById("projectDesc").value;
  const team_lead_id =
    document.getElementById("teamLeadSelect").value;

  if (!team_lead_id)
    return alert("Please assign a Team Lead");

  try {
    // 🔹 Create project
    await apiRequest(`${API_BASE}/api/admin/projects`, {
      method: "POST",
      body: JSON.stringify({
        project_name,
        description,
        team_lead_id
      })
    });

    alert("Project created");

    // 🔹 Reload projects
    await loadAdminProjects();

    // 🔹 AUTO-SELECT THE LAST PROJECT
    const select = document.getElementById("projectSelect");
    const lastOption = select.options[select.options.length - 1];

    if (lastOption) {
      select.value = lastOption.value;
      select.dispatchEvent(new Event("change"));
    }

  } catch (err) {
    alert(err.message);
  }
}

async function loadAdminProjectMembers(projectId) {
  try {
    const data = await apiRequest(
      `${API_BASE}/api/admin/admin-project-members/${projectId}`
    );


    const list = document.getElementById("adminProjectMembers");

    list.innerHTML = "";

    // Team Lead
    const leadLi = document.createElement("li");
    leadLi.className = "list-group-item fw-bold";
    leadLi.innerText =
      `Team Lead: ${data.project.team_lead_name} (${data.project.team_lead_code})`;
    list.appendChild(leadLi);

    // Members
    if (data.members.length === 0) {
      const li = document.createElement("li");
      li.className = "list-group-item text-muted";
      li.innerText = "No members assigned";
      list.appendChild(li);
      return;
    }

    data.members.forEach(m => {
      const li = document.createElement("li");
      li.className = "list-group-item";
      li.innerText = `${m.name} (${m.user_id})`;
      list.appendChild(li);
    });

  } catch (err) {
    console.error("Failed to load admin project members", err);
  }
}
async function loadTodayAttendance() {
  const tbody = document.getElementById("attendanceTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  try {
    // Use the dashboard endpoint which includes attendance_percentage.
    const raw = await apiRequest(`${API_BASE}/api/admin/attendance/today`);

    // Support both array and wrapped payload response shapes.
    const data = Array.isArray(raw)
      ? raw
      : (
        (Array.isArray(raw?.rows) && raw.rows) ||
        (Array.isArray(raw?.data) && raw.data) ||
        (Array.isArray(raw?.attendance) && raw.attendance) ||
        (Array.isArray(raw?.data?.rows) && raw.data.rows) ||
        []
      );

    if (!Array.isArray(data) || data.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center">
            No attendance data for today
          </td>
        </tr>`;
      return;
    }

    data.forEach(row => {
      const tr = document.createElement("tr");

      const statusColors = {
        PRESENT: 'bg-success',
        CHECKED_IN: 'bg-primary',
        ABSENT: 'bg-danger',
        LATE: 'bg-warning text-dark',
        ON_LEAVE: 'bg-info',
        HOLIDAY: 'bg-secondary',
        MISSED_CHECKOUT: 'bg-danger',
        PAUSED: 'bg-danger'
      };
      const badgeClass = statusColors[row.status] || 'bg-secondary';
      const statusLabel = row.status === 'MISSED_CHECKOUT' ? 'Missed Checkout' : row.status;

      // Color-code monthly attendance percentage.
      const pct = row.attendance_percentage ?? 100;
      const pctColor = pct >= 75 ? '#15803d' : pct >= 50 ? '#b45309' : '#dc2626';
      const pctDisplay = `<span style="font-weight:700; color:${pctColor}">${pct}%</span>`;

      // Color-code overall (all-time) attendance percentage.
      const ovPct = row.overall_percentage ?? 100;
      const ovPctColor = ovPct >= 75 ? '#15803d' : ovPct >= 50 ? '#b45309' : '#dc2626';
      const ovPctDisplay = `<span style="font-weight:700; color:${ovPctColor}">${ovPct}%</span>`;

      tr.innerHTML = `
        <td>${row.user_id}</td>
        <td>${row.name}</td>
        <td>${row.role}</td>
        <td>${fmtIST(row.check_in)}</td>
        <td>${fmtIST(row.check_out)}</td>
        <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
        <td class="text-center">${pctDisplay}</td>
        <td class="text-center">${ovPctDisplay}</td>
      `;

      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("loadTodayAttendance failed:", err);
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-danger">
          Failed to load attendance data
        </td>
      </tr>`;
  }
}
/***********************
 * EXPOSE TO HTML
 ***********************/
window.createTeamLead = createTeamLead;
window.createTeamMember = createTeamMember;
window.createProject = createProject;
window.deleteProject = deleteProject;
window.addHoliday = addHoliday;
window.removeHoliday = removeHoliday;

/***********************
 * INIT
 ***********************/
document.addEventListener("DOMContentLoaded", () => {
  loadDashboardSummary();
  loadAdminProjects();
});

async function loadRoadmapProgress(projectId) {
  try {
    const data = await apiRequest(
      `${API_BASE}/api/admin/roadmap-progress/${projectId}`
    );

    // 🔹 Progress bar
    const progressBar = document.getElementById("adminProgressBar");
    progressBar.style.width = data.progress;
    progressBar.innerText = data.progress;

    // 🔹 Roadmap steps list
    const stepsList = document.getElementById("adminRoadmapSteps");
    stepsList.innerHTML = "";

    if (!data.steps || data.steps.length === 0) {
      stepsList.innerHTML =
        `<li class="list-group-item text-muted border-0 bg-transparent text-center py-3">
          <i class="bi bi-inbox fs-4 d-block mb-1 text-light"></i> No roadmap steps created
        </li>`;
      return;
    }

    data.steps.forEach(step => {
      const li = document.createElement("li");
      li.className =
        "list-group-item d-flex justify-content-between align-items-center rounded-3 mb-2 border-0 shadow-sm";
      li.style.cssText = "background: rgba(255,255,255,0.7); backdrop-filter: blur(8px); transition: all 0.2s;";

      li.innerHTML = `
        <span class="fw-semibold text-dark"><i class="bi bi-signpost-fill text-primary me-2"></i> ${step.step_title}</span>
        <span class="badge ${step.is_completed ? "bg-success" : "bg-warning text-dark"} rounded-pill px-3 py-2 shadow-sm">
          ${step.is_completed ? '<i class="bi bi-check-circle me-1"></i> Completed' : '<i class="bi bi-hourglass-split me-1"></i> Pending'}
        </span>
      `;

      stepsList.appendChild(li);
    });

  } catch (err) {
    console.error("Failed to load roadmap progress", err);
  }
}

async function allowLateCheckIn(userId) {
  if (!userId) { alert("User ID missing"); return; }
  const confirmed = await AppDialog.confirm({
    title: "Allow Late Check-In",
    message: "Allow late check-in for this user?",
    confirmText: "Allow"
  });
  if (!confirmed) return;

  try {
    const res = await fetch(
      `${API_BASE}/api/admin/attendance/allow-late/${userId}`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();

    if (!res.ok) { alert(data.message || "Failed"); return; }

    loadTodayAttendance();
    loadDashboardSummary();
    loadLateUsers();
    showToast(`✅ ${data.message}`);
  } catch (err) {
    alert("Request failed");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadDashboardSummary();
  loadAdminProjects();
  loadTeamLeads();
  loadHolidays();
  loadTodayAttendance();
  loadAdminWorkReports();
  loadShifts();
  loadLateUsers();
  loadWorkReportDashboard();
  loadAdminStatus();
  loadGeoSetting();
  loadLeaveRequests();
  loadMissedCheckouts();
  loadEarlyCheckouts();
  loadOvertimeToday();




  const projectSelect = document.getElementById("projectSelect");

  if (projectSelect) {
    projectSelect.addEventListener("change", () => {
      const projectId = projectSelect.value;

      if (!projectId) {
        document.getElementById("adminRoadmapSteps").innerHTML = "";
        document.getElementById("adminProjectMembers").innerHTML = "";
        document.getElementById("adminProgressBar").style.width = "0%";
        return;
      }

      loadAdminProjectMembers(projectId);
      loadRoadmapProgress(projectId);
    });
  }
});

const ADMIN_LIVE_REFRESH_MS = 15000;

function refreshAdminLiveData() {
  loadDashboardSummary();
  loadHolidays();
  loadTodayAttendance();
  loadWorkReportDashboard();
  loadAdminStatus();
  loadLateUsers();
  loadLeaveRequests();
  loadMissedCheckouts();
  loadEarlyCheckouts();
  loadOvertimeToday();

  const projectSelect = document.getElementById("projectSelect");
  if (projectSelect && projectSelect.value) {
    loadAdminProjectMembers(projectSelect.value);
    loadRoadmapProgress(projectSelect.value);
  }
}

setInterval(() => {
  if (document.visibilityState === "visible") {
    refreshAdminLiveData();
  }
}, ADMIN_LIVE_REFRESH_MS);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    refreshAdminLiveData();
  }
});

/***********************
 * ADMIN DAILY WORK REPORT
 ***********************/
async function submitAdminDailyReport() {
  const workDone = document.getElementById("adminWorkDone").value.trim();
  const messageDiv = document.getElementById("adminWorkMessage");

  if (!workDone) {
    messageDiv.innerHTML =
      `<div class="alert alert-danger">Please enter work details</div>`;
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/work/daily`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        work_done: workDone
      })
    });

    const data = await res.json();

    if (!res.ok) {
      messageDiv.innerHTML =
        `<div class="alert alert-danger">${data.message}</div>`;
      return;
    }

    messageDiv.innerHTML =
      `<div class="alert alert-success">${data.message}</div>`;

    document.getElementById("adminWorkDone").value = "";
    loadAdminWorkReports();      // refresh EOD archive
    loadWorkReportDashboard();   // refresh daily status matrix


  } catch (err) {
    console.error(err);
    messageDiv.innerHTML =
      `<div class="alert alert-danger">Failed to submit report</div>`;
  }
}
async function loadAdminWorkReports() {
  try {
    const reports = await apiRequest(
      `${API_BASE}/api/admin/work-reports`
    );

    const tbody = document.getElementById("adminWorkReportsTable");
    tbody.innerHTML = "";

    if (!reports || reports.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="text-center text-muted">
            No reports submitted today
          </td>
        </tr>
      `;
      return;
    }

    reports.forEach(r => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${r.name}</td>
        <td>${r.role}</td>
        <td>${r.work_done}</td>
        <td>${new Date(r.report_date).toLocaleDateString()}</td>
      `;

      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error("Failed to load work reports", err);
  }
}
async function exportWorkReportsCSV() {
  try {
    const from = document.getElementById("reportFromDate").value;
    const to = document.getElementById("reportToDate").value;

    if (!from || !to) {
      alert("Please select both From and To dates");
      return;
    }

    if (from > to) {
      alert("From date cannot be greater than To date");
      return;
    }

    const url =
      `${API_BASE}/api/admin/work-reports/export/csv?from=${from}&to=${to}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) throw new Error("Export failed");

    const blob = await res.blob();
    const link = document.createElement("a");

    link.href = window.URL.createObjectURL(blob);
    link.download = `work_reports_${from}_to_${to}.csv`;
    link.click();

  } catch (err) {
    console.error(err);
    alert("CSV export failed");
  }
}
async function exportWorkReportsExcel() {
  try {
    const from = document.getElementById("reportFromDate").value;
    const to = document.getElementById("reportToDate").value;

    if (!from || !to) {
      alert("Please select both From and To dates");
      return;
    }

    if (from > to) {
      alert("From date cannot be greater than To date");
      return;
    }

    const url =
      `${API_BASE}/api/admin/work-reports/export/excel?from=${from}&to=${to}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) throw new Error("Export failed");

    const blob = await res.blob();
    const link = document.createElement("a");

    link.href = window.URL.createObjectURL(blob);
    link.download = `work_reports_${from}_to_${to}.xlsx`;
    link.click();

  } catch (err) {
    console.error(err);
    alert("Excel export failed");
  }
}

async function createShift() {
  const name = document.getElementById("shiftName").value;
  const checkIn = document.getElementById("checkInTime").value;
  const lastCheckIn = document.getElementById("lastCheckInTime").value;
  const checkOut = document.getElementById("checkOutTime").value;

  if (!name || !checkIn || !lastCheckIn) {
    alert("Name, Start Time, and Cut-off Time are required");
    return;
  }

  const res = await fetch(`${API_BASE}/api/admin/shifts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      name,
      check_in_time: checkIn,
      last_checkin_time: lastCheckIn,
      check_out_time: checkOut || null
    })
  });

  const data = await res.json();
  alert(data.message);

  document.getElementById("shiftName").value = "";
  document.getElementById("checkInTime").value = "";
  document.getElementById("lastCheckInTime").value = "";
  document.getElementById("checkOutTime").value = "";

  loadShifts();
}

async function loadShifts() {
  const res = await fetch(`${API_BASE}/api/admin/shifts`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const shifts = await res.json();

  const tbody = document.getElementById("shiftTableBody");
  tbody.innerHTML = "";

  shifts.forEach(s => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.name}</td>
      <td>${s.check_in_time || "-"}</td>
      <td>${s.last_checkin_time || "-"}</td>
      <td>
        <span id="endTimeDisplay_${s.id}">${s.check_out_time || "-"}</span>
        <input type="time" id="endTimeEdit_${s.id}" value="${s.check_out_time || ""}"
          class="form-control form-control-sm d-none" style="width: 110px; display: inline-block;">
      </td>
      <td>
        <div class="d-flex gap-1">
          <button id="editBtn_${s.id}" class="btn btn-sm btn-outline-primary"
            onclick="toggleEditShift(${s.id})">
            Edit
          </button>
          <button id="saveBtn_${s.id}" class="btn btn-sm btn-success d-none"
            onclick="updateShift(${s.id})">
            Save
          </button>
          <button class="btn btn-sm btn-danger"
            onclick="deleteShift(${s.id})">
            Delete
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function toggleEditShift(id) {
  const display = document.getElementById(`endTimeDisplay_${id}`);
  const input = document.getElementById(`endTimeEdit_${id}`);
  const editBtn = document.getElementById(`editBtn_${id}`);
  const saveBtn = document.getElementById(`saveBtn_${id}`);

  display.classList.toggle("d-none");
  input.classList.toggle("d-none");
  editBtn.classList.toggle("d-none");
  saveBtn.classList.toggle("d-none");
}

async function updateShift(id) {
  const checkOutTime = document.getElementById(`endTimeEdit_${id}`).value;

  const res = await fetch(`${API_BASE}/api/admin/shifts/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      check_out_time: checkOutTime || null
    })
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.message || "Update failed");
    return;
  }

  showToast("✅ Shift end time updated");
  loadShifts();
}

async function deleteShift(id) {
  const confirmed = await AppDialog.confirm({
    title: "Delete Shift",
    message: "Are you sure you want to delete this shift?",
    confirmText: "Delete",
    intent: "danger"
  });
  if (!confirmed) return;

  const res = await fetch(`${API_BASE}/api/admin/shifts/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.message);
    return;
  }

  alert(data.message);
  loadShifts();
}

/* ================= EARLY CHECKOUTS & OVERTIME (ADMIN) ================= */

async function loadEarlyCheckouts() {
  const tbody = document.getElementById("earlyCheckoutsTableBody");
  try {
    const res = await fetch(`${API_BASE}/api/admin/attendance/early-checkouts`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-3">No early checkouts today</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(r => `
      <tr>
        <td>${r.user_id}</td>
        <td>${r.name}</td>
        <td>${r.role}</td>
        <td>${r.shift_name || "—"}</td>
        <td>${r.shift_end_time || "—"}</td>
        <td>${fmtIST(r.check_out)}</td>
        <td><span style="background:#fee2e2; color:#dc2626; padding:2px 8px; border-radius:4px; font-weight:600;">${r.early_checkout_minutes} min</span></td>
      </tr>
    `).join("");
  } catch (err) {
    console.error("Early checkouts error:", err);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-3">Failed to load</td></tr>`;
  }
}

async function loadOvertimeToday() {
  const tbody = document.getElementById("overtimeTableBody");
  try {
    const res = await fetch(`${API_BASE}/api/admin/attendance/overtime`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-3">No overtime records today</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(r => `
      <tr>
        <td>${r.user_id}</td>
        <td>${r.name}</td>
        <td>${r.role}</td>
        <td>${r.shift_name || "—"}</td>
        <td>${r.shift_end_time || "—"}</td>
        <td>${fmtIST(r.check_out)}</td>
        <td><span style="background:#dcfce7; color:#15803d; padding:2px 8px; border-radius:4px; font-weight:600;">${r.overtime_minutes} min</span></td>
      </tr>
    `).join("");
  } catch (err) {
    console.error("Overtime error:", err);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-3">Failed to load</td></tr>`;
  }
}
async function loadLateUsers() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/attendance/late-users`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const users = await res.json();
    const container = document.getElementById("lateUsersContainer");
    container.innerHTML = "";

    if (!Array.isArray(users) || users.length === 0) {
      container.innerHTML = `<div class="text-center text-muted small py-3">No pending exception requests.</div>`;
      return;
    }

    // Load shifts for dropdown
    const shiftRes = await fetch(`${API_BASE}/api/admin/shifts`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const shifts = await shiftRes.json();

    users.forEach(user => {
      const div = document.createElement("div");
      div.className = "d-flex align-items-center justify-content-between gap-2 p-2 border rounded mb-2 bg-white";

      // Shifts use correct field: s.name, s.id
      const shiftOptions = shifts.map(s =>
        `<option value="${s.id}">${s.name}</option>`
      ).join("");

      // user.user_id = DB integer primary key
      // user.user_code = e.g. TM001
      div.innerHTML = `
        <div>
          <strong>${user.user_code}</strong>
          <span class="text-muted small ms-1">${user.name}</span>
        </div>
        <div class="d-flex gap-2 align-items-center">
          <select id="shiftSelect_${user.user_id}" class="form-select form-select-sm" style="width:130px;">
            ${shiftOptions}
          </select>
          <button class="btn btn-sm btn-success" onclick="approveLate(${user.user_id})">
            Approve
          </button>
        </div>
      `;

      container.appendChild(div);
    });

  } catch (err) {
    console.error("loadLateUsers error:", err);
  }
}

async function approveLate(dbUserId) {
  const shiftId = document.getElementById(`shiftSelect_${dbUserId}`).value;

  if (!shiftId) {
    alert("Please select a shift");
    return;
  }

  const res = await fetch(`${API_BASE}/api/admin/attendance/approve-late`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      userId: dbUserId,   // DB integer primary key
      shiftId: Number(shiftId)
    })
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.message || "Approval failed");
    return;
  }

  alert(data.message);
  loadLateUsers();
  loadTodayAttendance(); // refresh live ops table
}
async function loadWorkReportDashboard() {
  const res = await fetch(`${API_BASE}/api/admin/work-reports/today`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await res.json();

  const tbody = document.getElementById("workReportTable");
  tbody.innerHTML = "";

  data.forEach(user => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${user.user_id}</td>
      <td>${user.name}</td>
      <td>${user.role}</td>
      <td>${user.shift_name || "-"}</td>
      <td>${user.attendance_status || "ABSENT"}</td>
      <td>
        ${user.work_report_status === "SUBMITTED"
        ? '<span class="text-success">SUBMITTED</span>'
        : '<span class="text-danger">NOT SUBMITTED</span>'
      }
      </td>
    `;

    tbody.appendChild(tr);
  });
}
const adminStatusText = document.getElementById("adminStatusText");
const adminCheckInBtn = document.getElementById("adminCheckInBtn");
const adminCheckOutBtn = document.getElementById("adminCheckOutBtn");
const adminAttendanceMessage = document.getElementById("adminAttendanceMessage");

/* ================= ADMIN ATTENDANCE ================= */

async function loadAdminStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/attendance/my-status`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();

    adminStatusText.innerText = `Status: ${data.status}`;

    adminCheckInBtn.disabled = data.status !== "ABSENT";
    adminCheckOutBtn.disabled = data.status !== "CHECKED_IN";

  } catch (err) {
    console.error("Load status error:", err);
  }
}


/* ================= ADMIN CHECK-IN ================= */

adminCheckInBtn.onclick = () => {

  if (!navigator.geolocation) {
    adminAttendanceMessage.innerHTML =
      `<div class="alert alert-danger">Geolocation not supported</div>`;
    return;
  }

  navigator.geolocation.getCurrentPosition(

    async (position) => {
      try {

        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        console.log("Latitude:", latitude);
        console.log("Longitude:", longitude);
        const res = await fetch(`${API_BASE}/api/attendance/check-in`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ latitude, longitude })
        });

        const data = await res.json();

        if (!res.ok) {
          adminAttendanceMessage.innerHTML =
            `<div class="alert alert-danger">${data.message}</div>`;
          return;
        }

        adminAttendanceMessage.innerHTML =
          `<div class="alert alert-success">${data.message}</div>`;

        loadAdminStatus();
        loadTodayAttendance();    // refresh live ops log
        loadDashboardSummary();   // refresh metric cards

      } catch (err) {
        console.error("Check-in error:", err);
        adminAttendanceMessage.innerHTML =
          `<div class="alert alert-danger">Check-in failed</div>`;
      }
    },

    (error) => {
      adminAttendanceMessage.innerHTML =
        `<div class="alert alert-danger">Location permission denied</div>`;
    }

  );
};


/* ================= ADMIN CHECK-OUT ================= */

adminCheckOutBtn.onclick = async () => {
  try {
    // 🔒 Block checkout if daily work report not submitted
    const reportCheck = await fetch(`${API_BASE}/api/work/check-today`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const reportData = await reportCheck.json();

    if (!reportData.submitted) {
      adminAttendanceMessage.innerHTML =
        `<div class="alert alert-warning">⚠️ Please submit your daily work report before checking out.</div>`;
      return;
    }

    const res = await fetch(`${API_BASE}/api/attendance/check-out`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await res.json();

    if (!res.ok) {
      adminAttendanceMessage.innerHTML =
        `<div class="alert alert-danger">${data.message}</div>`;
      return;
    }

    adminAttendanceMessage.innerHTML =
      `<div class="alert alert-success">${data.message}</div>`;

    loadAdminStatus();
    loadTodayAttendance();    // refresh live ops log
    loadDashboardSummary();   // refresh metric cards

  } catch (err) {
    console.error("Check-out error:", err);
    adminAttendanceMessage.innerHTML =
      `<div class="alert alert-danger">Check-out failed</div>`;
  }
};



// ================= DAILY ATTENDANCE EXPORT =================
async function exportDailyCSV() {
  try {
    const date = document.getElementById("attendanceExportDate").value;

    if (!date) {
      alert("Please select a date");
      return;
    }

    const url =
      `${API_BASE}/api/admin/attendance/daily/export/csv?date=${date}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) throw new Error("Export failed");

    const blob = await res.blob();
    const link = document.createElement("a");

    link.href = window.URL.createObjectURL(blob);
    link.download = `attendance_${date}.csv`;
    link.click();

  } catch (err) {
    console.error(err);
    alert("Daily CSV export failed");
  }
}
async function exportDailyExcel() {
  try {
    const date = document.getElementById("attendanceExportDate").value;

    if (!date) {
      alert("Please select a date");
      return;
    }

    const url =
      `${API_BASE}/api/admin/attendance/daily/export/excel?date=${date}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) {
      let details = "";
      try {
        const errJson = await res.json();
        details = errJson?.message || JSON.stringify(errJson);
      } catch {
        details = await res.text();
      }
      throw new Error(`Export failed (${res.status})${details ? `: ${details}` : ""}`);
    }

    const blob = await res.blob();
    const link = document.createElement("a");

    link.href = window.URL.createObjectURL(blob);
    link.download = `attendance_${date}.xlsx`;
    link.click();

  } catch (err) {
    console.error("Daily Excel export failed:", err);
    alert(err.message || "Daily Excel export failed");
  }
}
const geoToggle = document.getElementById("geoToggle");

async function loadGeoSetting() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/geo-setting`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await res.json();

    console.log("🌍 Loaded geo:", data);

    // IMPORTANT LINE
    document.getElementById("geoToggle").checked = data.geo_enabled;

  } catch (err) {
    console.error("Load geo failed:", err);
  }
}


geoToggle.addEventListener("change", async () => {
  try {
    const isEnabled = geoToggle.checked;

    console.log("🌍 Saving geo:", isEnabled);

    await fetch(`${API_BASE}/api/admin/geo-setting`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ is_enabled: isEnabled })
    });

  } catch (err) {
    console.error("Update geo failed", err);
  }
});

async function loadLeaveRequests() {
  const res = await fetch(`${API_BASE}/api/admin/leave-requests`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await res.json();

  const table = document.getElementById("leaveRequestsTable");
  table.innerHTML = "";

  if (data.length === 0) {
    table.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-4">
          No leave requests found
        </td>
      </tr>
    `;
    return;
  }

  data.forEach(l => {
    const fmtDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
    const used = l.leave_used || 0;
    const quota = l.leave_quota || 18;
    const remaining = l.leave_remaining ?? (quota - used);
    const exceeded = remaining <= 0;
    const balBadge = exceeded
      ? `<span class="badge bg-danger">⚠️ ${used}/${quota} (0 left)</span>`
      : `<span class="badge bg-secondary">${used}/${quota} (${remaining} left)</span>`;

    table.innerHTML += `
      <tr${exceeded ? ' style="background:#fff5f5;"' : ''}>
        <td>${l.user_id} - ${l.name}</td>
        <td>${l.role}</td>
        <td>${fmtDate(l.from_date)}</td>
        <td>${fmtDate(l.to_date)}</td>
        <td>${l.reason}${exceeded ? '<br><small class="text-danger fw-bold">⚠️ Exceeded leave quota!</small>' : ''}</td>
        <td>
          <span class="badge ${l.status === "PENDING" ? "bg-warning text-dark" :
        l.status === "APPROVED" ? "bg-success" :
          "bg-danger"
      }">
            ${l.status}
          </span>
          <br><small class="text-muted">${balBadge}</small>
        </td>
        <td>
          ${l.status === "PENDING"
        ? `
                <button class="btn btn-sm btn-success" onclick="approveLeave(${l.id})">
    <i class="bi bi-check-circle"></i> Approve
  </button>
  <button class="btn btn-sm btn-danger" onclick="showRejectModal(${l.id})">
    <i class="bi bi-x-circle"></i> Reject
  </button>
              `
        : "-"
      }
        </td>
      </tr>
    `;
  });
}
async function reviewLeave(id, status) {
  const res = await fetch(`${API_BASE}/api/admin/leave-requests/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ status })
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.message);
    return;
  }

  alert("Leave updated successfully");
  loadLeaveRequests();
}

/* ================= OFFICE LOCATION SETTINGS ================= */

async function loadOfficeSettings() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/office-settings`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();

    if (data.latitude) document.getElementById("officeLat").value = data.latitude;
    if (data.longitude) document.getElementById("officeLon").value = data.longitude;
    if (data.allowed_radius) document.getElementById("officeRadius").value = data.allowed_radius;

  } catch (err) {
    console.error("Load office settings failed:", err);
  }
}

function captureMyLocation() {
  const msgDiv = document.getElementById("officeSettingsMessage");

  if (!navigator.geolocation) {
    msgDiv.innerHTML = `<span class="text-danger">Geolocation not supported</span>`;
    return;
  }

  msgDiv.innerHTML = `<span class="text-muted">📡 Getting GPS lock (collecting readings for best accuracy)...</span>`;

  let bestPosition = null;
  let readings = 0;

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      readings++;
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      const acc = position.coords.accuracy;

      console.log(`📍 Office GPS reading #${readings}: lat=${lat}, lon=${lon}, accuracy=${acc.toFixed(0)}m`);

      if (!bestPosition || acc < bestPosition.coords.accuracy) {
        bestPosition = position;
        document.getElementById("officeLat").value = lat;
        document.getElementById("officeLon").value = lon;

        msgDiv.innerHTML = `<span class="text-info">📡 Reading #${readings} — Accuracy: ~${Math.round(acc)}m (waiting for better...)
          <br><small class="text-muted">Lat: ${lat}, Lon: ${lon}</small></span>`;
      }

      // If we get excellent accuracy, stop early
      if (acc < 20) {
        navigator.geolocation.clearWatch(watchId);
        msgDiv.innerHTML = `<span class="text-success">✅ Excellent location captured! Accuracy: ~${Math.round(acc)}m. Click Save to update.
          <br><small class="text-muted">Lat: ${lat}, Lon: ${lon}</small></span>`;
      }
    },
    (error) => {
      navigator.geolocation.clearWatch(watchId);
      msgDiv.innerHTML = `<span class="text-danger">Location error: ${error.message || "Permission denied"}</span>`;
    },
    { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
  );

  // After 8 seconds, finalize with the best reading
  setTimeout(() => {
    navigator.geolocation.clearWatch(watchId);
    if (bestPosition) {
      const acc = bestPosition.coords.accuracy;
      const lat = bestPosition.coords.latitude;
      const lon = bestPosition.coords.longitude;

      if (acc > 100) {
        msgDiv.innerHTML = `<span class="text-warning">⚠️ Best accuracy was ~${Math.round(acc)}m (poor). Try again outdoors for better GPS. You can still Save, but check-ins may be unreliable.
          <br><small class="text-muted">Lat: ${lat}, Lon: ${lon}</small></span>`;
      } else if (acc > 50) {
        msgDiv.innerHTML = `<span class="text-warning">⚠️ Location captured with ~${Math.round(acc)}m accuracy (fair). Click Save to update. For better results, try outdoors.
          <br><small class="text-muted">Lat: ${lat}, Lon: ${lon}</small></span>`;
      } else {
        msgDiv.innerHTML = `<span class="text-success">✅ Location captured! Accuracy: ~${Math.round(acc)}m. Click Save to update.
          <br><small class="text-muted">Lat: ${lat}, Lon: ${lon}</small></span>`;
      }
    } else {
      msgDiv.innerHTML = `<span class="text-danger">Could not get GPS location. Please try again.</span>`;
    }
  }, 8000);
}

async function saveOfficeLocation() {
  const msgDiv = document.getElementById("officeSettingsMessage");
  const latitude = parseFloat(document.getElementById("officeLat").value);
  const longitude = parseFloat(document.getElementById("officeLon").value);
  const allowed_radius = parseInt(document.getElementById("officeRadius").value) || 200;

  if (!latitude || !longitude) {
    msgDiv.innerHTML = `<span class="text-danger">Latitude and longitude are required</span>`;
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/admin/office-settings`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ latitude, longitude, allowed_radius })
    });

    const data = await res.json();

    if (!res.ok) {
      msgDiv.innerHTML = `<span class="text-danger">${data.message}</span>`;
      return;
    }

    msgDiv.innerHTML = `<span class="text-success">✅ ${data.message}</span>`;

  } catch (err) {
    console.error("Save office settings failed:", err);
    msgDiv.innerHTML = `<span class="text-danger">Failed to save</span>`;
  }
}

// Load saved office settings on page load
loadOfficeSettings();

/* ================= ANNOUNCEMENTS ================= */
async function sendAnnouncement() {
  const msgDiv = document.getElementById("announcementMessage");
  const text = document.getElementById("announcementText").value.trim();

  if (!text) {
    msgDiv.innerHTML = `<span class="text-danger">Please enter a message</span>`;
    return;
  }

  msgDiv.innerHTML = `<span class="text-muted">📡 Sending...</span>`;

  try {
    const res = await fetch(`${API_BASE}/api/admin/announcements`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ message: text })
    });

    const data = await res.json();

    if (!res.ok) {
      msgDiv.innerHTML = `<span class="text-danger">${data.message}</span>`;
      return;
    }

    msgDiv.innerHTML = `<span class="text-success">✅ ${data.message}</span>`;
    document.getElementById("announcementText").value = "";

    // Auto-clear message after 4 seconds
    setTimeout(() => { msgDiv.innerHTML = ""; }, 4000);

  } catch (err) {
    console.error("Send announcement error:", err);
    msgDiv.innerHTML = `<span class="text-danger">Failed to send</span>`;
  }
}

/* ================= CHANGE PASSWORD ================= */
async function changePassword() {
  const msgDiv = document.getElementById("cpMessage");
  const current = document.getElementById("cpCurrent").value.trim();
  const newPass = document.getElementById("cpNew").value.trim();
  const confirm = document.getElementById("cpConfirm").value.trim();

  msgDiv.innerHTML = "";

  if (!current || !newPass || !confirm) {
    msgDiv.innerHTML = `<span class="text-danger">All fields are required</span>`;
    return;
  }
  if (newPass.length < 6) {
    msgDiv.innerHTML = `<span class="text-danger">New password must be at least 6 characters</span>`;
    return;
  }
  if (newPass !== confirm) {
    msgDiv.innerHTML = `<span class="text-danger">New passwords do not match</span>`;
    return;
  }

  msgDiv.innerHTML = `<span class="text-muted">Updating...</span>`;

  try {
    const res = await fetch(`${API_BASE}/api/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ currentPassword: current, newPassword: newPass })
    });

    const data = await res.json();

    if (!res.ok) {
      msgDiv.innerHTML = `<span class="text-danger">❌ ${data.message}</span>`;
      return;
    }

    msgDiv.innerHTML = `<span class="text-success">✅ ${data.message}</span>`;
    document.getElementById("cpCurrent").value = "";
    document.getElementById("cpNew").value = "";
    document.getElementById("cpConfirm").value = "";
    setTimeout(() => { msgDiv.innerHTML = ""; }, 5000);

  } catch (err) {
    console.error("Change password error:", err);
    msgDiv.innerHTML = `<span class="text-danger">Failed to update password</span>`;
  }
}

/* ================= MISSED CHECKOUTS ================= */
async function loadMissedCheckouts() {
  const tbody = document.getElementById("missedCheckoutsTable");
  if (!tbody) return;

  try {
    const res = await fetch(`${API_BASE}/api/admin/missed-checkouts`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-3">Failed to load missed checkouts</td></tr>`;
      return;
    }

    const records = await res.json();

    if (records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No missed checkouts.</td></tr>`;
      return;
    }

    tbody.innerHTML = records.map(r => {
      const dateStr = new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
      const statusBadge = r.status === 'PENDING'
        ? '<span class="badge bg-warning text-dark">PENDING</span>'
        : '<span class="badge bg-success">RESOLVED</span>';

      return `
        <tr>
          <td>
            <div class="fw-bold">${r.name}</div>
            <div class="small text-muted">${r.user_id}</div>
          </td>
          <td><span class="badge bg-light text-dark border">${r.role}</span></td>
          <td>${dateStr}</td>
          <td>
            <div style="max-height: 60px; overflow-y: auto; font-size: 12px;" class="text-muted">
              ${r.work_done || '—'}
            </div>
          </td>
          <td>
            <div style="max-height: 60px; overflow-y: auto; font-size: 12px;">
              ${r.late_reason || '—'}
            </div>
          </td>
          <td>${statusBadge}</td>
        </tr>
      `;
    }).join("");

  } catch (err) {
    console.error("Load missed checkouts error:", err);
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-3">Error loading</td></tr>`;
  }
}
let currentLeaveId = null;

let rejectModalInstance = null;

// Show rejection modal
function showRejectModal(leaveId) {
  currentLeaveId = leaveId;

  // Reset form state every time modal opens
  document.getElementById('rejectionReason').value = '';
  document.getElementById('rejectMessage').innerHTML = '';

  // Reset button to original state
  const btn = document.getElementById('confirmRejectBtn');
  if (btn) { btn.disabled = false; btn.textContent = 'Reject Leave'; }

  const modalEl = document.getElementById('rejectLeaveModal');

  // Remove stale aria-hidden added by Bootstrap that can block the modal
  modalEl.removeAttribute('aria-hidden');

  if (!rejectModalInstance) {
    rejectModalInstance = new bootstrap.Modal(modalEl, { backdrop: true, keyboard: true });
  }
  rejectModalInstance.show();
}

// Confirm rejection with reason
async function confirmRejectLeave() {
  const reason = document.getElementById('rejectionReason').value.trim();
  const messageDiv = document.getElementById('rejectMessage');

  if (!reason) {
    messageDiv.innerHTML = '<div class="alert alert-danger py-1 mb-0">Please provide a reason for rejection</div>';
    return;
  }

  // Use the button's direct ID for reliable selection
  const btn = document.getElementById('confirmRejectBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Rejecting…'; }

  try {
    const res = await fetch(`${API_BASE}/api/admin/leave-requests/${currentLeaveId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        status: 'REJECTED',
        rejection_reason: reason
      })
    });

    const data = await res.json();

    if (!res.ok) {
      messageDiv.innerHTML = `<div class="alert alert-danger py-1 mb-0">${data.message || 'Failed to reject leave'}</div>`;
      if (btn) { btn.disabled = false; btn.textContent = 'Reject Leave'; }
      return;
    }

    // Success: close modal immediately then refresh
    if (rejectModalInstance) rejectModalInstance.hide();
    // Reset button for next use
    if (btn) { btn.disabled = false; btn.textContent = 'Reject Leave'; }

    loadLeaveRequests();
    loadDashboardSummary();
    showToast('✅ Leave rejected successfully');

  } catch (err) {
    console.error('Reject leave error:', err);
    messageDiv.innerHTML = '<div class="alert alert-danger py-1 mb-0">Network error. Please try again.</div>';
    if (btn) { btn.disabled = false; btn.textContent = 'Reject Leave'; }
  }
}

// Approve leave
async function approveLeave(leaveId) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/leave-requests/${leaveId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status: 'APPROVED' })
    });

    const data = await res.json();

    if (res.ok) {
      loadLeaveRequests();
      loadDashboardSummary();
    } else {
      alert('❌ ' + data.message);
    }
  } catch (err) {
    console.error(err);
    alert('❌ Failed to approve leave');
  }
}

/* ================= WEEKLY REPORTS (ADMIN VIEW) ================= */

/**
 * Load all weekly reports from members & team leads.
 * Supports optional date-range (filter by week_start) and role filter.
 */
async function loadWeeklyReports() {
  const tbody = document.getElementById('weeklyReportsTableBody');
  const countEl = document.getElementById('weeklyReportCount');

  tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-3">
    <div class="spinner-border spinner-border-sm me-2"></div>Loading…</td></tr>`;

  try {
    const weeklyFrom = document.getElementById('weeklyFromDate').value;
    const weeklyTo = document.getElementById('weeklyToDate').value;
    const role = document.getElementById('weeklyRoleFilter').value;

    const params = new URLSearchParams();
    if (weeklyFrom) params.append('week_start', weeklyFrom);
    if (role) params.append('role', role);

    // Use GET /api/admin/weekly-reports with filters
    const url = `${API_BASE}/api/admin/weekly-reports?${params.toString()}`;
    const reports = await apiRequest(url);

    // Client-side filter by "to" date if provided
    let filtered = reports;
    if (weeklyTo) {
      filtered = reports.filter(r => r.week_start <= weeklyTo);
    }

    tbody.innerHTML = '';

    if (!filtered || filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">
        No weekly reports found for selected filters.</td></tr>`;
      countEl.textContent = '0 reports';
      return;
    }

    countEl.textContent = `${filtered.length} report${filtered.length !== 1 ? 's' : ''}`;

    const roleColors = {
      TEAM_LEAD: 'bg-primary text-white',
      MEMBER: 'bg-secondary text-white',
      ADMIN: 'bg-dark text-white',
    };

    filtered.forEach(r => {
      const tr = document.createElement('tr');
      const weekLabel = r.week_start
        ? `${r.week_start}<br><span class="text-muted" style="font-size:11px;">to ${r.week_end || '—'}</span>`
        : '—';
      const roleClass = roleColors[r.role] || 'bg-secondary text-white';
      const submitted = r.created_at
        ? new Date(r.created_at).toLocaleString()
        : '—';

      // Truncate long text for display; full text visible on hover
      const truncate = (text, limit = 150) => {
        if (!text) return '<span class="text-muted">—</span>';
        const safe = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        if (safe.length <= limit) return `<span style="white-space:pre-wrap;">${safe}</span>`;
        return `<span title="${safe}" style="white-space:pre-wrap;cursor:help;">
          ${safe.substring(0, limit)}<span class="text-muted">… (hover)</span></span>`;
      };

      tr.innerHTML = `
        <td style="white-space:nowrap;min-width:110px;">${weekLabel}</td>
        <td>
          <div style="font-weight:600;">${r.name}</div>
          <div class="text-muted" style="font-size:11px;">${r.user_id}</div>
        </td>
        <td><span class="status-tag ${roleClass}" style="font-size:10px;">${r.role.replace('_', ' ')}</span></td>
        <td style="font-size:12px;">${truncate(r.work_done)}</td>
        <td style="font-size:12px;">${truncate(r.skills_learned)}</td>
        <td style="font-size:12px;">${truncate(r.project_update)}</td>
        <td style="white-space:nowrap;font-size:12px;">${submitted}</td>
      `;

      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error('Weekly reports load error:', err);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">
      Failed to load weekly reports.</td></tr>`;
  }
}

/**
 * Export all filtered weekly reports as an Excel (.xlsx) file.
 */
async function exportWeeklyExcel() {
  try {
    const weeklyFrom = document.getElementById('weeklyFromDate').value;
    const weeklyTo = document.getElementById('weeklyToDate').value;
    const role = document.getElementById('weeklyRoleFilter').value;

    const params = new URLSearchParams();
    if (weeklyFrom) params.append('week_start', weeklyFrom);
    if (weeklyTo) params.append('week_end', weeklyTo);
    if (role) params.append('role', role);

    const url = `${API_BASE}/api/admin/weekly-reports/export/excel?${params.toString()}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert('❌ Export failed: ' + (err.message || res.statusText));
      return;
    }

    const blob = await res.blob();
    const link = document.createElement('a');
    const suffix = weeklyFrom ? `_${weeklyFrom}` : '';
    link.href = window.URL.createObjectURL(blob);
    link.download = `weekly_reports${suffix}.xlsx`;
    link.click();

  } catch (err) {
    console.error('Weekly Excel export error:', err);
    alert('❌ Weekly Excel export failed');
  }
}

// Auto-load weekly reports when the tab is first shown
document.addEventListener('DOMContentLoaded', () => {
  const weeklyTabBtn = document.querySelector('[data-bs-target="#tab-weekly"]');
  if (weeklyTabBtn) {
    let weeklyLoaded = false;
    weeklyTabBtn.addEventListener('shown.bs.tab', () => {
      if (!weeklyLoaded) {
        weeklyLoaded = true;
        loadWeeklyReports(); // load all on first open
      }
    });
  }
});

