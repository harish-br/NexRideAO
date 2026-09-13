import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('PREFERENCES PAGE: Options, Toggles, and Database Sync Verification', async (t) => {
  const htmlPath = path.resolve('index.html');
  const cssPath = path.resolve('css/style.css');
  const profileJsPath = path.resolve('js/profile.js');
  const notifServicePath = path.resolve('js/notifications/notification-service.js');
  const settingSvgPath = path.resolve('assets/setting.svg');

  const html = fs.readFileSync(htmlPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const profileJs = fs.readFileSync(profileJsPath, 'utf8');
  const notifServiceJs = fs.readFileSync(notifServicePath, 'utf8');
  const settingSvg = fs.readFileSync(settingSvgPath, 'utf8');

  await t.test('1. Preference Icon & Profile Navigation Integration', () => {
    // Check setting.svg has blue squircle background, cutout mask, and white horizontal sliders
    assert.match(settingSvg, /fill="#2563EB"/, 'setting.svg must contain #2563EB blue background');
    assert.match(settingSvg, /mask="url\(#pref-cutout\)"/, 'setting.svg must use cutout mask to prevent solid blue blocking');
    assert.match(settingSvg, /fill="#FFFFFF"/, 'setting.svg must contain crisp #FFFFFF white horizontal sliders');

    // Check index.html profile options list item
    assert.match(html, /id="btn-preferences"/, 'Profile list must have Preferences button');
    assert.match(html, /setting\.svg/, 'Preferences button must point to setting.svg');

    // Check CSS overrides mask so true SVG colors render directly
    assert.match(css, /#btn-preferences \.pli-icon/, 'CSS must explicitly target #btn-preferences .pli-icon');
    assert.match(css, /-webkit-mask:\s*none/, 'CSS must clear -webkit-mask on preferences icon');
  });

  await t.test('2. Preferences Page DOM Layout & Comprehensive Toggles', () => {
    // Overlay page container
    assert.match(html, /id="preferences-page"/, 'Must contain #preferences-page container');
    assert.match(html, /id="pref-back-btn"/, 'Must contain back navigation button');

    // Verification that sync indicator, system status, and test/reset buttons are removed from UI
    assert.doesNotMatch(html, /id="pref-sync-indicator"/, 'Must NOT show Firestore sync indicator inside preferences UI');
    assert.doesNotMatch(html, /id="pref-browser-perm-status"/, 'Must NOT contain system permission status badge');
    assert.doesNotMatch(html, /id="pref-btn-request-perm"/, 'Must NOT contain permission request button');
    assert.doesNotMatch(html, /id="pref-btn-test-notif"/, 'Must NOT contain Send Test Notification button');
    assert.doesNotMatch(html, /id="pref-btn-reset-defaults"/, 'Must NOT contain Reset to Defaults button');

    // Section 1: Notifications & Alerts
    assert.match(html, /id="pref-toggle-notifications"/, 'Must contain master notifications switch');
    assert.match(html, /id="pref-sub-options"/, 'Must contain sub-options container for cascading enable/disable');
    assert.match(html, /id="pref-toggle-bus-alerts"/, 'Must contain Bus Arrival & Proximity Alerts toggle');
    assert.match(html, /id="pref-toggle-delay-alerts"/, 'Must contain Route Delay & Detour Alerts toggle');
    assert.match(html, /id="pref-toggle-announcements"/, 'Must contain Campus Announcements toggle');
    assert.match(html, /id="pref-toggle-safety-alerts"/, 'Must contain Safety Advisories toggle');
    assert.match(html, /id="pref-toggle-sound"/, 'Must contain Sound & Audio Chimes toggle');

    // Section 2: Transit & Commute Experience
    assert.match(html, /id="pref-toggle-live-eta"/, 'Must contain Live ETA Auto-Refresh toggle');
    assert.match(html, /id="pref-toggle-offline-cache"/, 'Must contain Auto-Cache Offline Routes toggle');
    assert.match(html, /id="pref-toggle-data-saver"/, 'Must contain Low Data / Battery Saver toggle');

    // Section 3: App & Accessibility
    assert.match(html, /id="pref-toggle-high-contrast"/, 'Must contain High-Contrast E-Pass Display toggle');
    assert.match(html, /id="pref-toggle-haptics"/, 'Must contain Haptic Feedback toggle');
  });

  await t.test('3. State Persistence, Cloud Firestore Synchronization & Cascading Logic', () => {
    // Default preferences object
    assert.match(profileJs, /DEFAULT_PREFERENCES\s*=\s*\{/, 'profile.js must declare DEFAULT_PREFERENCES');
    assert.match(profileJs, /notificationsEnabled:\s*true/, 'notificationsEnabled defaults to true');
    assert.match(profileJs, /busAlerts:\s*true/, 'busAlerts defaults to true');
    assert.match(profileJs, /delayAlerts:\s*true/, 'delayAlerts defaults to true');
    assert.match(profileJs, /sound:\s*true/, 'sound defaults to true');
    assert.match(profileJs, /hapticFeedback:\s*true/, 'hapticFeedback defaults to true');

    // LocalStorage caching
    assert.match(profileJs, /localStorage\.setItem\('nexride_user_profile'/, 'Preferences must be saved immediately to localStorage');

    // Firestore sync
    assert.match(profileJs, /setDoc\(userDocRef,\s*\{\s*preferences:\s*currentPreferences/, 'Preferences must be merged into Firestore user document');
    assert.match(profileJs, /merge:\s*true/, 'Firestore write must use merge: true to avoid overwriting other user profile fields');

    // Master notifications toggle cascade
    assert.match(profileJs, /prefToggleNotifications\.addEventListener\('change'/, 'Must have change listener on master notification switch');
    assert.match(profileJs, /prefSubOptions\.style\.opacity/, 'Must dim sub-options when master notifications switch is OFF');
    assert.match(profileJs, /prefSubOptions\.style\.pointerEvents/, 'Must disable click interaction on sub-options when master switch is OFF');
  });

  await t.test('4. Real-Time Notification Client Integration with User Preferences', () => {
    // showInAppToast preference checks
    assert.match(notifServiceJs, /prefs\.notificationsEnabled === false/, 'Notification service must suppress toast when master notifications are OFF');
    assert.match(notifServiceJs, /prefs\.busAlerts === false/, 'Notification service must filter bus alerts when busAlerts preference is OFF');
    assert.match(notifServiceJs, /prefs\.delayAlerts === false/, 'Notification service must filter delay alerts when delayAlerts preference is OFF');
    assert.match(notifServiceJs, /prefs\.announcements === false/, 'Notification service must filter announcements when announcements preference is OFF');
    assert.match(notifServiceJs, /prefs\.safetyAlerts === false/, 'Notification service must filter safety alerts when safetyAlerts preference is OFF');

    // Audio & Haptic feedback checks
    assert.match(notifServiceJs, /prefs\.sound !== false/, 'Notification service must check sound preference before playing chime');
    assert.match(notifServiceJs, /prefs\.hapticFeedback !== false/, 'Notification service must check hapticFeedback preference before vibrating');
  });
});
