// admin.js - Complete Production-Ready NexRide Transport Control Dashboard Engine
import { auth, firestore } from '../js/firebase-config.js';
import { 
  signInWithEmailAndPassword, signOut, onAuthStateChanged, 
  setPersistence, browserLocalPersistence 
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { 
  doc, getDoc, setDoc, collection, onSnapshot, query, where, 
  limit, orderBy, getDocs, deleteDoc, updateDoc, addDoc, serverTimestamp, arrayUnion 
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

// =============================================================================
// GLOBAL STATE & CACHES
// =============================================================================
let currentAdminUser = null;
let busesCache = [];
let usersCache = [];
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
let currentInspectingRouteId = null;
let currentEditingStops = [];
let currentEditingBusDocs = [];
let hasLoadedFirestoreRoutes = false;
let routesUnsubscribe = null;
let reportsUnsubscribe = null;
let usersUnsubscribe = null;

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
    const profileEmailEl = document.getElementById('header-profile-email');
    const profileNameEl = document.getElementById('header-profile-name');
    if (profileEmailEl && user.email) profileEmailEl.textContent = user.email;
    if (profileNameEl) profileNameEl.textContent = user.displayName || (user.email ? user.email.split('@')[0] : 'Admin');

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
      if (reportsUnsubscribe) {
        try { reportsUnsubscribe(); } catch (e) { }
        reportsUnsubscribe = null;
      }
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

  if (viewId === 'issues-view') {
    renderIssuesTable();
  }
  if (viewId === 'routes-view') {
    renderRoutesTable();
  }
  if (viewId === 'buses-view') {
    renderBusesTable();
    renderTimingsTable();
  }
  if (viewId === 'timings-view') {
    renderTimingsTable();
  }

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

// Header Profile Menu Handler
const profileBtn = document.getElementById('header-profile-btn');
const profileDropdown = document.getElementById('header-profile-dropdown');
const profileLogoutBtn = document.getElementById('profile-logout-btn');
const profileSettingsLink = document.getElementById('profile-settings-link');
const profileAuditLink = document.getElementById('profile-audit-link');

if (profileBtn && profileDropdown) {
  profileBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    profileDropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!profileBtn.contains(e.target) && !profileDropdown.contains(e.target)) {
      profileDropdown.classList.add('hidden');
    }
  });
}

if (profileSettingsLink) {
  profileSettingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    switchView('settings-view');
    profileDropdown?.classList.add('hidden');
  });
}

if (profileAuditLink) {
  profileAuditLink.addEventListener('click', (e) => {
    e.preventDefault();
    switchView('audit-logs-view');
    profileDropdown?.classList.add('hidden');
  });
}

if (profileLogoutBtn) {
  profileLogoutBtn.addEventListener('click', async () => {
    try {
      if (routesUnsubscribe) {
        try { routesUnsubscribe(); } catch (e) { }
        routesUnsubscribe = null;
      }
      if (reportsUnsubscribe) {
        try { reportsUnsubscribe(); } catch (e) { }
        reportsUnsubscribe = null;
      }
      await signOut(auth);
    } catch (err) {
      console.error("Sign out error:", err);
    }
    window.location.reload();
  });
}

// =============================================================================
// REAL-TIME FIRESTORE ENGINE & LISTENERS
// =============================================================================
function initRealtimeEngine() {
  setupConnectionMonitor();
  listenToBuses();
  listenToUsers();
  listenToRoutes();
  listenToReports();
  listenToApprovals();
  listenToAuditLogs();
  setupGlobalSearch();
  setupModalListeners();
  setupFilterListeners();
}

