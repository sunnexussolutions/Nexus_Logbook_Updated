const API_BASE = "http://localhost:5000";
const token = localStorage.getItem("token");
if (!token) {
  alert("Please login again");
  window.location.href = "../login.html";
}

console.log("🔥 Lead Dashboard Loaded");

/* ================= DOM ================= */
const projectsList = document.getElementById("projectsList");
const roadmapSection = document.getElementById("roadmapSection");
const roadmapSteps = document.getElementById("roadmapSteps");
const progressBar = document.getElementById("progressBar");

const statusText = document.getElementById("statusText");
const checkInBtn = document.getElementById("checkInBtn");
const checkOutBtn = document.getElementById("checkOutBtn");
const messageDiv = document.getElementById("message");
const leadProjectTitle = document.getElementById("leadProjectTitle");

/* --- PREMIUM STATUS SYSTEM --- */
function showStatus(message, type = "info", target = messageDiv) {
  if (!target) return;
  const icons = {
    info: "bi-info-circle-fill",
    success: "bi-patch-check-fill",
    error: "bi-exclamation-octagon-fill",
    warning: "bi-exclamation-triangle-fill"
  };
  target.innerHTML = `
    <div class="status-pill ${type}">
      <i class="bi ${icons[type] || icons.info}"></i>
      <span>${message}</span>
    </div>
  `;
  setTimeout(() => { target.innerHTML = ""; }, 5000);
}


/***********************
 * TEAM LEAD LOAD ROADMAP
 ***********************/
async function loadRoadmap(projectId) {
  const section = document.getElementById("roadmapSection");
  const emptyState = document.getElementById("roadmapEmptyState");
  const stepsList = document.getElementById("roadmapSteps");
  const progressCircle = document.getElementById("roadmapProgressCircle");
  const progressText = document.getElementById("roadmapProgressText");
  const compBadge = document.getElementById("completedNodesCount");
  const totalBadge = document.getElementById("totalNodesCount");
  const titleDisplay = document.getElementById("activeProjectTitle");

  try {
    const res = await fetch(`${API_BASE}/api/admin/roadmap/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Failed to load roadmap");

    const data = await res.json();
    
    if (section) section.style.display = "block";
    if (emptyState) emptyState.style.display = "none";
    if (stepsList) stepsList.innerHTML = "";
    if (titleDisplay) titleDisplay.textContent = data.project_name || "Project Nodes";

    const total = data.steps ? data.steps.length : 0;
    const completed = data.steps ? data.steps.filter(s => s.is_completed).length : 0;
    const progress = total === 0 ? 0 : Math.round((completed / total) * 100);

    // Update Progress Circle (Circumference ~264)
    if (progressCircle) {
      const offset = 264 - (progress / 100) * 264;
      progressCircle.style.strokeDashoffset = offset;
    }
    if (progressText) progressText.textContent = progress + "%";
    if (compBadge) compBadge.textContent = `${completed} Done`;
    if (totalBadge) totalBadge.textContent = `${total} Total`;

    if (!data.steps || data.steps.length === 0) {
      stepsList.innerHTML = `<div class="text-center py-5 text-muted small">No strategic nodes configured.</div>`;
      return;
    }

    data.steps.forEach((step) => {
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
                onchange="updateStep(${step.id}, this.checked, ${projectId})">
            </div>
            <div>
              <div class="fw-bold text-dark ${step.is_completed ? 'text-decoration-line-through opacity-75' : ''}" style="font-size: 14px;">
                ${step.step_title}
              </div>
              <div class="small text-muted" style="font-size: 11px;">
                ${step.is_completed ? `Cleared by ${step.updated_by || 'Unknown'}` : 'Pending Strategic Realization'}
              </div>
            </div>
          </div>
          <div class="d-flex align-items-center gap-2">
            ${step.is_completed ? '<i class="bi bi-patch-check-fill text-success fs-5"></i>' : '<i class="bi bi-circle text-light fs-5"></i>'}
            <button class="btn btn-sm text-danger opacity-25 hover-opacity-100" onclick="deleteStep(${step.id}, ${projectId})">
              <i class="bi bi-trash-fill"></i>
            </button>
          </div>
        </div>
      `;
      stepsList.appendChild(item);
    });

  } catch (err) {
    console.error(err);
    showStatus("Failed to synchronize roadmap", "error");
  }
}

