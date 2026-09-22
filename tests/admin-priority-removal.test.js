import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('ADMIN PRIORITY REMOVAL: Priority elements removed from all admin options, filters, and modals', async (t) => {
  const htmlPath = path.resolve('admin/index.html');
  const jsPath = path.resolve('admin/admin.js');

  assert.ok(fs.existsSync(htmlPath), 'admin/index.html must exist');
  assert.ok(fs.existsSync(jsPath), 'admin/admin.js must exist');

  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');

  await t.test('1. Priority element options are removed from Admin HTML', () => {
    // 1. Reports filter dropdown
    assert.doesNotMatch(
      html,
      /id="admin-rep-prio-filter"/,
      'admin/index.html must not contain admin-rep-prio-filter select'
    );

    // 2. Reports table header
    assert.doesNotMatch(
      html,
      /<th>Priority<\/th>/i,
      'admin/index.html reports table header must not contain Priority column'
    );

    // 3. Ticket details modal priority dropdown and badge
    assert.doesNotMatch(
      html,
      /id="modal-ticket-prio-select"/,
      'admin/index.html ticket modal must not contain modal-ticket-prio-select'
    );
    assert.doesNotMatch(
      html,
      /id="modal-ticket-prio-badge"/,
      'admin/index.html ticket modal header must not contain modal-ticket-prio-badge'
    );

    // 4. Notification broadcast modal priority dropdown
    assert.doesNotMatch(
      html,
      /id="notif-manage-priority"/,
      'admin/index.html notification modal must not contain notif-manage-priority'
    );

    // 5. Settings default priority select
    assert.doesNotMatch(
      html,
      /id="stg-default-priority"/,
      'admin/index.html settings must not contain stg-default-priority'
    );
  });

  await t.test('2. JavaScript report table rendering does not render priority column', () => {
    // Ensure renderIssuesTable matches 7 columns
    assert.match(
      js,
      /colspan="7"/,
      'renderIssuesTable must use colspan="7" for empty state'
    );
    assert.match(
      js,
      /renderTableSkeleton\(tbody,\s*7,\s*4\)/,
      'renderIssuesTable must use 7 columns for skeleton loading'
    );

    // Ensure filter listeners do not attach to admin-rep-prio-filter
    assert.doesNotMatch(
      js,
      /'admin-rep-prio-filter'/,
      'admin.js must not register event listeners on removed admin-rep-prio-filter'
    );
  });
});
