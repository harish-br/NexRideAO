import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('SETTINGS CATEGORY ACCESS: Vertical alignment, specific button access & removal of All Settings', async (t) => {
  const adminHtmlPath = path.resolve('admin/index.html');
  const adminCssPath = path.resolve('admin/admin.css');
  const adminJsPath = path.resolve('admin/admin.js');
  const userHtmlPath = path.resolve('index.html');
  const profileJsPath = path.resolve('js/profile.js');

  const adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');
  const adminCss = fs.readFileSync(adminCssPath, 'utf8');
  const adminJs = fs.readFileSync(adminJsPath, 'utf8');
  const userHtml = fs.readFileSync(userHtmlPath, 'utf8');
  const profileJs = fs.readFileSync(profileJsPath, 'utf8');

  await t.test('1. Admin Settings: All Settings option is removed and General is default active', () => {
    // Assert All Settings is removed
    assert.doesNotMatch(adminHtml, /id="stg-cat-all"/, 'admin/index.html must NOT contain All Settings button');
    assert.doesNotMatch(adminHtml, /<span>All Settings<\/span>/, 'admin/index.html must NOT contain All Settings text');
    assert.doesNotMatch(adminJs, /currentSettingsCategory\s*=\s*['"]all['"]/, 'admin.js must NOT default to "all"');

    // Assert General is default active
    assert.match(adminHtml, /<button[^>]*class="[^"]*active[^"]*"[^>]*data-stg-cat="general"/, 'stg-cat-general must be active by default');
    assert.match(adminJs, /currentSettingsCategory\s*=\s*['"]general['"]/, 'admin.js must default currentSettingsCategory to "general"');
  });

  await t.test('2. Admin Settings: Vertical category alignment and layout', () => {
    // Assert vertical 2-column layout container
    assert.match(adminHtml, /class="stg-layout"/, 'admin/index.html must contain .stg-layout wrapper');
    assert.match(adminHtml, /class="stg-main-pane"/, 'admin/index.html must contain .stg-main-pane');

    // Assert CSS defines vertical grid and column flex for navigation
    assert.match(adminCss, /\.stg-layout\s*\{[^}]*grid-template-columns:\s*240px\s+1fr/s, 'admin.css must define 2-column stg-layout');
    assert.match(adminCss, /\.stg-category-nav\s*\{[^}]*flex-direction:\s*column/s, 'admin.css must vertically align category buttons');

    // Assert Danger Zone is completely removed
    assert.doesNotMatch(adminHtml, /id="stg-cat-danger"/, 'admin/index.html must NOT contain Danger Zone button');
    assert.doesNotMatch(adminHtml, /class="stg-danger-zone"/, 'admin/index.html must NOT contain Danger Zone card');
    assert.doesNotMatch(adminHtml, /id="stg-danger-modal"/, 'admin/index.html must NOT contain Danger Zone modal');

    // Assert all specific category buttons exist
    const expectedCategories = ['general', 'system', 'reports', 'notifications', 'permissions', 'security', 'audit', 'data', 'legal'];
    for (const cat of expectedCategories) {
      assert.match(adminHtml, new RegExp(`data-stg-cat="${cat}"`), `admin/index.html must contain button for category: ${cat}`);
    }

    // Assert icon visibility styling
    assert.match(adminCss, /\.stg-cat-icon\s*\{[^}]*mask-size:\s*contain/s, 'admin.css must style stg-cat-icon with mask-size');
    assert.match(adminCss, /\.stg-cat-icon img\s*\{[^}]*display:\s*none/s, 'admin.css must hide raw img to ensure mask renders');
  });

  await t.test('3. Admin Settings: JavaScript category switching & filtering logic', () => {
    assert.match(adminJs, /function setupSettingsCategoryNav\(\)/, 'admin.js must define setupSettingsCategoryNav');
    assert.match(adminJs, /function switchSettingsCategory\(/, 'admin.js must define switchSettingsCategory');
    assert.match(adminJs, /function applySettingsCategoryFilter\(\)/, 'admin.js must define applySettingsCategoryFilter');
  });

  await t.test('4. Mobile User App: Specific category button access (Display, Sound, Notifications, Transit)', () => {
    // Assert All button is removed from mobile preferences
    assert.doesNotMatch(userHtml, /id="pref-cat-all"/, 'index.html must NOT contain All category button in preferences');

    // Assert specific category buttons exist
    assert.match(userHtml, /id="pref-cat-display"/, 'index.html must contain Display button');
    assert.match(userHtml, /id="pref-cat-sound"/, 'index.html must contain Sound button');
    assert.match(userHtml, /id="pref-cat-notifications"/, 'index.html must contain Notifications button');
    assert.match(userHtml, /id="pref-cat-transit"/, 'index.html must contain Transit button');

    // Assert categorical panels exist
    assert.match(userHtml, /data-pref-panel="display"/, 'index.html must contain display panel');
    assert.match(userHtml, /data-pref-panel="sound"/, 'index.html must contain sound panel');
    assert.match(userHtml, /data-pref-panel="notifications"/, 'index.html must contain notifications panel');
    assert.match(userHtml, /data-pref-panel="transit"/, 'index.html must contain transit panel');

    // Assert profile.js switches categories cleanly
    assert.match(profileJs, /function switchPreferencesCategory\(/, 'profile.js must define switchPreferencesCategory');
    assert.match(profileJs, /function setupPreferencesCategoryNav\(\)/, 'profile.js must define setupPreferencesCategoryNav');
  });
});