/* ================= UPDATE ROADMAP STEP ================= */
async function updateStep(stepId, isCompleted, projectId) {
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

  loadRoadmap(projectId);
}

// ================= DELETE ROADMAP STEP ================= */
async function deleteStep(stepId, projectId) {
  if (!confirm("Are you sure you want to delete this step?")) return;

  try {
    const res = await fetch(`${API_BASE}/api/admin/roadmap-step/${stepId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error("Failed to delete step");

    // Reload roadmap
    loadRoadmap(projectId);
  } catch (err) {
    console.error(err);
    alert("Failed to delete step");
  }
}

// ================= ADD SINGLE ROADMAP STEP ================= */
async function addSingleStep() {
  if (!selectedProjectId) return;

  const input = document.getElementById("newStepInput");
  const stepTitle = input.value.trim();

  if (!stepTitle) return;

  try {
    const res = await fetch(`${API_BASE}/api/admin/roadmap-step/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        project_id: selectedProjectId,
        step_title: stepTitle
      })
    });

    if (!res.ok) throw new Error("Failed to add step");

    input.value = "";
    loadRoadmap(selectedProjectId);
  } catch (err) {
    console.error(err);
    alert("Failed to add step");
  }
}



/* ================= ATTENDANCE ================= */
async function loadMyStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/attendance/my-status`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    statusText.innerText = `Status: ${data.status}`;

    checkInBtn.disabled = data.status !== "ABSENT";
    checkOutBtn.disabled = data.status !== "CHECKED_IN";

  } catch (err) {
    console.error("Status load error:", err);
  }
}

/* ================= MY ATTENDANCE PERCENTAGE (2nd of month) ================= */
async function loadMyAttendancePercentage() {
  try {
    const res = await fetch(`${API_BASE}/api/attendance/my-percentage`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();

    const container = document.getElementById('attendancePercentageContainer');
    if (!container) return;

    const pct = data.percentage ?? 0;
    const color = pct >= 75 ? '#15803d' : pct >= 50 ? '#b45309' : '#dc2626';
    const from = data.from || '';
    const to = data.to || '';

    container.innerHTML = `
      <div style="display:flex; align-items:center; gap:14px; padding:10px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; margin-bottom:12px;">
        <div style="width:52px; height:52px; border-radius:50%; background:conic-gradient(${color} ${pct * 3.6}deg, #e2e8f0 0deg); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          <div style="width:38px; height:38px; border-radius:50%; background:#f8fafc; display:flex; align-items:center; justify-content:center;">
            <span style="font-size:0.78rem; font-weight:800; color:${color};">${pct}%</span>
          </div>
        </div>
        <div>
          <div style="font-weight:700; color:${color}; font-size:0.95rem;">Your Attendance (2nd – Today)</div>
          <div style="font-size:0.82rem; color:#64748b;">
            ${data.present_days} present / ${data.effective_working_days} working days
            &nbsp;·&nbsp; ${from} – ${to}
          </div>
        </div>
      </div>`;
    container.style.display = 'block';
  } catch (err) {
    console.error('Attendance percentage error:', err);
  }
}
checkInBtn.onclick = () => {

  if (!navigator.geolocation) {
    messageDiv.innerHTML =
      `<div class="alert alert-danger">Geolocation not supported</div>`;
    return;
  }

  checkInBtn.disabled = true;
  messageDiv.innerHTML =
    `<div class="alert alert-info">📡 Getting GPS location (wait a few seconds for best accuracy)...</div>`;

  let bestPosition = null;
  let readings = 0;
  let sent = false;  // guard to prevent double-calling sendLeadCheckIn

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      if (sent) return;
      readings++;
      const acc = position.coords.accuracy;
      console.log(`📍 GPS reading #${readings}: lat=${position.coords.latitude}, lon=${position.coords.longitude}, accuracy=${acc.toFixed(0)}m`);

      if (!bestPosition || acc < bestPosition.coords.accuracy) {
        bestPosition = position;
      }

      if (acc < 30) {
        sent = true;
        navigator.geolocation.clearWatch(watchId);
        sendLeadCheckIn(bestPosition);
      }
    },
    (error) => {
      if (sent) return;
      navigator.geolocation.clearWatch(watchId);
      console.error("📍 Geolocation error:", error.code, error.message);

      // Fallback: try getCurrentPosition as a last resort
      messageDiv.innerHTML =
        `<div class="alert alert-info">📡 Retrying location with fallback method...</div>`;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (sent) return;
          sent = true;
          sendLeadCheckIn(pos);
        },
        (err2) => {
          if (sent) return;
          checkInBtn.disabled = false;
          console.error("📍 Fallback geolocation error:", err2.code, err2.message);
          messageDiv.innerHTML =
            `<div class="alert alert-danger">Location error: ${err2.message || error.message || "Permission denied"}. Please enable location and try again.</div>`;
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
      sendLeadCheckIn(bestPosition);
    } else {
      // Last resort fallback: try single getCurrentPosition with relaxed settings
      messageDiv.innerHTML =
        `<div class="alert alert-info">📡 Still acquiring location, trying fallback...</div>`;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (sent) return;
          sent = true;
          sendLeadCheckIn(pos);
        },
        (err) => {
          if (sent) return;
          checkInBtn.disabled = false;
          messageDiv.innerHTML =
            `<div class="alert alert-danger">Could not get GPS location. Please ensure location is enabled, try outdoors, and try again.</div>`;
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
      );
    }
  }, 10000);
};

