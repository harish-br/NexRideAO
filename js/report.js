/**
 * NexRide — Complete Production-Ready Report Module (js/report.js)
 * 
 * Features:
 * - 11 Dynamic categories with category selector bottom sheet
 * - Category-specific dynamic inputs & validation
 * - Client-side image compression & multi-attachment previews (up to 5)
 * - Geolocation capture (non-blocking)
 * - Priority & urgency level selection with safety alerts
 * - Anonymous reporting option
 * - Unique human-readable ID generation (NXR-2026-XXXXXX)
 * - Firestore integration with offline draft / fallback resilience
 * - My Reports list with status filter pills
 * - Report Details with interactive timeline & admin messages
 * - Notifications integration with unread badges
 */

import { firestore as db, auth, storage } from './firebase-config.js';
import { 
  collection, doc, setDoc, addDoc, getDoc, getDocs, 
  query, where, orderBy, onSnapshot, serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { 
  ref, uploadString, getDownloadURL 
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js';

// =============================================================================
// CATEGORIES CONFIGURATION (11 Categories)
// =============================================================================
export const REPORT_CATEGORIES = [
  {
    id: 'bus',
    name: 'Bus Issue',
    icon: `<svg width="22" height="22" viewBox="0 0 1024 1024" fill="currentColor"><path d="M881.8 284.4V199.1c0-56.9-59.7-113.8-369.8-113.8S142.2 142.2 142.2 199.1v85.3c-31.3 0-56.9 25.6-56.9 56.9v56.9c0 31.3 25.6 56.9 56.9 56.9v312.9c0 31.3 17.1 59.7 42.7 74v54c0 39.8 31.3 71.1 71.1 71.1s71.1-31.3 71.1-71.1v-42.7h369.8v42.7c0 39.8 31.3 71.1 71.1 71.1s71.1-31.3 71.1-71.1v-54c25.6-14.2 42.7-42.7 42.7-74V455.1c31.3 0 56.9-25.6 56.9-56.9v-56.9c0-31.3-25.6-56.9-56.9-56.9zM312.9 170.7h398.2c17.1 0 28.4 11.4 28.4 28.4s-11.4 28.4-28.4 28.4H312.9c-17.1 0-28.4-11.4-28.4-28.4s11.4-28.4 28.4-28.4zM256 796.4c-31.3 0-56.9-25.6-56.9-56.9s25.6-56.9 56.9-56.9 56.9 25.6 56.9 56.9-25.6 56.9-56.9 56.9zm512 0c-31.3 0-56.9-25.6-56.9-56.9s25.6-56.9 56.9-56.9 56.9 25.6 56.9 56.9-25.6 56.9-56.9 56.9zm56.9-284.4c0 45.5-37 85.3-85.3 85.3H284.4c-48.4 0-85.3-39.8-85.3-85.3V369.8c0-48.4 37-85.3 85.3-85.3h455.1c48.4 0 85.3 37 85.3 85.3v142.2z"/></svg>`,
    desc: 'Issues with bus condition, seats, cleanliness or mechanics',
    requiresBus: true,
    requiresRoute: true
  },
  {
    id: 'driver',
    name: 'Driver/Staff Behaviour',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M9 2C6.38 2 4.25 4.13 4.25 6.75C4.25 9.32 6.26 11.4 8.88 11.49C8.96 11.48 9.04 11.48 9.1 11.49C9.12 11.49 9.13 11.49 9.15 11.49C9.16 11.49 9.16 11.49 9.17 11.49C11.73 11.4 13.74 9.32 13.75 6.75C13.75 4.13 11.62 2 9 2Z"/><path d="M14.08 14.15C11.29 12.29 6.74 12.29 3.93 14.15C2.66 15 1.96 16.15 1.96 17.38C1.96 18.61 2.66 19.75 3.92 20.59C5.32 21.53 7.16 22 9 22C10.84 22 12.68 21.53 14.08 20.59C15.34 19.74 16.04 18.6 16.04 17.36C16.03 16.13 15.34 14.99 14.08 14.15Z"/><path d="M19.99 7.34C20.15 9.28 18.77 10.98 16.86 11.21C16.85 11.21 16.85 11.21 16.84 11.21H16.81C16.75 11.21 16.69 11.21 16.64 11.23C15.67 11.28 14.78 10.97 14.11 10.4C15.14 9.48 15.73 8.1 15.61 6.6C15.54 5.79 15.26 5.05 14.84 4.42C15.22 4.23 15.66 4.11 16.11 4.07C18.07 3.9 19.82 5.36 19.99 7.34Z"/><path d="M21.99 16.59C21.91 17.56 21.29 18.4 20.25 18.97C19.25 19.52 17.99 19.78 16.74 19.75C17.46 19.1 17.88 18.29 17.96 17.43C18.06 16.19 17.47 15 16.29 14.05C15.62 13.52 14.84 13.1 13.99 12.79C16.2 12.15 18.98 12.58 20.69 13.96C21.61 14.7 22.08 15.63 21.99 16.59Z"/></svg>`,
    desc: 'Rash driving, rude conduct, overcrowding or staff issues',
    requiresBus: true,
    requiresRoute: true
  },
  {
    id: 'route',
    name: 'Route Issue',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M11.9997 19.75H9.3197C8.1597 19.75 7.1497 19.05 6.7497 17.97C6.3397 16.89 6.6397 15.7 7.5097 14.93L15.4997 7.94C15.9797 7.52 15.9897 6.95 15.8497 6.56C15.6997 6.17 15.3197 5.75 14.6797 5.75H11.9997C11.5897 5.75 11.2497 5.41 11.2497 5C11.2497 4.59 11.5897 4.25 11.9997 4.25H14.6797C15.8397 4.25 16.8497 4.95 17.2497 6.03C17.6597 7.11 17.3597 8.3 16.4897 9.07L8.4997 16.06C8.0197 16.48 8.0097 17.05 8.1497 17.44C8.2997 17.83 8.6797 18.25 9.3197 18.25H11.9997C12.4097 18.25 12.7497 18.59 12.7497 19C12.7497 19.41 12.4097 19.75 11.9997 19.75Z"/><path d="M19.9998 15H16.9998C15.8998 15 14.9998 15.9 14.9998 17V20C14.9998 21.1 15.8998 22 16.9998 22H19.9998C21.0998 22 21.9998 21.1 21.9998 20V17C21.9998 15.9 21.0998 15 19.9998 15ZM18.5098 19.5C17.9598 19.5 17.5098 19.05 17.5098 18.5C17.5098 17.95 17.9498 17.5 18.5098 17.5H18.5198C19.0698 17.5 19.5198 17.95 19.5198 18.5C19.5198 19.05 19.0698 19.5 18.5098 19.5Z"/><path d="M5.46973 2C3.53973 2 1.96973 3.57 1.96973 5.5C1.96973 7.43 3.53973 9 5.46973 9C7.39973 9 8.96973 7.43 8.96973 5.5C8.96973 3.57 7.40973 2 5.46973 2ZM5.50973 6.5C4.95973 6.5 4.50973 6.05 4.50973 5.5C4.50973 4.95 4.94973 4.5 5.50973 4.5H5.51973C6.06973 4.5 6.51973 4.95 6.51973 5.5C6.51973 6.05 6.06973 6.5 5.50973 6.5Z"/></svg>`,
    desc: 'Skipped stops, incorrect path or route schedule deviations',
    requiresBus: false,
    requiresRoute: true
  },
  {
    id: 'delay',
    name: 'Bus Delay',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    desc: 'Bus running late or prolonged unscheduled halts',
    requiresBus: true,
    requiresRoute: true
  },
  {
    id: 'not_available',
    name: 'Bus Not Available',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    desc: 'Assigned bus did not show up or was cancelled',
    requiresBus: false,
    requiresRoute: true
  },
  {
    id: 'epass',
    name: 'E-Pass Issue',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10H22"/><path d="M11.55 20.5H6.44C2.89 20.5 2 19.62 2 16.11V7.89C2 4.71 2.73 3.69 5.52 3.53C5.8 3.52 6.11 3.51 6.44 3.51H17.55C21.1 3.51 22 4.39 22 7.9V12.31"/><path opacity="0.4" d="M6 16H10"/><path opacity="0.4" d="M22 18C22 18.75 21.79 19.46 21.42 20.06C20.73 21.22 19.46 22 18 22C16.54 22 15.27 21.22 14.58 20.06C14.21 19.46 14 18.75 14 18C14 15.79 15.79 14 18 14C20.21 14 22 15.79 22 18Z"/><path opacity="0.4" d="M16.44 18L17.43 18.99L19.56 17.02"/></svg>`,
    desc: 'QR verification, pass generation, validity or details errors',
    requiresBus: false,
    requiresRoute: false
  },
  {
    id: 'payment',
    name: 'Payment/Fees Issue',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8.5C2 5 3.5 3.5 7 3.5H17C20.5 3.5 22 5 22 8.5V15.5C22 19 20.5 20.5 17 20.5H7C3.5 20.5 2 19 2 15.5V8.5Z"/><path d="M2 10.5H22"/><path d="M6 16.5H10"/></svg>`,
    desc: 'Payment failure, wrong deduction, or fee receipt issues',
    requiresBus: false,
    requiresRoute: false
  },
  {
    id: 'safety',
    name: 'Safety Concern',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M21.76 15.92L15.36 4.4C14.5 2.85 13.31 2 12 2C10.69 2 9.49998 2.85 8.63998 4.4L2.23998 15.92C1.42998 17.39 1.33998 18.8 1.98998 19.91C2.63998 21.02 3.91998 21.63 5.59998 21.63H18.4C20.08 21.63 21.36 21.02 22.01 19.91C22.66 18.8 22.57 17.38 21.76 15.92ZM11.25 9C11.25 8.59 11.59 8.25 12 8.25C12.41 8.25 12.75 8.59 12.75 9V14C12.75 14.41 12.41 14.75 12 14.75C11.59 14.75 11.25 14.41 11.25 14V9ZM12.71 17.71C12.66 17.75 12.61 17.79 12.56 17.83C12.5 17.87 12.44 17.9 12.38 17.92C12.32 17.95 12.26 17.97 12.19 17.98C12.13 17.99 12.06 18 12 18C11.94 18 11.87 17.99 11.8 17.98C11.74 17.97 11.68 17.95 11.62 17.92C11.56 17.9 11.5 17.87 11.44 17.83C11.39 17.79 11.34 17.75 11.29 17.71C11.11 17.52 11 17.26 11 17C11 16.74 11.11 16.48 11.29 16.29C11.34 16.25 11.39 16.21 11.44 16.17C11.5 16.13 11.56 16.1 11.62 16.08C11.68 16.05 11.74 16.03 11.8 16.02C11.93 15.99 12.07 15.99 12.19 16.02C12.26 16.03 12.32 16.05 12.38 16.08C12.44 16.1 12.5 16.13 12.56 16.17C12.61 16.21 12.66 16.25 12.71 16.29C12.89 16.48 13 16.74 13 17C13 17.26 12.89 17.52 12.71 17.71Z"/></svg>`,
    desc: 'Urgent security hazard, medical emergency or danger on board',
    requiresBus: true,
    requiresRoute: true
  },
  {
    id: 'lost_found',
    name: 'Lost & Found',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M22 10V15C22 20 20 22 15 22H9C4 22 2 20 2 15V9C2 4 4 2 9 2H14V6C14 8 15 9 17 9H22V10Z"/><path opacity="0.5" d="M16 2.01V5.5C16 7 17 8 18.5 8H21.99L16 2.01Z"/><path d="M7 13H13"/><path d="M7 17H11"/></svg>`,
    desc: 'Report lost personal items or found belongings in bus/campus',
    requiresBus: true,
    requiresRoute: true
  },
  {
    id: 'other',
    name: 'Other',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M17 2.43H7C4 2.43 2 4.43 2 7.43V13.43C2 16.43 4 18.43 7 18.43V20.56C7 21.36 7.89 21.84 8.55 21.39L13 18.43H17C20 18.43 22 16.43 22 13.43V7.43C22 4.43 20 2.43 17 2.43ZM12 14.6C11.58 14.6 11.25 14.26 11.25 13.85C11.25 13.44 11.58 13.1 12 13.1C12.42 13.1 12.75 13.44 12.75 13.85C12.75 14.26 12.42 14.6 12 14.6ZM13.26 10.45C12.87 10.71 12.75 10.88 12.75 11.16V11.37C12.75 11.78 12.41 12.12 12 12.12C11.59 12.12 11.25 11.78 11.25 11.37V11.16C11.25 10 12.1 9.43 12.42 9.21C12.79 8.96 12.91 8.79 12.91 8.53C12.91 8.03 12.5 7.62 12 7.62C11.5 7.62 11.09 8.03 11.09 8.53C11.09 8.94 10.75 9.28 10.34 9.28C9.93 9.28 9.59 8.94 9.59 8.53C9.59 7.2 10.67 6.12 12 6.12C13.33 6.12 14.41 7.2 14.41 8.53C14.41 9.67 13.57 10.24 13.26 10.45Z"/></svg>`,
    desc: 'General suggestions, inquiries or unlisted concerns',
    requiresBus: false,
    requiresRoute: false
  }
];

// State
let selectedCategory = REPORT_CATEGORIES[0];
let selectedPriority = 'Normal'; // Normal, High, Urgent
let attachedFiles = []; // array of { file, dataUrl, name }
let capturedLocation = null; // { lat, lng, text, timestamp }
let activeFilter = 'All';
let myReportsCache = [];
let allBusesList = [];
let userProfile = null;
let isFormDirty = false;
let userNotifications = [];

// =============================================================================
// DOM INITIALIZATION
// =============================================================================
export function initReportModule() {
  console.log('[Report] Initializing Report Module...');

  // 1. Fetch available buses for selection
  loadBusesData();

  // 2. Auth listener to load user info & user reports
  if (auth) {
    auth.onAuthStateChanged((user) => {
      if (user) {
        loadUserProfile(user.uid);
        subscribeToMyReports(user.uid);
        subscribeToNotifications(user.uid);
      } else {
        userProfile = null;
        myReportsCache = [];
        userNotifications = [];
        updateNotificationsUI();
      }
    });
  }

  // 3. Bind Navigation Triggers
  bindNavigation();

  // 4. Render Category Options in Bottom Sheet
  renderCategorySheetOptions();

  // 5. Initialize Form Elements
  setupFormListeners();

  // 6. Initialize My Reports Filter Bar
  setupFilterPills();
}

// Auto-run if DOM is already ready or wait for event
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initReportModule);
} else {
  initReportModule();
}

