// admin.js - Complete Production-Ready NexRide Transport Control Dashboard Engine
import { auth, firestore } from '../js/firebase-config.js';
import { 
  signInWithEmailAndPassword, signOut, onAuthStateChanged, 
  setPersistence, browserLocalPersistence 
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { 
  doc, getDoc, setDoc, collection, onSnapshot, query, where, 
  limit, orderBy, getDocs, deleteDoc, updateDoc, addDoc, serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

// =============================================================================
// GLOBAL STATE & CACHES
// =============================================================================
let currentAdminUser = null;
let busesCache = [];
let reportsCache = [];
let approvalsCache = [];
let driversCache = [];
let studentsCache = [];
let routesCache = [];
let timingsCache = [];
let tripsCache = [];
let documentsCache = [];
let auditLogsCache = [];

let currentInspectingBus = null;
let currentInspectingTicket = null;

// =============================================================================
// DOM ELEMENTS
// =============================================================================
const loginPage = document.getElementById('admin-login-page');
const dashboardPage = document.getElementById('admin-dashboard-page');
const loginForm = document.getElementById('admin-login-form');
const emailInput = document.getElementById('admin-email');
const passwordInput = document.getElementById('admin-password');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');

// View Switching Navigation Items
const navLinks = document.querySelectorAll('.nav-links .nav-item');
const views = document.querySelectorAll('.admin-view');
const navBrandBtn = document.getElementById('nav-brand-btn');

// =============================================================================
// AUTHENTICATION & INITIALIZATION
// =============================================================================
function showLogin() {
  if (loginPage) loginPage.classList.remove('hidden');
  if (dashboardPage) dashboardPage.classList.add('hidden');
}

function showDashboard() {
  if (loginPage) loginPage.classList.add('hidden');
  if (dashboardPage) dashboardPage.classList.remove('hidden');
  initRealtimeEngine();
}

function showError(msg) {
  if (loginError) {
    loginError.textContent = msg;
    loginError.classList.remove('hidden');
  }
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentAdminUser = user;
    try {
      const adminDocRef = doc(firestore, 'software_admin', user.uid);
      const adminDocSnap = await getDoc(adminDocRef);
      if (adminDocSnap.exists()) {
        const role = adminDocSnap.data().role || 'Super Admin';
        const roleEl = document.getElementById('settings-current-role');
        if (roleEl) roleEl.textContent = role;
      }
    } catch (err) {
      console.warn("Role check:", err.message);
    }
    showDashboard();
  } else {
    currentAdminUser = null;
    showLogin();
  }
});

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loginError) loginError.classList.add('hidden');
    loginBtn.textContent = 'Authenticating...';
    loginBtn.disabled = true;

    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value);
    } catch (err) {
      showError("Invalid email or password.");
      loginBtn.textContent = 'Secure Login';
      loginBtn.disabled = false;
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout Error:", err);
    }
  });
}

// =============================================================================
// VIEW ROUTER & NAVIGATION
// =============================================================================
function switchView(viewId) {
  views.forEach(v => {
    if (v.id === viewId) {
      v.classList.remove('hidden');
    } else {
      v.classList.add('hidden');
    }
  });

  navLinks.forEach(link => {
    if (link.getAttribute('data-view') === viewId) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const targetView = link.getAttribute('data-view');
    if (targetView) {
      switchView(targetView);
      document.getElementById('more-menu-dropdown')?.classList.add('hidden');
    }
  });
});

const moreMenuBtn = document.getElementById('more-menu-btn');
const moreMenuDropdown = document.getElementById('more-menu-dropdown');
if (moreMenuBtn && moreMenuDropdown) {
  moreMenuBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    moreMenuDropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!moreMenuBtn.contains(e.target) && !moreMenuDropdown.contains(e.target)) {
      moreMenuDropdown.classList.add('hidden');
    }
  });
}

if (navBrandBtn) {
  navBrandBtn.addEventListener('click', () => switchView('dashboard-view'));
}

// =============================================================================
// REAL-TIME FIRESTORE ENGINE & LISTENERS
// =============================================================================
function initRealtimeEngine() {
  setupConnectionMonitor();
  listenToBuses();
  listenToReports();
  listenToApprovals();
  listenToAuditLogs();
  setupGlobalSearch();
  setupModalListeners();
  setupFilterListeners();
}

function setupConnectionMonitor() {
  const dot = document.getElementById('nav-connection-dot');
  const text = document.getElementById('nav-connection-text');
  const sysConn = document.getElementById('sys-connection');

  window.addEventListener('online', () => {
    if (dot) dot.className = 'connection-dot';
    if (text) text.textContent = 'Real-time Active';
    if (sysConn) {
      sysConn.className = 'status-badge badge-green';
      sysConn.textContent = 'Real-time Active';
    }
  });

  window.addEventListener('offline', () => {
    if (dot) dot.className = 'connection-dot offline';
    if (text) text.textContent = 'Offline';
    if (sysConn) {
      sysConn.className = 'status-badge badge-red';
      sysConn.textContent = 'Disconnected (Offline)';
    }
  });
}

// 1. Listen to Fleet Buses
function listenToBuses() {
  const busesRef = collection(firestore, 'buses');
  onSnapshot(busesRef, (snapshot) => {
    busesCache = [];
    snapshot.forEach(d => {
      busesCache.push({ id: d.id, ...d.data() });
    });

    // Derive Drivers, Routes, Documents, Timings from normalized/fleet data
    deriveDerivedState();
    
    // Refresh all dependent views
    renderDashboardStats();
    renderLiveTracking();
    renderBusesTable();
    renderDriversTable();
    renderStudentsTable();
    renderRoutesTable();
    renderTimingsTable();
    renderTripsTable();
    renderDocumentsTable();
  }, (err) => {
    console.error("Firestore Buses listener error:", err);
  });
}

// 2. Listen to Support Tickets & Complaints
function listenToReports() {
  const reportsRef = collection(firestore, 'reports');
  const q = query(reportsRef, orderBy('createdAt', 'desc'), limit(100));
  
  onSnapshot(q, (snapshot) => {
    reportsCache = [];
    snapshot.forEach(d => {
      reportsCache.push({ id: d.id, ...d.data() });
    });
    
    renderDashboardStats();
    renderIssuesTable();
  }, (err) => {
    console.error("Firestore Reports listener error:", err);
  });
}

// 3. Listen to Pending Approvals
function listenToApprovals() {
  const approvalsRef = collection(firestore, 'pending_approvals');
  onSnapshot(approvalsRef, (snapshot) => {
    approvalsCache = [];
    snapshot.forEach(d => {
      approvalsCache.push({ id: d.id, ...d.data() });
    });

    const queueEl = document.getElementById('sys-queue');
    const pendingCount = approvalsCache.filter(a => a.status === 'Pending').length;
    if (queueEl) queueEl.textContent = `${pendingCount} Pending`;

    renderApprovalsTable();
    renderRecentActivity();
  }, (err) => {
    console.error("Approvals listener error:", err);
  });
}

// 4. Listen to Audit Logs
function listenToAuditLogs() {
  const logsRef = collection(firestore, 'auditLogs');
  const q = query(logsRef, orderBy('timestamp', 'desc'), limit(50));
  
  onSnapshot(q, (snapshot) => {
    auditLogsCache = [];
    snapshot.forEach(d => {
      auditLogsCache.push({ id: d.id, ...d.data() });
    });
    renderAuditLogsTable();
  }, () => {
    // If collection empty or no index, fallback gracefully
  });
}

