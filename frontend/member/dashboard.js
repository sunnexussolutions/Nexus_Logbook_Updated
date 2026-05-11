console.log("✅ Member dashboard JS loaded");

const API_BASE = ["", "localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://127.0.0.1:5000"
  : "https://nexus-logbook-updated.vercel.app";
const token = localStorage.getItem("token");

if (!token) {
  AppDialog.alert({
    title: "Session Expired",
    message: "Login again"
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

const statusText = document.getElementById("statusText");

const messageDiv = document.getElementById("message");
const projectTitle = document.getElementById("projectTitle");
const checkInBtn = document.getElementById("checkInBtn");
const checkOutBtn = document.getElementById("checkOutBtn");
let currentMemberStatus = "UNKNOWN";

const CURRENT_STATUS_META = {
  PRESENT: { label: "PRESENT", color: "#10b981", glow: "rgba(16, 185, 129, 0.2)" },
  CHECKED_IN: { label: "CHECKED_IN", color: "#2563eb", glow: "rgba(37, 99, 235, 0.2)" },
  ABSENT: { label: "ABSENT", color: "#dc2626", glow: "rgba(220, 38, 38, 0.2)" },
  HOLIDAY: { label: "HOLIDAY", color: "#0ea5e9", glow: "rgba(14, 165, 233, 0.2)" },
  ON_LEAVE: { label: "ON_LEAVE", color: "#7c3aed", glow: "rgba(124, 58, 237, 0.2)" },
  LATE: { label: "LATE", color: "#d97706", glow: "rgba(217, 119, 6, 0.2)" },
  PAUSED: { label: "PAUSED", color: "#f59e0b", glow: "rgba(245, 158, 11, 0.2)" }
};

function renderCurrentStatus(status) {
  const meta = CURRENT_STATUS_META[status] || {
    label: status || "UNKNOWN",
    color: "#64748b",
    glow: "rgba(100, 116, 139, 0.2)"
  };

  statusText.innerHTML = `
    <div class="ribbon-status-indicator" style="background:${meta.color}; box-shadow: 0 0 0 4px ${meta.glow};"></div>
    Status: ${meta.label}
  `;
}

/**
 * HELPER: Unified Premium Message Display
 * Replaces standard Bootstrap alerts with stylized pills
 */
function showStatus(msg, type = "info", targetDiv = messageDiv) {
  if (!targetDiv) return;
  const iconMap = {
    info: "bi-info-circle",
    success: "bi-check2-circle",
    error: "bi-exclamation-octagon",
    danger: "bi-exclamation-octagon", // Map danger to error
    warning: "bi-exclamation-triangle"
  };
  const icon = iconMap[type] || "bi-info-circle";
  const pillType = type === "danger" ? "error" : type;

  targetDiv.innerHTML = `
    <div class="status-pill ${pillType}">
      <i class="bi ${icon} fs-6"></i>
      <span>${msg}</span>
    </div>
  `;
}


// Load status
async function loadStatus() {
  const res = await fetch(`${API_BASE}/api/attendance/my-status`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await res.json();
  currentMemberStatus = data.status;
  renderCurrentStatus(data.status);

  checkInBtn.disabled = data.status !== "ABSENT";
  checkOutBtn.disabled = data.status !== "CHECKED_IN";
}

// Check In
checkInBtn.onclick = () => {

  if (!navigator.geolocation) {
    showStatus("Geolocation not supported", "error");
    return;
  }

  checkInBtn.disabled = true;
  showStatus("📡 Getting GPS location (wait a few seconds)...", "info");

  let bestPosition = null;
  let readings = 0;
  let sent = false;  // guard to prevent double-calling sendCheckIn

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      if (sent) return;
      readings++;
      const acc = position.coords.accuracy;
      console.log(`📍 GPS reading #${readings}: lat=${position.coords.latitude}, lon=${position.coords.longitude}, accuracy=${acc.toFixed(0)}m`);

      // Keep the most accurate reading
      if (!bestPosition || acc < bestPosition.coords.accuracy) {
        bestPosition = position;
      }

      // If we get a very accurate reading (<30m), use it immediately
      if (acc < 30) {
        sent = true;
        navigator.geolocation.clearWatch(watchId);
        sendCheckIn(bestPosition);
      }
    },
    (error) => {
      if (sent) return;
      navigator.geolocation.clearWatch(watchId);
      console.error("📍 Geolocation error:", error.code, error.message);

      // Fallback: try getCurrentPosition as a last resort
      showStatus("📡 Retrying location with fallback method...", "info");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (sent) return;
          sent = true;
          sendCheckIn(pos);
        },
        (err2) => {
          if (sent) return;
          checkInBtn.disabled = false;
          console.error("📍 Fallback geolocation error:", err2.code, err2.message);
          showStatus(`Location error: ${err2.message || error.message || "Permission denied"}`, "error");
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 30000 }
      );
    },
    {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0
    }
  );

  // After 10 seconds, use the best reading we have (increased from 5s for mobile GPS)
  setTimeout(() => {
    navigator.geolocation.clearWatch(watchId);
    if (sent) return;  // already sent, do nothing
    if (bestPosition) {
      sent = true;
      sendCheckIn(bestPosition);
    } else {
      // Last resort fallback: try single getCurrentPosition with relaxed settings
      showStatus("📡 Still acquiring location, trying fallback...", "info");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (sent) return;
          sent = true;
          sendCheckIn(pos);
        },
        (err) => {
          if (sent) return;
          checkInBtn.disabled = false;
          showStatus("Could not get GPS location. Please ensure location is enabled.", "error");
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
      );
    }
  }, 10000);
};

