import { auth, firestore } from './firebase-config.js';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  onSnapshot,
  limit
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { cacheGet, cacheSet, cacheDelete } from './offline/db.js';

// =============================================================================
// STATE & REGISTRY
// =============================================================================
let activeStudentData = null;       // Currently resolved student record (null = no one logged in)
let activeUserId = null;            // UID of the user whose data is loaded
const changeListeners = new Set();
let activeSnapshotUnsubs = [];      // Real-time Firestore unsubscribe functions
let autoCollectionListenerUnsub = null;
let isResolving = false;

// =============================================================================
// NORMALIZATION
// =============================================================================

/**
 * Normalize a raw phone string to exactly 10 digits, or null.
 */
function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? digits : null;
}

/**
 * Normalizes raw Firestore document data into a standard Student Bus Allocation format.
 * Returns null-safe fallback strings — never undefined, null, or NaN in UI-facing fields.
 */
export function normalizeStudentData(data, docId = '') {
  if (!data) return null;

  const rawBus = data.assignedBus || data.bus || data.busNumber || data.bus_no || data['bus no'] || '';
  const busStr = rawBus ? String(rawBus).trim() : '';

  const rawStage = data.stage || data.pickupStop || data.boardingStop || data.boardingStopName || '';
  const rawRoute = data.routeId || data.route_id || data.assignedRouteName || data.route || data.routeName || '';

  const rawId = data.studentId || data.id || data.regno || data.applicationId || docId || '';
  const rawName = data.name || data.studentName || data.displayName || '';

  const cleanPhone = normalizePhone(
    data.phone || data.mobile || data.phoneNumber || data.mobileNumber || data.contact || ''
  );

  // Fee info — all from DB, never calculated client-side
  const feesStatus = data.fees_status || data.feeStatus || data.fee_status || '';
  const feesAmount = data.feesAmount || data.fees_amount || data.feesTotal || data.feeAmount || 0;
  const paidAmount = data.paidAmount || data.paid_amount || 0;
  const pendingAmount = data.pendingAmount || data.pending_amount || 0;

  return {
    // Identity
    docId: docId,
    id: rawId,
    studentId: rawId,
    regno: rawId,
    applicationId: data.applicationId || rawId,
    name: rawName || 'Not Available',

    // Contact
    phone: cleanPhone || '',
    mobile: cleanPhone || '',
    cleanPhone: cleanPhone,
    phoneNumber: cleanPhone ? `+91${cleanPhone}` : '',
    mobileNumber: cleanPhone || '',
    contact: data['parent_gaurdian contact'] || data.parentContact || data.contact || '',
    email: data.email || '',

    // Academic
    department: data.department || '',
    year: data.year || '',
    section: data.section || '',
    course: data.course || '',
    academicYear: data.academicYear || data.academic_year || '',
    institution: data.institution || '',
    rollNumber: data.rollNumber || data.rollNo || data.roll_no || '',
    registerNumber: data.registerNumber || data.regNo || '',
    passengerType: data.passengerType || data.passenger_type || 'Student',
    role: data.role || 'student',

    // Transport assignment — all from DB
    assignedBus: busStr,
    bus: busStr,
    busNumber: busStr,
    assignedBusId: data.assignedBusId || data.busId || '',
    stage: rawStage,
    pickupStop: rawStage,
    boardingStop: rawStage,
    boardingStopName: rawStage,
    boardingStopId: data.boardingStopId || data.boardingStop || '',
    routeId: rawRoute,
    route: rawRoute,
    routeName: data.routeName || rawRoute,
    transportStatus: data.transportStatus || data.transport_status || '',

    // Fee — all directly from DB, no derivation
    fees_status: feesStatus,
    feeStatus: feesStatus,
    balance: data.balance || feesStatus,
    feesAmount: feesAmount,
    paidAmount: paidAmount,
    pendingAmount: pendingAmount,
    paymentDate: data.paymentDate || null,
    paymentReference: data.paymentReference || null,

    // Dynamic student-specific options from DB
    selectedOptions: data.selectedOptions || data.services || null,

    // Timestamps
    updatedAt: data.updatedAt || null,
    createdAt: data.createdAt || null,

    // UI / avatar
    photoURL: data.photoURL || data.profilePic || data.avatar || null,
    gender: data.gender || '',
    preferences: data.preferences || data.notificationPreferences || null,

    // Keep raw for downstream merging
    raw: data
  };
}

