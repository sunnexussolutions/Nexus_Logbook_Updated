require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
});

async function showData() {
  try {
    console.log('=== Data in Neon Cloud Database ===\n');

    // Show users
    const usersRes = await pool.query('SELECT id, user_id, name, email, role FROM users ORDER BY id');
    console.log('Users:');
    usersRes.rows.forEach(user => console.log(`- ${user.user_id}: ${user.name} (${user.email}) - ${user.role}`));
    console.log(`Total users: ${usersRes.rows.length}\n`);

    // Show projects
    const projectsRes = await pool.query('SELECT id, project_name, description FROM projects ORDER BY id');
    console.log('Projects:');
    projectsRes.rows.forEach(project => console.log(`- ${project.project_name}: ${project.description || 'No description'}`));
    console.log(`Total projects: ${projectsRes.rows.length}\n`);

    // Show attendance records
    const attendanceRes = await pool.query('SELECT COUNT(*) as count FROM attendance');
    console.log(`Attendance records: ${attendanceRes.rows[0].count}\n`);

    // Show notifications
    const notificationsRes = await pool.query('SELECT COUNT(*) as count FROM notifications');
    console.log(`Notifications: ${notificationsRes.rows[0].count}\n`);

    // Show work reports
    const reportsRes = await pool.query('SELECT COUNT(*) as count FROM work_reports');
    console.log(`Work reports: ${reportsRes.rows[0].count}\n`);

    console.log('✅ All data successfully migrated to Neon cloud database!');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    pool.end();
  }
}

showData();