async function sendCheckIn(position) {
  try {
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    const accuracy = position.coords.accuracy;

    console.log("📍 Best GPS reading:", latitude, longitude, "Accuracy:", accuracy.toFixed(0), "m");
    showStatus(`📡 Checking in (GPS accuracy: ~${Math.round(accuracy)}m)...`, "info");

    const res = await fetch(`${API_BASE}/api/attendance/check-in`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ latitude, longitude, accuracy })
    });

    const data = await res.json();

    if (!res.ok) {
      // If blocked by missed checkout penalty, show button to open the modal
      if (res.status === 403 && data.message && data.message.includes('missed checkout')) {
        messageDiv.innerHTML = `
          <div class="status-pill error flex-column align-items-start gap-2 h-auto py-3 px-4" style="border-radius:16px;">
            <div class="d-flex align-items-center gap-2">
              <i class="bi bi-exclamation-octagon fs-5"></i>
              <span class="fw-bold">${data.message}</span>
            </div>
            <button class="btn btn-sm btn-warning mt-1 fw-bold rounded-pill px-3" onclick="forceOpenMissedModal()">
              📝 Submit Missed Report Now
            </button>
          </div>`;
      } else {
        showStatus(data.message, "error");
      }
      checkInBtn.disabled = false;
      return;
    }

    showStatus(data.message, "success");

    loadStatus();
    loadMyAttendanceHistory();
    updateCheckoutBanner();

  } catch (err) {
    console.error("Check-in error:", err);
    showStatus("Check-in failed", "error");
    checkInBtn.disabled = false;
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

// Check Out
checkOutBtn.onclick = async () => {
  checkOutBtn.disabled = true;
  checkOutBtn.textContent = "Processing...";
  try {
    // 🔒 Block checkout if daily work report not submitted
    const reportCheck = await fetch(`${API_BASE}/api/work/check-today`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const reportData = await reportCheck.json();

    if (!reportData.submitted) {
      showStatus("⚠️ Please submit your daily work report first.", "warning");
      checkOutBtn.disabled = false;
      checkOutBtn.textContent = "Check Out";
      return;
    }

    const istWeekday = new Date().toLocaleString("en-US", {
      timeZone: "Asia/Kolkata",
      weekday: "short"
    });
    if (istWeekday === "Sat") {
      const weeklyCheck = await fetch(`${API_BASE}/api/work/check-weekly`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const weeklyData = await weeklyCheck.json();

      if (!weeklyData.submitted) {
        showStatus("⚠️ Saturday checkout is blocked until weekly report is submitted.", "warning");
        checkOutBtn.disabled = false;
        checkOutBtn.textContent = "Check Out";
        return;
      }
    }

    const res = await fetch(`${API_BASE}/api/attendance/check-out`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await res.json();

    if (!res.ok) {
      showStatus(data.message, "error");
      checkOutBtn.disabled = false;
      checkOutBtn.textContent = "Check Out";
      return;
    }

    showStatus(data.message, "success");

    loadStatus();
    loadMyAttendanceHistory();
    updateCheckoutBanner();

  } catch (err) {
    console.error("Check-out error:", err);
    showStatus("Check-out failed", "error");
    checkOutBtn.disabled = false;
    checkOutBtn.textContent = "Check Out";
  }
};

async function submitMemberDailyReport() {
  const workDone = document
    .getElementById("memberWorkDone")
    .value.trim();

  const messageDiv = document.getElementById("memberWorkMessage");
  const btn = event ? event.target : null;

  if (!workDone) {
    showStatus("Please enter work details", "error", messageDiv);
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = "Submitting..."; }

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
      showStatus(data.message, "error", document.getElementById("memberWorkMessage"));
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-cloud-arrow-up"></i> Commit'; }
      return;
    }

    showStatus(data.message, "success", document.getElementById("memberWorkMessage"));

    document.getElementById("memberWorkDone").value = "";
    loadMyWorkReports();
    updateCheckoutBanner();
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-cloud-arrow-up"></i> Commit'; }

  } catch (err) {
    console.error(err);
    showStatus("Submission failed", "error", messageDiv);
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-cloud-arrow-up"></i> Commit'; }
  }
}
async function loadMemberProjects() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/member/roadmap`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const projects = await res.json();

    const select = document.getElementById("memberProjectSelect");
    const stepsList = document.getElementById("memberRoadmapSteps");
    const progressCircle = document.getElementById("memberProgressCircle");
    const progressText = document.getElementById("memberProgressText");

    select.innerHTML = `<option value="">Choose your objective...</option>`;
    stepsList.innerHTML = `
      <div class="text-center py-5">
         <p class="text-muted small">Select a project to load strategic nodes...</p>
      </div>
    `;
    if (progressCircle) progressCircle.style.strokeDashoffset = "264";
    if (progressText) progressText.textContent = "0%";

    if (!projects.length) {
      stepsList.innerHTML = `
        <div class="text-center py-5">
          <i class="bi bi-shield-lock fs-1 text-muted opacity-25"></i>
          <p class="text-muted small mt-2">No projects currently assigned to your profile.</p>
        </div>
      `;
      return;
    }

    projects.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.project_id;
      opt.textContent = p.project_name;
      select.appendChild(opt);
    });

    select.onchange = () => {
      const selected = projects.find(
        p => p.project_id == select.value
      );
      if (selected) renderMemberRoadmap(selected);
    };

  } catch (err) {
    console.error("Failed to load member projects:", err);
  }
}

function renderMemberRoadmap(project) {
  const stepsList = document.getElementById("memberRoadmapSteps");
  const progressCircle = document.getElementById("memberProgressCircle");
  const progressText = document.getElementById("memberProgressText");
  const compBadge = document.getElementById("completedNodesCount");
  const totalBadge = document.getElementById("totalNodesCount");
  const projectTitleBadge = document.getElementById("projectTitle");
  const roadmapTitleBadge = document.getElementById("roadmapProjectTitle");

  stepsList.innerHTML = "";

  const total = project.steps.length;
  const completed = project.steps.filter(s => s.is_completed).length;
  const progress = total === 0 ? 0 : Math.round((completed / total) * 100);

  // Update Progress Circle (Circumference ~264)
  if (progressCircle) {
    const offset = 264 - (progress / 100) * 264;
    progressCircle.style.strokeDashoffset = offset;
  }
  if (progressText) progressText.textContent = progress + "%";
  if (compBadge) compBadge.textContent = `${completed} Done`;
  if (totalBadge) totalBadge.textContent = `${total} Total`;
  if (projectTitleBadge) projectTitleBadge.textContent = project.project_name;
  if (roadmapTitleBadge) roadmapTitleBadge.textContent = project.project_name;

  project.steps.forEach(step => {
    const item = document.createElement("div");
    item.className = `timeline-item ${step.is_completed ? 'completed' : ''}`;

    item.innerHTML = `
      <div class="timeline-marker"></div>
      <div class="timeline-content">
        <div class="d-flex align-items-center gap-3">
          <div class="form-check m-0">
            <input class="form-check-input" type="checkbox" 
              style="width: 20px; height: 20px; cursor: pointer; border-radius: 6px;"
              ${step.is_completed ? "checked" : ""}
              onchange="updateStep(${step.id}, this.checked)">
          </div>
          <div>
            <div class="fw-bold text-dark ${step.is_completed ? 'text-decoration-line-through opacity-75' : ''}" style="font-size: 14px;">
              ${step.step_title}
            </div>
            <div class="small text-muted" style="font-size: 11px;">
              ${step.is_completed ? 'Objective Cleared' : 'Pending Realization'}
            </div>
          </div>
        </div>
        ${step.is_completed ? '<i class="bi bi-patch-check-fill text-success fs-5"></i>' : '<i class="bi bi-circle text-light fs-5"></i>'}
      </div>
    `;

    stepsList.appendChild(item);
  });
}

async function updateStep(stepId, isCompleted) {
  await fetch(`${API_BASE}/api/admin/roadmap-step`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      step_id: stepId,
      is_completed: isCompleted
    })
  });

  loadMemberProjects(); // reload everything
}
async function applyLeave() {
  const fromDate = document.getElementById("leaveFromDate").value;
  const toDate = document.getElementById("leaveToDate").value;
  const reason = document.getElementById("leaveReason").value.trim();
  const messageDiv = document.getElementById("leaveMessage");

  if (!fromDate || !toDate || !reason) {
    showStatus("All fields are required", "error", messageDiv);
    return;
  }

  if (fromDate > toDate) {
    showStatus("From date cannot be after To date", "error", messageDiv);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/attendance/apply-leave`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        from_date: fromDate,
        to_date: toDate,
        reason
      })
    });

    const data = await res.json();

    if (!res.ok) {
      showStatus(data.message, "error", messageDiv);
      return;
    }

    messageDiv.innerHTML =
      `<div class="alert alert-success">${data.message}</div>`;

    document.getElementById("leaveFromDate").value = "";
    document.getElementById("leaveToDate").value = "";
    document.getElementById("leaveReason").value = "";
    loadMyLeaveBalance();
    loadMyLeaveRequests();

  } catch (err) {
    console.error(err);
    showStatus("Leave submission failed", "error", messageDiv);
  }
}