async function sendLeadCheckIn(position) {
  try {
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    const accuracy = position.coords.accuracy;

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
      if (res.status === 403 && data.message && data.message.includes('missed checkout')) {
        messageDiv.innerHTML = `
          <div class="status-pill error">
            <i class="bi bi-exclamation-octagon-fill"></i>
            <span>${data.message}</span>
          </div>
          <br><button class="btn btn-sm btn-warning mt-2 fw-bold rounded-pill" onclick="forceOpenMissedModal()">
            📝 Submit Missed Report Now
          </button>
        `;
      } else {
        showStatus(data.message, "error");
      }
      checkInBtn.disabled = false;
      return;
    }

    showStatus(data.message, "success");
    loadMyStatus();
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

checkOutBtn.onclick = async () => {
  checkOutBtn.disabled = true;
  checkOutBtn.textContent = "Processing...";
  try {
    const reportCheck = await fetch(`${API_BASE}/api/work/check-today`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const reportData = await reportCheck.json();

    if (!reportData.submitted) {
      showStatus("⚠️ Please submit your daily work report before checking out.", "warning");
      checkOutBtn.disabled = false;
      checkOutBtn.textContent = "Check Out";
      return;
    }

    const istWeekday = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", weekday: "short" });
    if (istWeekday === "Sat") {
      const weeklyCheck = await fetch(`${API_BASE}/api/work/check-weekly`, { headers: { Authorization: `Bearer ${token}` } });
      const weeklyData = await weeklyCheck.json();
      if (!weeklyData.submitted) {
        showStatus("Saturday checkout is blocked until you submit this week's weekly report.", "warning");
        checkOutBtn.disabled = false;
        checkOutBtn.textContent = "Check Out";
        return;
      }
    }

    const res = await fetch(`${API_BASE}/api/attendance/check-out`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();

    if (!res.ok) {
      showStatus(data.message, "error");
      checkOutBtn.disabled = false;
      checkOutBtn.textContent = "Check Out";
      return;
    }

    showStatus(data.message, "success");
    loadMyStatus();
    loadMyAttendanceHistory();
    updateCheckoutBanner();

  } catch (err) {
    console.error("Checkout error:", err);
    showStatus("Checkout failed", "error");
    checkOutBtn.disabled = false;
    checkOutBtn.textContent = "Check Out";
  }
};

/* ================= LOGOUT ================= */
function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  window.location.href = "../index.html";
}

/* ================= INIT ================= */
//loadProjects();
//loadMyStatus();
let selectedProjectId = null;

async function loadProjects() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/my-projects`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Failed to load projects");

    const projects = await res.json();
    const list = document.getElementById("projectsList");
    const select = document.getElementById("assignProjectSelect");

    if (list) list.innerHTML = "";
    if (select) select.innerHTML = `<option value="">Select Project</option>`;

    if (!projects.length) {
      if (list) list.innerHTML = `<div class="p-5 text-center text-muted small">No projects currently indexed.</div>`;
      return;
    }

    projects.forEach(p => {
      const isCompleted = p.status === 'COMPLETED';

      const item = document.createElement("div");
      item.className = "list-group-item list-group-item-action p-3 border-0 border-bottom d-flex justify-content-between align-items-center";
      item.style.cursor = isCompleted ? 'default' : 'pointer';

      item.innerHTML = `
        <div class="d-flex align-items-center gap-3">
          <div class="rounded-4 bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center" style="width: 44px; height: 44px; font-weight: 800;">
            ${p.project_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div class="fw-bold text-dark fs-6">${p.project_name}</div>
            <span class="badge ${isCompleted ? 'bg-success-subtle text-success' : 'bg-primary-subtle text-primary'} mt-1" style="font-size: 9px; letter-spacing: 0.5px;">
              ${isCompleted ? 'ARCHIVED' : 'ACTIVE OPS'}
            </span>
          </div>
        </div>
        ${!isCompleted ? '<i class="bi bi-chevron-right text-muted opacity-25"></i>' : ''}
      `;

      if (!isCompleted) {
        item.onclick = () => {
          selectedProjectId = p.id;
          // Set Project Title in UI
          const titleBadge = document.getElementById("activeProjectTitle");
          if (titleBadge) titleBadge.textContent = p.project_name;
          if (leadProjectTitle) leadProjectTitle.textContent = p.project_name;
          
          loadRoadmap(p.id);
        };
        
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.project_name;
        if (select) select.appendChild(opt);
      }

      if (list) list.appendChild(item);
    });
  } catch (err) {
    console.error("loadProjects failed:", err);
  }
}

// ================= COMPLETE PROJECT =================
async function completeProject(projectId, projectName) {
  if (!confirm(`Are you sure you want to mark "${projectName}" as COMPLETED?\n\nThis will release all assigned members.`)) return;

  try {
    const res = await fetch(`${API_BASE}/api/admin/projects/${projectId}/complete`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || "Failed to complete project");
      return;
    }

    alert("✅ " + data.message);
    loadProjects();

    // Clear roadmap section if this was the selected project
    if (selectedProjectId === projectId) {
      selectedProjectId = null;
      document.getElementById("roadmapSection").style.display = "none";
    }

  } catch (err) {
    console.error("Complete project error:", err);
    alert("Failed to complete project");
  }
}

async function markProjectCompleted() {
  if (!selectedProjectId) {
    alert("Please select a project first.");
    return;
  }
  const title = document.getElementById("activeProjectTitle")?.textContent || "this project";
  await completeProject(selectedProjectId, title);
}


/***********************
 * TEAM LEAD LOAD MEMBERS (PER PROJECT)
 ***********************/
async function loadMembers() {
  try {
    const res = await fetch(
      `${API_BASE}/api/admin/lead/members`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!res.ok) {
      throw new Error("Failed to load members");
    }

    const members = await res.json();

    const container = document.getElementById("membersList");
    container.innerHTML = "";

    if (!members || members.length === 0) {
      container.innerHTML =
        `<div class="text-muted text-center py-4"><i class="bi bi-people d-block fs-1 opacity-50 mb-2"></i>No members available</div>`;
      return;
    }

    members.forEach(member => {
      const div = document.createElement("div");
      div.className = "form-check mb-2 d-flex align-items-center p-3 bg-white border rounded shadow-sm transition-all";
      div.style.transition = "all 0.2s ease";
      div.onmouseenter = () => { div.style.transform = "translateY(-1px)"; div.style.boxShadow = "0 4px 6px rgba(0,0,0,0.05)"; };
      div.onmouseleave = () => { div.style.transform = "none"; div.style.boxShadow = "0 1px 2px rgba(0,0,0,0.05)"; };

      div.innerHTML = `
        <input
          class="form-check-input fs-5 me-3"
          type="checkbox"
          value="${member.id}"
          id="member_${member.id}"
          style="cursor: pointer; margin-top: 0;"
        />
        <label class="form-check-label d-flex align-items-center flex-grow-1" for="member_${member.id}" style="cursor: pointer;">
          <div class="rounded-circle bg-primary-subtle text-primary d-flex align-items-center justify-content-center me-3" style="width: 36px; height: 36px; font-weight: bold;">
            ${member.name.charAt(0).toUpperCase()}
          </div>
          <div class="d-flex flex-column">
            <span class="fw-bold text-dark fs-6">${member.name}</span>
            <span class="small text-muted" style="font-size: 11px; letter-spacing: 0.5px;">ID: ${member.user_id}</span>
          </div>
        </label>
      `;

      container.appendChild(div);
    });

    // Add change listener to project select to auto-check assigned members
    const projSelect = document.getElementById("assignProjectSelect");
    if (projSelect) {
      projSelect.addEventListener("change", async (e) => {
        const pId = e.target.value;
        const checkboxes = document.querySelectorAll("#membersList input[type='checkbox']");

        // Reset all checkboxes
        checkboxes.forEach(cb => cb.checked = false);

        if (!pId) return;

        try {
          // Fetch existing members for this project
          const res = await fetch(`${API_BASE}/api/admin/project-members/${pId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!res.ok) throw new Error("Failed to fetch project members");

          const assignedMembers = await res.json();
          // Check the boxes for currently assigned members
          assignedMembers.forEach(m => {
            const cb = document.getElementById(`member_${m.id}`);
            if (cb) cb.checked = true;
          });
        } catch (err) {
          console.error("Auto-check members error:", err);
        }
      });
    }

  } catch (err) {
    console.error("loadMembers error:", err);
    alert("Unable to load members");
  }
}


