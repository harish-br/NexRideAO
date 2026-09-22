import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('ADMIN CLEANUP: Removal of Recent Updates, Document Page Scoping to Drivers & Header Notification Bell', async (t) => {
  const htmlPath = path.resolve('admin/index.html');
  const cssPath = path.resolve('admin/admin.css');
  const jsPath = path.resolve('admin/admin.js');

  assert.ok(fs.existsSync(htmlPath), 'admin/index.html must exist');
  assert.ok(fs.existsSync(cssPath), 'admin/admin.css must exist');
  assert.ok(fs.existsSync(jsPath), 'admin/admin.js must exist');

  const html = fs.readFileSync(htmlPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');

  await t.test('1. Documents option is removed from the top navigation options in .nav-links', () => {
    const navLinksMatch = html.match(/<ul class="nav-links">([\s\S]*?)<\/ul>/);
    assert.ok(navLinksMatch, 'admin/index.html must contain <ul class="nav-links">');
    const navLinksContent = navLinksMatch[1];

    assert.doesNotMatch(
      navLinksContent,
      /<li>\s*<a\s+href="#documents"\s+class="nav-item"\s+data-view="documents-view">Documents<\/a>\s*<\/li>/,
      'Documents link must be removed from the top-level .nav-links'
    );

    // Students must remain present as a standalone top-level option
    assert.match(
      navLinksContent,
      /<a href="#students" class="nav-item" data-view="students-view" id="nav-students-item">Students<\/a>/,
      'Students must remain a top-level standalone link in .nav-links'
    );
  });

  await t.test('2. Recent Updates and Document Alerts widgets are hidden from dashboard visibility', () => {
    assert.match(
      html,
      /<div class="widgets-grid"[^>]*style="[^"]*display:\s*none\s*!important;?[^"]*"/,
      '.widgets-grid in admin/index.html must have display: none !important;'
    );

    assert.match(
      css,
      /\.widgets-grid\s*\{[^}]*display:\s*none\s*!important;/s,
      'admin.css must hide .widgets-grid with display: none !important;'
    );

    assert.match(
      js,
      /<div class="widgets-grid"[^>]*style="[^"]*display:\s*none\s*!important;?[^"]*"/,
      'getDashboardSkeletonHTML in admin.js must have display: none !important;'
    );
  });

  await t.test('3. Documents page is hidden while Driver Documents is natively preserved inside drivers-view', () => {
    // Standalone documents-view is hidden
    assert.match(
      html,
      /<section id="documents-view"[^>]*style="[^"]*display:\s*none\s*!important;?[^"]*"/,
      'Standalone #documents-view must be hidden with display: none !important;'
    );
    assert.match(
      css,
      /#documents-view\s*\{[^}]*display:\s*none\s*!important;/s,
      'admin.css must hide #documents-view with display: none !important;'
    );

    // Driver Documents tab content is embedded directly inside drivers-view
    assert.match(
      html,
      /<div id="drivers-tab-documents-content"/,
      'drivers-view must contain #drivers-tab-documents-content'
    );
    assert.match(
      html,
      /id="driver-documents-table-body"/,
      '#drivers-tab-documents-content must contain #driver-documents-table-body'
    );

    // switchDriverSubtab supports documents tab natively
    assert.match(
      js,
      /content:\s*'drivers-tab-documents-content'/,
      'switchDriverSubtab tabs list must map documents to drivers-tab-documents-content'
    );
    assert.match(
      js,
      /function renderDriverDocumentsTable\(\)/,
      'admin.js must define renderDriverDocumentsTable'
    );
  });

  await t.test('4. Notification option in header near profile is hidden, while Notifications page is preserved', () => {
    // Header notification bell container is hidden
    assert.match(
      html,
      /<div class="header-notif-container"[^>]*style="[^"]*display:\s*none\s*!important;?[^"]*"/,
      '.header-notif-container in admin/index.html must have display: none !important;'
    );
    assert.match(
      css,
      /\.header-notif-container\s*\{[^}]*display:\s*none\s*!important;/s,
      'admin.css must hide .header-notif-container with display: none !important;'
    );

    // Notifications page remains in nav-links and main content
    const navLinksMatch = html.match(/<ul class="nav-links">([\s\S]*?)<\/ul>/);
    assert.ok(navLinksMatch);
    assert.match(
      navLinksMatch[1],
      /<a href="#notifications" class="nav-item" data-view="notifications-view">Notifications<\/a>/,
      'Notifications nav item must remain present in .nav-links'
    );

    assert.match(
      html,
      /<section id="notifications-view"/,
      '#notifications-view must remain present in admin/index.html'
    );
  });

  await t.test('5. Header navigation items follow exact order: Buses, Routes, Drivers, Students, Reports, Notifications, Audit Logs, Settings', () => {
    const navLinksMatch = html.match(/<ul class="nav-links">([\s\S]*?)<\/ul>/);
    assert.ok(navLinksMatch, 'admin/index.html must contain <ul class="nav-links">');
    const navLinksContent = navLinksMatch[1];

    // Verify exact ordering of top navigation items
    assert.match(
      navLinksContent,
      /href="#buses"[\s\S]*?href="#routes"[\s\S]*?href="#drivers"[\s\S]*?href="#students"[\s\S]*?href="#reports"[\s\S]*?href="#notifications"[\s\S]*?href="#audit-logs"[\s\S]*?href="#settings/,
      'Top navigation links must follow the exact required order: Buses -> Routes -> Drivers -> Students -> Reports -> Notifications -> Audit Logs -> Settings'
    );

    // Legal is NOT in top-level nav-links
    assert.doesNotMatch(
      navLinksContent,
      /<a href="#legal"[^>]*>Legal<\/a>/,
      'Legal must be removed from top-level .nav-links'
    );
  });

  await t.test('6. Legal & Compliance is integrated inside Settings View', () => {
    // #settings-view contains #stg-legal-card
    assert.match(
      html,
      /<section id="settings-view"[\s\S]*?id="stg-legal-card"[\s\S]*?<\/section>/,
      '#settings-view must contain #stg-legal-card'
    );

    // #stg-legal-card contains Terms & Privacy tabs and panes
    assert.match(html, /id="stg-legal-tab-terms"/, 'Must contain terms tab button');
    assert.match(html, /id="stg-legal-tab-privacy"/, 'Must contain privacy tab button');
    assert.match(html, /id="stg-legal-terms-pane"/, 'Must contain terms pane');
    assert.match(html, /id="stg-legal-privacy-pane"/, 'Must contain privacy pane');

    // Standalone #legal-view is hidden
    assert.match(
      html,
      /<section id="legal-view"[^>]*style="[^"]*display:\s*none\s*!important;?[^"]*"/,
      'Standalone #legal-view must be hidden with display: none !important;'
    );
    assert.match(
      css,
      /#legal-view\s*\{[^}]*display:\s*none\s*!important;/s,
      'admin.css must hide #legal-view with display: none !important;'
    );

    // admin.js wires tab switching and handles #legal route
    assert.match(
      js,
      /function setupSettingsLegalTabs\(\)/,
      'admin.js must define setupSettingsLegalTabs'
    );
    assert.match(
      js,
      /baseRoute === '#legal'/,
      'admin.js handleHashRoute must redirect #legal to settings-view'
    );
  });
});

