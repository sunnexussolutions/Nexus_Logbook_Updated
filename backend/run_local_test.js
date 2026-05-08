const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const jwt = require('jsonwebtoken');

async function testFetch() {
    const token = jwt.sign({ id: 1, role: 'ADMIN' }, 'admin123');
    try {
        const res = await fetch("http://localhost:5000/api/admin/leave-requests/18", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ status: "REJECTED", rejection_reason: "Test failure tracing" })
        });
        console.log("Status:", res.status);
        console.log("Body:", await res.text());
    } catch (e) { console.error(e); }
    process.exit(0);
}

setTimeout(testFetch, 1000);
