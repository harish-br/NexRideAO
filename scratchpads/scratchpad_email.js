const fs = require('fs');
let js = fs.readFileSync('admin/manage-buses.js', 'utf8');

js = js.replace(/submittedAt: serverTimestamp\(\),/g, "submittedAt: serverTimestamp(),\n      submittedByEmail: auth.currentUser ? auth.currentUser.email : 'admin',");

fs.writeFileSync('admin/manage-buses.js', js);
console.log("manage-buses.js updated");
