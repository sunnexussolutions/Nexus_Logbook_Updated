require('dotenv').config();
const jwt = require('jsonwebtoken');

// Create a token for user 224 (the member from screenshot)
const token = jwt.sign({ id: 224, role: 'MEMBER' }, process.env.JWT_SECRET);

// Call the local API
fetch(`http://localhost:5000/api/attendance/my-leave-balance`, {
  headers: { Authorization: `Bearer ${token}` }
})
.then(r => r.json())
.then(data => {
  console.log("\n=== API RESPONSE for /api/attendance/my-leave-balance ===");
  console.log(JSON.stringify(data, null, 2));
  console.log(`\n✅ Used leave = ${data.used} (should be 5, NOT 10)`);
  process.exit(0);
})
.catch(err => {
  console.error("API call failed:", err);
  process.exit(1);
});