/* ================= MY PROJECT PORTFOLIO STATS ================= */
async function loadMyProjectStats() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/my-project-stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();

    // Stat badges
    const statusBadge = document.getElementById("myProjectStatusBadge");
    if (statusBadge) {
      if (data.status === "FREE") {
        statusBadge.innerHTML = '<span class="text-success"><i class="bi bi-circle-fill me-2" style="font-size:8px;"></i>Bench Pool</span>';
      } else {
        statusBadge.innerHTML = '<span class="text-primary"><i class="bi bi-circle-fill me-2" style="font-size:8px;"></i>Operational</span>';
      }
    }

    // Stat cards
    const ac = document.getElementById("activeProjectCount");
    const cc = document.getElementById("completedProjectCount");
    const tc = document.getElementById("totalProjectCount");
    if (ac) ac.textContent = data.active_count;
    if (cc) cc.textContent = data.completed_count;
    if (tc) tc.textContent = data.active_count + data.completed_count;

    // Active projects list
    const activeDiv = document.getElementById("activeProjectsList");
    if (activeDiv) {
      if (data.active_projects.length === 0) {
        activeDiv.innerHTML = `<div class="col-12 text-center py-3 text-muted small">No active deployments identified</div>`;
      } else {
        activeDiv.innerHTML = data.active_projects.map(p => `
          <div class="col">
            <div class="project-card h-100">
              <div class="project-header-top">
                <div class="project-icon-box bg-primary bg-opacity-10 text-primary">
                  ${p.project_name.substring(0, 2).toUpperCase()}
                </div>
                <div class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill">
                  Live Sync
                </div>
              </div>
              
              <div class="project-info">
                <div class="fw-extrabold text-dark fs-6 mb-1">${p.project_name}</div>
                <div class="small text-muted mb-2"><i class="bi bi-person-circle me-1"></i> Lead: ${p.team_lead_name || 'N/A'}</div>
              </div>

              <div class="stats-row">
                <div class="project-stat-pill">
                  <div class="stat-pill-label">Duration</div>
                  <div class="stat-pill-value">${p.days_elapsed}d Active</div>
                </div>
                <div class="project-stat-pill">
                  <div class="stat-pill-label">Team</div>
                  <div class="stat-pill-value">${p.member_count || 1} Experts</div>
                </div>
              </div>

              <div class="progress-section">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <div class="small fw-bold text-muted text-uppercase" style="font-size: 9px;">Execution Progress</div>
                  <div class="small fw-extrabold text-primary">${p.progress}%</div>
                </div>
                <div class="progress-track">
                  <div class="progress-fill" style="width: ${p.progress}%"></div>
                </div>
                <div class="d-flex justify-content-between mt-2" style="font-size: 10px;">
                   <span class="text-muted">${p.completed_steps} achieved</span>
                   <span class="text-muted">${p.total_steps} target</span>
                </div>
              </div>
            </div>
          </div>
        `).join("");
      }
    }

    // Completed projects list
    const compDiv = document.getElementById("completedProjectsList");
    if (compDiv) {
      if (data.completed_projects.length === 0) {
        compDiv.innerHTML = `<div class="col-12 text-center py-3 text-muted small">Archive currently empty</div>`;
      } else {
        compDiv.innerHTML = data.completed_projects.map(p => `
          <div class="col">
            <div class="project-card h-100" style="background: rgba(16, 185, 129, 0.02); border-color: rgba(16, 185, 129, 0.1);">
              <div class="project-header-top">
                <div class="project-icon-box bg-success bg-opacity-10 text-success">
                  ${p.project_name.substring(0, 2).toUpperCase()}
                </div>
                <div class="badge bg-success text-white rounded-pill shadow-sm">
                  Completed
                </div>
              </div>
              
              <div class="project-info">
                <div class="fw-bold text-dark mb-1">${p.project_name}</div>
                <div class="small text-muted"><i class="bi bi-calendar-check me-1"></i> Finalized in ${p.days_taken} days</div>
              </div>

               <div class="project-stat-pill" style="background: white;">
                  <div class="stat-pill-label">Performance</div>
                  <div class="stat-pill-value text-success"><i class="bi bi-trophy-fill me-2"></i>Mission Cleared</div>
                </div>
            </div>
          </div>
        `).join("");
      }
    }

  } catch (err) {
    console.error("Project stats error:", err);
  }
}


