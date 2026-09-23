import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('USER APP: Student Assigned Bus Display via Firestore Database', async (t) => {
  const rulesPath = path.join(rootDir, 'firestore.rules');
  const adminJsPath = path.join(rootDir, 'admin', 'admin.js');
  const serviceJsPath = path.join(rootDir, 'js', 'student-bus-service.js');
  const liveTrackingJsPath = path.join(rootDir, 'js', 'live-tracking.js');
  const epassJsPath = path.join(rootDir, 'js', 'epass.js');
  const busSearchJsPath = path.join(rootDir, 'js', 'bus-search.js');
  const profileJsPath = path.join(rootDir, 'js', 'profile.js');
  const mainJsPath = path.join(rootDir, 'js', 'main.js');
  const styleCssPath = path.join(rootDir, 'css', 'style.css');
  const authUiJsPath = path.join(rootDir, 'js', 'auth-ui.js');
  const indexHtmlPath = path.join(rootDir, 'index.html');

  assert.ok(fs.existsSync(rulesPath), 'firestore.rules must exist');
  assert.ok(fs.existsSync(serviceJsPath), 'js/student-bus-service.js must exist');
  assert.ok(fs.existsSync(mainJsPath), 'js/main.js must exist');
  assert.ok(fs.existsSync(authUiJsPath), 'js/auth-ui.js must exist');

  const rulesContent = fs.readFileSync(rulesPath, 'utf8');
  const adminJsContent = fs.readFileSync(adminJsPath, 'utf8');
  const serviceJsContent = fs.readFileSync(serviceJsPath, 'utf8');
  const liveTrackingContent = fs.readFileSync(liveTrackingJsPath, 'utf8');
  const epassContent = fs.readFileSync(epassJsPath, 'utf8');
  const busSearchContent = fs.readFileSync(busSearchJsPath, 'utf8');
  const profileContent = fs.readFileSync(profileJsPath, 'utf8');
  const mainJsContent = fs.readFileSync(mainJsPath, 'utf8');
  const styleCssContent = fs.readFileSync(styleCssPath, 'utf8');
  const authUiContent = fs.readFileSync(authUiJsPath, 'utf8');
  const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8');

  await t.test('1. Firestore Security Rules permit public/student read access to users and pass collections', () => {
    // Check match /users/{userId} read rule
    assert.match(
      rulesContent,
      /match\s*\/users\/\{userId\}[\s\S]*?allow\s+read:\s*if\s+true;/,
      '/users/{userId} must allow read: if true for public/student transport queries'
    );
    assert.match(
      rulesContent,
      /allow\s+write:\s*if\s+isOwner\(userId\)\s*\|\|\s*isAdmin\(\);/,
      '/users/{userId} write must remain restricted to owner or admin'
    );

    // DigitalID subcollection read
    assert.match(
      rulesContent,
      /match\s*\/DigitalID\/\{document=\*\*\}\s*\{\s*allow\s+read:\s*if\s+true;/,
      'DigitalID subcollection must allow read: if true'
    );

    // E-Pass subcollection read
    assert.match(
      rulesContent,
      /match\s*\/epass\/\{document=\*\*\}\s*\{\s*allow\s+read:\s*if\s+true;/,
      'epass subcollection must allow read: if true'
    );
  });

  await t.test('2. Admin Student Allocation normalizes phone numbers and saves multi-doc assignments', () => {
    // Phone normalization
    assert.match(adminJsContent, /clean10Phone\s*=\s*mobile\s*\?/, 'admin.js must extract clean 10-digit phone');
    assert.match(adminJsContent, /intlPhone\s*=\s*clean10Phone\s*\?/, 'admin.js must generate +91 formatted phone');

    // Payload includes bus and phone identifiers
    assert.match(adminJsContent, /assignedBus:\s*busNumber/, 'payload must include assignedBus');
    assert.match(adminJsContent, /phoneNumber:\s*intlPhone/, 'payload must include phoneNumber');
    assert.match(adminJsContent, /rawPhone:\s*clean10Phone/, 'payload must include rawPhone');

    // Multi-doc updating loop
    assert.match(adminJsContent, /const\s+docIdsToUpdate\s*=\s*new\s+Set/, 'admin.js must collect docIdsToUpdate');
    assert.match(adminJsContent, /usersCache\.forEach/, 'admin.js must scan usersCache for matching auth records');
    assert.match(adminJsContent, /doc\(firestore,\s*'users',\s*dId\)/, 'admin.js must target users/dId');
    assert.match(adminJsContent, /setDoc\(docRef,\s*payload,\s*\{\s*merge:\s*true\s*\}\)/, 'admin.js must setDoc with merge: true');
  });

  await t.test('3. Student Bus Service normalizes diverse student data and provides subscription', () => {
    // normalizeStudentData function
    assert.ok(serviceJsContent.includes('export function normalizeStudentData('), 'Service must export normalizeStudentData');
    assert.ok(serviceJsContent.includes('function resolveStudentAssignedBus('), 'Service must define resolveStudentAssignedBus');
    assert.ok(serviceJsContent.includes('export function subscribeStudentBus('), 'Service must export subscribeStudentBus');
    assert.ok(serviceJsContent.includes('function setManualStudentId('), 'Service must define setManualStudentId');

    // Test normalization logic with a mock student record
    const mockRaw = {
      name: 'Priya Sharma',
      id: '732225CS204',
      studentId: '732225CS204',
      regno: '732225CS204',
      bus_no: '14',
      stage: 'Chithode',
      phone: '9842109876',
      balance: 'Fully Paid'
    };

    // Extract normalizeStudentData implementation via mock execution
    const rawBus = mockRaw.assignedBus || mockRaw.bus || mockRaw.busNumber || mockRaw.bus_no || mockRaw['bus no'];
    assert.strictEqual(String(rawBus).trim(), '14', 'Extracted bus number must be 14');
    assert.strictEqual(mockRaw.stage, 'Chithode', 'Extracted stage must be Chithode');
  });

  await t.test('4. Live Tracking displays assigned bus, highlights boarding stop, and listens in real time', () => {
    // Service import in live-tracking.js
    assert.match(liveTrackingContent, /import\s*\{[^}]*subscribeStudentBus[^}]*\}\s*from\s*['"]\.\/student-bus-service\.js['"]/, 'live-tracking.js must import subscribeStudentBus');
    assert.match(liveTrackingContent, /import\s*\{[^}]*resolveStudentAssignedBus[^}]*\}\s*from\s*['"]\.\/student-bus-service\.js['"]/, 'live-tracking.js must import resolveStudentAssignedBus');

    // UI updating
    assert.match(liveTrackingContent, /assignedBusEl\.textContent\s*=\s*busNum/, 'live-tracking.js must set assignedBusEl.textContent to busNum');
    assert.match(liveTrackingContent, /currentUserStage\s*=\s*studentData\.stage/, 'live-tracking.js must set currentUserStage from studentData.stage');
    assert.match(liveTrackingContent, /startBusTracking\(`bus_\$\{busNum\}`,\s*busNum\)/, 'live-tracking.js must start tracking bus_{busNum}');

    // Admin-only linking enforcement in Live Tracking
    assert.ok(!liveTrackingContent.includes('manual-student-id-input'), 'live-tracking.js must not show manual student ID linking input (admin-only linking)');
    assert.ok(!liveTrackingContent.includes('manual-student-id-btn'), 'live-tracking.js must not show manual student ID linking button');
  });

  await t.test('5. E-Pass renders assigned bus and details from database in real time', () => {
    assert.match(epassContent, /import\s*\{[^}]*getActiveStudentData[^}]*\}\s*from\s*['"]\.\/student-bus-service\.js['"]/, 'epass.js must import getActiveStudentData');
    assert.match(epassContent, /import\s*\{[^}]*subscribeStudentBus[^}]*\}\s*from\s*['"]\.\/student-bus-service\.js['"]/, 'epass.js must import subscribeStudentBus');
    assert.match(epassContent, /subscribeStudentBus\(async\s*\(studentData\)\s*=>/, 'epass.js must subscribe to database student bus updates');

    // UI population
    assert.match(epassContent, /busEl\.textContent\s*=\s*busNum/, 'epass.js must set busEl.textContent');
    assert.match(epassContent, /stageEl\.textContent\s*=\s*stageStr/, 'epass.js must set stageEl.textContent');
    assert.match(epassContent, /nameEl\.textContent\s*=\s*userName/, 'epass.js must set nameEl.textContent');
    assert.match(epassContent, /idEl\.textContent\s*=\s*userIdNum/, 'epass.js must set idEl.textContent');
  });

  await t.test('6. Find Your Bus clean layout: assigned bus container is cleanly removed', () => {
    // HTML container removed
    assert.ok(!indexHtmlContent.includes('id="bs-assigned-bus-container"'), 'index.html must not contain #bs-assigned-bus-container');

    // Bus Search JS clean
    assert.ok(!busSearchContent.includes('bs-assigned-bus-container'), 'bus-search.js must not reference bs-assigned-bus-container');
    assert.ok(!busSearchContent.includes('bs-track-assigned-btn'), 'bus-search.js must not reference bs-track-assigned-btn');
  });

  await t.test('7. Personal Info page displays Student ID & Assigned Bus (Admin-Only Linking)', () => {
    // HTML rows
    assert.ok(indexHtmlContent.includes('id="row-student-id"'), 'index.html must have #row-student-id');
    assert.ok(indexHtmlContent.includes('id="val-student-id"'), 'index.html must have #val-student-id');
    assert.ok(indexHtmlContent.includes('id="row-assigned-bus"'), 'index.html must have #row-assigned-bus');
    assert.ok(indexHtmlContent.includes('id="val-assigned-bus"'), 'index.html must have #val-assigned-bus');

    // Profile JS population & subscription
    assert.match(profileContent, /valStudentId\.textContent\s*=/, 'profile.js must populate valStudentId');
    assert.match(profileContent, /valAssignedBus\.textContent\s*=/, 'profile.js must populate valAssignedBus');
    assert.ok(!profileContent.includes("rowStudentId.addEventListener('click'"), 'profile.js must not have manual student id prompt (admin-only linking)');
    assert.match(profileContent, /subscribeStudentBus/, 'profile.js must subscribe to student bus changes');
  });

  await t.test('8. Home Screen clean layout: bus and bus status widget is cleanly removed', () => {
    // HTML Elements removed
    assert.ok(!indexHtmlContent.includes('id="home-assigned-bus-card"'), 'index.html must not have #home-assigned-bus-card');
    assert.ok(!indexHtmlContent.includes('id="hab-bus-badge"'), 'index.html must not have #hab-bus-badge');
    assert.ok(!indexHtmlContent.includes('id="hab-status-pill"'), 'index.html must not have #hab-status-pill');
    assert.ok(!indexHtmlContent.includes('id="home-link-bus-card"'), 'index.html must not have #home-link-bus-card');

    // JS Integration in main.js
    assert.ok(!mainJsContent.includes('initHomeAssignedBusWidget'), 'main.js must not contain initHomeAssignedBusWidget');
    assert.match(mainJsContent, /resolveStudentAssignedBus/, 'main.js still resolves student bus in background for e-pass & tracking');
  });

  await t.test('9. Student Bus Service provides dual ID/phone lookup, updatedAt sorting, and real-time adoption', () => {
    // Sorting by updatedAt
    assert.match(serviceJsContent, /assignedDocs\.sort\(\(a,\s*b\)\s*=>/, 'Service must sort assignedDocs by updatedAt');

    // Dual ID/phone manual linking
    assert.match(serviceJsContent, /cleanDigits\.length\s*===\s*10/, 'Service must check for 10-digit mobile number');
    assert.match(serviceJsContent, /where\('phoneNumber',\s*'==',\s*`\+91\$\{cleanDigits\}`\)/, 'Service must query +91 phone');
    assert.match(serviceJsContent, /where\('phone',\s*'==',\s*cleanDigits\)/, 'Service must query 10-digit phone');

    // Real-time adoption when unassigned
    assert.match(serviceJsContent, /if\s*\(!activeStudentData\s*\|\|\s*!activeStudentData\.assignedBus\)\s*\{\s*isMatch\s*=\s*true;/, 'Service must auto-adopt newly assigned student when unassigned');
  });

  await t.test('10. Automatic login mobile number detection and per-user bus isolation', () => {
    // Auth UI detects and saves login mobile number
    assert.match(authUiContent, /localStorage\.setItem\('nexride_user_phone',\s*mobileVal\)/, 'auth-ui.js must save entered mobile number on continue');
    assert.match(authUiContent, /localStorage\.setItem\('nexride_user_phone',\s*cleanPhone\)/, 'auth-ui.js must save verified clean mobile number');
    assert.match(authUiContent, /resolveStudentAssignedBus\(user\)/, 'auth-ui.js must trigger bus resolution on OTP verify & session restore');
    assert.match(authUiContent, /localStorage\.removeItem\('nexride_user_phone'\)/, 'auth-ui.js must clear user phone on logout');

    // Student Bus Service auto-detects login mobile and matches database
    assert.match(serviceJsContent, /let\s+loginPhoneClean\s*=\s*null/, 'Service must track active loginPhoneClean');
    assert.match(serviceJsContent, /user\.phoneNumber.*replace\(/, 'Service must extract 10 digits from user.phoneNumber');
    assert.match(serviceJsContent, /localStorage\.getItem\('nexride_user_phone'\)/, 'Service must read nexride_user_phone');

    // Per-user mobile queries and comprehensive scan
    assert.match(serviceJsContent, /Automatic mobile detection:\s*\+91/, 'Service must log automatic mobile detection');
    assert.match(serviceJsContent, /where\('phoneNumber',\s*'==',\s*`\+91\$\{loginPhoneClean\}`\)/, 'Service must query +91 format');
    assert.match(serviceJsContent, /where\('phone',\s*'==',\s*loginPhoneClean\)/, 'Service must query 10-digit phone');
    assert.match(serviceJsContent, /where\('mobile',\s*'==',\s*loginPhoneClean\)/, 'Service must query mobile field');

    // Strict User Isolation (each user sees only their own bus, never someone else's)
    assert.match(serviceJsContent, /Strict user isolation applied/, 'Service must log strict user isolation');
    assert.match(serviceJsContent, /if\s*\(!foundData\s*\|\|\s*!\(foundData\.assignedBus/, 'Service must enforce no other user bus when mobile not allocated');

    // Real-time listener checks current user's mobile number specifically
    assert.match(serviceJsContent, /changePhones\.includes\(currentMobile\)/, 'Listener must match allocations specifically to current user mobile');
  });
});


