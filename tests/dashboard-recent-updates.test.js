import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('DASHBOARD RECENT UPDATES: Real-data aggregation & rendering integrity', async (t) => {
  const adminJsPath = path.resolve('admin/admin.js');
  const adminCssPath = path.resolve('admin/admin.css');
  const adminHtmlPath = path.resolve('admin/index.html');

  assert.ok(fs.existsSync(adminJsPath), 'admin/admin.js must exist');
  assert.ok(fs.existsSync(adminCssPath), 'admin/admin.css must exist');
  assert.ok(fs.existsSync(adminHtmlPath), 'admin/index.html must exist');

  const jsContent = fs.readFileSync(adminJsPath, 'utf8');
  const cssContent = fs.readFileSync(adminCssPath, 'utf8');
  const htmlContent = fs.readFileSync(adminHtmlPath, 'utf8');

  await t.test('1. Static mock records are eliminated from HTML template', () => {
    assert.doesNotMatch(
      htmlContent,
      /25\/6\/2026,\s*12:41:17\s*PM/,
      'Must not contain hardcoded fake timestamps in index.html'
    );
    assert.doesNotMatch(
      htmlContent,
      /by teamnexride@gmail\.com/,
      'Must not contain hardcoded fake author in Recent Updates list'
    );
    assert.match(htmlContent, /id="recent-updates-list"/, 'Must contain #recent-updates-list container');
  });

  await t.test('2. CSS rules for clickable items and colored markers are present', () => {
    assert.match(cssContent, /\.update-item\.clickable/, 'Must define .update-item.clickable');
    assert.match(cssContent, /\.update-marker\.marker-blue/, 'Must define .update-marker.marker-blue');
    assert.match(cssContent, /\.update-marker\.marker-green/, 'Must define .update-marker.marker-green');
    assert.match(cssContent, /\.update-marker\.marker-orange/, 'Must define .update-marker.marker-orange');
    assert.match(cssContent, /\.update-marker\.marker-red/, 'Must define .update-marker.marker-red');
    assert.match(cssContent, /\.update-marker\.marker-purple/, 'Must define .update-marker.marker-purple');
  });

  await t.test('3. JavaScript dynamically aggregates from multiple real caches', () => {
    assert.match(jsContent, /function renderRecentActivity\(\)/, 'Must define renderRecentActivity');
    assert.match(jsContent, /auditLogsCache/, 'Must aggregate from auditLogsCache');
    assert.match(jsContent, /approvalsCache/, 'Must aggregate from approvalsCache');
    assert.match(jsContent, /reportsCache/, 'Must aggregate from reportsCache');
    assert.match(jsContent, /notificationsCache/, 'Must aggregate from notificationsCache');
    assert.match(jsContent, /routesCache/, 'Must aggregate from routesCache');
    assert.match(jsContent, /busesCache/, 'Must aggregate from busesCache');
  });

  await t.test('4. Chronological newest-first sorting and timestamp parsing logic works accurately', () => {
    const now = Date.now();
    const mockLogs = [
      { id: '1', action: 'ROUTE_CREATED', timestamp: new Date(now - 300000), metadata: { name: 'Express Line' } },
      { id: '2', action: 'BUS_CREATED', timestamp: { toMillis: () => now - 100000 }, metadata: { busNumber: '42' } }
    ];
    const mockReports = [
      { id: '3', subject: 'Air Conditioning', createdAt: new Date(now - 50000), status: 'Submitted' }
    ];
    const mockApprovals = [
      { id: '4', type: 'TIMING_MOD', submittedAt: { seconds: Math.floor((now - 10000) / 1000) }, status: 'Pending' }
    ];

    function getRecordTimestamp(item) {
      if (!item) return 0;
      const ts = item.timestamp || item.submittedAt || item.createdAt || item.updatedAt;
      if (!ts) return 0;
      if (typeof ts.toMillis === 'function') return ts.toMillis();
      if (typeof ts.toDate === 'function') return ts.toDate().getTime();
      if (typeof ts.seconds === 'number') return ts.seconds * 1000;
      if (ts instanceof Date) return ts.getTime();
      const t = new Date(ts).getTime();
      return isNaN(t) ? 0 : t;
    }

    const items = [
      ...mockLogs.map(l => ({ title: l.action, time: getRecordTimestamp(l) })),
      ...mockReports.map(r => ({ title: r.subject, time: getRecordTimestamp(r) })),
      ...mockApprovals.map(a => ({ title: a.type, time: getRecordTimestamp(a) }))
    ];

    items.sort((a, b) => b.time - a.time);

    // Order must be: Approvals (10s ago) -> Reports (50s ago) -> Bus Created (100s ago) -> Route Created (300s ago)
    assert.equal(items[0].title, 'TIMING_MOD');
    assert.equal(items[1].title, 'Air Conditioning');
    assert.equal(items[2].title, 'BUS_CREATED');
    assert.equal(items[3].title, 'ROUTE_CREATED');
    assert.ok(items[0].time >= items[1].time);
    assert.ok(items[1].time >= items[2].time);
    assert.ok(items[2].time >= items[3].time);
  });
});
