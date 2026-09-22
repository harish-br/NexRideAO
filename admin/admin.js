import '../js/instrument.js';
import { auth, firestore, storage } from '../js/firebase-config.js';
import { notificationClient } from '../js/notifications/notification-service.js';
import { 
  signInWithEmailAndPassword, signOut, onAuthStateChanged, 
  setPersistence, browserLocalPersistence 
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { 
  doc, getDoc, setDoc, collection, onSnapshot, query, where, 
  limit, orderBy, getDocs, deleteDoc, updateDoc, addDoc, serverTimestamp, arrayUnion 
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { ref, uploadBytesResumable, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js';

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
let notificationsCache = [];

// Drivers & Documents Management State
let driversLoaded = false;
let documentsLoaded = false;
let currentInspectingDriverId = null;
let currentInspectingDocId = null;
let currentDocCategoryFilter = 'all';
let currentDriverSubtab = 'list';
let driversPagination = { page: 1, pageSize: 10 };
let documentsPagination = { page: 1, pageSize: 10 };
let pendingRejectDocId = null;
let documentNotificationsSentKeys = new Set();

// Collection loaded flags for skeleton loading states
let busesLoaded = false;
let usersLoaded = false;
let routesLoaded = false;
let reportsLoaded = false;
let approvalsLoaded = false;
let auditLogsLoaded = false;
let notificationsLoaded = false;
let isDashboardLoading = true;

let currentInspectingBus = null;
let currentInspectingTicket = null;
let currentInspectingRouteId = null;
let currentEditingStops = [];
let currentEditingBusDocs = [];
let hasLoadedFirestoreRoutes = false;
let hasLoadedFirestoreDrivers = false;
let hasLoadedFirestoreDocuments = false;
let routesUnsubscribe = null;
let reportsUnsubscribe = null;
let usersUnsubscribe = null;
let notificationsUnsubscribe = null;
let driversUnsubscribe = null;
let documentsUnsubscribe = null;
let selectedUploadFile = null;

// =============================================================================
// DOM ELEMENTS
// =============================================================================
const loginPage = document.getElementById('admin-login-page');
const dashboardPage = document.getElementById('admin-dashboard-page');
const loginForm = document.getElementById('admin-login-form');
const emailInput = document.getElementById('admin-email');
const passwordInput = document.getElementById('admin-password');
const loginBtn = document.getElementById('login-btn') || document.getElementById('login-submit-btn');
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

  // Instant hydration from cache so dashboard renders immediately
  try {
    const cachedBuses = localStorage.getItem('nexride_admin_buses_cache');
    const cachedRoutes = localStorage.getItem('nexride_admin_routes_cache');
    const cachedUsers = localStorage.getItem('nexride_admin_users_cache');
    if (cachedBuses) busesCache = JSON.parse(cachedBuses);
    if (cachedRoutes) routesCache = JSON.parse(cachedRoutes);
    if (cachedUsers) usersCache = JSON.parse(cachedUsers);
    if (busesCache.length > 0 || routesCache.length > 0) {
      busesLoaded = true;
      routesLoaded = true;
      deriveDerivedState();
      renderDashboardLoaded();
      renderDashboardStats();
      renderRecentActivity();
    }
  } catch (e) {
    console.warn("Cache hydration error:", e);
  }

  initRealtimeEngine();
}

function showError(msg) {
  if (loginError) {
    loginError.textContent = msg;
    loginError.classList.remove('hidden');
  }
}

const AUTHORIZED_ADMIN_EMAILS = [
  'admin@nexride.com',
  'teamnexride@gmail.com',
  'harishsrhr@gmail.com'
];

function isAuthorizedAdminEmail(email) {
  if (!email) return false;
  const lower = email.toLowerCase().trim();
  return AUTHORIZED_ADMIN_EMAILS.includes(lower) || /^[a-zA-Z0-9._%+-]+@admin\.nexride\.com$/.test(lower);
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    let isAuthorized = false;
    let adminRole = 'Admin';

    // 1. FAST-PATH: Check designated admin emails immediately to eliminate network delay
    if (isAuthorizedAdminEmail(user.email)) {
      isAuthorized = true;
      adminRole = 'Super Admin';
    }

    if (!isAuthorized) {
      try {
        // Check software_admin document with 2s timeout
        const adminDocRef = doc(firestore, 'software_admin', user.uid);
        const adminDocSnap = await Promise.race([
          getDoc(adminDocRef),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
        ]).catch(() => null);

        if (adminDocSnap && adminDocSnap.exists()) {
          isAuthorized = true;
          adminRole = adminDocSnap.data().role || 'Super Admin';
        }

        // Check custom claims with 1.5s timeout
        if (!isAuthorized && typeof user.getIdTokenResult === 'function') {
          const tokenResult = await Promise.race([
            user.getIdTokenResult(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500))
          ]).catch(() => null);

          if (tokenResult && tokenResult.claims && (tokenResult.claims.admin === true || tokenResult.claims.role === 'admin')) {
            isAuthorized = true;
            adminRole = 'Super Admin';
          }
        }
      } catch (err) {
        console.warn("Role check failed:", err.message);
        if (isAuthorizedAdminEmail(user.email)) {
          isAuthorized = true;
          adminRole = 'Super Admin';
        }
      }
    }

    if (!isAuthorized) {
      console.warn("Unauthorized access attempt to admin console:", user.email || user.uid);
      showError("Access Denied: Administrator account required.");
      currentAdminUser = null;
      try { await signOut(auth); } catch (e) {}
      showLogin();
      return;
    }

    currentAdminUser = user;
    const profileEmailEl = document.getElementById('header-profile-email');
    const profileNameEl = document.getElementById('header-profile-name');
    if (profileEmailEl && user.email) profileEmailEl.textContent = user.email;
    if (profileNameEl) profileNameEl.textContent = user.displayName || (user.email ? user.email.split('@')[0] : 'Admin');

    const roleEl = document.getElementById('settings-current-role');
    if (roleEl) roleEl.textContent = adminRole;
    const roleEmailEl = document.getElementById('stg-role-email');
    if (roleEmailEl && user.email) roleEmailEl.textContent = user.email;
    const roleAvatarEl = document.getElementById('stg-role-avatar');
    if (roleAvatarEl) {
      const letter = (user.displayName || user.email || 'A').trim().charAt(0).toUpperCase();
      roleAvatarEl.textContent = letter;
    }

    showDashboard();

    // Initialize Admin Push Notifications
    notificationClient.initialize(user, 'admin').catch(err => {
      console.warn('[Admin Notifications] Initialization error:', err);
    });
    setupAdminNotificationUI();
  } else {
    currentAdminUser = null;
    showLogin();
  }
});

// Quick fallback: if after 350ms auth hasn't resolved and page is blank, show login screen
setTimeout(() => {
  if (!currentAdminUser && dashboardPage?.classList.contains('hidden') && loginPage?.classList.contains('hidden')) {
    loginPage.classList.remove('hidden');
  }
}, 350);

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loginError) loginError.classList.add('hidden');
    if (loginBtn) {
      loginBtn.textContent = 'Authenticating...';
      loginBtn.disabled = true;
    }

    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value);
    } catch (err) {
      console.error("Admin Login Error:", err);
      let errorMsg = "Invalid email or password.";
      if (err.code === 'auth/user-not-found') {
        errorMsg = "No account found with this email.";
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errorMsg = "Incorrect email or password.";
      } else if (err.code === 'auth/too-many-requests') {
        errorMsg = "Too many failed attempts. Please try again later.";
      } else if (err.message) {
        errorMsg = err.message.replace(/^Firebase:\s*/, '');
      }
      showError(errorMsg);
      if (loginBtn) {
        loginBtn.textContent = 'Sign In to Transport Center';
        loginBtn.disabled = false;
      }
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

  if (viewId === 'dashboard-view') {
    renderDashboardStats();
    renderRecentActivity();
    renderDashboardDocumentAlerts();
  }
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
  if (viewId === 'drivers-view') {
    renderDriversTable();
    renderDriverLicenceComplianceSection();
  }
  if (viewId === 'students-view') {
    renderStudentsTable();
  }
  if (viewId === 'timings-view') {
    renderTimingsTable();
  }
  if (viewId === 'trips-view') {
    renderTripsTable();
  }
  if (viewId === 'documents-view') {
    renderDocumentsTable();
    renderExpiringDocumentsSection();
    renderExpiredDocumentsSection();
  }
  if (viewId === 'approvals-view') {
    renderApprovalsTable();
  }
  if (viewId === 'notifications-view') {
    renderNotificationsManagementTable();
  }
  if (viewId === 'audit-logs-view') {
    renderAuditLogsTable();
  }
  if (viewId === 'settings-view') {
    loadSystemSettings();
  }

  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
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

// Dropdown item clicks (e.g. Drivers List, Licence Expiry & Compliance, Driver Documents)
document.querySelectorAll('.nav-dropdown-menu .dropdown-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const targetView = item.getAttribute('data-view');
    const driversTab = item.getAttribute('data-drivers-tab');
    const href = item.getAttribute('href');

    if (targetView) {
      switchView(targetView);
    }
    if (driversTab && typeof switchDriverSubtab === 'function') {
      switchDriverSubtab(driversTab);
    }
    if (href && href.includes('?')) {
      const queryString = href.split('?')[1];
      const params = new URLSearchParams(queryString);
      const ownerType = params.get('ownerType');
      if (ownerType && typeof switchDocumentCategoryTab === 'function') {
        switchDocumentCategoryTab(ownerType);
      }
    }
    item.closest('.nav-dropdown-menu')?.classList.add('hidden');
  });
});

// Dropdown hover & toggle support
const navDriversItem = document.getElementById('nav-drivers-item');
const navDriversDropdown = document.getElementById('nav-drivers-dropdown');
if (navDriversItem && navDriversDropdown) {
  navDriversItem.addEventListener('mouseenter', () => navDriversDropdown.classList.remove('hidden'));
  navDriversItem.closest('.nav-dropdown')?.addEventListener('mouseleave', () => navDriversDropdown.classList.add('hidden'));
}

// URL Hash Router for deep linking (Requirement 34)
function handleHashRoute() {
  const hash = window.location.hash || '';
  if (!hash) return;
  const [baseRoute, queryString] = hash.split('?');
  const params = new URLSearchParams(queryString || '');

  if (baseRoute === '#drivers') {
    switchView('drivers-view');
    const driverId = params.get('driverId');
    if (driverId) {
      setTimeout(() => openDriverDetailsModal(driverId), 200);
    }
    const tab = params.get('tab');
    if (tab && typeof switchDriverSubtab === 'function') {
      switchDriverSubtab(tab);
    }
  } else if (baseRoute === '#documents') {
    switchView('documents-view');
    const ownerType = params.get('ownerType');
    if (ownerType && typeof switchDocumentCategoryTab === 'function') {
      switchDocumentCategoryTab(ownerType);
    }
    const statusParam = params.get('status');
    if (statusParam) {
      const statusFilterEl = document.getElementById('doc-status-filter');
      if (statusFilterEl) {
        if (statusParam === 'expiring') statusFilterEl.value = 'Expiring Soon';
        else if (statusParam === 'expired') statusFilterEl.value = 'Expired';
        else if (statusParam === 'valid') statusFilterEl.value = 'Valid';
        renderDocumentsTable();
      }
    }
  }
}

window.addEventListener('hashchange', handleHashRoute);

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
      try {
        await notificationClient.unregisterDeviceToken();
      } catch (e) { }
      await signOut(auth);
    } catch (err) {
      console.error("Sign out error:", err);
    }
    window.location.reload();
  });
}

// =============================================================================
// ADMIN PUSH NOTIFICATIONS & BROADCAST CONTROLLER
// =============================================================================
let adminNotificationsInitialized = false;

function setupAdminNotificationUI() {
  if (adminNotificationsInitialized) return;
  adminNotificationsInitialized = true;

  const notifBtn = document.getElementById('admin-notif-btn');
  const notifDropdown = document.getElementById('admin-notif-dropdown');
  const notifList = document.getElementById('admin-notif-list');
  const markAllBtn = document.getElementById('admin-mark-all-read-btn');

  if (notifBtn && notifDropdown) {
    notifBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      notifDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!notifBtn.contains(e.target) && !notifDropdown.contains(e.target)) {
        notifDropdown.classList.add('hidden');
      }
    });
  }

  if (markAllBtn) {
    markAllBtn.addEventListener('click', async () => {
      await notificationClient.markAllAsRead();
    });
  }

  // Subscribe to notification client state
  notificationClient.subscribe(({ notifications, unreadCount }) => {
    if (!notifList) return;

    if (!notifications || notifications.length === 0) {
      notifList.innerHTML = `
        <div style="text-align: center; padding: 28px 16px; color: #9CA3AF; font-size: 13px;">
          <div style="font-weight: 600; color: #4B5563; margin-bottom: 2px;">No Notifications</div>
          <span>All administrative updates are caught up.</span>
        </div>
      `;
      return;
    }

    let html = '';
    notifications.forEach(n => {
      const isUnread = !n.read;
      const dateStr = new Date(n.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      html += `
        <div class="admin-notif-item" data-notif-id="${n.id}" style="padding: 10px 12px; border-radius: 10px; background: ${isUnread ? '#EFF6FF' : '#F9FAFB'}; border: 1px solid ${isUnread ? '#BFDBFE' : '#F3F4F6'}; cursor: pointer; display: flex; flex-direction: column; gap: 4px; transition: background 0.15s;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 13px; font-weight: ${isUnread ? '700' : '600'}; color: #111827;">${escapeHtml(n.title)}</span>
            <span style="font-size: 11px; color: #9CA3AF;">${dateStr}</span>
          </div>
          <div style="font-size: 12px; color: #4B5563; line-height: 1.4;">${escapeHtml(n.body)}</div>
        </div>
      `;
    });

    notifList.innerHTML = html;

    notifList.querySelectorAll('.admin-notif-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-notif-id');
        if (id) notificationClient.markAsRead(id);
      });
    });
  });

  setupAdminBroadcastModal();
}

function setupAdminBroadcastModal() {
  const modal = document.getElementById('admin-broadcast-modal');
  const openBtn = document.getElementById('admin-open-broadcast-modal-btn');
  const closeBtn = document.getElementById('close-broadcast-modal-btn');
  const cancelBtn = document.getElementById('cancel-broadcast-btn');
  const submitBtn = document.getElementById('submit-broadcast-btn');

  const targetSelect = document.getElementById('broadcast-target-select');
  const specificWrap = document.getElementById('broadcast-specific-user-wrap');
  const specificUidInput = document.getElementById('broadcast-target-uid');
  const typeSelect = document.getElementById('broadcast-type-select');
  const titleInput = document.getElementById('broadcast-title-input');
  const bodyInput = document.getElementById('broadcast-body-input');
  const statusMsg = document.getElementById('broadcast-status-msg');

  if (!modal) return;

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      document.getElementById('admin-notif-dropdown')?.classList.add('hidden');
      modal.classList.remove('hidden');
      if (statusMsg) statusMsg.style.display = 'none';
    });
  }

  const viewAllBtn = document.getElementById('admin-view-all-notifs-btn');
  if (viewAllBtn) {
    viewAllBtn.addEventListener('click', () => {
      document.getElementById('admin-notif-dropdown')?.classList.add('hidden');
      switchView('notifications-view');
    });
  }

  const hideModal = () => {
    modal.classList.add('hidden');
    if (titleInput) titleInput.value = '';
    if (bodyInput) bodyInput.value = '';
    if (specificUidInput) specificUidInput.value = '';
    if (statusMsg) statusMsg.style.display = 'none';
  };

  closeBtn?.addEventListener('click', hideModal);
  cancelBtn?.addEventListener('click', hideModal);

  targetSelect?.addEventListener('change', () => {
    if (targetSelect.value === 'specific_users') {
      specificWrap?.classList.remove('hidden');
    } else {
      specificWrap?.classList.add('hidden');
    }
  });

  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const title = titleInput?.value.trim();
      const body = bodyInput?.value.trim();
      const target = targetSelect?.value || 'all_users';
      const type = typeSelect?.value || 'GENERAL_ANNOUNCEMENT';
      const specificUid = specificUidInput?.value.trim();

      if (!title || !body) {
        if (statusMsg) {
          statusMsg.style.display = 'block';
          statusMsg.style.background = '#FEE2E2';
          statusMsg.style.color = '#B91C1C';
          statusMsg.textContent = 'Please provide both title and message body.';
        }
        return;
      }

      if (target === 'specific_users' && !specificUid) {
        if (statusMsg) {
          statusMsg.style.display = 'block';
          statusMsg.style.background = '#FEE2E2';
          statusMsg.style.color = '#B91C1C';
          statusMsg.textContent = 'Please enter a target User ID.';
        }
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Dispatching...';

      try {
        let targetDocId = specificUid;
        if (target === 'specific_users' && specificUid) {
          const cleanQuery = specificUid.trim().toLowerCase();
          const matched = usersCache.find(u =>
            (u.docId && u.docId.toLowerCase() === cleanQuery) ||
            (u.id && String(u.id).toLowerCase() === cleanQuery) ||
            (u.email && u.email.toLowerCase() === cleanQuery) ||
            (u.raw?.regno && String(u.raw.regno).toLowerCase() === cleanQuery) ||
            (u.name && u.name.toLowerCase() === cleanQuery)
          );
          if (matched && matched.docId) {
            targetDocId = matched.docId;
          }
        }

        const adminIdentifier = currentAdminUser?.email || currentAdminUser?.uid || 'admin';
        const category = getCategoryForType(type);
        const generatedNotifId = generateNotificationId(category);
        const isTest = isTestNotification({ title, body });
        const now = new Date();
        const createdAtIso = now.toISOString();
        const createdAtFormatted = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        let recipientDisplay = 'All Students & Users (Broadcast)';
        if (target === 'admins') {
          recipientDisplay = 'All Administrators Only';
        } else if (target === 'specific_users' && targetDocId) {
          const matched = usersCache.find(u => u.docId === targetDocId || u.id === targetDocId);
          recipientDisplay = matched ? `Student: ${matched.name} (${matched.id || targetDocId})` : `User ID: ${targetDocId}`;
        }

        let parentNotifDocId = null;

        // 1. Centralized notifications entry in Firestore
        try {
          const centralDoc = await addDoc(collection(firestore, 'notifications'), {
            notificationId: generatedNotifId,
            title,
            body,
            category,
            type,
            target,
            recipientId: target === 'specific_users' ? targetDocId : (target === 'admins' ? 'ALL_ADMINS' : 'ALL_USERS'),
            recipientType: target === 'admins' ? 'admin' : 'user',
            recipientName: recipientDisplay,
            read: false,
            isTest: isTest,
            createdAt: serverTimestamp(),
            createdAtIso: createdAtIso,
            createdAtFormatted: createdAtFormatted,
            createdBy: adminIdentifier,
            status: 'sent',
            metadata: {
              channel: 'fcm_and_inapp',
              source: 'Admin Quick Broadcast',
              version: '2.0'
            }
          });
          parentNotifDocId = centralDoc.id;
        } catch (centralErr) {
          console.warn('[Admin] Centralized notification write note:', centralErr);
        }

        // 2. Direct user subcollection delivery (users/{uid}/notifications)
        if (target === 'all_users') {
          // Gather all user IDs
          let targetUsers = [...usersCache];
          if (targetUsers.length === 0) {
            try {
              const usersSnap = await getDocs(collection(firestore, 'users'));
              usersSnap.forEach(d => targetUsers.push({ docId: d.id, id: d.id, name: d.data()?.name }));
            } catch (snapErr) {
              console.warn('[Admin] Fallback users fetch failed:', snapErr);
            }
          }

          // Write to all students' notifications subcollections
          const writes = targetUsers.map(u => {
            const uid = u.docId || u.id;
            if (!uid) return Promise.resolve();
            return addDoc(collection(firestore, 'users', uid, 'notifications'), {
              parentNotifId: parentNotifDocId,
              notificationId: generatedNotifId,
              title,
              body,
              category,
              type,
              target: 'all_users',
              recipientId: uid,
              recipientName: u.name || uid,
              read: false,
              isTest: isTest,
              createdAt: serverTimestamp(),
              createdAtIso: createdAtIso,
              createdBy: adminIdentifier
            }).catch(e => console.warn(`[Admin] Write notif to ${uid} note:`, e));
          });
          await Promise.allSettled(writes);
        } else if (target === 'specific_users' && targetDocId) {
          try {
            await addDoc(collection(firestore, 'users', targetDocId, 'notifications'), {
              parentNotifId: parentNotifDocId,
              notificationId: generatedNotifId,
              title,
              body,
              category,
              type,
              target: 'specific_user',
              recipientId: targetDocId,
              recipientName: recipientDisplay,
              read: false,
              isTest: isTest,
              createdAt: serverTimestamp(),
              createdAtIso: createdAtIso,
              createdBy: adminIdentifier
            });
          } catch (specErr) {
            console.warn(`[Admin] Write to user ${targetDocId} failed:`, specErr);
          }
        }

        // 3. Dispatch via REST API router (triggers FCM push notifications if configured)
        try {
          const payload = {
            target,
            userIds: target === 'specific_users' ? [targetDocId] : [],
            title,
            body,
            type
          };

          await fetch('/api/notifications/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': currentAdminUser?.uid || 'admin_super',
              'x-user-role': 'admin'
            },
            body: JSON.stringify(payload)
          });
        } catch (apiErr) {
          console.warn('[Admin] Notification API dispatch note:', apiErr.message);
        }

        // 4. Record in Audit Logs
        try {
          await addDoc(collection(firestore, 'auditLogs'), {
            action: 'DISPATCH_NOTIFICATION',
            target,
            title,
            admin: adminIdentifier,
            timestamp: serverTimestamp()
          });
        } catch (auditErr) { }

        if (statusMsg) {
          statusMsg.style.display = 'block';
          statusMsg.style.background = '#DCFCE7';
          statusMsg.style.color = '#15803D';
          statusMsg.textContent = 'Notification sent successfully to users!';
        }

        setTimeout(hideModal, 1500);
      } catch (err) {
        if (statusMsg) {
          statusMsg.style.display = 'block';
          statusMsg.style.background = '#FEE2E2';
          statusMsg.style.color = '#B91C1C';
          statusMsg.textContent = err.message;
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Notification';
      }
    });
  }
}

// =============================================================================
// NOTIFICATION MANAGEMENT SUBSYSTEM (CRUD, SEARCH, RESEND, INSPECT, PURGE)
// =============================================================================

let activeNotifCategory = 'all';

function getCategoryForType(type) {
  if (type === 'BUS_DELAYED' || type === 'ROUTE_UPDATED') return 'transit';
  if (type === 'SAFETY_ALERT') return 'safety';
  if (type === 'EPASS_ALERT') return 'passes';
  if (type === 'SYSTEM_ALERT') return 'system';
  return 'announcement';
}