document.addEventListener("DOMContentLoaded", () => {
  loadMemberProjects();
  loadMyProjectStats();
  loadStatus();
  loadNotifications();
  setInterval(loadNotifications, 60000);
  loadMyLeaveBalance();
  loadMyLeaveRequests();
  loadMyWorkReports();
  loadMyWeeklyReports();
  checkWeeklyReportStatus();
  setWeekRangeLabel();
  updateCheckoutBanner();
  loadMyAttendancePercentage(); // Show attendance % card on load

  // Set month picker to current month and auto-load
  const picker = document.getElementById("attendanceMonthPicker");
  if (picker) {
    picker.value = new Date().toISOString().slice(0, 7);
    loadMyAttendanceHistory();
  }

  // Enforce missed checkout report
  checkPendingMissed();
});

let pendingMissedData = [];
let missedCheckoutModalInstance = null;

async function checkPendingMissed() {
  try {
    const res = await fetch(`${API_BASE}/api/work/pending-missed`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;
    const pending = await res.json();
    pendingMissedData = pending;

    // Remove old banner if exists
    const old = document.getElementById('missedCheckoutBanner');
    if (old) old.remove();

    if (pending && pending.length > 0) {
      const banner = document.createElement('div');
      banner.id = 'missedCheckoutBanner';
      banner.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);z-index:9999;background:#dc2626;color:white;padding:14px 24px;border-radius:14px;font-weight:700;font-size:14px;box-shadow:0 4px 20px rgba(220,38,38,0.5);display:flex;align-items:center;gap:12px;white-space:nowrap;';
      banner.innerHTML = `
        <i class="bi bi-exclamation-octagon-fill fs-5"></i>
        <span>You have <strong>${pending.length}</strong> pending missed checkout report(s).</span>
        <button id="missedBannerBtn" style="background:white;color:#dc2626;border:none;border-radius:8px;padding:6px 14px;font-weight:700;cursor:pointer;">📝 Submit Now</button>
        <button onclick="document.getElementById('missedCheckoutBanner').remove()" style="background:transparent;color:white;border:1px solid rgba(255,255,255,0.5);border-radius:8px;padding:6px 10px;font-weight:700;cursor:pointer;">✕</button>
      `;
      document.body.appendChild(banner);

      // Attach click AFTER appending so the element exists
      document.getElementById('missedBannerBtn').addEventListener('click', () => {
        openMissedModal(pendingMissedData[0]);
      });
    }
  } catch (err) {
    console.error("Pending missed check error:", err);
  }
}

// Reusable function to open missed checkout modal — can be called from anywhere
function openMissedModal(mcData) {
  try {
    if (mcData) {
      document.getElementById("mcId").value = mcData.id;
      const fmtDate = new Date(mcData.date).toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      document.getElementById("mcDateText").innerText = fmtDate;
    }

    const modalEl = document.getElementById('missedCheckoutModal');
    if (!modalEl) {
      console.error("missedCheckoutModal element not found in HTML!");
      return;
    }

    // Remove stale aria-hidden
    modalEl.removeAttribute('aria-hidden');

    if (!missedCheckoutModalInstance) {
      missedCheckoutModalInstance = new bootstrap.Modal(modalEl, {
        backdrop: 'static',
        keyboard: false
      });
    }
    missedCheckoutModalInstance.show();
  } catch (err) {
    console.error("Failed to open missed checkout modal:", err);
    // Ultimate fallback: alert
    alert("⚠️ You have a pending missed checkout report. Please refresh the page and submit it.");
  }
}

// Expose so the check-in error button can call it
window.openMissedModal = openMissedModal;

// Fallback: fetch and open modal manually (called from check-in error button)
window.forceOpenMissedModal = async function () {
  try {
    if (pendingMissedData && pendingMissedData.length > 0) {
      openMissedModal(pendingMissedData[0]);
      return;
    }
    const res = await fetch(`${API_BASE}/api/work/pending-missed`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;
    const pending = await res.json();
    pendingMissedData = pending;
    if (pending && pending.length > 0) {
      openMissedModal(pending[0]);
    }
  } catch (err) {
    console.error("Force open missed modal error:", err);
    alert("⚠️ Could not load missed checkout data. Please refresh the page.");
  }
};


const MEMBER_LIVE_REFRESH_MS = 15000;

/* ================= CHECKOUT REMINDER BANNER ================= */
async function updateCheckoutBanner() {
  try {
    const banner = document.getElementById("checkoutReminderBanner");
    if (!banner) return;

    const statusRes = await fetch(`${API_BASE}/api/attendance/my-status`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const statusData = await statusRes.json();

    if (statusData.status !== "CHECKED_IN") {
      banner.classList.remove("visible");
      return;
    }

    const reportRes = await fetch(`${API_BASE}/api/work/check-today`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const reportData = await reportRes.json();

    if (reportData.submitted) {
      banner.classList.remove("visible");
    } else {
      banner.classList.add("visible");
    }
  } catch (err) {
    console.error("Banner check error:", err);
  }
}

function refreshMemberLiveData() {
  loadStatus();
  loadNotifications();
  checkWeeklyReportStatus();
  updateCheckoutBanner();

  const picker = document.getElementById("attendanceMonthPicker");
  if (picker && picker.value) {
    loadMyAttendanceHistory();
  }
}

setInterval(() => {
  if (document.visibilityState === "visible") {
    refreshMemberLiveData();
  }
}, MEMBER_LIVE_REFRESH_MS);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    refreshMemberLiveData();
  }
});