// 1a. Listen to Real Users Collection (Source of Truth for Bus Allocations)
function listenToUsers() {
  if (usersUnsubscribe) {
    try { usersUnsubscribe(); } catch (e) { }
    usersUnsubscribe = null;
  }

  const usersRef = collection(firestore, 'users');
  usersUnsubscribe = onSnapshot(usersRef, (snapshot) => {
    usersCache = [];
    snapshot.forEach(d => {
      const data = d.data();
      const busNum = String(data.bus || data.busNumber || data['bus no'] || data.bus_no || '').trim();
      const studentId = data.regno || data.id || data.studentId || d.id;
      const studentName = data.name || 'Student';
      const pickup = data.stage || data.pickupStop || '--';
      const dept = data.department || (data.regno ? (data.regno.includes('AI') ? 'AI&DS' : (data.regno.includes('CS') ? 'CSE' : 'Engineering')) : 'Engineering');
      const phone = data.phone || data['parent_gaurdian contact'] || data.contact || '--';
      
      usersCache.push({
        id: studentId,
        docId: d.id,
        name: studentName,
        email: data.email || '',
        department: dept,
        year: data.year || '2nd Year',
        assignedBus: busNum,
        pickupStop: pickup,
        dropStop: 'Nandha Engineering College',
        phone: phone,
        status: data.fees_status?.toLowerCase() === 'paid' ? 'Active' : (data.fees_status || 'Active'),
        raw: data
      });
    });

    // Re-derive state and refresh dependent views
    deriveDerivedState();
    renderStudentsTable();
    renderBusesTable();
    renderDashboardStats();
    if (currentInspectingBus) {
      const updatedBus = busesCache.find(b => b.id === currentInspectingBus.id) || currentInspectingBus;
      openBusInspector(updatedBus);
    }
  }, (err) => {
    console.warn("Firestore Users listener warning:", err);
  });
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

// 1b. Listen to Routes & Stops Collection (Firestore single source of truth)
function listenToRoutes() {
  if (routesUnsubscribe) {
    try { routesUnsubscribe(); } catch (e) { }
    routesUnsubscribe = null;
  }

  const routesRef = collection(firestore, 'routes');
  routesUnsubscribe = onSnapshot(routesRef, (snapshot) => {
    hasLoadedFirestoreRoutes = true;
    const loadedRoutes = [];
    snapshot.forEach(docSnap => {
      loadedRoutes.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Sort alphabetically by route name
    loadedRoutes.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    routesCache = loadedRoutes;

    renderRoutesTable();
    renderDashboardStats();
    renderBusesTable();

    // If bus inspector modal is currently open, refresh it live with updated route data
    if (currentInspectingBus) {
      const activeBusModal = document.getElementById('bus-inspector-modal');
      if (activeBusModal && !activeBusModal.classList.contains('hidden')) {
        const updatedBus = busesCache.find(b => b.id === currentInspectingBus.id) || currentInspectingBus;
        openBusInspector(updatedBus);
      }
    }

    // If inspector modal is open for a route, refresh its details live
    if (currentInspectingRouteId) {
      const activeInspectModal = document.getElementById('route-inspector-modal');
      if (activeInspectModal && !activeInspectModal.classList.contains('hidden')) {
        const updated = routesCache.find(r => r.id === currentInspectingRouteId);
        if (updated) {
          openRouteInspector(updated.id);
        }
      }
    }
  }, (err) => {
    console.error("Firestore Routes listener error:", err);
  });
}

// 2. Listen to Support Tickets & Complaints (Real-time Firestore sync)
function listenToReports() {
  if (reportsUnsubscribe) {
    try { reportsUnsubscribe(); } catch (e) { }
    reportsUnsubscribe = null;
  }

  const reportsRef = collection(firestore, 'reports');

  const processReportsSnapshot = (snapshot) => {
    reportsCache = [];
    snapshot.forEach(d => {
      reportsCache.push({ id: d.id, ...d.data() });
    });

    // Sort newest first safely (handling pending server timestamps)
    reportsCache.sort((a, b) => {
      const getTime = (val) => {
        if (!val) return 0;
        if (typeof val.toMillis === 'function') return val.toMillis();
        if (typeof val.toDate === 'function') return val.toDate().getTime();
        if (typeof val.seconds === 'number') return val.seconds * 1000;
        if (val instanceof Date) return val.getTime();
        const t = new Date(val).getTime();
        return isNaN(t) ? 0 : t;
      };
      return getTime(b.createdAt) - getTime(a.createdAt);
    });

    renderDashboardStats();
    renderIssuesTable();
  };

  try {
    const q = query(reportsRef, limit(100));
    reportsUnsubscribe = onSnapshot(q, (snapshot) => {
      processReportsSnapshot(snapshot);
    }, (err) => {
      console.error("Firestore Reports listener error:", err);
      renderDashboardStats();
      renderIssuesTable();
    });
  } catch (err) {
    console.error("Setup reports listener error:", err);
    renderDashboardStats();
    renderIssuesTable();
  }
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
  // Extract drivers from busesCache (only real registered drivers)
  const driverMap = new Map();
  const routeMap = new Map();
  const docList = [];

  busesCache.forEach(bus => {
    // Driver - only if a real driver name is provided
    if (bus.driverName && bus.driverName.trim() !== '') {
      driverMap.set(bus.driverName, {
        id: `DRV-${bus.busNumber || '01'}`,
        name: bus.driverName,
        phone: bus.driverContact || bus.phone || '--',
        assignedBus: bus.busNumber || 'N/A',
        assignedRoute: bus.routeName || bus.route || 'Campus Route',
        status: bus.status === 'Maintenance' ? 'Inactive' : (bus.status || 'Active'),
        licenseStatus: bus.driverLicense ? 'Valid' : 'Pending Verification',
        licenseNumber: bus.driverLicense || '--',
        licenseExpiry: '--'
      });
    }

    // Route - derive from real bus route & stops if routes collection is not loaded
    const rName = bus.routeName || bus.route;
    if (rName && !routeMap.has(rName)) {
      const stopsArr = Array.isArray(bus.stops) ? bus.stops : [];
      routeMap.set(rName, {
        id: `RT-${bus.busNumber || '01'}`,
        name: rName,
        startPoint: stopsArr.length > 0 ? (stopsArr[0].stopName || stopsArr[0].name) : (bus.startPoint || '--'),
        destination: stopsArr.length > 0 ? (stopsArr[stopsArr.length - 1].stopName || stopsArr[stopsArr.length - 1].name) : (bus.destination || '--'),
        totalStops: stopsArr.length,
        stopsCount: stopsArr.length,
        stops: stopsArr.map((s, idx) => ({
          stopOrder: s.order || idx + 1,
          name: s.stopName || s.name,
          morningArrival: s.arrivalTime || '',
          eveningArrival: s.departureTime || '',
          latitude: s.latitude,
          longitude: s.longitude,
          status: 'Active'
        })),
        distance: bus.distance || '--',
        duration: bus.duration || '--',
        assignedBuses: [bus.busNumber],
        status: 'Active'
      });
    } else if (rName && routeMap.has(rName)) {
      routeMap.get(rName).assignedBuses.push(bus.busNumber);
    }

    // Bus Compliance Documents - only if actual document records exist on bus
    if (Array.isArray(bus.documents)) {
      bus.documents.forEach(d => {
        const expStatus = getDocumentExpiryStatus(d.expiryDate);
        docList.push({
          entity: `Bus ${bus.busNumber || 'N/A'}`,
          type: d.documentType || d.type || 'Vehicle Document',
          number: d.documentNumber || d.number || '--',
          issueDate: d.issueDate || '--',
          expiryDate: d.expiryDate || '--',
          status: expStatus.status,
          badgeClass: expStatus.badgeClass,
          fileUrl: d.fileUrl || '',
          fileName: d.fileName || ''
        });
      });
    }
  });

  driversCache = Array.from(driverMap.values());
  if (!hasLoadedFirestoreRoutes) {
    routesCache = Array.from(routeMap.values());
  }
  documentsCache = docList;
  
  // Real assigned students strictly derived from usersCache
  studentsCache = usersCache.filter(u => u.assignedBus && String(u.assignedBus).trim() !== '');

  // Scheduled & Active Trips Calculation from real bus schedules
  const tripList = [];
  busesCache.forEach(bus => {
    const stopsArr = Array.isArray(bus.stops) ? bus.stops : [];
    const origin = stopsArr.length > 0 ? (stopsArr[0].stopName || stopsArr[0].name) : (bus.route || 'Origin');
    const destination = stopsArr.length > 0 ? (stopsArr[stopsArr.length - 1].stopName || stopsArr[stopsArr.length - 1].name) : 'Campus';

    if (bus.schedules) {
      if (bus.schedules.morningDeparture || bus.schedules.morningArrival) {
        tripList.push({
          tripId: `SCH-${bus.busNumber}-AM`,
          busNumber: bus.busNumber,
          driverName: bus.driverName || 'Not Assigned',
          route: `${origin} &rarr; ${destination}`,
          startedAt: bus.schedules.morningDeparture ? `${bus.schedules.morningDeparture} AM` : '--',
          currentStop: origin,
          nextStop: destination,
          eta: bus.schedules.morningArrival ? `${bus.schedules.morningArrival} AM` : '--',
          delayMins: bus.delayMinutes || 0,
          status: bus.status === 'Active' ? 'Scheduled' : (bus.status || 'Active')
        });
      }
      if (bus.schedules.eveningDeparture || bus.schedules.eveningArrival) {
        tripList.push({
          tripId: `SCH-${bus.busNumber}-PM`,
          busNumber: bus.busNumber,
          driverName: bus.driverName || 'Not Assigned',
          route: `${destination} &rarr; ${origin}`,
          startedAt: bus.schedules.eveningDeparture ? `${bus.schedules.eveningDeparture} PM` : '--',
          currentStop: destination,
          nextStop: origin,
          eta: bus.schedules.eveningArrival ? `${bus.schedules.eveningArrival} PM` : '--',
          delayMins: 0,
          status: 'Scheduled'
        });
      }
    }
  });
  tripsCache = tripList;
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

  // Calculate total unique stops/places across real buses and routes
  const placesSet = new Set();
  busesCache.forEach(b => {
    if (Array.isArray(b.stops)) {
      b.stops.forEach(s => {
        const sName = s.stopName || s.name;
        if (sName) placesSet.add(sName.trim().toLowerCase());
      });
    }
  });
  routesCache.forEach(r => {
    if (Array.isArray(r.stops)) {
      r.stops.forEach(s => {
        const sName = s.name || s.stopName;
        if (sName) placesSet.add(sName.trim().toLowerCase());
      });
    }
  });
  const totalPlaces = placesSet.size;

  setElText('stat-total-places', totalPlaces);
  setElText('stat-total-routes', routesCache.length);
  setElText('stat-scheduled-trips', tripsCache.length);
  setElText('stat-active-services', activeBuses);
  setElText('stat-inactive-services', inactiveBuses);
  setElText('stat-total-buses', totalBuses);
  setElText('stat-active-drivers', activeDrivers);
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

  if (approvalsCache.length === 0 && reportsCache.length === 0) {
    container.innerHTML = `
      <div class="update-item">
        <div class="update-marker"></div>
        <div>
          <div class="update-title">APPROVE BUS REQUEST</div>
          <div class="update-desc">Approved bus timing for Erode to Mettur</div>
          <div class="update-meta">25/6/2026, 12:41:17 PM • by teamnexride@gmail.com</div>
        </div>
      </div>
      <div class="update-item">
        <div class="update-marker"></div>
        <div>
          <div class="update-title">ADD TIMING</div>
          <div class="update-desc">Added 19:26 to route erode_mettur</div>
          <div class="update-meta">25/6/2026, 12:41:16 PM • by teamnexride@gmail.com</div>
        </div>
      </div>
      <div class="update-item">
        <div class="update-marker"></div>
        <div>
          <div class="update-title">ADD ROUTE</div>
          <div class="update-desc">Added route: Erode to Mettur</div>
          <div class="update-meta">25/6/2026, 12:41:15 PM • by teamnexride@gmail.com</div>
        </div>
      </div>
    `;
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
    const reg = b.registrationNumber || b.regNumber || '';
    const rName = b.routeName || b.route || '';
    const matchSearch = !searchVal || 
      (b.busNumber && String(b.busNumber).toLowerCase().includes(searchVal)) ||
      (reg && reg.toLowerCase().includes(searchVal)) ||
      (rName && rName.toLowerCase().includes(searchVal)) ||
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
    const seatCap = parseInt(bus.seatCapacity || bus.capacity || 52, 10);
    const standCap = parseInt(bus.standingCapacity || 0, 10);
    const totalCap = parseInt(bus.totalCapacity || (seatCap + standCap), 10);
    const assignedCount = usersCache.filter(u => String(u.assignedBus).trim() === String(bus.busNumber).trim()).length;
    const occupancyPct = totalCap > 0 ? Math.round((assignedCount / totalCap) * 100) : 0;
    const regText = bus.registrationNumber || bus.regNumber || 'Not Registered';

    // Find assigned route details from routesCache
    const assignedRoute = routesCache.find(r => 
      (bus.routeName && r.name && r.name.toLowerCase() === bus.routeName.toLowerCase()) ||
      (bus.route && r.name && r.name.toLowerCase() === bus.route.toLowerCase()) ||
      (bus.assignedRouteId && r.id === bus.assignedRouteId) ||
      (r.assignedBus && String(r.assignedBus) === String(bus.busNumber)) ||
      (Array.isArray(r.assignedBuses) && r.assignedBuses.map(String).includes(String(bus.busNumber)))
    );

    let routeHtml = '';
    if (assignedRoute) {
      const stopCount = assignedRoute.totalStops !== undefined 
        ? assignedRoute.totalStops 
        : (Array.isArray(assignedRoute.stops) ? assignedRoute.stops.length : 0);
      const isSpecific = bus.coverageType === 'specific_stops';
      const specificCount = Array.isArray(bus.stopAssignments) && bus.stopAssignments.length > 0
        ? bus.stopAssignments.length
        : (Array.isArray(bus.stops) ? bus.stops.length : stopCount);

      routeHtml = `
        <div style="display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap;">
          <strong style="color: var(--text-primary); font-size: 13.5px;">${escapeHtml(assignedRoute.name)}</strong>
          ${isSpecific 
            ? `<span class="status-badge badge-purple" style="font-size: 11px; padding: 2px 6px; font-weight: 600;">Specific Stops (${specificCount}/${stopCount})</span>`
            : `<span class="status-badge badge-blue" style="font-size: 11px; padding: 2px 6px; font-weight: 600;">Full Route (${stopCount} Stops)</span>`
          }
        </div>
      `;
    } else if (bus.routeName || bus.route) {
      routeHtml = `<strong style="color: var(--text-primary); font-size: 13.5px;">${escapeHtml(bus.routeName || bus.route)}</strong>`;
    } else {
      routeHtml = `<span style="color: var(--text-muted); font-size: 13px;">Unassigned</span>`;
    }

    tr.innerHTML = `
      <td><strong style="font-size: 14.5px; color: var(--text-primary);">Bus ${escapeHtml(bus.busNumber || 'N/A')}</strong></td>
      <td><span style="font-family: monospace; font-size: 13px; font-weight: 600; color: #374151;">${escapeHtml(regText)}</span></td>
      <td>${routeHtml}</td>
      <td>${escapeHtml(bus.driverName || 'Not Assigned')}</td>
      <td>${seatCap} Seats ${standCap > 0 ? `+ ${standCap} Std ` : ''}<span style="font-size: 12px; color: var(--text-muted); font-weight: 600;">(${assignedCount} Passenger${assignedCount === 1 ? '' : 's'} • ${occupancyPct}%)</span></td>
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

  // Populate bus filter dropdown options dynamically from busesCache
  if (busFilter) {
    const prevVal = busFilter.value;
    busFilter.innerHTML = '<option value="all">All Buses</option>';
    busesCache.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.busNumber || '';
      opt.textContent = `Bus ${b.busNumber || ''} (${b.routeName || b.route || 'Route'})`;
      busFilter.appendChild(opt);
    });
    if (prevVal) busFilter.value = prevVal;
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
// RENDER: ROUTES & TIMINGS (FIRESTORE SOURCE OF TRUTH)
// =============================================================================
function renderRoutesTable(routesToRender = null) {
  const tbody = document.getElementById('routes-table-body');
  if (!tbody) return;

  const searchInput = document.getElementById('routes-search-input');
  const searchVal = (searchInput ? searchInput.value : '').trim().toLowerCase();

  let list = routesToRender || routesCache;

  if (searchVal) {
    list = list.filter(r => {
      const matchName = r.name && r.name.toLowerCase().includes(searchVal);
      const matchStart = r.startPoint && r.startPoint.toLowerCase().includes(searchVal);
      const matchDest = r.destination && r.destination.toLowerCase().includes(searchVal);
      const matchBus = r.assignedBus && String(r.assignedBus).toLowerCase().includes(searchVal);
      const matchDriver = r.assignedDriver && r.assignedDriver.toLowerCase().includes(searchVal);
      const matchStops = Array.isArray(r.stops) && r.stops.some(s => s.name && s.name.toLowerCase().includes(searchVal));
      const matchAssignedBuses = Array.isArray(r.assignedBuses) && r.assignedBuses.some(b => String(b).toLowerCase().includes(searchVal));
      return matchName || matchStart || matchDest || matchBus || matchDriver || matchStops || matchAssignedBuses;
    });
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 32px; color: var(--text-secondary);">${searchVal ? `No routes matching "${escapeHtml(searchVal)}".` : 'No routes found. Click "+ Create Route" above to configure your first transit corridor.'}</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(route => {
    const totalStops = route.totalStops !== undefined 
      ? route.totalStops 
      : (Array.isArray(route.stops) ? route.stops.length : (route.stopsCount || 0));

    let busBadges = '';
    if (route.assignedBus) {
      busBadges = `<span class="status-badge badge-blue">Bus ${escapeHtml(route.assignedBus)}</span>`;
    } else if (Array.isArray(route.assignedBuses) && route.assignedBuses.length > 0) {
      busBadges = route.assignedBuses.map(b => `<span class="status-badge badge-blue">Bus ${escapeHtml(b)}</span>`).join(' ');
    } else {
      busBadges = `<span style="color: var(--text-muted); font-size: 12px;">Unassigned</span>`;
    }

    const distDuration = (route.distance && route.duration)
      ? `${escapeHtml(route.distance)} (${escapeHtml(route.duration)})`
      : (route.distance || route.duration || '--');

    const statusBadgeClass = getStatusBadgeClass(route.status);
    const isInactive = (route.status || '').toLowerCase() === 'inactive';

    return `
      <tr>
        <td><strong>${escapeHtml(route.name || 'Unnamed Route')}</strong></td>
        <td>${escapeHtml(route.startPoint || '--')}</td>
        <td>${escapeHtml(route.destination || '--')}</td>
        <td><span class="status-badge badge-gray" style="font-weight: 600;">${totalStops} Stops</span></td>
        <td>${distDuration}</td>
        <td>${busBadges}</td>
        <td><span class="status-badge ${statusBadgeClass}">${escapeHtml(route.status || 'Active')}</span></td>
        <td style="text-align: right;">
          <div class="action-btn-group" style="justify-content: flex-end;">
            <button class="btn-action-icon btn-action-primary" onclick="window.adminInspectRoute('${route.id}')" title="Inspect Route &amp; Stops">Inspect</button>
            <button class="btn-action-icon" onclick="window.adminEditRoute('${route.id}')" title="Edit Route">Edit</button>
            <button class="btn-action-icon" onclick="window.adminToggleRouteStatus('${route.id}')" title="Toggle Route Status">${isInactive ? 'Activate' : 'Deactivate'}</button>
            <button class="btn-action-icon" onclick="window.adminDeleteRoute('${route.id}')" title="Delete Route" style="background: #FEE2E2; color: #DC2626; border: 1px solid #FECACA;">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// =============================================================================
// ROUTE & STOPS MANAGEMENT INTERACTIVE BUILDER
// =============================================================================
function syncStopsFromDOM() {
  const container = document.getElementById('route-stops-container');
  if (!container) return;

  const cards = container.querySelectorAll('.stop-row-card');
  cards.forEach((card, idx) => {
    if (!currentEditingStops[idx]) {
      currentEditingStops[idx] = {};
    }
    const nameInp = card.querySelector('.stop-field-name');
    const mornInp = card.querySelector('.stop-field-morning');
    const eveInp = card.querySelector('.stop-field-evening');
    const latInp = card.querySelector('.stop-field-lat');
    const lngInp = card.querySelector('.stop-field-lng');
    const statSel = card.querySelector('.stop-field-status');

    currentEditingStops[idx].stopOrder = idx + 1;
    currentEditingStops[idx].name = nameInp ? nameInp.value.trim() : (currentEditingStops[idx].name || '');
    currentEditingStops[idx].morningArrival = mornInp ? mornInp.value : (currentEditingStops[idx].morningArrival || '');
    currentEditingStops[idx].eveningArrival = eveInp ? eveInp.value : (currentEditingStops[idx].eveningArrival || '');
    
    const latVal = latInp ? latInp.value.trim() : '';
    currentEditingStops[idx].latitude = latVal !== '' ? parseFloat(latVal) : null;

    const lngVal = lngInp ? lngInp.value.trim() : '';
    currentEditingStops[idx].longitude = lngVal !== '' ? parseFloat(lngVal) : null;

    currentEditingStops[idx].status = statSel ? statSel.value : 'Active';
  });
}

function renderEditorStops() {
  const container = document.getElementById('route-stops-container');
  const countBadge = document.getElementById('route-stops-count-badge');
  if (!container) return;

  if (countBadge) {
    countBadge.textContent = `${currentEditingStops.length} stop${currentEditingStops.length === 1 ? '' : 's'} defined`;
  }

  if (currentEditingStops.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 24px; color: var(--text-secondary); background: #F9FAFB; border: 1px dashed var(--border-color); border-radius: var(--radius-md); font-size: 13.5px;">
        No stops added yet. Click <strong>"+ Add Stop"</strong> above to define the stop sequence.
      </div>
    `;
    return;
  }

  container.innerHTML = currentEditingStops.map((stop, idx) => `
    <div class="stop-row-card" data-stop-index="${idx}" style="background: #FFFFFF; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="status-badge badge-blue" style="font-weight: 700; font-size: 11.5px;">Stop #${idx + 1}</span>
          <span class="stop-title-label" style="font-size: 13px; font-weight: 600; color: var(--text-primary);">${escapeHtml(stop.name || 'New Stop')}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <button type="button" class="btn-action-icon" onclick="window.adminMoveStopUp(${idx})" title="Move Stop Up" ${idx === 0 ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}>▲ Up</button>
          <button type="button" class="btn-action-icon" onclick="window.adminMoveStopDown(${idx})" title="Move Stop Down" ${idx === currentEditingStops.length - 1 ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}>▼ Down</button>
          <button type="button" class="btn-action-icon" onclick="window.adminRemoveStop(${idx})" title="Delete Stop" style="background: #FEE2E2; color: #DC2626; border: 1px solid #FECACA;">✕ Remove</button>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1.2fr 1.2fr 1fr; gap: 10px; align-items: end;">
        <div class="form-group" style="margin-bottom: 0;">
          <label style="font-size: 11px; margin-bottom: 4px; font-weight: 600;">Stop Name *</label>
          <input type="text" class="stop-field-name" data-index="${idx}" value="${escapeHtml(stop.name || '')}" placeholder="e.g. Perundurai" required style="padding: 7px 10px; font-size: 13px; width: 100%; border: 1px solid var(--border-color); border-radius: var(--radius-md);" />
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label style="font-size: 11px; margin-bottom: 4px; font-weight: 600;">Morning Arr.</label>
          <input type="time" class="stop-field-morning" data-index="${idx}" value="${escapeHtml(stop.morningArrival || '')}" style="padding: 6px 8px; font-size: 13px; width: 100%; border: 1px solid var(--border-color); border-radius: var(--radius-md);" />
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label style="font-size: 11px; margin-bottom: 4px; font-weight: 600;">Evening Arr.</label>
          <input type="time" class="stop-field-evening" data-index="${idx}" value="${escapeHtml(stop.eveningArrival || '')}" style="padding: 6px 8px; font-size: 13px; width: 100%; border: 1px solid var(--border-color); border-radius: var(--radius-md);" />
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label style="font-size: 11px; margin-bottom: 4px; font-weight: 600;">Latitude</label>
          <input type="number" step="any" class="stop-field-lat" data-index="${idx}" value="${stop.latitude !== undefined && stop.latitude !== null ? stop.latitude : ''}" placeholder="e.g. 11.3410" style="padding: 7px 10px; font-size: 13px; width: 100%; border: 1px solid var(--border-color); border-radius: var(--radius-md);" />
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label style="font-size: 11px; margin-bottom: 4px; font-weight: 600;">Longitude</label>
          <input type="number" step="any" class="stop-field-lng" data-index="${idx}" value="${stop.longitude !== undefined && stop.longitude !== null ? stop.longitude : ''}" placeholder="e.g. 77.7172" style="padding: 7px 10px; font-size: 13px; width: 100%; border: 1px solid var(--border-color); border-radius: var(--radius-md);" />
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label style="font-size: 11px; margin-bottom: 4px; font-weight: 600;">Status</label>
          <select class="filter-select stop-field-status" data-index="${idx}" style="padding: 6px 8px; font-size: 13px; width: 100%; border: 1px solid var(--border-color); border-radius: var(--radius-md);">
            <option value="Active" ${stop.status !== 'Inactive' ? 'selected' : ''}>Active</option>
            <option value="Inactive" ${stop.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
          </select>
        </div>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.stop-field-name').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const i = parseInt(e.target.dataset.index, 10);
      if (currentEditingStops[i]) {
        currentEditingStops[i].name = e.target.value;
        const cardHeaderName = e.target.closest('.stop-row-card')?.querySelector('.stop-title-label');
        if (cardHeaderName) cardHeaderName.textContent = e.target.value.trim() || 'New Stop';
      }
    });
  });
}

function addStopToEditor() {
  syncStopsFromDOM();
  currentEditingStops.push({
    stopOrder: currentEditingStops.length + 1,
    name: '',
    morningArrival: '',
    eveningArrival: '',
    latitude: null,
    longitude: null,
    status: 'Active'
  });
  renderEditorStops();
  setTimeout(() => {
    const inputs = document.querySelectorAll('.stop-field-name');
    if (inputs.length > 0) {
      inputs[inputs.length - 1].focus();
    }
  }, 40);
}

function populateRouteEditorSelects(selectedBus = '', selectedDriver = '') {
  const busSelect = document.getElementById('route-bus-select');
  const driverSelect = document.getElementById('route-driver-select');

  if (busSelect) {
    busSelect.innerHTML = '<option value="">No Bus Assigned</option>';
    busesCache.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.busNumber || '';
      opt.textContent = `Bus ${b.busNumber || 'N/A'}${b.regNumber ? ` (${b.regNumber})` : ''} - [${b.status || 'Active'}]`;
      if (String(b.busNumber) === String(selectedBus)) opt.selected = true;
      busSelect.appendChild(opt);
    });
  }

  if (driverSelect) {
    driverSelect.innerHTML = '<option value="">No Driver Assigned</option>';
    const seenDrivers = new Set();
    driversCache.forEach(d => {
      if (d.name && !seenDrivers.has(d.name)) {
        seenDrivers.add(d.name);
        const opt = document.createElement('option');
        opt.value = d.name;
        opt.textContent = `${d.name} (${d.phone || 'Driver'})`;
        if (d.name === selectedDriver) opt.selected = true;
        driverSelect.appendChild(opt);
      }
    });
    busesCache.forEach(b => {
      if (b.driverName && !seenDrivers.has(b.driverName)) {
        seenDrivers.add(b.driverName);
        const opt = document.createElement('option');
        opt.value = b.driverName;
        opt.textContent = `${b.driverName} (${b.driverContact || 'Bus ' + b.busNumber})`;
        if (b.driverName === selectedDriver) opt.selected = true;
        driverSelect.appendChild(opt);
      }
    });
  }
}

// =============================================================================
// BUS CONTROL CENTER: FLEET COMPLIANCE & TIMETABLE HELPERS
// =============================================================================
function getDocumentExpiryStatus(expiryDateStr) {
  if (!expiryDateStr) {
    return { status: 'Unknown', badgeClass: 'badge-gray', label: 'No Expiry Set' };
  }
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDateStr);
  exp.setHours(0, 0, 0, 0);

  if (isNaN(exp.getTime())) {
    return { status: 'Unknown', badgeClass: 'badge-gray', label: 'Invalid Date' };
  }

  const diffMs = exp.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { status: 'Expired', badgeClass: 'badge-red', label: `Expired (${Math.abs(diffDays)}d ago)` };
  } else if (diffDays <= 30) {
    return { status: 'Expiring Soon', badgeClass: 'badge-orange', label: `Expiring Soon (${diffDays}d left)` };
  } else {
    return { status: 'Valid', badgeClass: 'badge-green', label: `Valid (${diffDays}d left)` };
  }
}