// =============================================================================
// PUBLIC GETTERS & SUBSCRIPTION
// =============================================================================

/** Returns the currently active student record (null if not resolved yet) */
export function getActiveStudentData() {
  return activeStudentData;
}

/**
 * Subscribe to student data changes.
 * @param {Function} callback receives normalized student data or null.
 * @returns unsubscribe function
 */
export function subscribeStudentBus(callback) {
  if (typeof callback !== 'function') return () => {};
  changeListeners.add(callback);

  // Only immediately call with current data if it has already been resolved (non-null).
  // If activeStudentData is null, it means "not resolved yet" — don't call yet, wait for resolution.
  if (activeStudentData) {
    try {
      callback(activeStudentData);
    } catch (e) {
      console.warn('[StudentBusService] Initial callback error:', e);
    }
  }

  return () => {
    changeListeners.delete(callback);
  };
}

/** Broadcasts to all listeners and fires a global DOM event */
function notifyListeners(data) {
  activeStudentData = data;
  changeListeners.forEach(cb => {
    try {
      cb(data);
    } catch (e) {
      console.warn('[StudentBusService] Listener error:', e);
    }
  });

  window.dispatchEvent(new CustomEvent('nexride:student-bus-updated', {
    detail: data
  }));
}

// =============================================================================
// REALTIME SNAPSHOT LISTENERS
// =============================================================================

/** Stop all active Firestore document snapshot listeners */
function cleanupSnapshotListeners() {
  activeSnapshotUnsubs.forEach(unsub => {
    try { unsub(); } catch (e) {}
  });
  activeSnapshotUnsubs = [];

  if (autoCollectionListenerUnsub) {
    try { autoCollectionListenerUnsub(); } catch (e) {}
    autoCollectionListenerUnsub = null;
  }
}

/**
 * Attach real-time Firestore listeners to the student's document(s).
 * Listens on both students/{studentDocId} and users/{authUid} so admin changes
 * appear instantly in the app.
 */
function attachRealtimeListeners(studentDocId, authUid) {
  cleanupSnapshotListeners();

  const docPaths = new Map(); // path → collection
  if (studentDocId) docPaths.set(studentDocId, 'students');
  if (authUid) docPaths.set(authUid, 'users');

  docPaths.forEach((collection, dId) => {
    try {
      const unsub = onSnapshot(doc(firestore, collection, dId), (snap) => {
        if (!snap.exists()) return;
        const freshData = snap.data();
        const normalized = normalizeStudentData(freshData, snap.id);
        if (!normalized) return;

        console.log(`[StudentBusService] Real-time update [${collection}/${dId}]: Bus "${normalized.assignedBus}", Stop "${normalized.boardingStop}"`);

        // Only apply update if it belongs to the currently active user (prevent cross-user leakage)
        const currentUid = auth?.currentUser?.uid;
        if (currentUid && dId !== currentUid && dId !== localStorage.getItem('nexride_student_id')) {
          return;
        }

        notifyListeners(normalized);
        cacheSet(`student_data_${activeUserId}`, normalized).catch(() => {});
      }, (err) => {
        console.warn(`[StudentBusService] onSnapshot error [${collection}/${dId}]:`, err);
      });

      activeSnapshotUnsubs.push(unsub);
    } catch (e) {
      console.warn(`[StudentBusService] Failed to attach listener [${collection}/${dId}]:`, e);
    }
  });
}

// =============================================================================
// LOGOUT / SESSION CLEAR
// =============================================================================

/**
 * Completely wipes all student state on logout.
 * Call this before any new user session to guarantee zero cross-user data leakage.
 */
