const fs = require('fs');
const path = require('path');

const dir = 'c:/Users/radha/OneDrive/Desktop/startup-management-system-backend/frontend/admin';

try {
  const dashContent = fs.readFileSync(path.join(dir, 'dashboard.html'), 'utf8');

  // Extract <header class="topnav">
  const topnavMatch = dashContent.match(/<header class="topnav">[\s\S]*?<\/header>/);
  if (!topnavMatch) throw new Error("Could not find <header> in dashboard.html");
  const newTopnav = topnavMatch[0];

  // Extract :root from dashboard
  const rootMatch = dashContent.match(/:root\s*{[\s\S]*?}/);
  const newRoot = rootMatch[0];

  // Extract .topnav CSS from dashboard
  const topnavCssMatch = dashContent.match(/\/\* =+ TOPNAV =+ \*\/[\s\S]*?\/\* =+ SUBNAV =+ \*\//);
  const newTopnavCss = topnavCssMatch ? topnavCssMatch[0] : null;

  const filesToUpdate = ['employees.html', 'projects.html', 'project-members.html'];

  filesToUpdate.forEach(file => {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace <header class="topnav">
    content = content.replace(/<header class="topnav">[\s\S]*?<\/header>/, newTopnav);
    
    // Replace :root variables safely
    content = content.replace(/:root\s*{[\s\S]*?}/, newRoot);
    
    // Replace topnav and subnav css rules in the files
    // The older files don't have nice /* ==== TOPNAV ==== */ comments easily.
    // So let's replace .topnav, .topnav-brand, .topnav-tools, .subnav CSS directly.
    
    const oldTopnavRegex = /\.topnav\s*{[\s\S]*?}/g;
    const oldTopnavBrandRegex = /\.topnav-brand\s*{[\s\S]*?}/g;
    const oldTopnavToolsRegex = /\.topnav-tools\s*{[\s\S]*?}/g;
    const oldSubnavRegex = /\.subnav\s*{[\s\S]*?}/g;
    const oldSubnavARegex = /\.subnav a\s*{[\s\S]*?}/g;
    const oldSubnavAHoverRegex = /\.subnav a:hover\s*{[\s\S]*?}/g;
    const oldSubnavAActiveRegex = /\.subnav a\.active\s*{[\s\S]*?}/g;
    
    // Wait, let's just use the dashContent's corresponding CSS explicitly.
    const getCssBlock = (selector) => {
        const regex = new RegExp(selector.replace(/\./g, '\\.') + '\\s*{[\\s\\S]*?}');
        const match = dashContent.match(regex);
        return match ? match[0] : null;
    };
    
    ['.topnav', '.topnav-brand', '.topnav-brand i', '.topnav-tools', '.geo-switch', '.geo-switch:hover', '.geo-switch .form-check-input', '.geo-switch .form-check-input:checked', '.subnav', '.subnav a', '.subnav a:hover', '.subnav a.active', '.subnav a.active::before'].forEach(sel => {
        const block = getCssBlock(sel);
        if (block) {
            // attempt to replace if it exists, otherwise append before </style>
            const selRegex = new RegExp(sel.replace(/\./g, '\\.') + '\\s*{[\\s\\S]*?}');
            if (selRegex.test(content)) {
                content = content.replace(selRegex, block);
            } else {
                content = content.replace(/<\/style>/, block + '\n    </style>');
            }
        }
    });

    // Handle generic button overwrites for consistency
    ['.btn-sys', '.btn-sys-primary', '.btn-sys-primary:hover', '.btn-sys-default', '.btn-sys-default:hover', '.btn-sys-danger', '.btn-sys-danger:hover'].forEach(sel => {
        const block = getCssBlock(sel);
        if (block) {
            const selRegex = new RegExp(sel.replace(/\./g, '\\.') + '\\s*{[\\s\\S]*?}');
            if (selRegex.test(content)) {
                content = content.replace(selRegex, block);
            } else {
                content = content.replace(/<\/style>/, block + '\n    </style>');
            }
        }
    });
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Smart updated ${file}`);
  });

} catch (err) {
  console.error(err);
}
