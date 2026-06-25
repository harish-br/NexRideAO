const fs = require('fs');

let mbJs = fs.readFileSync('admin/manage-buses.js', 'utf8');

// Remove navigation element fetching and view switching logic
mbJs = mbJs.replace(/const navDashboard[\s\S]*?if\(navApprovals\) navApprovals\.addEventListener\('click', \(e\) => { e\.preventDefault\(\); switchView\('approvals'\); }\);/g, '');

fs.writeFileSync('admin/manage-buses.js', mbJs);

console.log("manage-buses.js fixed");
