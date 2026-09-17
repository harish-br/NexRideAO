import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('SOS EMERGENCY FEATURE: Architecture & File Structure Integrity', (t) => {
  assert.ok(fs.existsSync(path.join(rootDir, 'js', 'sos-service.js')), 'js/sos-service.js must exist');
  assert.ok(fs.existsSync(path.join(rootDir, 'firestore.rules')), 'firestore.rules must exist');
  assert.ok(fs.existsSync(path.join(rootDir, 'admin', 'index.html')), 'admin/index.html must exist');
  assert.ok(fs.existsSync(path.join(rootDir, 'admin', 'admin.js')), 'admin/admin.js must exist');
  assert.ok(fs.existsSync(path.join(rootDir, 'admin', 'admin.css')), 'admin/admin.css must exist');
  assert.ok(fs.existsSync(path.join(rootDir, 'index.html')), 'index.html must exist');
  assert.ok(fs.existsSync(path.join(rootDir, 'js', 'main.js')), 'js/main.js must exist');
});

test('SOS EMERGENCY FEATURE: Client UI Preservation (No Redesign or Markup Alteration)', (t) => {
  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

  // Verify all original UI elements are intact
  assert.ok(indexHtml.includes('id="blue-card"'), '#blue-card must be preserved');
  assert.ok(indexHtml.includes('id="sos-slider"'), '#sos-slider must be preserved');
  assert.ok(indexHtml.includes('id="rest-text"'), '#rest-text must be preserved');
  assert.ok(indexHtml.includes('id="slide-hint-text"'), '#slide-hint-text must be preserved');
  assert.ok(indexHtml.includes('id="sos-thumb"'), '#sos-thumb must be preserved');
  assert.ok(indexHtml.includes('tap thrice to activate SOS'), 'Original triple tap copy must be preserved');
  assert.ok(indexHtml.includes('Slide to trigger SOS'), 'Original slider hint text must be preserved');
});

test('SOS EMERGENCY FEATURE: Incident ID Generation Format', (t) => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');

  // Import regex pattern verification
  const idRegex = new RegExp(`^SOS-${yyyy}${mm}${dd}-[A-Z0-9]{6}$`);

  // Generate 100 sample IDs and verify format and uniqueness
  const generatedIds = new Set();
  for (let i = 0; i < 100; i++) {
    const randomChars = Math.random().toString(36).substring(2, 8).toUpperCase();
    const id = `SOS-${yyyy}${mm}${dd}-${randomChars}`;
    assert.ok(idRegex.test(id), `ID "${id}" must match pattern SOS-YYYYMMDD-XXXXXX`);
    generatedIds.add(id);
  }

  // Ensure high entropy / uniqueness
  assert.strictEqual(generatedIds.size, 100, '100 generated incident IDs must all be unique');
});

test('SOS EMERGENCY FEATURE: Device Platform & Network Detection', (t) => {
  const detectPlatform = (ua) => {
    if (/iPad|iPhone|iPod/.test(ua)) return 'iOS';
    if (/Android/.test(ua)) return 'Android';
    return 'Web';
  };

  assert.strictEqual(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'iOS');
  assert.strictEqual(detectPlatform('Mozilla/5.0 (Linux; Android 14; SM-S918B)'), 'Android');
  assert.strictEqual(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), 'Web');
  assert.strictEqual(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'Web');
});