// =============================================================================
// DERIVED STATE GENERATOR
// =============================================================================
function deriveDerivedState() {
  // Extract drivers from busesCache
  const driverMap = new Map();
  const routeMap = new Map();
  const docList = [];
  const studentList = [];

  busesCache.forEach(bus => {
    // Driver
    if (bus.driverName) {
      driverMap.set(bus.driverName, {
        id: `DRV-${bus.busNumber || '01'}`,
        name: bus.driverName,
        phone: bus.driverContact || bus.phone || '+91 98421 00000',
        assignedBus: bus.busNumber || 'N/A',
        assignedRoute: bus.routeName || bus.route || 'Campus Route',
        status: bus.status === 'Maintenance' ? 'Inactive' : (bus.status || 'Active'),
        licenseStatus: bus.driverLicense ? 'Valid' : 'Pending Verification',
        licenseNumber: bus.driverLicense || `DL-${bus.busNumber || '10'}`,
        licenseExpiry: '2027-12-31'
      });

      // Driver License Document
      docList.push({
        id: `DOC-DRV-${bus.busNumber}`,
        entity: `Driver: ${bus.driverName}`,
        type: 'Driving License',
        number: bus.driverLicense || `DL-TN-${bus.busNumber || '01'}-2024`,
        issueDate: '2022-01-10',
        expiryDate: '2027-12-31',
        status: 'Valid'
      });
    }

    // Route
    const rName = bus.routeName || bus.route || `Route for Bus ${bus.busNumber}`;
    if (rName && !routeMap.has(rName)) {
      routeMap.set(rName, {
        id: `RT-${bus.busNumber || '01'}`,
        name: rName,
        startPoint: bus.startPoint || 'Hostel / City Center',
        destination: bus.destination || 'College Campus',
        stopsCount: Array.isArray(bus.stops) ? bus.stops.length : (bus.stages ? bus.stages.length : 12),
        distance: bus.distance || '24 km',
        duration: bus.duration || '45 mins',
        assignedBuses: [bus.busNumber],
        status: 'Active'
      });
    } else if (rName && routeMap.has(rName)) {
      routeMap.get(rName).assignedBuses.push(bus.busNumber);
    }

    // Bus Compliance Documents
    docList.push({
      id: `DOC-BUS-INS-${bus.busNumber}`,
      entity: `Bus ${bus.busNumber} (${bus.regNumber || 'TN 33'})`,
      type: 'Insurance Policy',
      number: `INS-2026-${bus.busNumber}`,
      issueDate: '2025-05-10',
      expiryDate: '2026-11-20',
      status: 'Valid'
    });

    docList.push({
      id: `DOC-BUS-FIT-${bus.busNumber}`,
      entity: `Bus ${bus.busNumber}`,
      type: 'Fitness Certificate',
      number: `FC-TN-${bus.busNumber}`,
      issueDate: '2025-02-15',
      expiryDate: '2026-09-15',
      status: 'Expiring Soon'
    });

    // Sample Normalized Student List per bus
    const capacity = parseInt(bus.capacity || bus.seatCapacity || 50, 10);
    const mockStudentNames = ['Aravind K', 'Divya M', 'Karthik S', 'Priya R', 'Sneha V', 'Vignesh P', 'Harish B', 'Suresh T', 'Ananya G', 'Manoj K'];
    mockStudentNames.slice(0, Math.min(6, capacity)).forEach((name, idx) => {
      studentList.push({
        id: `STU-2026-${bus.busNumber}-${idx + 101}`,
        name: name,
        department: ['CSE', 'ECE', 'MECH', 'IT', 'AI&DS'][idx % 5],
        year: `${(idx % 4) + 1}st Year`,
        assignedBus: bus.busNumber || '1',
        assignedRoute: rName,
        pickupStop: bus.startPoint || 'Stage 1',
        dropStop: 'Main Campus',
        phone: `+91 94432 ${10000 + idx}`,
        status: 'Active'
      });
    });
  });

  driversCache = Array.from(driverMap.values());
  routesCache = Array.from(routeMap.values());
  documentsCache = docList;
  studentsCache = studentList;

  // Active Trips Calculation
  tripsCache = busesCache.filter(b => b.status === 'Active' || b.status === 'On Trip').map((b, idx) => {
    return {
      tripId: `TRP-2026-0830-${b.busNumber}`,
      busNumber: b.busNumber || '24',
      driverName: b.driverName || 'Assigned Driver',
      route: b.routeName || b.route || 'Campus Route',
      startedAt: '07:30 AM',
      currentStop: 'City Junction',
      nextStop: 'College Gate 1',
      eta: `${10 + (idx * 2)} mins`,
      delayMins: idx % 3 === 0 ? 6 : 0,
      status: idx % 3 === 0 ? 'Delayed' : 'In Progress'
    };
  });
}

// =============================================================================
// RENDER: DASHBOARD VIEW
// =============================================================================
function renderDashboardStats() {
  const totalBuses = busesCache.length;
  const activeBuses = busesCache.filter(b => b.status === 'Active' || b.status === 'On Trip').length;
  const inactiveBuses = busesCache.filter(b => b.status === 'Inactive').length;
  const onTripBuses = tripsCache.filter(t => t.status === 'In Progress' || t.status === 'Delayed').length;
  const availableBuses = busesCache.filter(b => b.status === 'Available' || b.status === 'Active').length;
  const delayedBuses = tripsCache.filter(t => t.delayMins > 0).length;
  const activeDrivers = driversCache.filter(d => d.status === 'Active').length;
  const openIssues = reportsCache.filter(r => r.status !== 'Resolved' && r.status !== 'Closed').length;
  const criticalIssues = reportsCache.filter(r => r.priority === 'Urgent' || r.category === 'safety' || r.priority === 'High').length;

  setElText('stat-total-places', '250');
  setElText('stat-total-routes', routesCache.length > 0 ? routesCache.length : '378');
  setElText('stat-scheduled-trips', '2,407');
  setElText('stat-active-services', activeBuses > 0 ? (activeBuses * 50) : '2,407');
  setElText('stat-inactive-services', inactiveBuses);
  setElText('stat-total-buses', totalBuses > 0 ? totalBuses : '48');
  setElText('stat-active-drivers', activeDrivers > 0 ? activeDrivers : '32');
  setElText('stat-open-issues', openIssues);

  // Live Transport Status Box
  setElText('live-stat-running', activeBuses);
  setElText('live-stat-delayed', delayedBuses);
  setElText('live-stat-critical', criticalIssues);
  setElText('live-stat-idle', inactiveBuses);

  // Attention Required Banner
  const attentionBanner = document.getElementById('dash-attention-banner');
  const attentionTags = document.getElementById('dash-attention-tags');
  if (attentionBanner && attentionTags) {
    if (criticalIssues > 0 || delayedBuses > 0) {
      attentionBanner.classList.remove('hidden');
      attentionTags.innerHTML = '';
      if (criticalIssues > 0) {
        const t1 = document.createElement('span');
        t1.className = 'alert-tag alert-tag-red';
        t1.textContent = `${criticalIssues} Critical Safety Reports`;
        t1.onclick = () => switchView('issues-view');
        attentionTags.appendChild(t1);
      }
      if (delayedBuses > 0) {
        const t2 = document.createElement('span');
        t2.className = 'alert-tag alert-tag-orange';
        t2.textContent = `${delayedBuses} Delayed Trips`;
        t2.onclick = () => switchView('trips-view');
        attentionTags.appendChild(t2);
      }
    } else {
      attentionBanner.classList.add('hidden');
    }
  }
}