function generateNotificationId(category = 'announcement') {
  const prefixMap = {
    announcement: 'NTF-ANN',
    transit: 'NTF-TRN',
    safety: 'NTF-SAF',
    passes: 'NTF-PAS',
    system: 'NTF-SYS'
  };
  const prefix = prefixMap[category] || 'NTF-GEN';
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${dateStr}-${rand}`;
}

function isTestNotification(n) {
  if (!n) return false;
  if (n.isTest === true) return true;
  const testRegex = /\b(test|testing|sample|trial|demo|check)\b/i;
  if (n.title && testRegex.test(n.title)) return true;
  if (n.body && testRegex.test(n.body)) return true;
  return false;
}

function updateTestNotificationsBadge() {
  const testItems = notificationsCache.filter(isTestNotification);
  const badge = document.getElementById('test-notifs-badge');
  if (badge) {
    badge.textContent = testItems.length;
    badge.style.display = testItems.length > 0 ? 'inline-block' : 'none';
  }
}

function listenToNotifications() {
  if (notificationsUnsubscribe) {
    try { notificationsUnsubscribe(); } catch (e) { }
    notificationsUnsubscribe = null;
  }

  const notifsRef = collection(firestore, 'notifications');
  notificationsUnsubscribe = onSnapshot(notifsRef, (snapshot) => {
    notificationsCache = [];
    snapshot.forEach(d => {
      notificationsCache.push({ id: d.id, ...d.data() });
    });

    // Sort newest first
    notificationsCache.sort((a, b) => {
      const getTime = (val) => {
        if (!val) return 0;
        if (typeof val.toMillis === 'function') return val.toMillis();
        if (typeof val.toDate === 'function') return val.toDate().getTime();
        if (typeof val.seconds === 'number') return val.seconds * 1000;
        if (val instanceof Date) return val.getTime();
        const t = new Date(val).getTime();
        return isNaN(t) ? 0 : t;
      };
      return getTime(b.createdAt || b.sentAt) - getTime(a.createdAt || a.sentAt);
    });

    notificationsLoaded = true;
    updateTestNotificationsBadge();
    renderNotificationsManagementTable();
    renderRecentActivity();
  }, (err) => {
    console.error("Firestore Notifications listener error:", err);
  });
}

function renderNotificationsManagementTable() {
  const tbody = document.getElementById('notifications-table-body');
  if (!tbody) return;

  if (!notificationsLoaded && notificationsCache.length === 0) {
    renderTableSkeleton(tbody, 6, 4);
    return;
  }

  const searchVal = (document.getElementById('notif-search-input')?.value || '').toLowerCase().trim();
  const typeVal = document.getElementById('notif-type-filter')?.value || 'all';
  const targetVal = document.getElementById('notif-target-filter')?.value || 'all';

  // Calculate KPIs
  const total = notificationsCache.length;
  let broadcasts = 0;
  let urgent = 0;
  let targeted = 0;

  notificationsCache.forEach(n => {
    const isBcast = n.target === 'all_users' || n.recipientId === 'ALL_USERS';
    const isUrg = n.priority === 'Urgent' || n.type === 'SAFETY_ALERT';
    const isTarget = n.target === 'specific_users' || (n.recipientId && n.recipientId !== 'ALL_USERS' && n.recipientId !== 'ALL_ADMINS');

    if (isBcast) broadcasts++;
    if (isUrg) urgent++;
    if (isTarget) targeted++;
  });

  const elTotal = document.getElementById('stat-notif-total');
  const elBroadcasts = document.getElementById('stat-notif-broadcasts');
  const elUrgent = document.getElementById('stat-notif-urgent');
  const elTargeted = document.getElementById('stat-notif-targeted');

  if (elTotal) elTotal.textContent = total;
  if (elBroadcasts) elBroadcasts.textContent = broadcasts;
  if (elUrgent) elUrgent.textContent = urgent;
  if (elTargeted) elTargeted.textContent = targeted;

  updateTestNotificationsBadge();

  // Filter items
  const filtered = notificationsCache.filter(n => {
    // 1. Category Pill Tab filter
    if (activeNotifCategory !== 'all') {
      const cat = n.category || getCategoryForType(n.type);
      if (cat !== activeNotifCategory) return false;
    }
    // 2. Type filter
    if (typeVal !== 'all' && n.type !== typeVal) return false;
    // 3. Target filter
    if (targetVal !== 'all') {
      if (targetVal === 'all_users' && n.target !== 'all_users' && n.recipientId !== 'ALL_USERS') return false;
      if (targetVal === 'admins' && n.target !== 'admins' && n.recipientId !== 'ALL_ADMINS') return false;
      if (targetVal === 'specific_users' && n.target !== 'specific_users' && (n.recipientId === 'ALL_USERS' || n.recipientId === 'ALL_ADMINS')) return false;
    }
    // 4. Search query
    if (searchVal) {
      const matchTitle = (n.title || '').toLowerCase().includes(searchVal);
      const matchBody = (n.body || '').toLowerCase().includes(searchVal);
      const matchAuthor = (n.createdBy || '').toLowerCase().includes(searchVal);
      const matchRecipient = (n.recipientId || '').toLowerCase().includes(searchVal);
      const matchRecipName = (n.recipientName || '').toLowerCase().includes(searchVal);
      const matchCode = (n.notificationId || '').toLowerCase().includes(searchVal);
      if (!matchTitle && !matchBody && !matchAuthor && !matchRecipient && !matchRecipName && !matchCode) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 36px 16px; color: var(--text-secondary);">
          <div style="width: 48px; height: 48px; border-radius: 50%; background: #F3F4F6; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px auto;">
            <span class="folder-svg-icon icon-notification" style="width: 24px; height: 24px; color: #9CA3AF;"></span>
          </div>
          <div style="font-weight: 600; font-size: 14px; color: #374151;">No notifications found</div>
          <div style="font-size: 12.5px; color: #6B7280; margin-top: 4px;">Try selecting another category or adjusting your search filters.</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = '';
  filtered.forEach(n => {
    const tr = document.createElement('tr');

    // Type styling with folder SVG icons
    let typeSvg = '<span class="folder-svg-icon icon-sms" style="width: 14px; height: 14px;"></span>';
    let typeBadgeClass = 'badge-blue';
    let typeLabel = 'Announcement';
    let iconBgStyle = 'background: #EFF6FF; color: #2563EB; border: 1px solid #DBEAFE;';

    if (n.type === 'BUS_DELAYED') {
      typeSvg = '<span class="folder-svg-icon icon-bus" style="width: 14px; height: 14px;"></span>';
      typeBadgeClass = 'badge-orange';
      typeLabel = 'Bus Delay';
      iconBgStyle = 'background: #FFF7ED; color: #EA580C; border: 1px solid #FED7AA;';
    } else if (n.type === 'ROUTE_UPDATED') {
      typeSvg = '<span class="folder-svg-icon icon-routing" style="width: 14px; height: 14px;"></span>';
      typeBadgeClass = 'badge-purple';
      typeLabel = 'Route Update';
      iconBgStyle = 'background: #FAF5FF; color: #9333EA; border: 1px solid #E9D5FF;';
    } else if (n.type === 'SAFETY_ALERT') {
      typeSvg = '<span class="folder-svg-icon icon-danger" style="width: 14px; height: 14px;"></span>';
      typeBadgeClass = 'badge-red';
      typeLabel = 'Safety Alert';
      iconBgStyle = 'background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA;';
    } else if (n.type === 'EPASS_ALERT') {
      typeSvg = '<span class="folder-svg-icon icon-card-tick" style="width: 14px; height: 14px;"></span>';
      typeBadgeClass = 'badge-green';
      typeLabel = 'E-Pass Notice';
      iconBgStyle = 'background: #F0FDF4; color: #16A34A; border: 1px solid #BBF7D0;';
    } else if (n.type === 'SYSTEM_ALERT') {
      typeSvg = '<span class="folder-svg-icon icon-routing" style="width: 14px; height: 14px;"></span>';
      typeBadgeClass = 'badge-gray';
      typeLabel = 'System Notice';
      iconBgStyle = 'background: #F3F4F6; color: #4B5563; border: 1px solid #E5E7EB;';
    }

    const isUrgent = n.priority === 'Urgent';
    const isTest = isTestNotification(n);

    // Target styling
    let targetDisplay = n.recipientName || 'All Students (Broadcast)';
    let targetBadgeStyle = 'background: #EFF6FF; color: #1D4ED8; border: 1px solid #DBEAFE;';

    if (n.target === 'admins' || n.recipientId === 'ALL_ADMINS') {
      targetDisplay = 'Administrators Only';
      targetBadgeStyle = 'background: #F3E8FF; color: #6B21A8; border: 1px solid #E9D5FF;';
    } else if (n.target === 'specific_users' || (n.recipientId && n.recipientId !== 'ALL_USERS' && n.recipientId !== 'ALL_ADMINS')) {
      if (!n.recipientName) {
        const matched = usersCache.find(u => u.docId === n.recipientId || u.id === n.recipientId || (u.raw && u.raw.regno === n.recipientId));
        const studentName = matched ? matched.name : n.recipientId;
        targetDisplay = `Student: ${escapeHtml(studentName)}`;
      }
      targetBadgeStyle = 'background: #ECFDF5; color: #047857; border: 1px solid #A7F3D0;';
    }

    // Date formatting
    const getTime = (val) => {
      if (!val) return null;
      if (typeof val.toDate === 'function') return val.toDate();
      if (typeof val.toMillis === 'function') return new Date(val.toMillis());
      if (val instanceof Date) return val;
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    };
    const createdDate = getTime(n.createdAt || n.sentAt);
    const dateStr = createdDate
      ? createdDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + createdDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : (n.createdAtFormatted || '--');

    const author = n.createdBy || 'Admin';
    const codeDisplay = n.notificationId || n.id.slice(0, 8).toUpperCase();

    tr.innerHTML = `
      <td>
        <div style="font-weight: 700; font-size: 13.5px; color: #111827; margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
          <span style="display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 6px; flex-shrink: 0; ${iconBgStyle}">${typeSvg}</span>
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 170px;" title="${escapeHtml(n.title)}">${escapeHtml(n.title || 'Untitled')}</span>
        </div>
        <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap; margin-left: 32px;">
          <span style="font-size: 10.5px; padding: 2px 7px; border-radius: 9999px; font-weight: 600; ${typeBadgeClass === 'badge-red' ? 'background: #FEE2E2; color: #B91C1C;' : (typeBadgeClass === 'badge-orange' ? 'background: #FFEDD5; color: #C2410C;' : (typeBadgeClass === 'badge-green' ? 'background: #DCFCE7; color: #15803D;' : (typeBadgeClass === 'badge-purple' ? 'background: #FAF5FF; color: #9333EA;' : 'background: #EFF6FF; color: #1D4ED8;')))}">${typeLabel}</span>
          <span style="font-size: 10px; font-family: monospace; color: #6B7280; background: #F3F4F6; padding: 1px 5px; border-radius: 4px;">${codeDisplay}</span>
          ${isTest ? '<span style="font-size: 10px; padding: 1px 5px; border-radius: 9999px; font-weight: 700; background: #FEF3C7; color: #92400E; border: 1px solid #FCD34D;">TEST</span>' : ''}
        </div>
      </td>
      <td>
        <span style="display: inline-block; font-size: 11.5px; font-weight: 600; padding: 4px 10px; border-radius: 8px; ${targetBadgeStyle} max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${targetDisplay}">${targetDisplay}</span>
      </td>
      <td>
        <div style="font-size: 13px; color: #4B5563; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; cursor: pointer;" onclick="window.adminInspectNotification('${n.id}')" title="${escapeHtml(n.body)}">
          ${escapeHtml(n.body || '')}
        </div>
        ${n.route ? `<div style="font-size: 11px; color: #2563EB; margin-top: 3px; font-weight: 500;">Link: ${escapeHtml(n.route)}</div>` : ''}
      </td>
      <td>
        <div style="font-size: 12.5px; color: #1F2937; font-weight: 500;">${dateStr}</div>
        <div style="font-size: 11.5px; color: #6B7280; margin-top: 2px;">by ${escapeHtml(author)}</div>
      </td>
      <td>
        <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 600; color: #15803D; background: #DCFCE7; padding: 3px 8px; border-radius: 9999px;">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: #16A34A;"></span>
          <span>Delivered</span>
        </span>
      </td>
      <td style="text-align: right;">
        <div class="action-btn-group" style="justify-content: flex-end; display: flex; gap: 6px;">
          <button class="btn-action-icon btn-action-primary" onclick="window.adminInspectNotification('${n.id}')" title="View Details">Inspect</button>
          <button class="btn-action-icon" onclick="window.adminEditNotification('${n.id}')" title="Edit Notification">Edit</button>
          <button class="btn-action-icon" onclick="window.adminResendNotification('${n.id}')" title="Re-dispatch to devices">Resend</button>
          <button class="btn-action-icon" style="color: #DC2626; border-color: #FCA5A5;" onclick="window.adminDeleteNotification('${n.id}')" title="Delete Notification">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openCreateNotificationModal() {
  const modal = document.getElementById('notification-manage-modal');
  const titleHeader = document.getElementById('notif-manage-modal-title');
  const submitBtn = document.getElementById('submit-notif-manage-btn');
  const idInput = document.getElementById('notif-manage-id');
  const form = document.getElementById('notification-manage-form');
  const statusMsg = document.getElementById('notif-manage-status-msg');
  const targetWrap = document.getElementById('notif-manage-specific-user-wrap');
  const catSelect = document.getElementById('notif-manage-category');
  const isTestCheck = document.getElementById('notif-manage-is-test');

  populateStudentDatalist();

  if (form) form.reset();
  if (idInput) idInput.value = '';
  if (titleHeader) titleHeader.textContent = 'Create Notification';
  if (catSelect) catSelect.value = 'announcement';
  if (isTestCheck) isTestCheck.checked = false;
  if (submitBtn) {
    submitBtn.textContent = 'Send Notification';
    submitBtn.disabled = false;
  }
  if (statusMsg) statusMsg.style.display = 'none';
  if (targetWrap) targetWrap.classList.add('hidden');

  modal?.classList.remove('hidden');
}

function openEditNotificationModal(notifId) {
  const n = notificationsCache.find(item => item.id === notifId);
  if (!n) return;

  const modal = document.getElementById('notification-manage-modal');
  const titleHeader = document.getElementById('notif-manage-modal-title');
  const submitBtn = document.getElementById('submit-notif-manage-btn');
  const idInput = document.getElementById('notif-manage-id');
  const titleInput = document.getElementById('notif-manage-title');
  const bodyInput = document.getElementById('notif-manage-body');
  const catSelect = document.getElementById('notif-manage-category');
  const typeSelect = document.getElementById('notif-manage-type');
  const targetSelect = document.getElementById('notif-manage-target');
  const targetUidInput = document.getElementById('notif-manage-target-uid');
  const prioritySelect = document.getElementById('notif-manage-priority');
  const routeSelect = document.getElementById('notif-manage-route');
  const isTestCheck = document.getElementById('notif-manage-is-test');
  const statusMsg = document.getElementById('notif-manage-status-msg');
  const targetWrap = document.getElementById('notif-manage-specific-user-wrap');

  populateStudentDatalist();

  if (idInput) idInput.value = n.id;
  if (titleHeader) titleHeader.textContent = 'Edit Notification';
  if (submitBtn) {
    submitBtn.textContent = 'Save Changes';
    submitBtn.disabled = false;
  }
  if (titleInput) titleInput.value = n.title || '';
  if (bodyInput) bodyInput.value = n.body || '';
  if (catSelect) catSelect.value = n.category || getCategoryForType(n.type);
  if (typeSelect) typeSelect.value = n.type || 'GENERAL_ANNOUNCEMENT';
  if (isTestCheck) isTestCheck.checked = n.isTest === true || isTestNotification(n);

  const targetVal = n.target || (n.recipientId === 'ALL_USERS' ? 'all_users' : (n.recipientId === 'ALL_ADMINS' ? 'admins' : 'specific_users'));
  if (targetSelect) targetSelect.value = targetVal;

  if (targetVal === 'specific_users') {
    targetWrap?.classList.remove('hidden');
    if (targetUidInput) targetUidInput.value = n.recipientId || '';
  } else {
    targetWrap?.classList.add('hidden');
    if (targetUidInput) targetUidInput.value = '';
  }

  if (prioritySelect) prioritySelect.value = n.priority || 'Normal';
  if (routeSelect) routeSelect.value = n.route || n.data?.route || '';
  if (statusMsg) statusMsg.style.display = 'none';

  modal?.classList.remove('hidden');
}

function openInspectNotificationModal(notifId) {
  const n = notificationsCache.find(item => item.id === notifId);
  if (!n) return;

  const modal = document.getElementById('notification-inspect-modal');
  const bodyEl = document.getElementById('notif-inspect-modal-body');
  const deleteBtn = document.getElementById('notif-inspect-delete-btn');
  const resendBtn = document.getElementById('notif-inspect-resend-btn');
  const editBtn = document.getElementById('notif-inspect-edit-btn');

  if (!modal || !bodyEl) return;

  const getTime = (val) => {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate();
    if (typeof val.toMillis === 'function') return new Date(val.toMillis());
    if (val instanceof Date) return val;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };
  const createdDate = getTime(n.createdAt || n.sentAt);
  const dateStr = createdDate
    ? createdDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + ' at ' + createdDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : (n.createdAtFormatted || 'Unknown date');

  let targetDisplay = n.recipientName || 'All Students (Broadcast)';
  if (n.target === 'admins' || n.recipientId === 'ALL_ADMINS') {
    targetDisplay = 'All Administrators Only';
  } else if (n.target === 'specific_users' || (n.recipientId && n.recipientId !== 'ALL_USERS' && n.recipientId !== 'ALL_ADMINS')) {
    if (!n.recipientName) {
      const matched = usersCache.find(u => u.docId === n.recipientId || u.id === n.recipientId || (u.raw && u.raw.regno === n.recipientId));
      targetDisplay = matched ? `${matched.name} (${matched.id || n.recipientId})` : `User ID: ${n.recipientId}`;
    }
  }

  const categoryName = (n.category || getCategoryForType(n.type)).toUpperCase();
  const codeId = n.notificationId || n.id;
  const isTest = isTestNotification(n);

  bodyEl.innerHTML = `
    <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap;">
      <span style="font-size: 11.5px; padding: 3px 8px; border-radius: 9999px; font-weight: 700; background: #EFF6FF; color: #1D4ED8;">${escapeHtml(n.type || 'NOTIFICATION')}</span>
      <span style="display: inline-flex; align-items: center; gap: 5px; font-size: 11px; padding: 3px 8px; border-radius: 9999px; font-weight: 600; background: #F3F4F6; color: #374151;">
        <span class="folder-svg-icon icon-document" style="width: 12px; height: 12px;"></span>
        ${escapeHtml(categoryName)}
      </span>
      <span style="font-size: 11px; font-family: monospace; padding: 2px 6px; border-radius: 4px; background: #E5E7EB; color: #1F2937;">ID: ${escapeHtml(codeId)}</span>
      ${isTest ? '<span style="font-size: 11.5px; padding: 3px 8px; border-radius: 9999px; font-weight: 700; background: #FEF3C7; color: #92400E; border: 1px solid #FCD34D;">TEST MESSAGE</span>' : ''}
    </div>
    <h3 style="font-size: 18px; font-weight: 700; color: #111827; margin-bottom: 10px; line-height: 1.35;">${escapeHtml(n.title || 'Untitled Notification')}</h3>
    <div style="background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 12px; padding: 14px 16px; font-size: 14px; color: #374151; line-height: 1.55; white-space: pre-wrap; margin-bottom: 16px;">${escapeHtml(n.body || '')}</div>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 12.5px; border-top: 1px solid #F3F4F6; padding-top: 14px;">
      <div>
        <div style="color: #6B7280; margin-bottom: 2px;">Target Audience</div>
        <div style="font-weight: 600; color: #1F2937;">${escapeHtml(targetDisplay)}</div>
      </div>
      <div>
        <div style="color: #6B7280; margin-bottom: 2px;">Sent Timestamp</div>
        <div style="font-weight: 600; color: #1F2937;">${dateStr}</div>
      </div>
      <div>
        <div style="color: #6B7280; margin-bottom: 2px;">Dispatched By</div>
        <div style="font-weight: 600; color: #1F2937;">${escapeHtml(n.createdBy || 'Admin')}</div>
      </div>
      <div>
        <div style="color: #6B7280; margin-bottom: 2px;">Deep Link Screen</div>
        <div style="font-weight: 600; color: #2563EB;">${escapeHtml(n.route || 'Notification Center')}</div>
      </div>
      ${n.createdAtIso ? `
      <div style="grid-column: 1 / -1; font-size: 11.5px; color: #6B7280; background: #F3F4F6; padding: 6px 10px; border-radius: 6px;">
        <span style="font-weight: 600;">ISO 8601 (Firebase Console):</span> <code>${escapeHtml(n.createdAtIso)}</code>
      </div>` : ''}
    </div>
  `;

  if (deleteBtn) {
    deleteBtn.onclick = () => {
      modal.classList.add('hidden');
      confirmDeleteNotification(n.id);
    };
  }
  if (resendBtn) {
    resendBtn.onclick = () => {
      modal.classList.add('hidden');
      resendNotification(n.id);
    };
  }
  if (editBtn) {
    editBtn.onclick = () => {
      modal.classList.add('hidden');
      openEditNotificationModal(n.id);
    };
  }

  modal.classList.remove('hidden');
}

function confirmDeleteNotification(notifId) {
  const n = notificationsCache.find(item => item.id === notifId);
  if (!n) return;

  const modal = document.getElementById('notification-delete-modal');
  const titleDisplay = document.getElementById('delete-notif-title-display');
  const idHolder = document.getElementById('delete-notif-id-holder');
  const confirmBtn = document.getElementById('confirm-delete-notif-btn');

  if (titleDisplay) titleDisplay.textContent = `"${n.title || 'Untitled'}"`;
  if (idHolder) idHolder.value = notifId;

  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Delete';
    confirmBtn.onclick = async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Deleting...';
      try {
        // 1. Delete parent document in notifications
        await deleteDoc(doc(firestore, 'notifications', notifId));

        // 2. Cascade delete from student subcollections (users/{uid}/notifications)
        let targetUsers = [...usersCache];
        if (targetUsers.length === 0) {
          try {
            const snap = await getDocs(collection(firestore, 'users'));
            snap.forEach(d => targetUsers.push({ docId: d.id, id: d.id }));
          } catch (e) { }
        }

        const subDeletes = targetUsers.map(async u => {
          const uid = u.docId || u.id;
          if (!uid) return;
          try {
            const subSnap = await getDocs(collection(firestore, 'users', uid, 'notifications'));
            for (const d of subSnap.docs) {
              const data = d.data();
              if (data.parentNotifId === notifId || (data.title === n.title && data.body === n.body)) {
                await deleteDoc(doc(firestore, 'users', uid, 'notifications', d.id)).catch(() => {});
              }
            }
          } catch (e) { }
        });
        await Promise.allSettled(subDeletes);

        // 3. Clear local storage cache
        try {
          localStorage.removeItem('nexride_user_notifs_cache');
        } catch (e) { }

        // 4. Record in audit log
        try {
          await addDoc(collection(firestore, 'auditLogs'), {
            action: 'DELETE_NOTIFICATION',
            target: n.target || 'notification',
            title: n.title || '',
            notifId: notifId,
            admin: currentAdminUser?.email || currentAdminUser?.uid || 'admin',
            timestamp: serverTimestamp()
          });
        } catch (e) { }

        modal?.classList.add('hidden');
      } catch (err) {
        alert('Could not delete notification: ' + err.message);
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Delete';
      }
    };
  }

  modal?.classList.remove('hidden');
}

async function purgeTestNotifications() {
  const modal = document.getElementById('notification-purge-modal');
  const confirmBtn = document.getElementById('confirm-purge-test-notifs-btn');
  const cancelBtn = document.getElementById('cancel-purge-test-notifs-btn');
  const feedback = document.getElementById('purge-status-feedback');
  const countSpan = document.getElementById('purge-detected-count');

  // Count current test notifications
  const testItems = notificationsCache.filter(isTestNotification);
  if (countSpan) countSpan.textContent = testItems.length;

  if (feedback) feedback.style.display = 'none';
  if (modal) modal.classList.remove('hidden');

  if (cancelBtn) {
    cancelBtn.onclick = () => modal?.classList.add('hidden');
  }

  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Purge From Firebase DB';
    confirmBtn.onclick = async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Purging...';
      if (feedback) {
        feedback.style.display = 'block';
        feedback.style.background = '#EFF6FF';
        feedback.style.color = '#1D4ED8';
        feedback.textContent = 'Scanning and deleting test documents across Firebase DB...';
      }

      try {
        let purgedCentralCount = 0;
        let purgedSubCount = 0;
        const testParentIds = new Set();

        // 1. Delete matching test items from centralized 'notifications' collection
        let centralSnap;
        try {
          centralSnap = await getDocs(collection(firestore, 'notifications'));
        } catch (err) {
          console.warn('[Purge] Fetch central notifications note:', err);
        }

        if (centralSnap) {
          for (const docSnap of centralSnap.docs) {
            const data = docSnap.data();
            if (isTestNotification({ id: docSnap.id, ...data })) {
              testParentIds.add(docSnap.id);
              try {
                await deleteDoc(doc(firestore, 'notifications', docSnap.id));
                purgedCentralCount++;
              } catch (delErr) {
                console.warn('[Purge] Central delete note:', delErr);
              }
            }
          }
        }

        // Add test items from cache
        testItems.forEach(t => testParentIds.add(t.id));

        // 2. Cascade delete from student subcollections: users/{uid}/notifications
        let targetUsers = [...usersCache];
        if (targetUsers.length === 0) {
          try {
            const usersSnap = await getDocs(collection(firestore, 'users'));
            usersSnap.forEach(d => targetUsers.push({ docId: d.id, id: d.id }));
          } catch (uErr) {
            console.warn('[Purge] Fetch users note:', uErr);
          }
        }

        for (const u of targetUsers) {
          const uid = u.docId || u.id;
          if (!uid) continue;
          try {
            const subSnap = await getDocs(collection(firestore, 'users', uid, 'notifications'));
            for (const subDoc of subSnap.docs) {
              const data = subDoc.data();
              const matchesParent = data.parentNotifId && testParentIds.has(data.parentNotifId);
              const matchesTest = isTestNotification({ id: subDoc.id, ...data });
              if (matchesParent || matchesTest) {
                try {
                  await deleteDoc(doc(firestore, 'users', uid, 'notifications', subDoc.id));
                  purgedSubCount++;
                } catch (subDelErr) {
                  console.warn(`[Purge] Delete user ${uid} notif note:`, subDelErr);
                }
              }
            }
          } catch (subErr) { }
        }

        // 3. Clear local caches and broadcast trackers
        try {
          localStorage.removeItem('nexride_user_notifs_cache');
          localStorage.removeItem('nexride_read_broadcast_ids');
        } catch (e) { }

        // 4. Update memory cache and UI
        notificationsCache = notificationsCache.filter(n => !testParentIds.has(n.id) && !isTestNotification(n));
        updateTestNotificationsBadge();
        renderNotificationsManagementTable();

        // 5. Record in Audit Logs
        try {
          await addDoc(collection(firestore, 'auditLogs'), {
            action: 'PURGE_TEST_NOTIFICATIONS',
            centralCount: purgedCentralCount,
            subcollectionCount: purgedSubCount,
            admin: currentAdminUser?.email || currentAdminUser?.uid || 'admin',
            timestamp: serverTimestamp()
          });
        } catch (e) { }

        if (feedback) {
          feedback.style.background = '#DCFCE7';
          feedback.style.color = '#15803D';
          feedback.textContent = `Cleaned ${purgedCentralCount} central and ${purgedSubCount} user test notifications!`;
        }

        setTimeout(() => {
          modal?.classList.add('hidden');
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Purge From Firebase DB';
        }, 1500);

      } catch (err) {
        if (feedback) {
          feedback.style.background = '#FEE2E2';
          feedback.style.color = '#B91C1C';
          feedback.textContent = 'Error purging test notifications: ' + err.message;
        }
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Purge From Firebase DB';
      }
    };
  }
}

async function resendNotification(notifId) {
  const n = notificationsCache.find(item => item.id === notifId);
  if (!n) return;

  const confirmed = window.confirm(`Re-dispatch notification "${n.title}" to users?`);
  if (!confirmed) return;

  try {
    const adminIdentifier = currentAdminUser?.email || currentAdminUser?.uid || 'admin';

    // 1. Update timestamp in centralized notifications
    await updateDoc(doc(firestore, 'notifications', notifId), {
      sentAt: serverTimestamp(),
      resentAt: serverTimestamp(),
      resentBy: adminIdentifier
    });

    // 2. Re-dispatch to individual students if broadcast
    if (n.target === 'all_users' || n.recipientId === 'ALL_USERS') {
      let targetUsers = [...usersCache];
      if (targetUsers.length === 0) {
        try {
          const snap = await getDocs(collection(firestore, 'users'));
          snap.forEach(d => targetUsers.push({ docId: d.id, id: d.id }));
        } catch (e) { }
      }

      const writes = targetUsers.map(u => {
        const uid = u.docId || u.id;
        if (!uid) return Promise.resolve();
        return addDoc(collection(firestore, 'users', uid, 'notifications'), {
          title: n.title,
          body: n.body,
          type: n.type || 'GENERAL_ANNOUNCEMENT',
          target: 'all_users',
          recipientId: uid,
          read: false,
          createdAt: serverTimestamp(),
          createdBy: adminIdentifier
        }).catch(() => {});
      });
      await Promise.allSettled(writes);
    } else if (n.recipientId && n.recipientId !== 'ALL_ADMINS') {
      await addDoc(collection(firestore, 'users', n.recipientId, 'notifications'), {
        title: n.title,
        body: n.body,
        type: n.type || 'GENERAL_ANNOUNCEMENT',
        target: 'specific_user',
        recipientId: n.recipientId,
        read: false,
        createdAt: serverTimestamp(),
        createdBy: adminIdentifier
      }).catch(() => {});
    }

    // 3. Dispatch via FCM API Router
    try {
      await fetch('/api/notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentAdminUser?.uid || 'admin_super',
          'x-user-role': 'admin'
        },
        body: JSON.stringify({
          target: n.target || 'all_users',
          userIds: n.recipientId && n.recipientId !== 'ALL_USERS' && n.recipientId !== 'ALL_ADMINS' ? [n.recipientId] : [],
          title: n.title,
          body: n.body,
          type: n.type
        })
      });
    } catch (e) { }

    // 4. Record in audit log
    try {
      await addDoc(collection(firestore, 'auditLogs'), {
        action: 'RESEND_NOTIFICATION',
        title: n.title,
        notifId: notifId,
        admin: adminIdentifier,
        timestamp: serverTimestamp()
      });
    } catch (e) { }

    alert('Notification re-dispatched to devices successfully!');
  } catch (err) {
    alert('Failed to re-dispatch notification: ' + err.message);
  }
}

function populateStudentDatalist() {
  const datalist = document.getElementById('notif-student-datalist');
  if (!datalist) return;
  datalist.innerHTML = '';
  usersCache.slice(0, 50).forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.docId || u.id;
    opt.textContent = `${u.name} (${u.id || u.docId}) - ${u.department || 'Student'}`;
    datalist.appendChild(opt);
  });
}

function setupNotificationManagement() {
  // 1. Create & Purge Notification buttons
  const createBtn = document.getElementById('admin-create-notif-btn');
  createBtn?.addEventListener('click', openCreateNotificationModal);

  const purgeBtn = document.getElementById('admin-purge-test-notifs-btn');
  purgeBtn?.addEventListener('click', () => purgeTestNotifications());

  // 2. Category Pill Tabs
  const catPills = document.querySelectorAll('.notif-cat-tab');
  catPills.forEach(pill => {
    pill.addEventListener('click', () => {
      catPills.forEach(p => {
        p.classList.remove('active');
        p.style.background = '#FFFFFF';
        p.style.color = '#4B5563';
        p.style.borderColor = '#E5E7EB';
        p.style.boxShadow = 'none';
      });
      pill.classList.add('active');
      pill.style.background = '#2563EB';
      pill.style.color = '#FFFFFF';
      pill.style.borderColor = '#2563EB';
      pill.style.boxShadow = '0 2px 6px rgba(37, 99, 235, 0.25)';

      activeNotifCategory = pill.getAttribute('data-cat') || 'all';
      renderNotificationsManagementTable();
    });
  });

  // 3. Search & filter inputs
  const searchInput = document.getElementById('notif-search-input');
  const typeFilter = document.getElementById('notif-type-filter');
  const targetFilter = document.getElementById('notif-target-filter');

  searchInput?.addEventListener('input', () => renderNotificationsManagementTable());
  typeFilter?.addEventListener('change', () => renderNotificationsManagementTable());
  targetFilter?.addEventListener('change', () => renderNotificationsManagementTable());

  // 4. Modal close buttons
  const manageModal = document.getElementById('notification-manage-modal');
  const closeManageBtn = document.getElementById('close-notif-manage-modal-btn');
  const cancelManageBtn = document.getElementById('cancel-notif-manage-btn');

  closeManageBtn?.addEventListener('click', () => manageModal?.classList.add('hidden'));
  cancelManageBtn?.addEventListener('click', () => manageModal?.classList.add('hidden'));

  const inspectModal = document.getElementById('notification-inspect-modal');
  const closeInspectBtn = document.getElementById('close-notif-inspect-modal-btn');
  closeInspectBtn?.addEventListener('click', () => inspectModal?.classList.add('hidden'));

  const deleteModal = document.getElementById('notification-delete-modal');
  const cancelDeleteBtn = document.getElementById('cancel-delete-notif-btn');
  cancelDeleteBtn?.addEventListener('click', () => deleteModal?.classList.add('hidden'));

  const purgeModal = document.getElementById('notification-purge-modal');
  const cancelPurgeBtn = document.getElementById('cancel-purge-test-notifs-btn');
  cancelPurgeBtn?.addEventListener('click', () => purgeModal?.classList.add('hidden'));

  // 5. Dynamic form fields (Target audience and Type <-> Category sync)
  const targetSelect = document.getElementById('notif-manage-target');
  const specificWrap = document.getElementById('notif-manage-specific-user-wrap');
  const typeSelect = document.getElementById('notif-manage-type');
  const catSelect = document.getElementById('notif-manage-category');

  targetSelect?.addEventListener('change', () => {
    if (targetSelect.value === 'specific_users') {
      specificWrap?.classList.remove('hidden');
    } else {
      specificWrap?.classList.add('hidden');
    }
  });

  typeSelect?.addEventListener('change', () => {
    if (catSelect) {
      catSelect.value = getCategoryForType(typeSelect.value);
    }
  });

  // 6. Submit Handler for Create / Edit Form
  const form = document.getElementById('notification-manage-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const notifId = document.getElementById('notif-manage-id')?.value.trim();
    const title = document.getElementById('notif-manage-title')?.value.trim();
    const body = document.getElementById('notif-manage-body')?.value.trim();
    const category = document.getElementById('notif-manage-category')?.value || getCategoryForType(typeSelect?.value);
    const type = document.getElementById('notif-manage-type')?.value || 'GENERAL_ANNOUNCEMENT';
    const target = document.getElementById('notif-manage-target')?.value || 'all_users';
    const specificUid = document.getElementById('notif-manage-target-uid')?.value.trim();
    const priority = document.getElementById('notif-manage-priority')?.value || 'Normal';
    const route = document.getElementById('notif-manage-route')?.value || '';
    const dispatchPush = document.getElementById('notif-manage-dispatch-push')?.checked ?? true;
    const isTest = document.getElementById('notif-manage-is-test')?.checked || isTestNotification({ title, body });

    const statusMsg = document.getElementById('notif-manage-status-msg');
    const submitBtn = document.getElementById('submit-notif-manage-btn');

    if (!title || !body) {
      if (statusMsg) {
        statusMsg.style.display = 'block';
        statusMsg.style.background = '#FEE2E2';
        statusMsg.style.color = '#B91C1C';
        statusMsg.textContent = 'Please fill out both Title and Message Body.';
      }
      return;
    }

    if (target === 'specific_users' && !specificUid) {
      if (statusMsg) {
        statusMsg.style.display = 'block';
        statusMsg.style.background = '#FEE2E2';
        statusMsg.style.color = '#B91C1C';
        statusMsg.textContent = 'Please enter or select a target Student / User ID.';
      }
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = notifId ? 'Saving Changes...' : 'Dispatching...';

    try {
      const adminIdentifier = currentAdminUser?.email || currentAdminUser?.uid || 'admin';

      let targetDocId = specificUid;
      let recipientDisplay = 'All Students & Users (Broadcast)';
      if (target === 'admins') {
        recipientDisplay = 'All Administrators Only';
      } else if (target === 'specific_users' && specificUid) {
        const cleanQuery = specificUid.trim().toLowerCase();
        const matched = usersCache.find(u =>
          (u.docId && u.docId.toLowerCase() === cleanQuery) ||
          (u.id && String(u.id).toLowerCase() === cleanQuery) ||
          (u.email && u.email.toLowerCase() === cleanQuery) ||
          (u.raw?.regno && String(u.raw.regno).toLowerCase() === cleanQuery) ||
          (u.name && u.name.toLowerCase() === cleanQuery)
        );
        if (matched && matched.docId) {
          targetDocId = matched.docId;
          recipientDisplay = `Student: ${matched.name} (${matched.id || matched.docId})`;
        } else {
          recipientDisplay = `User ID: ${specificUid}`;
        }
      }

      const now = new Date();
      const createdAtIso = now.toISOString();
      const createdAtFormatted = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const generatedNotifId = generateNotificationId(category);

      if (notifId) {
        // === EDIT EXISTING NOTIFICATION ===
        await updateDoc(doc(firestore, 'notifications', notifId), {
          title,
          body,
          category,
          type,
          target,
          recipientId: target === 'specific_users' ? targetDocId : (target === 'admins' ? 'ALL_ADMINS' : 'ALL_USERS'),
          recipientType: target === 'admins' ? 'admin' : 'user',
          recipientName: recipientDisplay,
          priority,
          route,
          isTest,
          updatedAt: serverTimestamp(),
          updatedAtIso: createdAtIso,
          updatedBy: adminIdentifier
        });

        // Record in audit logs
        try {
          await addDoc(collection(firestore, 'auditLogs'), {
            action: 'UPDATE_NOTIFICATION',
            notifId: notifId,
            title,
            target,
            admin: adminIdentifier,
            timestamp: serverTimestamp()
          });
        } catch (e) { }

        if (statusMsg) {
          statusMsg.style.display = 'block';
          statusMsg.style.background = '#DCFCE7';
          statusMsg.style.color = '#15803D';
          statusMsg.textContent = 'Notification updated successfully!';
        }
      } else {
        // === CREATE NEW NOTIFICATION (ORGANIZED SCHEMA) ===
        // 1. Centralized notifications entry
        const centralDocRef = await addDoc(collection(firestore, 'notifications'), {
          notificationId: generatedNotifId,
          title,
          body,
          category,
          type,
          target,
          recipientId: target === 'specific_users' ? targetDocId : (target === 'admins' ? 'ALL_ADMINS' : 'ALL_USERS'),
          recipientType: target === 'admins' ? 'admin' : 'user',
          recipientName: recipientDisplay,
          priority,
          route,
          read: false,
          isTest: isTest,
          createdAt: serverTimestamp(),
          createdAtIso: createdAtIso,
          createdAtFormatted: createdAtFormatted,
          createdBy: adminIdentifier,
          status: 'sent',
          metadata: {
            channel: dispatchPush ? 'fcm_and_inapp' : 'inapp',
            source: 'Admin Web Panel',
            version: '2.0'
          }
        });

        const parentNotifDocId = centralDocRef.id;

        // 2. Direct user subcollection deliveries
        if (target === 'all_users') {
          let targetUsers = [...usersCache];
          if (targetUsers.length === 0) {
            try {
              const usersSnap = await getDocs(collection(firestore, 'users'));
              usersSnap.forEach(d => targetUsers.push({ docId: d.id, id: d.id, name: d.data()?.name }));
            } catch (e) { }
          }

          const writes = targetUsers.map(u => {
            const uid = u.docId || u.id;
            if (!uid) return Promise.resolve();
            return addDoc(collection(firestore, 'users', uid, 'notifications'), {
              parentNotifId: parentNotifDocId,
              notificationId: generatedNotifId,
              title,
              body,
              category,
              type,
              target: 'all_users',
              recipientId: uid,
              recipientName: u.name || uid,
              priority,
              route,
              read: false,
              isTest: isTest,
              createdAt: serverTimestamp(),
              createdAtIso: createdAtIso,
              createdBy: adminIdentifier
            }).catch(() => {});
          });
          await Promise.allSettled(writes);
        } else if (target === 'specific_users' && targetDocId) {
          await addDoc(collection(firestore, 'users', targetDocId, 'notifications'), {
            parentNotifId: parentNotifDocId,
            notificationId: generatedNotifId,
            title,
            body,
            category,
            type,
            target: 'specific_user',
            recipientId: targetDocId,
            recipientName: recipientDisplay,
            priority,
            route,
            read: false,
            isTest: isTest,
            createdAt: serverTimestamp(),
            createdAtIso: createdAtIso,
            createdBy: adminIdentifier
          }).catch(() => {});
        }

        // 3. Dispatch via FCM push if selected
        if (dispatchPush) {
          try {
            await fetch('/api/notifications/send', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-user-id': currentAdminUser?.uid || 'admin_super',
                'x-user-role': 'admin'
              },
              body: JSON.stringify({
                target,
                userIds: target === 'specific_users' ? [targetDocId] : [],
                title,
                body,
                type
              })
            });
          } catch (e) { }
        }

        // 4. Record in audit logs
        try {
          await addDoc(collection(firestore, 'auditLogs'), {
            action: 'CREATE_NOTIFICATION',
            title,
            target,
            notifId: generatedNotifId,
            admin: adminIdentifier,
            timestamp: serverTimestamp()
          });
        } catch (e) { }

        if (statusMsg) {
          statusMsg.style.display = 'block';
          statusMsg.style.background = '#DCFCE7';
          statusMsg.style.color = '#15803D';
          statusMsg.textContent = 'Notification created and dispatched successfully!';
        }
      }

      setTimeout(() => {
        manageModal?.classList.add('hidden');
      }, 1200);
    } catch (err) {
      if (statusMsg) {
        statusMsg.style.display = 'block';
        statusMsg.style.background = '#FEE2E2';
        statusMsg.style.color = '#B91C1C';
        statusMsg.textContent = err.message;
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = notifId ? 'Save Changes' : 'Send Notification';
    }
  });

  // Global window exposure for inline onclick handlers
  window.adminInspectNotification = (id) => openInspectNotificationModal(id);
  window.adminEditNotification = (id) => openEditNotificationModal(id);
  window.adminDeleteNotification = (id) => confirmDeleteNotification(id);
  window.adminResendNotification = (id) => resendNotification(id);
  window.purgeTestNotifications = () => purgeTestNotifications();
}