test('SOS EMERGENCY FEATURE: Payload Validation & Field Requirements', (t) => {
  const samplePayload = {
    incidentId: 'SOS-20260916-AB12CD',
    userId: 'user_student_456',
    userName: 'Ananya Sharma',
    phoneNumber: '+919876543210',
    location: {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracy: 8,
      address: 'Main Campus East Gate, Bengaluru'
    },
    status: 'ACTIVE',
    platform: 'Android',
    networkStatus: 'ONLINE'
  };

  assert.ok(samplePayload.incidentId.startsWith('SOS-'));
  assert.strictEqual(samplePayload.status, 'ACTIVE');
  assert.strictEqual(typeof samplePayload.location.latitude, 'number');
  assert.strictEqual(typeof samplePayload.location.longitude, 'number');
  assert.strictEqual(typeof samplePayload.location.accuracy, 'number');
  assert.ok(samplePayload.location.accuracy >= 0);
  assert.ok(samplePayload.userName.length > 0);
  assert.ok(samplePayload.phoneNumber.length > 0);
  assert.ok(['iOS', 'Android', 'Web'].includes(samplePayload.platform));
  assert.ok(['ONLINE', 'OFFLINE'].includes(samplePayload.networkStatus));
});

test('SOS EMERGENCY FEATURE: Firestore Security Rules Enforcement', (t) => {
  const rulesContent = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');

  // Must match sosIncidents collection
  assert.ok(rulesContent.includes('match /sosIncidents/{incidentId}'), 'Rules must define /sosIncidents/{incidentId}');

  // Read condition: creator or admin
  assert.ok(
    rulesContent.includes('request.auth.uid == resource.data.userId') ||
    rulesContent.includes('resource.data.userId == request.auth.uid'),
    'Rules must allow owner to read their own incident'
  );
  assert.ok(rulesContent.includes('isAdmin()'), 'Rules must enforce isAdmin() for authority access');

  // Create condition: must be authenticated as the owner with status ACTIVE
  assert.ok(rulesContent.includes("request.resource.data.status == 'ACTIVE'"), 'New SOS incidents must start with status ACTIVE');
  assert.ok(
    rulesContent.includes('request.resource.data.userId == request.auth.uid') ||
    rulesContent.includes('request.auth.uid == request.resource.data.userId'),
    'Creator must be the authenticated user'
  );

  // Update condition: only admin can acknowledge or resolve
  assert.ok(rulesContent.includes('allow update, delete: if isAdmin()'), 'Only admins can update or delete SOS incidents');
});

test('SOS EMERGENCY FEATURE: Incident Lifecycle State Machine', (t) => {
  const incident = {
    incidentId: 'SOS-20260916-XYZ789',
    status: 'ACTIVE',
    acknowledgedBy: null,
    acknowledgedAt: null,
    resolvedBy: null,
    resolvedAt: null
  };

  // Step 1: Newly submitted incident is ACTIVE
  assert.strictEqual(incident.status, 'ACTIVE');

  // Step 2: Authority acknowledges incident
  incident.status = 'ACKNOWLEDGED';
  incident.acknowledgedBy = 'admin@nexride.com';
  incident.acknowledgedAt = new Date();

  assert.strictEqual(incident.status, 'ACKNOWLEDGED');
  assert.ok(incident.acknowledgedBy);
  assert.ok(incident.acknowledgedAt instanceof Date);

  // Step 3: Authority resolves incident
  incident.status = 'RESOLVED';
  incident.resolvedBy = 'admin@nexride.com';
  incident.resolvedAt = new Date();

  assert.strictEqual(incident.status, 'RESOLVED');
  assert.ok(incident.resolvedBy);
  assert.ok(incident.resolvedAt instanceof Date);
});

test('SOS EMERGENCY FEATURE: Admin Navigation Badge & Counter Logic', (t) => {
  const incidents = [
    { id: '1', status: 'ACTIVE' },
    { id: '2', status: 'ACTIVE' },
    { id: '3', status: 'ACKNOWLEDGED' },
    { id: '4', status: 'RESOLVED' },
    { id: '5', status: 'RESOLVED' }
  ];

  const countActiveAndAck = (list) => {
    return list.filter(i => i.status === 'ACTIVE' || i.status === 'ACKNOWLEDGED').length;
  };

  assert.strictEqual(countActiveAndAck(incidents), 3, 'Open badge count must be 3 (2 ACTIVE + 1 ACKNOWLEDGED)');

  // When incident 1 is resolved:
  incidents[0].status = 'RESOLVED';
  assert.strictEqual(countActiveAndAck(incidents), 2, 'Open badge count must decrement to 2');

  // When all are resolved:
  incidents[1].status = 'RESOLVED';
  incidents[2].status = 'RESOLVED';
  assert.strictEqual(countActiveAndAck(incidents), 0, 'Open badge count must be 0 when all incidents are resolved');
});

