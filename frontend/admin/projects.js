const API_BASE = "https://nexus-logbook-updated.vercel.app";
const token = localStorage.getItem("token");

if (!token) {
  AppDialog.alert({
    title: "Session Expired",
    message: "Unauthorized"
  }).finally(() => {
    window.location.href = "../index.html";
  });
  throw new Error("Missing auth token");
}

const table = document.getElementById("projectsTable");
let allProjects = [];
let currentFilter = "all";

/* ================= LOAD PROJECTS ================= */
async function loadProjects() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/projects`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    allProjects = await res.json();
    updateStats();
    renderProjects();

  } catch (err) {
    console.error("Load projects error:", err);
    table.innerHTML = `
      <tr>
        <td colspan="7" class="text-danger text-center py-4">Error loading projects</td>
      </tr>`;
  }
}

/* ================= UPDATE STAT CARDS ================= */
function updateStats() {
  const ongoing = allProjects.filter(p => p.status !== "COMPLETED");
  const completed = allProjects.filter(p => p.status === "COMPLETED");
  const totalMembers = allProjects.reduce((sum, p) => sum + (p.member_count || 0), 0);

  document.getElementById("totalProjectsCount").textContent = allProjects.length;
  document.getElementById("ongoingCount").textContent = ongoing.length;
  document.getElementById("completedCount").textContent = completed.length;
  document.getElementById("totalMembersAssigned").textContent = totalMembers;
}

/* ================= FILTER PROJECTS ================= */
function filterProjects(filter) {
  currentFilter = filter;

  // Update tab buttons
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  if (filter === "all") document.getElementById("tabAll").classList.add("active");
  else if (filter === "ongoing") document.getElementById("tabOngoing").classList.add("active");
  else document.getElementById("tabCompleted").classList.add("active");

  renderProjects();
}

/* ================= RENDER PROJECTS TABLE ================= */
function renderProjects() {
  let filtered = allProjects;

  if (currentFilter === "ongoing") {
    filtered = allProjects.filter(p => p.status !== "COMPLETED");
  } else if (currentFilter === "completed") {
    filtered = allProjects.filter(p => p.status === "COMPLETED");
  }

  table.innerHTML = "";

  if (filtered.length === 0) {
    table.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-5">
          <i class="bi bi-folder2-open fs-3 d-block mb-2"></i>
          No ${currentFilter === "all" ? "" : currentFilter} projects found
        </td>
      </tr>`;
    return;
  }

  filtered.forEach(p => {
    const isCompleted = p.status === "COMPLETED";
    const progress = p.total_steps > 0
      ? Math.round((p.completed_steps / p.total_steps) * 100)
      : 0;

    const progressColor = isCompleted
      ? "#00875a"
      : progress >= 75
        ? "#00875a"
        : progress >= 40
          ? "#ffab00"
          : "#de350b";

    const statusBadge = isCompleted
      ? `<span class="badge bg-success">COMPLETED</span>`
      : `<span class="badge bg-primary">ONGOING</span>`;

    const createdDate = p.created_at
      ? new Date(p.created_at).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      })
      : "—";

    const tr = document.createElement("tr");
    if (isCompleted) tr.style.opacity = "0.7";

    tr.innerHTML = `
      <td>
        <div class="fw-bold">${p.project_name}</div>
        ${p.description ? `<div class="text-muted small" style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${p.description}</div>` : ''}
      </td>
      <td>
        ${p.team_lead_name
        ? `<span class="fw-semibold">${p.team_lead_name}</span>
             <div class="text-muted small">${p.team_lead_code || ''}</div>`
        : `<span class="text-muted">—</span>`
      }
      </td>
      <td>
        <span class="fw-bold">${p.member_count}</span>
        <span class="text-muted small">member${p.member_count !== 1 ? 's' : ''}</span>
      </td>
      <td>
        <div class="d-flex align-items-center gap-2">
          <div class="progress-mini flex-grow-1">
            <div class="progress-mini-bar" style="width:${progress}%; background:${progressColor};"></div>
          </div>
          <span class="fw-bold small" style="min-width:35px;">${progress}%</span>
        </div>
        <div class="text-muted small mt-1">${p.completed_steps}/${p.total_steps} steps</div>
      </td>
      <td>${statusBadge}</td>
      <td><span class="small text-muted">${createdDate}</span></td>
      <td>
        <div class="d-flex gap-1">
          <button class="btn-sys btn-sys-default border" style="font-size:11px; padding:3px 10px;"
            onclick="viewMembers(${p.id})">
            <i class="bi bi-people"></i> Members
          </button>
          <button class="btn-sys btn-sys-danger" style="font-size:11px; padding:3px 10px;"
            onclick="deleteProject(${p.id})">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    `;

    table.appendChild(tr);
  });
}

/* ================= VIEW PROJECT MEMBERS ================= */
async function viewMembers(projectId) {
  window.location.href = `project-members.html?projectId=${projectId}`;
}

/* ================= DELETE PROJECT ================= */
async function deleteProject(projectId) {
  const pass = await AppDialog.prompt({
    title: "Delete Project",
    message: "Enter admin password to delete this project.\n\nThis will remove all members and roadmap data.",
    placeholder: "Enter admin password",
    inputType: "password",
    confirmText: "Delete",
    intent: "danger"
  });
  if (pass !== "admin123") {
    if (pass !== null) {
      await AppDialog.alert({
        title: "Incorrect Password",
        message: "Incorrect password!",
        intent: "danger"
      });
    }
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/admin/projects/${projectId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || "Delete failed");
      return;
    }

    alert("Project deleted successfully");
    loadProjects();

  } catch (err) {
    console.error("Delete project error:", err);
    alert("Failed to delete project");
  }
}

/* ================= LOGOUT ================= */
function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  window.location.href = "../index.html";
}

/* ================= EXPORT PROJECTS EXCEL ================= */
async function exportProjectsExcel() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/projects/export/excel`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      alert("Export failed");
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "projects_report.xlsx";
    a.click();
    URL.revokeObjectURL(url);

  } catch (err) {
    console.error("Export error:", err);
    alert("Failed to export projects");
  }
}

/* ================= INIT ================= */
loadProjects();