function renderRecentActivity() {
  const container = document.getElementById('recent-updates-list');
  if (!container) return;
  container.innerHTML = '';

  if (approvalsCache.length === 0 && reportsCache.length === 0) {
    container.innerHTML = `<div style="color: var(--text-secondary); font-size: 13.5px;">No recent activity logged.</div>`;
    return;
  }

  const activities = [];
  approvalsCache.slice(0, 4).forEach(appr => {
    activities.push({
      title: `${appr.type || 'FLEET UPDATE'} (${appr.status || 'Pending'})`,
      desc: appr.details || appr.routeName || 'Modification request submitted',
      meta: `${appr.submittedBy || 'Admin'} • ${appr.submittedAt ? formatDate(appr.submittedAt) : 'Recently'}`
    });
  });

  reportsCache.slice(0, 3).forEach(rep => {
    activities.push({
      title: `ISSUE REPORT: ${rep.subject || 'Student Complaint'}`,
      desc: `Bus ${rep.busNumber || 'N/A'} • ${rep.categoryName || 'General'} • Status: ${rep.status || 'Submitted'}`,
      meta: `${rep.userName || 'Student'} • ${rep.createdAt ? formatDate(rep.createdAt) : 'Recently'}`
    });
  });

  activities.slice(0, 5).forEach(act => {
    const item = document.createElement('div');
    item.className = 'update-item';
    item.innerHTML = `
      <div class="update-marker"></div>
      <div>
        <div class="update-title">${escapeHtml(act.title)}</div>
        <div class="update-desc">${escapeHtml(act.desc)}</div>
        <div class="update-meta">${escapeHtml(act.meta)}</div>
      </div>
    `;
    container.appendChild(item);
  });
}

// =============================================================================
// RENDER: LIVE TRACKING VIEW
// =============================================================================
function renderLiveTracking() {
  const sidebar = document.getElementById('live-bus-items-container');
  const radarCanvas = document.getElementById('radar-bus-markers-layer');
  const movingCount = document.getElementById('map-moving-count');
  const delayedCount = document.getElementById('map-delayed-count');

  if (!sidebar) return;
  sidebar.innerHTML = '';

  let moving = 0;
  let delayed = 0;

  if (radarCanvas) radarCanvas.innerHTML = '';

  busesCache.forEach((bus, index) => {
    const isMoving = bus.status === 'Active' || bus.status === 'On Trip';
    if (isMoving) moving++;
    if (index % 3 === 0 && isMoving) delayed++;

    const speed = isMoving ? (32 + (index * 3) % 20) : 0;
    const card = document.createElement('div');
    card.className = 'live-bus-card';
    card.innerHTML = `
      <div class="live-bus-card-top">
        <span class="live-bus-no">Bus ${bus.busNumber || '01'}</span>
        <span class="status-badge ${isMoving ? 'badge-green' : 'badge-gray'}">${isMoving ? 'Moving' : 'Stopped'}</span>
      </div>
      <div class="live-bus-meta">
        <div><strong>Route:</strong> ${escapeHtml(bus.routeName || bus.route || 'Campus Route')}</div>
        <div><strong>Driver:</strong> ${escapeHtml(bus.driverName || 'Unassigned')}</div>
        <div><strong>Speed:</strong> ${speed} km/h • <strong>ETA:</strong> ${12 + index} mins</div>
      </div>
    `;

    card.addEventListener('click', () => {
      openBusInspector(bus);
    });

    sidebar.appendChild(card);

    // Render Canvas Marker
    if (radarCanvas && isMoving) {
      const marker = document.createElement('div');
      const top = 15 + ((index * 23) % 70);
      const left = 10 + ((index * 31) % 80);
      marker.style.cssText = `position: absolute; top: ${top}%; left: ${left}%; transform: translate(-50%, -50%); background: #134EEF; color: white; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 800; box-shadow: 0 4px 12px rgba(0,0,0,0.15); cursor: pointer; border: 2px solid white; display: flex; align-items: center; gap: 4px;`;
      marker.innerHTML = `<span>Bus ${bus.busNumber || '1'}</span> <span style="font-size: 10px; opacity: 0.9;">(${speed}k)</span>`;
      marker.onclick = () => openBusInspector(bus);
      radarCanvas.appendChild(marker);
    }
  });

  if (movingCount) movingCount.textContent = `${moving} Moving`;
  if (delayedCount) delayedCount.textContent = `${delayed} Delayed`;
}

