const fs = require('fs');
const path = require('path');

const dir = 'c:/Users/radha/OneDrive/Desktop/startup-management-system-backend/frontend/admin';

try {
  const dashContent = fs.readFileSync(path.join(dir, 'dashboard.html'), 'utf8');

  // Extract <style> block
  const styleMatch = dashContent.match(/<style>[\s\S]*?<\/style>/);
  if (!styleMatch) throw new Error("Could not find <style> in dashboard.html");
  const newStyle = styleMatch[0];

  // Extract <header class="topnav"> block
  const topnavMatch = dashContent.match(/<header class="topnav">[\s\S]*?<\/header>/);
  if (!topnavMatch) throw new Error("Could not find <header class=\"topnav\"> in dashboard.html");
  const newTopnav = topnavMatch[0];

  const filesToUpdate = ['employees.html', 'projects.html', 'project-members.html'];

  filesToUpdate.forEach(file => {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace style
    content = content.replace(/<style>[\s\S]*?<\/style>/, newStyle);
    
    // Replace topnav
    content = content.replace(/<header class="topnav">[\s\S]*?<\/header>/, newTopnav);
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${file}`);
  });

} catch (err) {
  console.error(err);
}