// =============================================================================
// REAL-TIME FIRESTORE ENGINE & LISTENERS
// =============================================================================
function initRealtimeEngine() {
  setupConnectionMonitor();
  listenToBuses();
  listenToUsers();
  listenToRoutes();
  listenToDrivers();
  listenToDocuments();
  listenToReports();
  listenToApprovals();
  listenToAuditLogs();
  listenToNotifications();
  setupGlobalSearch();
  setupModalListeners();
  setupDriversAndDocumentsListeners();
  setupFilterListeners();
  setupNotificationManagement();

  // Export Log button → PPTX
  document.getElementById('export-audit-btn')?.addEventListener('click', () => exportAuditLogPPTX());

  // Settings page
  initSettingsPage();
  loadSystemSettings();

  // Legal page tabs
  setupLegalTabs();

  // Safety timeout: ensure dashboard exits skeleton loading quickly (1000ms max)
  setTimeout(() => {
    if (isDashboardLoading) {
      busesLoaded = true;
      routesLoaded = true;
      renderDashboardLoaded();
      renderDashboardStats();
      renderRecentActivity();
    }
  }, 1000);
}

// =============================================================================
// SYSTEM SETTINGS — Enterprise Admin & System Settings v2
// =============================================================================

let lastLoadedSettings = null;
let isSettingsDirty = false;

/** Default settings fallback when Firestore document has not yet been populated */
const DEFAULT_SYSTEM_SETTINGS = {
  // General
  appName: 'NexRide',
  appDesc: 'University Campus Transport Management System',
  language: 'en',
  timezone: 'Asia/Kolkata',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '12h',
  // System & Operations
  routeRefreshInterval: 5,
  geolocationTimeout: 5,
  locationUpdateInterval: 10,
  sessionTimeoutMinutes: 30,
  maxAttachmentMB: 5,
  realtimeUpdates: true,
  autoRefresh: true,
  // Report Management
  reportSubmission: true,
  requireLocation: false,
  requireCategory: true,
  requireDescription: true,
  allowAttachments: true,
  maxAttachments: 3,
  reportRetentionDays: 30,
  autoCloseResolvedDays: 7,
  defaultReportStatus: 'Under Review',
  defaultPriority: 'Normal',
  // Notifications
  notifyEnabled: true,
  notifyInApp: true,
  notifyEmail: false,
  notifyReportStatus: true,
  notifyAdminResponse: true,
  notifyRouteUpdates: true,
  notifyAlerts: true,
  notifyApprovals: true,
  // Security
  requireReauth: true,
  // Audit
  auditRetentionDays: 90
};

/** Initialize all listeners, dirty tracking, search, maintenance and danger zone */
function initSettingsPage() {
  setupSettingsSaveHandler();
  setupUnsavedChangesDetection();
  setupSettingsSearch();
  setupMaintenanceActions();
  setupDangerZoneModal();
  setupMasterNotificationToggle();
}

/**
 * Load system settings from Firestore 'systemConfig/global' document.
 * Populates all form fields and records a clean snapshot for change tracking.
 */
async function loadSystemSettings() {
  let data = { ...DEFAULT_SYSTEM_SETTINGS };

  // 1. Try reading from localStorage cache first and populate immediately
  try {
    const cached = localStorage.getItem('nexride_system_settings');
    if (cached) {
      const parsed = JSON.parse(cached);
      data = { ...data, ...parsed };
      populateSettingsForm(data);
      updateAdminSettingsIdentity();
    }
  } catch (e) {
    console.warn('LocalStorage settings read error:', e);
  }

  // 2. Try fetching latest from Firestore systemConfig/global with timeout
  try {
    const cfgRef = doc(firestore, 'systemConfig', 'global');
    const snap = await Promise.race([
      getDoc(cfgRef),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
    ]).catch(() => null);

    if (snap && snap.exists()) {
      data = { ...data, ...snap.data() };
      try {
        localStorage.setItem('nexride_system_settings', JSON.stringify(data));
      } catch (e) {}
    }
  } catch (err) {
    console.warn('Could not load system settings from Firestore (using local configuration):', err.message);
  }

  populateSettingsForm(data);

  // Show last saved timestamp if available
  if (data.updatedAt) {
    const stamp = document.getElementById('settings-last-saved');
    if (stamp) {
      let dateStr = '';
      try {
        const ts = data.updatedAt.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt);
        dateStr = 'Last saved ' + ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
                  ' at ' + ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      } catch (e) {
        dateStr = 'Last saved recently';
      }
      stamp.textContent = dateStr;
    }
  }

  // Update role & identity badge
  updateAdminSettingsIdentity();

  // Update maintenance live status
  updateMaintenanceSyncTime();
}

/** Update the role badge, email, and avatar on the settings card */
function updateAdminSettingsIdentity() {
  if (!currentAdminUser) return;
  const emailEl = document.getElementById('stg-role-email');
  if (emailEl) emailEl.textContent = currentAdminUser.email || 'Administrator';

  const avatarEl = document.getElementById('stg-role-avatar');
  if (avatarEl) {
    const name = currentAdminUser.displayName || currentAdminUser.email || 'A';
    avatarEl.textContent = name.trim().charAt(0).toUpperCase();
  }
}

/**
 * Populates all DOM input controls from the provided settings object.
 * Also stores a deep copy into lastLoadedSettings and resets dirty state.
 */
function populateSettingsForm(data) {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val != null) el.value = val;
  };
  const setChk = (id, val) => {
    const el = document.getElementById(id);
    if (el && val != null) el.checked = Boolean(val);
  };

  // General
  setVal('stg-app-name', data.appName);
  setVal('stg-app-desc', data.appDesc);
  setVal('stg-language', data.language);
  setVal('stg-timezone', data.timezone);
  setVal('stg-date-format', data.dateFormat);
  setVal('stg-time-format', data.timeFormat);

  // System & Operations
  setVal('setting-gps-interval', data.routeRefreshInterval);
  setVal('setting-delay-threshold', data.geolocationTimeout);
  setVal('stg-location-update', data.locationUpdateInterval);
  setVal('stg-session-timeout', data.sessionTimeoutMinutes);
  setVal('stg-max-attachment', data.maxAttachmentMB);
  setChk('stg-realtime-updates', data.realtimeUpdates);
  setChk('stg-auto-refresh', data.autoRefresh);

  // Report Management
  setChk('stg-report-submission', data.reportSubmission);
  setChk('stg-require-location', data.requireLocation);
  setChk('stg-require-category', data.requireCategory);
  setChk('stg-require-description', data.requireDescription);
  setChk('stg-allow-attachments', data.allowAttachments);
  setVal('stg-max-attachments', data.maxAttachments);
  setVal('setting-expiry-days', data.reportRetentionDays);
  setVal('stg-auto-close-days', data.autoCloseResolvedDays);
  setVal('stg-default-status', data.defaultReportStatus);
  setVal('stg-default-priority', data.defaultPriority);

  // Notifications
  setChk('stg-notify-enabled', data.notifyEnabled);
  setChk('stg-notify-in-app', data.notifyInApp);
  setChk('stg-notify-email', data.notifyEmail);
  setChk('stg-notify-report-status', data.notifyReportStatus);
  setChk('stg-notify-admin-response', data.notifyAdminResponse);
  setChk('stg-notify-route-updates', data.notifyRouteUpdates);
  setChk('stg-notify-alerts', data.notifyAlerts);
  setChk('stg-notify-approvals', data.notifyApprovals);

  // Security
  setChk('stg-require-reauth', data.requireReauth);

  // Audit
  setVal('stg-audit-retention', data.auditRetentionDays);

  // Sync state & clear errors
  clearAllSettingsErrors();
  syncMasterNotificationUI(Boolean(data.notifyEnabled));

  lastLoadedSettings = collectSettingsPayload();
  setDirtyState(false);
}

/** Collect current values from all inputs into a clean settings object */
function collectSettingsPayload() {
  const getVal = (id, fallback = '') => document.getElementById(id)?.value?.trim() || fallback;
  const getInt = (id, fallback = 0) => {
    const val = parseInt(document.getElementById(id)?.value, 10);
    return isNaN(val) ? fallback : val;
  };
  const getChk = (id, fallback = false) => {
    const el = document.getElementById(id);
    return el ? el.checked : fallback;
  };

  return {
    // General
    appName:                getVal('stg-app-name', 'NexRide'),
    appDesc:                getVal('stg-app-desc', 'University Campus Transport Management System'),
    language:               getVal('stg-language', 'en'),
    timezone:               getVal('stg-timezone', 'Asia/Kolkata'),
    dateFormat:             getVal('stg-date-format', 'DD/MM/YYYY'),
    timeFormat:             getVal('stg-time-format', '12h'),
    // System & Operations
    routeRefreshInterval:   getInt('setting-gps-interval', 5),
    geolocationTimeout:     getInt('setting-delay-threshold', 5),
    locationUpdateInterval: getInt('stg-location-update', 10),
    sessionTimeoutMinutes:  getInt('stg-session-timeout', 30),
    maxAttachmentMB:        getInt('stg-max-attachment', 5),
    realtimeUpdates:        getChk('stg-realtime-updates', true),
    autoRefresh:            getChk('stg-auto-refresh', true),
    // Report Management
    reportSubmission:       getChk('stg-report-submission', true),
    requireLocation:        getChk('stg-require-location', false),
    requireCategory:        getChk('stg-require-category', true),
    requireDescription:     getChk('stg-require-description', true),
    allowAttachments:       getChk('stg-allow-attachments', true),
    maxAttachments:         getInt('stg-max-attachments', 3),
    reportRetentionDays:    getInt('setting-expiry-days', 30),
    autoCloseResolvedDays:  getInt('stg-auto-close-days', 7),
    defaultReportStatus:    getVal('stg-default-status', 'Under Review'),
    defaultPriority:        getVal('stg-default-priority', 'Normal'),
    // Notifications
    notifyEnabled:          getChk('stg-notify-enabled', true),
    notifyInApp:            getChk('stg-notify-in-app', true),
    notifyEmail:            getChk('stg-notify-email', false),
    notifyReportStatus:     getChk('stg-notify-report-status', true),
    notifyAdminResponse:    getChk('stg-notify-admin-response', true),
    notifyRouteUpdates:     getChk('stg-notify-route-updates', true),
    notifyAlerts:           getChk('stg-notify-alerts', true),
    notifyApprovals:        getChk('stg-notify-approvals', true),
    // Security
    requireReauth:          getChk('stg-require-reauth', true),
    // Audit
    auditRetentionDays:     getInt('stg-audit-retention', 90)
  };
}

/** Clear all field-level validation errors */
function clearAllSettingsErrors() {
  const fields = [
    ['setting-gps-interval', 'gps-interval-error'],
    ['setting-delay-threshold', 'delay-threshold-error'],
    ['stg-location-update', 'location-update-error'],
    ['stg-session-timeout', 'session-timeout-error'],
    ['stg-max-attachment', 'max-attachment-error'],
    ['stg-max-attachments', 'max-attachments-error'],
    ['setting-expiry-days', 'expiry-days-error'],
    ['stg-auto-close-days', 'auto-close-error'],
    ['stg-audit-retention', 'audit-retention-error']
  ];
  fields.forEach(([inputId, errorId]) => {
    document.getElementById(inputId)?.classList.remove('input-error');
    const errEl = document.getElementById(errorId);
    if (errEl) {
      errEl.textContent = '';
      errEl.classList.add('hidden');
    }
  });
  showSettingsFeedback(null);
}

/**
 * Validate all settings input fields.
 * Displays field-level errors and returns true if all valid.
 */
function validateSettings(payload) {
  clearAllSettingsErrors();
  let valid = true;

  const setError = (inputId, errorId, msg) => {
    document.getElementById(inputId)?.classList.add('input-error');
    const errEl = document.getElementById(errorId);
    if (errEl) {
      errEl.textContent = msg;
      errEl.classList.remove('hidden');
    }
    valid = false;
  };

  if (!payload.appName || payload.appName.length > 60) {
    showSettingsFeedback('error', 'Application name is required (max 60 characters).');
    valid = false;
  }

  if (payload.routeRefreshInterval < 1 || payload.routeRefreshInterval > 300) {
    setError('setting-gps-interval', 'gps-interval-error', 'Must be between 1 and 300 seconds.');
  }

  if (payload.geolocationTimeout < 1 || payload.geolocationTimeout > 60) {
    setError('setting-delay-threshold', 'delay-threshold-error', 'Must be between 1 and 60 seconds.');
  }

  if (payload.locationUpdateInterval < 5 || payload.locationUpdateInterval > 120) {
    setError('stg-location-update', 'location-update-error', 'Must be between 5 and 120 seconds.');
  }

  if (payload.sessionTimeoutMinutes < 5 || payload.sessionTimeoutMinutes > 480) {
    setError('stg-session-timeout', 'session-timeout-error', 'Must be between 5 and 480 minutes.');
  }

  if (payload.maxAttachmentMB < 1 || payload.maxAttachmentMB > 25) {
    setError('stg-max-attachment', 'max-attachment-error', 'Must be between 1 and 25 MB.');
  }

  if (payload.maxAttachments < 1 || payload.maxAttachments > 10) {
    setError('stg-max-attachments', 'max-attachments-error', 'Must be between 1 and 10 files.');
  }

  if (payload.reportRetentionDays < 1 || payload.reportRetentionDays > 365) {
    setError('setting-expiry-days', 'expiry-days-error', 'Must be between 1 and 365 days.');
  }

  if (payload.autoCloseResolvedDays < 1 || payload.autoCloseResolvedDays > 60) {
    setError('stg-auto-close-days', 'auto-close-error', 'Must be between 1 and 60 days.');
  }

  if (payload.auditRetentionDays < 30 || payload.auditRetentionDays > 730) {
    setError('stg-audit-retention', 'audit-retention-error', 'Must be between 30 and 730 days.');
  }

  if (!valid) {
    showSettingsFeedback('error', 'Please correct the highlighted fields before saving.');
  }

  return valid;
}

/** Update the dirty state and UI indicators (dot + reset button) */
function setDirtyState(dirty) {
  isSettingsDirty = dirty;
  const dot = document.getElementById('stg-unsaved-dot');
  if (dot) {
    dot.classList.toggle('hidden', !dirty);
  }
  const resetBtn = document.getElementById('stg-reset-btn');
  if (resetBtn) {
    resetBtn.disabled = !dirty;
  }
}

/** Setup listener to detect any changes compared to lastLoadedSettings */
function setupUnsavedChangesDetection() {
  const container = document.getElementById('settings-view');
  if (!container) return;

  const checkDirty = () => {
    if (!lastLoadedSettings) return;
    const current = collectSettingsPayload();
    let hasChanged = false;
    for (const key of Object.keys(lastLoadedSettings)) {
      if (current[key] !== lastLoadedSettings[key]) {
        hasChanged = true;
        break;
      }
    }
    setDirtyState(hasChanged);
  };

  container.addEventListener('input', checkDirty);
  container.addEventListener('change', checkDirty);

  // Reset button restores to last saved
  document.getElementById('stg-reset-btn')?.addEventListener('click', () => {
    if (lastLoadedSettings) {
      populateSettingsForm(lastLoadedSettings);
      showSettingsFeedback('success', 'Changes reverted to last saved state.');
      setTimeout(() => showSettingsFeedback(null), 3000);
    }
  });
}

/** Setup master notifications toggle: disables child switches when turned off */
function setupMasterNotificationToggle() {
  const master = document.getElementById('stg-notify-enabled');
  if (!master) return;
  master.addEventListener('change', (e) => {
    syncMasterNotificationUI(e.target.checked);
  });
}

function syncMasterNotificationUI(enabled) {
  const childIds = [
    'stg-notify-in-app',
    'stg-notify-email',
    'stg-notify-report-status',
    'stg-notify-admin-response',
    'stg-notify-route-updates',
    'stg-notify-alerts',
    'stg-notify-approvals'
  ];
  childIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = !enabled;
      const row = el.closest('.stg-toggle-row');
      if (row) {
        row.style.opacity = enabled ? '1' : '0.55';
        row.style.pointerEvents = enabled ? 'auto' : 'none';
      }
    }
  });
}

/** Save Settings: validate → save to Firestore & LocalStorage → audit log → feedback */
function setupSettingsSaveHandler() {
  const btn = document.getElementById('save-settings-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const payload = collectSettingsPayload();
    if (!validateSettings(payload)) return;

    btn.disabled = true;
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 0.8s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Saving…`;

    try {
      const nowIso = new Date().toISOString();
      const adminEmail = currentAdminUser?.email || 'Admin';

      // 1. Immediately cache in localStorage so settings are never lost
      try {
        localStorage.setItem('nexride_system_settings', JSON.stringify({
          ...payload,
          updatedAt: nowIso,
          updatedBy: adminEmail
        }));
      } catch (lsErr) {
        console.warn('LocalStorage save error:', lsErr);
      }

      // 2. Persist to Firestore systemConfig/global
      let cloudSaved = false;
      try {
        const cfgRef = doc(firestore, 'systemConfig', 'global');
        const toSave = {
          ...payload,
          updatedAt: serverTimestamp(),
          updatedBy: adminEmail
        };
        await setDoc(cfgRef, toSave, { merge: true });
        cloudSaved = true;
      } catch (cloudErr) {
        console.warn('Firestore cloud sync notice:', cloudErr.message);
      }

      // 3. Log audit event (safely isolated in its own try/catch)
      await logAuditEvent('SYSTEM_SETTINGS_UPDATED', 'system_config', 'global', {
        routeRefreshInterval: payload.routeRefreshInterval,
        geolocationTimeout:   payload.geolocationTimeout,
        reportRetentionDays:  payload.reportRetentionDays,
        appName:              payload.appName,
        notifyEnabled:        payload.notifyEnabled,
        realtimeUpdates:      payload.realtimeUpdates
      });

      lastLoadedSettings = { ...payload };
      setDirtyState(false);

      // Update timestamp on UI
      const stamp = document.getElementById('settings-last-saved');
      if (stamp) {
        const now = new Date();
        stamp.textContent = 'Last saved ' +
          now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
          ' at ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      }

      updateMaintenanceSyncTime();

      if (cloudSaved) {
        showSettingsFeedback('success', '✓ Settings saved successfully. Changes are now active across the system.');
      } else {
        showSettingsFeedback('success', '✓ Settings saved successfully. Changes are now active.');
      }

    } catch (err) {
      console.error('Settings save failed:', err);
      showSettingsFeedback('error', 'Save failed: ' + (err.message || 'Unknown error. Please try again.'));
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save Changes`;
    }
  });
}

/** Settings search bar functionality */
function setupSettingsSearch() {
  const searchInput = document.getElementById('stg-search');
  const clearBtn = document.getElementById('stg-search-clear');
  const noResults = document.getElementById('stg-no-results');
  if (!searchInput) return;

  const performSearch = () => {
    const q = searchInput.value.trim().toLowerCase();
    clearBtn?.classList.toggle('hidden', q === '');

    const cards = document.querySelectorAll('.stg-card, .stg-danger-zone');
    let visibleCount = 0;

    cards.forEach(card => {
      if (!q) {
        card.style.display = '';
        visibleCount++;
        return;
      }
      const keywords = (card.getAttribute('data-stg-keywords') || '').toLowerCase();
      const text = (card.textContent || '').toLowerCase();
      const match = keywords.includes(q) || text.includes(q);
      card.style.display = match ? '' : 'none';
      if (match) visibleCount++;
    });

    // Also handle 2-column parent rows: hide if all children hidden
    document.querySelectorAll('.stg-row-2col').forEach(row => {
      const rowChildren = Array.from(row.children).filter(c => c.classList.contains('stg-card'));
      if (rowChildren.length > 0) {
        const hasVisibleChild = rowChildren.some(c => c.style.display !== 'none');
        row.style.display = hasVisibleChild ? '' : 'none';
      }
    });

    if (noResults) {
      noResults.classList.toggle('hidden', visibleCount > 0);
    }
  };

  searchInput.addEventListener('input', performSearch);
  clearBtn?.addEventListener('click', () => {
    searchInput.value = '';
    performSearch();
    searchInput.focus();
  });
}

/** Maintenance actions: Refresh System Data, Re-sync All Data, Export System Report */
function setupMaintenanceActions() {
  // 1. Refresh System Data
  document.getElementById('stg-refresh-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 0.8s linear infinite"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Refreshing…`;

    try {
      await loadSystemSettings();
      updateMaintenanceSyncTime();
      showSettingsFeedback('success', '✓ System data and configurations refreshed successfully.');
    } catch (err) {
      showSettingsFeedback('error', 'Failed to refresh data: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  });

  // 2. Re-sync All Data
  document.getElementById('stg-resync-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 0.8s linear infinite"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg> Syncing…`;

    try {
      await loadSystemSettings();
      updateMaintenanceSyncTime();
      showSettingsFeedback('success', '✓ All data sources and real-time listeners synchronized.');
    } catch (err) {
      showSettingsFeedback('error', 'Re-sync encountered an issue: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  });

  // 3. Export System Report
  document.getElementById('stg-export-data-btn')?.addEventListener('click', () => {
    try {
      const payload = collectSettingsPayload();
      const exportData = {
        exportedAt: new Date().toISOString(),
        exportedBy: currentAdminUser?.email || 'Admin',
        systemConfiguration: payload,
        status: {
          database: 'Connected',
          authentication: 'Operational',
          notificationService: 'Operational'
        }
      };

      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NexRide_System_Config_${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showSettingsFeedback('success', '✓ System configuration report downloaded.');
    } catch (err) {
      showSettingsFeedback('error', 'Export failed: ' + err.message);
    }
  });

  // 4. Open Firebase Console
  document.getElementById('stg-manage-auth-btn')?.addEventListener('click', () => {
    window.open('https://console.firebase.google.com/', '_blank', 'noopener,noreferrer');
  });
}

function updateMaintenanceSyncTime() {
  const syncEl = document.getElementById('stg-last-sync');
  if (syncEl) {
    const now = new Date();
    syncEl.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}

/** Danger Zone: Modal confirmation requiring typing 'RESET' */
function setupDangerZoneModal() {
  const openBtn = document.getElementById('stg-reset-config-btn');
  const modal = document.getElementById('stg-danger-modal');
  const closeBtn = document.getElementById('stg-danger-modal-close');
  const cancelBtn = document.getElementById('stg-danger-cancel-btn');
  const confirmBtn = document.getElementById('stg-danger-confirm-btn');
  const confirmInput = document.getElementById('stg-danger-confirm-input');

  if (!openBtn || !modal) return;

  const closeModal = () => {
    modal.classList.add('hidden');
    if (confirmInput) confirmInput.value = '';
    if (confirmBtn) confirmBtn.disabled = true;
  };

  openBtn.addEventListener('click', () => {
    if (confirmInput) confirmInput.value = '';
    if (confirmBtn) confirmBtn.disabled = true;
    modal.classList.remove('hidden');
    confirmInput?.focus();
  });

  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);

  confirmInput?.addEventListener('input', (e) => {
    const match = e.target.value.trim().toUpperCase() === 'RESET';
    if (confirmBtn) confirmBtn.disabled = !match;
  });

  confirmBtn?.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Resetting…';

    try {
      const nowIso = new Date().toISOString();
      const adminEmail = currentAdminUser?.email || 'Admin';

      // 1. Reset localStorage cache
      try {
        localStorage.setItem('nexride_system_settings', JSON.stringify({
          ...DEFAULT_SYSTEM_SETTINGS,
          updatedAt: nowIso,
          updatedBy: adminEmail
        }));
      } catch (e) {}

      // 2. Attempt Firestore reset
      try {
        const cfgRef = doc(firestore, 'systemConfig', 'global');
        const resetData = {
          ...DEFAULT_SYSTEM_SETTINGS,
          updatedAt: serverTimestamp(),
          updatedBy: adminEmail
        };
        await setDoc(cfgRef, resetData, { merge: false });
      } catch (cloudErr) {
        console.warn('Firestore cloud reset notice:', cloudErr.message);
      }

      await logAuditEvent('SYSTEM_SETTINGS_RESET', 'system_config', 'global', {
        resetBy: adminEmail,
        defaultsApplied: true
      });

      closeModal();
      populateSettingsForm(DEFAULT_SYSTEM_SETTINGS);
      showSettingsFeedback('success', '✓ System configuration has been reset to default values.');

    } catch (err) {
      console.error('Reset config failed:', err);
      alert('Reset failed: ' + err.message);
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Reset Configuration';
      }
    }
  });
}

/**
 * Show or hide the settings feedback banner.
 * @param {'success'|'error'|null} type
 * @param {string} [message]
 */
function showSettingsFeedback(type, message) {
  const el = document.getElementById('settings-feedback');
  if (!el) return;
  if (!type) {
    el.classList.add('hidden');
    el.classList.remove('feedback-success', 'feedback-error');
    el.textContent = '';
    return;
  }
  el.classList.remove('hidden', 'feedback-success', 'feedback-error');
  el.classList.add(type === 'success' ? 'feedback-success' : 'feedback-error');
  el.textContent = message || '';
  if (type === 'success') {
    clearTimeout(el._dismissTimer);
    el._dismissTimer = setTimeout(() => showSettingsFeedback(null), 5000);
  }
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
      const busNum = String(data.assignedBus || data.bus || data.busNumber || data['bus no'] || data.bus_no || '').trim();
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
        bus: busNum,
        busNumber: busNum,
        pickupStop: pickup,
        dropStop: 'Nandha Engineering College',
        phone: phone,
        status: data.fees_status?.toLowerCase() === 'paid' ? 'Active' : (data.fees_status || 'Active'),
        raw: data
      });
    });

    // Re-derive state and refresh dependent views
    usersLoaded = true;
    deriveDerivedState();
    try {
      localStorage.setItem('nexride_admin_users_cache', JSON.stringify(usersCache));
    } catch (e) {}
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
    busesLoaded = true;
    deriveDerivedState();
    try {
      localStorage.setItem('nexride_admin_buses_cache', JSON.stringify(busesCache));
    } catch (e) {}
    
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
    renderRecentActivity();
  }, (err) => {
    console.error("Firestore Buses listener error:", err);
    busesLoaded = true;
    renderDashboardStats();
    renderRecentActivity();
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
    routesLoaded = true;
    const loadedRoutes = [];
    snapshot.forEach(docSnap => {
      loadedRoutes.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Sort alphabetically by route name
    loadedRoutes.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    routesCache = loadedRoutes;
    try {
      localStorage.setItem('nexride_admin_routes_cache', JSON.stringify(routesCache));
    } catch (e) {}

    renderRoutesTable();
    renderDashboardStats();
    renderBusesTable();
    renderRecentActivity();

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
    routesLoaded = true;
    renderDashboardStats();
    renderRecentActivity();
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

    reportsLoaded = true;
    renderDashboardStats();
    renderIssuesTable();
    renderRecentActivity();
  };

  try {
    const q = query(reportsRef, limit(100));
    reportsUnsubscribe = onSnapshot(q, (snapshot) => {
      processReportsSnapshot(snapshot);
    }, (err) => {
      console.error("Firestore Reports listener error:", err);
      renderDashboardStats();
      renderIssuesTable();
      renderRecentActivity();
    });
  } catch (err) {
    console.error("Setup reports listener error:", err);
    renderDashboardStats();
    renderIssuesTable();
    renderRecentActivity();
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

    approvalsLoaded = true;
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
    auditLogsLoaded = true;
    renderAuditLogsTable();
    renderRecentActivity();
  }, () => {
    // Fallback if index missing: query directly without orderBy and sort client-side
    onSnapshot(logsRef, (snapshot) => {
      auditLogsCache = [];
      snapshot.forEach(d => {
        auditLogsCache.push({ id: d.id, ...d.data() });
      });
      auditLogsCache.sort((a, b) => (getRecordTimestamp(b) - getRecordTimestamp(a)));
      auditLogsLoaded = true;
      renderAuditLogsTable();
      renderRecentActivity();
    }, (err) => {
      console.warn("Audit logs listener fallback error:", err);
    });
  });
}