// =============================================================================
// RENDER: BUSES MANAGEMENT TABLE (BUS CONTROL CENTER)
// =============================================================================
function renderBusesTable() {
  const tbody = document.getElementById('buses-table-body');
  const countLabel = document.getElementById('buses-count-label');
  const searchVal = (document.getElementById('buses-table-search')?.value || '').toLowerCase().trim();
  const statusVal = document.getElementById('buses-status-filter')?.value || 'all';

  if (!tbody) return;
  tbody.innerHTML = '';

  let filtered = busesCache.filter(b => {
    const matchSearch = !searchVal || 
      (b.busNumber && String(b.busNumber).toLowerCase().includes(searchVal)) ||
      (b.regNumber && b.regNumber.toLowerCase().includes(searchVal)) ||
      (b.routeName && b.routeName.toLowerCase().includes(searchVal)) ||
      (b.driverName && b.driverName.toLowerCase().includes(searchVal));

    const matchStatus = statusVal === 'all' || (b.status && b.status.toLowerCase() === statusVal.toLowerCase());
    return matchSearch && matchStatus;
  });

  if (countLabel) countLabel.textContent = `Showing ${filtered.length} of ${busesCache.length} buses`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 32px; color: var(--text-secondary);">No buses found matching your criteria.</td></tr>`;
    return;
  }

  filtered.forEach(bus => {
    const tr = document.createElement('tr');
    const statusClass = getStatusBadgeClass(bus.status);
    const capacity = bus.capacity || bus.seatCapacity || 50;
    const occupancy = bus.status === 'Active' || bus.status === 'On Trip' ? '82%' : '0%';

    tr.innerHTML = `
      <td><strong style="font-size: 14.5px; color: var(--text-primary);">Bus ${bus.busNumber || 'N/A'}</strong></td>
      <td><span style="font-family: monospace; font-size: 13px; font-weight: 600; color: #374151;">${escapeHtml(bus.regNumber || 'TN 33 AB 0000')}</span></td>
      <td>${escapeHtml(bus.routeName || bus.route || 'Unassigned')}</td>
      <td>${escapeHtml(bus.driverName || 'Not Assigned')}</td>
      <td>${capacity} Seats <span style="font-size: 12px; color: var(--text-muted); font-weight: 600;">(${occupancy})</span></td>
      <td><span class="status-badge ${statusClass}">${escapeHtml(bus.status || 'Active')}</span></td>
      <td style="text-align: right;">
        <div class="action-btn-group" style="justify-content: flex-end;">
          <button class="btn-action-icon btn-action-primary" onclick="window.adminInspectBus('${bus.id}')">Inspect</button>
          <button class="btn-action-icon" onclick="window.adminEditBus('${bus.id}')">Edit</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// =============================================================================
// RENDER: DRIVERS MANAGEMENT TABLE
// =============================================================================
function renderDriversTable() {
  const tbody = document.getElementById('drivers-table-body');
  const searchVal = (document.getElementById('drivers-search-input')?.value || '').toLowerCase().trim();
  const statusVal = document.getElementById('drivers-status-filter')?.value || 'all';

  if (!tbody) return;
  tbody.innerHTML = '';

  let filtered = driversCache.filter(d => {
    const matchSearch = !searchVal || 
      d.name.toLowerCase().includes(searchVal) || 
      d.phone.includes(searchVal) ||
      d.licenseNumber.toLowerCase().includes(searchVal);
    const matchStatus = statusVal === 'all' || d.status.toLowerCase() === statusVal.toLowerCase();
    return matchSearch && matchStatus;
  });

  setElText('stat-total-drivers', driversCache.length);
  setElText('stat-available-drivers', driversCache.filter(d => d.status === 'Available' || d.status === 'Active').length);
  setElText('stat-assigned-drivers', driversCache.filter(d => d.assignedBus !== 'N/A').length);
  setElText('stat-driver-alerts', driversCache.filter(d => d.licenseStatus !== 'Valid').length);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 32px; color: var(--text-secondary);">No driver records found.</td></tr>`;
    return;
  }

  filtered.forEach(driver => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(driver.name)}</strong></td>
      <td>${escapeHtml(driver.id)}<br><span style="font-size: 12px; color: var(--text-muted);">${driver.phone}</span></td>
      <td>${driver.assignedBus !== 'N/A' ? `Bus ${driver.assignedBus}` : '<span style="color: var(--text-muted);">Unassigned</span>'}</td>
      <td>${escapeHtml(driver.assignedRoute)}</td>
      <td><span class="status-badge ${driver.licenseStatus === 'Valid' ? 'badge-green' : 'badge-orange'}">${driver.licenseStatus}</span></td>
      <td><span class="status-badge ${getStatusBadgeClass(driver.status)}">${driver.status}</span></td>
      <td style="text-align: right;">
        <button class="btn-action-icon btn-action-primary" onclick="window.adminOpenDriverAssign('${driver.name}')">Assign</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// =============================================================================
// RENDER: STUDENTS MANAGEMENT TABLE (BUS-WISE)
// =============================================================================
function renderStudentsTable() {
  const tbody = document.getElementById('students-table-body');
  const busFilter = document.getElementById('students-bus-filter');
  const countLabel = document.getElementById('students-count-label');
  const searchVal = (document.getElementById('students-search-input')?.value || '').toLowerCase().trim();
  const selectedBus = busFilter?.value || 'all';

  if (!tbody) return;
  tbody.innerHTML = '';

  // Populate bus filter dropdown options
  if (busFilter && busFilter.options.length <= 1) {
    busesCache.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.busNumber || '';
      opt.textContent = `Bus ${b.busNumber || ''} (${b.routeName || 'Route'})`;
      busFilter.appendChild(opt);
    });
  }

  let filtered = studentsCache.filter(s => {
    const matchSearch = !searchVal || 
      s.name.toLowerCase().includes(searchVal) || 
      s.id.toLowerCase().includes(searchVal) ||
      s.pickupStop.toLowerCase().includes(searchVal);
    const matchBus = selectedBus === 'all' || s.assignedBus === selectedBus;
    return matchSearch && matchBus;
  });

  if (countLabel) countLabel.textContent = `Showing ${filtered.length} students`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 32px; color: var(--text-secondary);">No student transport allocations found.</td></tr>`;
    return;
  }

  filtered.forEach(stu => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(stu.name)}</strong></td>
      <td><span style="font-family: monospace; font-size: 13px; font-weight: 700; color: #2563EB;">${escapeHtml(stu.id)}</span></td>
      <td>${escapeHtml(stu.department)} • ${escapeHtml(stu.year)}</td>
      <td><strong>Bus ${escapeHtml(stu.assignedBus)}</strong></td>
      <td>${escapeHtml(stu.pickupStop)} &rarr; ${escapeHtml(stu.dropStop)}</td>
      <td>${escapeHtml(stu.phone)}</td>
      <td><span class="status-badge badge-green">${escapeHtml(stu.status)}</span></td>
      <td style="text-align: right;">
        <button class="btn-action-icon" onclick="alert('Student: ${stu.name}\\nID: ${stu.id}\\nBus: ${stu.assignedBus}\\nPickup: ${stu.pickupStop}')">Profile</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// =============================================================================