/* ================= WEEK RANGE HELPER ================= */
function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday, sunday };
}

function setWeekRangeLabel() {
  const label = document.getElementById("weekRangeLabel");
  if (!label) return;
  const { monday, sunday } = getWeekRange();
  const fmt = (d) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  label.textContent = `${fmt(monday)} – ${fmt(sunday)}`;
}

/* ================= SUBMIT WEEKLY REPORT ================= */
async function submitWeeklyReport() {
  const skills = document.getElementById("weeklySkillsLearned").value.trim();
  const projectUpdate = document.getElementById("weeklyProjectUpdate").value.trim();
  const workDone = document.getElementById("weeklyWorkDone").value.trim();
  const msgDiv = document.getElementById("weeklyReportMessage");

  if (!skills || !projectUpdate || !workDone) {
    showStatus("All fields are required", "error", msgDiv);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/work/weekly`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        skills_learned: skills,
        project_update: projectUpdate,
        work_done: workDone
      })
    });

    const data = await res.json();

    if (!res.ok) {
      showStatus(data.message, "error", msgDiv);
      return;
    }

    showStatus(data.message, "success", msgDiv);
    document.getElementById("weeklySkillsLearned").value = "";
    document.getElementById("weeklyProjectUpdate").value = "";
    document.getElementById("weeklyWorkDone").value = "";
    loadMyWeeklyReports();
    checkWeeklyReportStatus();

  } catch (err) {
    console.error("Weekly report error:", err);
    showStatus("Submission failed", "error", msgDiv);
  }
}

/* ================= CHECK WEEKLY REPORT STATUS ================= */
async function checkWeeklyReportStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/work/check-weekly`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();

    const alreadyDiv = document.getElementById("weeklyAlreadySubmitted");
    const formDiv = document.getElementById("weeklyReportForm");

    if (data.submitted) {
      alreadyDiv.style.display = "block";
      formDiv.style.display = "none";
    } else {
      alreadyDiv.style.display = "none";
      formDiv.style.display = "block";
    }
  } catch (err) {
    console.error("Check weekly status error:", err);
  }
}

/* ================= MY WEEKLY REPORTS ARCHIVE ================= */
async function loadMyWeeklyReports() {
  const tbody = document.getElementById("myWeeklyReportsBody");
  const countBadge = document.getElementById("weeklyReportCount");

  try {
    const res = await fetch(`${API_BASE}/api/work/my?type=WEEKLY`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger py-3">Failed to load</td></tr>`;
      return;
    }

    const reports = await res.json();

    if (reports.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">No weekly reports submitted yet</td></tr>`;
      countBadge.textContent = "0";
      return;
    }

    countBadge.textContent = `${reports.length} report${reports.length !== 1 ? "s" : ""}`;

    tbody.innerHTML = reports.map(r => {
      const ws = new Date(r.week_start).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });
      const we = new Date(r.week_end).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
      const truncate = (text, max) => {
        if (!text) return "<span class='text-muted'>—</span>";
        return text.length > 100 ? text.slice(0, 100) + "…" : text;
      };
      return `
        <tr>
          <td class="text-nowrap">${ws} – ${we}</td>
          <td title="${(r.skills_learned || '').replace(/"/g, '&quot;')}">${truncate(r.skills_learned)}</td>
          <td title="${(r.project_update || '').replace(/"/g, '&quot;')}">${truncate(r.project_update)}</td>
          <td title="${(r.work_done || '').replace(/"/g, '&quot;')}">${truncate(r.work_done)}</td>
        </tr>`;
    }).join("");

  } catch (err) {
    console.error("Weekly reports error:", err);
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger py-3">Error loading</td></tr>`;
  }
}

/* ================= MY WORK REPORTS ================= */
async function loadMyWorkReports() {
  const tbody = document.getElementById("myWorkReportsBody");
  const countBadge = document.getElementById("workReportCount");

  try {
    const res = await fetch(`${API_BASE}/api/work/my?type=DAILY`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ message: "Unknown error" }));
      console.error(`Error loading work reports (${res.status}):`, errorData);
      tbody.innerHTML = `<tr><td colspan="3" class="text-center text-danger py-3">Failed to load reports: ${errorData.message || res.statusText}</td></tr>`;
      return;
    }

    const reports = await res.json();

    if (reports.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-3">No reports submitted yet</td></tr>`;
      countBadge.textContent = "0 reports";
      return;
    }

    countBadge.textContent = `${reports.length} report${reports.length !== 1 ? "s" : ""}`;

    tbody.innerHTML = reports.map(r => {
      const dateStr = new Date(r.report_date).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric", timeZone: "UTC"
      });
      // Truncate long work_done text with expandable title tooltip
      const workText = r.work_done.length > 120 ? r.work_done.slice(0, 120) + "…" : r.work_done;
      return `
        <tr>
          <td class="text-nowrap">${dateStr}</td>
          <td class="text-muted">${r.title || "—"}</td>
          <td title="${r.work_done.replace(/"/g, '&quot;')}">${workText}</td>
        </tr>`;
    }).join("");

  } catch (err) {
    console.error("Work reports error:", err);
    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-danger py-3">Error loading reports: ${err.message}</td></tr>`;
  }
}


/* ================= LEAVE BALANCE ================= */
async function loadMyLeaveBalance() {
  try {
    const res = await fetch(`${API_BASE}/api/attendance/my-leave-balance`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) return;

    const { quota, used, remaining, pending, year } = await res.json();

    document.getElementById("leaveBalanceYear").textContent = `(${year})`;
    document.getElementById("lbQuota").textContent = quota;
    document.getElementById("lbUsed").textContent = used;
    document.getElementById("lbRemaining").textContent = remaining;
    document.getElementById("lbPending").textContent = pending;

    // Progress bar: remaining=green, pending=yellow, used=red (all % of quota)
    const remPct = Math.round((remaining / quota) * 100);
    const pendPct = Math.round((pending / quota) * 100);
    const usedPct = Math.round((used / quota) * 100);

    document.getElementById("lbProgressBar").style.width = `${remPct}%`;
    document.getElementById("lbPendingBar").style.width = `${pendPct}%`;
    document.getElementById("lbUsedBar").style.width = `${usedPct}%`;

  } catch (err) {
    console.error("Leave balance error:", err);
  }
}

