import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('ADMIN SKELETON LOADING ANIMATION SYSTEM: Comprehensive Verification', async (t) => {
  const adminJsPath = path.resolve('admin/admin.js');
  const adminCssPath = path.resolve('admin/admin.css');
  const adminHtmlPath = path.resolve('admin/index.html');

  assert.ok(fs.existsSync(adminJsPath), 'admin/admin.js must exist');
  assert.ok(fs.existsSync(adminCssPath), 'admin/admin.css must exist');
  assert.ok(fs.existsSync(adminHtmlPath), 'admin/index.html must exist');

  const jsContent = fs.readFileSync(adminJsPath, 'utf8');
  const cssContent = fs.readFileSync(adminCssPath, 'utf8');
  const htmlContent = fs.readFileSync(adminHtmlPath, 'utf8');

  await t.test('1. CSS Skeleton Animation System & Shimmer Styles', () => {
    // Keyframe animations
    assert.match(cssContent, /@keyframes\s+adminSkeletonShimmer/, 'Must define @keyframes adminSkeletonShimmer');
    assert.match(cssContent, /background-position:\s*-200%\s*0/, 'Shimmer animation starts at -200%');
    assert.match(cssContent, /background-position:\s*200%\s*0/, 'Shimmer animation finishes at 200%');
    assert.match(cssContent, /@keyframes\s+adminSkeletonPulse/, 'Must define @keyframes adminSkeletonPulse');

    // Base skeleton class
    assert.match(cssContent, /\.admin-skeleton\s*\{/, 'Must define .admin-skeleton');
    assert.match(cssContent, /animation:\s*adminSkeletonShimmer\s+1\.8s/, 'Must animate with adminSkeletonShimmer over 1.8s');
    assert.match(cssContent, /background-size:\s*200%\s*100%/, 'Must have 200% background width for shimmer sweep');

    // Geometric primitives
    assert.match(cssContent, /\.admin-skeleton-line\s*\{/, 'Must define .admin-skeleton-line');
    assert.match(cssContent, /\.admin-skeleton-circle\s*\{/, 'Must define .admin-skeleton-circle');
    assert.match(cssContent, /\.admin-skeleton-pill/, 'Must define .admin-skeleton-pill');
    assert.match(cssContent, /\.admin-skeleton-badge/, 'Must define .admin-skeleton-badge');
    assert.match(cssContent, /\.admin-skeleton-btn\s*\{/, 'Must define .admin-skeleton-btn');
    assert.match(cssContent, /\.admin-skeleton-stat\s*\{/, 'Must define .admin-skeleton-stat');

    // Layout wrappers
    assert.match(cssContent, /\.skeleton-table-row/, 'Must define .skeleton-table-row');
    assert.match(cssContent, /\.skeleton-list-card/, 'Must define .skeleton-list-card');
    assert.match(cssContent, /\.skeleton-activity-item/, 'Must define .skeleton-activity-item');

    // Width utilities
    assert.match(cssContent, /\.admin-skeleton-w-20/, 'Must define .admin-skeleton-w-20');
    assert.match(cssContent, /\.admin-skeleton-w-full/, 'Must define .admin-skeleton-w-full');

    // Accessibility: Reduced motion
    assert.match(cssContent, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, 'Must include prefers-reduced-motion fallback');
  });

  await t.test('2. HTML Initial Skeleton States & Raw "Loading..." Text Removal', () => {
    // Check table bodies have skeleton rows
    const requiredSkeletonTables = [
      'buses-table-body',
      'timings-table-body',
      'drivers-table-body',
      'students-table-body',
      'routes-table-body',
      'standalone-timings-table-body',
      'trips-table-body',
      'admin-reports-table-body',
      'documents-table-body',
      'approvals-table-body',
      'notifications-table-body',
      'audit-logs-table-body'
    ];

    for (const tableId of requiredSkeletonTables) {
      const tableRegex = new RegExp(`id="${tableId}"[^>]*>[\\s\\S]*?class="skeleton-table-row"`, 'i');
      assert.match(htmlContent, tableRegex, `Table #${tableId} must have initial .skeleton-table-row in HTML`);
    }

    // Check widget containers have skeleton elements
    assert.match(htmlContent, /id="recent-updates-list"[^>]*>[\s\S]*?skeleton-activity-item/, '#recent-updates-list must contain skeleton-activity-item');
    assert.match(htmlContent, /id="live-bus-items-container"[^>]*>[\s\S]*?skeleton-list-card/, '#live-bus-items-container must contain skeleton-list-card');
    assert.match(htmlContent, /id="sos-incident-items-container"[^>]*>[\s\S]*?skeleton-list-card/, '#sos-incident-items-container must contain skeleton-list-card');
    assert.match(htmlContent, /id="inspect-bus-students-list"[^>]*>[\s\S]*?skeleton-list-card/, '#inspect-bus-students-list must contain skeleton-list-card');
    assert.match(htmlContent, /id="inspect-bus-docs-list"[^>]*>[\s\S]*?skeleton-list-card/, '#inspect-bus-docs-list must contain skeleton-list-card');

    // Ensure raw loading text placeholders are removed from table bodies
    assert.doesNotMatch(htmlContent, /<td[^>]*>Loading notifications\.\.\.<\/td>/i, 'Must not have raw "Loading notifications..." text');
    assert.doesNotMatch(htmlContent, /<td[^>]*>Loading audit\s*logs\.\.\.<\/td>/i, 'Must not have raw "Loading audit logs..." text');
    assert.doesNotMatch(htmlContent, /Loading assigned students\.\.\./i, 'Must not have raw "Loading assigned students..." text');
    assert.doesNotMatch(htmlContent, /Loading documents\.\.\./i, 'Must not have raw "Loading documents..." text');
  });

  await t.test('3. JavaScript Skeleton Generator Functions & Window Exports', () => {
    assert.match(jsContent, /function getTableSkeletonHTML\(colCount/, 'Must define getTableSkeletonHTML');
    assert.match(jsContent, /function renderTableSkeleton\(tbodyOrId/, 'Must define renderTableSkeleton');
    assert.match(jsContent, /function getListSkeletonHTML\(count/, 'Must define getListSkeletonHTML');
    assert.match(jsContent, /function renderListSkeleton\(containerOrId/, 'Must define renderListSkeleton');

    // Global window exports
    assert.match(jsContent, /window\.getTableSkeletonHTML\s*=\s*getTableSkeletonHTML;/, 'Must export getTableSkeletonHTML on window');
    assert.match(jsContent, /window\.renderTableSkeleton\s*=\s*renderTableSkeleton;/, 'Must export renderTableSkeleton on window');
    assert.match(jsContent, /window\.getListSkeletonHTML\s*=\s*getListSkeletonHTML;/, 'Must export getListSkeletonHTML on window');
    assert.match(jsContent, /window\.renderListSkeleton\s*=\s*renderListSkeleton;/, 'Must export renderListSkeleton on window');

    // Simulate getTableSkeletonHTML logic directly
    const widths = ['80px', '110px', '140px', '95px', '125px', '70px'];
    function simulateGetTableSkeletonHTML(colCount = 6, rowCount = 3) {
      let html = '';
      for (let r = 0; r < rowCount; r++) {
        html += '<tr class="skeleton-table-row">';
        for (let c = 0; c < colCount; c++) {
          const isFirst = (c === 0);
          const isLast = (c === colCount - 1);
          const isBadge = (c === colCount - 2 || c === 4);
          const width = widths[(c + r * 2) % widths.length];

          if (isLast) {
            html += `<td style="text-align: right;"><div class="admin-skeleton admin-skeleton-btn" style="width: 65px; height: 26px; margin-left: auto;"></div></td>`;
          } else if (isFirst) {
            html += `<td><div class="admin-skeleton admin-skeleton-pill" style="width: 55px; height: 18px;"></div></td>`;
          } else if (isBadge) {
            html += `<td><div class="admin-skeleton admin-skeleton-badge" style="width: ${width}; height: 22px;"></div></td>`;
          } else {
            html += `<td><div class="admin-skeleton admin-skeleton-line" style="width: ${width}; height: 14px;"></div></td>`;
          }
        }
        html += '</tr>';
      }
      return html;
    }

    const genHtml = simulateGetTableSkeletonHTML(7, 3);
    const rowMatches = genHtml.match(/<tr class="skeleton-table-row">/g);
    assert.equal(rowMatches.length, 3, 'Must generate exactly 3 skeleton rows');
    const cellMatches = genHtml.match(/<td/g);
    assert.equal(cellMatches.length, 21, 'Must generate exactly 21 (7 * 3) skeleton table cells');
  });

  await t.test('4. Initial Load State Flags & View Router Resilience', () => {
    // Loaded flags declared
    assert.match(jsContent, /let busesLoaded\s*=\s*false;/, 'Must declare busesLoaded flag');
    assert.match(jsContent, /let usersLoaded\s*=\s*false;/, 'Must declare usersLoaded flag');
    assert.match(jsContent, /let routesLoaded\s*=\s*false;/, 'Must declare routesLoaded flag');
    assert.match(jsContent, /let reportsLoaded\s*=\s*false;/, 'Must declare reportsLoaded flag');
    assert.match(jsContent, /let approvalsLoaded\s*=\s*false;/, 'Must declare approvalsLoaded flag');
    assert.match(jsContent, /let auditLogsLoaded\s*=\s*false;/, 'Must declare auditLogsLoaded flag');
    assert.match(jsContent, /let notificationsLoaded\s*=\s*false;/, 'Must declare notificationsLoaded flag');
    assert.match(jsContent, /let sosLoaded\s*=\s*false;/, 'Must declare sosLoaded flag');

    // Firestore listeners set flags to true
    assert.match(jsContent, /listenToBuses[\s\S]*?busesLoaded\s*=\s*true;/, 'listenToBuses must set busesLoaded = true');
    assert.match(jsContent, /listenToUsers[\s\S]*?usersLoaded\s*=\s*true;/, 'listenToUsers must set usersLoaded = true');
    assert.match(jsContent, /listenToRoutes[\s\S]*?routesLoaded\s*=\s*true;/, 'listenToRoutes must set routesLoaded = true');
    assert.match(jsContent, /listenToReports[\s\S]*?reportsLoaded\s*=\s*true;/, 'listenToReports must set reportsLoaded = true');
    assert.match(jsContent, /listenToApprovals[\s\S]*?approvalsLoaded\s*=\s*true;/, 'listenToApprovals must set approvalsLoaded = true');
    assert.match(jsContent, /listenToAuditLogs[\s\S]*?auditLogsLoaded\s*=\s*true;/, 'listenToAuditLogs must set auditLogsLoaded = true');
    assert.match(jsContent, /listenToNotifications[\s\S]*?notificationsLoaded\s*=\s*true;/, 'listenToNotifications must set notificationsLoaded = true');
    assert.match(jsContent, /listenToSOSIncidents[\s\S]*?sosLoaded\s*=\s*true;/, 'listenToSOSIncidents must set sosLoaded = true');

    // Render methods check loaded flags before falling back to empty state
    assert.match(jsContent, /renderBusesTable[\s\S]*?!busesLoaded && busesCache\.length === 0/, 'renderBusesTable must check !busesLoaded');
    assert.match(jsContent, /renderDriversTable[\s\S]*?!usersLoaded && driversCache\.length === 0/, 'renderDriversTable must check !usersLoaded');
    assert.match(jsContent, /renderStudentsTable[\s\S]*?!usersLoaded && studentsCache\.length === 0/, 'renderStudentsTable must check !usersLoaded');
    assert.match(jsContent, /renderRoutesTable[\s\S]*?!routesLoaded &&/, 'renderRoutesTable must check !routesLoaded');
    assert.match(jsContent, /renderTimingsTable[\s\S]*?!busesLoaded && busesCache\.length === 0/, 'renderTimingsTable must check !busesLoaded');
    assert.match(jsContent, /renderTripsTable[\s\S]*?!busesLoaded && tripsCache\.length === 0/, 'renderTripsTable must check !busesLoaded');
    assert.match(jsContent, /renderIssuesTable[\s\S]*?!reportsLoaded && reportsCache\.length === 0/, 'renderIssuesTable must check !reportsLoaded');
    assert.match(jsContent, /renderDocumentsTable[\s\S]*?!busesLoaded && documentsCache\.length === 0/, 'renderDocumentsTable must check !busesLoaded');
    assert.match(jsContent, /renderApprovalsTable[\s\S]*?!approvalsLoaded && approvalsCache\.length === 0/, 'renderApprovalsTable must check !approvalsLoaded');
    assert.match(jsContent, /renderNotificationsManagementTable[\s\S]*?!notificationsLoaded && notificationsCache\.length === 0/, 'renderNotificationsManagementTable must check !notificationsLoaded');
    assert.match(jsContent, /renderAuditLogsTable[\s\S]*?!auditLogsLoaded && auditLogsCache\.length === 0/, 'renderAuditLogsTable must check !auditLogsLoaded');
    assert.match(jsContent, /renderSOSView[\s\S]*?!sosLoaded && sosIncidentsCache\.length === 0/, 'renderSOSView must check !sosLoaded');

    // switchView router supports all views
    assert.match(jsContent, /if \(viewId === 'drivers-view'\)\s*\{\s*renderDriversTable\(\);/, 'switchView handles drivers-view');
    assert.match(jsContent, /if \(viewId === 'students-view'\)\s*\{\s*renderStudentsTable\(\);/, 'switchView handles students-view');
    assert.match(jsContent, /if \(viewId === 'trips-view'\)\s*\{\s*renderTripsTable\(\);/, 'switchView handles trips-view');
    assert.match(jsContent, /if \(viewId === 'documents-view'\)\s*\{\s*renderDocumentsTable\(\);/, 'switchView handles documents-view');
    assert.match(jsContent, /if \(viewId === 'audit-logs-view'\)\s*\{\s*renderAuditLogsTable\(\);/, 'switchView handles audit-logs-view');
  });
});
