function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  window.location.href = "../login.html";
}

// Optional: protect page
(function protectPage() {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "../login.html";
  }
})();
