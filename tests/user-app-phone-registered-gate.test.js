import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('USER APP: Registered Phone Database Gate & No Basic Details for Unregistered Numbers', async (t) => {
  const indexHtmlPath = path.join(rootDir, 'index.html');
  const styleCssPath = path.join(rootDir, 'css', 'style.css');
  const authUiPath = path.join(rootDir, 'js', 'auth-ui.js');
  const servicePath = path.join(rootDir, 'js', 'student-bus-service.js');
  const profilePath = path.join(rootDir, 'js', 'profile.js');

  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  const styleCss = fs.readFileSync(styleCssPath, 'utf8');
  const authUi = fs.readFileSync(authUiPath, 'utf8');
  const serviceJs = fs.readFileSync(servicePath, 'utf8');
  const profileJs = fs.readFileSync(profilePath, 'utf8');

  await t.test('1. index.html contains phone-input-group, mobile-input, and mobile-error element', () => {
    assert.ok(indexHtml.includes('id="phone-input-group"'), 'index.html must have #phone-input-group');
    assert.ok(indexHtml.includes('id="mobile-input"'), 'index.html must have #mobile-input');
    assert.ok(indexHtml.includes('id="mobile-error"'), 'index.html must have #mobile-error');
    assert.match(indexHtml, /id="mobile-error"[^>]*class="[^"]*error-text[^"]*hidden/, 'mobile-error must start hidden with error-text class');
  });

  await t.test('2. css/style.css defines error state styling for phone-input-group', () => {
    assert.match(styleCss, /\.phone-input-group\.error/, 'style.css must define .phone-input-group.error');
    assert.match(styleCss, /border-color:\s*#EF4444/, 'error state must highlight border in red');
  });

  await t.test('3. student-bus-service.js exports isPhoneNumberRegistered function', () => {
    assert.match(serviceJs, /export\s+async\s+function\s+isPhoneNumberRegistered\(/, 'student-bus-service.js must export isPhoneNumberRegistered');
    assert.match(serviceJs, /clean10\.length\s*!==\s*10/, 'isPhoneNumberRegistered must enforce 10-digit number format');
    assert.match(serviceJs, /query\(collection\(firestore,\s*'users'\),\s*where\('phone'/, 'must query phone field');
    assert.match(serviceJs, /query\(collection\(firestore,\s*'users'\),\s*where\('mobile'/, 'must query mobile field');
    assert.match(serviceJs, /query\(collection\(firestore,\s*'users'\),\s*where\('phoneNumber'/, 'must query phoneNumber field');
    assert.match(serviceJs, /window\.isPhoneNumberRegistered\s*=\s*isPhoneNumberRegistered/, 'must expose isPhoneNumberRegistered globally');
  });

  await t.test('4. auth-ui.js imports isPhoneNumberRegistered and enforces database check before OTP dispatch', () => {
    assert.match(authUi, /import\s*\{[^}]*isPhoneNumberRegistered[^}]*\}\s*from\s*['"]\.\/student-bus-service\.js['"]/, 'auth-ui.js must import isPhoneNumberRegistered');
    assert.match(authUi, /const\s+regCheck\s*=\s*await\s+isPhoneNumberRegistered\(mobileVal\)/, 'continueBtn must await isPhoneNumberRegistered(mobileVal)');
    assert.match(authUi, /if\s*\(!regCheck\.registered\)\s*\{[\s\S]*?showMobileError\(/, 'must show mobile error when number not registered');
    assert.match(authUi, /return;\s*\/\/\s*Strictly\s+reject/, 'must abort before OTP sending when number is not registered');
  });

  await t.test('5. auth-ui.js guards OTP verification and restored session against unregistered numbers', () => {
    assert.match(authUi, /const\s+regCheck\s*=\s*await\s+isPhoneNumberRegistered\(cleanPhone,\s*user\.uid\)/, 'must verify cleanPhone registration in verifyOtpBtn');
    assert.match(authUi, /await\s+signOut\(auth\);[\s\S]*?showMobileError\(/, 'must sign out unregistered user and display error');
  });

  await t.test('6. profile.js does NOT prompt unregistered or new users for basic details automatically', () => {
    assert.ok(!profileJs.includes('openUpdateProfile(true)'), 'profile.js must NOT automatically open update profile / ask for basic details');
  });

  await t.test('7. auth-ui.js avoids native alert() modals and displays errors inline via showMobileError', () => {
    assert.ok(!authUi.includes('alert('), 'auth-ui.js must NOT call window.alert() which creates modal popups on mobile');
    assert.match(authUi, /showMobileError\("This mobile number is not registered in the system\. Please contact your transport administrator\."\)/, 'must display transport administrator error message');
    assert.match(authUi, /continueBtn\.disabled\s*=\s*\(mobileInput\?\.value\.replace/, 'finally block must preserve error state and not clear it');
  });

  await t.test('8. public/sw.js uses Network-First strategy for scripts and bumped cache version', () => {
    const swPath = path.join(rootDir, 'public', 'sw.js');
    const swJs = fs.readFileSync(swPath, 'utf8');
    assert.match(swJs, /CACHE_NAME\s*=\s*'nexride-shell-v2'/, 'sw.js must be bumped to v2');
    assert.match(swJs, /url\.pathname\.endsWith\('\.js'\)/, 'sw.js must intercept .js requests');
    assert.match(swJs, /fetch\(event\.request\)\s*\.then\(\(networkResponse\)\s*=>[\s\S]*?\.catch\(\(\)\s*=>\s*caches\.match\(event\.request\)\)/, 'sw.js must use Network-First for scripts');
  });

  await t.test('9. student-bus-service.js rejects registration checks when Firestore is unavailable', () => {
    assert.match(serviceJs, /reason:\s*'database_unavailable'/, 'must not return registered: true when firestore is uninitialized');
  });
});