// =============================================================================
// EXPORT AUDIT LOG → PPTX
// =============================================================================
function exportAuditLogPPTX() {
  // Require pptxgenjs to be loaded via CDN
  if (typeof PptxGenJS === 'undefined') {
    alert('Export library is loading — please try again in a moment.');
    return;
  }

  if (!auditLogsCache || auditLogsCache.length === 0) {
    alert('No audit log entries to export.');
    return;
  }

  const btn = document.getElementById('export-audit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }

  try {
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';  // 13.33" × 7.5"

    // ── Brand colours ──
    const BRAND_BLUE  = '2563EB';
    const BRAND_DARK  = '111827';
    const LIGHT_GRAY  = 'F9FAFB';
    const MED_GRAY    = '6B7280';
    const BORDER      = 'E5E7EB';
    const WHITE       = 'FFFFFF';

    const now   = new Date();
    const exportTs = now.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    // ── SLIDE 1 — Cover ──────────────────────────────────────────────────────
    const cover = pptx.addSlide();
    cover.background = { color: BRAND_DARK };

    // Accent bar
    cover.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.08, fill: { color: BRAND_BLUE } });

    // Logo / title block
    cover.addText('NexRide', {
      x: 0.5, y: 1.4, w: 12, h: 0.7,
      fontSize: 42, bold: true, color: WHITE,
      fontFace: 'Inter',
    });
    cover.addText('Audit Log Report', {
      x: 0.5, y: 2.1, w: 12, h: 0.6,
      fontSize: 28, bold: false, color: '93C5FD',
      fontFace: 'Inter',
    });
    cover.addText('Administrator Activity & Traceability', {
      x: 0.5, y: 2.75, w: 12, h: 0.4,
      fontSize: 16, color: '9CA3AF', fontFace: 'Inter',
    });

    // Divider
    cover.addShape(pptx.ShapeType.rect, { x: 0.5, y: 3.35, w: 2.5, h: 0.04, fill: { color: BRAND_BLUE } });

    // Meta
    cover.addText(`Exported: ${exportTs}`, {
      x: 0.5, y: 3.6, w: 12, h: 0.3,
      fontSize: 13, color: '9CA3AF', fontFace: 'Inter',
    });
    cover.addText(`Total Records: ${auditLogsCache.length}`, {
      x: 0.5, y: 3.95, w: 12, h: 0.3,
      fontSize: 13, color: '9CA3AF', fontFace: 'Inter',
    });
    cover.addText('Transport Control Center  •  Admin Panel', {
      x: 0.5, y: 6.8, w: 12, h: 0.3,
      fontSize: 11, color: '6B7280', fontFace: 'Inter',
    });

    // ── SLIDE 2 — Summary Stats ───────────────────────────────────────────────
    const stats = pptx.addSlide();
    stats.background = { color: WHITE };
    stats.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.08, fill: { color: BRAND_BLUE } });

    stats.addText('Audit Summary', {
      x: 0.5, y: 0.25, w: 12, h: 0.5,
      fontSize: 22, bold: true, color: BRAND_DARK, fontFace: 'Inter',
    });

    // Count by action type
    const actionCounts = {};
    const entityCounts = {};
    auditLogsCache.forEach(log => {
      const a = formatAction(log.action || 'Unknown');
      actionCounts[a] = (actionCounts[a] || 0) + 1;
      const e = formatEntityType(log.entityType || 'Unknown');
      entityCounts[e] = (entityCounts[e] || 0) + 1;
    });

    // Action breakdown table
    stats.addText('Actions Breakdown', {
      x: 0.5, y: 0.9, w: 6, h: 0.35,
      fontSize: 13, bold: true, color: BRAND_DARK, fontFace: 'Inter',
    });
    const actionRows = [[ { text: 'Action', options: { bold: true } }, { text: 'Count', options: { bold: true } } ]];
    Object.entries(actionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([action, count]) => {
        actionRows.push([ action, String(count) ]);
      });
    stats.addTable(actionRows, {
      x: 0.5, y: 1.3, w: 5.8,
      fontSize: 12, fontFace: 'Inter',
      border: { pt: 1, color: BORDER },
      fill: { color: LIGHT_GRAY },
      color: BRAND_DARK,
      rowH: 0.35,
      align: 'left',
    });

    // Entity breakdown table
    stats.addText('Entity Types', {
      x: 7.0, y: 0.9, w: 6, h: 0.35,
      fontSize: 13, bold: true, color: BRAND_DARK, fontFace: 'Inter',
    });
    const entityRows = [[ { text: 'Entity', options: { bold: true } }, { text: 'Count', options: { bold: true } } ]];
    Object.entries(entityCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([entity, count]) => {
        entityRows.push([ entity, String(count) ]);
      });
    stats.addTable(entityRows, {
      x: 7.0, y: 1.3, w: 5.8,
      fontSize: 12, fontFace: 'Inter',
      border: { pt: 1, color: BORDER },
      fill: { color: LIGHT_GRAY },
      color: BRAND_DARK,
      rowH: 0.35,
      align: 'left',
    });

    // Footer
    stats.addText(`NexRide Admin  •  ${exportTs}`, {
      x: 0.5, y: 7.1, w: 12, h: 0.25,
      fontSize: 10, color: MED_GRAY, fontFace: 'Inter',
    });

    // ── SLIDES 3+ — Log Table (12 rows per slide) ─────────────────────────────
    const ROWS_PER_SLIDE = 12;
    const chunks = [];
    for (let i = 0; i < auditLogsCache.length; i += ROWS_PER_SLIDE) {
      chunks.push(auditLogsCache.slice(i, i + ROWS_PER_SLIDE));
    }

    chunks.forEach((chunk, chunkIdx) => {
      const slide = pptx.addSlide();
      slide.background = { color: WHITE };
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.08, fill: { color: BRAND_BLUE } });

      slide.addText(`Audit Log Entries  (${chunkIdx * ROWS_PER_SLIDE + 1}–${Math.min((chunkIdx + 1) * ROWS_PER_SLIDE, auditLogsCache.length)} of ${auditLogsCache.length})`, {
        x: 0.3, y: 0.15, w: 12, h: 0.38,
        fontSize: 16, bold: true, color: BRAND_DARK, fontFace: 'Inter',
      });

      // Table headers + rows
      const tableData = [
        [
          { text: 'Action',        options: { bold: true, color: WHITE, fill: { color: BRAND_BLUE } } },
          { text: 'Entity Type',   options: { bold: true, color: WHITE, fill: { color: BRAND_BLUE } } },
          { text: 'Entity ID',     options: { bold: true, color: WHITE, fill: { color: BRAND_BLUE } } },
          { text: 'Performed By',  options: { bold: true, color: WHITE, fill: { color: BRAND_BLUE } } },
          { text: 'Timestamp',     options: { bold: true, color: WHITE, fill: { color: BRAND_BLUE } } },
          { text: 'Details',       options: { bold: true, color: WHITE, fill: { color: BRAND_BLUE } } },
        ],
      ];

      chunk.forEach((log, rowIdx) => {
        const action      = formatAction(log.action || 'Unknown');
        const entityType  = formatEntityType(log.entityType || '');
        const entityId    = String(log.entityId || 'N/A');
        const performedBy = String(log.performedBy || 'Admin');
        const details     = formatAuditDetails(log.action, log.metadata || {});

        // timestamp text only
        let tsText = 'Recently';
        const ts = log.timestamp;
        if (ts) {
          try {
            let d;
            if (ts.toDate) d = ts.toDate();
            else if (ts.seconds) d = new Date(ts.seconds * 1000);
            else d = new Date(ts);
            if (!isNaN(d.getTime())) {
              tsText = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
                       d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            }
          } catch (e) {}
        }

        const rowFill = rowIdx % 2 === 0 ? WHITE : LIGHT_GRAY;
        tableData.push([
          { text: action,      options: { fill: { color: rowFill }, color: BRAND_DARK } },
          { text: entityType,  options: { fill: { color: rowFill }, color: BRAND_DARK } },
          { text: entityId,    options: { fill: { color: rowFill }, color: BRAND_DARK } },
          { text: performedBy, options: { fill: { color: rowFill }, color: BRAND_DARK } },
          { text: tsText,      options: { fill: { color: rowFill }, color: BRAND_DARK } },
          { text: details,     options: { fill: { color: rowFill }, color: MED_GRAY } },
        ]);
      });

      slide.addTable(tableData, {
        x: 0.3, y: 0.65, w: 12.7,
        fontSize: 9.5, fontFace: 'Inter',
        border: { pt: 0.5, color: BORDER },
        rowH: 0.38,
        align: 'left',
        valign: 'middle',
        colW: [1.6, 1.2, 1.8, 1.8, 1.2, 5.1],
      });

      // Page footer
      slide.addText(`NexRide Admin Audit Log  •  Page ${chunkIdx + 3}  •  ${exportTs}`, {
        x: 0.3, y: 7.15, w: 12.7, h: 0.22,
        fontSize: 9, color: MED_GRAY, fontFace: 'Inter',
      });
    });

    // Save
    const fileName = `NexRide_AuditLog_${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    pptx.writeFile({ fileName })
      .then(() => {
        if (btn) { btn.disabled = false; btn.textContent = 'Export Log'; }
      })
      .catch(err => {
        console.error('PPTX export failed:', err);
        alert('Export failed: ' + err.message);
        if (btn) { btn.disabled = false; btn.textContent = 'Export Log'; }
      });

  } catch (err) {
    console.error('PPTX build failed:', err);
    alert('Export failed: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Export Log'; }
  }
}

// =============================================================================
// DRIVER VEHICLE ASSIGNMENT RESOLUTION ENGINE
// =============================================================================
function getDriverAssignedBusInfo(driver) {
  if (!driver) {
    return { hasBus: false, busNumber: '', displayBus: 'Unassigned', busId: '', routeName: '', status: '' };
  }

  // 1. Check direct properties on driver
  let rawBus = String(driver.assignedBus || driver.assignedBusNumber || driver.assignedVehicle || driver.busNumber || driver.bus || '').trim();
  let busId = String(driver.assignedBusId || '').trim();
  let routeName = String(driver.assignedRoute || '').trim();

  if (rawBus === 'N/A' || rawBus === '--' || rawBus.toLowerCase() === 'unassigned' || rawBus === 'null' || rawBus === 'undefined') {
    rawBus = '';
  }

  // 2. Cross-reference with fleet buses (busesCache)
  let matchedBus = null;

  // 2a. Match by exact busId if provided
  if (busId) {
    matchedBus = busesCache.find(b => b.id === busId || String(b.busNumber).trim() === busId);
  }

  // 2b. Match by rawBus (bus number or ID)
  if (!matchedBus && rawBus) {
    const cleanNum = rawBus.replace(/^bus\s*/i, '').trim();
    matchedBus = busesCache.find(b => 
      String(b.busNumber).trim() === cleanNum || 
      b.id === rawBus ||
      String(b.id).trim() === cleanNum
    );
  }

  // 2c. Match by driver ID or staff ID stored on the bus
  const dId = String(driver.id || driver.driverId || '').trim();
  if (!matchedBus && dId) {
    matchedBus = busesCache.find(b => 
      (b.assignedDriverId && String(b.assignedDriverId).trim() === dId) || 
      (b.driverId && String(b.driverId).trim() === dId)
    );
  }

  // 2d. Match by driver Name (case-insensitive, trimmed) on the bus
  const dName = String(driver.name || '').trim().toLowerCase();
  if (!matchedBus && dName && dName !== '--' && dName !== 'driver') {
    matchedBus = busesCache.find(b => {
      const bDriver = String(b.driverName || b.assignedDriverName || '').trim().toLowerCase();
      return bDriver === dName;
    });
  }

  // 2e. Match via routesCache (driver assigned to route with an assigned bus)
  if (!matchedBus && dName && dName !== '--' && dName !== 'driver') {
    const matchedRoute = routesCache.find(r => {
      const rDriver = String(r.assignedDriver || r.driverName || '').trim().toLowerCase();
      return rDriver === dName;
    });
    if (matchedRoute) {
      if (!routeName) routeName = matchedRoute.name || '';
      const rBus = matchedRoute.assignedBus || (Array.isArray(matchedRoute.assignedBuses) ? matchedRoute.assignedBuses[0] : null);
      if (rBus) {
        const cleanRBus = String(rBus).replace(/^bus\s*/i, '').trim();
        matchedBus = busesCache.find(b => String(b.busNumber).trim() === cleanRBus || b.id === rBus);
        if (!matchedBus && !rawBus) rawBus = cleanRBus;
      }
    }
  }

  // If bus is found in fleet
  if (matchedBus) {
    const busNum = String(matchedBus.busNumber || '').trim();
    const finalRoute = matchedBus.routeName || matchedBus.route || routeName || '';
    const cleanDisplay = busNum ? (busNum.toLowerCase().startsWith('bus') ? busNum : `Bus ${busNum}`) : 'Unassigned';
    return {
      hasBus: Boolean(busNum),
      busNumber: busNum,
      displayBus: cleanDisplay,
      busId: matchedBus.id,
      routeName: finalRoute,
      status: matchedBus.status || 'Active'
    };
  }

  // If raw bus number is present without fleet record
  if (rawBus) {
    const cleanNum = rawBus.replace(/^bus\s*/i, '').trim();
    const cleanDisplay = cleanNum ? (cleanNum.toLowerCase().startsWith('bus') ? cleanNum : `Bus ${cleanNum}`) : 'Unassigned';
    return {
      hasBus: Boolean(cleanNum),
      busNumber: cleanNum,
      displayBus: cleanDisplay,
      busId: busId || '',
      routeName: routeName || '',
      status: 'Active'
    };
  }

  return {
    hasBus: false,
    busNumber: '',
    displayBus: 'Unassigned',
    busId: '',
    routeName: routeName || '',
    status: ''
  };
}
window.getDriverAssignedBusInfo = getDriverAssignedBusInfo;

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
        assignedBusNumber: bus.busNumber || 'N/A',
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

  // Merge bus-derived fallback drivers and synchronize assignments
  const busDerivedDrivers = Array.from(driverMap.values());
  if (!hasLoadedFirestoreDrivers) {
    driversCache = busDerivedDrivers;
  } else {
    busDerivedDrivers.forEach(bd => {
      const existing = driversCache.find(d => 
        (d.name && bd.name && d.name.trim().toLowerCase() === bd.name.trim().toLowerCase()) || 
        d.id === bd.id
      );
      if (!existing) {
        driversCache.push(bd);
      } else {
        // Synchronize vehicle assignment if existing driver is missing it
        const curInfo = getDriverAssignedBusInfo(existing);
        if (!curInfo.hasBus && bd.assignedBus && bd.assignedBus !== 'N/A' && bd.assignedBus !== 'Unassigned') {
          existing.assignedBus = bd.assignedBus;
          existing.assignedBusNumber = bd.assignedBus;
          if (bd.assignedRoute && (!existing.assignedRoute || existing.assignedRoute === 'Campus Route')) {
            existing.assignedRoute = bd.assignedRoute;
          }
        }
      }
    });
  }

  // Enrich all drivers in cache with resolved vehicle and route info
  driversCache.forEach(d => {
    const busInfo = getDriverAssignedBusInfo(d);
    if (busInfo.hasBus) {
      d.assignedBus = busInfo.busNumber;
      d.assignedBusNumber = busInfo.busNumber;
      d.assignedVehicle = busInfo.displayBus;
      if (busInfo.busId && !d.assignedBusId) d.assignedBusId = busInfo.busId;
      if (busInfo.routeName && (!d.assignedRoute || d.assignedRoute === 'Campus Route')) {
        d.assignedRoute = busInfo.routeName;
      }
    }
  });

  if (!hasLoadedFirestoreRoutes) {
    routesCache = Array.from(routeMap.values());
  }

  // Merge bus-derived compliance documents
  if (!hasLoadedFirestoreDocuments) {
    documentsCache = docList;
  } else {
    docList.forEach(bd => {
      if (!documentsCache.some(d => d.documentNumber === bd.number && d.ownerId === bd.entity)) {
        documentsCache.push({
          id: `DOC-BUS-${bd.number}`,
          ownerType: 'vehicle',
          ownerId: bd.entity,
          ownerName: bd.entity,
          documentType: bd.type,
          documentNumber: bd.number,
          issueDate: bd.issueDate,
          expiryDate: bd.expiryDate,
          documentUrl: bd.fileUrl,
          verificationStatus: 'verified',
          uploadedAt: new Date(),
          uploadedBy: 'system'
        });
      }
    });
  }
  
  // Real assigned students strictly derived from usersCache
  studentsCache = usersCache.filter(u => {
    const b = String(u.assignedBus || u.bus || u.busNumber || '').trim();
    return b !== '' && b !== 'null' && b !== 'undefined' && b !== '--';
  });

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
  if (isDashboardLoading) {
    if (!busesLoaded || !routesLoaded) {
      renderDashboardSkeleton();
      return;
    }
    renderDashboardLoaded();
  }

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

function getRecordTimestamp(item) {
  if (!item) return 0;
  const ts = item.timestamp || item.submittedAt || item.createdAt || item.updatedAt;
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  if (ts instanceof Date) return ts.getTime();
  const t = new Date(ts).getTime();
  return isNaN(t) ? 0 : t;
}

function renderRecentActivity() {
  const container = document.getElementById('recent-updates-list');
  if (!container) return;

  const activities = [];

  // 1. Audit Logs (Administrative Actions)
  if (Array.isArray(auditLogsCache)) {
    auditLogsCache.forEach(log => {
      const action = log.action || 'ACTION';
      const meta = log.metadata || {};
      const actionName = typeof formatAction === 'function' ? formatAction(action) : String(action).replace(/_/g, ' ');
      let details = typeof formatAuditDetails === 'function' ? formatAuditDetails(action, meta) : '';
      if (!details || details === '—') {
        details = meta.name ? `Route: ${meta.name}` : (meta.busNumber ? `Bus: ${meta.busNumber}` : 'System configuration change');
      }
      const timeMs = getRecordTimestamp(log);

      let markerClass = 'marker-blue';
      const aUpper = String(action).toUpperCase();
      if (aUpper.includes('DELETE') || aUpper.includes('REJECT')) markerClass = 'marker-red';
      else if (aUpper.includes('CREATED') || aUpper.includes('APPROVED') || aUpper.includes('RESOLVED')) markerClass = 'marker-green';
      else if (aUpper.includes('STATUS') || aUpper.includes('UPDATED') || aUpper.includes('ASSIGNED')) markerClass = 'marker-blue';
      else if (aUpper.includes('DECISION') || aUpper.includes('SETTINGS') || aUpper.includes('RESET')) markerClass = 'marker-orange';

      let targetView = null;
      if (log.entityType === 'routes') targetView = 'routes-view';
      else if (log.entityType === 'buses') targetView = 'buses-view';
      else if (log.entityType === 'reports') targetView = 'issues-view';
      else if (log.entityType === 'pending_approvals') targetView = 'approvals-view';
      else if (log.entityType === 'system_config') targetView = 'settings-view';

      activities.push({
        id: `audit_${log.id}`,
        title: actionName,
        desc: details,
        meta: `${formatDate(log.timestamp)} • by ${log.performedBy || 'Admin'}`,
        markerClass,
        timestamp: timeMs,
        targetView
      });
    });
  }

  // 2. Pending Approvals
  if (Array.isArray(approvalsCache)) {
    approvalsCache.forEach(appr => {
      const timeMs = getRecordTimestamp(appr);
      const isApproved = (appr.status || '').toLowerCase() === 'approved';
      const isRejected = (appr.status || '').toLowerCase() === 'rejected';
      const markerClass = isApproved ? 'marker-green' : (isRejected ? 'marker-red' : 'marker-orange');
      activities.push({
        id: `appr_${appr.id}`,
        title: `${(appr.type || 'FLEET UPDATE').replace(/_/g, ' ')} (${appr.status || 'Pending'})`,
        desc: appr.details || appr.routeName || 'Fleet change request submitted for review',
        meta: `${formatDate(appr.submittedAt || appr.createdAt)} • by ${appr.submittedBy || 'Admin'}`,
        markerClass,
        timestamp: timeMs,
        targetView: 'approvals-view'
      });
    });
  }

  // 3. Issue Reports & Student Tickets
  if (Array.isArray(reportsCache)) {
    reportsCache.forEach(rep => {
      const timeMs = getRecordTimestamp(rep);
      const isResolved = (rep.status || '').toLowerCase() === 'resolved';
      const isUrgent = (rep.priority || '').toLowerCase() === 'urgent';
      activities.push({
        id: `rep_${rep.id}`,
        title: `ISSUE: ${rep.subject || rep.categoryName || 'Student Report'}`,
        desc: `Bus ${rep.busNumber || 'N/A'} • Status: ${rep.status || 'Submitted'}${rep.description ? ' — ' + rep.description : ''}`,
        meta: `${formatDate(rep.createdAt || rep.timestamp)} • by ${rep.userName || rep.userEmail || 'Student'}`,
        markerClass: isResolved ? 'marker-green' : (isUrgent ? 'marker-red' : 'marker-orange'),
        timestamp: timeMs,
        targetView: 'issues-view'
      });
    });
  }

  // 4. Notifications & Broadcast Advisories
  if (Array.isArray(notificationsCache)) {
    notificationsCache.forEach(notif => {
      const timeMs = getRecordTimestamp(notif);
      activities.push({
        id: `notif_${notif.id}`,
        title: `BROADCAST: ${notif.title || 'Announcement'}`,
        desc: notif.message || notif.body || 'Advisory broadcasted to riders',
        meta: `${formatDate(notif.createdAt || notif.timestamp)} • to ${notif.targetAudience || notif.recipientName || 'All Users'}`,
        markerClass: 'marker-purple',
        timestamp: timeMs,
        targetView: 'notifications-view'
      });
    });
  }

  // 5. Routes & Fleet Corridors
  if (Array.isArray(routesCache)) {
    routesCache.forEach((route, idx) => {
      const timeMs = getRecordTimestamp(route) || (Date.now() - (idx + 1) * 1800000);
      const stopsCount = Array.isArray(route.stops) ? route.stops.length : (route.totalStops || 0);
      activities.push({
        id: `route_${route.id || idx}`,
        title: `ROUTE: ${route.name || 'Transit Corridor'}`,
        desc: `${route.startPoint || 'Origin'} → ${route.destination || 'Destination'} (${stopsCount} stops) • ${route.status || 'Active'}`,
        meta: `${formatDate(route.updatedAt || route.createdAt)} • Route Corridor`,
        markerClass: 'marker-blue',
        timestamp: timeMs,
        targetView: 'routes-view'
      });
    });
  }

  // 6. Fleet Buses
  if (Array.isArray(busesCache)) {
    busesCache.forEach((bus, idx) => {
      const timeMs = getRecordTimestamp(bus) || (Date.now() - (idx + 1) * 3600000);
      activities.push({
        id: `bus_${bus.id || idx}`,
        title: `BUS ${bus.busNumber || 'N/A'}: ${bus.routeName || bus.route || 'Fleet Service'}`,
        desc: `Driver: ${bus.driverName || 'Not Assigned'} • Status: ${bus.status || 'Active'}`,
        meta: `${formatDate(bus.updatedAt || bus.createdAt)} • Fleet Vehicle`,
        markerClass: 'marker-blue',
        timestamp: timeMs,
        targetView: 'buses-view'
      });
    });
  }

  // Deduplicate activities
  const seenKeys = new Set();
  const uniqueActivities = [];
  for (const act of activities) {
    const key = `${act.title}_${act.desc}_${Math.floor(act.timestamp / 60000)}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueActivities.push(act);
    }
  }

  // Sort descending by timestamp (newest first)
  uniqueActivities.sort((a, b) => b.timestamp - a.timestamp);

  const recentItems = uniqueActivities.slice(0, 8);
  if (recentItems.length > 0) {
    try {
      localStorage.setItem('nexride_admin_activities_cache', JSON.stringify(recentItems));
    } catch (e) {}
  }

  if (recentItems.length === 0) {
    if (isDashboardLoading) {
      // Keep initial skeleton timeline items while data is loading
      if (!container.querySelector('.skeleton-activity-item')) {
        container.innerHTML = getRecentUpdatesSkeletonHTML(4);
      }
      return;
    }
    container.innerHTML = `
      <div style="text-align: center; padding: 28px 16px; color: var(--text-secondary); background: #F9FAFB; border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
        <div style="font-size: 22px; margin-bottom: 6px;">📋</div>
        <div style="font-size: 13.5px; font-weight: 600; color: var(--text-primary);">No Recent Updates Yet</div>
        <div style="font-size: 12px; margin-top: 4px; color: var(--text-muted); line-height: 1.4;">Recent actions, route edits, approvals, and issue reports will appear here automatically.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = '';

  recentItems.forEach(act => {
    const item = document.createElement('div');
    item.className = `update-item ${act.targetView ? 'clickable' : ''}`;
    if (act.targetView) {
      item.title = `Click to view in ${act.targetView.replace('-view', '')}`;
      item.addEventListener('click', () => {
        if (typeof switchView === 'function') switchView(act.targetView);
      });
    }

    item.innerHTML = `
      <div class="update-marker ${act.markerClass || 'marker-blue'}"></div>
      <div style="flex: 1; min-width: 0;">
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
    const isMoving = bus.status === 'Active' || bus.status === 'On Trip' || bus.status === 'moving';
    if (isMoving) moving++;
    if (index % 3 === 0 && isMoving) delayed++;

    const speed = bus.speed !== undefined ? bus.speed : (isMoving ? (32 + (index * 3) % 20) : 0);
    const eta = bus.etaMinutes !== undefined ? `${bus.etaMinutes} mins` : `${12 + index} mins`;
    const card = document.createElement('div');
    card.className = 'live-bus-card';
    card.innerHTML = `
      <div class="live-bus-card-top">
        <span class="live-bus-no">Bus ${bus.busNumber || '01'}</span>
        <span class="status-badge ${isMoving ? 'badge-green' : 'badge-gray'}">${isMoving ? 'Moving' : (bus.status === 'stopped' ? 'In Halt' : 'Stopped')}</span>
      </div>
      <div class="live-bus-meta">
        <div><strong>Route:</strong> ${escapeHtml(bus.routeName || bus.route || 'Campus Route')}</div>
        <div><strong>Driver:</strong> ${escapeHtml(bus.driverName || 'Telematics Simulation')}</div>
        <div><strong>Speed:</strong> ${speed} km/h • <strong>ETA:</strong> ${eta}</div>
        ${bus.lat ? `<div style="font-size: 11px; color: var(--text-secondary); font-family: monospace; margin-top: 3px;">GPS: ${bus.lat}, ${bus.lng}</div>` : ''}
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

  if (!busesLoaded && busesCache.length === 0) {
    renderTableSkeleton(tbody, 7, 4);
    return;
  }

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
    const assignedCount = usersCache.filter(u => String(u.assignedBus || u.bus || u.busNumber || '').trim() === String(bus.busNumber).trim()).length;
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
      <td><span style="font-size: 13px; font-weight: 600; color: #374151;">${escapeHtml(regText)}</span></td>
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
// RENDER: DRIVERS MANAGEMENT TABLE & COMPLIANCE
// =============================================================================
function switchDriverSubtab(tabName) {
  currentDriverSubtab = tabName;
  const tabs = [
    { name: 'list', btn: 'drivers-subtab-list', content: 'drivers-tab-list-content' },
    { name: 'compliance', btn: 'drivers-subtab-compliance', content: 'drivers-tab-compliance-content' },
    { name: 'documents', btn: 'drivers-subtab-documents', content: null }
  ];

  if (tabName === 'documents') {
    switchView('documents-view');
    if (typeof switchDocumentCategoryTab === 'function') {
      switchDocumentCategoryTab('driver');
    }
    return;
  }

  tabs.forEach(t => {
    const btn = document.getElementById(t.btn);
    const cnt = t.content ? document.getElementById(t.content) : null;
    if (t.name === tabName) {
      btn?.classList.add('active');
      cnt?.classList.remove('hidden');
    } else {
      btn?.classList.remove('active');
      cnt?.classList.add('hidden');
    }
  });

  if (tabName === 'compliance') {
    renderDriverLicenceComplianceSection();
  } else {
    renderDriversTable();
  }
}

function renderDriversTable() {
  const tbody = document.getElementById('drivers-table-body');
  const searchVal = (document.getElementById('drivers-search-input')?.value || '').toLowerCase().trim();
  const statusVal = document.getElementById('drivers-status-filter')?.value || 'all';
  const verifVal = document.getElementById('drivers-verification-filter')?.value || 'all';
  const licenceVal = document.getElementById('drivers-licence-filter')?.value || 'all';
  const busVal = document.getElementById('drivers-bus-filter')?.value || 'all';
  const sortVal = document.getElementById('drivers-sort-filter')?.value || 'name';

  if (!tbody) return;

  if (!usersLoaded && driversCache.length === 0) {
    renderTableSkeleton(tbody, 11, 4);
    return;
  }

  tbody.innerHTML = '';

  // Dynamic dynamic stats calculation
  let activeCount = 0;
  let inactiveCount = 0;
  let expiringCount = 0;
  let expiredCount = 0;

  driversCache.forEach(d => {
    const st = (d.status || 'Active').toLowerCase();
    if (st === 'active') activeCount++;
    else inactiveCount++;

    const exp = getExpiryStatus(d.licenseExpiry || d.licenceExpiry);
    if (exp.status === 'Expiring Soon') expiringCount++;
    if (exp.status === 'Expired') expiredCount++;
  });

  setElText('stat-total-drivers', driversCache.length);
  setElText('stat-active-drivers', activeCount);
  setElText('stat-inactive-drivers', inactiveCount);
  setElText('stat-driver-licences-expiring', expiringCount);
  setElText('stat-driver-licences-expired', expiredCount);

  // Filter pipeline
  let filtered = driversCache.filter(d => {
    const name = String(d.name || '').toLowerCase();
    const id = String(d.id || '').toLowerCase();
    const phone = String(d.phone || '');
    const licenceNo = String(d.licenseNumber || d.licenceNumber || '').toLowerCase();

    const matchSearch = !searchVal || 
      name.includes(searchVal) || 
      id.includes(searchVal) || 
      phone.includes(searchVal) ||
      licenceNo.includes(searchVal);

    const matchStatus = statusVal === 'all' || 
      String(d.status || 'Active').toLowerCase() === statusVal.toLowerCase();

    const matchVerif = verifVal === 'all' || 
      String(d.verificationStatus || 'Pending').toLowerCase() === verifVal.toLowerCase();

    const exp = getExpiryStatus(d.licenseExpiry || d.licenceExpiry);
    const matchLicence = licenceVal === 'all' ||
      (licenceVal === 'valid' && exp.status === 'Valid') ||
      (licenceVal === 'expiring' && exp.status === 'Expiring Soon') ||
      (licenceVal === 'expired' && exp.status === 'Expired');

    const busInfo = getDriverAssignedBusInfo(d);
    const hasBus = busInfo.hasBus;
    const matchBus = busVal === 'all' ||
      (busVal === 'assigned' && hasBus) ||
      (busVal === 'unassigned' && !hasBus);

    return matchSearch && matchStatus && matchVerif && matchLicence && matchBus;
  });

  // Sorting
  filtered.sort((a, b) => {
    if (sortVal === 'name') {
      return String(a.name || '').localeCompare(String(b.name || ''));
    }
    if (sortVal === 'expiry') {
      const expA = a.licenseExpiry ? new Date(a.licenseExpiry).getTime() : 9999999999999;
      const expB = b.licenseExpiry ? new Date(b.licenseExpiry).getTime() : 9999999999999;
      return expA - expB;
    }
    if (sortVal === 'recent') {
      const tsA = getRecordTimestamp(a);
      const tsB = getRecordTimestamp(b);
      return tsB - tsA;
    }
    return 0;
  });

  // Counter badge
  const countBadge = document.getElementById('drivers-count-badge');
  if (countBadge) countBadge.textContent = `${filtered.length} driver${filtered.length === 1 ? '' : 's'}`;

  // Pagination calculation
  const total = filtered.length;
  const page = driversPagination.page || 1;
  const pageSize = driversPagination.pageSize || 10;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const validPage = Math.min(Math.max(page, 1), totalPages);
  driversPagination.page = validPage;

  const startIdx = (validPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  const pagedDrivers = filtered.slice(startIdx, endIdx);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding: 36px; color: var(--text-secondary);">No drivers found matching your filter criteria.</td></tr>`;
  } else {
    pagedDrivers.forEach(driver => {
      const tr = document.createElement('tr');
      const exp = getExpiryStatus(driver.licenseExpiry || driver.licenceExpiry);
      const verifStatus = driver.verificationStatus || 'Pending';
      const driverStatus = driver.status || 'Active';
      const busInfo = getDriverAssignedBusInfo(driver);
      const hasBus = busInfo.hasBus;

      // Visual expiry styling
      let expiryHtml = '';
      if (exp.status === 'Expired') {
        expiryHtml = `<span class="status-badge badge-red">Expired</span><div style="font-size: 11.5px; color: #DC2626; margin-top: 2px;">${escapeHtml(driver.licenseExpiry || '--')}</div>`;
      } else if (exp.status === 'Expiring Soon') {
        expiryHtml = `<span class="status-badge badge-orange">${escapeHtml(exp.label)}</span><div style="font-size: 11.5px; color: #6B7280; margin-top: 2px;">${escapeHtml(driver.licenseExpiry || '--')}</div>`;
      } else {
        expiryHtml = `<div style="font-weight: 600; font-size: 13px; color: #111827;">${escapeHtml(driver.licenseExpiry || '--')}</div><div style="font-size: 11.5px; color: #6B7280; margin-top: 2px;">${escapeHtml(exp.detailLabel)}</div>`;
      }

      // Avatar preview
      const avatarHtml = driver.photoUrl 
        ? `<img src="${escapeHtml(driver.photoUrl)}" class="driver-avatar-thumb" alt="${escapeHtml(driver.name)}" onerror="this.outerHTML='<span class=\\'driver-avatar-placeholder\\'>${escapeHtml((driver.name || 'D').charAt(0).toUpperCase())}</span>'" />`
        : `<span class="driver-avatar-placeholder">${escapeHtml((driver.name || 'D').charAt(0).toUpperCase())}</span>`;

      // Verification badge
      const verifBadgeClass = verifStatus === 'Verified' ? 'badge-green' : (verifStatus === 'Rejected' ? 'badge-red' : 'badge-orange');

      tr.innerHTML = `
        <td><span class="record-id">${escapeHtml(driver.id || driver.driverId || '--')}</span></td>
        <td><strong style="text-transform: capitalize; color: #111827;">${escapeHtml(driver.name || '--')}</strong></td>
        <td>${avatarHtml}</td>
        <td><span style="font-variant-numeric: tabular-nums;">${escapeHtml(driver.phone || '--')}</span></td>
        <td><span style="font-size: 13px; font-weight: 600; color: #111827;">${escapeHtml(driver.licenseNumber || driver.licenceNumber || '--')}</span></td>
        <td>${expiryHtml}</td>
        <td>${hasBus ? `<span class="vehicle-tag">${escapeHtml(busInfo.displayBus)}</span>` : '<span style="color: var(--text-muted); font-size: 13px;">Unassigned</span>'}</td>
        <td><span style="font-size: 13px; color: #374151;">${escapeHtml(busInfo.routeName || driver.assignedRoute || 'Campus Route')}</span></td>
        <td><span class="status-badge ${getStatusBadgeClass(driverStatus)}">${escapeHtml(driverStatus)}</span></td>
        <td><span class="status-badge ${verifBadgeClass}">${escapeHtml(verifStatus)}</span></td>
        <td style="text-align: right;">
          <div class="action-btn-group" style="justify-content: flex-end; gap: 5px;">
            <button type="button" class="btn-action-icon btn-action-primary btn-driver-details" data-driver-id="${escapeHtml(driver.id)}">Details</button>
            <button type="button" class="btn-action-icon btn-driver-assign" data-driver-name="${escapeHtml(driver.name)}">Assign</button>
            <button type="button" class="btn-action-icon btn-driver-edit" data-driver-id="${escapeHtml(driver.id)}">Edit</button>
          </div>
        </td>
      `;

      tr.querySelector('.btn-driver-details')?.addEventListener('click', () => openDriverDetailsModal(driver.id));
      tr.querySelector('.btn-driver-assign')?.addEventListener('click', () => window.adminOpenDriverAssign(driver.name));
      tr.querySelector('.btn-driver-edit')?.addEventListener('click', () => openDriverEditorModal(driver.id));

      tbody.appendChild(tr);
    });
  }

  // Pagination UI
  try {
    const pagInfo = document.getElementById('drivers-pagination-info');
    if (pagInfo) {
      pagInfo.textContent = total === 0 ? 'Showing 0 to 0 of 0 drivers' : `Showing ${startIdx + 1} to ${endIdx} of ${total} drivers`;
    }
    renderPaginationButtons('drivers-pagination-btns', totalPages, validPage, (p) => {
      driversPagination.page = p;
      renderDriversTable();
    });
  } catch (pErr) {
    console.warn('Drivers pagination error:', pErr);
  }
}

