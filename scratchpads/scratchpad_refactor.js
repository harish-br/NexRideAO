const fs = require('fs');

const adminHtml = fs.readFileSync('admin/index.html', 'utf8');

const navReplacement = `<ul class="nav-links">
          <li><a href="/admin/">Dashboard</a></li>
          <li><a href="/admin/manage-buses/">Manage Buses</a></li>
          <li><a href="/admin/places/">Places</a></li>
          <li><a href="/admin/routes/">Routes</a></li>
          <li><a href="/admin/approvals/">Approvals</a></li>
          <li><a href="#">Audit Logs</a></li>
          <li><a href="#">Settings</a></li>
          <li><a href="#">Legal</a></li>
        </ul>`;

const regexNav = /<ul class="nav-links">[\s\S]*?<\/ul>/;

// 1. Process Dashboard (admin/index.html)
let dashboardHtml = adminHtml.replace(regexNav, navReplacement);
// Add active class to Dashboard
dashboardHtml = dashboardHtml.replace('href="/admin/"', 'href="/admin/" class="active"');
// Remove Manage Buses View
dashboardHtml = dashboardHtml.replace(/<!-- MANAGE BUSES VIEW -->[\s\S]*?<!-- END MANAGE BUSES VIEW -->/g, '');
// Remove Approvals View
dashboardHtml = dashboardHtml.replace(/<!-- APPROVALS VIEW -->[\s\S]*?<!-- END APPROVALS VIEW -->/g, '');
// Remove script tags for manage-buses and approvals
dashboardHtml = dashboardHtml.replace(/<script type="module" src="\.\/manage-buses\.js"><\/script>\n/g, '');
dashboardHtml = dashboardHtml.replace(/<script type="module" src="\.\/approvals\.js"><\/script>\n/g, '');
fs.writeFileSync('admin/index.html', dashboardHtml);

// 2. Base for Subpages
function createSubpage(htmlContent, activeHref, viewIdToKeep, scriptToKeep) {
  let html = htmlContent.replace(regexNav, navReplacement);
  // Add active class
  html = html.replace(`href="${activeHref}"`, `href="${activeHref}" class="active"`);
  
  // Fix relative links
  html = html.replace(/href="\.\//g, 'href="../');
  html = html.replace(/src="\.\//g, 'src="../');
  
  // Remove Login Page
  html = html.replace(/<div id="admin-login-page"[\s\S]*?<\/div> <!-- END LOGIN PAGE -->/, '');
  
  // Make dashboard container visible
  html = html.replace('<div id="admin-dashboard-page" class="admin-dashboard-container hidden">', '<div id="admin-dashboard-page" class="admin-dashboard-container">');
  
  // Remove views based on what to keep
  if (viewIdToKeep !== 'dashboard-view') {
    html = html.replace(/<!-- DASHBOARD VIEW -->[\s\S]*?<!-- END DASHBOARD VIEW -->/, '');
  }
  if (viewIdToKeep !== 'manage-buses-view') {
    html = html.replace(/<!-- MANAGE BUSES VIEW -->[\s\S]*?<!-- END MANAGE BUSES VIEW -->/, '');
  }
  if (viewIdToKeep !== 'approvals-view') {
    html = html.replace(/<!-- APPROVALS VIEW -->[\s\S]*?<!-- END APPROVALS VIEW -->/, '');
  }
  
  // Make the kept view visible
  html = html.replace(`<div id="${viewIdToKeep}" class="hidden">`, `<div id="${viewIdToKeep}">`);
  
  // Replace scripts: Add auth guard, keep only specified script
  const newScripts = `  <script type="module" src="../auth-guard.js"></script>\n` +
                     (scriptToKeep ? `  <script type="module" src="../${scriptToKeep}"></script>\n` : '');
                     
  html = html.replace(/<script type="module" src="\.\.\/admin\.js"><\/script>\n/g, '');
  html = html.replace(/<script type="module" src="\.\.\/manage-buses\.js"><\/script>\n/g, '');
  html = html.replace(/<script type="module" src="\.\.\/approvals\.js"><\/script>\n/g, '');
  
  html = html.replace('</body>', newScripts + '</body>');
  return html;
}

// Write Manage Buses
let mbHtml = createSubpage(adminHtml, '/admin/manage-buses/', 'manage-buses-view', 'manage-buses.js');
fs.writeFileSync('admin/manage-buses/index.html', mbHtml);

// Write Approvals
let appHtml = createSubpage(adminHtml, '/admin/approvals/', 'approvals-view', 'approvals.js');
fs.writeFileSync('admin/approvals/index.html', appHtml);

// Write Places
let placesHtml = createSubpage(adminHtml, '/admin/places/', 'places-view', null);
placesHtml = placesHtml.replace('</main>', `
      <div id="places-view">
        <div class="page-header">
          <h1>Manage Places</h1>
        </div>
        <div style="padding: 24px; color: var(--text-secondary);">Coming soon...</div>
      </div>
    </main>`);
fs.writeFileSync('admin/places/index.html', placesHtml);

// Write Routes
let routesHtml = createSubpage(adminHtml, '/admin/routes/', 'routes-view', null);
routesHtml = routesHtml.replace('</main>', `
      <div id="routes-view">
        <div class="page-header">
          <h1>Manage Routes</h1>
        </div>
        <div style="padding: 24px; color: var(--text-secondary);">Coming soon...</div>
      </div>
    </main>`);
fs.writeFileSync('admin/routes/index.html', routesHtml);

console.log("Refactoring complete");
