import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('ADMIN DASHBOARD SKELETON LOADING SYSTEM: Comprehensive Verification', async (t) => {
  const adminJsPath = path.resolve('admin/admin.js');
  const adminCssPath = path.resolve('admin/admin.css');
  const adminHtmlPath = path.resolve('admin/index.html');

  assert.ok(fs.existsSync(adminJsPath), 'admin/admin.js must exist');
  assert.ok(fs.existsSync(adminCssPath), 'admin/admin.css must exist');
  assert.ok(fs.existsSync(adminHtmlPath), 'admin/index.html must exist');

  const jsContent = fs.readFileSync(adminJsPath, 'utf8');
  const cssContent = fs.readFileSync(adminCssPath, 'utf8');
  const htmlContent = fs.readFileSync(adminHtmlPath, 'utf8');

  await t.test('1. Shimmer Animation & Apple-style CSS Palette', () => {
    // Keyframe shimmer
    assert.match(cssContent, /@keyframes\s+adminSkeletonShimmer/, 'Must define @keyframes adminSkeletonShimmer');
    assert.match(cssContent, /@keyframes\s+skeleton-shimmer/, 'Must define @keyframes skeleton-shimmer');

    // Subtle neutral palette (#F1F3F5 to #FAFAFA)
    assert.match(cssContent, /#F1F3F5/i, 'Must use #F1F3F5 base skeleton tone');
    assert.match(cssContent, /#FAFAFA/i, 'Must use #FAFAFA soft highlight tone');

    // Animation timing and sweep
    assert.match(cssContent, /animation:\s*adminSkeletonShimmer\s+1\.8s\s+ease-in-out\s+infinite/, '1.8s infinite loop shimmer');
    assert.match(cssContent, /background-size:\s*200%\s*100%/, '200% sweep background size');

    // Accessibility prefers-reduced-motion
    assert.match(cssContent, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, 'Supports prefers-reduced-motion');
    assert.match(cssContent, /\.skeleton\s*\{\s*animation:\s*none/i, 'Disables shimmer on reduced motion');
  });

  await t.test('2. HTML Initial Skeleton Structure & Layout Shift Prevention', () => {
    // #dashboard-view has aria-busy="true"
    assert.match(htmlContent, /<section\s+id="dashboard-view"[^>]*aria-busy="true"/, 'Must have aria-busy="true" on #dashboard-view initially');

    // Title skeleton
    assert.match(htmlContent, /id="dashboard-title-skeleton"[^>]*aria-hidden="true"/, 'Must have #dashboard-title-skeleton with aria-hidden="true"');
    assert.match(htmlContent, /id="dashboard-title-text"[^>]*class="[^"]*hidden[^"]*"/, 'Real title is hidden during initial load');

    // KPI cards in Row 1 & Row 2
    const statCardIds = [
      'card-total-places',
      'card-total-routes',
      'card-scheduled-trips',
      'card-active-services',
      'card-inactive-services'
    ];
    for (const cardId of statCardIds) {
      const cardRegex = new RegExp(`id="${cardId}"[\\s\\S]*?class="stat-skeleton"[\\s\\S]*?class="stat-content hidden"`, 'i');
      assert.match(htmlContent, cardRegex, `Card #${cardId} must contain initial stat-skeleton and hidden stat-content`);
    }

    // Recent updates skeleton rows
    assert.match(htmlContent, /id="recent-updates-list"[^>]*>[\s\S]*?skeleton-activity-item/, 'Recent updates has skeleton rows');

    // System status skeleton and content
    assert.match(htmlContent, /id="system-status-skeleton"[^>]*aria-hidden="true"/, 'System status skeleton has aria-hidden="true"');
    assert.match(htmlContent, /id="system-status-content"[^>]*class="[^"]*hidden[^"]*"/, 'System status real content is hidden initially');
  });

  await t.test('3. JavaScript Generator Functions & Global Window Exposure', () => {
    // Generators
    assert.match(jsContent, /function getDashboardTitleSkeletonHTML\(\)/, 'Must define getDashboardTitleSkeletonHTML');
    assert.match(jsContent, /function getKPICardSkeletonHTML\(labelWidth/, 'Must define getKPICardSkeletonHTML');
    assert.match(jsContent, /function getRecentUpdatesSkeletonHTML\(count/, 'Must define getRecentUpdatesSkeletonHTML');
    assert.match(jsContent, /function getSystemStatusSkeletonHTML\(\)/, 'Must define getSystemStatusSkeletonHTML');
    assert.match(jsContent, /function getDashboardSkeletonHTML\(\)/, 'Must define getDashboardSkeletonHTML');

    // Render toggles
    assert.match(jsContent, /function renderDashboardSkeleton\(\)/, 'Must define renderDashboardSkeleton');
    assert.match(jsContent, /function renderDashboardLoaded\(\)/, 'Must define renderDashboardLoaded');

    // Window exposures
    assert.match(jsContent, /window\.getDashboardTitleSkeletonHTML\s*=/, 'Exposes getDashboardTitleSkeletonHTML');
    assert.match(jsContent, /window\.getKPICardSkeletonHTML\s*=/, 'Exposes getKPICardSkeletonHTML');
    assert.match(jsContent, /window\.getRecentUpdatesSkeletonHTML\s*=/, 'Exposes getRecentUpdatesSkeletonHTML');
    assert.match(jsContent, /window\.getSystemStatusSkeletonHTML\s*=/, 'Exposes getSystemStatusSkeletonHTML');
    assert.match(jsContent, /window\.getDashboardSkeletonHTML\s*=/, 'Exposes getDashboardSkeletonHTML');
    assert.match(jsContent, /window\.renderDashboardSkeleton\s*=/, 'Exposes renderDashboardSkeleton');
    assert.match(jsContent, /window\.renderDashboardLoaded\s*=/, 'Exposes renderDashboardLoaded');
  });

  await t.test('4. Data Integration & Loading Lifecycle State Machine', () => {
    // State flag
    assert.match(jsContent, /let isDashboardLoading\s*=\s*true;/, 'isDashboardLoading initialized to true');

    // renderDashboardStats checks loading flags
    assert.match(jsContent, /if \(isDashboardLoading\)\s*\{[\s\S]*?!busesLoaded\s*\|\|\s*!routesLoaded[\s\S]*?renderDashboardSkeleton\(\);/, 'renderDashboardStats guards with busesLoaded and routesLoaded');
    assert.match(jsContent, /renderDashboardLoaded\(\);/, 'Transitions to loaded once required data arrives');

    // Listeners resolve on errors to avoid indefinite hanging
    assert.match(jsContent, /listenToBuses[\s\S]*?busesLoaded\s*=\s*true;[\s\S]*?renderDashboardStats\(\);/, 'listenToBuses error handler marks busesLoaded = true');
    assert.match(jsContent, /listenToRoutes[\s\S]*?routesLoaded\s*=\s*true;[\s\S]*?renderDashboardStats\(\);/, 'listenToRoutes error handler marks routesLoaded = true');
  });
});