// Expose to window for global access
window.openReportIssuePage = openReportIssuePage;
window.openMyReportsPage = openMyReportsPage;
window.openReportDetails = openReportDetails;
window.openCategoryModal = () => {
  renderCategorySheetOptions();
  showModal('report-category-modal');
};
window.closeCategoryModal = () => {
  hideModal('report-category-modal');
};

// =============================================================================
// DATA FETCHERS
// =============================================================================
async function loadBusesData() {
  if (!db) return;
  try {
    const snap = await getDocs(collection(db, 'buses'));
    allBusesList = [];
    snap.forEach(docSnap => {
      const b = docSnap.data();
      const bNum = b.bus_no || b.busNumber || docSnap.id.replace('bus_', '');
      const rName = b.routeName || b.route || `Route ${bNum}`;
      allBusesList.push({
        id: docSnap.id,
        busNumber: String(bNum).trim(),
        routeName: rName,
        stops: b.stops || []
      });
    });
    // Sort bus list numerically
    allBusesList.sort((a, b) => parseInt(a.busNumber) - parseInt(b.busNumber));
  } catch (err) {
    console.warn('[Report] Could not load buses from Firestore:', err);
  }
}

async function loadUserProfile(uid) {
  if (!db) return;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      userProfile = snap.data();
      userProfile.uid = uid;
    }
  } catch (err) {
    console.warn('[Report] Could not load user profile:', err);
  }
}

