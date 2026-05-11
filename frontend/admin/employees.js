const API_BASE = ["", "localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://127.0.0.1:5000"
  : "https://nexus-logbook-updated.vercel.app";
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

const tableBody = document.getElementById("employeesTable");
let shiftsCache = [];
let allEmployees = [];
let pauseTargetId = null;


/* ================= LOAD SHIFTS ================= */
async function loadShifts() {
  const res = await fetch(`${API_BASE}/api/admin/shifts`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  shiftsCache = await res.json();
}

/* ================= LOAD EMPLOYEES ================= */
async function loadEmployees() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/team-members`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    allEmployees = await res.json();
    filterEmployees();

  } catch (err) {
    console.error(err);
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-danger text-center">Error loading employees</td>
      </tr>`;
  }
}

/* ================= FILTER EMPLOYEES ================= */
function filterEmployees() {
  const searchText = (document.getElementById("searchInput")?.value || "").toLowerCase().trim();
  const roleFilter = document.getElementById("roleFilter")?.value || "";
  const statusFilter = document.getElementById("statusFilter")?.value || "";

  let filtered = allEmployees;

  if (searchText) {
    filtered = filtered.filter(u =>
      u.name.toLowerCase().includes(searchText) ||
      (u.user_id && u.user_id.toLowerCase().includes(searchText))
    );
  }

  if (roleFilter) {
    filtered = filtered.filter(u => u.role === roleFilter);
  }

  if (statusFilter === "assigned") {
    filtered = filtered.filter(u => u.is_assigned);
  } else if (statusFilter === "free") {
    filtered = filtered.filter(u => !u.is_assigned);
  } else if (statusFilter === "paused") {
    filtered = filtered.filter(u => u.status === "PAUSED");
  }

  renderEmployees(filtered);
}

/* ================= RENDER EMPLOYEES ================= */
function renderEmployees(users) {
  tableBody.innerHTML = "";

  if (users.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted">No employees found</td>
      </tr>`;
    return;
  }

  users.forEach(user => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${user.user_id}</td>
      <td>${user.name}</td>
      <td>${user.email}</td>
      <td>
        <span class="badge ${user.role === "TEAM_LEAD" ? "bg-primary" : "bg-secondary"}">
          ${user.role}
        </span>
      </td>
      <td>
        <span class="badge bg-${user.is_assigned ? "warning" : "success"}">
          ${user.is_assigned ? "Assigned" : "Free"}
        </span>
      </td>
      <td>
        <span class="badge bg-${user.status === "PAUSED" ? "danger" : "info"}">
          ${user.status || "ACTIVE"}
        </span>
      </td>
      <td>
        ${renderShiftDropdown(user)}
      </td>
      <td>
        <div class="d-flex gap-2">
          <button
            class="btn btn-sm btn-primary"
            onclick="openMessageModal(${user.id}, '${user.name.replace(/'/g, "\\'")}')">
            Message
          </button>
          <button
            class="btn btn-sm ${user.status === "PAUSED" ? "btn-success" : "btn-warning"}"
            onclick="toggleMemberStatus(${user.id}, '${user.status || "ACTIVE"}')">
            ${user.status === "PAUSED" ? "Unpause" : "Pause"}
          </button>
          <button
            class="btn btn-sm btn-danger"
            ${user.is_assigned ? "disabled" : ""}
            onclick="deleteUser(${user.id}, '${user.role}')">
            Delete
          </button>
        </div>
      </td>
    `;

    tableBody.appendChild(tr);
  });
}

/* ================= SHIFT DROPDOWN ================= */
function renderShiftDropdown(user) {
  if (shiftsCache.length === 0) {
    return `<span class="text-muted">Shifts disabled</span>`;
  }

  let options = `<option value="">No Shift</option>`;

  shiftsCache.forEach(s => {
    options += `
      <option value="${s.id}" ${s.id === user.shift_id ? "selected" : ""}>
        ${s.name} (${s.check_in_time} - ${s.check_out_time})
      </option>`;
  });

  return `
    <select class="form-select form-select-sm"
      onchange="assignShift(${user.id}, this.value)">
      ${options}
    </select>`;
}


/* ================= ASSIGN SHIFT ================= */
async function assignShift(userId, shiftId) {
  if (!shiftId) return;

  const res = await fetch(`${API_BASE}/api/admin/assign-shift`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ user_id: userId, shift_id: shiftId })
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.message || "Shift assignment failed");
    return;
  }

  alert("Shift assigned successfully");
}

