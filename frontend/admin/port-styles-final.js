const fs = require('fs');
const path = require('path');

const dir = 'c:/Users/radha/OneDrive/Desktop/startup-management-system-backend/frontend/admin';

try {
  const dashContent = fs.readFileSync(path.join(dir, 'dashboard.html'), 'utf8');

  // Extract new <style> block from dashboard
  const styleMatch = dashContent.match(/<style>([\s\S]*?)<\/style>/);
  const newStyleInner = styleMatch[1]; // No <style> tags

  // Extract new <header class="topnav">
  const topnavMatch = dashContent.match(/<header class="topnav">[\s\S]*?<\/header>/);
  const newTopnav = topnavMatch[0];

  const subnavMatch = dashContent.match(/<nav class="subnav">[\s\S]*?<\/nav>/);
  // Wait, subnav has different active classes per page, I will manually patch subnav below

  // 1. EMPLOYEES.HTML
  let empPath = path.join(dir, 'employees.html');
  let empContent = fs.readFileSync(empPath, 'utf8');
  empContent = empContent.replace(/<style>[\s\S]*?<\/style>/, `<style>${newStyleInner}</style>`);
  empContent = empContent.replace(/<header class="topnav">[\s\S]*?<\/header>/, newTopnav);
  // Update subnav slightly to match glassmorphism if needed
  empContent = empContent.replace(/<nav class="subnav">([\s\S]*?)<\/nav>/, (match, inner) => {
      // Just keep it but class it if needed, actually subnav is identical in HTML tags, just the CSS changed.
      return `<nav class="subnav">${inner}</nav>`;
  });
  fs.writeFileSync(empPath, empContent, 'utf8');

  // 2. PROJECTS.HTML
  let projPath = path.join(dir, 'projects.html');
  let projContent = fs.readFileSync(projPath, 'utf8');
  // Extract custom css from old projects file
  const projStyleMatch = projContent.match(/<style>([\s\S]*?)<\/style>/);
  const oldProjStyle = projStyleMatch[1];
  const customProjCss = oldProjStyle.substring(oldProjStyle.indexOf('/* Tab buttons */'));
  
  const mergedProjStyle = newStyleInner + '\n' + customProjCss;
  projContent = projContent.replace(/<style>[\s\S]*?<\/style>/, `<style>\n${mergedProjStyle}\n</style>`);
  projContent = projContent.replace(/<header class="topnav">[\s\S]*?<\/header>/, newTopnav);
  fs.writeFileSync(projPath, projContent, 'utf8');

  // 3. PROJECT-MEMBERS.HTML
  let memPath = path.join(dir, 'project-members.html');
  let memContent = fs.readFileSync(memPath, 'utf8');
  const memStyleMatch = memContent.match(/<style>([\s\S]*?)<\/style>/);
  const oldMemStyle = memStyleMatch[1];
  const memIndex = oldMemStyle.indexOf('.lead-card {');
  let mergedMemStyle = newStyleInner;
  if (memIndex !== -1) {
      const customMemCss = oldMemStyle.substring(memIndex);
      mergedMemStyle += '\n' + customMemCss;
  }
  memContent = memContent.replace(/<style>[\s\S]*?<\/style>/, `<style>\n${mergedMemStyle}\n</style>`);
  memContent = memContent.replace(/<header class="topnav">[\s\S]*?<\/header>/, newTopnav);
  fs.writeFileSync(memPath, memContent, 'utf8');

  console.log("Migration complete!");
} catch (err) {
  console.error(err);
}
