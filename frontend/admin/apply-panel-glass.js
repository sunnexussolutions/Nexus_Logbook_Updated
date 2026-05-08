const fs = require('fs');
const path = require('path');

const dir = 'c:/Users/radha/OneDrive/Desktop/startup-management-system-backend/frontend/admin';

try {
  let dashContent = fs.readFileSync(path.join(dir, 'dashboard.html'), 'utf8');

  // We updated logTabs and the logTabs content. Let's find Global System logs header block.
  // Wait, the other pages don't have Global System logs. 
  // employees.html has add employee? No, dashboard has provision user.
  // But they do all have top nav which we already updated.
  
  // Wait, does employees.html have its own Add Employee or just a roster?
  // Let's check employees.html content specifically to see if any custom elements need the Lead styling.
  
  console.log("Checking employees.html specific elements...");
  let empPath = path.join(dir, 'employees.html');
  let empContent = fs.readFileSync(empPath, 'utf8');

  // Let's replace simple `.panel` to match the dashboard ones
  empContent = empContent.replace(
    /<div class="panel">/g, 
    '<div class="panel" style="background: rgba(255,255,255,0.7); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.5); box-shadow: var(--shadow-lg);">'
  );
  
  fs.writeFileSync(empPath, empContent, 'utf8');

  // check projects.html
  console.log("Checking projects.html specific elements...");
  let projPath = path.join(dir, 'projects.html');
  let projContent = fs.readFileSync(projPath, 'utf8');
  projContent = projContent.replace(
    /<div class="panel">/g, 
    '<div class="panel" style="background: rgba(255,255,255,0.7); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.5); box-shadow: var(--shadow-lg);">'
  );
  fs.writeFileSync(projPath, projContent, 'utf8');

  // check project-members.html
  console.log("Checking project-members.html specific elements...");
  let memPath = path.join(dir, 'project-members.html');
  let memContent = fs.readFileSync(memPath, 'utf8');
  memContent = memContent.replace(
    /<div class="panel">/g, 
    '<div class="panel" style="background: rgba(255,255,255,0.7); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.5); box-shadow: var(--shadow-lg);">'
  );
  fs.writeFileSync(memPath, memContent, 'utf8');

  console.log("Done adding glassmorphism directly to remaining panels.");
} catch (err) {
  console.error(err);
}