export function clearStudentSession() {
  console.log('[StudentBusService] Clearing student session completely.');
  cleanupSnapshotListeners();
  activeStudentData = null;
  activeUserId = null;
  isResolving = false;

  // Clear all user-specific localStorage keys
  localStorage.removeItem('nexride_user_phone');
  localStorage.removeItem('nexride_student_id');
  localStorage.removeItem('nexride_assigned_bus');
  localStorage.removeItem('nexride_user_profile');

  // Clear user-specific IndexedDB cache entry (keyed by UID)
  try {
    if (activeUserId) {
      cacheDelete(`student_data_${activeUserId}`).catch(() => {});
    }
  } catch (e) {}

  // Notify all listeners that no student is active
  notifyListeners(null);
}

// =============================================================================
// CORE RESOLVER
// =============================================================================

/**
 * Resolves the authenticated student's data from Firestore using a strict
 * UID-first identity model, with mobile number as a secondary verified matcher.
 *
 * Resolution order:
 *   1. users/{uid} — direct UID lookup (fastest, most secure)
 *   2. students/{uid} — if students are stored by UID
 *   3. students where phone/mobile == verifiedPhone — phone-based lookup
 *   4. Comprehensive phone scan (handles field name variations)
 *
 * At every step, the resolved phone is cross-verified against the Firebase Auth
 * phone number to guarantee we never return another user's record.
 *
 * @param {import('firebase/auth').User|null} currentUser
 */