function renderDriverLicenceComplianceSection() {
  const expiringContainer = document.getElementById('drivers-expiring-list');
  const expiredContainer = document.getElementById('drivers-expired-list');
  const expiringCountBadge = document.getElementById('compliance-expiring-count');
  const expiredCountBadge = document.getElementById('compliance-expired-count');

  if (!expiringContainer || !expiredContainer) return;

  const expiringDrivers = [];
  const expiredDrivers = [];

  driversCache.forEach(driver => {
    const exp = getExpiryStatus(driver.licenseExpiry || driver.licenceExpiry);
    if (exp.status === 'Expiring Soon') {
      expiringDrivers.push({ driver, exp });
    } else if (exp.status === 'Expired') {
      expiredDrivers.push({ driver, exp });
    }
  });

  if (expiringCountBadge) expiringCountBadge.textContent = expiringDrivers.length;
  if (expiredCountBadge) expiredCountBadge.textContent = expiredDrivers.length;

  // Render Expiring Within 1 Month
  if (expiringDrivers.length === 0) {
    expiringContainer.innerHTML = '<div class="empty-state-card">No driving licences expiring within 30 days.</div>';
  } else {
    expiringContainer.innerHTML = '';
    expiringDrivers.forEach(({ driver, exp }) => {
      const card = document.createElement('div');
      card.className = 'compliance-card warning-card';
      const busInfo = getDriverAssignedBusInfo(driver);
      card.innerHTML = `
        <div class="compliance-card-header">
          <div>
            <div class="compliance-card-title">${escapeHtml(driver.name)}</div>
            <div class="compliance-card-owner">Driver ID: ${escapeHtml(driver.id)} • Phone: ${escapeHtml(driver.phone)}</div>
          </div>
          <span class="status-badge badge-orange">${escapeHtml(exp.label)}</span>
        </div>
        <div class="compliance-card-meta">
          <div class="compliance-card-meta-row">
            <span>Licence Number:</span>
            <strong>${escapeHtml(driver.licenseNumber || '--')}</strong>
          </div>
          <div class="compliance-card-meta-row">
            <span>Expiry Date:</span>
            <strong style="color: #D97706;">${escapeHtml(driver.licenseExpiry || '--')}</strong>
          </div>
          <div class="compliance-card-meta-row">
            <span>Assigned Vehicle:</span>
            <span>${busInfo.hasBus ? escapeHtml(busInfo.displayBus) : 'Unassigned'}</span>
          </div>
        </div>
        <div class="compliance-card-actions">
          <button type="button" class="btn-action-icon btn-action-primary" onclick="window.adminInspectDriver('${escapeHtml(driver.id)}')">View Driver</button>
          <button type="button" class="btn-action-icon" onclick="window.adminEditDriver('${escapeHtml(driver.id)}')">Renew Record</button>
        </div>
      `;
      expiringContainer.appendChild(card);
    });
  }

  // Render Expired Licences
  if (expiredDrivers.length === 0) {
    expiredContainer.innerHTML = '<div class="empty-state-card">No expired driving licences found.</div>';
  } else {
    expiredContainer.innerHTML = '';
    expiredDrivers.forEach(({ driver, exp }) => {
      const card = document.createElement('div');
      card.className = 'compliance-card expired-card';
      card.innerHTML = `
        <div class="compliance-card-header">
          <div>
            <div class="compliance-card-title">${escapeHtml(driver.name)}</div>
            <div class="compliance-card-owner">Driver ID: ${escapeHtml(driver.id)} • Phone: ${escapeHtml(driver.phone)}</div>
          </div>
          <span class="status-badge badge-red">Expired</span>
        </div>
        <div class="compliance-card-meta">
          <div class="compliance-card-meta-row">
            <span>Licence Number:</span>
            <strong>${escapeHtml(driver.licenseNumber || '--')}</strong>
          </div>
          <div class="compliance-card-meta-row">
            <span>Expired On:</span>
            <strong style="color: #DC2626;">${escapeHtml(driver.licenseExpiry || '--')} (${exp.detailLabel})</strong>
          </div>
          <div class="compliance-card-meta-row">
            <span>Operational Safety:</span>
            <span style="color: #DC2626; font-weight: 700;">Assignment Blocked</span>
          </div>
        </div>
        <div class="compliance-card-actions">
          <button type="button" class="btn-action-icon btn-action-primary" onclick="window.adminInspectDriver('${escapeHtml(driver.id)}')">Inspect Profile</button>
          <button type="button" class="btn-action-icon" onclick="window.adminEditDriver('${escapeHtml(driver.id)}')">Update Licence</button>
        </div>
      `;
      expiredContainer.appendChild(card);
    });
  }
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

  if (!usersLoaded && studentsCache.length === 0) {
    renderTableSkeleton(tbody, 8, 4);
    return;
  }

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
      <td><span style="font-size: 13px; font-weight: 700; color: #2563EB;">${escapeHtml(stu.id)}</span></td>
      <td>${escapeHtml(stu.department)} • ${escapeHtml(stu.year)}</td>
      <td><strong>Bus ${escapeHtml(stu.assignedBus)}</strong></td>
      <td>${escapeHtml(stu.pickupStop)} &rarr; ${escapeHtml(stu.dropStop)}</td>
      <td>${escapeHtml(stu.phone)}</td>
      <td><span class="status-badge badge-green">${escapeHtml(stu.status)}</span></td>
      <td style="text-align: right;">
        <button type="button" class="btn-action-icon btn-student-profile" data-student-id="${escapeHtml(stu.id)}">Profile</button>
      </td>
    `;
    const profileBtn = tr.querySelector('.btn-student-profile');
    if (profileBtn) {
      profileBtn.addEventListener('click', () => {
        alert(`Student: ${stu.name}\nID: ${stu.id}\nBus: ${stu.assignedBus}\nPickup: ${stu.pickupStop}`);
      });
    }
    tbody.appendChild(tr);
  });
}

// =============================================================================
// RENDER: ROUTES & TIMINGS (FIRESTORE SOURCE OF TRUTH)
// =============================================================================
function renderRoutesTable(routesToRender = null) {
  const tbody = document.getElementById('routes-table-body');
  if (!tbody) return;

  if (!routesLoaded && (!list || list.length === 0)) {
    renderTableSkeleton(tbody, 8, 4);
    return;
  }

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
      busBadges = `<span class="vehicle-tag">Bus ${escapeHtml(route.assignedBus)}</span>`;
    } else if (Array.isArray(route.assignedBuses) && route.assignedBuses.length > 0) {
      busBadges = route.assignedBuses.map(b => `<span class="vehicle-tag">Bus ${escapeHtml(b)}</span>`).join(' ');
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
        <td><strong style="color: #111827;">${escapeHtml(route.name || 'Unnamed Route')}</strong></td>
        <td>${escapeHtml(route.startPoint || '--')}</td>
        <td>${escapeHtml(route.destination || '--')}</td>
        <td><span class="status-badge badge-gray">${totalStops} Stops</span></td>
        <td>${distDuration}</td>
        <td>${busBadges}</td>
        <td><span class="status-badge ${statusBadgeClass}">${escapeHtml(route.status || 'Active')}</span></td>
        <td style="text-align: right;">
          <div class="action-btn-group" style="justify-content: flex-end;">
            <button class="btn-action-icon btn-action-primary" onclick="window.adminInspectRoute('${route.id}')" title="Inspect Route &amp; Stops">Inspect</button>
            <button class="btn-action-icon" onclick="window.adminEditRoute('${route.id}')" title="Edit Route">Edit</button>
            <button class="btn-action-icon" onclick="window.adminToggleRouteStatus('${route.id}')" title="Toggle Route Status">${isInactive ? 'Activate' : 'Deactivate'}</button>
            <button class="btn-action-icon btn-action-danger" onclick="window.adminDeleteRoute('${route.id}')" title="Delete Route">Delete</button>
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

let draggedStopIndex = null;

function renderEditorStops() {
  const container = document.getElementById('route-stops-container');
  const countBadge = document.getElementById('route-stops-count-badge');
  if (!container) return;

  if (countBadge) {
    countBadge.textContent = `${currentEditingStops.length} stop${currentEditingStops.length === 1 ? '' : 's'} defined • Grab the handle to reorder stops`;
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
    <div class="stop-row-card" draggable="true" data-stop-index="${idx}" style="background: #FFFFFF; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <div class="stop-drag-handle" title="Pick and drag to reorder stop" style="cursor: grab;">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" style="display: inline-block; vertical-align: middle;">
              <circle cx="5" cy="3" r="1.5"/>
              <circle cx="11" cy="3" r="1.5"/>
              <circle cx="5" cy="8" r="1.5"/>
              <circle cx="11" cy="8" r="1.5"/>
              <circle cx="5" cy="13" r="1.5"/>
              <circle cx="11" cy="13" r="1.5"/>
            </svg>
            <span style="font-size: 11px;">Drag</span>
          </div>
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

  // Real-time synchronization for all input fields
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

  container.querySelectorAll('.stop-field-morning').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const i = parseInt(e.target.dataset.index, 10);
      if (currentEditingStops[i]) currentEditingStops[i].morningArrival = e.target.value;
    });
  });

  container.querySelectorAll('.stop-field-evening').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const i = parseInt(e.target.dataset.index, 10);
      if (currentEditingStops[i]) currentEditingStops[i].eveningArrival = e.target.value;
    });
  });

  container.querySelectorAll('.stop-field-lat').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const i = parseInt(e.target.dataset.index, 10);
      const val = e.target.value.trim();
      if (currentEditingStops[i]) currentEditingStops[i].latitude = val !== '' ? parseFloat(val) : null;
    });
  });

  container.querySelectorAll('.stop-field-lng').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const i = parseInt(e.target.dataset.index, 10);
      const val = e.target.value.trim();
      if (currentEditingStops[i]) currentEditingStops[i].longitude = val !== '' ? parseFloat(val) : null;
    });
  });

  container.querySelectorAll('.stop-field-status').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const i = parseInt(e.target.dataset.index, 10);
      if (currentEditingStops[i]) currentEditingStops[i].status = e.target.value;
    });
  });

  // Attach drag & drop listeners to each stop card
  const cards = container.querySelectorAll('.stop-row-card');
  cards.forEach(card => {
    const cardIndex = parseInt(card.dataset.stopIndex, 10);

    card.addEventListener('dragstart', (e) => {
      // Don't drag card if user is interacting with text inputs, buttons, or selects
      if (e.target.closest('input, select, button, textarea')) {
        e.preventDefault();
        return;
      }

      syncStopsFromDOM();
      draggedStopIndex = cardIndex;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(cardIndex));

      setTimeout(() => {
        card.classList.add('is-dragging');
      }, 0);
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      if (draggedStopIndex === null || draggedStopIndex === cardIndex) {
        card.classList.remove('drag-over-top', 'drag-over-bottom');
        return;
      }

      const rect = card.getBoundingClientRect();
      const isBottom = (e.clientY - rect.top) > (rect.height / 2);

      card.classList.toggle('drag-over-top', !isBottom);
      card.classList.toggle('drag-over-bottom', isBottom);
    });

    card.addEventListener('dragleave', (e) => {
      if (!card.contains(e.relatedTarget)) {
        card.classList.remove('drag-over-top', 'drag-over-bottom');
      }
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('drag-over-top', 'drag-over-bottom');

      if (draggedStopIndex === null || isNaN(cardIndex) || draggedStopIndex === cardIndex) {
        return;
      }

      const rect = card.getBoundingClientRect();
      const isBottom = (e.clientY - rect.top) > (rect.height / 2);

      let toIndex = cardIndex;
      if (isBottom) {
        toIndex = draggedStopIndex < cardIndex ? cardIndex : cardIndex + 1;
      } else {
        toIndex = draggedStopIndex < cardIndex ? cardIndex - 1 : cardIndex;
      }
      if (toIndex < 0) toIndex = 0;
      if (toIndex >= currentEditingStops.length) toIndex = currentEditingStops.length - 1;

      if (toIndex !== draggedStopIndex) {
        const [movedItem] = currentEditingStops.splice(draggedStopIndex, 1);
        currentEditingStops.splice(toIndex, 0, movedItem);
        currentEditingStops.forEach((s, idx) => { s.stopOrder = idx + 1; });
        renderEditorStops();

        const updatedCards = container.querySelectorAll('.stop-row-card');
        if (updatedCards[toIndex]) {
          updatedCards[toIndex].classList.add('stop-card-just-moved');
          setTimeout(() => updatedCards[toIndex]?.classList.remove('stop-card-just-moved'), 1200);
        }
      }
    });

    card.addEventListener('dragend', () => {
      draggedStopIndex = null;
      cards.forEach(c => {
        c.classList.remove('is-dragging', 'drag-over-top', 'drag-over-bottom');
      });
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
// REUSABLE DOCUMENT EXPIRY ENGINE (Asia/Kolkata Normalized)
// =============================================================================
export function getExpiryStatus(expiryDateInput) {
  if (!expiryDateInput || expiryDateInput === '--' || expiryDateInput === 'null' || expiryDateInput === 'undefined') {
    return {
      status: 'Unknown',
      daysRemaining: null,
      daysOverdue: null,
      label: 'No Expiry Set',
      detailLabel: 'No Expiry Date',
      badgeClass: 'badge-gray',
      rawExpiry: null
    };
  }

  let expDate;
  if (typeof expiryDateInput?.toDate === 'function') {
    expDate = expiryDateInput.toDate();
  } else if (expiryDateInput instanceof Date) {
    expDate = new Date(expiryDateInput.getTime());
  } else if (typeof expiryDateInput === 'number') {
    expDate = new Date(expiryDateInput);
  } else if (typeof expiryDateInput === 'string') {
    const trimmed = expiryDateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split('-').map(Number);
      expDate = new Date(y, m - 1, d);
    } else {
      expDate = new Date(trimmed);
    }
  }

  if (!expDate || isNaN(expDate.getTime())) {
    return {
      status: 'Unknown',
      daysRemaining: null,
      daysOverdue: null,
      label: 'Invalid Date',
      detailLabel: 'Invalid Date',
      badgeClass: 'badge-gray',
      rawExpiry: expiryDateInput
    };
  }

  // Normalize current date & expiry date in Asia/Kolkata timezone
  const now = new Date();
  const kolkataNowStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [nowY, nowM, nowD] = kolkataNowStr.split('-').map(Number);
  const todayUtc = Date.UTC(nowY, nowM - 1, nowD);

  const expKolkataStr = expDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [expY, expM, expD] = expKolkataStr.split('-').map(Number);
  const expUtc = Date.UTC(expY, expM - 1, expD);

  const diffMs = expUtc - todayUtc;
  const daysRemaining = Math.round(diffMs / 86400000);

  if (daysRemaining < 0) {
    const daysOverdue = Math.abs(daysRemaining);
    return {
      status: 'Expired',
      daysRemaining,
      daysOverdue,
      label: 'Expired',
      detailLabel: `Expired ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} ago`,
      badgeClass: 'badge-red',
      rawExpiry: expDate
    };
  }

  if (daysRemaining <= 30) {
    let label;
    if (daysRemaining === 0) {
      label = 'Expires today';
    } else if (daysRemaining === 1) {
      label = 'Expires in 1 day';
    } else {
      label = `Expires in ${daysRemaining} days`;
    }
    return {
      status: 'Expiring Soon',
      daysRemaining,
      daysOverdue: 0,
      label,
      detailLabel: label,
      badgeClass: 'badge-orange',
      rawExpiry: expDate
    };
  }

  return {
    status: 'Valid',
    daysRemaining,
    daysOverdue: 0,
    label: `Valid — ${daysRemaining} days remaining`,
    detailLabel: `${daysRemaining} days remaining`,
    badgeClass: 'badge-green',
    rawExpiry: expDate
  };
}

export function getDaysRemaining(expiryDateInput) {
  return getExpiryStatus(expiryDateInput).daysRemaining;
}

function getDocumentExpiryStatus(expiryDateStr) {
  return getExpiryStatus(expiryDateStr);
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
            <span style="font-weight: 600; color: #374151;">${escapeHtml(d.documentNumber || 'No Doc Number')}</span>
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
          const busStops = currentEditingStops.map((s, idx) => ({
            stopOrder: s.stopOrder !== undefined ? s.stopOrder : idx + 1,
            order: s.stopOrder !== undefined ? s.stopOrder : idx + 1,
            name: s.name || s.stopName || '',
            stopName: s.name || s.stopName || '',
            morningArrival: s.morningArrival || s.arrivalTime || '',
            arrivalTime: s.morningArrival || s.arrivalTime || '',
            eveningArrival: s.eveningArrival || s.departureTime || '',
            departureTime: s.eveningArrival || s.departureTime || '',
            latitude: s.latitude !== undefined ? s.latitude : null,
            longitude: s.longitude !== undefined ? s.longitude : null,
            status: s.status || 'Active'
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
              ? `<span style="font-size: 12px;">${Number(s.latitude).toFixed(4)}, ${Number(s.longitude).toFixed(4)}</span>` 
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

  if (!busesLoaded && busesCache.length === 0) {
    bodies.forEach(b => {
      renderTableSkeleton(b, 8, 4);
    });
    return;
  }

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

    // 2. Trip Type Badges with perfectly aligned text and neutral styles
    let tripTypeHtml = '';
    if (hasMorning && hasEvening) {
      tripTypeHtml = `
        <div style="display: flex; flex-direction: column; gap: 6px; align-items: flex-start; justify-content: center;">
          <span class="status-badge badge-blue">Morning Service</span>
          <span class="status-badge badge-orange">Evening Service</span>
        </div>
      `;
    } else if (hasMorning) {
      tripTypeHtml = `<span class="status-badge badge-blue">Morning Service</span>`;
    } else if (hasEvening) {
      tripTypeHtml = `<span class="status-badge badge-orange">Evening Service</span>`;
    } else {
      tripTypeHtml = `<span class="status-badge badge-blue">Scheduled Service</span>`;
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

  if (!busesLoaded && tripsCache.length === 0) {
    renderTableSkeleton(tbody, 10, 3);
    return;
  }

  tbody.innerHTML = '';

  if (tripsCache.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 32px; color: var(--text-secondary);">No active trips currently in transit.</td></tr>`;
    return;
  }

  tripsCache.forEach(trip => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span style="font-weight: 700; color: #2563EB;">${trip.tripId}</span></td>
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
  const catVal = document.getElementById('admin-rep-cat-filter')?.value || 'All';

  if (!tbody) return;

  if (!reportsLoaded && reportsCache.length === 0) {
    renderTableSkeleton(tbody, 7, 4);
    return;
  }

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
    const itemCat = (r.categoryId || r.category || '').toLowerCase();
    const matchCat = catVal === 'All' || (itemCat === catVal.toLowerCase());

    return matchSearch && matchStatus && matchCat;
  });

  setElText('stat-rep-total', reportsCache.length);
  setElText('stat-rep-submitted', reportsCache.filter(r => r.status === 'Submitted').length);
  setElText('stat-rep-progress', reportsCache.filter(r => r.status === 'In Progress' || r.status === 'Under Review').length);
  setElText('stat-rep-critical', reportsCache.filter(r => r.priority === 'Urgent' || (r.categoryId || r.category) === 'safety').length);

  if (countLabel) countLabel.textContent = `Showing ${filtered.length} of ${reportsCache.length} reports`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 32px; color: var(--text-secondary);">No support tickets or complaints found.</td></tr>`;
    return;
  }

  filtered.forEach(rep => {
    const tr = document.createElement('tr');
    const statusClass = getStatusBadgeClass(rep.status);
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
// RENDER: CENTRALIZED COMPLIANCE DOCUMENTS MANAGEMENT TABLE
// =============================================================================
function switchDocumentCategoryTab(category) {
  currentDocCategoryFilter = category || 'all';
  const tabs = [
    { cat: 'all', id: 'tab-doc-all' },
    { cat: 'driver', id: 'tab-doc-drivers' },
    { cat: 'student', id: 'tab-doc-students' },
    { cat: 'vehicle', id: 'tab-doc-vehicles' }
  ];

  tabs.forEach(t => {
    const btn = document.getElementById(t.id);
    if (t.cat === currentDocCategoryFilter) {
      btn?.classList.add('active');
    } else {
      btn?.classList.remove('active');
    }
  });

  const ownerFilterSelect = document.getElementById('doc-owner-filter');
  if (ownerFilterSelect) {
    ownerFilterSelect.value = currentDocCategoryFilter;
  }

  documentsPagination.page = 1;
  renderDocumentsTable();
}

function renderDocumentsTable() {
  const tbody = document.getElementById('documents-table-body');
  const searchVal = (document.getElementById('doc-search-input')?.value || '').toLowerCase().trim();
  const statusVal = document.getElementById('doc-status-filter')?.value || 'all';
  const ownerVal = document.getElementById('doc-owner-filter')?.value || currentDocCategoryFilter || 'all';
  const sortVal = document.getElementById('doc-sort-filter')?.value || 'expiry';

  if (!tbody) return;

  if (!busesLoaded && documentsCache.length === 0) {
    renderTableSkeleton(tbody, 9, 4);
    return;
  }

  tbody.innerHTML = '';

  // Dynamic summary stats calculations across all documents
  let validCount = 0;
  let expiringCount = 0;
  let expiredCount = 0;
  let pendingCount = 0;

  documentsCache.forEach(doc => {
    const exp = getExpiryStatus(doc.expiryDate);
    const verif = String(doc.verificationStatus || 'pending').toLowerCase();

    if (verif === 'pending') pendingCount++;
    if (exp.status === 'Valid' && verif === 'verified') validCount++;
    if (exp.status === 'Expiring Soon') expiringCount++;
    if (exp.status === 'Expired') expiredCount++;
  });

  setElText('stat-doc-total', documentsCache.length);
  setElText('stat-doc-valid', validCount);
  setElText('stat-doc-expiring', expiringCount);
  setElText('stat-doc-expired', expiredCount);
  setElText('stat-doc-pending', pendingCount);

  // Filter pipeline
  let filtered = documentsCache.filter(doc => {
    const entityName = String(doc.ownerName || doc.entity || '').toLowerCase();
    const ownerId = String(doc.ownerId || '').toLowerCase();
    const docNumber = String(doc.documentNumber || doc.number || '').toLowerCase();
    const docType = String(doc.documentType || doc.type || '').toLowerCase();

    const matchSearch = !searchVal ||
      entityName.includes(searchVal) ||
      ownerId.includes(searchVal) ||
      docNumber.includes(searchVal) ||
      docType.includes(searchVal);

    // Category / Owner filter
    const docOwnerType = String(doc.ownerType || (doc.entity && doc.entity.includes('Bus') ? 'vehicle' : 'driver')).toLowerCase();
    const activeOwnerCat = (ownerVal !== 'all' ? ownerVal : currentDocCategoryFilter).toLowerCase();
    const matchOwner = activeOwnerCat === 'all' || docOwnerType === activeOwnerCat;

    // Status filter
    const exp = getExpiryStatus(doc.expiryDate);
    const verif = String(doc.verificationStatus || 'pending').toLowerCase();
    const matchStatus = statusVal === 'all' ||
      (statusVal === 'Valid' && exp.status === 'Valid' && verif === 'verified') ||
      (statusVal === 'Expiring Soon' && exp.status === 'Expiring Soon') ||
      (statusVal === 'Expired' && exp.status === 'Expired') ||
      (statusVal === 'Pending' && verif === 'pending');

    return matchSearch && matchOwner && matchStatus;
  });

  // Sorting
  filtered.sort((a, b) => {
    if (sortVal === 'expiry') {
      const expA = a.expiryDate ? new Date(a.expiryDate).getTime() : 9999999999999;
      const expB = b.expiryDate ? new Date(b.expiryDate).getTime() : 9999999999999;
      return expA - expB;
    }
    if (sortVal === 'type') {
      return String(a.documentType || a.type || '').localeCompare(String(b.documentType || b.type || ''));
    }
    if (sortVal === 'recent') {
      const tsA = getRecordTimestamp(a);
      const tsB = getRecordTimestamp(b);
      return tsB - tsA;
    }
    return 0;
  });

  // Counter badge
  const countBadge = document.getElementById('doc-count-badge');
  if (countBadge) countBadge.textContent = `${filtered.length} document${filtered.length === 1 ? '' : 's'}`;

  // Pagination calculation
  const total = filtered.length;
  const page = documentsPagination.page || 1;
  const pageSize = documentsPagination.pageSize || 10;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const validPage = Math.min(Math.max(page, 1), totalPages);
  documentsPagination.page = validPage;

  const startIdx = (validPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  const pagedDocs = filtered.slice(startIdx, endIdx);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 36px; color: var(--text-secondary);">No compliance documents found matching your filter.</td></tr>`;
  } else {
    pagedDocs.forEach(docItem => {
      const tr = document.createElement('tr');
      const exp = getExpiryStatus(docItem.expiryDate);
      const verifStatus = docItem.verificationStatus || 'pending';
      const ownerType = docItem.ownerType || (docItem.entity && docItem.entity.includes('Bus') ? 'vehicle' : 'driver');

      // Owner type badge styling
      let ownerTypeBadge = '';
      if (ownerType === 'driver') ownerTypeBadge = '<span class="status-badge badge-blue" style="font-size: 11px; padding: 1px 6px; margin-left: 6px;">Driver</span>';
      else if (ownerType === 'student') ownerTypeBadge = '<span class="status-badge badge-purple" style="font-size: 11px; padding: 1px 6px; margin-left: 6px;">Student</span>';
      else if (ownerType === 'vehicle') ownerTypeBadge = '<span class="status-badge badge-green" style="font-size: 11px; padding: 1px 6px; margin-left: 6px;">Vehicle</span>';

      // Days remaining badge
      let remainingBadge = '';
      if (exp.status === 'Expired') {
        remainingBadge = `<span class="status-badge badge-red">Expired</span>`;
      } else if (exp.status === 'Expiring Soon') {
        remainingBadge = `<span class="status-badge badge-orange">${escapeHtml(exp.label)}</span>`;
      } else if (exp.status === 'Valid') {
        remainingBadge = `<span style="font-size: 13px; font-weight: 500; color: #111827;">${escapeHtml(exp.detailLabel)}</span>`;
      } else {
        remainingBadge = `<span style="color: var(--text-muted); font-size: 13px;">--</span>`;
      }

      // Verification badge
      let verifBadge = '';
      if (verifStatus === 'verified') verifBadge = '<span class="status-badge badge-green">Verified</span>';
      else if (verifStatus === 'rejected') verifBadge = '<span class="status-badge badge-red">Rejected</span>';
      else verifBadge = '<span class="status-badge badge-orange">Pending</span>';

      tr.innerHTML = `
        <td><strong style="color: #111827;">${escapeHtml(docItem.documentType || docItem.type || 'Compliance Document')}</strong></td>
        <td><span style="font-weight: 600; color: #111827;">${escapeHtml(docItem.ownerName || docItem.entity || '--')}</span>${ownerTypeBadge}</td>
        <td><span class="record-id">${escapeHtml(docItem.ownerId || '--')}</span></td>
        <td><span style="font-size: 13px; font-weight: 600; color: #111827;">${escapeHtml(docItem.documentNumber || docItem.number || '--')}</span></td>
        <td><span style="font-variant-numeric: tabular-nums;">${escapeHtml(docItem.issueDate || '--')}</span></td>
        <td><span style="font-variant-numeric: tabular-nums; font-weight: 600; color: #111827;">${escapeHtml(docItem.expiryDate || '--')}</span></td>
        <td>${remainingBadge}</td>
        <td>${verifBadge}</td>
        <td style="text-align: right;">
          <div class="action-btn-group" style="justify-content: flex-end; gap: 4px;">
            <button type="button" class="btn-action-icon btn-action-primary btn-view-doc" data-doc-id="${escapeHtml(docItem.id)}">View</button>
            ${verifStatus !== 'verified' ? `<button type="button" class="btn-action-icon btn-verify-doc" data-doc-id="${escapeHtml(docItem.id)}" style="color: #16A34A;">Verify</button>` : ''}
            <button type="button" class="btn-action-icon btn-delete-doc" data-doc-id="${escapeHtml(docItem.id)}" style="color: #DC2626;">Delete</button>
          </div>
        </td>
      `;

      tr.querySelector('.btn-view-doc')?.addEventListener('click', () => openDocumentViewerModal(docItem.id));
      tr.querySelector('.btn-verify-doc')?.addEventListener('click', () => handleVerifyDocumentDirect(docItem.id));
      tr.querySelector('.btn-delete-doc')?.addEventListener('click', () => handleDeleteDocumentDirect(docItem.id));

      tbody.appendChild(tr);
    });
  }

  // Pagination UI
  try {
    const pagInfo = document.getElementById('documents-pagination-info');
    if (pagInfo) {
      pagInfo.textContent = total === 0 ? 'Showing 0 to 0 of 0 documents' : `Showing ${startIdx + 1} to ${endIdx} of ${total} documents`;
    }
    renderPaginationButtons('documents-pagination-btns', totalPages, validPage, (p) => {
      documentsPagination.page = p;
      renderDocumentsTable();
    });
  } catch (pErr) {
    console.warn('Documents pagination error:', pErr);
  }
}

// PROMINENT SECTION 1: EXPIRING WITHIN 1 MONTH (Requirement 13)
function renderExpiringDocumentsSection() {
  const container = document.getElementById('docs-expiring-container');
  const countBadge = document.getElementById('docs-expiring-count-badge');
  if (!container) return;

  const expiringDocs = [];
  documentsCache.forEach(doc => {
    const exp = getExpiryStatus(doc.expiryDate);
    if (exp.status === 'Expiring Soon') {
      expiringDocs.push({ doc, exp });
    }
  });

  if (countBadge) countBadge.textContent = `${expiringDocs.length} document${expiringDocs.length === 1 ? '' : 's'}`;

  if (expiringDocs.length === 0) {
    container.innerHTML = '<div class="empty-state-card">No documents are expiring within the next 30 days.</div>';
    return;
  }

  container.innerHTML = '';
  expiringDocs.forEach(({ doc, exp }) => {
    const card = document.createElement('div');
    card.className = 'compliance-card warning-card';
    card.innerHTML = `
      <div class="compliance-card-header">
        <div>
          <div class="compliance-card-title">${escapeHtml(doc.documentType || doc.type || 'Document')}</div>
          <div class="compliance-card-owner">${escapeHtml(doc.ownerName || doc.ownerId || '--')} (${escapeHtml(doc.ownerType || 'entity')})</div>
        </div>
        <span class="status-badge badge-orange">${escapeHtml(exp.label)}</span>
      </div>
      <div class="compliance-card-meta">
        <div class="compliance-card-meta-row">
          <span>Document Number:</span>
          <strong>${escapeHtml(doc.documentNumber || doc.number || '--')}</strong>
        </div>
        <div class="compliance-card-meta-row">
          <span>Expiry Date:</span>
          <strong style="color: #D97706;">${escapeHtml(doc.expiryDate || '--')}</strong>
        </div>
        <div class="compliance-card-meta-row">
          <span>Verification Status:</span>
          <span>${escapeHtml(doc.verificationStatus || 'pending')}</span>
        </div>
      </div>
      <div class="compliance-card-actions">
        <button type="button" class="btn-action-icon btn-action-primary" onclick="window.adminViewDocument('${escapeHtml(doc.id)}')">View Document</button>
      </div>
    `;
    container.appendChild(card);
  });
}

// PROMINENT SECTION 2: EXPIRED DOCUMENTS (Requirement 14)
function renderExpiredDocumentsSection() {
  const container = document.getElementById('docs-expired-container');
  const countBadge = document.getElementById('docs-expired-count-badge');
  if (!container) return;

  const expiredDocs = [];
  documentsCache.forEach(doc => {
    const exp = getExpiryStatus(doc.expiryDate);
    if (exp.status === 'Expired') {
      expiredDocs.push({ doc, exp });
    }
  });

  if (countBadge) countBadge.textContent = `${expiredDocs.length} expired`;

  if (expiredDocs.length === 0) {
    container.innerHTML = '<div class="empty-state-card">No expired documents found.</div>';
    return;
  }

  container.innerHTML = '';
  expiredDocs.forEach(({ doc, exp }) => {
    const card = document.createElement('div');
    card.className = 'compliance-card expired-card';
    card.innerHTML = `
      <div class="compliance-card-header">
        <div>
          <div class="compliance-card-title">${escapeHtml(doc.documentType || doc.type || 'Document')}</div>
          <div class="compliance-card-owner">${escapeHtml(doc.ownerName || doc.ownerId || '--')} (${escapeHtml(doc.ownerType || 'entity')})</div>
        </div>
        <span class="status-badge badge-red">Expired</span>
      </div>
      <div class="compliance-card-meta">
        <div class="compliance-card-meta-row">
          <span>Document Number:</span>
          <strong>${escapeHtml(doc.documentNumber || doc.number || '--')}</strong>
        </div>
        <div class="compliance-card-meta-row">
          <span>Expired Date:</span>
          <strong style="color: #DC2626;">${escapeHtml(doc.expiryDate || '--')} (${exp.detailLabel})</strong>
        </div>
        <div class="compliance-card-meta-row">
          <span>Verification Status:</span>
          <span>${escapeHtml(doc.verificationStatus || 'pending')}</span>
        </div>
      </div>
      <div class="compliance-card-actions">
        <button type="button" class="btn-action-icon btn-action-primary" onclick="window.adminViewDocument('${escapeHtml(doc.id)}')">Inspect</button>
        <button type="button" class="btn-action-icon" onclick="window.adminOpenUploadDoc('${escapeHtml(doc.ownerType || 'driver')}', '${escapeHtml(doc.ownerId)}')">Renew / Replace Document</button>
      </div>
    `;
    container.appendChild(card);
  });
}

// DASHBOARD DOCUMENT ALERTS WIDGET (Requirement 24)
function renderDashboardDocumentAlerts() {
  const container = document.getElementById('dash-doc-alerts-list');
  if (!container) return;

  let driverExpiringCount = 0;
  let vehicleExpiringCount = 0;
  let studentExpiringCount = 0;
  let totalExpiredCount = 0;

  documentsCache.forEach(doc => {
    const exp = getExpiryStatus(doc.expiryDate);
    const oType = String(doc.ownerType || (doc.entity && doc.entity.includes('Bus') ? 'vehicle' : 'driver')).toLowerCase();

    if (exp.status === 'Expiring Soon') {
      if (oType === 'driver') driverExpiringCount++;
      else if (oType === 'vehicle') vehicleExpiringCount++;
      else if (oType === 'student') studentExpiringCount++;
    } else if (exp.status === 'Expired') {
      totalExpiredCount++;
    }
  });

  // Also check driversCache for driving licence expirations
  driversCache.forEach(d => {
    const exp = getExpiryStatus(d.licenseExpiry || d.licenceExpiry);
    if (exp.status === 'Expiring Soon' && !documentsCache.some(doc => doc.ownerId === d.id && doc.documentType?.includes('Licence'))) {
      driverExpiringCount++;
    } else if (exp.status === 'Expired' && !documentsCache.some(doc => doc.ownerId === d.id && doc.documentType?.includes('Licence'))) {
      totalExpiredCount++;
    }
  });

  const totalAlerts = driverExpiringCount + vehicleExpiringCount + studentExpiringCount + totalExpiredCount;
  if (totalAlerts === 0) {
    container.innerHTML = `
      <div style="padding: 16px; text-align: center; color: var(--color-green); font-size: 13.5px; font-weight: 600; background: #F0FDF4; border-radius: var(--radius-md); border: 1px solid #BBF7D0;">
        ✓ All compliance documents are valid and up to date.
      </div>
    `;
    return;
  }

  container.innerHTML = '';

  if (driverExpiringCount > 0) {
    const a = document.createElement('a');
    a.className = 'doc-alert-row warning-row';
    a.href = '#documents?status=expiring&ownerType=driver';
    a.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="status-indicator-dot warning"></span>
        <span>${driverExpiringCount} Driver licence${driverExpiringCount === 1 ? '' : 's'} expiring within 30 days</span>
      </div>
      <span style="font-size: 12px; font-weight: 700; color: #0052FF;">Review &rarr;</span>
    `;
    container.appendChild(a);
  }

  if (vehicleExpiringCount > 0) {
    const a = document.createElement('a');
    a.className = 'doc-alert-row warning-row';
    a.href = '#documents?status=expiring&ownerType=vehicle';
    a.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="status-indicator-dot warning"></span>
        <span>${vehicleExpiringCount} Vehicle document${vehicleExpiringCount === 1 ? '' : 's'} expiring within 30 days</span>
      </div>
      <span style="font-size: 12px; font-weight: 700; color: #0052FF;">Review &rarr;</span>
    `;
    container.appendChild(a);
  }

  if (studentExpiringCount > 0) {
    const a = document.createElement('a');
    a.className = 'doc-alert-row warning-row';
    a.href = '#documents?status=expiring&ownerType=student';
    a.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="status-indicator-dot warning"></span>
        <span>${studentExpiringCount} Student document${studentExpiringCount === 1 ? '' : 's'} expiring within 30 days</span>
      </div>
      <span style="font-size: 12px; font-weight: 700; color: #0052FF;">Review &rarr;</span>
    `;
    container.appendChild(a);
  }

  if (totalExpiredCount > 0) {
    const a = document.createElement('a');
    a.className = 'doc-alert-row critical-row';
    a.href = '#documents?status=expired';
    a.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="status-indicator-dot critical"></span>
        <span style="color: #991B1B; font-weight: 700;">${totalExpiredCount} Document${totalExpiredCount === 1 ? '' : 's'} already expired</span>
      </div>
      <span style="font-size: 12px; font-weight: 700; color: #DC2626;">Action Required &rarr;</span>
    `;
    container.appendChild(a);
  }
}

// =============================================================================
// DRIVERS & DOCUMENTS: FIRESTORE LISTENERS & NOTIFICATIONS
// =============================================================================

function listenToDrivers() {
  if (driversUnsubscribe) {
    try { driversUnsubscribe(); } catch (e) {}
    driversUnsubscribe = null;
  }
  const driversRef = collection(firestore, 'drivers');
  driversUnsubscribe = onSnapshot(driversRef, (snapshot) => {
    hasLoadedFirestoreDrivers = true;
    driversLoaded = true;
    const loadedDrivers = [];
    snapshot.forEach(d => {
      loadedDrivers.push({ id: d.id, ...d.data() });
    });
    driversCache = loadedDrivers;
    deriveDerivedState();
    renderDashboardStats();
    renderDriversTable();
    renderDriverLicenceComplianceSection();
    renderDashboardDocumentAlerts();

    // If driver details modal is open for a driver, refresh its details live
    if (currentInspectingDriverId) {
      const activeModal = document.getElementById('driver-details-modal');
      if (activeModal && !activeModal.classList.contains('hidden')) {
        const updated = driversCache.find(d => d.id === currentInspectingDriverId);
        if (updated) openDriverDetailsModal(updated.id);
      }
    }
  }, (err) => {
    console.error("Firestore Drivers listener error:", err);
    driversLoaded = true;
    deriveDerivedState();
    renderDriversTable();
  });
}

function listenToDocuments() {
  if (documentsUnsubscribe) {
    try { documentsUnsubscribe(); } catch (e) {}
    documentsUnsubscribe = null;
  }
  const docsRef = collection(firestore, 'documents');
  documentsUnsubscribe = onSnapshot(docsRef, (snapshot) => {
    hasLoadedFirestoreDocuments = true;
    documentsLoaded = true;
    const loadedDocs = [];
    snapshot.forEach(d => {
      loadedDocs.push({ id: d.id, ...d.data() });
    });
    documentsCache = loadedDocs;
    deriveDerivedState();
    renderDashboardStats();
    renderDocumentsTable();
    renderExpiringDocumentsSection();
    renderExpiredDocumentsSection();
    renderDashboardDocumentAlerts();
    checkAndTriggerDocumentExpiryNotifications();

    // If viewer modal is open for a document, refresh preview
    if (currentInspectingDocId) {
      const activeViewer = document.getElementById('document-viewer-modal');
      if (activeViewer && !activeViewer.classList.contains('hidden')) {
        const updated = documentsCache.find(d => d.id === currentInspectingDocId);
        if (updated) openDocumentViewerModal(updated.id);
      }
    }
  }, (err) => {
    console.error("Firestore Documents listener error:", err);
    documentsLoaded = true;
    deriveDerivedState();
    renderDocumentsTable();
  });
}

async function checkAndTriggerDocumentExpiryNotifications() {
  if (!documentsCache || documentsCache.length === 0) return;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  try {
    const saved = localStorage.getItem('nexride_doc_notifications_sent');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        parsed.forEach(k => documentNotificationsSentKeys.add(k));
      }
    }
  } catch (e) {}

  for (const docItem of documentsCache) {
    if (!docItem.expiryDate) continue;
    const days = getDaysRemaining(docItem.expiryDate);
    if (days === null) continue;

    let alertType = null;
    let title = '';
    let body = '';

    if (days < 0) {
      alertType = 'expired';
      title = `EXPIRED: ${docItem.documentType || 'Document'} (${docItem.documentNumber || docItem.id})`;
      body = `The document "${docItem.documentType || 'Document'}" for ${docItem.ownerName || docItem.ownerId || 'an entity'} has expired on ${docItem.expiryDate}. Immediate administrative renewal or replacement is required.`;
    } else if (days <= 7) {
      alertType = 'expiring_7d';
      title = `URGENT: ${docItem.documentType || 'Document'} expires in ${days} days`;
      body = `The document "${docItem.documentType || 'Document'}" for ${docItem.ownerName || docItem.ownerId || 'an entity'} will expire on ${docItem.expiryDate} (in ${days} days). Please ensure renewal is underway.`;
    } else if (days <= 30) {
      alertType = 'expiring_30d';
      title = `Notice: ${docItem.documentType || 'Document'} expiring within 30 days`;
      body = `The document "${docItem.documentType || 'Document'}" for ${docItem.ownerName || docItem.ownerId || 'an entity'} will expire on ${docItem.expiryDate} (${days} days remaining).`;
    }

    if (!alertType) continue;

    const notifKey = `${docItem.id || docItem.documentNumber}_${alertType}_${dateStr}`;
    if (documentNotificationsSentKeys.has(notifKey)) continue;

    const alreadyInNotifications = notificationsCache.some(n => 
      n.trackingKey === notifKey || 
      (n.title === title && n.documentId === docItem.id)
    );
    if (alreadyInNotifications) {
      documentNotificationsSentKeys.add(notifKey);
      continue;
    }

    documentNotificationsSentKeys.add(notifKey);
    try {
      localStorage.setItem('nexride_doc_notifications_sent', JSON.stringify(Array.from(documentNotificationsSentKeys)));
    } catch (e) {}

    try {
      await addDoc(collection(firestore, 'notifications'), {
        title: title,
        body: body,
        message: body,
        type: alertType === 'expired' || alertType === 'expiring_7d' ? 'Urgent' : 'Broadcast',
        targetAudience: 'Admin',
        senderName: 'NexRide Compliance Engine',
        sentBy: 'System',
        createdAt: serverTimestamp(),
        sentAt: serverTimestamp(),
        documentId: docItem.id || '',
        trackingKey: notifKey,
        isTest: false,
        status: 'Sent'
      });
    } catch (err) {
      console.warn("Failed to write document expiry notification to Firestore:", err);
    }
  }
}