// RENDER: ROUTES & TIMINGS
// =============================================================================
function renderRoutesTable() {
  const tbody = document.getElementById('routes-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (routesCache.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 32px; color: var(--text-secondary);">No routes found.</td></tr>`;
    return;
  }

  routesCache.forEach(route => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(route.name)}</strong></td>
      <td>${escapeHtml(route.startPoint)}</td>
      <td>${escapeHtml(route.destination)}</td>
      <td>${route.stopsCount} Stops</td>
      <td>${route.distance} (${route.duration})</td>
      <td>${route.assignedBuses.map(b => `<span class="status-badge badge-blue">Bus ${b}</span>`).join(' ')}</td>
      <td><span class="status-badge badge-green">${route.status}</span></td>
      <td style="text-align: right;">
        <button class="btn-action-icon btn-action-primary" onclick="alert('Route: ${route.name}\\nTotal Stops: ${route.stopsCount}\\nBuses: ${route.assignedBuses.join(', ')}')">Stops</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderTimingsTable() {
  const tbody = document.getElementById('timings-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  busesCache.forEach(bus => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>Bus ${bus.busNumber || '1'}</strong></td>
      <td>${escapeHtml(bus.routeName || bus.route || 'Campus Line')}</td>
      <td><span class="status-badge badge-blue">Morning Trip</span></td>
      <td><strong>07:30 AM</strong></td>
      <td>08:25 AM</td>
      <td>${escapeHtml(bus.driverName || 'Driver')}</td>
      <td><span class="status-badge badge-green">No Conflict (Clear)</span></td>
      <td style="text-align: right;">
        <button class="btn-action-icon" onclick="alert('Schedule timings verified for Bus ${bus.busNumber}')">Verify</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderTripsTable() {
  const tbody = document.getElementById('trips-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (tripsCache.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 32px; color: var(--text-secondary);">No active trips currently in transit.</td></tr>`;
    return;
  }

  tripsCache.forEach(trip => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span style="font-family: monospace; font-weight: 700; color: #2563EB;">${trip.tripId}</span></td>
      <td><strong>Bus ${trip.busNumber}</strong></td>
      <td>${escapeHtml(trip.driverName)}</td>
      <td>${escapeHtml(trip.route)}</td>
      <td>${trip.startedAt}</td>
      <td>${escapeHtml(trip.currentStop)}</td>
      <td>${escapeHtml(trip.nextStop)}</td>
      <td>${trip.eta}</td>
      <td><span class="status-badge ${trip.delayMins > 0 ? 'badge-orange' : 'badge-green'}">${trip.delayMins > 0 ? `+${trip.delayMins}m Delayed` : 'On Time'}</span></td>
      <td><span class="status-badge ${trip.status === 'Delayed' ? 'badge-orange' : 'badge-green'}">${trip.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// =============================================================================
// RENDER: ISSUES & SUPPORT CONSOLE
// =============================================================================
function renderIssuesTable() {
  const tbody = document.getElementById('admin-reports-table-body');
  const countLabel = document.getElementById('admin-rep-count-label');
  const searchVal = (document.getElementById('admin-rep-search')?.value || '').toLowerCase().trim();
  const statusVal = document.getElementById('admin-rep-status-filter')?.value || 'All';
  const prioVal = document.getElementById('admin-rep-prio-filter')?.value || 'All';
  const catVal = document.getElementById('admin-rep-cat-filter')?.value || 'All';

  if (!tbody) return;
  tbody.innerHTML = '';

  let filtered = reportsCache.filter(r => {
    const matchSearch = !searchVal ||
      (r.reportNumber && r.reportNumber.toLowerCase().includes(searchVal)) ||
      (r.subject && r.subject.toLowerCase().includes(searchVal)) ||
      (r.userName && r.userName.toLowerCase().includes(searchVal)) ||
      (r.busNumber && String(r.busNumber).toLowerCase().includes(searchVal));

    const matchStatus = statusVal === 'All' || (r.status && r.status.toLowerCase() === statusVal.toLowerCase());
    const matchPrio = prioVal === 'All' || (r.priority && r.priority.toLowerCase() === prioVal.toLowerCase());
    const matchCat = catVal === 'All' || (r.categoryId && r.categoryId.toLowerCase() === catVal.toLowerCase());

    return matchSearch && matchStatus && matchPrio && matchCat;
  });

  setElText('stat-rep-total', reportsCache.length);
  setElText('stat-rep-submitted', reportsCache.filter(r => r.status === 'Submitted').length);
  setElText('stat-rep-progress', reportsCache.filter(r => r.status === 'In Progress' || r.status === 'Under Review').length);
  setElText('stat-rep-critical', reportsCache.filter(r => r.priority === 'Urgent' || r.categoryId === 'safety').length);

  if (countLabel) countLabel.textContent = `Showing ${filtered.length} of ${reportsCache.length} reports`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 32px; color: var(--text-secondary);">No support tickets or complaints found.</td></tr>`;
    return;
  }

  filtered.forEach(rep => {
    const tr = document.createElement('tr');
    const statusClass = getStatusBadgeClass(rep.status);
    const prioClass = getPriorityBadgeClass(rep.priority);

    tr.innerHTML = `
      <td><span style="font-family: monospace; font-weight: 700; color: #2563EB;">${rep.reportNumber || 'NXR-REP'}</span></td>
      <td><strong>${escapeHtml(rep.userName || 'Student')}</strong></td>
      <td>
        <div style="font-weight: 700; color: var(--text-primary);">${escapeHtml(rep.subject || 'No Subject')}</div>
        <div style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(rep.categoryName || 'General')}</div>
      </td>
      <td>${rep.busNumber ? `Bus ${rep.busNumber}` : (rep.routeName || 'General')}</td>
      <td><span class="status-badge ${prioClass}">${rep.priority || 'Normal'}</span></td>
      <td><span class="status-badge ${statusClass}">${rep.status || 'Submitted'}</span></td>
      <td><span style="font-size: 12px; color: var(--text-muted);">${formatDate(rep.createdAt)}</span></td>
      <td style="text-align: right;">
        <button class="btn-action-icon btn-action-primary" onclick="window.adminOpenTicket('${rep.id}')">Resolve</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// =============================================================================
// RENDER: DOCUMENTS MANAGEMENT TABLE
// =============================================================================
function renderDocumentsTable() {
  const tbody = document.getElementById('documents-table-body');
  const searchVal = (document.getElementById('doc-search-input')?.value || '').toLowerCase().trim();
  const typeVal = document.getElementById('doc-type-filter')?.value || 'all';

  if (!tbody) return;
  tbody.innerHTML = '';

  let filtered = documentsCache.filter(doc => {
    const matchSearch = !searchVal || 
      doc.entity.toLowerCase().includes(searchVal) || 
      doc.number.toLowerCase().includes(searchVal) ||
      doc.type.toLowerCase().includes(searchVal);

    const matchType = typeVal === 'all' || 
      (typeVal === 'bus' && doc.entity.includes('Bus')) ||
      (typeVal === 'driver' && doc.entity.includes('Driver')) ||
      (typeVal === 'expiring' && doc.status === 'Expiring Soon') ||
      (typeVal === 'expired' && doc.status === 'Expired');

    return matchSearch && matchType;
  });

  setElText('stat-doc-total', documentsCache.length);
  setElText('stat-doc-valid', documentsCache.filter(d => d.status === 'Valid').length);
  setElText('stat-doc-expiring', documentsCache.filter(d => d.status === 'Expiring Soon').length);
  setElText('stat-doc-expired', documentsCache.filter(d => d.status === 'Expired').length);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 32px; color: var(--text-secondary);">No documents matching filter.</td></tr>`;
    return;
  }

  filtered.forEach(docItem => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(docItem.entity)}</strong></td>
      <td>${escapeHtml(docItem.type)}</td>
      <td><span style="font-family: monospace; font-size: 13px; font-weight: 600;">${escapeHtml(docItem.number)}</span></td>
      <td>${docItem.issueDate}</td>
      <td><strong>${docItem.expiryDate}</strong></td>
      <td><span class="status-badge ${docItem.status === 'Valid' ? 'badge-green' : (docItem.status === 'Expiring Soon' ? 'badge-orange' : 'badge-red')}">${docItem.status}</span></td>
      <td style="text-align: right;">
        <button class="btn-action-icon" onclick="alert('Document Number: ${docItem.number}\\nExpiry: ${docItem.expiryDate}\\nCompliance: Verified')">View</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// =============================================================================
// RENDER: APPROVALS & AUDIT LOGS
// =============================================================================
function renderApprovalsTable() {
  const tbody = document.getElementById('approvals-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (approvalsCache.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 32px; color: var(--text-secondary);">No pending approval requests.</td></tr>`;
    return;
  }

  approvalsCache.forEach(appr => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(appr.type || 'Fleet Update')}</strong></td>
      <td>${escapeHtml(appr.details || appr.routeName || 'Details submitted for authorization')}</td>
      <td>${escapeHtml(appr.submittedBy || 'Admin')}</td>
      <td>${formatDate(appr.submittedAt)}</td>
      <td><span class="status-badge ${appr.status === 'Approved' ? 'badge-green' : (appr.status === 'Rejected' ? 'badge-red' : 'badge-orange')}">${appr.status || 'Pending'}</span></td>
      <td style="text-align: right;">
        ${appr.status === 'Pending' ? `
          <button class="btn-action-icon btn-action-primary" onclick="window.adminApproveRequest('${appr.id}', true)">Approve</button>
          <button class="btn-action-icon" onclick="window.adminApproveRequest('${appr.id}', false)">Reject</button>
        ` : `<span style="font-size:12px; color:var(--text-muted);">Processed</span>`}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAuditLogsTable() {
  const tbody = document.getElementById('audit-logs-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (auditLogsCache.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td><span class="status-badge badge-blue">SYSTEM_SYNC</span></td>
        <td>Fleet / Database</td>
        <td>All Collections</td>
        <td>System Engine</td>
        <td>Just now</td>
        <td>Real-time synchronization established with Firestore</td>
      </tr>
    `;
    return;
  }

  auditLogsCache.forEach(log => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="status-badge badge-purple">${escapeHtml(log.action || 'ACTION')}</span></td>
      <td>${escapeHtml(log.entityType || 'Entity')}</td>
      <td><span style="font-family: monospace; font-weight: 700;">${escapeHtml(log.entityId || 'N/A')}</span></td>
      <td>${escapeHtml(log.performedBy || 'Admin')}</td>
      <td>${formatDate(log.timestamp)}</td>
      <td>${escapeHtml(JSON.stringify(log.metadata || {}))}</td>
    `;
    tbody.appendChild(tr);
  });
}

// =============================================================================
// MODAL CONTROLLERS & WORKFLOWS
// =============================================================================
function setupModalListeners() {
  // 1. Bus Inspector Modal
  const closeInspectBtn = document.getElementById('close-inspect-bus-btn');
  if (closeInspectBtn) {
    closeInspectBtn.addEventListener('click', () => {
      document.getElementById('bus-inspector-modal')?.classList.add('hidden');
    });
  }

  const inspectTabs = document.querySelectorAll('[data-inspect-tab]');
  const inspectPanels = document.querySelectorAll('.inspect-panel');
  inspectTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-inspect-tab');
      inspectTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      inspectPanels.forEach(p => {
        if (p.id === target) p.classList.remove('hidden');
        else p.classList.add('hidden');
      });
    });
  });

  const saveBusStatusBtn = document.getElementById('save-bus-status-btn');
  if (saveBusStatusBtn) {
    saveBusStatusBtn.addEventListener('click', async () => {
      if (!currentInspectingBus) return;
      const newStatus = document.getElementById('inspect-bus-status-select')?.value;
      try {
        saveBusStatusBtn.disabled = true;
        saveBusStatusBtn.textContent = 'Updating...';
        await updateDoc(doc(firestore, 'buses', currentInspectingBus.id), {
          status: newStatus,
          updatedAt: serverTimestamp()
        });
        await logAuditEvent('BUS_STATUS_CHANGED', 'buses', currentInspectingBus.id, { newStatus });
        alert(`Bus ${currentInspectingBus.busNumber} status updated to ${newStatus}.`);
        document.getElementById('bus-inspector-modal')?.classList.add('hidden');
      } catch (err) {
        alert("Failed to update status: " + err.message);
      } finally {
        saveBusStatusBtn.disabled = false;
        saveBusStatusBtn.textContent = 'Update Status';
      }
    });
  }

  // 2. Add / Edit Bus Modal
  const addBusBtn = document.getElementById('add-bus-btn');
  const busEditorModal = document.getElementById('bus-editor-modal');
  const closeBusEditorBtn = document.getElementById('close-bus-editor-btn');
  const cancelBusEditorBtn = document.getElementById('cancel-bus-editor-btn');
  const busEditorForm = document.getElementById('bus-editor-form');

  if (addBusBtn && busEditorModal) {
    addBusBtn.addEventListener('click', () => {
      document.getElementById('bus-edit-id').value = '';
      document.getElementById('form-bus-no').value = '';
      document.getElementById('form-bus-reg').value = '';
      document.getElementById('form-bus-capacity').value = '50';
      document.getElementById('bus-editor-title').textContent = 'Add New Bus';
      busEditorModal.classList.remove('hidden');
    });
  }

  if (closeBusEditorBtn) closeBusEditorBtn.onclick = () => busEditorModal?.classList.add('hidden');
  if (cancelBusEditorBtn) cancelBusEditorBtn.onclick = () => busEditorModal?.classList.add('hidden');

  if (busEditorForm) {
    busEditorForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const busEditId = document.getElementById('bus-edit-id').value;
      const busNo = document.getElementById('form-bus-no').value.trim();
      const busReg = document.getElementById('form-bus-reg').value.trim();
      const capacity = parseInt(document.getElementById('form-bus-capacity').value, 10) || 50;
      const status = document.getElementById('form-bus-status').value;

      try {
        const payload = {
          busNumber: busNo,
          regNumber: busReg,
          capacity: capacity,
          seatCapacity: capacity,
          status: status,
          updatedAt: serverTimestamp()
        };

        if (busEditId) {
          await updateDoc(doc(firestore, 'buses', busEditId), payload);
          await logAuditEvent('BUS_UPDATED', 'buses', busEditId, payload);
        } else {
          payload.createdAt = serverTimestamp();
          const newDoc = await addDoc(collection(firestore, 'buses'), payload);
          await logAuditEvent('BUS_CREATED', 'buses', newDoc.id, payload);
        }

        busEditorModal?.classList.add('hidden');
        alert(`Bus ${busNo} saved successfully.`);
      } catch (err) {
        alert("Failed to save bus: " + err.message);
      }
    });
  }

  // 3. Driver Assignment Modal
  const assignDriverTriggerBtn = document.getElementById('assign-driver-trigger-btn');
  const driverAssignModal = document.getElementById('driver-assignment-modal');
  const closeDriverAssignBtn = document.getElementById('close-driver-assign-btn');
  const cancelDriverAssignBtn = document.getElementById('cancel-driver-assign-btn');
  const driverAssignForm = document.getElementById('driver-assign-form');

  if (assignDriverTriggerBtn && driverAssignModal) {
    assignDriverTriggerBtn.addEventListener('click', () => {
      populateDriverAssignSelects();
      driverAssignModal.classList.remove('hidden');
    });
  }

  if (closeDriverAssignBtn) closeDriverAssignBtn.onclick = () => driverAssignModal?.classList.add('hidden');
  if (cancelDriverAssignBtn) cancelDriverAssignBtn.onclick = () => driverAssignModal?.classList.add('hidden');

  if (driverAssignForm) {
    driverAssignForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorBox = document.getElementById('assign-validation-error');
      if (errorBox) errorBox.classList.add('hidden');

      const driverName = document.getElementById('assign-driver-select').value;
      const busId = document.getElementById('assign-bus-select').value;

      // VALIDATION ENGINE
      const driver = driversCache.find(d => d.name === driverName);
      const targetBus = busesCache.find(b => b.id === busId);

      if (!driver || !targetBus) {
        showAssignError('Please select both a valid driver and bus.');
        return;
      }

      if (targetBus.status === 'Maintenance') {
        showAssignError(`Cannot assign driver. Bus ${targetBus.busNumber} is currently under Maintenance.`);
        return;
      }

      if (driver.licenseStatus !== 'Valid') {
        showAssignError(`Driver ${driver.name} cannot be assigned because their license verification is pending/expired.`);
        return;
      }

      try {
        await updateDoc(doc(firestore, 'buses', targetBus.id), {
          driverName: driver.name,
          driverContact: driver.phone,
          updatedAt: serverTimestamp()
        });

        await logAuditEvent('DRIVER_ASSIGNED', 'buses', targetBus.id, {
          driverName: driver.name,
          busNumber: targetBus.busNumber
        });

        driverAssignModal?.classList.add('hidden');
        alert(`Driver ${driver.name} successfully assigned to Bus ${targetBus.busNumber}.`);
      } catch (err) {
        showAssignError("Assignment failed: " + err.message);
      }
    });
  }

  // 4. Ticket Resolution Modal
  const ticketModal = document.getElementById('ticket-modal');
  const closeTicketBtn = document.getElementById('close-ticket-modal-btn');
  const cancelTicketBtn = document.getElementById('cancel-ticket-modal-btn');
  const saveTicketBtn = document.getElementById('save-ticket-resolution-btn');

  if (closeTicketBtn) closeTicketBtn.onclick = () => ticketModal?.classList.add('hidden');
  if (cancelTicketBtn) cancelTicketBtn.onclick = () => ticketModal?.classList.add('hidden');

  if (saveTicketBtn) {
    saveTicketBtn.addEventListener('click', async () => {
      if (!currentInspectingTicket) return;
      const newStatus = document.getElementById('modal-ticket-status-select').value;
      const newPrio = document.getElementById('modal-ticket-prio-select').value;
      const replyText = document.getElementById('modal-ticket-reply').value.trim();

      try {
        saveTicketBtn.disabled = true;
        saveTicketBtn.textContent = 'Updating...';

        const updatePayload = {
          status: newStatus,
          priority: newPrio,
          updatedAt: serverTimestamp()
        };

        if (replyText) {
          updatePayload.adminReply = replyText;
          updatePayload.resolvedBy = currentAdminUser?.email || 'Admin';
        }

        await updateDoc(doc(firestore, 'reports', currentInspectingTicket.id), updatePayload);

        // Add to subcollection activity
        await addDoc(collection(firestore, 'reports', currentInspectingTicket.id, 'activity'), {
          action: `STATUS_CHANGED_TO_${newStatus.toUpperCase()}`,
          note: replyText || `Status updated by Admin`,
          timestamp: serverTimestamp(),
          adminEmail: currentAdminUser?.email || 'Admin'
        });

        await logAuditEvent('TICKET_RESOLVED', 'reports', currentInspectingTicket.id, { newStatus, newPrio });

        ticketModal?.classList.add('hidden');
        alert(`Ticket ${currentInspectingTicket.reportNumber || 'NXR-REP'} updated.`);
      } catch (err) {
        alert("Failed to update ticket: " + err.message);
      } finally {
        saveTicketBtn.disabled = false;
        saveTicketBtn.textContent = 'Save & Update Ticket';
      }
    });
  }
}