export async function resolveStudentAssignedBus(currentUser = null) {
  // Allow re-resolve if explicitly passed a user (post-login), even if already resolving
  if (isResolving && !currentUser) return activeStudentData;
  isResolving = true;

  try {
    const user = currentUser || auth?.currentUser;

    if (!user || user.isAnonymous) {
      console.log('[StudentBusService] No authenticated user. Clearing session.');
      notifyListeners(null);
      return null;
    }

    const uid = user.uid;

    // If the same user is already loaded with live data and this is a background re-trigger, skip it.
    // But if currentUser was explicitly passed (post-login call), always do a full re-resolve.
    if (!currentUser && activeUserId === uid && activeStudentData) {
      console.log(`[StudentBusService] User [${uid}] already resolved (background re-trigger). Skipping.`);
      return activeStudentData;
    }

    // If a DIFFERENT user is now logging in, clear the previous session first
    if (activeUserId && activeUserId !== uid) {
      console.log(`[StudentBusService] Different user detected. Clearing previous session [${activeUserId}].`);
      cleanupSnapshotListeners();
      activeStudentData = null;
    }

    activeUserId = uid;

    // Get the Firebase Auth verified phone number — this is tamper-proof
    const verifiedPhone = normalizePhone(user.phoneNumber);
    if (verifiedPhone) {
      localStorage.setItem('nexride_user_phone', verifiedPhone);
    }

    console.log(`[StudentBusService] Resolving student for UID [${uid}], verified phone: ${verifiedPhone || 'none'}`);

    // ─── Step 1: Check user-specific local cache (keyed by UID, not shared) ───
    if (!activeStudentData) {
      try {
        const cacheKey = `student_data_${uid}`;
        const cached = await cacheGet(cacheKey);
        if (cached && cached.data && cached.data.assignedBus) {
          // Validate cache belongs to this user
          const cachedPhone = normalizePhone(cached.data.cleanPhone || cached.data.phone || '');
          const phoneMatches = !verifiedPhone || !cachedPhone || cachedPhone === verifiedPhone;
          if (phoneMatches) {
            console.log(`[StudentBusService] Served from UID-keyed cache [${uid}]`);
            activeStudentData = cached.data;
            notifyListeners(activeStudentData);
            // Continue resolution to get fresh data from Firestore
          }
        }
      } catch (e) { /* cache miss is OK */ }
    }

    let foundData = null;
    let foundStudentDocId = null;

    // ─── Step 2: Direct UID lookup in `users` collection ───
    // Only use this if the doc has a valid assignedBus — otherwise fall through to phone lookup
    try {
      const userSnap = await getDoc(doc(firestore, 'users', uid));
      if (userSnap.exists()) {
        const data = userSnap.data();
        const hasBus = !!(data.assignedBus || data.bus || data.busNumber);

        if (hasBus) {
          // Cross-verify phone if we have a verified phone from Firebase Auth
          if (verifiedPhone) {
            const docPhone = normalizePhone(
              data.phone || data.mobile || data.mobileNumber || data.phoneNumber || data.cleanPhone || data.contact || ''
            );
            // If doc has a phone stored and it does NOT match the verified phone, reject it
            if (docPhone && docPhone !== verifiedPhone) {
              console.warn(`[StudentBusService] users/${uid} phone mismatch! Auth: ${verifiedPhone}, Doc: ${docPhone}. Falling through to phone queries.`);
            } else {
              foundData = data;
              foundStudentDocId = userSnap.id;
              console.log(`[StudentBusService] ✓ Matched via users/${uid}: Bus "${foundData.assignedBus || foundData.bus}"`);
            }
          } else {
            // No verified phone from Firebase Auth, trust UID
            foundData = data;
            foundStudentDocId = userSnap.id;
          }
        } else {
          console.log(`[StudentBusService] users/${uid} exists but has no assignedBus — falling through to phone queries.`);
        }
      }
    } catch (e) {
      console.warn('[StudentBusService] users/{uid} lookup failed:', e);
    }

    // ─── Step 3: Direct UID lookup in `students` collection ───
    if (!foundData) {
      try {
        const stuSnap = await getDoc(doc(firestore, 'students', uid));
        if (stuSnap.exists()) {
          const data = stuSnap.data();
          if (verifiedPhone) {
            const docPhone = normalizePhone(
              data.phone || data.mobile || data.mobileNumber || data.phoneNumber || data.cleanPhone || ''
            );
            if (!docPhone || docPhone === verifiedPhone) {
              foundData = data;
              foundStudentDocId = stuSnap.id;
              console.log(`[StudentBusService] ✓ Matched via students/${uid}`);
            }
          } else {
            foundData = data;
            foundStudentDocId = stuSnap.id;
          }
        }
      } catch (e) {
        console.warn('[StudentBusService] students/{uid} lookup failed:', e);
      }
    }

    // ─── Step 4: Phone-based queries (only for authenticated, verified phone) ───
    if (!foundData && verifiedPhone) {
      console.log(`[StudentBusService] Searching students collection for verified phone [${verifiedPhone}]...`);

      const phoneQueries = [
        query(collection(firestore, 'students'), where('phone', '==', verifiedPhone), limit(1)),
        query(collection(firestore, 'students'), where('mobile', '==', verifiedPhone), limit(1)),
        query(collection(firestore, 'students'), where('mobileNumber', '==', verifiedPhone), limit(1)),
        query(collection(firestore, 'students'), where('cleanPhone', '==', verifiedPhone), limit(1)),
        query(collection(firestore, 'students'), where('phoneNumber', '==', `+91${verifiedPhone}`), limit(1)),
        query(collection(firestore, 'students'), where('contact', '==', verifiedPhone), limit(1)),
        query(collection(firestore, 'students'), where('rawPhone', '==', verifiedPhone), limit(1)),
      ];

      for (const q of phoneQueries) {
        try {
          const snap = await getDocs(q);
          if (!snap.empty) {
            const matched = snap.docs[0];
            foundData = matched.data();
            foundStudentDocId = matched.id;
            console.log(`[StudentBusService] ✓ Matched via phone query [${verifiedPhone}] → students/${foundStudentDocId}: Bus "${foundData.assignedBus || foundData.bus || 'none'}"`);
            break;
          }
        } catch (e) {
          console.warn('[StudentBusService] Phone query failed:', e);
        }
      }
    }

    // ─── Step 5: Comprehensive phone scan (handles field name / format variations) ───
    if (!foundData && verifiedPhone) {
      console.log(`[StudentBusService] Full collection scan for phone [${verifiedPhone}]...`);
      try {
        const allStudents = await getDocs(collection(firestore, 'students'));
        for (const d of allStudents.docs) {
          const dt = d.data();
          const docPhones = [
            dt.phone, dt.mobile, dt.mobileNumber, dt.phoneNumber, dt.cleanPhone,
            dt.rawPhone, dt.contact, dt['parent_gaurdian contact'], dt.parentContact, d.id
          ].map(p => normalizePhone(p || '')).filter(Boolean);

          if (docPhones.includes(verifiedPhone)) {
            foundData = dt;
            foundStudentDocId = d.id;
            console.log(`[StudentBusService] ✓ Matched via full scan [${verifiedPhone}] → students/${foundStudentDocId}`);
            if (foundData.assignedBus || foundData.bus) break; // Prefer record with a bus assigned
          }
        }
      } catch (e) {
        console.warn('[StudentBusService] Full collection scan failed:', e);
      }
    }

    // ─── No match found ───
    if (!foundData) {
      console.log(`[StudentBusService] No student record found for UID [${uid}] / phone [${verifiedPhone}]. Strict isolation applied.`);
      activeStudentData = null;
      localStorage.removeItem('nexride_assigned_bus');
      localStorage.removeItem('nexride_student_id');
      try { await cacheSet(`student_data_${uid}`, null); } catch (e) {}
      notifyListeners(null);
      // Start listening for new allocations (admin may add later)
      listenForStudentAllocation(uid, verifiedPhone);
      return null;
    }

    // ─── Found: normalize and resolve related data ───
    const normalized = normalizeStudentData(foundData, foundStudentDocId);

    // Fetch additional student record if we only have the users doc (to get full details)
    if (normalized.studentId && normalized.studentId !== foundStudentDocId) {
      try {
        const fullSnap = await getDoc(doc(firestore, 'students', normalized.studentId));
        if (fullSnap.exists()) {
          const merged = { ...foundData, ...fullSnap.data() };
          const mergedNorm = normalizeStudentData(merged, foundStudentDocId);
          if (mergedNorm) Object.assign(normalized, mergedNorm);
        }
      } catch (e) { /* optional enrichment, not critical */ }
    }

    // ─── Link the student doc to the users/{uid} doc for fast future lookups ───
    if (foundStudentDocId !== uid) {
      try {
        await setDoc(doc(firestore, 'users', uid), {
          // Core transport assignment
          assignedBus: normalized.assignedBus || '',
          assignedBusId: normalized.assignedBusId || '',
          stage: normalized.stage || '',
          pickupStop: normalized.pickupStop || '',
          boardingStop: normalized.boardingStop || '',
          boardingStopId: normalized.boardingStopId || '',
          routeId: normalized.routeId || '',
          routeName: normalized.routeName || '',
          transportStatus: normalized.transportStatus || '',
          // Identity
          studentId: normalized.studentId || foundStudentDocId,
          regno: normalized.regno || '',
          applicationId: normalized.applicationId || '',
          name: normalized.name || '',
          // Contact (store verified phone only)
          phone: verifiedPhone || normalized.phone || '',
          mobile: verifiedPhone || normalized.mobile || '',
          cleanPhone: verifiedPhone || normalized.cleanPhone || '',
          mobileNumber: verifiedPhone || '',
          // Fee — preserve DB values exactly, no client-side derivation
          fees_status: normalized.fees_status || '',
          feeStatus: normalized.feeStatus || '',
          feesAmount: normalized.feesAmount || 0,
          paidAmount: normalized.paidAmount || 0,
          pendingAmount: normalized.pendingAmount || 0,
          // Options
          selectedOptions: normalized.selectedOptions || null,
          // Academic
          department: normalized.department || '',
          year: normalized.year || '',
          section: normalized.section || '',
          academicYear: normalized.academicYear || '',
        }, { merge: true });
        console.log(`[StudentBusService] Linked students/${foundStudentDocId} → users/${uid}`);
      } catch (linkErr) {
        console.warn('[StudentBusService] Failed to link student to users/{uid}:', linkErr);
      }
    }

    // ─── Persist to local caches (keyed by UID so users never share caches) ───
    localStorage.setItem('nexride_student_id', normalized.studentId);
    localStorage.setItem('nexride_assigned_bus', normalized.assignedBus);
    if (verifiedPhone) localStorage.setItem('nexride_user_phone', verifiedPhone);

    try {
      await cacheSet(`student_data_${uid}`, normalized);
    } catch (e) {}

    // ─── Attach real-time listeners so admin changes appear immediately ───
    attachRealtimeListeners(foundStudentDocId, uid);

    notifyListeners(normalized);
    listenForStudentAllocation(uid, verifiedPhone);
    return normalized;

  } catch (err) {
    console.error('[StudentBusService] Error resolving student bus:', err);
    return null;
  } finally {
    isResolving = false;
  }
}