async function assignMembers() {
  const projectId = document.getElementById("assignProjectSelect").value;

  if (!projectId) {
    alert("Select a project");
    return;
  }

  const checked = document.querySelectorAll(
    "#membersList input:checked"
  );

  const member_ids = Array.from(checked).map(cb => Number(cb.value));

  if (member_ids.length === 0) {
    alert("Select at least one member");
    return;
  }

  const res = await fetch(`${API_BASE}/api/admin/assign-members`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      project_id: projectId,
      member_ids
    })
  });

  const data = await res.json();

  const msgEl = document.getElementById("assignMessage");
  msgEl.innerHTML = `<div class="alert alert-success">${data.message}</div>`;
  setTimeout(() => { msgEl.innerHTML = ""; }, 3000);

  // Reload roadmap if a project is currently selected
  if (selectedProjectId) loadRoadmap(selectedProjectId);
}

//loadMembers();
async function createRoadmap() {
  if (!selectedProjectId) {
    alert("Select a project first");
    return;
  }

  const text = document.getElementById("roadmapStepsInput").value;

  const steps = text
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);

  if (steps.length === 0) {
    alert("Enter at least one roadmap step");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/admin/create-roadmap`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        project_id: selectedProjectId,
        steps
      })
    }
    );

    const data = await res.json();

    document.getElementById("roadmapMessage").innerHTML =
      `<div class="alert alert-success">${data.message}</div>`;

    // Reload roadmap after creation
    loadRoadmap(selectedProjectId);

  } catch (err) {
    alert("Failed to create roadmap");
    console.error(err);
  }
}


async function submitLeadDailyReport() {
  const text = document.getElementById("leadWorkDone").value.trim();
  const msg = document.getElementById("leadWorkMessage");
  
  if (!text) {
    showStatus("Deployment log cannot be empty", "warning", msg);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/work/daily`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ work_done: text })
    });

    const data = await res.json();
    if (!res.ok) {
      showStatus(data.message, "error", msg);
      return;
    }

    showStatus("Achievement committed to project core", "success", msg);
    document.getElementById("leadWorkDone").value = "";
    loadMyWorkReports();
    updateCheckoutBanner();
  } catch (err) {
    showStatus("Sync failure with project node", "error", msg);
  }
}

