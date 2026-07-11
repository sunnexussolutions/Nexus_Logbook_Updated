const API_BASE = ["", "localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://127.0.0.1:5000"
  : "https://nexus-logbook-updated.vercel.app";

async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const errorEl = document.getElementById("error");

  errorEl.innerText = "";

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      errorEl.innerText = data.message || "Login failed";
      return;
    }

    // Save token & role
    localStorage.setItem("token", data.token);
    localStorage.setItem("role", data.role);

    // Redirect based on role
    if (data.role === "ADMIN") {
      window.location.href = "admin/dashboard.html";
    } else if (data.role === "TEAM_LEAD") {
      window.location.href = "lead/dashboard.html";
    } else {
      window.location.href = "member/dashboard.html";
    }

  } catch (err) {
    errorEl.innerText = "Server not reachable";
  }
}