function subscribeToMyReports(uid) {
  if (!db) return;
  try {
    const q = query(collection(db, 'reports'), where('userId', '==', uid));
    onSnapshot(q, (snapshot) => {
      myReportsCache = [];
      snapshot.forEach(docSnap => {
        myReportsCache.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });
      // Sort newest first
      myReportsCache.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
        return timeB - timeA;
      });
      renderMyReportsList();
    }, (error) => {
      console.warn('[Report] Reports subscription error:', error);
    });
  } catch (e) {
    console.warn('[Report] Firestore snapshot setup error:', e);
  }
}

function subscribeToNotifications(uid) {
  if (!db) return;
  try {
    const q = query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc'));
    onSnapshot(q, (snapshot) => {
      userNotifications = [];
      snapshot.forEach(docSnap => {
        userNotifications.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });
      updateNotificationsUI();
    }, (error) => {
      console.warn('[Report] Notifications subscription error:', error);
    });
  } catch (e) {
    console.warn('[Report] Notifications setup error:', e);
  }
}

// =============================================================================
// NAVIGATION WIRING
// =============================================================================
function bindNavigation() {
  // Home Screen Report Card
  const reportCardBtn = document.getElementById('report-card-btn');
  if (reportCardBtn) {
    reportCardBtn.addEventListener('click', () => {
      openReportIssuePage();
    });
  }

  // Help & Support "Report an Issue" button
  const hsReportNavBtn = document.getElementById('hs-report-nav-btn');
  if (hsReportNavBtn) {
    hsReportNavBtn.addEventListener('click', () => {
      openReportIssuePage();
    });
  }

  // Help & Support "Support Requests" button
  const hsTicketsNavBtn = document.getElementById('hs-tickets-nav-btn');
  if (hsTicketsNavBtn) {
    hsTicketsNavBtn.addEventListener('click', () => {
      openMyReportsPage();
    });
  }

  // Header "My Reports" action button inside Report Issue Page
  const reportMyReportsNavBtn = document.getElementById('report-my-reports-nav-btn');
  if (reportMyReportsNavBtn) {
    reportMyReportsNavBtn.addEventListener('click', () => {
      openMyReportsPage();
    });
  }

  // Back button in Report Issue Page
  const backReportIssueBtn = document.getElementById('back-report-issue');
  if (backReportIssueBtn) {
    backReportIssueBtn.addEventListener('click', () => {
      handleBackWithDiscardCheck();
    });
  }

  // Back button in My Reports Page
  const backMyReportsBtn = document.getElementById('back-my-reports');
  if (backMyReportsBtn) {
    backMyReportsBtn.addEventListener('click', () => {
      closePage('my-reports-page');
    });
  }

  // Back button in Report Details Page
  const backReportDetailsBtn = document.getElementById('back-report-details');
  if (backReportDetailsBtn) {
    backReportDetailsBtn.addEventListener('click', () => {
      closePage('report-details-page');
    });
  }

  // New Report Floating/Header Action in My Reports
  const myReportsNewBtn = document.getElementById('my-reports-new-btn');
  if (myReportsNewBtn) {
    myReportsNewBtn.addEventListener('click', () => {
      closePage('my-reports-page');
      openReportIssuePage();
    });
  }

  // Discard Confirmation Dialog Buttons
  const discardStayBtn = document.getElementById('report-discard-stay-btn');
  const discardConfirmBtn = document.getElementById('report-discard-confirm-btn');
  if (discardStayBtn) {
    discardStayBtn.addEventListener('click', () => {
      hideModal('report-discard-modal');
    });
  }
  if (discardConfirmBtn) {
    discardConfirmBtn.addEventListener('click', () => {
      hideModal('report-discard-modal');
      resetReportForm();
      closePage('report-issue-page');
    });
  }

  // Image Lightbox Close
  const lightboxClose = document.getElementById('report-lightbox-close');
  const lightbox = document.getElementById('report-image-lightbox');
  if (lightboxClose && lightbox) {
    lightboxClose.addEventListener('click', () => {
      lightbox.classList.remove('active');
    });
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) lightbox.classList.remove('active');
    });
  }
}

export function openReportIssuePage() {
  const page = document.getElementById('report-issue-page');
  if (page) {
    // Reset dirty state on fresh open
    isFormDirty = false;

    // Set default date & time
    const dateInput = document.getElementById('rep-field-datetime');
    if (dateInput && !dateInput.value) {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      dateInput.value = now.toISOString().slice(0, 16);
    }
    
    // Select default category
    selectCategory(selectedCategory || REPORT_CATEGORIES[0]);
    
    // Automatically capture mandatory current GPS location in background
    autoCaptureLocation();
    
    isFormDirty = false;
    page.classList.remove('hidden');
  }
}

export function openMyReportsPage() {
  const page = document.getElementById('my-reports-page');
  if (page) {
    renderMyReportsList();
    page.classList.remove('hidden');
  }
}

function closePage(pageId) {
  const page = document.getElementById(pageId);
  if (page) page.classList.add('hidden');
}

function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

function handleBackWithDiscardCheck() {
  if (isFormDirty) {
    showModal('report-discard-modal');
  } else {
    resetReportForm();
    closePage('report-issue-page');
  }
}