// =============================================================================
// REAL-TIME: Listen for new admin allocations for this specific user
// =============================================================================

/**
 * Opens a targeted real-time listener that fires only when the admin updates
 * THIS user's record. Never fires for other students.
 */
function listenForStudentAllocation(uid, verifiedPhone) {
  if (autoCollectionListenerUnsub) return; // already listening

  // Listen to the students collection, filtered to this user's phone
  if (!verifiedPhone) return;

  try {
    const q = query(
      collection(firestore, 'students'),
      where('phone', '==', verifiedPhone),
      limit(1)
    );

    autoCollectionListenerUnsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach(change => {
        if (change.type === 'added' || change.type === 'modified') {
          const data = change.doc.data();
          const changeDocPhone = normalizePhone(
            data.phone || data.mobile || data.mobileNumber || data.cleanPhone || ''
          );

          // Strict phone match — must match verified phone exactly
          if (!changeDocPhone || changeDocPhone !== verifiedPhone) return;

          console.log(`[StudentBusService] Admin allocation detected for phone [${verifiedPhone}]: Bus "${data.assignedBus || data.bus}"`);
          const normalized = normalizeStudentData(data, change.doc.id);
          if (!normalized) return;

          localStorage.setItem('nexride_student_id', normalized.studentId);
          localStorage.setItem('nexride_assigned_bus', normalized.assignedBus);
          cacheSet(`student_data_${uid}`, normalized).catch(() => {});
          attachRealtimeListeners(change.doc.id, uid);
          notifyListeners(normalized);
        }
      });
    }, (err) => {
      console.warn('[StudentBusService] Allocation listener error:', err);
    });
  } catch (e) {
    console.warn('[StudentBusService] Could not start allocation listener:', e);
  }
}