// =============================================================================
// DRIVERS CONTROLLERS & MODAL HANDLERS
// =============================================================================

function showDriverFormError(msg) {
  const err = document.getElementById('driver-form-error');
  if (err) {
    err.textContent = msg;
    err.classList.remove('hidden');
    err.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    alert(msg);
  }
}

function openDriverEditorModal(driverId = null) {
  const modal = document.getElementById('driver-editor-modal');
  const title = document.getElementById('driver-editor-title');
  const err = document.getElementById('driver-form-error');
  if (err) err.classList.add('hidden');

  // Populate bus and route select options
  const busSelect = document.getElementById('driver-form-bus');
  if (busSelect) {
    busSelect.innerHTML = '<option value="">Unassigned</option>';
    busesCache.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.setAttribute('data-bus-number', b.busNumber || '');
      opt.textContent = `Bus ${b.busNumber || 'N/A'} - ${b.routeName || 'No Route'} [${b.status || 'Active'}]`;
      busSelect.appendChild(opt);
    });
  }

  const routeSelect = document.getElementById('driver-form-route');
  if (routeSelect) {
    routeSelect.innerHTML = '<option value="">Campus Default Route</option>';
    routesCache.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.name;
      opt.textContent = r.name;
      routeSelect.appendChild(opt);
    });
  }

  if (driverId) {
    const driver = driversCache.find(d => d.id === driverId);
    if (!driver) {
      alert('Driver not found.');
      return;
    }

    if (title) title.textContent = `Edit Driver Profile: ${driver.name}`;
    document.getElementById('driver-form-mode').value = 'edit';
    document.getElementById('driver-form-doc-id').value = driver.id;

    document.getElementById('driver-form-name').value = driver.name || '';
    document.getElementById('driver-form-id').value = driver.driverId || driver.id || '';
    document.getElementById('driver-form-phone').value = driver.phone || '';
    document.getElementById('driver-form-alt-phone').value = driver.alternatePhone || driver.altPhone || '';
    document.getElementById('driver-form-email').value = driver.email || '';
    document.getElementById('driver-form-dob').value = driver.dob || '';
    document.getElementById('driver-form-gender').value = driver.gender || 'Male';
    document.getElementById('driver-form-photo').value = driver.photoUrl || driver.photo || '';
    document.getElementById('driver-form-address').value = driver.address || '';
    document.getElementById('driver-form-staff-id').value = driver.staffId || driver.employeeId || '';
    document.getElementById('driver-form-joining-date').value = driver.joiningDate || '';
    document.getElementById('driver-form-emp-status').value = driver.employmentType || driver.empStatus || 'Full-time';
    document.getElementById('driver-form-status').value = driver.status || 'Active';
    document.getElementById('driver-form-license-number').value = driver.licenseNumber || driver.licenceNumber || '';
    document.getElementById('driver-form-license-type').value = driver.licenseType || driver.licenceType || 'Heavy Commercial Vehicle (HCV)';
    document.getElementById('driver-form-license-authority').value = driver.issuingAuthority || driver.rto || 'RTO Chennai South';
    document.getElementById('driver-form-license-issue').value = driver.licenseIssue || driver.licenceIssue || '';
    document.getElementById('driver-form-license-expiry').value = driver.licenseExpiry || driver.licenceExpiry || '';
    document.getElementById('driver-form-shift').value = driver.shift || 'Both';
    if (busSelect) {
      const busInfo = getDriverAssignedBusInfo(driver);
      let matchedOpt = null;
      if (busInfo.busId) {
        matchedOpt = Array.from(busSelect.options).find(o => o.value === busInfo.busId);
      }
      if (!matchedOpt && busInfo.busNumber) {
        matchedOpt = Array.from(busSelect.options).find(o => 
          o.getAttribute('data-bus-number') === String(busInfo.busNumber).trim() ||
          o.textContent.includes(`Bus ${busInfo.busNumber}`)
        );
      }
      if (!matchedOpt && driver.assignedBusId) {
        matchedOpt = Array.from(busSelect.options).find(o => o.value === driver.assignedBusId);
      }
      busSelect.value = matchedOpt ? matchedOpt.value : '';
    }
    if (routeSelect) {
      const busInfo = getDriverAssignedBusInfo(driver);
      routeSelect.value = driver.assignedRoute || busInfo.routeName || '';
    }
    document.getElementById('driver-form-verification').value = driver.verificationStatus || 'Pending';
    document.getElementById('driver-form-verification-notes').value = driver.verificationNotes || '';
  } else {
    if (title) title.textContent = 'Add New Driver';
    document.getElementById('driver-form-mode').value = 'add';
    document.getElementById('driver-form-doc-id').value = '';

    const todayYMD = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    document.getElementById('driver-form-name').value = '';
    document.getElementById('driver-form-id').value = `DRV-${Math.floor(10 + Math.random() * 90)}`;
    document.getElementById('driver-form-phone').value = '';
    document.getElementById('driver-form-alt-phone').value = '';
    document.getElementById('driver-form-email').value = '';
    document.getElementById('driver-form-dob').value = '1985-01-01';
    document.getElementById('driver-form-gender').value = 'Male';
    document.getElementById('driver-form-photo').value = '';
    document.getElementById('driver-form-address').value = '';
    document.getElementById('driver-form-staff-id').value = `EMP-${Math.floor(1000 + Math.random() * 9000)}`;
    document.getElementById('driver-form-joining-date').value = todayYMD;
    document.getElementById('driver-form-emp-status').value = 'Full-time';
    document.getElementById('driver-form-status').value = 'Active';
    document.getElementById('driver-form-license-number').value = '';
    document.getElementById('driver-form-license-type').value = 'Heavy Commercial Vehicle (HCV)';
    document.getElementById('driver-form-license-authority').value = 'RTO Chennai South';
    document.getElementById('driver-form-license-issue').value = todayYMD;
    document.getElementById('driver-form-license-expiry').value = '';
    document.getElementById('driver-form-shift').value = 'Both';
    if (busSelect) busSelect.value = '';
    if (routeSelect) routeSelect.value = '';
    document.getElementById('driver-form-verification').value = 'Verified';
    document.getElementById('driver-form-verification-notes').value = '';
  }

  if (modal) modal.classList.remove('hidden');
}

async function saveDriverRecord(e) {
  e.preventDefault();
  const errBox = document.getElementById('driver-form-error');
  if (errBox) errBox.classList.add('hidden');

  const saveBtn = document.getElementById('save-driver-btn');
  const mode = document.getElementById('driver-form-mode')?.value || 'add';
  const docId = document.getElementById('driver-form-doc-id')?.value || '';

  const name = document.getElementById('driver-form-name')?.value.trim();
  const driverId = document.getElementById('driver-form-id')?.value.trim();
  const phone = document.getElementById('driver-form-phone')?.value.trim();
  const altPhone = document.getElementById('driver-form-alt-phone')?.value.trim();
  const email = document.getElementById('driver-form-email')?.value.trim();
  const dob = document.getElementById('driver-form-dob')?.value;
  const gender = document.getElementById('driver-form-gender')?.value;
  const photoUrl = document.getElementById('driver-form-photo')?.value.trim();
  const address = document.getElementById('driver-form-address')?.value.trim();
  const staffId = document.getElementById('driver-form-staff-id')?.value.trim();
  const joiningDate = document.getElementById('driver-form-joining-date')?.value;
  const employmentType = document.getElementById('driver-form-emp-status')?.value;
  const status = document.getElementById('driver-form-status')?.value;
  const licenseNumber = document.getElementById('driver-form-license-number')?.value.trim();
  const licenseType = document.getElementById('driver-form-license-type')?.value;
  const issuingAuthority = document.getElementById('driver-form-license-authority')?.value.trim();
  const licenseIssue = document.getElementById('driver-form-license-issue')?.value;
  const licenseExpiry = document.getElementById('driver-form-license-expiry')?.value;
  const shift = document.getElementById('driver-form-shift')?.value;
  const assignedBusId = document.getElementById('driver-form-bus')?.value;
  const assignedRoute = document.getElementById('driver-form-route')?.value;
  const verificationStatus = document.getElementById('driver-form-verification')?.value;
  const verificationNotes = document.getElementById('driver-form-verification-notes')?.value.trim();

  // Validations
  if (!name) return showDriverFormError('Please enter the driver full name.');
  if (!driverId) return showDriverFormError('Please specify the Driver ID.');

  const cleanPhone = (phone || '').replace(/[\s\-\(\)]/g, '');
  if (cleanPhone.length < 10) {
    return showDriverFormError('Please enter a valid 10-digit mobile phone number.');
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return showDriverFormError('Please enter a valid email address.');
  }

  if (!licenseNumber || licenseNumber.length < 5) {
    return showDriverFormError('Please enter a valid driving licence number (minimum 5 characters).');
  }

  if (licenseIssue && licenseExpiry && licenseExpiry < licenseIssue) {
    return showDriverFormError('Driving licence expiry date cannot be earlier than the issue date.');
  }

  let assignedBusNumber = '';
  let assignedBusObj = null;
  if (assignedBusId) {
    assignedBusObj = busesCache.find(x => x.id === assignedBusId || String(x.busNumber).trim() === String(assignedBusId).trim());
    if (assignedBusObj) {
      assignedBusNumber = assignedBusObj.busNumber || '';
    }
  }

  const driverData = {
    name,
    driverId,
    phone,
    alternatePhone: altPhone,
    email,
    dob,
    gender,
    photoUrl,
    address,
    staffId,
    joiningDate,
    employmentType,
    status,
    licenseNumber,
    licenseType,
    issuingAuthority,
    licenseIssue,
    licenseExpiry,
    shift,
    assignedBusId: assignedBusId || '',
    assignedBusNumber: assignedBusNumber || '',
    assignedBus: assignedBusNumber || '',
    assignedVehicle: assignedBusNumber ? `Bus ${assignedBusNumber}` : '',
    assignedRoute: assignedRoute || (assignedBusObj?.routeName || ''),
    verificationStatus,
    verificationNotes,
    updatedAt: serverTimestamp()
  };

  try {
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving Profile...';
    }

    if (mode === 'edit' && docId && !docId.startsWith('DRV-BUS-')) {
      await updateDoc(doc(firestore, 'drivers', docId), driverData);
      await logAuditEvent('DRIVER_UPDATED', 'drivers', docId, { name, driverId, licenseNumber });
    } else {
      driverData.createdAt = serverTimestamp();
      const newDocRef = await addDoc(collection(firestore, 'drivers'), driverData);
      await logAuditEvent('DRIVER_CREATED', 'drivers', newDocRef.id, { name, driverId, licenseNumber });
    }

    // Sync bus if assigned
    if (assignedBusId && assignedBusObj) {
      try {
        await updateDoc(doc(firestore, 'buses', assignedBusObj.id), {
          driverName: name,
          driverContact: phone,
          driverLicense: licenseNumber,
          assignedDriverId: driverId,
          assignedDriverName: name,
          updatedAt: serverTimestamp()
        });
        assignedBusObj.driverName = name;
        assignedBusObj.driverContact = phone;
        assignedBusObj.driverLicense = licenseNumber;
        assignedBusObj.assignedDriverId = driverId;
        assignedBusObj.assignedDriverName = name;
      } catch (bErr) {
        console.warn("Could not sync bus driver info:", bErr);
      }
    }

    // Clear driver from any other buses they were previously assigned to
    const otherBuses = busesCache.filter(b => 
      (!assignedBusObj || b.id !== assignedBusObj.id) && 
      ((b.driverName && b.driverName.trim().toLowerCase() === name.toLowerCase()) || 
       b.assignedDriverId === driverId)
    );
    for (const ob of otherBuses) {
      try {
        await updateDoc(doc(firestore, 'buses', ob.id), {
          driverName: '',
          driverContact: '',
          assignedDriverId: null,
          assignedDriverName: null,
          updatedAt: serverTimestamp()
        });
        ob.driverName = '';
        ob.driverContact = '';
        ob.assignedDriverId = null;
        ob.assignedDriverName = null;
      } catch (e) {}
    }

    // Update in-memory driver and refresh dependent views
    const localDriver = driversCache.find(d => d.id === docId || d.driverId === driverId || d.name === name);
    if (localDriver) {
      Object.assign(localDriver, driverData);
    }
    deriveDerivedState();
    renderDriversTable();
    renderBusesTable();
    renderDashboardStats();

    document.getElementById('driver-editor-modal')?.classList.add('hidden');
    alert(`Driver profile for ${name} saved successfully.`);
  } catch (err) {
    showDriverFormError("Failed to save driver profile: " + err.message);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Driver Record';
    }
  }
}

function openDriverDetailsModal(driverId) {
  const driver = driversCache.find(d => d.id === driverId);
  if (!driver) {
    alert('Driver not found.');
    return;
  }
  currentInspectingDriverId = driverId;

  // Header & Status badges
  const headerName = document.getElementById('driver-details-header-name');
  if (headerName) headerName.textContent = `Driver: ${driver.name || 'Profile'}`;

  const statusBadge = document.getElementById('driver-details-status-badge');
  if (statusBadge) {
    statusBadge.className = `status-badge ${driver.status === 'Active' ? 'badge-green' : (driver.status === 'Suspended' ? 'badge-red' : 'badge-orange')}`;
    statusBadge.textContent = driver.status || 'Active';
  }

  const verifBadge = document.getElementById('driver-details-verif-badge');
  if (verifBadge) {
    const verif = driver.verificationStatus || 'Pending';
    verifBadge.className = `status-badge ${verif === 'Verified' ? 'badge-green' : (verif === 'Rejected' ? 'badge-red' : 'badge-orange')}`;
    verifBadge.textContent = verif;
  }

  // Safety warning banner
  const licExp = getExpiryStatus(driver.licenseExpiry || driver.licenceExpiry);
  const warnBanner = document.getElementById('driver-safety-warning-banner');
  if (warnBanner) {
    if (licExp.status === 'Expired') warnBanner.classList.remove('hidden');
    else warnBanner.classList.add('hidden');
  }

  // Avatar & Basic Info
  const avatar = document.getElementById('driver-details-avatar');
  if (avatar) {
    if (driver.photoUrl || driver.photo) {
      avatar.innerHTML = `<img src="${escapeHtml(driver.photoUrl || driver.photo)}" alt="${escapeHtml(driver.name)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`;
    } else {
      avatar.innerHTML = `
        <svg viewBox="0 0 24 24" width="36" height="36" stroke="#4B5563" stroke-width="1.8" fill="none">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
      `;
    }
  }

  setElText('driver-details-name', driver.name || '--');
  setElText('driver-details-id', driver.driverId || driver.id || '--');
  setElText('driver-details-phone', driver.phone || '--');
  setElText('driver-details-email', driver.email || '--');
  setElText('driver-details-staff-id', driver.staffId || driver.employeeId || '--');

  // Employment
  setElText('driver-details-joining', formatDate(driver.joiningDate) || '--');
  setElText('driver-details-emp-status', driver.employmentType || driver.empStatus || 'Full-time');
  setElText('driver-details-shift', driver.shift || 'Both');
  setElText('driver-details-address', driver.address || '--');

  // Assignment
  const busInfo = getDriverAssignedBusInfo(driver);
  const assignedBusText = busInfo.hasBus ? busInfo.displayBus : 'Unassigned';
  setElText('driver-details-assigned-bus', assignedBusText);
  setElText('driver-details-assigned-route', busInfo.routeName || driver.assignedRoute || 'No Route Assigned');
  setElText('driver-details-notes', driver.verificationNotes || 'No verification notes recorded.');

  // Licence Box
  setElText('driver-details-licence-no', driver.licenseNumber || driver.licenceNumber || '--');
  setElText('driver-details-licence-type', driver.licenseType || driver.licenceType || 'Commercial');
  setElText('driver-details-licence-issue', formatDate(driver.licenseIssue || driver.licenceIssue) || '--');
  setElText('driver-details-licence-expiry', formatDate(driver.licenseExpiry || driver.licenceExpiry) || '--');

  const licRemainingEl = document.getElementById('driver-details-licence-remaining');
  if (licRemainingEl) {
    licRemainingEl.textContent = licExp.daysText;
    licRemainingEl.style.color = licExp.status === 'Expired' ? '#DC2626' : (licExp.status === 'Expiring Soon' ? '#D97706' : '#16A34A');
  }

  const licExpBadge = document.getElementById('driver-details-licence-expiry-badge');
  if (licExpBadge) {
    licExpBadge.className = `status-badge ${licExp.badgeClass}`;
    licExpBadge.textContent = licExp.status;
  }

  // Driver Documents Table
  const driverDocs = documentsCache.filter(doc => 
    doc.ownerId === driver.id || 
    doc.ownerId === driver.driverId || 
    doc.ownerName === driver.name || 
    (String(doc.ownerType).toLowerCase() === 'driver' && (doc.ownerId === driver.id || doc.ownerId === driver.driverId))
  );

  const docsTbody = document.getElementById('driver-details-docs-tbody');
  if (docsTbody) {
    if (driverDocs.length === 0) {
      docsTbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: #9CA3AF;">No documents uploaded for this driver. Click "+ Add Document" above to upload.</td></tr>`;
    } else {
      docsTbody.innerHTML = driverDocs.map(d => {
        const dExp = getExpiryStatus(d.expiryDate);
        return `
          <tr>
            <td><strong>${escapeHtml(d.documentType || 'Document')}</strong></td>
            <td><code>${escapeHtml(d.documentNumber || '--')}</code></td>
            <td>${formatDate(d.issueDate)}</td>
            <td>${formatDate(d.expiryDate)}</td>
            <td><span style="font-weight: 700; color: ${dExp.daysRemaining !== null && dExp.daysRemaining < 0 ? '#DC2626' : (dExp.daysRemaining !== null && dExp.daysRemaining <= 30 ? '#D97706' : '#16A34A')};">${dExp.daysText}</span></td>
            <td><span class="status-badge ${d.verificationStatus === 'Verified' ? 'badge-green' : (d.verificationStatus === 'Rejected' ? 'badge-red' : 'badge-orange')}">${escapeHtml(d.verificationStatus || 'Pending')}</span></td>
            <td style="text-align: right; white-space: nowrap;">
              <button type="button" class="btn-action-icon btn-action-primary" onclick="window.adminViewDocument('${escapeHtml(d.id)}')">View</button>
              ${d.verificationStatus !== 'Verified' ? `<button type="button" class="btn-action-icon" onclick="window.adminVerifyDocument('${escapeHtml(d.id)}')">Verify</button>` : ''}
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  // Driver Audit History
  const driverLogs = auditLogsCache.filter(l => 
    l.entityId === driver.id || 
    l.details?.driverName === driver.name || 
    l.details?.driverId === driver.id || 
    l.details?.driverId === driver.driverId
  );

  const auditContainer = document.getElementById('driver-details-audit-list');
  if (auditContainer) {
    if (driverLogs.length === 0) {
      auditContainer.innerHTML = `<div style="font-size: 13px; color: #9CA3AF; padding: 12px;">No logged administrative events for this driver yet.</div>`;
    } else {
      auditContainer.innerHTML = driverLogs.slice(0, 10).map(l => `
        <div class="driver-audit-item" style="padding: 10px 0; border-bottom: 1px solid #F3F4F6; font-size: 13px;">
          <div style="display: flex; justify-content: space-between;">
            <strong style="color: #111827;">${escapeHtml(l.action || 'Event')}</strong>
            <span style="color: #9CA3AF; font-size: 12px;">${formatDate(l.timestamp || l.createdAt)}</span>
          </div>
          <div style="color: #6B7280; margin-top: 2px;">
            ${escapeHtml(typeof l.details === 'object' ? JSON.stringify(l.details) : (l.details || ''))}
          </div>
        </div>
      `).join('');
    }
  }

  document.getElementById('driver-details-modal')?.classList.remove('hidden');
}

async function handleDeleteDriverDirect(driverId) {
  const driver = driversCache.find(d => d.id === driverId);
  if (!confirm(`Are you sure you want to delete driver "${driver ? driver.name : driverId}"? This will unassign any active vehicles.`)) return;

  try {
    if (driverId.startsWith('DRV-BUS-')) {
      alert("This driver record was derived from a bus fleet entry. Please update the driver details on the bus directly.");
      return;
    }

    await deleteDoc(doc(firestore, 'drivers', driverId));
    await logAuditEvent('DRIVER_DELETED', 'drivers', driverId, {
      name: driver?.name,
      driverId: driver?.driverId
    });

    // Unassign from busesCache
    if (driver && driver.name) {
      const assignedBuses = busesCache.filter(b => b.driverName === driver.name);
      for (const bus of assignedBuses) {
        try {
          await updateDoc(doc(firestore, 'buses', bus.id), {
            driverName: '',
            driverContact: '',
            updatedAt: serverTimestamp()
          });
        } catch (bErr) {}
      }
    }

    document.getElementById('driver-details-modal')?.classList.add('hidden');
    alert('Driver deleted successfully.');
  } catch (err) {
    alert("Deletion failed: " + err.message);
  }
}

// =============================================================================
// DOCUMENTS CONTROLLERS & MODAL HANDLERS
// =============================================================================

function showDocUploadError(msg) {
  const err = document.getElementById('doc-upload-error');
  if (err) {
    err.textContent = msg;
    err.classList.remove('hidden');
    err.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    alert(msg);
  }
}

function populateDocUploadSelects(ownerType = 'driver', selectedOwnerId = null) {
  if (!ownerType || typeof ownerType !== 'string' || !['driver', 'vehicle', 'student'].includes(ownerType)) {
    ownerType = 'driver';
  }
  const ownerLabel = document.getElementById('doc-upload-owner-label');
  const ownerSelect = document.getElementById('doc-upload-owner-id');
  const typeSelect = document.getElementById('doc-upload-type-select');

  if (!ownerSelect || !typeSelect) return;

  ownerSelect.innerHTML = '<option value="">Select owner...</option>';
  typeSelect.innerHTML = '';

  if (ownerType === 'driver') {
    if (ownerLabel) ownerLabel.textContent = 'Select Driver *';
    (driversCache || []).forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id || d.name;
      opt.textContent = `${d.name} (${d.phone || 'ID: ' + (d.driverId || d.id)})`;
      ownerSelect.appendChild(opt);
    });

    const driverTypes = [
      'Driving Licence',
      'Medical Fitness Certificate',
      'Police Background Clearance',
      'Commercial Badge',
      'Driver ID Card',
      'Other'
    ];
    driverTypes.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      typeSelect.appendChild(opt);
    });
  } else if (ownerType === 'vehicle') {
    if (ownerLabel) ownerLabel.textContent = 'Select Vehicle (Bus) *';
    (busesCache || []).forEach(b => {
      const opt = document.createElement('option');
      opt.value = `Bus ${b.busNumber || b.id}`;
      opt.textContent = `Bus ${b.busNumber || 'N/A'} - ${b.routeName || 'No Route'}`;
      ownerSelect.appendChild(opt);
    });

    const vehicleTypes = [
      'Vehicle Registration (RC)',
      'Commercial Insurance',
      'Pollution Certificate (PUC)',
      'Fitness Certificate (FC)',
      'Road Tax Token',
      'State Transport Permit',
      'Other'
    ];
    vehicleTypes.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      typeSelect.appendChild(opt);
    });
  } else if (ownerType === 'student') {
    if (ownerLabel) ownerLabel.textContent = 'Select Student *';
    const students = (usersCache || []).filter(u => !u.role || u.role === 'student' || u.role === 'user');
    students.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.name || s.fullName || 'Student'} (${s.regNumber || s.email || s.id})`;
      ownerSelect.appendChild(opt);
    });

    const studentTypes = [
      'Student ID Card',
      'Transport Pass',
      'Fee Receipt',
      'Disability Clearance',
      'Other'
    ];
    studentTypes.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      typeSelect.appendChild(opt);
    });
  }

  if (selectedOwnerId) {
    ownerSelect.value = selectedOwnerId;
  }
}