// =============================================================================
// CATEGORY BOTTOM SHEET SELECTOR
// =============================================================================
function renderCategorySheetOptions() {
  const list = document.getElementById('report-category-list');
  if (!list) return;

  list.innerHTML = '';
  REPORT_CATEGORIES.forEach(cat => {
    const isSelected = selectedCategory && selectedCategory.id === cat.id;
    const item = document.createElement('div');
    item.className = `report-category-option ${isSelected ? 'selected' : ''}`;
    item.setAttribute('data-id', cat.id);
    item.innerHTML = `
      <div class="report-cat-opt-icon">${cat.icon}</div>
      <div class="report-cat-opt-content">
        <div class="report-cat-opt-title">${cat.name}</div>
        <div class="report-cat-opt-desc">${cat.desc}</div>
      </div>
    `;

    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectCategory(cat);
      hideModal('report-category-modal');
    });

    list.appendChild(item);
  });

  // Close button on bottom sheet
  const closeBtn = document.getElementById('close-report-category-modal');
  if (closeBtn) {
    closeBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideModal('report-category-modal');
    };
  }

  // Backdrop click
  const modalBackdrop = document.getElementById('report-category-modal');
  if (modalBackdrop) {
    modalBackdrop.onclick = (e) => {
      if (e.target === modalBackdrop) hideModal('report-category-modal');
    };
  }

  // Trigger click
  const trigger = document.getElementById('report-category-trigger-btn');
  if (trigger) {
    trigger.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      renderCategorySheetOptions();
      showModal('report-category-modal');
    };
  }
}

export function selectCategory(cat) {
  selectedCategory = cat;

  // Update Trigger UI
  const iconBox = document.getElementById('rep-selected-cat-icon');
  const titleEl = document.getElementById('rep-selected-cat-title');
  const descEl = document.getElementById('rep-selected-cat-desc');

  if (iconBox) iconBox.innerHTML = cat.icon;
  if (titleEl) titleEl.textContent = cat.name;
  if (descEl) descEl.textContent = cat.desc;

  // Re-render Dynamic Fields
  renderDynamicCategoryFields(cat);

  // Highlight in modal
  document.querySelectorAll('.report-category-option').forEach(el => {
    if (el.getAttribute('data-id') === cat.id) {
      el.classList.add('selected');
    } else {
      el.classList.remove('selected');
    }
  });

  // Auto-urgency for Safety Concern
  if (cat.id === 'safety') {
    setPriority('Urgent');
    const emBanner = document.getElementById('rep-safety-emergency-banner');
    if (emBanner) emBanner.style.display = 'flex';
  } else {
    const emBanner = document.getElementById('rep-safety-emergency-banner');
    if (emBanner) emBanner.style.display = 'none';
  }

  // Re-render dynamic category fields
  renderDynamicCategoryFields(cat);
}

// =============================================================================
// DYNAMIC FORM FIELDS GENERATOR
// =============================================================================
function renderDynamicCategoryFields(cat) {
  const container = document.getElementById('rep-dynamic-fields-container');
  if (!container) return;

  container.innerHTML = '';

  // 1. Bus & Stage Selection (if relevant - entered by user)
  if (cat.requiresBus || cat.requiresRoute) {
    const busCard = document.createElement('div');
    busCard.className = 'report-card-section';

    busCard.innerHTML = `
      <div class="report-section-label">
        <span>Bus &amp; Stage Information <span class="required-star">*</span></span>
      </div>
      <div class="report-grid-2">
        <div class="report-input-group">
          <label class="report-input-label">Bus Number <span class="required-star">*</span></label>
          <input type="text" id="rep-field-bus-number" class="report-text-input" placeholder="" value="" />
        </div>
        <div class="report-input-group">
          <label class="report-input-label">Stage <span class="required-star">*</span></label>
          <input type="text" id="rep-field-route-name" class="report-text-input" placeholder="" value="" />
        </div>
      </div>
    `;

    container.appendChild(busCard);
  }

  // 2. Category-Specific Fields (User typed text inputs with clean labels)
  const specificCard = document.createElement('div');
  specificCard.className = 'report-card-section';

  switch (cat.id) {
    case 'bus':
      specificCard.innerHTML = `
        <div class="report-section-label">
          <span>Bus Issue Details <span class="required-star">*</span></span>
        </div>
        <div class="report-input-group">
          <label class="report-input-label">Specific Issue Type</label>
          <input type="text" id="rep-field-issue-type" class="report-text-input" placeholder="" />
        </div>
      `;
      container.appendChild(specificCard);
      break;

    case 'driver':
      specificCard.innerHTML = `
        <div class="report-section-label">
          <span>Staff &amp; Behaviour Details <span class="required-star">*</span></span>
        </div>
        <div class="report-grid-2">
          <div class="report-input-group">
            <label class="report-input-label">Staff / Driver Name</label>
            <input type="text" id="rep-field-driver-name" class="report-text-input" placeholder="" />
          </div>
          <div class="report-input-group">
            <label class="report-input-label">Specific Issue Type</label>
            <input type="text" id="rep-field-driver-behaviour" class="report-text-input" placeholder="" />
          </div>
        </div>
      `;
      container.appendChild(specificCard);
      break;

    case 'route':
      specificCard.innerHTML = `
        <div class="report-section-label">
          <span>Route &amp; Stage Specifics <span class="required-star">*</span></span>
        </div>
        <div class="report-grid-2">
          <div class="report-input-group">
            <label class="report-input-label">Stage / Stop Location</label>
            <input type="text" id="rep-field-stop-name" class="report-text-input" placeholder="" />
          </div>
          <div class="report-input-group">
            <label class="report-input-label">Specific Issue Type</label>
            <input type="text" id="rep-field-route-issue-type" class="report-text-input" placeholder="" />
          </div>
        </div>
      `;
      container.appendChild(specificCard);
      break;

    case 'delay':
      specificCard.innerHTML = `
        <div class="report-section-label">
          <span>Delay Details <span class="required-star">*</span></span>
        </div>
        <div class="report-grid-2">
          <div class="report-input-group">
            <label class="report-input-label">Expected Arrival</label>
            <input type="time" id="rep-field-expected-time" class="report-text-input" />
          </div>
          <div class="report-input-group">
            <label class="report-input-label">Actual Arrival</label>
            <input type="time" id="rep-field-actual-time" class="report-text-input" />
          </div>
        </div>
        <div class="report-input-group">
          <label class="report-input-label">Specific Issue Type / Delay Duration</label>
          <input type="text" id="rep-field-delay-duration" class="report-text-input" placeholder="" />
        </div>
      `;
      container.appendChild(specificCard);
      break;

    case 'not_available':
      specificCard.innerHTML = `
        <div class="report-section-label">
          <span>Missing Bus Details <span class="required-star">*</span></span>
        </div>
        <div class="report-grid-2">
          <div class="report-input-group">
            <label class="report-input-label">Scheduled Time</label>
            <input type="time" id="rep-field-scheduled-time" class="report-text-input" />
          </div>
          <div class="report-input-group">
            <label class="report-input-label">Stage / Waiting Stop</label>
            <input type="text" id="rep-field-stop-name" class="report-text-input" placeholder="" />
          </div>
        </div>
        <div class="report-input-group">
          <label class="report-input-label">Specific Issue Type</label>
          <input type="text" id="rep-field-issue-type" class="report-text-input" placeholder="" />
        </div>
      `;
      container.appendChild(specificCard);
      break;

    case 'epass':
      specificCard.innerHTML = `
        <div class="report-section-label">
          <span>E-Pass Details</span>
        </div>
        <div class="report-grid-2">
          <div class="report-input-group">
            <label class="report-input-label">E-Pass ID</label>
            <input type="text" id="rep-field-epass-id" class="report-text-input" placeholder="" />
          </div>
          <div class="report-input-group">
            <label class="report-input-label">Specific Issue Type <span class="required-star">*</span></label>
            <input type="text" id="rep-field-epass-issue-type" class="report-text-input" placeholder="" />
          </div>
        </div>
      `;
      container.appendChild(specificCard);
      break;

    case 'payment':
      specificCard.innerHTML = `
        <div class="report-section-label">
          <span>Payment &amp; Transaction Details <span class="required-star">*</span></span>
        </div>
        <div class="report-grid-2">
          <div class="report-input-group">
            <label class="report-input-label">Transaction / UPI Ref ID</label>
            <input type="text" id="rep-field-txn-id" class="report-text-input" placeholder="" />
          </div>
          <div class="report-input-group">
            <label class="report-input-label">Amount (₹)</label>
            <input type="number" id="rep-field-amount" class="report-text-input" placeholder="" />
          </div>
        </div>
        <div class="report-input-group">
          <label class="report-input-label">Specific Issue Type</label>
          <input type="text" id="rep-field-payment-issue" class="report-text-input" placeholder="" />
        </div>
      `;
      container.appendChild(specificCard);
      break;

    case 'lost_found':
      specificCard.innerHTML = `
        <div class="report-section-label">
          <span>Lost &amp; Found Details <span class="required-star">*</span></span>
        </div>
        <div class="report-grid-2">
          <div class="report-input-group">
            <label class="report-input-label">Specific Item Description</label>
            <input type="text" id="rep-field-item-cat" class="report-text-input" placeholder="" />
          </div>
          <div class="report-input-group">
            <label class="report-input-label">Approximate Date/Time Lost</label>
            <input type="datetime-local" id="rep-field-lost-time" class="report-text-input" />
          </div>
        </div>
      `;
      container.appendChild(specificCard);
      break;

    default:
      break;
  }
}

