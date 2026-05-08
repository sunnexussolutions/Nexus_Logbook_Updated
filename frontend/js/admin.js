const API_BASE = "http://localhost:5000";

async function loadDashboard() {
  try {
    const token = localStorage.getItem("token");

    const res = await fetch(`${API_BASE}/api/admin/dashboard/summary`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      throw new Error("Failed to load dashboard");
    }

    const data = await res.json();

    document.getElementById("totalUsers").innerText = data.total_users;
    document.getElementById("present").innerText = data.present;
    document.getElementById("checkedIn").innerText = data.checked_in;
    document.getElementById("absent").innerText = data.absent;

  } catch (err) {
    console.error(err);
    alert("Dashboard load failed");
  }
}

loadDashboard();