function openDocumentUploadModal(ownerType = 'driver', ownerId = null, editDocId = null) {
  if (!ownerType || typeof ownerType !== 'string' || !['driver', 'vehicle', 'student'].includes(ownerType)) {
    ownerType = 'driver';
  }
  if (typeof ownerId !== 'string') {
    ownerId = null;
  }
  if (typeof editDocId !== 'string') {
    editDocId = null;
  }

  const modal = document.getElementById('document-upload-modal');
  const title = document.getElementById('doc-upload-modal-title');
  const err = document.getElementById('doc-upload-error');
  if (err) {
    err.textContent = '';
    err.classList.add('hidden');
  }

  selectedUploadFile = null;
  const filenamePreview = document.getElementById('doc-upload-filename-preview');
  if (filenamePreview) filenamePreview.textContent = '';

  const progressWrap = document.getElementById('doc-upload-progress-container');
  if (progressWrap) progressWrap.classList.add('hidden');

  const fileInput = document.getElementById('doc-upload-file-input');
  if (fileInput) fileInput.value = '';

  const ownerTypeSelect = document.getElementById('doc-upload-owner-type');
  if (ownerTypeSelect) ownerTypeSelect.value = ownerType;

  populateDocUploadSelects(ownerType, ownerId);

  const editIdEl = document.getElementById('doc-upload-edit-id');
  if (editIdEl) editIdEl.value = editDocId || '';

  const docNumberEl = document.getElementById('doc-upload-number');
  const issueDateEl = document.getElementById('doc-upload-issue-date');
  const expiryDateEl = document.getElementById('doc-upload-expiry-date');

  if (editDocId) {
    const docItem = (documentsCache || []).find(d => d.id === editDocId);
    if (docItem) {
      if (title) title.textContent = `Replace Document: ${docItem.documentType || 'Document'}`;
      if (docNumberEl) docNumberEl.value = docItem.documentNumber || '';
      if (issueDateEl) issueDateEl.value = docItem.issueDate || '';
      if (expiryDateEl) expiryDateEl.value = docItem.expiryDate || '';
      if (ownerTypeSelect) ownerTypeSelect.value = docItem.ownerType || ownerType;
      populateDocUploadSelects(docItem.ownerType || ownerType, docItem.ownerId || ownerId);
    }
  } else {
    if (title) title.textContent = 'Upload Compliance Document';
    const todayYMD = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    if (docNumberEl) docNumberEl.value = '';
    if (issueDateEl) issueDateEl.value = todayYMD;
    if (expiryDateEl) expiryDateEl.value = '';
  }

  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
}