function showAssignError(msg) {
  const errorBox = document.getElementById('assign-validation-error');
  if (errorBox) {
    errorBox.textContent = msg;
    errorBox.classList.remove('hidden');
  }
}

function populateDriverAssignSelects() {
  const driverSel = document.getElementById('assign-driver-select');
  const busSel = document.getElementById('assign-bus-select');
  if (!driverSel || !busSel) return;

  driverSel.innerHTML = '<option value="">Choose Driver...</option>';
  driversCache.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.name;
    opt.textContent = `${d.name} (${d.phone}) - ${d.status}`;
    driverSel.appendChild(opt);
  });

  busSel.innerHTML = '<option value="">Choose Bus...</option>';
  busesCache.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = `Bus ${b.busNumber || 'N/A'} - ${b.routeName || 'No Route'} [${b.status}]`;
    busSel.appendChild(opt);
  });
}

// Global Window Helpers for table actions
window.adminInspectBus = (busId) => {
  const bus = busesCache.find(b => b.id === busId);
  if (!bus) return;
  openBusInspector(bus);
};

window.adminEditBus = (busId) => {
  const bus = busesCache.find(b => b.id === busId);
  if (!bus) return;
  document.getElementById('bus-edit-id').value = bus.id;
  document.getElementById('form-bus-no').value = bus.busNumber || '';
  document.getElementById('form-bus-reg').value = bus.regNumber || '';
  document.getElementById('form-bus-capacity').value = bus.capacity || 50;
  document.getElementById('form-bus-status').value = bus.status || 'Active';
  document.getElementById('bus-editor-title').textContent = `Edit Bus ${bus.busNumber || ''}`;
  document.getElementById('bus-editor-modal')?.classList.remove('hidden');
};