/* ================= MY PROJECT PORTFOLIO STATS ================= */
async function loadMyProjectStats() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/my-project-stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Stats sync failed");

    const data = await res.json();
    const activeList = document.getElementById("activeProjectsList");
    const completedList = document.getElementById("completedProjectsList");
    const statusBadge = document.getElementById("myProjectStatusBadge");

    document.getElementById("activeProjectCount").textContent = data.active_count;
    document.getElementById("completedProjectCount").textContent = data.completed_count;
    document.getElementById("totalProjectCount").textContent = data.active_count + data.completed_count;

    if (statusBadge) {
      statusBadge.innerHTML = data.status === "FREE" 
        ? '<i class="bi bi-pause-circle me-2"></i> BENCH POOL' 
        : '<i class="bi bi-activity me-2"></i> OPERATIONAL';
    }

    const renderCard = (p) => `
      <div class="project-card h-100">
        <div class="project-header-top">
          <div class="project-icon-box bg-primary bg-opacity-10 text-primary">
            ${p.project_name.charAt(0).toUpperCase()}
          </div>
          <span class="badge ${p.status === 'COMPLETED' ? 'bg-success-subtle text-success' : 'bg-primary-subtle text-primary'} border-0 px-3 py-2 rounded-pill" style="font-size: 10px;">
            ${p.status}
          </span>
        </div>
        <div>
          <h6 class="fw-extrabold text-dark mb-1">${p.project_name}</h6>
          <div class="small text-muted fw-bold">ID: PRJ-${p.id.toString().padStart(3, '0')}</div>
        </div>
        <div class="stats-row">
          <div class="project-stat-pill">
            <span class="stat-pill-label">Execution Time</span>
            <span class="stat-pill-value">${p.days_elapsed || p.days_taken} Days</span>
          </div>
          <div class="project-stat-pill">
            <span class="stat-pill-label">Experts</span>
            <span class="stat-pill-value">${p.member_count || 1} Assigned</span>
          </div>
        </div>
        <div>
          <div class="d-flex justify-content-between mb-2">
            <span class="small fw-bold text-muted">Strategic Progress</span>
            <span class="small fw-extrabold text-primary">${p.progress || 0}%</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${p.progress || 0}%"></div>
          </div>
        </div>
      </div>
    `;

    if (activeList) {
      activeList.innerHTML = data.active_projects.length === 0 
        ? `<div class="p-4 text-center text-muted small w-100">No active deployments.</div>` 
        : data.active_projects.map(renderCard).join("");
    }
    
    if (completedList) {
      completedList.innerHTML = data.completed_projects.length === 0 
        ? `<div class="p-4 text-center text-muted small w-100">Legacy archive is empty.</div>` 
        : data.completed_projects.map(renderCard).join("");
    }

  } catch (err) {
    console.error("Project stats error:", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadProjects();
  loadMembers();
  loadMyStatus();
  loadMyAttendancePercentage();
  loadMyProjectStats();
  loadNotifications();
  setInterval(loadNotifications, 60000);
  loadMyLeaveBalance();
  loadMyLeaveRequests();
  loadMyWorkReports();
  loadMyWeeklyReports();
  checkWeeklyReportStatus();
  setWeekRangeLabel();
  updateCheckoutBanner();

  // Set month picker and auto-load attendance history
  const picker = document.getElementById("attendanceMonthPicker");
  if (picker) {
    picker.value = new Date().toISOString().slice(0, 7);
    loadMyAttendanceHistory();
  }

  // Enforce missed checkout report
  checkPendingMissed();
});