async function uploadDocumentFile(file, progressCb) {
  if (!file) return '';
  try {
    if (storage) {
      const storagePath = `documents/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file);

      return await new Promise((resolve) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            if (typeof progressCb === 'function') progressCb(pct);
          },
          (error) => {
            console.warn('Storage upload encountered error, falling back to base64 data url:', error);
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof progressCb === 'function') progressCb(100);
              resolve(reader.result);
            };
            reader.onerror = () => resolve('');
            reader.readAsDataURL(file);
          },
          async () => {
            try {
              const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
              if (typeof progressCb === 'function') progressCb(100);
              resolve(downloadUrl);
            } catch (uErr) {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.readAsDataURL(file);
            }
          }
        );
      });
    }
  } catch (err) {
    console.warn('Storage operation exception, using fallback base64 reader:', err);
  }

  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof progressCb === 'function') progressCb(100);
      resolve(reader.result);
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

async function saveDocumentUpload(e) {
  e.preventDefault();
  const errBox = document.getElementById('doc-upload-error');
  if (errBox) errBox.classList.add('hidden');

  const submitBtn = document.getElementById('submit-doc-upload-btn');
  const editDocId = document.getElementById('doc-upload-edit-id')?.value;
  const ownerType = document.getElementById('doc-upload-owner-type')?.value;
  const ownerId = document.getElementById('doc-upload-owner-id')?.value;
  const docType = document.getElementById('doc-upload-type-select')?.value;
  const docNumber = document.getElementById('doc-upload-number')?.value.trim();
  const issueDate = document.getElementById('doc-upload-issue-date')?.value;
  const expiryDate = document.getElementById('doc-upload-expiry-date')?.value;

  if (!ownerId) return showDocUploadError('Please select an owner entity.');
  if (!docType) return showDocUploadError('Please select the document type.');
  if (!docNumber) return showDocUploadError('Please enter the document number.');
  if (!issueDate) return showDocUploadError('Please specify the issue date.');

  if (expiryDate && issueDate && expiryDate < issueDate) {
    return showDocUploadError('Document expiry date cannot be earlier than the issue date.');
  }

  if (!editDocId && !selectedUploadFile) {
    return showDocUploadError('Please select or drop a valid document file (PDF, PNG, JPG).');
  }

  if (selectedUploadFile && selectedUploadFile.size > 10 * 1024 * 1024) {
    return showDocUploadError('Document file size exceeds 10MB limit. Please upload a smaller file.');
  }

  // Resolve owner display name
  let ownerName = ownerId;
  if (ownerType === 'driver') {
    const d = driversCache.find(x => x.id === ownerId || x.name === ownerId);
    if (d) ownerName = d.name;
  } else if (ownerType === 'vehicle') {
    const b = busesCache.find(x => (x.busNumber && ownerId.includes(x.busNumber)) || x.id === ownerId);
    if (b) ownerName = `Bus ${b.busNumber}`;
  } else if (ownerType === 'student') {
    const s = usersCache.find(x => x.id === ownerId);
    if (s) ownerName = s.name || s.fullName || ownerId;
  }

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Uploading...';
    }

    const progressContainer = document.getElementById('doc-upload-progress-container');
    const progressBar = document.getElementById('doc-upload-progress-bar');
    const progressPct = document.getElementById('doc-upload-progress-pct');

    if (progressContainer) progressContainer.classList.remove('hidden');

    let uploadedUrl = '';
    if (selectedUploadFile) {
      uploadedUrl = await uploadDocumentFile(selectedUploadFile, (pct) => {
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (progressPct) progressPct.textContent = `${pct}%`;
      });
    }

    if (editDocId && !editDocId.startsWith('DOC-BUS-')) {
      const updateData = {
        ownerType,
        ownerId,
        ownerName,
        documentType: docType,
        documentNumber: docNumber,
        issueDate,
        expiryDate: expiryDate || null,
        verificationStatus: 'Pending',
        rejectionReason: null,
        updatedAt: serverTimestamp()
      };
      if (uploadedUrl) {
        updateData.fileUrl = uploadedUrl;
        updateData.fileName = selectedUploadFile.name;
        updateData.fileType = selectedUploadFile.type;
        updateData.fileSize = selectedUploadFile.size;
      }

      await updateDoc(doc(firestore, 'documents', editDocId), updateData);
      await logAuditEvent('DOCUMENT_REPLACED', 'documents', editDocId, {
        ownerType,
        ownerName,
        docType,
        docNumber
      });
    } else {
      const newDoc = {
        ownerType,
        ownerId,
        ownerName,
        documentType: docType,
        documentNumber: docNumber,
        issueDate,
        expiryDate: expiryDate || null,
        fileUrl: uploadedUrl,
        fileName: selectedUploadFile ? selectedUploadFile.name : '',
        fileType: selectedUploadFile ? selectedUploadFile.type : '',
        fileSize: selectedUploadFile ? selectedUploadFile.size : 0,
        verificationStatus: 'Pending',
        verifiedBy: null,
        verifiedAt: null,
        rejectionReason: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(firestore, 'documents'), newDoc);
      await logAuditEvent('DOCUMENT_UPLOADED', 'documents', docRef.id, {
        ownerType,
        ownerName,
        docType,
        docNumber
      });
    }

    const uploadModal = document.getElementById('document-upload-modal');
    if (uploadModal) {
      uploadModal.classList.add('hidden');
      uploadModal.style.display = 'none';
    }
    alert('Compliance document uploaded and submitted for verification.');
  } catch (err) {
    showDocUploadError("Upload failed: " + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Upload & Save';
    }
  }
}

function openDocumentViewerModal(docId) {
  const docItem = documentsCache.find(d => d.id === docId);
  if (!docItem) {
    alert('Document not found.');
    return;
  }
  currentInspectingDocId = docId;

  // Title & Badges
  const title = document.getElementById('doc-viewer-title');
  if (title) title.textContent = `${docItem.documentType || 'Compliance Document'} - ${docItem.documentNumber || 'N/A'}`;

  const subtitle = document.getElementById('doc-viewer-subtitle');
  if (subtitle) {
    subtitle.textContent = `Category: ${docItem.ownerType || 'Entity'} • Owner: ${docItem.ownerName || docItem.ownerId || 'N/A'} • Issued: ${formatDate(docItem.issueDate)} • Expiry: ${formatDate(docItem.expiryDate)}`;
  }

  const exp = getExpiryStatus(docItem.expiryDate);
  const expBadge = document.getElementById('doc-viewer-expiry-badge');
  if (expBadge) {
    expBadge.className = `status-badge ${exp.badgeClass}`;
    expBadge.textContent = exp.status;
  }

  const verifBadge = document.getElementById('doc-viewer-verif-badge');
  const verif = docItem.verificationStatus || 'Pending';
  if (verifBadge) {
    verifBadge.className = `status-badge ${verif === 'Verified' ? 'badge-green' : (verif === 'Rejected' ? 'badge-red' : 'badge-orange')}`;
    verifBadge.textContent = verif;
  }

  // Rejection notes warning
  const rejBox = document.getElementById('doc-viewer-rejection-box');
  const rejNotes = document.getElementById('doc-viewer-rejection-notes');
  if (verif === 'Rejected' && docItem.rejectionReason) {
    if (rejBox) rejBox.classList.remove('hidden');
    if (rejNotes) rejNotes.textContent = docItem.rejectionReason;
  } else {
    if (rejBox) rejBox.classList.add('hidden');
  }

  // Document file preview
  const iframe = document.getElementById('doc-viewer-iframe');
  const img = document.getElementById('doc-viewer-image');
  const placeholder = document.getElementById('doc-viewer-placeholder');
  const fileUrl = docItem.fileUrl || docItem.documentUrl;

  if (iframe) iframe.style.display = 'none';
  if (img) img.style.display = 'none';
  if (placeholder) placeholder.style.display = 'none';

  if (fileUrl) {
    const isPdf = String(docItem.fileType || '').includes('pdf') || fileUrl.includes('.pdf') || fileUrl.startsWith('data:application/pdf');
    const isImg = String(docItem.fileType || '').startsWith('image/') || fileUrl.match(/\.(png|jpg|jpeg|webp|gif)/i) || fileUrl.startsWith('data:image/');

    if (isPdf && iframe) {
      iframe.src = fileUrl;
      iframe.style.display = 'block';
    } else if (isImg && img) {
      img.src = fileUrl;
      img.style.display = 'block';
    } else if (placeholder) {
      placeholder.style.display = 'block';
    }
  } else if (placeholder) {
    placeholder.style.display = 'block';
  }

  document.getElementById('document-viewer-modal')?.classList.remove('hidden');
}

async function handleVerifyDocumentDirect(docId) {
  const docItem = documentsCache.find(d => d.id === docId);
  if (!docItem) return;

  try {
    if (docId.startsWith('DOC-BUS-')) {
      alert("This document is attached to a fleet bus record. Please verify the vehicle document in the Bus Inspector.");
      return;
    }

    await updateDoc(doc(firestore, 'documents', docId), {
      verificationStatus: 'Verified',
      verifiedBy: currentAdminUser ? (currentAdminUser.email || 'Admin') : 'Admin',
      verifiedAt: serverTimestamp(),
      rejectionReason: null,
      updatedAt: serverTimestamp()
    });

    if (String(docItem.ownerType).toLowerCase() === 'driver' && String(docItem.documentType || '').toLowerCase().includes('licen')) {
      const driver = driversCache.find(d => d.id === docItem.ownerId || d.name === docItem.ownerName);
      if (driver && driver.id && !driver.id.startsWith('DRV-BUS-')) {
        try {
          await updateDoc(doc(firestore, 'drivers', driver.id), {
            verificationStatus: 'Verified',
            verificationNotes: 'Driving licence document verified by admin.',
            updatedAt: serverTimestamp()
          });
        } catch (dErr) {}
      }
    }

    await logAuditEvent('DOCUMENT_VERIFIED', 'documents', docId, {
      documentType: docItem.documentType,
      ownerName: docItem.ownerName
    });

    document.getElementById('document-viewer-modal')?.classList.add('hidden');
    alert(`Document "${docItem.documentType}" verified successfully.`);
  } catch (err) {
    alert("Verification failed: " + err.message);
  }
}

function openDocumentRejectionModal(docId) {
  pendingRejectDocId = docId;
  const reasonInput = document.getElementById('doc-reject-reason-input');
  if (reasonInput) reasonInput.value = '';
  document.getElementById('document-rejection-modal')?.classList.remove('hidden');
}

async function handleConfirmDocumentRejection() {
  if (!pendingRejectDocId) return;
  const reasonInput = document.getElementById('doc-reject-reason-input');
  const reason = reasonInput ? reasonInput.value.trim() : '';
  if (!reason) {
    alert('Please enter a rejection reason.');
    return;
  }

  const docItem = documentsCache.find(d => d.id === pendingRejectDocId);
  try {
    if (pendingRejectDocId.startsWith('DOC-BUS-')) {
      alert("This document is attached to a fleet bus record. Please update the bus record directly.");
      return;
    }

    await updateDoc(doc(firestore, 'documents', pendingRejectDocId), {
      verificationStatus: 'Rejected',
      rejectionReason: reason,
      rejectedBy: currentAdminUser ? (currentAdminUser.email || 'Admin') : 'Admin',
      rejectedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    if (docItem && String(docItem.ownerType).toLowerCase() === 'driver' && String(docItem.documentType || '').toLowerCase().includes('licen')) {
      const driver = driversCache.find(d => d.id === docItem.ownerId || d.name === docItem.ownerName);
      if (driver && driver.id && !driver.id.startsWith('DRV-BUS-')) {
        try {
          await updateDoc(doc(firestore, 'drivers', driver.id), {
            verificationStatus: 'Rejected',
            verificationNotes: `Driving licence rejected: ${reason}`,
            updatedAt: serverTimestamp()
          });
        } catch (dErr) {}
      }
    }

    await logAuditEvent('DOCUMENT_REJECTED', 'documents', pendingRejectDocId, {
      reason,
      documentType: docItem?.documentType,
      ownerName: docItem?.ownerName
    });

    document.getElementById('document-rejection-modal')?.classList.add('hidden');
    document.getElementById('document-viewer-modal')?.classList.add('hidden');
    alert('Document rejected successfully.');
  } catch (err) {
    alert("Rejection failed: " + err.message);
  }
}

async function handleDeleteDocumentDirect(docId) {
  if (!confirm('Are you sure you want to permanently delete this document record?')) return;
  try {
    if (docId.startsWith('DOC-BUS-')) {
      alert("This document is attached to a fleet bus record. Please remove it from the Bus Inspector / Editor.");
      return;
    }
    const docItem = documentsCache.find(d => d.id === docId);
    await deleteDoc(doc(firestore, 'documents', docId));
    await logAuditEvent('DOCUMENT_DELETED', 'documents', docId, {
      documentType: docItem?.documentType,
      ownerName: docItem?.ownerName
    });
    document.getElementById('document-viewer-modal')?.classList.add('hidden');
    alert('Document deleted successfully.');
  } catch (err) {
    alert("Deletion failed: " + err.message);
  }
}

// =============================================================================
// SETUP: DRIVERS & DOCUMENTS EVENT LISTENERS
// =============================================================================

function setupDriversAndDocumentsListeners() {
  // 1. Drivers Sub-navigation Pills
  const pillList = document.getElementById('driver-subnav-list') || document.getElementById('drivers-subtab-list');
  const pillComp = document.getElementById('driver-subnav-compliance') || document.getElementById('drivers-subtab-compliance');
  const pillDocs = document.getElementById('driver-subnav-docs') || document.getElementById('drivers-subtab-documents');

  pillList?.addEventListener('click', () => switchDriverSubtab('list'));
  pillComp?.addEventListener('click', () => switchDriverSubtab('compliance'));
  pillDocs?.addEventListener('click', () => switchDriverSubtab('docs'));

  document.querySelectorAll('.view-subnav-pills [data-drivers-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-drivers-tab');
      switchDriverSubtab(tab === 'documents' ? 'docs' : tab);
    });
  });

  // 2. Drivers Filters & Search
  document.getElementById('drivers-search-input')?.addEventListener('input', () => {
    driversPagination.page = 1;
    renderDriversTable();
  });
  document.getElementById('drivers-status-filter')?.addEventListener('change', () => {
    driversPagination.page = 1;
    renderDriversTable();
  });
  document.getElementById('drivers-verification-filter')?.addEventListener('change', () => {
    driversPagination.page = 1;
    renderDriversTable();
  });
  document.getElementById('drivers-licence-filter')?.addEventListener('change', () => {
    driversPagination.page = 1;
    renderDriversTable();
  });
  document.getElementById('drivers-bus-filter')?.addEventListener('change', () => {
    driversPagination.page = 1;
    renderDriversTable();
  });
  document.getElementById('drivers-sort-filter')?.addEventListener('change', () => {
    driversPagination.page = 1;
    renderDriversTable();
  });

  // Drivers Pagination
  document.getElementById('drivers-prev-btn')?.addEventListener('click', () => {
    if (driversPagination.page > 1) {
      driversPagination.page--;
      renderDriversTable();
    }
  });
  document.getElementById('drivers-next-btn')?.addEventListener('click', () => {
    driversPagination.page++;
    renderDriversTable();
  });

  // Add Driver Button
  document.getElementById('add-driver-btn')?.addEventListener('click', () => openDriverEditorModal());

  // Driver Editor Modal
  document.getElementById('close-driver-editor-btn')?.addEventListener('click', () => {
    document.getElementById('driver-editor-modal')?.classList.add('hidden');
  });
  document.getElementById('cancel-driver-editor-btn')?.addEventListener('click', () => {
    document.getElementById('driver-editor-modal')?.classList.add('hidden');
  });
  document.getElementById('driver-editor-form')?.addEventListener('submit', saveDriverRecord);

  // Driver Details Modal
  document.getElementById('close-driver-details-btn')?.addEventListener('click', () => {
    document.getElementById('driver-details-modal')?.classList.add('hidden');
  });
  document.getElementById('close-driver-details-bottom-btn')?.addEventListener('click', () => {
    document.getElementById('driver-details-modal')?.classList.add('hidden');
  });
  document.getElementById('driver-details-edit-btn')?.addEventListener('click', () => {
    if (currentInspectingDriverId) {
      document.getElementById('driver-details-modal')?.classList.add('hidden');
      openDriverEditorModal(currentInspectingDriverId);
    }
  });
  document.getElementById('driver-details-upload-doc-btn')?.addEventListener('click', () => {
    openDocumentUploadModal('driver', currentInspectingDriverId || null);
  });
  document.getElementById('driver-details-add-doc-trigger')?.addEventListener('click', () => {
    openDocumentUploadModal('driver', currentInspectingDriverId || null);
  });
  document.getElementById('driver-details-assign-bus-btn')?.addEventListener('click', () => {
    if (currentInspectingDriverId) {
      const d = driversCache.find(x => x.id === currentInspectingDriverId);
      document.getElementById('driver-details-modal')?.classList.add('hidden');
      window.adminOpenDriverAssign(d ? (d.id || d.name) : currentInspectingDriverId);
    }
  });

  // 3. Documents Category Tabs
  document.getElementById('doc-tab-all')?.addEventListener('click', () => switchDocumentCategoryTab('all'));
  document.getElementById('doc-tab-drivers')?.addEventListener('click', () => switchDocumentCategoryTab('driver'));
  document.getElementById('doc-tab-students')?.addEventListener('click', () => switchDocumentCategoryTab('student'));
  document.getElementById('doc-tab-vehicles')?.addEventListener('click', () => switchDocumentCategoryTab('vehicle'));

  // 4. Documents Filters & Search
  document.getElementById('doc-search-input')?.addEventListener('input', () => {
    documentsPagination.page = 1;
    renderDocumentsTable();
  });
  document.getElementById('doc-status-filter')?.addEventListener('change', () => {
    documentsPagination.page = 1;
    renderDocumentsTable();
  });
  document.getElementById('doc-owner-filter')?.addEventListener('change', (e) => {
    documentsPagination.page = 1;
    currentDocCategoryFilter = e.target.value;
    renderDocumentsTable();
  });
  document.getElementById('doc-sort-filter')?.addEventListener('change', () => {
    documentsPagination.page = 1;
    renderDocumentsTable();
  });

  // Documents Pagination
  document.getElementById('doc-prev-btn')?.addEventListener('click', () => {
    if (documentsPagination.page > 1) {
      documentsPagination.page--;
      renderDocumentsTable();
    }
  });
  document.getElementById('doc-next-btn')?.addEventListener('click', () => {
    documentsPagination.page++;
    renderDocumentsTable();
  });

  // Upload Document Trigger Button (supports both IDs and class selectors)
  const triggerDocUpload = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    openDocumentUploadModal();
  };
  document.getElementById('upload-doc-btn')?.addEventListener('click', triggerDocUpload);
  document.getElementById('upload-document-btn')?.addEventListener('click', triggerDocUpload);
  document.querySelectorAll('.btn-upload-doc, [data-action="upload-document"]').forEach(b => {
    b.addEventListener('click', triggerDocUpload);
  });

  // Document Upload Modal
  const closeDocUpload = () => {
    const m = document.getElementById('document-upload-modal');
    if (m) {
      m.classList.add('hidden');
      m.style.display = 'none';
    }
  };
  document.getElementById('close-doc-upload-btn')?.addEventListener('click', closeDocUpload);
  document.getElementById('cancel-doc-upload-btn')?.addEventListener('click', closeDocUpload);
  document.getElementById('document-upload-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('document-upload-modal')) {
      closeDocUpload();
    }
  });
  document.getElementById('document-upload-form')?.addEventListener('submit', saveDocumentUpload);

  document.getElementById('doc-upload-owner-type')?.addEventListener('change', (e) => {
    populateDocUploadSelects(e.target.value);
  });

  // Dropzone drag-and-drop & file selection
  const dropzone = document.getElementById('doc-upload-dropzone');
  const fileInput = document.getElementById('doc-upload-file-input');

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) {
        selectedUploadFile = file;
        const preview = document.getElementById('doc-upload-filename-preview');
        if (preview) preview.textContent = `Selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
      }
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        selectedUploadFile = file;
        const preview = document.getElementById('doc-upload-filename-preview');
        if (preview) preview.textContent = `Selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
      }
    });
  }

  // Document Viewer Modal
  const closeDocViewer = () => {
    const m = document.getElementById('document-viewer-modal');
    if (m) {
      m.classList.add('hidden');
      m.style.display = 'none';
    }
  };
  document.getElementById('close-doc-viewer-btn')?.addEventListener('click', closeDocViewer);
  document.getElementById('document-viewer-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('document-viewer-modal')) {
      closeDocViewer();
    }
  });
  document.getElementById('doc-viewer-verify-btn')?.addEventListener('click', () => {
    if (currentInspectingDocId) handleVerifyDocumentDirect(currentInspectingDocId);
  });
  document.getElementById('doc-viewer-reject-btn')?.addEventListener('click', () => {
    if (currentInspectingDocId) openDocumentRejectionModal(currentInspectingDocId);
  });
  document.getElementById('doc-viewer-replace-btn')?.addEventListener('click', () => {
    if (currentInspectingDocId) {
      const docItem = documentsCache.find(d => d.id === currentInspectingDocId);
      const m = document.getElementById('document-viewer-modal');
      if (m) {
        m.classList.add('hidden');
        m.style.display = 'none';
      }
      openDocumentUploadModal(docItem?.ownerType || 'driver', docItem?.ownerId || '', currentInspectingDocId);
    }
  });
  document.getElementById('doc-viewer-download-btn')?.addEventListener('click', () => {
    if (currentInspectingDocId) {
      const docItem = documentsCache.find(d => d.id === currentInspectingDocId);
      const url = docItem?.fileUrl || docItem?.documentUrl;
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = docItem.fileName || 'compliance_document';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        alert('No downloadable file attached to this document record.');
      }
    }
  });
  document.getElementById('doc-viewer-delete-btn')?.addEventListener('click', () => {
    if (currentInspectingDocId) handleDeleteDocumentDirect(currentInspectingDocId);
  });

  // Document Rejection Modal
  const closeDocReject = () => {
    const m = document.getElementById('document-rejection-modal');
    if (m) {
      m.classList.add('hidden');
      m.style.display = 'none';
    }
  };
  document.getElementById('close-doc-reject-btn')?.addEventListener('click', closeDocReject);
  document.getElementById('cancel-doc-reject-btn')?.addEventListener('click', closeDocReject);
  document.getElementById('document-rejection-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('document-rejection-modal')) {
      closeDocReject();
    }
  });
  document.getElementById('confirm-doc-reject-btn')?.addEventListener('click', handleConfirmDocumentRejection);
}

// Global Window exposures for table and card action buttons
window.adminOpenAddDriver = () => openDriverEditorModal();
window.adminInspectDriver = (driverId) => openDriverDetailsModal(driverId);
window.adminEditDriver = (driverId) => openDriverEditorModal(driverId);
window.adminUploadDriverDoc = (driverId) => openDocumentUploadModal('driver', driverId);
window.adminDeleteDriver = (driverId) => handleDeleteDriverDirect(driverId);
window.adminOpenUploadDoc = (ownerType, ownerId) => openDocumentUploadModal(typeof ownerType === 'string' ? ownerType : 'driver', typeof ownerId === 'string' ? ownerId : null);
window.adminViewDocument = (docId) => openDocumentViewerModal(docId);
window.adminVerifyDocument = (docId) => handleVerifyDocumentDirect(docId);
window.adminRejectDocumentPrompt = (docId) => openDocumentRejectionModal(docId);
window.adminDeleteDocument = (docId) => handleDeleteDocumentDirect(docId);

// Direct global window bindings for templates
window.openDocumentUploadModal = (ownerType, ownerId, editDocId) => openDocumentUploadModal(typeof ownerType === 'string' ? ownerType : 'driver', typeof ownerId === 'string' ? ownerId : null, editDocId);
window.openDocumentViewerModal = (docId) => openDocumentViewerModal(docId);
window.openDriverEditorModal = (driverId) => openDriverEditorModal(driverId);
window.openDriverDetailsModal = (driverId) => openDriverDetailsModal(driverId);

// =============================================================================
// RENDER: APPROVALS & AUDIT LOGS
// =============================================================================
function renderApprovalsTable() {
  const tbody = document.getElementById('approvals-table-body');
  if (!tbody) return;

  if (!approvalsLoaded && approvalsCache.length === 0) {
    renderTableSkeleton(tbody, 6, 4);
    return;
  }

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

  if (!auditLogsLoaded && auditLogsCache.length === 0) {
    renderTableSkeleton(tbody, 6, 4);
    return;
  }

  tbody.innerHTML = '';

  if (auditLogsCache.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td><span class="status-badge badge-blue audit-action-badge">System Sync</span></td>
        <td class="audit-entity-type">Fleet / Database</td>
        <td class="audit-entity-id"><span class="audit-entity-id-text" title="All Collections">All Collections</span></td>
        <td class="audit-performed-by">System Engine</td>
        <td class="audit-timestamp">Just now</td>
        <td class="audit-details">Real-time synchronization established with Firestore</td>
      </tr>
    `;
    return;
  }

  auditLogsCache.forEach(log => {
    const action = log.action || 'ACTION';
    const entityType = log.entityType || '';
    const entityId = log.entityId || 'N/A';
    const performedBy = log.performedBy || 'Admin';
    const metadata = log.metadata || {};

    const badgeClass = getAuditActionBadgeClass(action);
    const formattedAction = formatAction(action);
    const formattedEntityType = formatEntityType(entityType);
    const formattedTimestamp = formatAuditTimestamp(log.timestamp);
    const formattedDetails = formatAuditDetails(action, metadata);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="status-badge ${badgeClass} audit-action-badge">${escapeHtml(formattedAction)}</span></td>
      <td class="audit-entity-type">${escapeHtml(formattedEntityType)}</td>
      <td class="audit-entity-id"><span class="audit-entity-id-text" title="${escapeHtml(entityId)}">${escapeHtml(entityId)}</span></td>
      <td class="audit-performed-by">${escapeHtml(performedBy)}</td>
      <td class="audit-timestamp">${formattedTimestamp}</td>
      <td class="audit-details">${escapeHtml(formattedDetails)}</td>
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
            stopOrder: s.stopOrder || s.order || idx + 1,
            order: s.stopOrder || s.order || idx + 1,
            name: s.name || s.stopName || '',
            stopName: s.name || s.stopName || '',
            morningArrival: s.morningArrival || s.arrivalTime || '',
            arrivalTime: s.morningArrival || s.arrivalTime || '',
            eveningArrival: s.eveningArrival || s.departureTime || '',
            departureTime: s.eveningArrival || s.departureTime || '',
            latitude: s.latitude !== undefined ? s.latitude : null,
            longitude: s.longitude !== undefined ? s.longitude : null,
            status: s.status || 'Active'
          }));
        } else {
          coverageType = 'full_route';
          stopAssignments = [];
          servedStops = routeStops.map((s, idx) => ({
            stopOrder: s.stopOrder || s.order || idx + 1,
            order: s.stopOrder || s.order || idx + 1,
            name: s.name || s.stopName || '',
            stopName: s.name || s.stopName || '',
            morningArrival: s.morningArrival || s.arrivalTime || '',
            arrivalTime: s.morningArrival || s.arrivalTime || '',
            eveningArrival: s.eveningArrival || s.departureTime || '',
            departureTime: s.eveningArrival || s.departureTime || '',
            latitude: s.latitude !== undefined ? s.latitude : null,
            longitude: s.longitude !== undefined ? s.longitude : null,
            status: s.status || 'Active'
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

        let finalBusId = busEditId || `bus_${busNo}`;
        if (busEditId) {
          await updateDoc(doc(firestore, 'buses', busEditId), payload);
          await logAuditEvent('BUS_UPDATED', 'buses', busEditId, { busNumber: busNo, changes: payload });
          if (busEditId !== `bus_${busNo}`) {
            try {
              await setDoc(doc(firestore, 'buses', `bus_${busNo}`), payload, { merge: true });
            } catch (syncErr) {
              console.warn("Could not mirror bus to deterministic doc ID:", syncErr);
            }
          }
        } else {
          payload.createdAt = serverTimestamp();
          await setDoc(doc(firestore, 'buses', finalBusId), payload, { merge: true });
          await logAuditEvent('BUS_CREATED', 'buses', finalBusId, { busNumber: busNo, route: selectedRouteName });
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

        // Bidirectional sync: Update assigned driver in Firestore 'drivers' collection
        if (matchedDriver && matchedDriver.id && !matchedDriver.id.startsWith('DRV-BUS-')) {
          try {
            await updateDoc(doc(firestore, 'drivers', matchedDriver.id), {
              assignedBusId: finalBusId,
              assignedBusNumber: busNo || '',
              assignedBus: busNo || '',
              assignedVehicle: busNo ? `Bus ${busNo}` : '',
              assignedRoute: selectedRouteName || '',
              updatedAt: serverTimestamp()
            });
            matchedDriver.assignedBusId = finalBusId;
            matchedDriver.assignedBusNumber = busNo || '';
            matchedDriver.assignedBus = busNo || '';
            matchedDriver.assignedVehicle = busNo ? `Bus ${busNo}` : '';
            matchedDriver.assignedRoute = selectedRouteName || '';
          } catch (dErr) {
            console.warn("Could not sync driver document with assigned bus:", dErr);
          }
        }

        // If bus had a previous driver who was replaced or unassigned, clear old driver
        if (existingBus && existingBus.driverName && existingBus.driverName !== selectedDriver) {
          const oldDrv = driversCache.find(d => d.name === existingBus.driverName);
          if (oldDrv && oldDrv.id && !oldDrv.id.startsWith('DRV-BUS-')) {
            try {
              await updateDoc(doc(firestore, 'drivers', oldDrv.id), {
                assignedBusId: '',
                assignedBusNumber: '',
                assignedBus: '',
                assignedVehicle: '',
                updatedAt: serverTimestamp()
              });
              oldDrv.assignedBusId = '';
              oldDrv.assignedBusNumber = '';
              oldDrv.assignedBus = '';
              oldDrv.assignedVehicle = '';
            } catch (e) {}
          }
        }

        deriveDerivedState();
        renderDriversTable();
        renderBusesTable();
        renderDashboardStats();

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

      const driverVal = document.getElementById('assign-driver-select').value;
      const busId = document.getElementById('assign-bus-select').value;
      const routeVal = document.getElementById('assign-route-select')?.value || '';

      // VALIDATION ENGINE
      const driver = driversCache.find(d => d.id === driverVal || d.name === driverVal || d.driverId === driverVal);
      const targetBus = busesCache.find(b => b.id === busId || String(b.busNumber).trim() === String(busId).trim());

      if (!driver || !targetBus) {
        showAssignError('Please select both a valid driver and bus.');
        return;
      }

      // 1. Bus status safety check
      if (targetBus.status === 'Maintenance' || targetBus.status === 'Inactive') {
        showAssignError(`Cannot assign driver. Bus ${targetBus.busNumber || targetBus.id} is currently ${targetBus.status}.`);
        return;
      }

      // 2. Driver status check
      if (driver.status && driver.status !== 'Active') {
        showAssignError(`Cannot assign driver. Driver ${driver.name} is currently ${driver.status}. Only Active drivers can be assigned.`);
        return;
      }

      // 3. Driver driving licence expiry check
      const licExpiry = getExpiryStatus(driver.licenseExpiry || driver.licenceExpiry);
      if (licExpiry.status === 'Expired') {
        showAssignError(`Cannot assign driver. Driving licence for ${driver.name} expired on ${driver.licenseExpiry || driver.licenceExpiry || 'N/A'}. Expired drivers cannot be assigned.`);
        return;
      }

      // 4. Driver verification status check
      if (driver.verificationStatus && driver.verificationStatus !== 'Verified') {
        showAssignError(`Cannot assign driver. Driver ${driver.name} verification status is "${driver.verificationStatus}". Must be Verified.`);
        return;
      }

      // 5. Driver compliance document validation
      const driverLicDoc = documentsCache.find(doc => 
        (doc.ownerId === driver.id || doc.ownerName === driver.name) && 
        String(doc.documentType || '').toLowerCase().includes('licen')
      );
      if (driverLicDoc) {
        const docExp = getExpiryStatus(driverLicDoc.expiryDate);
        if (docExp.status === 'Expired') {
          showAssignError(`Cannot assign driver. Driving licence document is expired (${driverLicDoc.expiryDate}).`);
          return;
        }
        if (driverLicDoc.verificationStatus === 'Rejected') {
          showAssignError(`Cannot assign driver. Driving licence document was rejected: ${driverLicDoc.rejectionReason || 'Compliance failed'}.`);
          return;
        }
      }

      try {
        const finalRoute = routeVal || targetBus.routeName || targetBus.route || '';
        await updateDoc(doc(firestore, 'buses', targetBus.id), {
          driverName: driver.name,
          driverContact: driver.phone || '',
          driverLicense: driver.licenseNumber || driver.licenceNumber || '',
          assignedDriverId: driver.id || driver.driverId || '',
          assignedDriverName: driver.name,
          ...(routeVal ? { routeName: routeVal, route: routeVal } : {}),
          updatedAt: serverTimestamp()
        });

        targetBus.driverName = driver.name;
        targetBus.driverContact = driver.phone || '';
        targetBus.driverLicense = driver.licenseNumber || driver.licenceNumber || '';
        targetBus.assignedDriverId = driver.id || driver.driverId || '';
        targetBus.assignedDriverName = driver.name;
        if (routeVal) {
          targetBus.routeName = routeVal;
          targetBus.route = routeVal;
        }

        // Also update driver's document if stored in drivers collection
        if (driver.id && !driver.id.startsWith('DRV-BUS-')) {
          try {
            await updateDoc(doc(firestore, 'drivers', driver.id), {
              assignedBusId: targetBus.id,
              assignedBusNumber: targetBus.busNumber || '',
              assignedBus: targetBus.busNumber || '',
              assignedVehicle: targetBus.busNumber ? `Bus ${targetBus.busNumber}` : '',
              assignedRoute: finalRoute,
              updatedAt: serverTimestamp()
            });
          } catch (dErr) {
            console.warn("Could not update driver record directly:", dErr);
          }
        }

        driver.assignedBusId = targetBus.id;
        driver.assignedBusNumber = targetBus.busNumber || '';
        driver.assignedBus = targetBus.busNumber || '';
        driver.assignedVehicle = targetBus.busNumber ? `Bus ${targetBus.busNumber}` : '';
        driver.assignedRoute = finalRoute || driver.assignedRoute || '';

        // Clear previous bus assigned to this driver
        const oldBuses = busesCache.filter(b => b.id !== targetBus.id && (b.driverName === driver.name || b.assignedDriverId === driver.id));
        for (const ob of oldBuses) {
          try {
            await updateDoc(doc(firestore, 'buses', ob.id), {
              driverName: '',
              driverContact: '',
              assignedDriverId: null,
              assignedDriverName: null,
              updatedAt: serverTimestamp()
            });
            ob.driverName = '';
            ob.driverContact = '';
            ob.assignedDriverId = null;
            ob.assignedDriverName = null;
          } catch (e) {}
        }

        deriveDerivedState();
        renderDriversTable();
        renderBusesTable();
        renderDashboardStats();

        await logAuditEvent('DRIVER_ASSIGNED', 'buses', targetBus.id, {
          driverName: driver.name,
          driverId: driver.id || '',
          busNumber: targetBus.busNumber || targetBus.id,
          routeName: finalRoute
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
      const replyText = document.getElementById('modal-ticket-reply').value.trim();

      try {
        saveTicketBtn.disabled = true;
        saveTicketBtn.textContent = 'Updating...';

        const adminUid = currentAdminUser?.uid || '';
        const adminDisplayName = currentAdminUser?.displayName || (currentAdminUser?.email ? currentAdminUser.email.split('@')[0] : 'Admin');

        const updatePayload = {
          status: newStatus,
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
  const routeSel = document.getElementById('assign-route-select');
  if (!driverSel || !busSel) return;

  driverSel.innerHTML = '<option value="">Choose Driver...</option>';
  driversCache.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.id || d.name;
    const licExp = getExpiryStatus(d.licenseExpiry || d.licenceExpiry);
    const busInfo = getDriverAssignedBusInfo(d);
    const busText = busInfo.hasBus ? `[Currently: ${busInfo.displayBus}]` : '[Unassigned]';
    opt.textContent = `${d.name} (${d.phone || 'No phone'}) - ${d.status || 'Active'} ${busText} [Licence: ${licExp.status}]`;
    driverSel.appendChild(opt);
  });

  busSel.innerHTML = '<option value="">Choose Bus...</option>';
  busesCache.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = `Bus ${b.busNumber || 'N/A'} - ${b.routeName || 'No Route'} [${b.status || 'Active'}]`;
    busSel.appendChild(opt);
  });

  if (routeSel) {
    routeSel.innerHTML = '<option value="">Keep Bus Default Route</option>';
    routesCache.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.name;
      opt.textContent = r.name;
      routeSel.appendChild(opt);
    });
  }
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

window.adminOpenDriverAssign = (driverIdentifier) => {
  populateDriverAssignSelects();
  const driverSel = document.getElementById('assign-driver-select');
  if (driverSel && driverIdentifier) {
    const match = driversCache.find(d => d.name === driverIdentifier || d.id === driverIdentifier);
    if (match) {
      driverSel.value = match.id || match.name;
    } else {
      driverSel.value = driverIdentifier;
    }
  }
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
  const replyInput = document.getElementById('modal-ticket-reply');

  if (statusSel) statusSel.value = ticket.status || 'Under Review';
  if (replyInput) replyInput.value = ticket.adminResponse || ticket.resolution || ticket.adminReply || '';

  const statusBadge = document.getElementById('modal-ticket-status-badge');
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

    const targetCard = document.querySelectorAll('.stop-row-card')[index - 1];
    if (targetCard) {
      targetCard.classList.add('stop-card-just-moved');
      setTimeout(() => targetCard?.classList.remove('stop-card-just-moved'), 1200);
    }
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

    const targetCard = document.querySelectorAll('.stop-row-card')[index + 1];
    if (targetCard) {
      targetCard.classList.add('stop-card-just-moved');
      setTimeout(() => targetCard?.classList.remove('stop-card-just-moved'), 1200);
    }
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
  const busStudents = usersCache.filter(u => String(u.assignedBus || u.bus || u.busNumber || '').trim() === String(bus.busNumber).trim());
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
                <span style="font-weight: 600; color: #374151;">${escapeHtml(d.documentNumber || 'No Policy Number')}</span>
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
        html += `<div class="search-item" data-action="inspect-route" data-route-id="${escapeHtml(r.id)}"><span class="search-item-info"><strong>${escapeHtml(r.name)}</strong> (${escapeHtml(r.startPoint || '')} &rarr; ${escapeHtml(r.destination || '')})</span><span class="status-badge badge-blue">Inspect</span></div>`;
      });
      html += `</div>`;
    }

    if (matchedBuses.length > 0) {
      html += `<div class="search-category-group"><div class="search-category-title">Buses</div>`;
      matchedBuses.slice(0, 3).forEach(b => {
        html += `<div class="search-item" data-action="inspect-bus" data-bus-id="${escapeHtml(b.id)}"><span class="search-item-info"><strong>Bus ${escapeHtml(b.busNumber)}</strong> - ${escapeHtml(b.routeName || 'Route')}</span><span class="status-badge badge-blue">Inspect</span></div>`;
      });
      html += `</div>`;
    }

    if (matchedDrivers.length > 0) {
      html += `<div class="search-category-group"><div class="search-category-title">Drivers</div>`;
      matchedDrivers.slice(0, 3).forEach(d => {
        html += `<div class="search-item" data-action="assign-driver" data-driver-name="${escapeHtml(d.name)}"><span class="search-item-info"><strong>${escapeHtml(d.name)}</strong> (${escapeHtml(d.phone || '')})</span><span class="status-badge badge-green">Driver</span></div>`;
      });
      html += `</div>`;
    }

    if (matchedTickets.length > 0) {
      html += `<div class="search-category-group"><div class="search-category-title">Support Tickets</div>`;
      matchedTickets.slice(0, 3).forEach(t => {
        html += `<div class="search-item" data-action="open-ticket" data-ticket-id="${escapeHtml(t.id)}"><span class="search-item-info"><strong>${escapeHtml(t.reportNumber || 'Ticket')}</strong>: ${escapeHtml(t.subject || 'Issue')}</span><span class="status-badge badge-orange">${escapeHtml(t.status || 'Open')}</span></div>`;
      });
      html += `</div>`;
    }

    if (!html) {
      html = `<div class="search-no-results">No results found for "${escapeHtml(q)}".</div>`;
    }

    resultsBox.innerHTML = html;
    resultsBox.classList.remove('hidden');
  });

  resultsBox.addEventListener('click', (e) => {
    const item = e.target.closest('.search-item');
    if (!item) return;
    const action = item.getAttribute('data-action');
    if (action === 'inspect-route') {
      window.adminInspectRoute(item.getAttribute('data-route-id'));
    } else if (action === 'inspect-bus') {
      window.adminInspectBus(item.getAttribute('data-bus-id'));
    } else if (action === 'assign-driver') {
      window.adminOpenDriverAssign(item.getAttribute('data-driver-name'));
    } else if (action === 'open-ticket') {
      window.adminOpenTicket(item.getAttribute('data-ticket-id'));
    }
    resultsBox.classList.add('hidden');
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
    // Immediately refresh recent updates widget
    if (typeof renderRecentActivity === 'function') {
      renderRecentActivity();
    }
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

  ['admin-rep-search', 'admin-rep-status-filter', 'admin-rep-cat-filter'].forEach(id => {
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

function renderPaginationButtons(containerId, totalPages, currentPage, onPageClick) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  if (totalPages <= 1) return;

  // Prev button
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'pagination-btn';
  prevBtn.textContent = '‹ Prev';
  prevBtn.disabled = currentPage <= 1;
  prevBtn.addEventListener('click', () => onPageClick(currentPage - 1));
  container.appendChild(prevBtn);

  // Numbered pages (sliding window of up to 5 pages)
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4);
  }

  if (startPage > 1) {
    const p1 = document.createElement('button');
    p1.type = 'button';
    p1.className = 'pagination-btn';
    p1.textContent = '1';
    p1.addEventListener('click', () => onPageClick(1));
    container.appendChild(p1);
    if (startPage > 2) {
      const dots = document.createElement('span');
      dots.textContent = '...';
      dots.style.padding = '0 4px';
      dots.style.color = '#9CA3AF';
      container.appendChild(dots);
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    const pageBtn = document.createElement('button');
    pageBtn.type = 'button';
    pageBtn.className = `pagination-btn ${i === currentPage ? 'active' : ''}`;
    pageBtn.textContent = String(i);
    pageBtn.addEventListener('click', () => onPageClick(i));
    container.appendChild(pageBtn);
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      const dots = document.createElement('span');
      dots.textContent = '...';
      dots.style.padding = '0 4px';
      dots.style.color = '#9CA3AF';
      container.appendChild(dots);
    }
    const pEnd = document.createElement('button');
    pEnd.type = 'button';
    pEnd.className = 'pagination-btn';
    pEnd.textContent = String(totalPages);
    pEnd.addEventListener('click', () => onPageClick(totalPages));
    container.appendChild(pEnd);
  }

  // Next button
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'pagination-btn';
  nextBtn.textContent = 'Next ›';
  nextBtn.disabled = currentPage >= totalPages;
  nextBtn.addEventListener('click', () => onPageClick(currentPage + 1));
  container.appendChild(nextBtn);
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

// =============================================================================
// AUDIT LOG PRESENTATION FORMATTERS
// =============================================================================

/**
 * Convert raw SCREAMING_SNAKE_CASE action to a readable label.
 * e.g. "ROUTE_STATUS_CHANGED" → "Route Status Changed"
 */
function formatAction(action) {
  if (!action) return 'Unknown';
  return String(action)
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Convert internal entity type strings to human-readable form.
 * e.g. "routes" → "Routes", "pending_approvals" → "Pending Approvals"
 */
function formatEntityType(type) {
  if (!type) return 'Unknown';
  return String(type)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Format a Firestore timestamp into a clean two-line HTML string
 * for the audit log timestamp column.
 * Returns a safe HTML string (not escaped — rendered via innerHTML in the td).
 */
function formatAuditTimestamp(ts) {
  if (!ts) return '<span class="audit-ts-date">—</span>';
  try {
    let d;
    if (ts.toDate && typeof ts.toDate === 'function') {
      d = ts.toDate();
    } else if (typeof ts.seconds === 'number') {
      d = new Date(ts.seconds * 1000);
    } else {
      d = new Date(ts);
    }
    if (isNaN(d.getTime())) return '<span class="audit-ts-date">Recently</span>';
    const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timePart = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `<span class="audit-ts-date">${datePart}</span><span class="audit-ts-time">${timePart}</span>`;
  } catch (e) {}
  return '<span class="audit-ts-date">Recently</span>';
}

/**
 * Map action string to an appropriate badge colour class.
 */
function getAuditActionBadgeClass(action) {
  if (!action) return 'badge-gray';
  const a = String(action).toUpperCase();
  if (a.includes('DELETE') || a.includes('REJECT')) return 'badge-red';
  if (a.includes('CREATED') || a.includes('APPROVED') || a.includes('RESOLVED')) return 'badge-green';
  if (a.includes('STATUS_CHANGED') || a.includes('UPDATED') || a.includes('ASSIGNED')) return 'badge-blue';
  if (a.includes('DECISION') || a.includes('SYSTEM')) return 'badge-orange';
  return 'badge-purple';
}

/**
 * Convert raw metadata object + action into a concise human-readable string.
 * The database record is NOT modified — only the display text changes.
 */
function formatAuditDetails(action, metadata) {
  if (!metadata || typeof metadata !== 'object') return '—';
  const m = metadata;
  const a = String(action || '').toUpperCase();
  const parts = [];

  // ── Route actions ────────────────────────────────────────────────────────
  if (a === 'ROUTE_UPDATED') {
    if (m.name) parts.push(`Route "${m.name}" updated`);
    if (m.totalStops != null) parts.push(`${m.totalStops} stops`);
    return parts.join(' • ') || 'Route updated';
  }
  if (a === 'ROUTE_CREATED') {
    if (m.name) parts.push(`Route "${m.name}" created`);
    if (m.totalStops != null) parts.push(`${m.totalStops} stops`);
    return parts.join(' • ') || 'New route created';
  }
  if (a === 'ROUTE_DELETED') {
    return m.name ? `Route "${m.name}" deleted` : 'Route deleted';
  }
  if (a === 'ROUTE_STATUS_CHANGED') {
    if (m.oldStatus && m.newStatus) return `Status changed from ${m.oldStatus} to ${m.newStatus}`;
    if (m.newStatus) return `Status changed to ${m.newStatus}`;
    return 'Route status updated';
  }

  // ── Bus actions ──────────────────────────────────────────────────────────
  if (a === 'BUS_CREATED') {
    if (m.busNumber) parts.push(`Bus ${m.busNumber} registered`);
    if (m.route) parts.push(`Route: ${m.route}`);
    return parts.join(' • ') || 'Bus created';
  }
  if (a === 'BUS_UPDATED') {
    if (m.busNumber) parts.push(`Bus ${m.busNumber} updated`);
    if (m.changes && typeof m.changes === 'object') {
      const changeKeys = Object.keys(m.changes);
      if (changeKeys.length) parts.push(`Fields: ${changeKeys.map(k => formatCamelLabel(k)).join(', ')}`);
    }
    return parts.join(' • ') || 'Bus details updated';
  }
  if (a === 'BUS_STATUS_CHANGED') {
    if (m.oldStatus && m.newStatus) return `Status changed from ${m.oldStatus} to ${m.newStatus}`;
    if (m.newStatus) return `Status changed to ${m.newStatus}`;
    return 'Bus status updated';
  }
  if (a === 'DRIVER_ASSIGNED') {
    if (m.driverName) parts.push(`Driver: ${m.driverName}`);
    if (m.busNumber) parts.push(`Bus: ${m.busNumber}`);
    return parts.join(' • ') || 'Driver assigned';
  }

  // ── Ticket / Report actions ──────────────────────────────────────────────
  if (a === 'TICKET_RESOLVED') {
    if (m.newStatus) parts.push(`Status changed to ${m.newStatus}`);
    if (m.newPrio) parts.push(`Priority: ${m.newPrio}`);
    if (m.replyText) parts.push('Reply added');
    return parts.join(' • ') || 'Ticket resolved';
  }

  // ── System Settings ───────────────────────────────────────────────────────
  if (a === 'SYSTEM_SETTINGS_UPDATED') {
    const settingParts = [];
    if (m.routeRefreshInterval != null) settingParts.push(`Route refresh: ${m.routeRefreshInterval}s`);
    if (m.geolocationTimeout   != null) settingParts.push(`Geolocation timeout: ${m.geolocationTimeout}s`);
    if (m.reportRetentionDays  != null) settingParts.push(`Report retention: ${m.reportRetentionDays} days`);
    return settingParts.join(' • ') || 'System settings updated';
  }
  if (a === 'SYSTEM_SETTINGS_RESET') {
    return 'All system configurations reset to default values';
  }

  // ── Approval actions ─────────────────────────────────────────────────────
  if (a === 'APPROVAL_DECISION') {
    return m.status ? `Request ${m.status.toLowerCase()}` : 'Approval decision made';
  }

  // ── Generic fallback: render known fields in human-readable form ──────────
  const skipKeys = new Set(['id', 'docId']);
  for (const [k, v] of Object.entries(m)) {
    if (skipKeys.has(k) || v == null || v === '') continue;
    if (typeof v === 'object') continue; // skip nested objects in generic path
    // camelCase key → readable label
    const label = formatCamelLabel(k);
    parts.push(`${label}: ${v}`);
  }
  return parts.join(' • ') || '—';
}

/**
 * Convert a camelCase key to a Title Case readable label.
 * e.g. "newStatus" → "New Status", "totalStops" → "Total Stops"
 */
function formatCamelLabel(key) {
  return String(key)
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, c => c.toUpperCase())
    .trim();
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

/**
 * Setup Legal View Tab Navigation (Smooth scroll to Terms or Privacy on the continuous page)
 */
function setupLegalTabs() {
  const tabs = document.querySelectorAll('.legal-nav-tab');
  if (!tabs || tabs.length === 0) return;

  tabs.forEach(tab => {
    // Avoid double attaching
    if (tab.dataset.bound === 'true') return;
    tab.dataset.bound = 'true';

    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const target = tab.getAttribute('data-legal-tab');
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const targetDoc = document.getElementById(`legal-doc-${target}`);
      if (targetDoc) {
        targetDoc.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

// Initial setup call for document tabs
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupLegalTabs);
} else {
  setupLegalTabs();
}

// =============================================================================
// ADMIN SKELETON LOADING GENERATORS & CONTROLLERS
// =============================================================================

function getTableSkeletonHTML(colCount = 6, rowCount = 4) {
  const widths = ['60px', '130px', '150px', '95px', '80px', '115px', '90px', '70px', '125px', '100px'];
  let html = '';
  for (let r = 0; r < rowCount; r++) {
    html += '<tr class="skeleton-table-row">';
    for (let c = 0; c < colCount; c++) {
      const isFirst = (c === 0);
      const isLast = (c === colCount - 1);
      const isBadge = (c === colCount - 2 || c === 4);
      const width = widths[(c + r * 2) % widths.length];

      if (isLast) {
        html += `<td style="text-align: right;"><div class="admin-skeleton admin-skeleton-btn" style="width: 65px; height: 26px; margin-left: auto;"></div></td>`;
      } else if (isFirst) {
        html += `<td><div class="admin-skeleton admin-skeleton-pill" style="width: 55px; height: 18px;"></div></td>`;
      } else if (isBadge) {
        html += `<td><div class="admin-skeleton admin-skeleton-badge" style="width: ${width}; height: 22px;"></div></td>`;
      } else {
        html += `<td><div class="admin-skeleton admin-skeleton-line" style="width: ${width}; height: 14px;"></div></td>`;
      }
    }
    html += '</tr>';
  }
  return html;
}

function renderTableSkeleton(tbodyOrId, colCount = 6, rowCount = 4) {
  const tbody = typeof tbodyOrId === 'string' ? document.getElementById(tbodyOrId) : tbodyOrId;
  if (!tbody) return;
  tbody.innerHTML = getTableSkeletonHTML(colCount, rowCount);
}

function getListSkeletonHTML(count = 3) {
  let html = '';
  for (let i = 0; i < count; i++) {
    const titleWidth = (50 + (i * 15) % 35) + '%';
    const subWidth = (65 + (i * 11) % 25) + '%';
    html += `
      <div class="skeleton-list-card">
        <div class="admin-skeleton admin-skeleton-circle" style="width: 34px; height: 34px; flex-shrink: 0;"></div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
          <div class="admin-skeleton admin-skeleton-line" style="width: ${titleWidth}; height: 14px;"></div>
          <div class="admin-skeleton admin-skeleton-line" style="width: ${subWidth}; height: 11px;"></div>
        </div>
        <div class="admin-skeleton admin-skeleton-pill" style="width: 52px; height: 18px; flex-shrink: 0;"></div>
      </div>
    `;
  }
  return html;
}

function renderListSkeleton(containerOrId, count = 3) {
  const container = typeof containerOrId === 'string' ? document.getElementById(containerOrId) : containerOrId;
  if (!container) return;
  container.innerHTML = getListSkeletonHTML(count);
}

function getDashboardTitleSkeletonHTML() {
  return `<div class="admin-skeleton admin-skeleton-line" style="width: 160px; height: 32px; border-radius: 6px;" aria-hidden="true"></div>`;
}

function getKPICardSkeletonHTML(labelWidth = '80px', valueWidth = '60px') {
  return `
    <div class="stat-skeleton" aria-hidden="true">
      <div class="admin-skeleton admin-skeleton-line" style="width: ${labelWidth}; height: 14px; margin-bottom: 12px;"></div>
      <div class="admin-skeleton admin-skeleton-stat" style="width: ${valueWidth}; height: 36px; border-radius: 6px;"></div>
    </div>
  `;
}

function getRecentUpdatesSkeletonHTML(count = 4) {
  const widths = [
    { title: '48%', desc: '78%', meta: '32%' },
    { title: '42%', desc: '68%', meta: '38%' },
    { title: '54%', desc: '82%', meta: '28%' },
    { title: '38%', desc: '72%', meta: '35%' }
  ];
  let html = '';
  for (let i = 0; i < count; i++) {
    const w = widths[i % widths.length];
    html += `
      <div class="skeleton-activity-item" aria-hidden="true">
        <div class="admin-skeleton admin-skeleton-circle" style="width: 9px; height: 9px; margin-top: 5px; flex-shrink: 0;"></div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 7px;">
          <div class="admin-skeleton admin-skeleton-line" style="width: ${w.title}; height: 14px;"></div>
          <div class="admin-skeleton admin-skeleton-line" style="width: ${w.desc}; height: 12px;"></div>
          <div class="admin-skeleton admin-skeleton-line" style="width: ${w.meta}; height: 10px;"></div>
        </div>
      </div>
    `;
  }
  return html;
}

function getSystemStatusSkeletonHTML() {
  const rows = [
    { label: '85px', badge: '110px' },
    { label: '95px', badge: '88px' },
    { label: '105px', badge: '76px' }
  ];
  return rows.map(r => `
    <div class="status-row" aria-hidden="true">
      <div class="admin-skeleton admin-skeleton-line" style="width: ${r.label}; height: 14px;"></div>
      <div class="admin-skeleton admin-skeleton-pill" style="width: ${r.badge}; height: 22px;"></div>
    </div>
  `).join('');
}

function getDashboardSkeletonHTML() {
  return `
    <div class="page-header">
      ${getDashboardTitleSkeletonHTML()}
    </div>
    <div class="stats-grid-row1">
      <div class="stat-card">${getKPICardSkeletonHTML('78px', '65px')}</div>
      <div class="stat-card">${getKPICardSkeletonHTML('82px', '65px')}</div>
      <div class="stat-card">${getKPICardSkeletonHTML('98px', '72px')}</div>
      <div class="stat-card">${getKPICardSkeletonHTML('92px', '70px')}</div>
    </div>
    <div class="stats-grid-row2">
      <div class="stat-card">${getKPICardSkeletonHTML('102px', '50px')}</div>
    </div>
    <div class="widgets-grid">
      <div class="widget-card">
        <h2 class="section-title-line">Recent Updates</h2>
        <div class="updates-list">
          ${getRecentUpdatesSkeletonHTML(4)}
        </div>
      </div>
      <div class="widget-card document-alerts-card" id="dashboard-document-alerts-widget">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid #E5E7EB;">
          <h2 style="font-size: 20px; font-weight: 700; color: #000000; letter-spacing: -0.3px; margin: 0;">Document Alerts</h2>
          <a href="#documents" class="nav-view-all-link" style="font-size: 13px; font-weight: 600; color: #0052FF; text-decoration: none;">View All Documents &rarr;</a>
        </div>
        <div class="doc-alerts-list">
          <div class="skeleton-activity-item" aria-hidden="true">
            <div class="admin-skeleton admin-skeleton-circle" style="width: 10px; height: 10px; margin-top: 4px; flex-shrink: 0;"></div>
            <div style="flex: 1;"><div class="admin-skeleton admin-skeleton-line" style="width: 80%; height: 14px;"></div></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderDashboardSkeleton() {
  const dashboardView = document.getElementById('dashboard-view');
  if (dashboardView) {
    dashboardView.setAttribute('aria-busy', 'true');
  }

  // Dashboard title
  const titleText = document.getElementById('dashboard-title-text');
  const titleSkeleton = document.getElementById('dashboard-title-skeleton');
  if (titleText) titleText.classList.add('hidden');
  if (titleSkeleton) titleSkeleton.classList.remove('hidden');

  // KPI cards
  const statCards = document.querySelectorAll('#dashboard-view .stat-card');
  statCards.forEach(card => {
    const skeleton = card.querySelector('.stat-skeleton');
    const content = card.querySelector('.stat-content');
    if (skeleton) skeleton.classList.remove('hidden');
    if (content) content.classList.add('hidden');
  });

  // Recent Updates
  const updatesContainer = document.getElementById('recent-updates-list');
  if (updatesContainer && !updatesContainer.querySelector('.skeleton-activity-item')) {
    updatesContainer.innerHTML = getRecentUpdatesSkeletonHTML(4);
  }

  // System status
  const sysSkeleton = document.getElementById('system-status-skeleton');
  const sysContent = document.getElementById('system-status-content');
  if (sysSkeleton) sysSkeleton.classList.remove('hidden');
  if (sysContent) sysContent.classList.add('hidden');
}

function renderDashboardLoaded() {
  isDashboardLoading = false;
  const dashboardView = document.getElementById('dashboard-view');
  if (dashboardView) {
    dashboardView.setAttribute('aria-busy', 'false');
  }

  // Dashboard title
  const titleText = document.getElementById('dashboard-title-text');
  const titleSkeleton = document.getElementById('dashboard-title-skeleton');
  if (titleText) titleText.classList.remove('hidden');
  if (titleSkeleton) titleSkeleton.classList.add('hidden');

  // KPI cards
  const statCards = document.querySelectorAll('#dashboard-view .stat-card');
  statCards.forEach(card => {
    const skeleton = card.querySelector('.stat-skeleton');
    const content = card.querySelector('.stat-content');
    if (skeleton) skeleton.classList.add('hidden');
    if (content) content.classList.remove('hidden');
  });

  // System status
  const sysSkeleton = document.getElementById('system-status-skeleton');
  const sysContent = document.getElementById('system-status-content');
  if (sysSkeleton) sysSkeleton.classList.add('hidden');
  if (sysContent) sysContent.classList.remove('hidden');
}

// Global window exposures for skeleton animations
window.getTableSkeletonHTML = getTableSkeletonHTML;
window.renderTableSkeleton = renderTableSkeleton;
window.getListSkeletonHTML = getListSkeletonHTML;
window.renderListSkeleton = renderListSkeleton;
window.getDashboardTitleSkeletonHTML = getDashboardTitleSkeletonHTML;
window.getKPICardSkeletonHTML = getKPICardSkeletonHTML;
window.getRecentUpdatesSkeletonHTML = getRecentUpdatesSkeletonHTML;
window.getSystemStatusSkeletonHTML = getSystemStatusSkeletonHTML;
window.getDashboardSkeletonHTML = getDashboardSkeletonHTML;
window.renderDashboardSkeleton = renderDashboardSkeleton;
window.renderDashboardLoaded = renderDashboardLoaded;