// =============================================================================
// FORM LISTENERS & ATTACHMENTS & LOCATION
// =============================================================================
function setupFormListeners() {
  // Subject & Description Character Counters
  const subjectInput = document.getElementById('rep-field-subject');
  const subjectCounter = document.getElementById('rep-subject-counter');
  if (subjectInput && subjectCounter) {
    subjectInput.addEventListener('input', () => {
      isFormDirty = true;
      subjectCounter.textContent = `${subjectInput.value.length} / 100`;
    });
  }

  const descInput = document.getElementById('rep-field-description');
  const descCounter = document.getElementById('rep-desc-counter');
  if (descInput && descCounter) {
    descInput.addEventListener('input', () => {
      isFormDirty = true;
      descCounter.textContent = `${descInput.value.length} / 1000`;
    });
  }

  // File Upload
  const fileInput = document.getElementById('rep-file-input');
  const addAttachBtn = document.getElementById('rep-add-attach-btn');
  if (fileInput && addAttachBtn) {
    addAttachBtn.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', handleFileAttachment);
  }

  // Submit Button
  const submitBtn = document.getElementById('report-submit-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', handleReportSubmission);
  }

  // Success Screen Buttons
  const successViewReportsBtn = document.getElementById('rep-success-view-reports-btn');
  const successHomeBtn = document.getElementById('rep-success-home-btn');

  if (successViewReportsBtn) {
    successViewReportsBtn.addEventListener('click', () => {
      closePage('report-issue-page');
      resetReportForm();
      openMyReportsPage();
    });
  }

  if (successHomeBtn) {
    successHomeBtn.addEventListener('click', () => {
      closePage('report-issue-page');
      resetReportForm();
    });
  }
}

function setPriority(prio) {
  selectedPriority = prio;
  const prioPills = document.querySelectorAll('.report-priority-pill');
  prioPills.forEach(pill => {
    const p = pill.getAttribute('data-priority');
    pill.className = 'report-priority-pill';
    if (p === prio) {
      pill.classList.add(`active-${prio.toLowerCase()}`);
    }
  });

  const urgentNotice = document.getElementById('rep-urgent-notice');
  if (urgentNotice) {
    urgentNotice.style.display = (prio === 'Urgent') ? 'flex' : 'none';
  }
}

// =============================================================================
// ATTACHMENTS HANDLING & CLIENT-SIDE COMPRESSION
// =============================================================================
async function handleFileAttachment(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  if (attachedFiles.length + files.length > 5) {
    showFormError('You can attach a maximum of 5 images.');
    return;
  }

  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      showFormError('Only image files (JPG, PNG, WebP) are allowed.');
      continue;
    }
    if (file.size > 10 * 1024 * 1024) {
      showFormError(`File ${file.name} exceeds 10MB limit.`);
      continue;
    }

    try {
      const compressedDataUrl = await compressImage(file, 1200, 0.75);
      attachedFiles.push({
        file: file,
        dataUrl: compressedDataUrl,
        name: file.name
      });
      isFormDirty = true;
    } catch (err) {
      console.warn('Error compressing image:', err);
    }
  }

  e.target.value = '';
  renderAttachmentsThumbnails();
}

function compressImage(file, maxDimension, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = readerEvent.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderAttachmentsThumbnails() {
  const container = document.getElementById('rep-attach-thumbs-container');
  const addBtn = document.getElementById('rep-add-attach-btn');
  if (!container) return;

  container.innerHTML = '';

  attachedFiles.forEach((att, idx) => {
    const thumb = document.createElement('div');
    thumb.className = 'report-thumb-item';
    thumb.innerHTML = `
      <img src="${att.dataUrl}" alt="Attachment ${idx+1}" class="report-thumb-img" />
      <button type="button" class="report-thumb-remove-btn" data-idx="${idx}">&times;</button>
    `;

    thumb.querySelector('.report-thumb-remove-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      attachedFiles.splice(idx, 1);
      renderAttachmentsThumbnails();
    });

    thumb.addEventListener('click', () => {
      openLightbox(att.dataUrl);
    });

    container.appendChild(thumb);
  });

  if (addBtn) {
    addBtn.style.display = (attachedFiles.length >= 5) ? 'none' : 'flex';
  }
}

function openLightbox(src) {
  const lightbox = document.getElementById('report-image-lightbox');
  const img = document.getElementById('report-lightbox-image');
  if (lightbox && img) {
    img.src = src;
    lightbox.classList.add('active');
  }
}