/* ================= MY LEAVE REQUESTS ================= */
async function loadMyLeaveRequests() {
  const tbody = document.getElementById("myLeaveRequestsBody");
  try {
    const res = await fetch(`${API_BASE}/api/attendance/my-leave-requests`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ message: "Unknown error" }));
      console.error(`Error loading leave requests (${res.status}):`, errorData);
      // Also log serialized body so DevTools shows exact contents
      try { console.error('LeaveRequests response body (raw):', JSON.stringify(errorData)); } catch (e) { /* ignore */ }
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-3">Failed to load requests: ${errorData.message || res.statusText}</td></tr>`;
      return;
    }

    const data = await res.json();

    if (data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">No leave requests found</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(l => {
      const appliedOn = new Date(l.applied_at || l.created_at).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric", timeZone: "UTC"
      });
      const fromD = new Date(l.from_date).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric", timeZone: "UTC"
      });
      const toD = new Date(l.to_date).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric", timeZone: "UTC"
      });

      let statusBadge = "";
      if (l.status === 'PENDING') statusBadge = '<span class="badge bg-warning text-dark">PENDING</span>';
      else if (l.status === 'APPROVED') statusBadge = '<span class="badge bg-success">APPROVED</span>';
      else statusBadge = '<span class="badge bg-danger">REJECTED</span>';

      return `
        <tr>
          <td class="text-nowrap">${appliedOn}</td>
          <td class="text-nowrap">${fromD}</td>
          <td class="text-nowrap">${toD}</td>
          <td>${l.reason}</td>
          <td>${statusBadge}</td>
        </tr>`;
    }).join("");

  } catch (err) {
    console.error("Leave requests error:", err);
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-3">Error loading requests: ${err.message}</td></tr>`;
  }
}