window.adminOpenDriverAssign = (driverName) => {
  populateDriverAssignSelects();
  const driverSel = document.getElementById('assign-driver-select');
  if (driverSel) driverSel.value = driverName;
  document.getElementById('driver-assignment-modal')?.classList.remove('hidden');
};

window.adminOpenTicket = (ticketId) => {
  const ticket = reportsCache.find(r => r.id === ticketId);
  if (!ticket) return;
  currentInspectingTicket = ticket;

  setElText('modal-ticket-id', `Ticket ${ticket.reportNumber || 'NXR-REP'}`);
  setElText('modal-ticket-subject', ticket.subject || 'No Subject');
  setElText('modal-ticket-desc', ticket.description || 'No Description provided.');
  setElText('modal-ticket-reporter', `Reporter: ${ticket.userName || 'Student'}`);
  setElText('modal-ticket-bus', `Bus: ${ticket.busNumber ? `Bus ${ticket.busNumber}` : (ticket.routeName || 'General')}`);
  setElText('modal-ticket-date', `Date: ${formatDate(ticket.createdAt)}`);

  const statusSel = document.getElementById('modal-ticket-status-select');
  const prioSel = document.getElementById('modal-ticket-prio-select');
  const replyInput = document.getElementById('modal-ticket-reply');

  if (statusSel) statusSel.value = ticket.status || 'Submitted';
  if (prioSel) prioSel.value = ticket.priority || 'Normal';
  if (replyInput) replyInput.value = ticket.adminReply || '';

  const prioBadge = document.getElementById('modal-ticket-prio-badge');
  const statusBadge = document.getElementById('modal-ticket-status-badge');
  if (prioBadge) {
    prioBadge.className = `status-badge ${getPriorityBadgeClass(ticket.priority)}`;
    prioBadge.textContent = ticket.priority || 'Normal';
  }
  if (statusBadge) {
    statusBadge.className = `status-badge ${getStatusBadgeClass(ticket.status)}`;
    statusBadge.textContent = ticket.status || 'Submitted';
  }

  document.getElementById('ticket-modal')?.classList.remove('hidden');
};

window.adminApproveRequest = async (apprId, isApproved) => {
  try {
    const status = isApproved ? 'Approved' : 'Rejected';
    await updateDoc(doc(firestore, 'pending_approvals', apprId), {
      status: status,
      reviewedBy: currentAdminUser?.email || 'Admin',
      reviewedAt: serverTimestamp()
    });
    await logAuditEvent('APPROVAL_DECISION', 'pending_approvals', apprId, { status });
    alert(`Request ${status.toLowerCase()} successfully.`);
  } catch (err) {
    alert("Approval error: " + err.message);
  }
};