// =============================================================================
// AUTOMATIC MANDATORY LOCATION CAPTURE
// =============================================================================
export function autoCaptureLocation() {
  if (!navigator.geolocation) {
    console.warn('[Report] Geolocation is not supported by this browser.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const accuracy = Math.round(pos.coords.accuracy);

      capturedLocation = {
        latitude: lat,
        longitude: lng,
        accuracy: accuracy,
        timestamp: new Date().toISOString()
      };
      console.log('[Report] Mandatory location auto-captured:', capturedLocation);
    },
    (err) => {
      console.warn('[Report] Geolocation auto-detection warning:', err);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

function ensureLocationCaptured() {
  return new Promise((resolve) => {
    if (capturedLocation) {
      resolve(capturedLocation);
      return;
    }
    if (!navigator.geolocation) {
      capturedLocation = {
        latitude: null,
        longitude: null,
        accuracy: null,
        timestamp: new Date().toISOString(),
        note: 'Geolocation not supported'
      };
      resolve(capturedLocation);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        capturedLocation = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
          timestamp: new Date().toISOString()
        };
        resolve(capturedLocation);
      },
      (err) => {
        console.warn('[Report] Location capture fallback:', err);
        capturedLocation = {
          latitude: null,
          longitude: null,
          accuracy: null,
          timestamp: new Date().toISOString(),
          note: err.message || 'Permission denied or unavailable'
        };
        resolve(capturedLocation);
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  });
}

// =============================================================================
// SUBMISSION LOGIC
// =============================================================================
async function handleReportSubmission() {
  hideFormError();

  const subjectInput = document.getElementById('rep-field-subject');
  const descInput = document.getElementById('rep-field-description');
  const dateInput = document.getElementById('rep-field-datetime');
  const anonCheck = document.getElementById('rep-anon-checkbox');
  const submitBtn = document.getElementById('report-submit-btn');

  const subject = subjectInput?.value.trim() || '';
  const description = descInput?.value.trim() || '';
  const eventDateTime = dateInput?.value || new Date().toISOString();
  const isAnonymous = anonCheck ? anonCheck.checked : false;

  // Validation
  if (!subject) {
    showFormError('Please enter a subject for your report.', subjectInput);
    return;
  }
  if (description.length < 10) {
    showFormError('Please provide a detailed description (minimum 10 characters).', descInput);
    return;
  }

  // Ensure mandatory location is resolved
  if (!capturedLocation) {
    await ensureLocationCaptured();
  }

  // Category specific validation
  const busNumEl = document.getElementById('rep-field-bus-number');
  const routeNameEl = document.getElementById('rep-field-route-name');
  const busNumber = busNumEl?.value.trim() || '';
  const routeName = routeNameEl?.value.trim() || '';

  if (selectedCategory.requiresBus && !busNumber) {
    showFormError('Please enter the bus number.', busNumEl);
    return;
  }

  // Extra fields harvest
  const extraFields = {};
  const issueTypeEl = document.getElementById('rep-field-issue-type') || 
                      document.getElementById('rep-field-epass-issue-type') ||
                      document.getElementById('rep-field-route-issue-type') ||
                      document.getElementById('rep-field-payment-issue');
  if (issueTypeEl && issueTypeEl.value.trim()) extraFields.issueType = issueTypeEl.value.trim();

  const driverNameEl = document.getElementById('rep-field-driver-name');
  if (driverNameEl && driverNameEl.value.trim()) extraFields.driverName = driverNameEl.value.trim();

  const driverBehaviourEl = document.getElementById('rep-field-driver-behaviour');
  if (driverBehaviourEl && driverBehaviourEl.value.trim()) extraFields.driverBehaviour = driverBehaviourEl.value.trim();

  const stopNameEl = document.getElementById('rep-field-stop-name');
  if (stopNameEl && stopNameEl.value.trim()) extraFields.stopName = stopNameEl.value.trim();

  const delayDurationEl = document.getElementById('rep-field-delay-duration');
  if (delayDurationEl && delayDurationEl.value.trim()) extraFields.delayDuration = delayDurationEl.value.trim();

  const epassIdEl = document.getElementById('rep-field-epass-id');
  if (epassIdEl && epassIdEl.value.trim()) extraFields.epassId = epassIdEl.value.trim();

  const txnIdEl = document.getElementById('rep-field-txn-id');
  if (txnIdEl && txnIdEl.value.trim()) extraFields.transactionId = txnIdEl.value.trim();

  const amountEl = document.getElementById('rep-field-amount');
  if (amountEl && amountEl.value) extraFields.amount = amountEl.value;

  const itemCatEl = document.getElementById('rep-field-item-cat');
  if (itemCatEl && itemCatEl.value.trim()) extraFields.itemCategory = itemCatEl.value.trim();

  const appModuleEl = document.getElementById('rep-field-app-module');
  if (appModuleEl && appModuleEl.value.trim()) extraFields.appModule = appModuleEl.value.trim();

  // Lock UI for submission
  submitBtn.disabled = true;
  submitBtn.innerHTML = `
    <svg style="animation: spin 1s linear infinite; height: 18px; width: 18px; margin-right: 8px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" style="opacity:0.25;"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    Submitting Report…
  `;

  // Generate Unique Human-Readable Report ID (e.g. NXR-2026-004128)
  const reportNumber = generateReportId();
  const user = auth?.currentUser;
  const uid = user ? user.uid : 'guest_user';

  const reportPayload = {
    reportNumber: reportNumber,
    userId: uid,
    userName: isAnonymous ? 'Anonymous Student' : (userProfile?.name || 'NexRide Student'),
    userPhone: isAnonymous ? 'Hidden' : (userProfile?.phone || user?.phoneNumber || ''),
    userEmail: isAnonymous ? 'Hidden' : (userProfile?.email || user?.email || ''),
    category: selectedCategory.id,
    categoryName: selectedCategory.name,
    subject: subject,
    description: description,
    busNumber: busNumber,
    routeName: routeName,
    priority: selectedPriority,
    status: 'Submitted',
    isAnonymous: isAnonymous,
    eventDateTime: eventDateTime,
    location: capturedLocation,
    extraFields: extraFields,
    attachments: attachedFiles.map(a => a.dataUrl), // data URLs for immediate high-res access
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    statusHistory: [
      {
        status: 'Submitted',
        timestamp: new Date().toISOString(),
        message: 'Report received and registered in system.'
      }
    ],
    adminResponse: null
  };

  try {
    if (db) {
      const docRef = await addDoc(collection(db, 'reports'), reportPayload);
      console.log('[Report] Saved with ID:', docRef.id, reportNumber);

      // Create notification for user
      if (user) {
        await addDoc(collection(db, 'users', user.uid, 'notifications'), {
          title: 'Report Submitted',
          body: `Your report ${reportNumber} (${subject}) has been logged successfully.`,
          reportId: docRef.id,
          reportNumber: reportNumber,
          type: 'report_status',
          read: false,
          createdAt: serverTimestamp()
        });
      }
    } else {
      console.warn('[Report] Firestore not connected. Saving report locally in session.');
      myReportsCache.unshift({
        id: 'local_' + Date.now(),
        ...reportPayload,
        createdAt: new Date()
      });
    }

    isFormDirty = false;
    showSuccessScreen(reportNumber);
  } catch (err) {
    console.error('[Report] Error submitting report:', err);
    showFormError('Unable to submit your report. Please check your internet connection and try again.');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Report';
  }
}

function generateReportId() {
  const year = new Date().getFullYear();
  const randomSeq = Math.floor(100000 + Math.random() * 900000);
  return `NXR-${year}-${randomSeq}`;
}

function showSuccessScreen(reportNumber) {
  const formWrap = document.getElementById('report-form-wrap');
  const footerBar = document.getElementById('report-footer-bar');
  const successView = document.getElementById('report-success-view');
  const idValEl = document.getElementById('rep-success-id-val');

  if (formWrap) formWrap.style.display = 'none';
  if (footerBar) footerBar.style.display = 'none';
  if (idValEl) idValEl.textContent = reportNumber;
  if (successView) successView.style.display = 'flex';
}

function resetReportForm() {
  const formWrap = document.getElementById('report-form-wrap');
  const footerBar = document.getElementById('report-footer-bar');
  const successView = document.getElementById('report-success-view');

  if (formWrap) formWrap.style.display = 'flex';
  if (footerBar) footerBar.style.display = 'block';
  if (successView) successView.style.display = 'none';

  const subjectInput = document.getElementById('rep-field-subject');
  const descInput = document.getElementById('rep-field-description');
  const anonCheck = document.getElementById('rep-anon-checkbox');
  const submitBtn = document.getElementById('report-submit-btn');

  if (subjectInput) subjectInput.value = '';
  if (descInput) descInput.value = '';
  if (anonCheck) anonCheck.checked = false;

  const subjectCounter = document.getElementById('rep-subject-counter');
  const descCounter = document.getElementById('rep-desc-counter');
  if (subjectCounter) subjectCounter.textContent = '0 / 100';
  if (descCounter) descCounter.textContent = '0 / 1000';

  attachedFiles = [];
  renderAttachmentsThumbnails();

  capturedLocation = null;
  const locBtn = document.getElementById('rep-location-btn');
  const locTitle = document.getElementById('rep-location-title');
  const locDesc = document.getElementById('rep-location-desc');
  if (locBtn) {
    locBtn.className = 'report-location-btn';
    locBtn.textContent = 'Use My Location';
  }
  if (locTitle) locTitle.textContent = 'Attach Live Location';
  if (locDesc) locDesc.textContent = 'Help administrators identify exact location';

  setPriority('Normal');
  hideFormError();
  isFormDirty = false;

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Report';
  }
}

function showFormError(msg, focusEl) {
  const errorBox = document.getElementById('report-inline-error');
  if (errorBox) {
    errorBox.textContent = msg;
    errorBox.style.display = 'block';
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  if (focusEl && typeof focusEl.focus === 'function') {
    focusEl.focus();
  }
}

function hideFormError() {
  const errorBox = document.getElementById('report-inline-error');
  if (errorBox) errorBox.style.display = 'none';
}

// =============================================================================
// MY REPORTS VIEW & FILTERS
// =============================================================================
function setupFilterPills() {
  const pills = document.querySelectorAll('.report-filter-pill');
  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeFilter = pill.getAttribute('data-status');
      renderMyReportsList();
    });
  });
}