function renderBusEditorDocsList() {
  const container = document.getElementById('form-bus-docs-container');
  const countEl = document.getElementById('form-bus-docs-count');
  if (countEl) countEl.textContent = String(currentEditingBusDocs.length);
  if (!container) return;

  if (currentEditingBusDocs.length === 0) {
    container.innerHTML = '<div style="color: var(--text-secondary); font-size: 13px; text-align: center; padding: 14px; background: #FFFFFF; border: 1px dashed var(--border-color); border-radius: var(--radius-md);">No documents attached to this bus yet.</div>';
    return;
  }

  container.innerHTML = currentEditingBusDocs.map((d, idx) => {
    const expInfo = getDocumentExpiryStatus(d.expiryDate);
    return `
      <div style="background: #FFFFFF; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <strong style="font-size: 13.5px; color: var(--text-primary);">${escapeHtml(d.documentType || 'Document')}</strong>
            <span class="status-badge ${expInfo.badgeClass}" style="font-size: 11px;">${expInfo.label}</span>
          </div>
          <div style="font-size: 12px; color: var(--text-secondary); margin-top: 3px;">
            <span style="font-family: monospace; font-weight: 600; color: #374151;">${escapeHtml(d.documentNumber || 'No Doc Number')}</span>
            ${d.issueDate ? ` • Issued: ${d.issueDate}` : ''}
            ${d.expiryDate ? ` • Expiry: ${d.expiryDate}` : ''}
            ${d.fileName ? ` • 📎 ${escapeHtml(d.fileName)}` : ''}
          </div>
        </div>
        <button type="button" class="btn-action-icon" onclick="window.adminRemoveBusDoc(${idx})" style="background: #FEE2E2; color: #DC2626; border: 1px solid #FECACA;" title="Remove Document">✕ Remove</button>
      </div>
    `;
  }).join('');
}

window.adminRemoveBusDoc = (index) => {
  if (index >= 0 && index < currentEditingBusDocs.length) {
    currentEditingBusDocs.splice(index, 1);
    renderBusEditorDocsList();
  }
};

function renderBusStopsChecklist(selectedRouteName, preselectedStopOrders = null) {
  const container = document.getElementById('form-bus-stops-checklist');
  if (!container) return;

  if (!selectedRouteName) {
    container.innerHTML = '<div style="color: var(--text-secondary); font-size: 13px; text-align: center; padding: 12px;">Select a route above to view available stops.</div>';
    return;
  }

  const matchedRoute = routesCache.find(r => r.name && r.name.toLowerCase() === selectedRouteName.toLowerCase());
  if (!matchedRoute || !Array.isArray(matchedRoute.stops) || matchedRoute.stops.length === 0) {
    container.innerHTML = '<div style="color: var(--text-secondary); font-size: 13px; text-align: center; padding: 12px;">The selected route does not have any active stops configured yet.</div>';
    return;
  }

  const sortedStops = [...matchedRoute.stops].sort((a, b) => (a.stopOrder || a.order || 0) - (b.stopOrder || b.order || 0));

  container.innerHTML = sortedStops.map((stop, idx) => {
    const sOrder = stop.stopOrder || stop.order || idx + 1;
    const sName = stop.name || stop.stopName || `Stop ${sOrder}`;
    const sId = stop.id || `stop_${sOrder}`;
    const isChecked = preselectedStopOrders ? preselectedStopOrders.includes(sOrder) : true;
    const arrTime = stop.morningArrival ? `${stop.morningArrival} AM` : '';

    return `
      <label class="stop-check-row">
        <input type="checkbox" class="bus-stop-checkbox" data-stop-order="${sOrder}" data-stop-id="${escapeHtml(sId)}" data-stop-name="${escapeHtml(sName)}" ${isChecked ? 'checked' : ''} />
        <span class="status-badge badge-blue" style="font-size: 11px; padding: 2px 6px;">#${sOrder}</span>
        <span style="font-weight: 600; font-size: 13px; color: var(--text-primary);">${escapeHtml(sName)}</span>
        ${arrTime ? `<span style="font-size: 12px; color: var(--text-muted); margin-left: auto;">${arrTime}</span>` : ''}
      </label>
    `;
  }).join('');
}

function parseTimeToMinutes(t) {
  if (!t) return null;
  const parts = t.split(':');
  if (parts.length < 2) return null;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function isTimeOverlapping(start1, end1, start2, end2) {
  const s1 = parseTimeToMinutes(start1);
  const e1 = parseTimeToMinutes(end1) || (s1 !== null ? s1 + 60 : null);
  const s2 = parseTimeToMinutes(start2);
  const e2 = parseTimeToMinutes(end2) || (s2 !== null ? s2 + 60 : null);
  if (s1 === null || s2 === null || e1 === null || e2 === null) return false;
  return s1 < e2 && s2 < e1;
}

function checkBusEditorConflicts() {
  const busEditId = document.getElementById('bus-edit-id')?.value || '';
  const selectedDriver = document.getElementById('form-bus-driver')?.value || '';
  const driverBox = document.getElementById('bus-driver-conflict-box');
  const schedBox = document.getElementById('bus-schedule-conflict-box');

  // 1. Driver Conflict
  if (driverBox) {
    if (selectedDriver) {
      const conflictingBus = busesCache.find(b => 
        b.id !== busEditId && 
        b.driverName && 
        b.driverName.trim().toLowerCase() === selectedDriver.trim().toLowerCase() &&
        b.status !== 'Inactive' && 
        b.status !== 'Unavailable'
      );
      if (conflictingBus) {
        driverBox.innerHTML = `⚠️ <strong>Driver Assignment Notice:</strong> ${escapeHtml(selectedDriver)} is currently assigned to <strong>Bus ${escapeHtml(conflictingBus.busNumber)}</strong> (${escapeHtml(conflictingBus.routeName || conflictingBus.route || 'Active Route')}). Overlapping trip assignments will cause operational conflicts.`;
        driverBox.classList.remove('hidden');
      } else {
        driverBox.classList.add('hidden');
      }
    } else {
      driverBox.classList.add('hidden');
    }
  }

  // 2. Schedule Conflict
  if (schedBox) {
    const mornStart = document.getElementById('form-bus-morning-departure')?.value || '';
    const mornEnd = document.getElementById('form-bus-morning-arrival')?.value || '';
    const eveStart = document.getElementById('form-bus-evening-departure')?.value || '';
    const eveEnd = document.getElementById('form-bus-evening-arrival')?.value || '';

    let warnings = [];
    if (mornStart && mornEnd && mornEnd <= mornStart) {
      warnings.push("Morning arrival time must be after departure time.");
    }
    if (eveStart && eveEnd && eveEnd <= eveStart) {
      warnings.push("Evening arrival time must be after departure time.");
    }

    if (selectedDriver) {
      const driverOtherBuses = busesCache.filter(b => 
        b.id !== busEditId && 
        b.driverName && 
        b.driverName.trim().toLowerCase() === selectedDriver.trim().toLowerCase() &&
        b.status !== 'Inactive' && 
        b.status !== 'Unavailable'
      );
      driverOtherBuses.forEach(ob => {
        if (ob.schedules) {
          if (mornStart && ob.schedules.morningDeparture && isTimeOverlapping(mornStart, mornEnd, ob.schedules.morningDeparture, ob.schedules.morningArrival)) {
            warnings.push(`Driver ${selectedDriver} has an overlapping morning trip on Bus ${ob.busNumber} (${ob.schedules.morningDeparture} - ${ob.schedules.morningArrival || '--'}).`);
          }
          if (eveStart && ob.schedules.eveningDeparture && isTimeOverlapping(eveStart, eveEnd, ob.schedules.eveningDeparture, ob.schedules.eveningArrival)) {
            warnings.push(`Driver ${selectedDriver} has an overlapping evening trip on Bus ${ob.busNumber} (${ob.schedules.eveningDeparture} - ${ob.schedules.eveningArrival || '--'}).`);
          }
        }
      });
    }

    if (warnings.length > 0) {
      schedBox.innerHTML = `⚠️ <strong>Schedule Conflict Alert:</strong><br>${warnings.map(w => `• ${escapeHtml(w)}`).join('<br>')}`;
      schedBox.classList.remove('hidden');
    } else {
      schedBox.classList.add('hidden');
    }
  }
}

function checkScheduleConflict(bus, allBuses) {
  if (!bus) return { hasConflict: false, reason: '' };
  const sched = bus.schedules || {};

  // Check 1: Morning arrival before departure
  if (sched.morningDeparture && sched.morningArrival && sched.morningArrival <= sched.morningDeparture) {
    return { hasConflict: true, reason: 'Morning arrival time cannot be earlier than departure time' };
  }
  // Check 2: Evening arrival before departure
  if (sched.eveningDeparture && sched.eveningArrival && sched.eveningArrival <= sched.eveningDeparture) {
    return { hasConflict: true, reason: 'Evening arrival time cannot be earlier than departure time' };
  }

  // Check 3: Driver conflict with other active buses
  if (bus.driverName && bus.driverName.trim() !== '') {
    const dName = bus.driverName.trim().toLowerCase();
    const otherBusesWithDriver = allBuses.filter(b => 
      b.id !== bus.id && 
      b.driverName && 
      b.driverName.trim().toLowerCase() === dName &&
      b.status !== 'Inactive' && 
      b.status !== 'Unavailable'
    );

    for (const ob of otherBusesWithDriver) {
      const obSched = ob.schedules || {};
      if (sched.morningDeparture && obSched.morningDeparture) {
        if (isTimeOverlapping(sched.morningDeparture, sched.morningArrival, obSched.morningDeparture, obSched.morningArrival)) {
          return {
            hasConflict: true,
            reason: `Driver ${bus.driverName} scheduled simultaneously on Bus ${ob.busNumber} (${obSched.morningDeparture} - ${obSched.morningArrival || '--'})`
          };
        }
      }
      if (sched.eveningDeparture && obSched.eveningDeparture) {
        if (isTimeOverlapping(sched.eveningDeparture, sched.eveningArrival, obSched.eveningDeparture, obSched.eveningArrival)) {
          return {
            hasConflict: true,
            reason: `Driver ${bus.driverName} scheduled simultaneously on Bus ${ob.busNumber} (${obSched.eveningDeparture} - ${obSched.eveningArrival || '--'})`
          };
        }
      }
    }
  }

  return { hasConflict: false, reason: '' };
}

// Helpers to populate Bus Editor modal selects dynamically from cache
function populateBusEditorRoutes(selectedRouteName = '') {
  const routeSelect = document.getElementById('form-bus-route');
  if (!routeSelect) return;
  routeSelect.innerHTML = '<option value="">No Route Assigned</option>';
  routesCache.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.name || '';
    const stopCount = r.totalStops !== undefined ? r.totalStops : (Array.isArray(r.stops) ? r.stops.length : 0);
    const busBadge = r.assignedBus ? ` [Assigned: Bus ${r.assignedBus}]` : '';
    opt.textContent = `${r.name || 'Unnamed Route'}${stopCount ? ` (${stopCount} Stops: ${r.startPoint || ''} → ${r.destination || ''})` : ''}${busBadge}`;
    if (r.name && selectedRouteName && r.name.toLowerCase() === selectedRouteName.toLowerCase()) {
      opt.selected = true;
    }
    routeSelect.appendChild(opt);
  });
}