// Add this just below DOMContentLoaded
let missedCheckoutModalInstance = null;
async function checkPendingMissed() {
  try {
    const res = await fetch(`${API_BASE}/api/work/pending-missed`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;
    const pending = await res.json();
    if (pending && pending.length > 0) {
      openMissedModal(pending[0]);
    }
  } catch (err) {
    console.error("Pending missed check error:", err);
  }
}

function openMissedModal(mcData) {
  try {
    if (mcData) {
      document.getElementById("mcId").value = mcData.id;
      const fmtDate = new Date(mcData.date).toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      document.getElementById("mcDateText").innerText = fmtDate;
    }

    const modalEl = document.getElementById('missedCheckoutModal');
    if (!modalEl) {
      console.error("missedCheckoutModal element not found!");
      return;
    }

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
    alert("⚠️ You have a pending missed checkout report. Please refresh the page and submit it.");
  }
}

window.openMissedModal = openMissedModal;

window.forceOpenMissedModal = async function () {
  try {
    const res = await fetch(`${API_BASE}/api/work/pending-missed`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;
    const pending = await res.json();
    if (pending && pending.length > 0) {
      openMissedModal(pending[0]);
    }
  } catch (err) {
    console.error("Force open missed modal error:", err);
    alert("⚠️ Could not load missed checkout data. Please refresh the page.");
  }
};

/* ================= SUBMIT MISSED CHECKOUT ================= */
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

const LEAD_LIVE_REFRESH_MS = 15000;

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

function refreshLeadLiveData() {
  loadMyStatus();
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
    refreshLeadLiveData();
  }
}, LEAD_LIVE_REFRESH_MS);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    refreshLeadLiveData();
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
    msgDiv.innerHTML = `<div class="alert alert-danger">All weekly report fields are required</div>`;
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
      msgDiv.innerHTML = `<div class="alert alert-danger">${data.message}</div>`;
      return;
    }

    msgDiv.innerHTML = `<div class="alert alert-success">${data.message}</div>`;
    document.getElementById("weeklySkillsLearned").value = "";
    document.getElementById("weeklyProjectUpdate").value = "";
    document.getElementById("weeklyWorkDone").value = "";
    loadMyWeeklyReports();
    checkWeeklyReportStatus();

  } catch (err) {
    console.error("Weekly report error:", err);
    msgDiv.innerHTML = `<div class="alert alert-danger">Submission failed</div>`;
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
      const truncate = (text) => {
        if (!text) return "<span class='text-muted'>—</span>";
        return text.length > 80 ? text.slice(0, 80) + "…" : text;
      };
      return `
        <tr>
          <td class="ps-4">
            <div class="fw-bold text-dark">${ws} – ${we}</div>
            <div class="text-muted" style="font-size: 10px;">CYCLE NODE</div>
          </td>
          <td><span class="badge bg-primary-subtle text-primary border-0 rounded-pill px-3 py-2">${truncate(r.skills_learned)}</span></td>
          <td><div class="small fw-medium">${truncate(r.project_update)}</div></td>
          <td class="pe-4 text-muted small">${truncate(r.work_done)}</td>
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
      tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-3">No entries found</td></tr>`;
      countBadge.textContent = "0 Entries";
      return;
    }

    countBadge.textContent = `${reports.length} Entries`;

    tbody.innerHTML = reports.map(r => {
      const dateStr = new Date(r.report_date).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric", timeZone: "UTC"
      });
      const workText = r.work_done.length > 120 ? r.work_done.slice(0, 120) + "…" : r.work_done;
      return `
        <tr>
          <td class="ps-4">
             <div class="fw-bold text-dark">${dateStr}</div>
             <div class="text-muted" style="font-size: 10px;">DAILY REPORT</div>
          </td>
          <td class="fw-medium text-primary">${r.title || "Daily Report"}</td>
          <td class="pe-4 text-muted small">${workText}</td>
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

    const remPct = Math.round((remaining / quota) * 100);
    const pendPct = Math.round((pending / quota) * 100);
    const usedPct = Math.round((used / quota) * 100);

    const bar = document.getElementById("lbProgressBar");
    const pBar = document.getElementById("lbPendingBar");
    const uBar = document.getElementById("lbUsedBar");
    const uPct = document.getElementById("utilPct");

    if (bar) bar.style.width = `${remPct}%`;
    if (pBar) pBar.style.width = `${pendPct}%`;
    if (uBar) uBar.style.width = `${usedPct}%`;
    if (uPct) uPct.textContent = `${remPct}% Available Assets`;

  } catch (err) {
    console.error("Leave balance error:", err);
  }
}

/* ================= APPLY LEAVE ================= */
async function applyLeave() {
  const fromDate = document.getElementById("leaveFromDate").value;
  const toDate = document.getElementById("leaveToDate").value;
  const reason = document.getElementById("leaveReason").value.trim();
  const messageDiv = document.getElementById("leaveMessage");

  if (!fromDate || !toDate || !reason) {
    messageDiv.innerHTML =
      `<div class="alert alert-danger">All fields are required</div>`;
    return;
  }

  if (fromDate > toDate) {
    messageDiv.innerHTML =
      `<div class="alert alert-danger">From date cannot be after To date</div>`;
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
      messageDiv.innerHTML =
        `<div class="alert alert-danger">${data.message}</div>`;
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
    messageDiv.innerHTML =
      `<div class="alert alert-danger">Leave submission failed</div>`;
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
      const appliedOn = new Date(l.created_at).toLocaleDateString("en-IN", {
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
          <td class="ps-4">
             <div class="fw-bold text-dark">${appliedOn}</div>
             <div class="text-muted" style="font-size: 10px;">SUBMISSION_ID: ${l.id}</div>
          </td>
          <td>
             <div class="small fw-bold text-primary">${fromD} – ${toD}</div>
             <div class="text-muted" style="font-size: 10px;">DURATION NODE</div>
          </td>
          <td class="text-muted small">${l.reason}</td>
          <td class="pe-4">${statusBadge}</td>
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
  MISSED_CHECKOUT: { bg: "#fecaca", color: "#991b1b", label: "Missed Checkout ⚠️" },
};
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function loadMyAttendanceHistory() {
  const month = document.getElementById("attendanceMonthPicker").value;
  const tbody = document.getElementById("attendanceHistoryBody");
  const summaryBar = document.getElementById("attendanceSummaryBar");

  tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-3">Loading...</td></tr>`;

  try {
    const res = await fetch(`${API_BASE}/api/attendance/my-history?month=${month}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const records = await res.json();

    if (!records.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-3">No records for this month</td></tr>`;
      summaryBar.innerHTML = "";
      return;
    }

    const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, ON_LEAVE: 0, CHECKED_IN: 0, HOLIDAY: 0 };
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
        <tr>
          <td class="ps-4">
             <div class="fw-bold text-dark">${dateStr}</div>
             <div class="text-muted" style="font-size: 10px;">${dayName.toUpperCase()}</div>
          </td>
          <td><div class="small fw-medium">${fmtIST(r.check_in)}</div></td>
          <td><div class="small fw-medium">${fmtIST(r.check_out)}</div></td>
          <td><span style="background:${s.bg}; color:${s.color}; padding:4px 12px; border-radius:6px; font-size:0.75rem; font-weight:700;">${s.label}</span></td>
          <td><div class="text-muted small">${r.shift_name || "—"}</div></td>
          <td>${earlyBadge}</td>
          <td class="pe-4">${otBadge}</td>
        </tr>`;
    }).join("");

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

  } catch (err) {
    console.error("Attendance history error:", err);
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-3">Failed to load</td></tr>`;
  }
}