function renderMyReportsList() {
  const container = document.getElementById('my-reports-list-container');
  const emptyState = document.getElementById('my-reports-empty-state');
  if (!container) return;

  container.innerHTML = '';

  let filtered = myReportsCache;
  if (activeFilter && activeFilter !== 'All') {
    filtered = myReportsCache.filter(r => r.status && r.status.toLowerCase() === activeFilter.toLowerCase());
  }

  if (filtered.length === 0) {
    if (emptyState) emptyState.style.display = 'flex';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  filtered.forEach(report => {
    const card = document.createElement('div');
    card.className = 'my-report-card';
    
    // Status Badge Class
    const statusClass = getStatusClass(report.status);
    const prioClass = getPriorityClass(report.priority);
    const dateStr = formatDate(report.createdAt);

    card.innerHTML = `
      <div class="my-report-card-top">
        <span class="my-report-id-text">${report.reportNumber || 'NXR-REPORT'}</span>
        <span class="report-status-badge ${statusClass}">
          ${report.status || 'Submitted'}
        </span>
      </div>
      <div class="my-report-card-title">${escapeHtml(report.subject)}</div>
      <div class="my-report-card-desc">${escapeHtml(report.description)}</div>
      <div class="my-report-card-bottom">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="report-prio-tag ${prioClass}">${report.priority || 'NORMAL'}</span>
          ${report.busNumber ? `<span style="font-size:11.5px; color:#4B5563; font-weight:600;">Bus ${report.busNumber}</span>` : ''}
        </div>
        <span class="my-report-date-text">${dateStr}</span>
      </div>
    `;

    card.addEventListener('click', () => {
      openReportDetails(report);
    });

    container.appendChild(card);
  });
}

// =============================================================================
// REPORT DETAILS & TIMELINE
// =============================================================================
export function openReportDetails(report) {
  const page = document.getElementById('report-details-page');
  if (!page) return;

  const idEl = document.getElementById('rep-detail-id');
  const catEl = document.getElementById('rep-detail-cat');
  const statusBadge = document.getElementById('rep-detail-status-badge');
  const prioBadge = document.getElementById('rep-detail-prio-badge');
  const subjectEl = document.getElementById('rep-detail-subject');
  const descEl = document.getElementById('rep-detail-desc');
  const busRouteEl = document.getElementById('rep-detail-bus-route');
  const dateEl = document.getElementById('rep-detail-date');
  const locationEl = document.getElementById('rep-detail-location');
  const extraFieldsEl = document.getElementById('rep-detail-extra-fields');
  const attachEl = document.getElementById('rep-detail-attachments-wrap');
  const adminMsgWrap = document.getElementById('rep-detail-admin-msg-wrap');
  const adminMsgText = document.getElementById('rep-detail-admin-msg-text');
  const timelineEl = document.getElementById('rep-detail-timeline-container');

  if (idEl) idEl.textContent = report.reportNumber || 'NXR-REPORT';
  if (catEl) catEl.textContent = report.categoryName || 'General Issue';
  
  if (statusBadge) {
    statusBadge.className = `report-status-badge ${getStatusClass(report.status)}`;
    statusBadge.textContent = report.status || 'Submitted';
  }

  if (prioBadge) {
    prioBadge.className = `report-prio-tag ${getPriorityClass(report.priority)}`;
    prioBadge.textContent = report.priority || 'NORMAL';
  }

  if (subjectEl) subjectEl.textContent = report.subject;
  if (descEl) descEl.textContent = report.description;

  if (busRouteEl) {
    if (report.busNumber || report.routeName) {
      busRouteEl.textContent = `Bus ${report.busNumber || 'N/A'} • ${report.routeName || 'Assigned Route'}`;
      busRouteEl.parentElement.style.display = 'flex';
    } else {
      busRouteEl.parentElement.style.display = 'none';
    }
  }

  if (dateEl) dateEl.textContent = formatDate(report.createdAt);

  if (locationEl) {
    if (report.location) {
      locationEl.textContent = `${report.location.latitude.toFixed(4)}°, ${report.location.longitude.toFixed(4)}° (±${report.location.accuracy || 10}m)`;
      locationEl.parentElement.style.display = 'flex';
    } else {
      locationEl.parentElement.style.display = 'none';
    }
  }

  // Extra fields (e.g. Issue type, Txn ID)
  if (extraFieldsEl) {
    extraFieldsEl.innerHTML = '';
    if (report.extraFields && Object.keys(report.extraFields).length > 0) {
      Object.entries(report.extraFields).forEach(([k, v]) => {
        if (!v) return;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; justify-content:space-between; font-size:13px; padding:6px 0; border-bottom:1px solid #F8FAFC;';
        row.innerHTML = `<span style="color:#6B7280; text-transform:capitalize;">${k.replace(/([A-Z])/g, ' $1')}:</span><span style="font-weight:600; color:#111827;">${v}</span>`;
        extraFieldsEl.appendChild(row);
      });
      extraFieldsEl.parentElement.style.display = 'flex';
    } else {
      extraFieldsEl.parentElement.style.display = 'none';
    }
  }

  // Attachments
  if (attachEl) {
    attachEl.innerHTML = '';
    if (report.attachments && report.attachments.length > 0) {
      report.attachments.forEach((src, idx) => {
        const thumb = document.createElement('div');
        thumb.className = 'report-thumb-item';
        thumb.style.cursor = 'pointer';
        thumb.innerHTML = `<img src="${src}" alt="Attachment ${idx+1}" class="report-thumb-img" />`;
        thumb.addEventListener('click', () => openLightbox(src));
        attachEl.appendChild(thumb);
      });
      attachEl.parentElement.style.display = 'flex';
    } else {
      attachEl.parentElement.style.display = 'none';
    }
  }

  // Admin message / response
  if (adminMsgWrap && adminMsgText) {
    if (report.adminResponse) {
      adminMsgText.textContent = report.adminResponse;
      adminMsgWrap.style.display = 'flex';
    } else {
      adminMsgWrap.style.display = 'none';
    }
  }

  // Timeline
  if (timelineEl) {
    renderStatusTimeline(timelineEl, report);
  }

  page.classList.remove('hidden');
}

function renderStatusTimeline(container, report) {
  const steps = [
    { key: 'Submitted', label: 'Report Submitted', defaultMsg: 'Report received and registered in system.' },
    { key: 'Under Review', label: 'Under Review', defaultMsg: 'Assigned to transport administration for investigation.' },
    { key: 'In Progress', label: 'In Progress', defaultMsg: 'Corrective actions or bus maintenance underway.' },
    { key: 'Resolved', label: 'Resolved', defaultMsg: 'Issue verified and successfully addressed.' }
  ];

  const currentStatus = report.status || 'Submitted';
  const isRejected = currentStatus === 'Rejected';
  const isClosed = currentStatus === 'Closed';

  let currentIdx = steps.findIndex(s => s.key.toLowerCase() === currentStatus.toLowerCase());
  if (currentIdx === -1) currentIdx = 0;

  let html = '<div class="report-timeline">';

  steps.forEach((s, idx) => {
    const isCompleted = idx < currentIdx || (idx === currentIdx && currentStatus === 'Resolved');
    const isActive = idx === currentIdx && currentStatus !== 'Resolved';
    
    // Find matching history item
    const historyItem = report.statusHistory?.find(h => h.status.toLowerCase() === s.key.toLowerCase());
    const dateStr = historyItem ? formatDate(historyItem.timestamp) : '';
    const msg = historyItem?.message || (idx <= currentIdx ? s.defaultMsg : '');

    html += `
      <div class="timeline-step ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}">
        <div class="timeline-line"></div>
        <div class="timeline-node">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="timeline-content">
          <div class="timeline-title">${s.label}</div>
          ${dateStr ? `<div class="timeline-date">${dateStr}</div>` : ''}
          ${(idx <= currentIdx && msg) ? `<div class="timeline-message">${escapeHtml(msg)}</div>` : ''}
        </div>
      </div>
    `;
  });

  // If rejected or closed specifically
  if (isRejected || isClosed) {
    const termTitle = isRejected ? 'Report Rejected' : 'Report Closed';
    const termItem = report.statusHistory?.find(h => h.status === currentStatus);
    const termDate = termItem ? formatDate(termItem.timestamp) : '';
    const termMsg = termItem?.message || (isRejected ? (report.rejectionReason || 'Report could not be processed.') : 'Case finalized.');

    html += `
      <div class="timeline-step active">
        <div class="timeline-node" style="background:${isRejected ? '#EF4444' : '#64748B'}; border-color:${isRejected ? '#EF4444' : '#64748B'}; color:white;">!</div>
        <div class="timeline-content">
          <div class="timeline-title" style="color:${isRejected ? '#B91C1C' : '#334155'};">${termTitle}</div>
          ${termDate ? `<div class="timeline-date">${termDate}</div>` : ''}
          <div class="timeline-message" style="background:#FEF2F2; border-color:#FEE2E2; color:#991B1B;">${escapeHtml(termMsg)}</div>
        </div>
      </div>
    `;
  }

  html += '</div>';
  container.innerHTML = html;
}

// =============================================================================
// NOTIFICATIONS SYSTEM INTEGRATION
// =============================================================================
function updateNotificationsUI() {
  // 1. Home screen badge
  const notifCard = document.getElementById('btn-notifications');
  if (notifCard) {
    let badge = notifCard.querySelector('.notif-badge-pill');
    const unreadCount = userNotifications.filter(n => !n.read).length;

    if (unreadCount > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'notif-badge-pill';
        notifCard.appendChild(badge);
      }
      badge.textContent = unreadCount;
      badge.style.display = 'inline-flex';
    } else if (badge) {
      badge.style.display = 'none';
    }
  }

  // 2. Notifications Page List
  const notifPage = document.getElementById('notifications-page');
  if (!notifPage) return;

  const notifScrollBody = notifPage.querySelector('.notifications-scroll-list') || notifPage.children[1];
  if (!notifScrollBody) return;

  if (userNotifications.length === 0) {
    notifScrollBody.innerHTML = `
      <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; text-align: center;">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 16px;">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
        <div style="font-size: 18px; font-weight: 700; color: #111827; margin-bottom: 8px;">No new notifications</div>
        <div style="font-size: 14px; color: #6B7280;">You're all caught up! Check back later for updates.</div>
      </div>
    `;
    return;
  }

  let listHtml = '<div style="padding: 16px 20px; display: flex; flex-direction: column; gap: 12px;">';
  userNotifications.forEach(n => {
    const dateStr = formatDate(n.createdAt);
    listHtml += `
      <div class="user-notif-item" data-report-id="${n.reportId || ''}" style="background:#FFFFFF; border-radius:14px; padding:14px 16px; border:1px solid #F3F4F6; box-shadow:0 2px 6px rgba(0,0,0,0.03); display:flex; gap:12px; align-items:flex-start; cursor:pointer;">
        <div style="width:36px; height:36px; border-radius:10px; background:#EFF6FF; color:#2563EB; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
        </div>
        <div style="flex:1;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:14px; font-weight:700; color:#111827;">${escapeHtml(n.title)}</span>
            <span style="font-size:11px; color:#9CA3AF;">${dateStr}</span>
          </div>
          <p style="font-size:12.5px; color:#4B5563; margin:4px 0 0 0; line-height:1.4;">${escapeHtml(n.body)}</p>
        </div>
      </div>
    `;
  });
  listHtml += '</div>';

  notifScrollBody.innerHTML = listHtml;

  // Attach click to open report details
  notifScrollBody.querySelectorAll('.user-notif-item').forEach(item => {
    item.addEventListener('click', async () => {
      const repId = item.getAttribute('data-report-id');
      if (repId && db) {
        try {
          const docSnap = await getDoc(doc(db, 'reports', repId));
          if (docSnap.exists()) {
            openReportDetails({ id: docSnap.id, ...docSnap.data() });
          }
        } catch (e) {
          console.warn('Could not load report for notification:', e);
        }
      }
    });
  });
}

// =============================================================================
// UTILITIES
// =============================================================================
function getStatusClass(status) {
  switch ((status || '').toLowerCase()) {
    case 'submitted': return 'status-submitted';
    case 'under review': return 'status-under-review';
    case 'in progress': return 'status-in-progress';
    case 'resolved': return 'status-resolved';
    case 'rejected': return 'status-rejected';
    case 'closed': return 'status-closed';
    default: return 'status-submitted';
  }
}

function getPriorityClass(prio) {
  switch ((prio || '').toLowerCase()) {
    case 'urgent': return 'prio-urgent';
    case 'high': return 'prio-high';
    default: return 'prio-normal';
  }
}

function formatDate(val) {
  if (!val) return 'Just now';
  let dateObj = null;
  if (val.toDate) dateObj = val.toDate();
  else if (typeof val === 'string' || typeof val === 'number') dateObj = new Date(val);
  else if (val instanceof Date) dateObj = val;

  if (!dateObj || isNaN(dateObj.getTime())) return 'Recently';

  return dateObj.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
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