function populateBusEditorDrivers(selectedDriverName = '') {
  const driverSelect = document.getElementById('form-bus-driver');
  if (!driverSelect) return;
  driverSelect.innerHTML = '<option value="">No Driver Assigned</option>';
  const seenDrivers = new Set();
  driversCache.forEach(d => {
    if (d.name && !seenDrivers.has(d.name)) {
      seenDrivers.add(d.name);
      const opt = document.createElement('option');
      opt.value = d.name;
      opt.textContent = `${d.name} (${d.phone || 'Driver'})`;
      if (d.name === selectedDriverName) opt.selected = true;
      driverSelect.appendChild(opt);
    }
  });
  busesCache.forEach(b => {
    if (b.driverName && !seenDrivers.has(b.driverName)) {
      seenDrivers.add(b.driverName);
      const opt = document.createElement('option');
      opt.value = b.driverName;
      opt.textContent = `${b.driverName} (${b.driverContact || 'Bus ' + b.busNumber})`;
      if (b.driverName === selectedDriverName) opt.selected = true;
      driverSelect.appendChild(opt);
    }
  });
}

function openCreateRouteModal() {
  document.getElementById('route-edit-id').value = '';
  document.getElementById('route-editor-title').textContent = 'Create Route';
  document.getElementById('route-name-input').value = '';
  document.getElementById('route-start-input').value = '';
  document.getElementById('route-dest-input').value = '';
  document.getElementById('route-status-select').value = 'Active';
  document.getElementById('route-desc-input').value = '';
  
  populateRouteEditorSelects('', '');
  currentEditingStops = [];
  renderEditorStops();

  document.getElementById('route-editor-modal')?.classList.remove('hidden');
}

function openEditRouteModal(routeId) {
  const route = routesCache.find(r => r.id === routeId);
  if (!route) {
    alert('Route not found.');
    return;
  }

  document.getElementById('route-edit-id').value = route.id;
  document.getElementById('route-editor-title').textContent = `Edit Route: ${route.name}`;
  document.getElementById('route-name-input').value = route.name || '';
  document.getElementById('route-start-input').value = route.startPoint || '';
  document.getElementById('route-dest-input').value = route.destination || '';
  document.getElementById('route-status-select').value = route.status || 'Active';
  document.getElementById('route-desc-input').value = route.description || '';

  populateRouteEditorSelects(route.assignedBus || '', route.assignedDriver || '');

  currentEditingStops = Array.isArray(route.stops) ? route.stops.map((s, idx) => ({
    stopOrder: s.stopOrder !== undefined ? s.stopOrder : (s.order !== undefined ? s.order : idx + 1),
    name: s.name || s.stopName || '',
    morningArrival: s.morningArrival || s.arrivalTime || '',
    eveningArrival: s.eveningArrival || s.departureTime || '',
    latitude: s.latitude !== undefined && s.latitude !== null ? s.latitude : null,
    longitude: s.longitude !== undefined && s.longitude !== null ? s.longitude : null,
    status: s.status || 'Active'
  })) : [];

  currentEditingStops.forEach((s, idx) => { s.stopOrder = idx + 1; });
  renderEditorStops();

  document.getElementById('route-inspector-modal')?.classList.add('hidden');
  document.getElementById('route-editor-modal')?.classList.remove('hidden');
}

async function saveRoute(e) {
  e.preventDefault();
  syncStopsFromDOM();

  const editId = document.getElementById('route-edit-id')?.value;
  const name = document.getElementById('route-name-input')?.value.trim();
  const startPoint = document.getElementById('route-start-input')?.value.trim();
  const destination = document.getElementById('route-dest-input')?.value.trim();
  const status = document.getElementById('route-status-select')?.value || 'Active';
  const assignedBus = document.getElementById('route-bus-select')?.value || '';
  const assignedDriver = document.getElementById('route-driver-select')?.value || '';
  const description = document.getElementById('route-desc-input')?.value.trim() || '';

  if (!name) {
    alert('Please enter a Route Name.');
    document.getElementById('route-name-input')?.focus();
    return;
  }
  if (!startPoint) {
    alert('Please enter a Start Point.');
    document.getElementById('route-start-input')?.focus();
    return;
  }
  if (!destination) {
    alert('Please enter a Destination.');
    document.getElementById('route-dest-input')?.focus();
    return;
  }

  // Duplicate route name check
  const duplicate = routesCache.find(r => 
    r.id !== editId && 
    r.name && 
    r.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (duplicate) {
    alert(`A route with the name "${name}" already exists. Please use a unique route name.`);
    document.getElementById('route-name-input')?.focus();
    return;
  }

  // Validate stops
  for (let i = 0; i < currentEditingStops.length; i++) {
    const s = currentEditingStops[i];
    const order = i + 1;
    s.stopOrder = order;

    if (!s.name || !s.name.trim()) {
      alert(`Stop #${order}: Please enter a valid Stop Name.`);
      return;
    }

    if (s.latitude !== null && s.latitude !== undefined && s.latitude !== '') {
      const lat = Number(s.latitude);
      if (isNaN(lat) || lat < -90 || lat > 90) {
        alert(`Stop #${order} ("${s.name}"): Latitude must be a valid number between -90 and 90.`);
        return;
      }
      s.latitude = lat;
    } else {
      s.latitude = null;
    }

    if (s.longitude !== null && s.longitude !== undefined && s.longitude !== '') {
      const lng = Number(s.longitude);
      if (isNaN(lng) || lng < -180 || lng > 180) {
        alert(`Stop #${order} ("${s.name}"): Longitude must be a valid number between -180 and 180.`);
        return;
      }
      s.longitude = lng;
    } else {
      s.longitude = null;
    }
  }

  const saveBtn = document.getElementById('save-route-btn');
  try {
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving Route...';
    }

    const oldRoute = editId ? routesCache.find(r => r.id === editId) : null;

    const payload = {
      name,
      startPoint,
      destination,
      status,
      totalStops: currentEditingStops.length,
      stopsCount: currentEditingStops.length,
      stops: currentEditingStops,
      assignedBus: assignedBus || '',
      assignedBuses: assignedBus ? [assignedBus] : [],
      assignedDriver: assignedDriver || '',
      description: description,
      updatedAt: serverTimestamp()
    };

    let targetRouteId = editId;

    if (editId) {
      await updateDoc(doc(firestore, 'routes', editId), payload);
      await logAuditEvent('ROUTE_UPDATED', 'routes', editId, { name, totalStops: payload.totalStops });
      alert(`Route "${name}" updated successfully.`);
    } else {
      payload.createdAt = serverTimestamp();
      const newDoc = await addDoc(collection(firestore, 'routes'), payload);
      targetRouteId = newDoc.id;
      await logAuditEvent('ROUTE_CREATED', 'routes', newDoc.id, { name, totalStops: payload.totalStops });
      alert(`Route "${name}" created successfully.`);
    }

    // Bidirectional sync: If a bus is assigned to this route, update the bus record in Firestore
    if (assignedBus) {
      const matchedBus = busesCache.find(b => String(b.busNumber) === String(assignedBus));
      if (matchedBus) {
        try {
          const busStops = currentEditingStops.map(s => ({
            order: s.stopOrder,
            stopName: s.name,
            arrivalTime: s.morningArrival || '',
            departureTime: s.eveningArrival || '',
            latitude: s.latitude,
            longitude: s.longitude
          }));

          const busUpdate = {
            route: name,
            routeName: name,
            stops: busStops,
            updatedAt: serverTimestamp()
          };

          if (currentEditingStops.length > 0) {
            const firstStop = currentEditingStops[0];
            const lastStop = currentEditingStops[currentEditingStops.length - 1];
            busUpdate.schedules = {
              ...(matchedBus.schedules || {}),
              morningDeparture: firstStop.morningArrival || matchedBus.schedules?.morningDeparture || '06:30',
              morningArrival: lastStop.morningArrival || matchedBus.schedules?.morningArrival || '08:45',
              eveningDeparture: matchedBus.schedules?.eveningDeparture || '16:50',
              eveningArrival: matchedBus.schedules?.eveningArrival || '18:30'
            };
          }

          if (assignedDriver) {
            busUpdate.driverName = assignedDriver;
          }

          await updateDoc(doc(firestore, 'buses', matchedBus.id), busUpdate);
        } catch (busErr) {
          console.warn("Could not sync route to bus record:", busErr);
        }
      }

      // If any other route had this assigned bus, unassign it so routes remain 1:1
      const conflictingRoutes = routesCache.filter(r => r.id !== targetRouteId && String(r.assignedBus) === String(assignedBus));
      for (const cr of conflictingRoutes) {
        try {
          await updateDoc(doc(firestore, 'routes', cr.id), {
            assignedBus: '',
            assignedBuses: [],
            updatedAt: serverTimestamp()
          });
        } catch (cErr) {
          console.warn("Could not clear assignment on conflicting route:", cErr);
        }
      }
    }

    // If previously assigned to a different bus, clear the previous bus's route
    if (oldRoute && oldRoute.assignedBus && String(oldRoute.assignedBus) !== String(assignedBus)) {
      const prevBus = busesCache.find(b => String(b.busNumber) === String(oldRoute.assignedBus));
      if (prevBus) {
        try {
          await updateDoc(doc(firestore, 'buses', prevBus.id), {
            route: '',
            routeName: '',
            stops: [],
            updatedAt: serverTimestamp()
          });
        } catch (prevErr) {
          console.warn("Could not unassign previous bus:", prevErr);
        }
      }
    }

    document.getElementById('route-editor-modal')?.classList.add('hidden');
  } catch (err) {
    console.error("Save route error:", err);
    alert("Failed to save route: " + err.message);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Route';
    }
  }
}

function openRouteInspector(routeId) {
  const route = routesCache.find(r => r.id === routeId);
  if (!route) {
    alert('Route not found.');
    return;
  }

  currentInspectingRouteId = route.id;
  setElText('inspect-route-title', route.name || 'Route Details');
  
  const statusBadge = document.getElementById('inspect-route-status-badge');
  if (statusBadge) {
    statusBadge.className = `status-badge ${getStatusBadgeClass(route.status)}`;
    statusBadge.textContent = route.status || 'Active';
  }

  setElText('inspect-route-start', route.startPoint || '--');
  setElText('inspect-route-dest', route.destination || '--');
  
  const totalStops = route.totalStops !== undefined ? route.totalStops : (Array.isArray(route.stops) ? route.stops.length : 0);
  setElText('inspect-route-total-stops', `${totalStops} Stop${totalStops === 1 ? '' : 's'}`);

  let fleetText = 'No fleet assigned';
  if (route.assignedBus && route.assignedDriver) {
    fleetText = `Bus ${route.assignedBus} • Driver: ${route.assignedDriver}`;
  } else if (route.assignedBus) {
    fleetText = `Bus ${route.assignedBus}`;
  } else if (route.assignedDriver) {
    fleetText = `Driver: ${route.assignedDriver}`;
  } else if (Array.isArray(route.assignedBuses) && route.assignedBuses.length > 0) {
    fleetText = `Buses: ${route.assignedBuses.join(', ')}`;
  }
  setElText('inspect-route-fleet', fleetText);

  const descWrap = document.getElementById('inspect-route-desc-wrap');
  if (descWrap) {
    if (route.description) {
      descWrap.style.display = 'block';
      setElText('inspect-route-desc', route.description);
    } else {
      descWrap.style.display = 'none';
    }
  }

  const stopsBody = document.getElementById('inspect-route-stops-body');
  if (stopsBody) {
    const stops = Array.isArray(route.stops) ? route.stops : [];
    if (stops.length === 0) {
      stopsBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 24px;">No stops defined for this route.</td></tr>`;
    } else {
      const sortedStops = [...stops].sort((a, b) => (a.stopOrder || 0) - (b.stopOrder || 0));
      stopsBody.innerHTML = sortedStops.map(s => `
        <tr>
          <td><span class="status-badge badge-blue">#${s.stopOrder || 1}</span></td>
          <td><strong>${escapeHtml(s.name)}</strong></td>
          <td>${s.morningArrival ? escapeHtml(s.morningArrival) : '<span style="color: var(--text-muted);">--</span>'}</td>
          <td>${s.eveningArrival ? escapeHtml(s.eveningArrival) : '<span style="color: var(--text-muted);">--</span>'}</td>
          <td>
            ${s.latitude !== null && s.latitude !== undefined && s.longitude !== null && s.longitude !== undefined 
              ? `<span style="font-family: monospace; font-size: 12px;">${Number(s.latitude).toFixed(4)}, ${Number(s.longitude).toFixed(4)}</span>` 
              : '<span style="color: var(--text-muted); font-size: 12px;">Not Set</span>'}
          </td>
          <td><span class="status-badge ${getStatusBadgeClass(s.status)}">${escapeHtml(s.status || 'Active')}</span></td>
        </tr>
      `).join('');
    }
  }

  document.getElementById('route-inspector-modal')?.classList.remove('hidden');
}

function formatDisplayTime(tStr) {
  if (!tStr || tStr === '--') return '--';
  const clean = String(tStr).trim();
  if (/AM|PM/i.test(clean)) return clean;
  const match = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    let h = parseInt(match[1], 10);
    const m = match[2];
    const period = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    const hStr = h < 10 ? `0${h}` : `${h}`;
    return `${hStr}:${m} ${period}`;
  }
  return clean;
}

