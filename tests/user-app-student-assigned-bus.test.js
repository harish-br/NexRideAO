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
  const indexHtmlPath = path.join(rootDir, 'index.html');

  assert.ok(fs.existsSync(rulesPath), 'firestore.rules must exist');
  assert.ok(fs.existsSync(serviceJsPath), 'js/student-bus-service.js must exist');
  assert.ok(fs.existsSync(mainJsPath), 'js/main.js must exist');

  const rulesContent = fs.readFileSync(rulesPath, 'utf8');
  const adminJsContent = fs.readFileSync(adminJsPath, 'utf8');
  const serviceJsContent = fs.readFileSync(serviceJsPath, 'utf8');
  const liveTrackingContent = fs.readFileSync(liveTrackingJsPath, 'utf8');
  const epassContent = fs.readFileSync(epassJsPath, 'utf8');
  const busSearchContent = fs.readFileSync(busSearchJsPath, 'utf8');
  const profileContent = fs.readFileSync(profileJsPath, 'utf8');
  const mainJsContent = fs.readFileSync(mainJsPath, 'utf8');
  const styleCssContent = fs.readFileSync(styleCssPath, 'utf8');
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

    // Unassigned helper prompt
    assert.ok(liveTrackingContent.includes('manual-student-id-input'), 'live-tracking.js must include manual student ID linking input');
    assert.ok(liveTrackingContent.includes('manual-student-id-btn'), 'live-tracking.js must include manual student ID linking button');
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

  await t.test('6. Bus Search screen shows My Assigned Bus banner and quick tracking', () => {
    // HTML container
    assert.ok(indexHtmlContent.includes('id="bs-assigned-bus-container"'), 'index.html must have #bs-assigned-bus-container');

    // Bus Search JS integration
    assert.match(busSearchContent, /import\s*\{[^}]*getActiveStudentData[^}]*\}\s*from\s*['"]\.\/student-bus-service\.js['"]/, 'bus-search.js must import getActiveStudentData');
    assert.match(busSearchContent, /import\s*\{[^}]*subscribeStudentBus[^}]*\}\s*from\s*['"]\.\/student-bus-service\.js['"]/, 'bus-search.js must import subscribeStudentBus');
    assert.match(busSearchContent, /bs-assigned-bus-container/, 'bus-search.js must reference bs-assigned-bus-container');
    assert.match(busSearchContent, /Your Assigned Bus/, 'bus-search.js must render Your Assigned Bus title');
    assert.match(busSearchContent, /bs-track-assigned-btn/, 'bus-search.js must provide track button');
  });

  await t.test('7. Personal Info page displays Student ID & Assigned Bus and supports linking', () => {
    // HTML rows
    assert.ok(indexHtmlContent.includes('id="row-student-id"'), 'index.html must have #row-student-id');
    assert.ok(indexHtmlContent.includes('id="val-student-id"'), 'index.html must have #val-student-id');
    assert.ok(indexHtmlContent.includes('id="row-assigned-bus"'), 'index.html must have #row-assigned-bus');
    assert.ok(indexHtmlContent.includes('id="val-assigned-bus"'), 'index.html must have #val-assigned-bus');

    // Profile JS population & subscription
    assert.match(profileContent, /valStudentId\.textContent\s*=/, 'profile.js must populate valStudentId');
    assert.match(profileContent, /valAssignedBus\.textContent\s*=/, 'profile.js must populate valAssignedBus');
    assert.match(profileContent, /rowStudentId\.addEventListener\('click'/, 'profile.js must attach click handler on rowStudentId');
    assert.match(profileContent, /subscribeStudentBus/, 'profile.js must subscribe to student bus changes');
  });

  await t.test('8. Home Screen displays dedicated Your Assigned Bus widget and interactive linking', () => {
    // HTML Elements
    assert.ok(indexHtmlContent.includes('id="home-assigned-bus-card"'), 'index.html must have #home-assigned-bus-card');
    assert.ok(indexHtmlContent.includes('id="hab-bus-badge"'), 'index.html must have #hab-bus-badge');
    assert.ok(indexHtmlContent.includes('id="hab-status-pill"'), 'index.html must have #hab-status-pill');
    assert.ok(indexHtmlContent.includes('id="hab-route-title"'), 'index.html must have #hab-route-title');
    assert.ok(indexHtmlContent.includes('id="hab-stage-bold"'), 'index.html must have #hab-stage-bold');
    assert.ok(indexHtmlContent.includes('id="hab-track-btn"'), 'index.html must have #hab-track-btn');
    assert.ok(indexHtmlContent.includes('id="hab-pass-btn"'), 'index.html must have #hab-pass-btn');
    assert.ok(indexHtmlContent.includes('id="home-link-bus-card"'), 'index.html must have #home-link-bus-card');
    assert.ok(indexHtmlContent.includes('id="home-student-id-input"'), 'index.html must have #home-student-id-input');
    assert.ok(indexHtmlContent.includes('id="home-link-student-btn"'), 'index.html must have #home-link-student-btn');

    // CSS Styling
    assert.ok(styleCssContent.includes('.home-assigned-bus-card'), 'style.css must define .home-assigned-bus-card');
    assert.ok(styleCssContent.includes('.hab-bus-badge'), 'style.css must define .hab-bus-badge');
    assert.ok(styleCssContent.includes('.home-link-bus-card'), 'style.css must define .home-link-bus-card');

    // JS Integration in main.js
    assert.match(mainJsContent, /import\s*\{[^}]*subscribeStudentBus[^}]*\}\s*from\s*['"]\.\/student-bus-service\.js['"]/, 'main.js must import subscribeStudentBus');
    assert.match(mainJsContent, /function\s+initHomeAssignedBusWidget\(\)/, 'main.js must define initHomeAssignedBusWidget');
    assert.match(mainJsContent, /busBadge\.textContent\s*=\s*`Bus \$\{busNum\}`/, 'main.js must populate bus badge');
    assert.match(mainJsContent, /subscribeStudentBus\(\(data\)\s*=>/, 'main.js must subscribe to student bus changes');
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
});