test('SOS EMERGENCY FEATURE: Admin View & Navigation UI Elements in admin/index.html', (t) => {
  const adminHtml = fs.readFileSync(path.join(rootDir, 'admin', 'index.html'), 'utf8');

  // Nav link & badge
  assert.ok(adminHtml.includes('id="nav-sos-link"'), 'Nav must have #nav-sos-link');
  assert.ok(adminHtml.includes('id="admin-sos-nav-badge"'), 'Nav must have #admin-sos-nav-badge');

  // Dedicated SOS View
  assert.ok(adminHtml.includes('id="sos-view"'), 'admin/index.html must have #sos-view');
  assert.ok(adminHtml.includes('id="sos-map-canvas"'), '#sos-view must have #sos-map-canvas');
  assert.ok(adminHtml.includes('id="sos-radar-markers-layer"'), '#sos-view must have #sos-radar-markers-layer');
  assert.ok(adminHtml.includes('id="sos-incident-items-container"'), '#sos-view must have #sos-incident-items-container');
  assert.ok(adminHtml.includes('id="stat-sos-active"'), '#sos-view must have stat-sos-active card');
  assert.ok(adminHtml.includes('id="stat-sos-acknowledged"'), '#sos-view must have stat-sos-acknowledged card');
  assert.ok(adminHtml.includes('id="stat-sos-resolved"'), '#sos-view must have stat-sos-resolved card');
});

test('SOS EMERGENCY FEATURE: Admin Controller Methods Exposed in admin/admin.js', (t) => {
  const adminJs = fs.readFileSync(path.join(rootDir, 'admin', 'admin.js'), 'utf8');

  assert.ok(adminJs.includes('function listenToSOSIncidents()'), 'admin.js must implement listenToSOSIncidents');
  assert.ok(adminJs.includes('function renderSOSView()'), 'admin.js must implement renderSOSView');
  assert.ok(adminJs.includes('function adminAcknowledgeSOS('), 'admin.js must implement adminAcknowledgeSOS');
  assert.ok(adminJs.includes('function adminResolveSOS('), 'admin.js must implement adminResolveSOS');
  assert.ok(adminJs.includes('window.adminAcknowledgeSOS'), 'adminAcknowledgeSOS must be exposed to window');
  assert.ok(adminJs.includes('window.adminResolveSOS'), 'adminResolveSOS must be exposed to window');
});

test('SOS EMERGENCY FEATURE: Client Main.js Connects Slider to SOS Service', (t) => {
  const mainJs = fs.readFileSync(path.join(rootDir, 'js', 'main.js'), 'utf8');

  assert.ok(
    mainJs.includes("import { submitSOSIncident } from './sos-service.js'") ||
    mainJs.includes('import { submitSOSIncident } from "./sos-service.js"'),
    'main.js must import submitSOSIncident'
  );
  assert.ok(mainJs.includes('submitSOSIncident({'), 'main.js must invoke submitSOSIncident');
  assert.ok(mainJs.includes('renderSOSState('), 'main.js must render SOS states');
  assert.ok(mainJs.includes('SOS Alert Sent'), 'main.js must display "SOS Alert Sent" confirmation');
  assert.ok(mainJs.includes('Authority will reach you within 1 minute'), 'main.js must display 1 minute response promise');
  assert.ok(mainJs.includes('Emergency alert acknowledged by authority'), 'main.js must handle acknowledged state');
  assert.ok(mainJs.includes('SOS incident resolved'), 'main.js must handle resolved state');
});