/* ================= DELETE USER ================= */
async function deleteUser(userId, role) {
  const roleLabel = role === "MEMBER" ? "member" : "team lead";
  const adminPassword = await AppDialog.prompt({
    title: `Delete ${role === "MEMBER" ? "Member" : "Team Lead"}`,
    message: `Enter admin password to delete this ${roleLabel}:`,
    placeholder: "Enter admin password",
    inputType: "password",
    confirmText: "Delete",
    intent: "danger"
  });
  if (adminPassword === null) return;

  if (!adminPassword.trim()) {
    await AppDialog.alert({
      title: "Password Required",
      message: "Admin password is required",
      intent: "danger"
    });
    return;
  }

  let url =
    role === "MEMBER"
      ? `${API_BASE}/api/admin/team-member/${userId}`
      : `${API_BASE}/api/admin/team-lead/${userId}`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ admin_password: adminPassword })
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.message);
    return;
  }

  alert(data.message);
  loadEmployees();
}

/* ================= LOGOUT ================= */
function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  window.location.href = "../index.html";
}

/* ================= EXPORT EMPLOYEES EXCEL ================= */
async function exportEmployeesExcel() {
  try {
    const status = document.getElementById("statusFilter")?.value || "";
    const role = document.getElementById("roleFilter")?.value || "";
    const search = document.getElementById("searchInput")?.value?.trim() || "";
    let exportUrl = `${API_BASE}/api/admin/team-members/export/excel?status=${status}&role=${role}&search=${encodeURIComponent(search)}`;
    const res = await fetch(exportUrl, {
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
    a.download = "employees_report.xlsx";
    a.click();
    URL.revokeObjectURL(url);

  } catch (err) {
    console.error("Export error:", err);
    alert("Failed to export employees");
  }
}

/* ================= SEND PERSONAL MESSAGE ================= */
let messageModal;

function openMessageModal(userId, userName) {
  document.getElementById("messageUserId").value = userId;
  document.getElementById("messageModalLabel").innerText = `Message to ${userName}`;
  document.getElementById("messageText").value = "";

  if (!messageModal) {
    messageModal = new bootstrap.Modal(document.getElementById("messageModal"));
  }
  messageModal.show();
}

document.getElementById("sendMessageForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const userId = document.getElementById("messageUserId").value;
  const message = document.getElementById("messageText").value;
  const btn = e.target.querySelector("button[type='submit']");
  const originalText = btn.innerHTML;

  btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Sending...`;
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/admin/send-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ userId, message })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to send message");

    alert("Message sent successfully!");
    messageModal.hide();
  } catch (err) {
    console.error("Send message error:", err);
    alert(err.message);
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
});

/* ================= TOGGLE MEMBER STATUS ================= */
async function toggleMemberStatus(userId, currentStatus) {
  if (currentStatus === "PAUSED") {
    // Unpause directly
    const confirmMsg = "Are you sure you want to UNPAUSE this member?";
    const confirmed = await AppDialog.confirm({
      title: "Unpause Member",
      message: confirmMsg,
      confirmText: "Unpause"
    });
    if (!confirmed) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/team-member/${userId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: "ACTIVE" })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update status");
      alert(data.message);
      loadEmployees();
    } catch (err) {
      console.error("Toggle status error:", err);
      alert(err.message);
    }
  } else {
    // Pause: open modal to select dates
    pauseTargetId = userId;
    // Reset modal fields
    document.getElementById("pauseStart").value = "";
    document.getElementById("pauseEnd").value = "";
    const pauseModal = new bootstrap.Modal(document.getElementById("pauseModal"));
    pauseModal.show();
  }
}

// Handle pause form submission
document.getElementById("pauseForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const start = document.getElementById("pauseStart").value;
  const end = document.getElementById("pauseEnd").value;
  if (!pauseTargetId || !start || !end) {
    alert("Please select dates and a member to pause.");
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/api/admin/team-member/${pauseTargetId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status: "PAUSED", start_date: start, end_date: end })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to pause member");
    alert(data.message);
    // Hide modal
    const modalElement = document.getElementById("pauseModal");
    const modalInstance = bootstrap.Modal.getInstance(modalElement);
    modalInstance.hide();
    loadEmployees();
  } catch (err) {
    console.error("Pause error:", err);
    alert(err.message);
  }
});


/* ================= INIT ================= */
(async function init() {
  await loadShifts();
  loadEmployees();
})();