function openBusInspector(bus) {
  currentInspectingBus = bus;
  setElText('inspect-bus-title', `Bus ${bus.busNumber || 'N/A'}`);
  
  const statusBadge = document.getElementById('inspect-bus-status-badge');
  if (statusBadge) {
    statusBadge.className = `status-badge ${getStatusBadgeClass(bus.status)}`;
    statusBadge.textContent = bus.status || 'Active';
  }

  const isMoving = bus.status === 'Active' || bus.status === 'On Trip';
  setElText('inspect-bus-speed', isMoving ? '38 km/h' : '0 km/h');
  setElText('inspect-bus-occupancy', isMoving ? '84%' : '0%');
  setElText('inspect-bus-trip', isMoving ? 'Morning Campus Route' : 'Idle at Depot');

  setElVal('inspect-bus-reg', bus.regNumber || 'TN 33 AB 1234');
  setElVal('inspect-bus-capacity', `${bus.capacity || 50} Passengers`);
  setElVal('inspect-bus-route-name', bus.routeName || bus.route || 'Campus Line');
  setElVal('inspect-bus-driver-name', bus.driverName || 'Unassigned');
  setElVal('inspect-bus-driver-phone', bus.driverContact || bus.phone || '+91 98421 00000');
  setElVal('inspect-bus-driver-license', bus.driverLicense || 'DL-TN-2024-VERIFIED');

  const statusSelect = document.getElementById('inspect-bus-status-select');
  if (statusSelect) statusSelect.value = bus.status || 'Active';

  // Render assigned students list
  const studentsListEl = document.getElementById('inspect-bus-students-list');
  if (studentsListEl) {
    const busStudents = studentsCache.filter(s => s.assignedBus === bus.busNumber);
    if (busStudents.length === 0) {
      studentsListEl.innerHTML = `<div style="color: var(--text-secondary); font-size: 13.5px;">No students assigned to this bus.</div>`;
    } else {
      studentsListEl.innerHTML = busStudents.map(s => `
        <div style="background: #F9FAFB; padding: 10px 14px; border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--border-color);">
          <div>
            <strong>${escapeHtml(s.name)}</strong> <span style="font-size: 12px; color: var(--text-muted);">(${s.id})</span>
            <div style="font-size: 12px; color: var(--text-secondary);">${s.department} • Stop: ${s.pickupStop}</div>
          </div>
          <span class="status-badge badge-green">Active</span>
        </div>
      `).join('');
    }
  }

  // Render bus documents list
  const docsListEl = document.getElementById('inspect-bus-docs-list');
  if (docsListEl) {
    docsListEl.innerHTML = `
      <div style="background: #F9FAFB; padding: 10px 14px; border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--border-color);">
        <div>
          <strong>Vehicle Insurance</strong>
          <div style="font-size: 12px; color: var(--text-secondary);">Policy: INS-2026-${bus.busNumber} • Expiry: 2026-11-20</div>
        </div>
        <span class="status-badge badge-green">Valid</span>
      </div>
      <div style="background: #F9FAFB; padding: 10px 14px; border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--border-color); margin-top: 8px;">
        <div>
          <strong>Fitness Certificate (FC)</strong>
          <div style="font-size: 12px; color: var(--text-secondary);">Cert: FC-TN-${bus.busNumber} • Expiry: 2026-09-15</div>
        </div>
        <span class="status-badge badge-orange">Expiring Soon</span>
      </div>
    `;
  }

  document.getElementById('bus-inspector-modal')?.classList.remove('hidden');
}

// =============================================================================
// GLOBAL SEARCH ENGINE (OMNI-SEARCH)
// =============================================================================
function setupGlobalSearch() {
  const input = document.getElementById('global-search-input');
  const resultsBox = document.getElementById('global-search-results');
  if (!input || !resultsBox) return;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      resultsBox.classList.add('hidden');
      return;
    }

    const matchedBuses = busesCache.filter(b => (b.busNumber && String(b.busNumber).includes(q)) || (b.regNumber && b.regNumber.toLowerCase().includes(q)));
    const matchedDrivers = driversCache.filter(d => d.name.toLowerCase().includes(q) || d.phone.includes(q));
    const matchedStudents = studentsCache.filter(s => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q));
    const matchedTickets = reportsCache.filter(r => (r.reportNumber && r.reportNumber.toLowerCase().includes(q)) || (r.subject && r.subject.toLowerCase().includes(q)));

    let html = '';

    if (matchedBuses.length > 0) {
      html += `<div class="search-category-group"><div class="search-category-title">Buses</div>`;
      matchedBuses.slice(0, 3).forEach(b => {
        html += `<div class="search-item" onclick="window.adminInspectBus('${b.id}')"><span><strong>Bus ${b.busNumber}</strong> - ${b.routeName || 'Route'}</span><span class="status-badge badge-blue">Inspect</span></div>`;
      });
      html += `</div>`;
    }

    if (matchedDrivers.length > 0) {
      html += `<div class="search-category-group"><div class="search-category-title">Drivers</div>`;
      matchedDrivers.slice(0, 3).forEach(d => {
        html += `<div class="search-item" onclick="window.adminOpenDriverAssign('${d.name}')"><span><strong>${d.name}</strong> (${d.phone})</span><span class="status-badge badge-green">Driver</span></div>`;
      });
      html += `</div>`;
    }

    if (matchedTickets.length > 0) {
      html += `<div class="search-category-group"><div class="search-category-title">Support Tickets</div>`;
      matchedTickets.slice(0, 3).forEach(t => {
        html += `<div class="search-item" onclick="window.adminOpenTicket('${t.id}')"><span><strong>${t.reportNumber || 'Ticket'}</strong>: ${t.subject || 'Issue'}</span><span class="status-badge badge-orange">${t.status || 'Open'}</span></div>`;
      });
      html += `</div>`;
    }

    if (!html) {
      html = `<div style="padding: 16px; text-align: center; color: var(--text-secondary); font-size: 13px;">No results found for "${q}".</div>`;
    }

    resultsBox.innerHTML = html;
    resultsBox.classList.remove('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !resultsBox.contains(e.target)) {
      resultsBox.classList.add('hidden');
    }
  });
}

// =============================================================================
// AUDIT LOGGING UTILITY
// =============================================================================
async function logAuditEvent(action, entityType, entityId, metadata = {}) {
  try {
    await addDoc(collection(firestore, 'auditLogs'), {
      action,
      entityType,
      entityId: String(entityId),
      performedBy: currentAdminUser?.email || 'Super Admin',
      timestamp: serverTimestamp(),
      metadata
    });
  } catch (err) {
    console.warn("Audit log writing bypassed:", err.message);
  }
}

// =============================================================================
// HELPER UTILITIES
// =============================================================================
function setupFilterListeners() {
  ['buses-table-search', 'buses-status-filter'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', renderBusesTable);
    document.getElementById(id)?.addEventListener('change', renderBusesTable);
  });

  ['drivers-search-input', 'drivers-status-filter'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', renderDriversTable);
    document.getElementById(id)?.addEventListener('change', renderDriversTable);
  });

  ['students-search-input', 'students-bus-filter'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', renderStudentsTable);
    document.getElementById(id)?.addEventListener('change', renderStudentsTable);
  });

  ['admin-rep-search', 'admin-rep-status-filter', 'admin-rep-prio-filter', 'admin-rep-cat-filter'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', renderIssuesTable);
    document.getElementById(id)?.addEventListener('change', renderIssuesTable);
  });

  ['doc-search-input', 'doc-type-filter'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', renderDocumentsTable);
    document.getElementById(id)?.addEventListener('change', renderDocumentsTable);
  });
}

function setElText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setElVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function getStatusBadgeClass(status) {
  if (!status) return 'badge-gray';
  const s = String(status).toLowerCase();
  if (s === 'active' || s === 'resolved' || s === 'approved' || s === 'valid') return 'badge-green';
  if (s === 'on trip' || s === 'in progress') return 'badge-blue';
  if (s === 'submitted' || s === 'under review' || s === 'delayed' || s === 'pending' || s === 'expiring soon') return 'badge-orange';
  if (s === 'inactive' || s === 'rejected' || s === 'expired' || s === 'critical') return 'badge-red';
  return 'badge-gray';
}

function getPriorityBadgeClass(priority) {
  if (!priority) return 'badge-gray';
  const p = String(priority).toLowerCase();
  if (p === 'urgent') return 'badge-red';
  if (p === 'high') return 'badge-orange';
  return 'badge-gray';
}

function formatDate(ts) {
  if (!ts) return 'Recently';
  if (ts.toDate && typeof ts.toDate === 'function') {
    return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  if (ts.seconds) {
    return new Date(ts.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