/* ================= ATTENDANCE HISTORY ================= */
const STATUS_STYLE = {
  PRESENT: { bg: "#dcfce7", color: "#15803d", label: "Present" },
  CHECKED_IN: { bg: "#dbeafe", color: "#1d4ed8", label: "Checked In" },
  ABSENT: { bg: "#fee2e2", color: "#dc2626", label: "Absent" },
  LATE: { bg: "#fef9c3", color: "#a16207", label: "Late" },
  ON_LEAVE: { bg: "#ede9fe", color: "#7c3aed", label: "On Leave" },
  HOLIDAY: { bg: "#e0f2fe", color: "#0369a1", label: "Holiday" },
  PAUSED: { bg: "#ffedd5", color: "#c2410c", label: "Paused" },
  MISSED_CHECKOUT: { bg: "#fecaca", color: "#991b1b", label: "Missed Checkout ⚠️" },
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function loadMyAttendanceHistory() {
  const month = document.getElementById("attendanceMonthPicker").value;
  const tbody = document.getElementById("attendanceHistoryBody");
  const summaryBar = document.getElementById("attendanceSummaryBar");

  tbody.innerHTML = `<div class="text-center py-5 fw-bold" style="color:#94a3b8;">Loading telemetry data...</div>`;

  try {
    const res = await fetch(`${API_BASE}/api/attendance/my-history?month=${month}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const records = await res.json();

    if (!records.length) {
      tbody.innerHTML = `<div class="text-center py-5 fw-bold" style="color:#94a3b8;">No records found for this temporal range</div>`;
      summaryBar.innerHTML = "";
      return;
    }

    // Summary counts
    const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, ON_LEAVE: 0, CHECKED_IN: 0, HOLIDAY: 0, PAUSED: 0 };
    let totalEarly = 0;
    let totalOT = 0;
    records.forEach(r => {
      if (counts[r.status] !== undefined) counts[r.status]++;
      if (r.early_checkout_minutes) totalEarly += Number(r.early_checkout_minutes);
      if (r.overtime_minutes) totalOT += Number(r.overtime_minutes);
    });

    tbody.innerHTML = records.map(r => {
      const s = STATUS_STYLE[r.status] || { bg: "#f1f5f9", color: "#64748b", label: r.status };
      const dateObj = new Date(r.date);
      const dayName = DAYS[dateObj.getUTCDay()];
      const dateStr = dateObj.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });

      const earlyMin = r.early_checkout_minutes ? Number(r.early_checkout_minutes) : 0;
      const otMin = r.overtime_minutes ? Number(r.overtime_minutes) : 0;

      const earlyBadge = earlyMin > 0
        ? `<span style="background:#fee2e2; color:#dc2626; padding:2px 8px; border-radius:4px; font-size:0.75rem; font-weight:600;">${earlyMin}</span>`
        : `<span class="text-muted">—</span>`;

      const otBadge = otMin > 0
        ? `<span style="background:#dcfce7; color:#15803d; padding:2px 8px; border-radius:4px; font-size:0.75rem; font-weight:600;">${otMin}</span>`
        : `<span class="text-muted">—</span>`;

      return `
        <div class="attendance-card d-flex flex-column flex-xl-row justify-content-between align-items-xl-center p-3 px-4 shadow-sm border border-light" style="border-radius: 20px; background: rgba(255, 255, 255, 0.6); backdrop-filter: blur(8px); transition: all 0.3s ease; cursor: default;">
          
          <div class="d-flex align-items-center gap-4 mb-3 mb-xl-0">
             <div class="d-flex flex-column align-items-center justify-content-center" style="min-width: 60px;">
               <div class="text-uppercase fw-extrabold" style="font-size: 0.75rem; letter-spacing: 1px; color: #6366f1;">${dayName}</div>
               <div class="fw-black text-dark" style="font-size: 1.6rem; line-height: 1;">${new Date(r.date).getUTCDate()}</div>
             </div>
             <div class="border-start ps-4">
               <span style="background:${s.bg}; color:${s.color}; padding:6px 14px; border-radius:30px; font-size:0.75rem; font-weight:700; display: inline-flex; align-items:center; box-shadow: 0 2px 8px ${s.bg};">
                 <i class="bi bi-record-circle-fill me-2" style="font-size: 10px;"></i>${s.label}
               </span>
               <div class="small fw-semibold text-muted mt-2"><i class="bi bi-person-workspace me-1"></i> Shift: ${r.shift_name || "—"}</div>
             </div>
          </div>

          <div class="d-flex flex-wrap gap-4 align-items-center">
             <div class="d-flex flex-column">
               <span class="text-muted text-uppercase fw-bold mb-1" style="font-size: 0.65rem; letter-spacing: 1px;">Check In</span>
               <div class="fw-bold text-dark d-flex align-items-center gap-2"><i class="bi bi-box-arrow-in-right text-success fs-5"></i> ${fmtIST(r.check_in)}</div>
             </div>
             
             <div class="d-flex flex-column">
               <span class="text-muted text-uppercase fw-bold mb-1" style="font-size: 0.65rem; letter-spacing: 1px;">Check Out</span>
               <div class="fw-bold text-dark d-flex align-items-center gap-2"><i class="bi bi-box-arrow-left text-danger fs-5"></i> ${fmtIST(r.check_out)}</div>
             </div>
             
             <div class="d-flex gap-3 border-start ps-4 ms-2">
                 <div class="d-flex flex-column align-items-center" title="Early Departure">
                   <span class="text-muted text-uppercase fw-bold mb-1" style="font-size: 0.65rem;">Early</span>
                   ${earlyMin > 0 ? `<div class="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill px-2 py-1 shadow-sm">${earlyMin}m</div>` : `<div class="text-muted opacity-50 fw-bold">—</div>`}
                 </div>
                 <div class="d-flex flex-column align-items-center" title="Overtime">
                   <span class="text-muted text-uppercase fw-bold mb-1" style="font-size: 0.65rem;">OT</span>
                   ${otMin > 0 ? `<div class="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2 py-1 shadow-sm">${otMin}m</div>` : `<div class="text-muted opacity-50 fw-bold">—</div>`}
                 </div>
             </div>
          </div>
        </div>`;
    }).join("");

    // Summary bar
    summaryBar.innerHTML = [
      `<span>✅ Present: <strong>${counts.PRESENT}</strong></span>`,
      `<span>🔵 Checked-In: <strong>${counts.CHECKED_IN}</strong></span>`,
      `<span>❌ Absent: <strong>${counts.ABSENT}</strong></span>`,
      `<span>⏰ Late: <strong>${counts.LATE}</strong></span>`,
      `<span>🟣 On Leave: <strong>${counts.ON_LEAVE}</strong></span>`,
      `<span>🏖️ Holiday: <strong>${counts.HOLIDAY}</strong></span>`,
      totalEarly > 0 ? `<span>⚠️ Early: <strong style="color:#dc2626;">${totalEarly} min</strong></span>` : "",
      totalOT > 0 ? `<span>💪 OT: <strong style="color:#15803d;">${totalOT} min</strong></span>` : "",
    ].filter(Boolean).join(`<span class='mx-1'>·</span>`);

    summaryBar.innerHTML += `<span class='mx-1'>·</span><span>Paused: <strong>${counts.PAUSED}</strong></span>`;

    // Load and show attendance percentage (only when viewing current month)
    const currentMonth = new Date().toISOString().slice(0, 7);
    if (month === currentMonth) {
      loadMyAttendancePercentage();
    }
  } catch (err) {
    console.error("Attendance history error:", err);
    tbody.innerHTML = `<div class="text-center py-5 fw-bold text-danger">Failed to load telemetry records</div>`;
  }
}

/* ================= ATTENDANCE PERCENTAGE CARD ================= */
async function loadMyAttendancePercentage() {
  try {
    const [statusRes, monthRes, overallRes] = await Promise.all([
      fetch(`${API_BASE}/api/attendance/my-status`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_BASE}/api/attendance/my-percentage`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_BASE}/api/attendance/my-overall-percentage`, { headers: { Authorization: `Bearer ${token}` } })
    ]);

    const container = document.getElementById('attendancePercentageCard');
    if (!container) return;

    let html = '';
    let statusData = null;

    if (statusRes.ok) {
      statusData = await statusRes.json();
    }

    if (statusData?.status === "PAUSED") {
      html += `
        <div class="mb-3 p-4 rounded-4 shadow-sm border border-warning-subtle" style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.14), rgba(251, 191, 36, 0.08));">
          <div class="d-flex align-items-center gap-3">
            <div class="rounded-circle d-flex align-items-center justify-content-center" style="width:48px;height:48px;background:#fff7ed;color:#c2410c;">
              <i class="bi bi-pause-circle-fill fs-4"></i>
            </div>
            <div>
              <div class="fw-extrabold text-dark mb-1" style="font-size:1.05rem;">Account Status: PAUSED</div>
              <div class="small fw-medium" style="color:#9a3412;">Attendance analytics exclude paused days, and check-in is disabled while the pause is active.</div>
            </div>
          </div>
        </div>`;
    }

    if (monthRes.ok) {
      const data = await monthRes.json();
      const pct = data.percentage;
      const from = new Date(data.from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
      const to = new Date(data.to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
      const isGood = pct >= 75;
      const isOk = pct >= 50 && pct < 75;
      const color = isGood ? '#10b981' : isOk ? '#f59e0b' : '#ef4444';
      const bgGrade = isGood ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0.05))' : isOk ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(245, 158, 11, 0.05))' : 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.05))';
      
      html += `
        <div class="d-flex align-items-center mb-3 p-4 rounded-4 shadow-sm border border-white" style="background: ${bgGrade}; backdrop-filter: blur(10px);">
          <div class="d-flex flex-column align-items-center justify-content-center me-4 pe-4 border-end border-opacity-25" style="border-color: ${color} !important;">
            <div class="fw-black" style="font-size: 2.8rem; line-height: 1; color: ${color};">${pct}%</div>
            <div class="small fw-bold mt-1 text-uppercase" style="letter-spacing: 1px; color: ${color}; opacity: 0.8;">Health</div>
          </div>
          <div>
            <div class="fw-extrabold text-dark mb-1" style="font-size: 1.1rem;">Monthly Cycle (2nd – Today)</div>
            <div class="d-flex align-items-center gap-3 mt-2">
              <div class="small fw-semibold text-muted bg-white px-3 py-1 rounded-pill shadow-sm"><i class="bi bi-person-check-fill text-success me-1"></i> ${data.present_days} Active</div>
              <div class="small fw-semibold text-muted bg-white px-3 py-1 rounded-pill shadow-sm"><i class="bi bi-calendar-event me-1"></i> ${data.effective_working_days} Required</div>
            </div>
            <div class="small fw-medium mt-2" style="color:#64748b; font-size: 0.75rem;"><i class="bi bi-clock-history me-1"></i> Range: ${from} – ${to}</div>
          </div>
        </div>`;
    }

    if (overallRes.ok) {
      const ov = await overallRes.json();
      const opct = ov.percentage;
      const ofrom = new Date(ov.from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
      const oto = new Date(ov.to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
      const oisGood = opct >= 75;
      const oisOk = opct >= 50 && opct < 75;
      const ocolor = oisGood ? '#3b82f6' : oisOk ? '#f59e0b' : '#ef4444';
      const obgGrade = oisGood ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(59, 130, 246, 0.05))' : oisOk ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(245, 158, 11, 0.05))' : 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.05))';
      
      html += `
        <div class="d-flex align-items-center p-4 rounded-4 shadow-sm border border-white" style="background: ${obgGrade}; backdrop-filter: blur(10px);">
          <div class="d-flex flex-column align-items-center justify-content-center me-4 pe-4 border-end border-opacity-25" style="border-color: ${ocolor} !important;">
            <div class="fw-black" style="font-size: 2.8rem; line-height: 1; color: ${ocolor};">${opct}%</div>
            <div class="small fw-bold mt-1 text-uppercase" style="letter-spacing: 1px; color: ${ocolor}; opacity: 0.8;">Lifetime</div>
          </div>
          <div>
            <div class="fw-extrabold text-dark mb-1" style="font-size: 1.1rem;">Overall Telemetry (Since Joining)</div>
            <div class="d-flex align-items-center gap-3 mt-2">
              <div class="small fw-semibold text-muted bg-white px-3 py-1 rounded-pill shadow-sm"><i class="bi bi-person-check-fill text-success me-1"></i> ${ov.present_days} Active</div>
              <div class="small fw-semibold text-muted bg-white px-3 py-1 rounded-pill shadow-sm"><i class="bi bi-calendar-event me-1"></i> ${ov.effective_working_days} Required</div>
            </div>
            <div class="small fw-medium mt-2" style="color:#64748b; font-size: 0.75rem;"><i class="bi bi-clock-history me-1"></i> Range: ${ofrom} – ${oto}</div>
          </div>
        </div>`;
    }

    // Wrap the html in a grid layout to make them side-by-side if screen wide enough
    if (html !== '') {
      html = `<div class="d-flex flex-column gap-1">${html}</div>`;
    }

    container.innerHTML = html;
    container.style.display = 'block';
  } catch (err) {
    console.error('Attendance percentage error:', err);
  }
}

/* ================= NOTIFICATIONS ================= */

async function loadNotifications() {
  try {
    const res = await fetch(`${API_BASE}/api/notifications/my-notifications`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const notifs = await res.json();
    const list = document.getElementById("notifList");
    const badge = document.getElementById("notifBadge");

    if (!Array.isArray(notifs)) {
      console.error("Notifications response is not an array:", notifs);
      return;
    }

    const unread = notifs.filter(n => !n.is_read);

    // Update badge
    if (unread.length > 0) {
      badge.style.display = "flex";
      badge.textContent = unread.length > 9 ? "9+" : unread.length;
    } else {
      badge.style.display = "none";
    }

    // Render list
    if (notifs.length === 0) {
      list.innerHTML = `<div class="notif-empty">No notifications yet</div>`;
      return;
    }

    list.innerHTML = notifs.map(n => `
      <div class="notif-item ${n.is_read ? "" : "unread"}"
           data-id="${n.id}"
           onclick="markOneRead(event, ${n.id}, this)">
        <div>${n.message}</div>
        <div class="notif-time">${new Date(n.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div>
      </div>
    `).join("");

  } catch (err) {
    console.error("Load notifications error:", err);
  }
}

function toggleNotifDropdown() {
  const dropdown = document.getElementById("notifDropdown");
  dropdown.classList.toggle("open");
}

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
  const bell = document.getElementById("notifBell");
  if (bell && !bell.contains(e.target)) {
    document.getElementById("notifDropdown").classList.remove("open");
  }
});

async function markOneRead(e, id, el) {
  e.stopPropagation();
  if (!el.classList.contains("unread")) return;

  try {
    await fetch(`${API_BASE}/api/notifications/${id}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` }
    });
    el.classList.remove("unread");
    loadNotifications(); // refresh badge
  } catch (err) {
    console.error("Mark read error:", err);
  }
}

async function markAllRead(e) {
  e.stopPropagation();
  try {
    await fetch(`${API_BASE}/api/notifications/mark-all-read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` }
    });
    loadNotifications();
  } catch (err) {
    console.error("Mark all read error:", err);
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

/* ================= MISSED CHECKOUT SUBMISSION ================= */
async function submitMissedCheckout() {
  const mcId = document.getElementById("mcId").value;
  const workDone = document.getElementById("mcWorkDone").value.trim();
  const lateReason = document.getElementById("mcLateReason").value.trim();
  const msgDiv = document.getElementById("mcMessage");

  if (!workDone || lateReason === "") {
    showStatus("Please fill both fields.", "error", msgDiv);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/work/submit-missed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ id: mcId, work_done: workDone, late_reason: lateReason })
    });

    const data = await res.json();

    if (!res.ok) {
      showStatus(data.message || "Submission failed", "error", msgDiv);
      return;
    }

    showStatus("Compliance report submitted", "success", msgDiv);

    setTimeout(() => {
      // Hide modal
      if (missedCheckoutModalInstance) missedCheckoutModalInstance.hide();
      document.getElementById("mcWorkDone").value = "";
      document.getElementById("mcLateReason").value = "";
      // Refresh to see if there are more
      checkPendingMissed();
      loadMyWorkReports();
    }, 1500);

  } catch (err) {
    console.error("Submit missed checkout error:", err);
    showStatus("Submission failed", "error", msgDiv);
  }
}