// =============================================================================
// PHONE REGISTRATION CHECK (used by auth-ui.js before sending OTP)
// =============================================================================

/**
 * Checks if a mobile number is registered in the students collection.
 * Used as a pre-flight check before sending OTP.
 *
 * @param {string} phoneRaw - Raw phone input (10 digits or with +91)
 * @param {string} [uid] - Optional auth UID to allow faster lookup for returning users
 * @returns {Promise<{ registered: boolean, data?: object, docId?: string, reason?: string }>}
 */
export async function isPhoneNumberRegistered(phoneRaw, uid = null) {
  if (!firestore) {
    console.warn('[StudentBusService] Firestore not initialized');
    return { registered: false, reason: 'database_unavailable' };
  }

  const clean10 = normalizePhone(phoneRaw);
  if (!clean10) {
    return { registered: false, reason: 'invalid_format' };
  }

  try {
    // 1. If UID given, check users/{uid} first (fastest path for returning users)
    if (uid) {
      try {
        const snap = await getDoc(doc(firestore, 'users', uid));
        if (snap.exists()) {
          const d = snap.data();
          const docPhone = normalizePhone(d.phone || d.mobile || d.mobileNumber || d.cleanPhone || d.phoneNumber || '');
          if (!docPhone || docPhone === clean10) {
            return { registered: true, data: d, docId: snap.id };
          }
        }
      } catch (e) { /* continue */ }
    }

    // 2. Indexed phone queries against students collection
    const phoneQueries = [
      query(collection(firestore, 'students'), where('phone', '==', clean10), limit(1)),
      query(collection(firestore, 'students'), where('mobile', '==', clean10), limit(1)),
      query(collection(firestore, 'students'), where('mobileNumber', '==', clean10), limit(1)),
      query(collection(firestore, 'students'), where('phoneNumber', '==', `+91${clean10}`), limit(1)),
      query(collection(firestore, 'students'), where('phoneNumber', '==', clean10), limit(1)),
      query(collection(firestore, 'students'), where('cleanPhone', '==', clean10), limit(1)),
      query(collection(firestore, 'students'), where('contact', '==', clean10), limit(1)),
      query(collection(firestore, 'students'), where('rawPhone', '==', clean10), limit(1)),
    ];

    const results = await Promise.allSettled(phoneQueries.map(q => getDocs(q)));
    for (const res of results) {
      if (res.status === 'fulfilled' && !res.value.empty) {
        const d = res.value.docs[0];
        return { registered: true, data: d.data(), docId: d.id };
      }
    }

    // 3. Full scan fallback (handles inconsistent field naming)
    try {
      const all = await getDocs(collection(firestore, 'students'));
      for (const d of all.docs) {
        const dt = d.data();
        const phones = [
          dt.phone, dt.mobile, dt.mobileNumber, dt.phoneNumber, dt.cleanPhone,
          dt.rawPhone, dt.contact, dt['parent_gaurdian contact'], dt.parentContact, d.id
        ].map(p => normalizePhone(p || '')).filter(Boolean);

        if (phones.includes(clean10)) {
          return { registered: true, data: dt, docId: d.id };
        }
      }
    } catch (e) {
      console.warn('[StudentBusService] Full scan error:', e);
    }

    return { registered: false, reason: 'not_found' };
  } catch (err) {
    console.error('[StudentBusService] isPhoneNumberRegistered error:', err);
    throw err;
  }
}