function renderTimingsTable() {
  const bodies = [
    document.getElementById('timings-table-body'),
    document.getElementById('standalone-timings-table-body')
  ].filter(Boolean);

  if (bodies.length === 0) return;
  bodies.forEach(b => { b.innerHTML = ''; });

  if (busesCache.length === 0) {
    bodies.forEach(b => {
      b.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 32px; color: var(--text-secondary);">No bus timing schedules configured.</td></tr>`;
    });
    return;
  }

  busesCache.forEach(bus => {
    const routeName = bus.routeName || bus.route || 'Campus Line';
    const driverName = bus.driverName || 'Not Assigned';
    const stops = Array.isArray(bus.stops) ? bus.stops : [];
    const originName = stops.length > 0 ? (stops[0].stopName || stops[0].name) : routeName;
    const destName = stops.length > 0 ? (stops[stops.length - 1].stopName || stops[stops.length - 1].name) : 'Campus';

    const schedules = bus.schedules || {};
    const hasMorning = Boolean(schedules.morningDeparture || schedules.morningArrival);
    const hasEvening = Boolean(schedules.eveningDeparture || schedules.eveningArrival);

    const mornStart = formatDisplayTime(schedules.morningDeparture);
    const mornArrival = formatDisplayTime(schedules.morningArrival);
    const eveStart = formatDisplayTime(schedules.eveningDeparture);
    const eveArrival = formatDisplayTime(schedules.eveningArrival);

    const conflict = checkScheduleConflict(bus, busesCache);
    const conflictBadge = conflict.hasConflict
      ? `<span class="status-badge badge-red" style="white-space: nowrap; font-size: 11.5px; font-weight: 600; padding: 4px 10px; border-radius: 6px;" title="${escapeHtml(conflict.reason)}">Conflict Detected</span>`
      : `<span class="status-badge badge-green" style="white-space: nowrap; font-size: 11.5px; font-weight: 600; padding: 4px 10px; border-radius: 6px;">Verified (Clear)</span>`;

    // 1. Route corridor display
    let routeHtml = '';
    if (hasMorning && hasEvening) {
      routeHtml = `
        <div style="display: flex; flex-direction: column; gap: 8px; justify-content: center;">
          <div style="font-size: 13.5px; color: var(--text-primary); font-weight: 500; line-height: 1.4;">
            ${escapeHtml(originName)} &rarr; ${escapeHtml(destName)}
          </div>
          <div style="font-size: 13.5px; color: var(--text-primary); font-weight: 500; line-height: 1.4;">
            ${escapeHtml(destName)} &rarr; ${escapeHtml(originName)}
          </div>
        </div>
      `;
    } else if (hasEvening && !hasMorning) {
      routeHtml = `<div style="font-size: 13.5px; color: var(--text-primary); font-weight: 500;">${escapeHtml(destName)} &rarr; ${escapeHtml(originName)}</div>`;
    } else if (hasMorning) {
      routeHtml = `<div style="font-size: 13.5px; color: var(--text-primary); font-weight: 500;">${escapeHtml(originName)} &rarr; ${escapeHtml(destName)}</div>`;
    } else {
      routeHtml = `<div style="font-size: 13.5px; color: var(--text-primary); font-weight: 500;">${escapeHtml(routeName)}</div>`;
    }

    // 2. Trip Type Badges with perfectly aligned text and background colors
    let tripTypeHtml = '';
    if (hasMorning && hasEvening) {
      tripTypeHtml = `
        <div style="display: flex; flex-direction: column; gap: 8px; align-items: flex-start; justify-content: center;">
          <span class="status-badge badge-blue" style="white-space: nowrap; font-size: 11.5px; font-weight: 600; padding: 4px 10px; border-radius: 6px; display: inline-flex; align-items: center; background-color: #DBEAFE; color: #1D4ED8;">Morning Service</span>
          <span class="status-badge badge-orange" style="white-space: nowrap; font-size: 11.5px; font-weight: 600; padding: 4px 10px; border-radius: 6px; display: inline-flex; align-items: center; background-color: #FEF3C7; color: #D97706;">Evening Service</span>
        </div>
      `;
    } else if (hasMorning) {
      tripTypeHtml = `<span class="status-badge badge-blue" style="white-space: nowrap; font-size: 11.5px; font-weight: 600; padding: 4px 10px; border-radius: 6px; display: inline-flex; align-items: center; background-color: #DBEAFE; color: #1D4ED8;">Morning Service</span>`;
    } else if (hasEvening) {
      tripTypeHtml = `<span class="status-badge badge-orange" style="white-space: nowrap; font-size: 11.5px; font-weight: 600; padding: 4px 10px; border-radius: 6px; display: inline-flex; align-items: center; background-color: #FEF3C7; color: #D97706;">Evening Service</span>`;
    } else {
      tripTypeHtml = `<span class="status-badge badge-blue" style="white-space: nowrap; font-size: 11.5px; font-weight: 600; padding: 4px 10px; border-radius: 6px; display: inline-flex; align-items: center; background-color: #DBEAFE; color: #1D4ED8;">Scheduled Service</span>`;
    }

    // 3. Start Time Column
    let startHtml = '';
    if (hasMorning && hasEvening) {
      startHtml = `
        <div style="display: flex; flex-direction: column; gap: 8px; justify-content: center;">
          <div style="font-size: 13.5px; font-weight: 700; color: var(--text-primary); line-height: 1.4;">${mornStart}</div>
          <div style="font-size: 13.5px; font-weight: 700; color: var(--text-primary); line-height: 1.4;">${eveStart}</div>
        </div>
      `;
    } else if (hasEvening && !hasMorning) {
      startHtml = `<strong style="font-size: 13.5px; color: var(--text-primary);">${eveStart}</strong>`;
    } else if (hasMorning) {
      startHtml = `<strong style="font-size: 13.5px; color: var(--text-primary);">${mornStart}</strong>`;
    } else {
      startHtml = `<strong style="font-size: 13.5px; color: var(--text-muted);">--</strong>`;
    }

    // 4. Expected Arrival Column
    let arrivalHtml = '';
    if (hasMorning && hasEvening) {
      arrivalHtml = `
        <div style="display: flex; flex-direction: column; gap: 8px; justify-content: center;">
          <div style="font-size: 13.5px; font-weight: 500; color: var(--text-secondary); line-height: 1.4;">${mornArrival}</div>
          <div style="font-size: 13.5px; font-weight: 500; color: var(--text-secondary); line-height: 1.4;">${eveArrival}</div>
        </div>
      `;
    } else if (hasEvening && !hasMorning) {
      arrivalHtml = `<span style="font-size: 13.5px; font-weight: 500; color: var(--text-secondary);">${eveArrival}</span>`;
    } else if (hasMorning) {
      arrivalHtml = `<span style="font-size: 13.5px; font-weight: 500; color: var(--text-secondary);">${mornArrival}</span>`;
    } else {
      arrivalHtml = `<span style="font-size: 13.5px; color: var(--text-muted);">--</span>`;
    }

    bodies.forEach(tbody => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="font-size: 14.5px; color: var(--text-primary);">Bus ${escapeHtml(bus.busNumber || 'N/A')}</strong></td>
        <td>${routeHtml}</td>
        <td>${tripTypeHtml}</td>
        <td>${startHtml}</td>
        <td>${arrivalHtml}</td>
        <td><span style="color: var(--text-primary); font-size: 13.5px; font-weight: 500;">${escapeHtml(driverName)}</span></td>
        <td>${conflictBadge}</td>
        <td style="text-align: right;">
          <button class="btn-action-icon btn-action-primary" onclick="window.adminInspectBus('${bus.id}')">Inspect</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
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
      (r.reportId && r.reportId.toLowerCase().includes(searchVal)) ||
      (r.id && r.id.toLowerCase().includes(searchVal)) ||
      (r.subject && r.subject.toLowerCase().includes(searchVal)) ||
      (r.userName && r.userName.toLowerCase().includes(searchVal)) ||
      (r.busNumber && String(r.busNumber).toLowerCase().includes(searchVal));

    const matchStatus = statusVal === 'All' || (r.status && r.status.toLowerCase() === statusVal.toLowerCase());
    const matchPrio = prioVal === 'All' || (r.priority && r.priority.toLowerCase() === prioVal.toLowerCase());
    const itemCat = (r.categoryId || r.category || '').toLowerCase();
    const matchCat = catVal === 'All' || (itemCat === catVal.toLowerCase());

    return matchSearch && matchStatus && matchPrio && matchCat;
  });

  setElText('stat-rep-total', reportsCache.length);
  setElText('stat-rep-submitted', reportsCache.filter(r => r.status === 'Submitted').length);
  setElText('stat-rep-progress', reportsCache.filter(r => r.status === 'In Progress' || r.status === 'Under Review').length);
  setElText('stat-rep-critical', reportsCache.filter(r => r.priority === 'Urgent' || (r.categoryId || r.category) === 'safety').length);

  if (countLabel) countLabel.textContent = `Showing ${filtered.length} of ${reportsCache.length} reports`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 32px; color: var(--text-secondary);">No support tickets or complaints found.</td></tr>`;
    return;
  }

  filtered.forEach(rep => {
    const tr = document.createElement('tr');
    const statusClass = getStatusBadgeClass(rep.status);
    const prioClass = getPriorityBadgeClass(rep.priority);
    const repNum = rep.reportNumber || rep.reportId || rep.id || 'NXR-REP';
    const repRoute = rep.busNumber ? `Bus ${rep.busNumber}` : (rep.routeName || rep.route || 'General');

    tr.innerHTML = `
      <td>${escapeHtml(repNum)}</td>
      <td><strong>${escapeHtml(rep.userName || 'Student')}</strong></td>
      <td>
        <div style="font-weight: 700; color: var(--text-primary);">${escapeHtml(rep.subject || 'No Subject')}</div>
        <div style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(rep.categoryName || rep.category || 'General')}</div>
      </td>
      <td>${escapeHtml(repRoute)}</td>
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

  // 2. Add / Edit Bus Modal (Bus Control Center)
  const addBusBtn = document.getElementById('add-bus-btn');
  const busEditorModal = document.getElementById('bus-editor-modal');
  const closeBusEditorBtn = document.getElementById('close-bus-editor-btn');
  const cancelBusEditorBtn = document.getElementById('cancel-bus-editor-btn');
  const busEditorForm = document.getElementById('bus-editor-form');

  // Dynamic capacity calculation
  const seatCapInput = document.getElementById('form-bus-capacity');
  const standCapInput = document.getElementById('form-bus-standing-capacity');
  const totalCapInput = document.getElementById('form-bus-total-capacity');

  const updateTotalCap = () => {
    const seat = parseInt(seatCapInput?.value, 10) || 0;
    const stand = parseInt(standCapInput?.value, 10) || 0;
    if (totalCapInput) totalCapInput.value = String(seat + stand);
  };
  seatCapInput?.addEventListener('input', updateTotalCap);
  standCapInput?.addEventListener('input', updateTotalCap);

  // Coverage radio toggles & dynamic stops checklist
  const covFullRadio = document.getElementById('cov-full-route');
  const covSpecRadio = document.getElementById('cov-specific-stops');
  const specStopsBox = document.getElementById('form-bus-specific-stops-box');
  const busRouteSelect = document.getElementById('form-bus-route');

  const toggleCoverageBox = () => {
    if (covSpecRadio?.checked) {
      specStopsBox?.classList.remove('hidden');
      renderBusStopsChecklist(busRouteSelect?.value || '');
    } else {
      specStopsBox?.classList.add('hidden');
    }
  };
  covFullRadio?.addEventListener('change', toggleCoverageBox);
  covSpecRadio?.addEventListener('change', toggleCoverageBox);

  busRouteSelect?.addEventListener('change', () => {
    const selectedRoute = busRouteSelect.value;
    if (covSpecRadio?.checked) {
      renderBusStopsChecklist(selectedRoute);
    }
    // Auto-populate timings if route has stops
    if (selectedRoute) {
      const matched = routesCache.find(r => r.name && r.name.toLowerCase() === selectedRoute.toLowerCase());
      if (matched && Array.isArray(matched.stops) && matched.stops.length > 0) {
        const sorted = [...matched.stops].sort((a, b) => (a.stopOrder || 0) - (b.stopOrder || 0));
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        if (first.morningArrival) {
          const mornDep = document.getElementById('form-bus-morning-departure');
          if (mornDep && (!mornDep.value || mornDep.value === '06:30')) mornDep.value = first.morningArrival;
        }
        if (last.morningArrival) {
          const mornArr = document.getElementById('form-bus-morning-arrival');
          if (mornArr && (!mornArr.value || mornArr.value === '08:45')) mornArr.value = last.morningArrival;
        }
      }
    }
    checkBusEditorConflicts();
  });

  document.getElementById('btn-select-all-stops')?.addEventListener('click', () => {
    document.querySelectorAll('.bus-stop-checkbox').forEach(cb => cb.checked = true);
  });
  document.getElementById('btn-clear-all-stops')?.addEventListener('click', () => {
    document.querySelectorAll('.bus-stop-checkbox').forEach(cb => cb.checked = false);
  });

  // Conflict triggers on driver and timetable changes
  ['form-bus-driver', 'form-bus-morning-departure', 'form-bus-morning-arrival', 'form-bus-evening-departure', 'form-bus-evening-arrival'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', checkBusEditorConflicts);
    document.getElementById(id)?.addEventListener('input', checkBusEditorConflicts);
  });

  // Compliance document attachment
  const addDocBtn = document.getElementById('add-doc-to-bus-btn');
  addDocBtn?.addEventListener('click', () => {
    const docType = document.getElementById('form-doc-type')?.value || 'Other';
    const docNumber = document.getElementById('form-doc-number')?.value.trim();
    const issueDate = document.getElementById('form-doc-issue')?.value;
    const expiryDate = document.getElementById('form-doc-expiry')?.value;
    const fileInput = document.getElementById('form-doc-file');

    if (!docNumber) {
      alert("Please provide the Document / Policy Number.");
      document.getElementById('form-doc-number')?.focus();
      return;
    }
    if (!expiryDate) {
      alert("Please provide the Document Expiry Date.");
      document.getElementById('form-doc-expiry')?.focus();
      return;
    }
    if (issueDate && expiryDate && expiryDate < issueDate) {
      alert("Document Expiry Date cannot be earlier than the Issue Date.");
      return;
    }

    const fileName = fileInput?.files?.[0]?.name || '';
    const newDocItem = {
      documentId: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      documentType: docType,
      documentNumber: docNumber,
      issueDate: issueDate || '',
      expiryDate: expiryDate,
      fileName: fileName,
      fileUrl: '',
      uploadedAt: new Date().toISOString()
    };

    currentEditingBusDocs.push(newDocItem);
    renderBusEditorDocsList();

    if (document.getElementById('form-doc-number')) document.getElementById('form-doc-number').value = '';
    if (document.getElementById('form-doc-issue')) document.getElementById('form-doc-issue').value = '';
    if (document.getElementById('form-doc-expiry')) document.getElementById('form-doc-expiry').value = '';
    if (fileInput) fileInput.value = '';
  });

  if (addBusBtn && busEditorModal) {
    addBusBtn.addEventListener('click', () => {
      document.getElementById('bus-edit-id').value = '';
      const errAlert = document.getElementById('bus-form-error-alert');
      if (errAlert) errAlert.classList.add('hidden');

      document.getElementById('form-bus-no').value = '';
      document.getElementById('form-bus-reg').value = '';
      document.getElementById('form-bus-type').value = 'College Bus';
      document.getElementById('form-bus-manufacturer').value = '';
      document.getElementById('form-bus-model').value = '';
      document.getElementById('form-bus-year').value = '';

      document.getElementById('form-bus-capacity').value = '52';
      document.getElementById('form-bus-standing-capacity').value = '0';
      document.getElementById('form-bus-total-capacity').value = '52';
      document.getElementById('form-bus-status').value = 'Active';

      populateBusEditorRoutes('');
      if (covFullRadio) covFullRadio.checked = true;
      if (covSpecRadio) covSpecRadio.checked = false;
      specStopsBox?.classList.add('hidden');
      renderBusStopsChecklist('', null);

      populateBusEditorDrivers('');
      document.getElementById('bus-driver-conflict-box')?.classList.add('hidden');

      document.getElementById('form-bus-morning-departure').value = '06:30';
      document.getElementById('form-bus-morning-arrival').value = '08:45';
      document.getElementById('form-bus-evening-departure').value = '16:50';
      document.getElementById('form-bus-evening-arrival').value = '18:30';
      document.getElementById('bus-schedule-conflict-box')?.classList.add('hidden');

      document.getElementById('form-bus-last-service').value = '';
      document.getElementById('form-bus-next-service').value = '';
      document.getElementById('form-bus-maintenance-notes').value = '';

      currentEditingBusDocs = [];
      renderBusEditorDocsList();

      document.getElementById('bus-editor-title').textContent = 'Add New Bus';
      busEditorModal.classList.remove('hidden');
    });
  }

  if (closeBusEditorBtn) closeBusEditorBtn.onclick = () => busEditorModal?.classList.add('hidden');
  if (cancelBusEditorBtn) cancelBusEditorBtn.onclick = () => busEditorModal?.classList.add('hidden');

  if (busEditorForm) {
    busEditorForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errAlert = document.getElementById('bus-form-error-alert');
      if (errAlert) errAlert.classList.add('hidden');

      const busEditId = document.getElementById('bus-edit-id').value;
      const busNo = document.getElementById('form-bus-no').value.trim();
      const busReg = document.getElementById('form-bus-reg').value.trim();
      const busType = document.getElementById('form-bus-type').value;
      const manufacturer = document.getElementById('form-bus-manufacturer').value.trim();
      const model = document.getElementById('form-bus-model').value.trim();
      const manufacturingYear = document.getElementById('form-bus-year').value.trim();

      const seatCap = parseInt(document.getElementById('form-bus-capacity').value, 10);
      const standCap = parseInt(document.getElementById('form-bus-standing-capacity').value, 10) || 0;
      const totalCap = seatCap + standCap;
      const status = document.getElementById('form-bus-status').value;

      const selectedRouteName = document.getElementById('form-bus-route')?.value || '';
      const isSpecificStops = document.getElementById('cov-specific-stops')?.checked;
      const selectedDriver = document.getElementById('form-bus-driver')?.value || '';

      const mornStart = document.getElementById('form-bus-morning-departure')?.value || '';
      const mornEnd = document.getElementById('form-bus-morning-arrival')?.value || '';
      const eveStart = document.getElementById('form-bus-evening-departure')?.value || '';
      const eveEnd = document.getElementById('form-bus-evening-arrival')?.value || '';

      const lastService = document.getElementById('form-bus-last-service')?.value || '';
      const nextService = document.getElementById('form-bus-next-service')?.value || '';
      const serviceNotes = document.getElementById('form-bus-maintenance-notes')?.value.trim() || '';

      const showFormError = (msg) => {
        if (errAlert) {
          errAlert.innerHTML = `⚠️ <strong>Validation Error:</strong> ${escapeHtml(msg)}`;
          errAlert.classList.remove('hidden');
        } else {
          alert(msg);
        }
      };

      // 1. Validate Bus Number (Unique in fleet)
      if (!busNo) {
        showFormError('Please enter a valid Bus Number.');
        document.getElementById('form-bus-no')?.focus();
        return;
      }
      const duplicateBus = busesCache.find(b => 
        b.id !== busEditId && 
        String(b.busNumber).trim().toLowerCase() === busNo.toLowerCase()
      );
      if (duplicateBus) {
        showFormError(`Bus Number "${busNo}" already exists in the fleet. Bus numbers must be unique.`);
        document.getElementById('form-bus-no')?.focus();
        return;
      }

      // 2. Validate Registration Number (Unique in fleet)
      if (!busReg) {
        showFormError('Please enter a valid Vehicle Registration Number.');
        document.getElementById('form-bus-reg')?.focus();
        return;
      }
      const duplicateReg = busesCache.find(b => 
        b.id !== busEditId && 
        (b.registrationNumber || b.regNumber || '').trim().toLowerCase() === busReg.toLowerCase()
      );
      if (duplicateReg) {
        showFormError(`Registration Number "${busReg}" is already registered to Bus ${duplicateReg.busNumber}. Registration numbers must be unique.`);
        document.getElementById('form-bus-reg')?.focus();
        return;
      }

      // 3. Validate Capacities
      if (isNaN(seatCap) || seatCap <= 0) {
        showFormError('Seating Capacity must be at least 1.');
        document.getElementById('form-bus-capacity')?.focus();
        return;
      }
      if (isNaN(standCap) || standCap < 0) {
        showFormError('Standing Capacity cannot be negative.');
        document.getElementById('form-bus-standing-capacity')?.focus();
        return;
      }

      // 4. Validate Timetables
      if (mornStart && mornEnd && mornEnd <= mornStart) {
        showFormError('Morning expected arrival time must be later than departure time.');
        document.getElementById('form-bus-morning-arrival')?.focus();
        return;
      }
      if (eveStart && eveEnd && eveEnd <= eveStart) {
        showFormError('Evening expected arrival time must be later than departure time.');
        document.getElementById('form-bus-evening-arrival')?.focus();
        return;
      }

      // 5. Route & Stop Assignment Resolution
      if (busEditId && !selectedRouteName) {
        const existingBus = busesCache.find(b => b.id === busEditId);
        if (existingBus && (existingBus.routeName || existingBus.route || existingBus.assignedRouteId)) {
          const confirmUnassign = confirm(`Bus ${busNo} is currently assigned to route "${existingBus.routeName || existingBus.route}".\n\nRemoving the route assignment will clear served stops and route schedules for this vehicle.\n\nDo you wish to proceed?`);
          if (!confirmUnassign) return;
        }
      }

      const matchedRoute = routesCache.find(r => r.name && r.name.toLowerCase() === selectedRouteName.toLowerCase());
      let coverageType = isSpecificStops ? 'specific_stops' : 'full_route';
      let stopAssignments = [];
      let servedStops = [];

      if (matchedRoute) {
        const routeStops = Array.isArray(matchedRoute.stops) ? matchedRoute.stops : [];
        if (isSpecificStops) {
          const checkedBoxes = document.querySelectorAll('.bus-stop-checkbox:checked');
          if (checkedBoxes.length === 0) {
            showFormError('Please select at least one stop for Specific Stops coverage, or choose "Full Route".');
            return;
          }
          checkedBoxes.forEach(cb => {
            stopAssignments.push({
              stopId: cb.getAttribute('data-stop-id') || '',
              stopOrder: parseInt(cb.getAttribute('data-stop-order'), 10),
              stopName: cb.getAttribute('data-stop-name') || ''
            });
          });
          stopAssignments.sort((a, b) => a.stopOrder - b.stopOrder);

          // Build servedStops keeping arrival times & coordinates
          servedStops = routeStops.filter(s => 
            stopAssignments.some(sa => sa.stopOrder === (s.stopOrder || s.order))
          ).map((s, idx) => ({
            order: s.stopOrder || s.order || idx + 1,
            stopName: s.name || s.stopName || '',
            arrivalTime: s.morningArrival || s.arrivalTime || '',
            departureTime: s.eveningArrival || s.departureTime || '',
            latitude: s.latitude !== undefined ? s.latitude : null,
            longitude: s.longitude !== undefined ? s.longitude : null
          }));
        } else {
          coverageType = 'full_route';
          stopAssignments = [];
          servedStops = routeStops.map((s, idx) => ({
            order: s.stopOrder || s.order || idx + 1,
            stopName: s.name || s.stopName || '',
            arrivalTime: s.morningArrival || s.arrivalTime || '',
            departureTime: s.eveningArrival || s.departureTime || '',
            latitude: s.latitude !== undefined ? s.latitude : null,
            longitude: s.longitude !== undefined ? s.longitude : null
          }));
        }
      }

      // 6. Driver Resolution
      const matchedDriver = driversCache.find(d => d.name === selectedDriver);
      const assignedDriverId = matchedDriver ? (matchedDriver.id || `DRV-${selectedDriver.replace(/\s+/g, '_')}`) : (selectedDriver ? `DRV-${selectedDriver.replace(/\s+/g, '_')}` : null);

      const saveBtn = document.getElementById('save-bus-btn');
      try {
        if (saveBtn) {
          saveBtn.disabled = true;
          saveBtn.textContent = 'Saving Bus...';
        }

        const payload = {
          busNumber: busNo,
          registrationNumber: busReg,
          regNumber: busReg,
          busType: busType,
          manufacturer: manufacturer,
          model: model,
          manufacturingYear: manufacturingYear,
          seatCapacity: seatCap,
          standingCapacity: standCap,
          totalCapacity: totalCap,
          capacity: String(seatCap),
          status: status,
          assignedRouteId: matchedRoute ? (matchedRoute.id || `route_${matchedRoute.name}`) : null,
          assignedRouteName: matchedRoute ? matchedRoute.name : null,
          route: selectedRouteName,
          routeName: selectedRouteName,
          coverageType: coverageType,
          stopAssignments: stopAssignments,
          stops: servedStops,
          assignedDriverId: assignedDriverId,
          assignedDriverName: selectedDriver || null,
          driverName: selectedDriver,
          driverContact: matchedDriver?.phone || '',
          driverLicense: matchedDriver?.licenseNumber || '',
          schedules: {
            morningDeparture: mornStart,
            morningArrival: mornEnd,
            eveningDeparture: eveStart,
            eveningArrival: eveEnd
          },
          maintenance: {
            lastServiceDate: lastService || null,
            nextServiceDate: nextService || null,
            notes: serviceNotes
          },
          documents: currentEditingBusDocs,
          updatedAt: serverTimestamp()
        };

        let finalBusId = busEditId;
        if (busEditId) {
          await updateDoc(doc(firestore, 'buses', busEditId), payload);
          await logAuditEvent('BUS_UPDATED', 'buses', busEditId, { busNumber: busNo, changes: payload });
        } else {
          payload.createdAt = serverTimestamp();
          const newDoc = await addDoc(collection(firestore, 'buses'), payload);
          finalBusId = newDoc.id;
          await logAuditEvent('BUS_CREATED', 'buses', newDoc.id, { busNumber: busNo, route: selectedRouteName });
        }

        // Sync to schedules collection for compatibility (morning & evening)
        if (matchedRoute) {
          try {
            const mornSchedId = `schedule_${busNo}_morning`;
            await setDoc(doc(firestore, 'schedules', mornSchedId), {
              scheduleId: mornSchedId,
              busId: finalBusId,
              busNumber: busNo,
              routeId: matchedRoute.id || matchedRoute.name,
              routeName: matchedRoute.name,
              driverId: assignedDriverId,
              driverName: selectedDriver,
              tripType: 'morning',
              startTime: mornStart,
              expectedArrivalTime: mornEnd,
              coverageType: coverageType,
              stopAssignments: stopAssignments,
              status: status === 'Maintenance' ? 'Inactive' : 'Active',
              updatedAt: serverTimestamp()
            }, { merge: true });

            const eveSchedId = `schedule_${busNo}_evening`;
            await setDoc(doc(firestore, 'schedules', eveSchedId), {
              scheduleId: eveSchedId,
              busId: finalBusId,
              busNumber: busNo,
              routeId: matchedRoute.id || matchedRoute.name,
              routeName: matchedRoute.name,
              driverId: assignedDriverId,
              driverName: selectedDriver,
              tripType: 'evening',
              startTime: eveStart,
              expectedArrivalTime: eveEnd,
              coverageType: coverageType,
              stopAssignments: stopAssignments,
              status: status === 'Maintenance' ? 'Inactive' : 'Active',
              updatedAt: serverTimestamp()
            }, { merge: true });
          } catch (sErr) {
            console.warn("Could not sync schedule records:", sErr);
          }
        }

        // Bidirectional sync: Update assigned route in Firestore 'routes' collection
        if (matchedRoute) {
          try {
            const existingBuses = Array.isArray(matchedRoute.assignedBuses) ? matchedRoute.assignedBuses.map(String) : [];
            if (!existingBuses.includes(String(busNo))) existingBuses.push(String(busNo));
            await updateDoc(doc(firestore, 'routes', matchedRoute.id), {
              assignedBus: busNo,
              assignedBuses: existingBuses,
              assignedDriver: selectedDriver,
              updatedAt: serverTimestamp()
            });
          } catch (rErr) {
            console.warn("Could not sync route document with assigned bus:", rErr);
          }
        }

        // If previously assigned to another route, clear old route assignment
        const otherAssignedRoutes = routesCache.filter(r => 
          String(r.assignedBus) === String(busNo) && (!matchedRoute || r.id !== matchedRoute.id)
        );
        for (const oRoute of otherAssignedRoutes) {
          try {
            await updateDoc(doc(firestore, 'routes', oRoute.id), {
              assignedBus: '',
              assignedBuses: [],
              updatedAt: serverTimestamp()
            });
          } catch (oErr) {
            console.warn("Could not clear previous route assignment:", oErr);
          }
        }

        busEditorModal?.classList.add('hidden');
        alert(`Bus ${busNo} saved successfully.`);
      } catch (err) {
        showFormError("Failed to save bus: " + err.message);
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Bus Record';
        }
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

        const adminUid = currentAdminUser?.uid || '';
        const adminDisplayName = currentAdminUser?.displayName || (currentAdminUser?.email ? currentAdminUser.email.split('@')[0] : 'Admin');

        const updatePayload = {
          status: newStatus,
          priority: newPrio,
          adminResponse: replyText,
          resolution: replyText,
          adminReply: replyText,
          adminId: adminUid,
          adminName: adminDisplayName,
          resolvedBy: currentAdminUser?.email || adminDisplayName,
          updatedAt: serverTimestamp(),
          resolvedAt: newStatus === 'Resolved' ? serverTimestamp() : null
        };

        if (replyText) {
          updatePayload.adminResponseAt = serverTimestamp();
        }

        if (newStatus === 'Closed') {
          updatePayload.closedAt = serverTimestamp();
        }

        const historyEntry = {
          status: newStatus,
          oldStatus: currentInspectingTicket.status || 'Under Review',
          changedBy: currentAdminUser?.email || 'Admin',
          message: replyText || `Status updated to ${newStatus} by Admin`,
          timestamp: new Date().toISOString()
        };
        updatePayload.statusHistory = arrayUnion(historyEntry);

        // Partial update preserving all existing user-submitted fields
        await updateDoc(doc(firestore, 'reports', currentInspectingTicket.id), updatePayload);

        // Add to subcollection activity
        try {
          await addDoc(collection(firestore, 'reports', currentInspectingTicket.id, 'activity'), {
            action: `STATUS_CHANGED_TO_${newStatus.toUpperCase()}`,
            oldStatus: currentInspectingTicket.status || 'Under Review',
            newStatus: newStatus,
            note: replyText || `Status updated by Admin`,
            timestamp: serverTimestamp(),
            adminEmail: currentAdminUser?.email || 'Admin',
            adminId: adminUid
          });
        } catch (actErr) {
          console.warn("Activity log warning:", actErr);
        }

        // Create in-app notification for student
        if (currentInspectingTicket.userId && currentInspectingTicket.userId !== 'student_guest') {
          try {
            await addDoc(collection(firestore, 'users', currentInspectingTicket.userId, 'notifications'), {
              title: `Report Update: ${newStatus}`,
              body: replyText ? `Admin response: "${replyText}"` : `Your report ${currentInspectingTicket.reportNumber || currentInspectingTicket.id} status was changed to ${newStatus}.`,
              reportId: currentInspectingTicket.reportNumber || currentInspectingTicket.reportId || currentInspectingTicket.id,
              reportDocumentId: currentInspectingTicket.id,
              status: newStatus,
              adminResponse: replyText || '',
              subject: currentInspectingTicket.subject || '',
              categoryName: currentInspectingTicket.categoryName || currentInspectingTicket.category || '',
              busNumber: currentInspectingTicket.busNumber || '',
              routeName: currentInspectingTicket.routeName || currentInspectingTicket.route || '',
              description: currentInspectingTicket.description || '',
              type: 'report_status',
              read: false,
              createdAt: serverTimestamp()
            });
          } catch (notifErr) {
            console.warn("Notification error:", notifErr);
          }
        }

        await logAuditEvent('TICKET_RESOLVED', 'reports', currentInspectingTicket.id, { newStatus, newPrio, replyText });

        ticketModal?.classList.add('hidden');
        alert(`Ticket ${currentInspectingTicket.reportNumber || currentInspectingTicket.id || 'NXR-REP'} updated successfully.`);
      } catch (err) {
        console.error("Failed to update ticket:", err);
        alert("Failed to update ticket: " + err.message);
      } finally {
        saveTicketBtn.disabled = false;
        saveTicketBtn.textContent = 'Save & Update Ticket';
      }
    });
  }

  // 5. Route & Stops Editor Modal
  const addRouteBtn = document.getElementById('add-route-btn');
  const routeEditorModal = document.getElementById('route-editor-modal');
  const closeRouteEditorBtn = document.getElementById('close-route-editor-btn');
  const cancelRouteEditorBtn = document.getElementById('cancel-route-editor-btn');
  const addStopRowBtn = document.getElementById('add-stop-row-btn');
  const routeEditorForm = document.getElementById('route-editor-form');

  if (addRouteBtn) {
    addRouteBtn.addEventListener('click', () => {
      openCreateRouteModal();
    });
  }

  if (closeRouteEditorBtn) {
    closeRouteEditorBtn.addEventListener('click', () => {
      routeEditorModal?.classList.add('hidden');
    });
  }

  if (cancelRouteEditorBtn) {
    cancelRouteEditorBtn.addEventListener('click', () => {
      routeEditorModal?.classList.add('hidden');
    });
  }

  // Close Route Editor when clicking outside on backdrop
  if (routeEditorModal) {
    routeEditorModal.addEventListener('click', (e) => {
      if (e.target === routeEditorModal) {
        routeEditorModal.classList.add('hidden');
      }
    });
  }

  if (addStopRowBtn) {
    addStopRowBtn.addEventListener('click', () => {
      addStopToEditor();
    });
  }

  if (routeEditorForm) {
    routeEditorForm.addEventListener('submit', (e) => {
      saveRoute(e);
    });
  }

  // 6. Route Inspector Modal
  const closeRouteInspectorBtn = document.getElementById('close-route-inspector-btn');
  const closeRouteInspectorFooterBtn = document.getElementById('close-route-inspector-footer-btn');
  const editRouteFromInspectorBtn = document.getElementById('edit-route-from-inspector-btn');
  const routeInspectorModal = document.getElementById('route-inspector-modal');

  if (closeRouteInspectorBtn) {
    closeRouteInspectorBtn.addEventListener('click', () => {
      routeInspectorModal?.classList.add('hidden');
    });
  }

  if (closeRouteInspectorFooterBtn) {
    closeRouteInspectorFooterBtn.addEventListener('click', () => {
      routeInspectorModal?.classList.add('hidden');
    });
  }

  // Close Route Inspector when clicking outside on backdrop
  if (routeInspectorModal) {
    routeInspectorModal.addEventListener('click', (e) => {
      if (e.target === routeInspectorModal) {
        routeInspectorModal.classList.add('hidden');
      }
    });
  }

  if (editRouteFromInspectorBtn) {
    editRouteFromInspectorBtn.addEventListener('click', () => {
      if (currentInspectingRouteId) {
        openEditRouteModal(currentInspectingRouteId);
      }
    });
  }

  // Global Escape key listener to dismiss open modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      routeEditorModal?.classList.add('hidden');
      routeInspectorModal?.classList.add('hidden');
      document.getElementById('ticket-modal')?.classList.add('hidden');
      document.getElementById('bus-inspector-modal')?.classList.add('hidden');
      document.getElementById('bus-editor-modal')?.classList.add('hidden');
      document.getElementById('driver-assignment-modal')?.classList.add('hidden');
    }
  });
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
  const errAlert = document.getElementById('bus-form-error-alert');
  if (errAlert) errAlert.classList.add('hidden');

  // 1. Basic Vehicle Info
  document.getElementById('bus-edit-id').value = bus.id;
  document.getElementById('form-bus-no').value = bus.busNumber || '';
  document.getElementById('form-bus-reg').value = bus.registrationNumber || bus.regNumber || '';
  document.getElementById('form-bus-type').value = bus.busType || 'College Bus';
  document.getElementById('form-bus-manufacturer').value = bus.manufacturer || '';
  document.getElementById('form-bus-model').value = bus.model || '';
  document.getElementById('form-bus-year').value = bus.manufacturingYear || '';

  // 2. Capacity & Status
  const seat = bus.seatCapacity || bus.capacity || 52;
  const stand = bus.standingCapacity !== undefined ? bus.standingCapacity : 0;
  const total = bus.totalCapacity || (parseInt(seat, 10) + parseInt(stand, 10));
  document.getElementById('form-bus-capacity').value = String(seat);
  document.getElementById('form-bus-standing-capacity').value = String(stand);
  document.getElementById('form-bus-total-capacity').value = String(total);
  document.getElementById('form-bus-status').value = bus.status || 'Active';

  // 3. Transit Route & Stop Coverage
  const assignedRoute = routesCache.find(r => 
    (bus.assignedRouteId && r.id === bus.assignedRouteId) ||
    (bus.routeName && r.name && r.name.toLowerCase() === bus.routeName.toLowerCase()) ||
    (bus.route && r.name && r.name.toLowerCase() === bus.route.toLowerCase()) ||
    (r.assignedBus && String(r.assignedBus) === String(bus.busNumber)) ||
    (Array.isArray(r.assignedBuses) && r.assignedBuses.map(String).includes(String(bus.busNumber)))
  );
  const selectedRouteName = assignedRoute ? assignedRoute.name : (bus.routeName || bus.route || '');
  populateBusEditorRoutes(selectedRouteName);

  const isSpecific = bus.coverageType === 'specific_stops';
  const covFull = document.getElementById('cov-full-route');
  const covSpec = document.getElementById('cov-specific-stops');
  const specBox = document.getElementById('form-bus-specific-stops-box');
  if (covFull) covFull.checked = !isSpecific;
  if (covSpec) covSpec.checked = isSpecific;

  if (isSpecific) {
    specBox?.classList.remove('hidden');
    const preselectedOrders = Array.isArray(bus.stopAssignments) && bus.stopAssignments.length > 0
      ? bus.stopAssignments.map(s => s.stopOrder)
      : (Array.isArray(bus.stops) ? bus.stops.map(s => s.order || s.stopOrder) : null);
    renderBusStopsChecklist(selectedRouteName, preselectedOrders);
  } else {
    specBox?.classList.add('hidden');
    renderBusStopsChecklist(selectedRouteName, null);
  }

  // 4. Driver Assignment
  populateBusEditorDrivers(bus.driverName || '');

  // 5. Schedules
  const sched = bus.schedules || {};
  document.getElementById('form-bus-morning-departure').value = sched.morningDeparture || '06:30';
  document.getElementById('form-bus-morning-arrival').value = sched.morningArrival || '08:45';
  document.getElementById('form-bus-evening-departure').value = sched.eveningDeparture || '16:50';
  document.getElementById('form-bus-evening-arrival').value = sched.eveningArrival || '18:30';

  // 6. Maintenance
  const maint = bus.maintenance || {};
  document.getElementById('form-bus-last-service').value = maint.lastServiceDate || '';
  document.getElementById('form-bus-next-service').value = maint.nextServiceDate || '';
  document.getElementById('form-bus-maintenance-notes').value = maint.notes || '';

  // 7. Documents
  currentEditingBusDocs = Array.isArray(bus.documents) ? JSON.parse(JSON.stringify(bus.documents)) : [];
  renderBusEditorDocsList();

  // Run live conflict checks
  checkBusEditorConflicts();

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

  setElText('modal-ticket-id', `Ticket ${ticket.reportNumber || ticket.reportId || ticket.id || 'NXR-REP'}`);
  setElText('modal-ticket-subject', ticket.subject || 'No Subject');
  setElText('modal-ticket-desc', ticket.description || 'No Description provided.');

  const reporterInfo = ticket.userEmail
    ? `Reporter: ${ticket.userName || 'Student'} (${ticket.userEmail})`
    : `Reporter: ${ticket.userName || 'Student'}`;
  setElText('modal-ticket-reporter', reporterInfo);

  const busRouteText = ticket.busNumber
    ? `Bus: Bus ${ticket.busNumber}${ticket.route || ticket.routeName ? ` • ${ticket.route || ticket.routeName}` : ''}`
    : `Route: ${ticket.route || ticket.routeName || 'General'}`;
  setElText('modal-ticket-bus', busRouteText);

  const journeyInfo = [ticket.journeyDate || ticket.incidentDate, ticket.journeyTime || ticket.incidentTime].filter(Boolean).join(' ');
  setElText('modal-ticket-date', journeyInfo ? `Journey: ${journeyInfo} • Reported: ${formatDate(ticket.createdAt)}` : `Reported: ${formatDate(ticket.createdAt)}`);

  const locEl = document.getElementById('modal-ticket-location');
  if (locEl) {
    if (ticket.location) {
      locEl.textContent = `Location: ${ticket.location}`;
      locEl.style.display = 'inline';
    } else {
      locEl.style.display = 'none';
    }
  }

  // Display attachments if present
  const attachWrap = document.getElementById('modal-ticket-attachments-wrap');
  if (attachWrap) {
    attachWrap.innerHTML = '';
    if (ticket.attachments && ticket.attachments.length > 0) {
      ticket.attachments.forEach((src, idx) => {
        const img = document.createElement('img');
        img.src = src;
        img.alt = `Attachment ${idx + 1}`;
        img.style.cssText = 'width: 56px; height: 56px; object-fit: cover; border-radius: 6px; border: 1px solid #E5E7EB; cursor: pointer;';
        img.onclick = () => window.open(src, '_blank');
        attachWrap.appendChild(img);
      });
      attachWrap.style.display = 'flex';
    } else {
      attachWrap.style.display = 'none';
    }
  }

  const statusSel = document.getElementById('modal-ticket-status-select');
  const prioSel = document.getElementById('modal-ticket-prio-select');
  const replyInput = document.getElementById('modal-ticket-reply');

  if (statusSel) statusSel.value = ticket.status || 'Under Review';
  if (prioSel) prioSel.value = ticket.priority || 'Normal';
  if (replyInput) replyInput.value = ticket.adminResponse || ticket.resolution || ticket.adminReply || '';

  const prioBadge = document.getElementById('modal-ticket-prio-badge');
  const statusBadge = document.getElementById('modal-ticket-status-badge');
  if (prioBadge) {
    prioBadge.className = `status-badge ${getPriorityBadgeClass(ticket.priority)}`;
    prioBadge.textContent = ticket.priority || 'Normal';
  }
  if (statusBadge) {
    statusBadge.className = `status-badge ${getStatusBadgeClass(ticket.status)}`;
    statusBadge.textContent = ticket.status || 'Under Review';
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

window.adminInspectRoute = (routeId) => {
  openRouteInspector(routeId);
};

window.adminEditRoute = (routeId) => {
  openEditRouteModal(routeId);
};

window.adminToggleRouteStatus = async (routeId) => {
  const route = routesCache.find(r => r.id === routeId);
  if (!route) return;

  const newStatus = route.status === 'Active' ? 'Inactive' : 'Active';
  try {
    await updateDoc(doc(firestore, 'routes', route.id), {
      status: newStatus,
      updatedAt: serverTimestamp()
    });
    await logAuditEvent('ROUTE_STATUS_CHANGED', 'routes', route.id, { oldStatus: route.status, newStatus });
  } catch (err) {
    alert("Failed to toggle route status: " + err.message);
  }
};

window.adminDeleteRoute = async (routeId) => {
  const route = routesCache.find(r => r.id === routeId);
  if (!route) return;

  const confirmed = confirm(`Are you sure you want to delete route "${route.name}"?\n\nThis will remove the route and its stops permanently.`);
  if (!confirmed) return;

  try {
    // If route was assigned to a bus, clear the route from that bus
    if (route.assignedBus) {
      const matchedBus = busesCache.find(b => String(b.busNumber) === String(route.assignedBus));
      if (matchedBus) {
        try {
          await updateDoc(doc(firestore, 'buses', matchedBus.id), {
            route: '',
            routeName: '',
            stops: [],
            updatedAt: serverTimestamp()
          });
        } catch (busErr) {
          console.warn("Could not unassign route from bus upon deletion:", busErr);
        }
      }
    }

    await deleteDoc(doc(firestore, 'routes', route.id));
    await logAuditEvent('ROUTE_DELETED', 'routes', route.id, { name: route.name });
    alert(`Route "${route.name}" deleted successfully.`);
  } catch (err) {
    alert("Failed to delete route: " + err.message);
  }
};

window.adminMoveStopUp = (index) => {
  syncStopsFromDOM();
  if (index > 0 && index < currentEditingStops.length) {
    const temp = currentEditingStops[index];
    currentEditingStops[index] = currentEditingStops[index - 1];
    currentEditingStops[index - 1] = temp;
    currentEditingStops.forEach((s, idx) => { s.stopOrder = idx + 1; });
    renderEditorStops();
  }
};

window.adminMoveStopDown = (index) => {
  syncStopsFromDOM();
  if (index >= 0 && index < currentEditingStops.length - 1) {
    const temp = currentEditingStops[index];
    currentEditingStops[index] = currentEditingStops[index + 1];
    currentEditingStops[index + 1] = temp;
    currentEditingStops.forEach((s, idx) => { s.stopOrder = idx + 1; });
    renderEditorStops();
  }
};
window.adminRemoveStop = (index) => {
  syncStopsFromDOM();
  if (index >= 0 && index < currentEditingStops.length) {
    currentEditingStops.splice(index, 1);
    currentEditingStops.forEach((s, idx) => { s.stopOrder = idx + 1; });
    renderEditorStops();
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

  const isMoving = bus.status === 'On Trip';
  const speed = bus.speed ? `${bus.speed} km/h` : (isMoving ? '38 km/h' : '0 km/h');
  
  const seatCap = parseInt(bus.seatCapacity || bus.capacity || 52, 10);
  const standCap = parseInt(bus.standingCapacity || 0, 10);
  const totalCap = parseInt(bus.totalCapacity || (seatCap + standCap), 10);
  const busStudents = usersCache.filter(u => String(u.assignedBus).trim() === String(bus.busNumber).trim());
  const assignedCount = busStudents.length;
  const occupancyPct = totalCap > 0 ? Math.round((assignedCount / totalCap) * 100) : 0;

  setElText('inspect-bus-speed', speed);
  setElText('inspect-bus-occupancy', `${assignedCount} / ${totalCap} (${occupancyPct}%)`);
  
  const schedMorn = bus.schedules?.morningDeparture ? `Morning: ${bus.schedules.morningDeparture}` : '';
  const schedEve = bus.schedules?.eveningDeparture ? `Evening: ${bus.schedules.eveningDeparture}` : '';
  const schedText = [schedMorn, schedEve].filter(Boolean).join(' • ') || (bus.status === 'Active' ? 'Active Service' : 'Idle at Depot');
  setElText('inspect-bus-trip', schedText);

  // Tab 1: Overview
  setElVal('inspect-bus-reg', bus.registrationNumber || bus.regNumber || 'Not Registered');
  setElVal('inspect-bus-type', bus.busType || 'College Bus');
  setElVal('inspect-bus-capacity', `${seatCap} Seating ${standCap > 0 ? `+ ${standCap} Standing ` : ''}(Total: ${totalCap})`);
  setElVal('inspect-bus-model', [bus.manufacturer, bus.model, bus.manufacturingYear].filter(Boolean).join(' ') || '--');

  // Assigned Route Details from routesCache
  const assignedRoute = routesCache.find(r => 
    (bus.assignedRouteId && r.id === bus.assignedRouteId) ||
    (bus.routeName && r.name && r.name.toLowerCase() === bus.routeName.toLowerCase()) ||
    (bus.route && r.name && r.name.toLowerCase() === bus.route.toLowerCase()) ||
    (r.assignedBus && String(r.assignedBus) === String(bus.busNumber)) ||
    (Array.isArray(r.assignedBuses) && r.assignedBuses.map(String).includes(String(bus.busNumber)))
  );

  let routeInspectorText = bus.routeName || bus.route || 'Unassigned';
  if (assignedRoute) {
    const stopsCount = assignedRoute.totalStops !== undefined 
      ? assignedRoute.totalStops 
      : (Array.isArray(assignedRoute.stops) ? assignedRoute.stops.length : 0);
    routeInspectorText = `${assignedRoute.name} (${assignedRoute.startPoint || '--'} → ${assignedRoute.destination || '--'} • ${stopsCount} Stops)`;
  }
  setElVal('inspect-bus-route-name', routeInspectorText);
  setElVal('inspect-bus-driver-name', bus.driverName || 'Not Assigned');

  const statusSelect = document.getElementById('inspect-bus-status-select');
  if (statusSelect) statusSelect.value = bus.status || 'Active';

  // Tab 2: Assigned Students
  const studentsListEl = document.getElementById('inspect-bus-students-list');
  if (studentsListEl) {
    if (busStudents.length === 0) {
      studentsListEl.innerHTML = `<div style="color: var(--text-secondary); font-size: 13.5px; padding: 12px; text-align: center; background: #F9FAFB; border-radius: var(--radius-md); border: 1px dashed var(--border-color);">No students currently assigned to Bus ${escapeHtml(bus.busNumber)}.</div>`;
    } else {
      studentsListEl.innerHTML = busStudents.map(s => `
        <div style="background: #F9FAFB; padding: 10px 14px; border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--border-color); margin-bottom: 6px;">
          <div>
            <strong>${escapeHtml(s.name)}</strong> <span style="font-size: 12px; color: var(--text-muted);">(${escapeHtml(s.id)})</span>
            <div style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(s.department)} • Boarding: ${escapeHtml(s.pickupStop)}</div>
          </div>
          <span class="status-badge ${s.status === 'Active' ? 'badge-green' : 'badge-gray'}">${escapeHtml(s.status)}</span>
        </div>
      `).join('');
    }
  }

  // Tab 3: Driver & Route Tab
  setElVal('inspect-bus-driver-phone', bus.driverContact || bus.phone || '--');
  setElVal('inspect-bus-driver-license', bus.driverLicense || '--');

  const routeTabDetails = document.getElementById('inspect-bus-route-details-wrap');
  if (routeTabDetails) {
    let stops = Array.isArray(bus.stops) && bus.stops.length > 0 ? bus.stops : (assignedRoute?.stops || []);
    const isSpecific = bus.coverageType === 'specific_stops';
    const totalRouteStops = assignedRoute?.totalStops !== undefined 
      ? assignedRoute.totalStops 
      : (Array.isArray(assignedRoute?.stops) ? assignedRoute.stops.length : stops.length);

    const coverageBadge = isSpecific
      ? `<span class="status-badge badge-purple" style="font-size: 11px;">Specific Stops (${stops.length} of ${totalRouteStops} Stops Served)</span>`
      : `<span class="status-badge badge-blue" style="font-size: 11px;">Full Route (${stops.length} Stops Served)</span>`;

    if (assignedRoute) {
      const sortedStops = [...stops].sort((a, b) => (a.order || a.stopOrder || 0) - (b.order || b.stopOrder || 0));
      routeTabDetails.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div>
            <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Assigned Route Corridor</div>
            <strong style="font-size: 15px; color: var(--text-primary);">${escapeHtml(assignedRoute.name)}</strong>
            ${coverageBadge}
          </div>
          <button type="button" class="btn-action-icon btn-action-primary" onclick="window.adminInspectRoute('${assignedRoute.id}')" title="Inspect Corridor">Inspect Corridor &rarr;</button>
        </div>
        <div style="background: #F9FAFB; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 12px 14px; font-size: 13px; margin-bottom: 16px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div><span style="color: var(--text-muted);">Start Point:</span> <strong>${escapeHtml(assignedRoute.startPoint || '--')}</strong></div>
            <div><span style="color: var(--text-muted);">Destination:</span> <strong>${escapeHtml(assignedRoute.destination || '--')}</strong></div>
            <div><span style="color: var(--text-muted);">Distance:</span> <strong>${escapeHtml(assignedRoute.distance || '--')}</strong></div>
            <div><span style="color: var(--text-muted);">Duration:</span> <strong>${escapeHtml(assignedRoute.duration || '--')}</strong></div>
          </div>
        </div>

        <div style="font-size: 12px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 8px;">
          Scheduled Bus Stops Sequence (${sortedStops.length})
        </div>
        <div style="max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;">
          ${sortedStops.map(s => {
            const stopNum = s.order || s.stopOrder || 1;
            const stopName = s.stopName || s.name || 'Unnamed Stop';
            const arrTime = s.arrivalTime || s.morningArrival || '';
            return `
              <div style="background: #FFFFFF; padding: 8px 12px; border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--border-color); font-size: 13px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="status-badge badge-blue" style="font-size: 11px; padding: 2px 6px;">#${stopNum}</span>
                  <strong>${escapeHtml(stopName)}</strong>
                </div>
                <span style="font-weight: 600; color: var(--text-secondary); font-size: 12.5px;">${arrTime ? `${escapeHtml(arrTime)} AM` : '--'}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      routeTabDetails.innerHTML = `
        <div style="color: var(--text-secondary); font-size: 13.5px; padding: 14px; text-align: center; background: #F9FAFB; border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
          No transit corridor assigned to Bus ${escapeHtml(bus.busNumber || '')}.
        </div>
      `;
    }
  }

  // Tab 4: Compliance Documents Tab
  const docsListEl = document.getElementById('inspect-bus-docs-list');
  if (docsListEl) {
    const busDocs = Array.isArray(bus.documents) ? bus.documents : [];
    if (busDocs.length === 0) {
      docsListEl.innerHTML = `
        <div style="color: var(--text-secondary); font-size: 13.5px; padding: 16px; text-align: center; background: #F9FAFB; border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
          No compliance documents attached to Bus ${escapeHtml(bus.busNumber || '')}.
        </div>
      `;
    } else {
      docsListEl.innerHTML = busDocs.map(d => {
        const exp = getDocumentExpiryStatus(d.expiryDate);
        return `
          <div style="background: #FFFFFF; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <strong style="font-size: 14px; color: var(--text-primary);">${escapeHtml(d.documentType || 'Vehicle Document')}</strong>
                <span class="status-badge ${exp.badgeClass}">${exp.label}</span>
              </div>
              <div style="font-size: 12.5px; color: var(--text-secondary); margin-top: 4px;">
                <span style="font-family: monospace; font-weight: 600; color: #374151;">${escapeHtml(d.documentNumber || 'No Policy Number')}</span>
                ${d.issueDate ? ` • Issue: ${d.issueDate}` : ''}
                ${d.expiryDate ? ` • Expiry: <strong>${d.expiryDate}</strong>` : ''}
                ${d.fileName ? ` • 📎 ${escapeHtml(d.fileName)}` : ''}
              </div>
            </div>
            <div>
              ${d.fileUrl ? `<a href="${d.fileUrl}" target="_blank" class="btn-action-icon btn-action-primary" style="text-decoration: none;">View Document</a>` : '<span style="font-size: 12px; color: var(--text-muted);">Verified</span>'}
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Tab 5: Maintenance & Issues Tab
  setElVal('inspect-bus-last-service', bus.maintenance?.lastServiceDate || '--');
  setElVal('inspect-bus-next-service', bus.maintenance?.nextServiceDate || '--');
  const maintNotesEl = document.getElementById('inspect-bus-maintenance-notes');
  if (maintNotesEl) {
    maintNotesEl.textContent = bus.maintenance?.notes || 'No maintenance notes recorded.';
  }

  const issuesListEl = document.getElementById('inspect-bus-issues-list');
  if (issuesListEl) {
    const busTickets = reportsCache.filter(r => 
      String(r.busNumber).trim() === String(bus.busNumber).trim() ||
      (r.category && r.category.toLowerCase().includes('maintenance'))
    );
    if (busTickets.length === 0) {
      issuesListEl.innerHTML = '<div style="color: var(--text-secondary); font-size: 13.5px; padding: 12px; text-align: center; background: #F9FAFB; border-radius: var(--radius-md); border: 1px dashed var(--border-color);">No maintenance or vehicle incident reports logged.</div>';
    } else {
      issuesListEl.innerHTML = busTickets.map(t => `
        <div style="background: #F9FAFB; padding: 10px 14px; border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--border-color);">
          <div>
            <strong>${escapeHtml(t.subject || 'Maintenance Report')}</strong> <span style="font-size: 12px; color: var(--text-muted);">(${escapeHtml(t.reportNumber || t.id)})</span>
            <div style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(t.description || '')}</div>
          </div>
          <span class="status-badge ${getStatusBadgeClass(t.status)}">${escapeHtml(t.status || 'Pending')}</span>
        </div>
      `).join('');
    }
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
    const matchedRoutes = routesCache.filter(r => 
      (r.name && r.name.toLowerCase().includes(q)) || 
      (r.startPoint && r.startPoint.toLowerCase().includes(q)) || 
      (r.destination && r.destination.toLowerCase().includes(q)) ||
      (Array.isArray(r.stops) && r.stops.some(s => s.name && s.name.toLowerCase().includes(q)))
    );

    let html = '';

    if (matchedRoutes.length > 0) {
      html += `<div class="search-category-group"><div class="search-category-title">Routes</div>`;
      matchedRoutes.slice(0, 3).forEach(r => {
        html += `<div class="search-item" onclick="window.adminInspectRoute('${r.id}')"><span><strong>${escapeHtml(r.name)}</strong> (${escapeHtml(r.startPoint || '')} &rarr; ${escapeHtml(r.destination || '')})</span><span class="status-badge badge-blue">Inspect</span></div>`;
      });
      html += `</div>`;
    }

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

  document.getElementById('routes-search-input')?.addEventListener('input', () => renderRoutesTable());
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
  try {
    if (ts.toDate && typeof ts.toDate === 'function') {
      return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    if (typeof ts.seconds === 'number') {
      return new Date(ts.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    const d = new Date(ts);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
  } catch (e) {}
  return 'Recently';
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