/* ================= ATTENDANCE PERCENTAGE CARD ================= */
async function loadMyAttendancePercentage() {
  try {
    const [monthRes, overallRes] = await Promise.all([
      fetch(`${API_BASE}/api/attendance/my-percentage`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_BASE}/api/attendance/my-overall-percentage`, { headers: { Authorization: `Bearer ${token}` } })
    ]);

    const container = document.getElementById('attendancePercentageCard');
    if (!container) return;

    let html = '';

    if (monthRes.ok) {
      const data = await monthRes.json();
      const pct = data.percentage;
      const from = new Date(data.from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
      const to = new Date(data.to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
      const color = pct >= 75 ? '#15803d' : pct >= 50 ? '#b45309' : '#dc2626';
      const bg = pct >= 75 ? '#dcfce7' : pct >= 50 ? '#fef3c7' : '#fee2e2';
      const emoji = pct >= 75 ? '🟢' : pct >= 50 ? '🟡' : '🔴';
      html += `
        <div style="background:${bg}; border:2px solid ${color}; border-radius:12px; padding:14px 20px; display:flex; align-items:center; gap:16px; flex-wrap:wrap; margin-bottom:8px;">
          <div style="font-size:2.2rem; font-weight:800; color:${color};">${emoji} ${pct}%</div>
          <div>
            <div style="font-weight:700; color:${color}; font-size:0.95rem;">Monthly Attendance (2nd – Today)</div>
            <div style="font-size:0.82rem; color:#64748b;">
              ${data.present_days} present / ${data.effective_working_days} working days
              &nbsp;·&nbsp; ${from} – ${to}
            </div>
          </div>
        </div>`;
    }

    if (overallRes.ok) {
      const ov = await overallRes.json();
      const opct = ov.percentage;
      const ofrom = new Date(ov.from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
      const oto = new Date(ov.to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
      const ocolor = opct >= 75 ? '#1d4ed8' : opct >= 50 ? '#b45309' : '#dc2626';
      const obg = opct >= 75 ? '#dbeafe' : opct >= 50 ? '#fef3c7' : '#fee2e2';
      const oemoji = opct >= 75 ? '🔵' : opct >= 50 ? '🟡' : '🔴';
      html += `
        <div style="background:${obg}; border:2px solid ${ocolor}; border-radius:12px; padding:14px 20px; display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
          <div style="font-size:2.2rem; font-weight:800; color:${ocolor};">${oemoji} ${opct}%</div>
          <div>
            <div style="font-weight:700; color:${ocolor}; font-size:0.95rem;">Overall Attendance (Since Joining)</div>
            <div style="font-size:0.82rem; color:#64748b;">
              ${ov.present_days} present / ${ov.effective_working_days} working days
              &nbsp;·&nbsp; ${ofrom} – ${oto}
            </div>
          </div>
        </div>`;
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

    const unread = notifs.filter(n => !n.is_read);

    if (unread.length > 0) {
      badge.style.display = "flex";
      badge.textContent = unread.length > 9 ? "9+" : unread.length;
    } else {
      badge.style.display = "none";
    }

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
  document.getElementById("notifDropdown").classList.toggle("open");
}

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
    loadNotifications();
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