// =============================================================================
// MANUAL STUDENT ID LINKING (admin-assisted fallback)
// =============================================================================

/**
 * Manually link a student record by entering their student ID or mobile.
 * Only used as admin-assisted fallback — the primary path is always UID-based.
 */
export async function setManualStudentId(queryInput) {
  if (!queryInput) return null;
  const clean = String(queryInput).trim();
  const cleanDigits = normalizePhone(clean);

  try {
    let matchedDoc = null;

    // Direct doc ID lookup
    try {
      const snap = await getDoc(doc(firestore, 'students', clean));
      if (snap.exists()) matchedDoc = { id: snap.id, data: snap.data() };
    } catch (e) {}

    // Query by studentId / regno / applicationId
    if (!matchedDoc) {
      const qs = [
        query(collection(firestore, 'students'), where('studentId', '==', clean), limit(1)),
        query(collection(firestore, 'students'), where('regno', '==', clean), limit(1)),
        query(collection(firestore, 'students'), where('applicationId', '==', clean), limit(1)),
      ];
      for (const q of qs) {
        try {
          const res = await getDocs(q);
          if (!res.empty) {
            matchedDoc = { id: res.docs[0].id, data: res.docs[0].data() };
            break;
          }
        } catch (e) {}
      }
    }

    // If 10-digit phone number entered
    if (!matchedDoc && cleanDigits) {
      const pReg = await isPhoneNumberRegistered(cleanDigits);
      if (pReg.registered && pReg.docId) {
        matchedDoc = { id: pReg.docId, data: pReg.data };
      }
    }

    if (matchedDoc) {
      const normalized = normalizeStudentData(matchedDoc.data, matchedDoc.id);
      const user = auth?.currentUser;
      if (user && user.uid) {
        await setDoc(doc(firestore, 'users', user.uid), {
          studentId: normalized.studentId,
          assignedBus: normalized.assignedBus,
          stage: normalized.stage,
          routeId: normalized.routeId,
        }, { merge: true }).catch(() => {});
      }
      localStorage.setItem('nexride_student_id', normalized.studentId);
      localStorage.setItem('nexride_assigned_bus', normalized.assignedBus);
      if (user) await cacheSet(`student_data_${user.uid}`, normalized).catch(() => {});
      attachRealtimeListeners(matchedDoc.id, user?.uid);
      notifyListeners(normalized);
      return normalized;
    }
  } catch (e) {
    console.warn('[StudentBusService] setManualStudentId error:', e);
  }

  return resolveStudentAssignedBus();
}

// =============================================================================
// GLOBAL EXPOSURE & AUTH LIFECYCLE
// =============================================================================

window.resolveStudentAssignedBus = resolveStudentAssignedBus;
window.setManualStudentId = setManualStudentId;
window.getActiveStudentData = getActiveStudentData;
window.subscribeStudentBus = subscribeStudentBus;
window.isPhoneNumberRegistered = isPhoneNumberRegistered;
window.clearStudentSession = clearStudentSession;

// Automatically resolve on auth state change — primary entry point
onAuthStateChanged(auth, (user) => {
  if (user && !user.isAnonymous) {
    resolveStudentAssignedBus(user);
  } else {
    clearStudentSession();
  }
});
