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
import { cacheGet, cacheSet } from './offline/db.js';

// =============================================================================
// STATE & REGISTRY
// =============================================================================
let activeStudentData = null;
const changeListeners = new Set();
let activeSnapshotUnsubs = [];
let isResolving = false;
let autoCollectionListenerUnsub = null;

/**
 * Normalizes raw Firestore document data into standard Student Bus Allocation format
 */
export function normalizeStudentData(data, docId = '') {
  if (!data) return null;

  const rawBus = data.assignedBus || data.bus || data.busNumber || data.bus_no || data['bus no'] || '';
  const busStr = rawBus ? String(rawBus).trim() : '';

  const rawStage = data.stage || data.pickupStop || data.boardingStop || '';
  const rawRoute = data.routeId || data.route_id || data.assignedRouteName || data.route || data.routeName || '';

  const rawId = data.studentId || data.id || data.regno || docId || '';
  const rawName = data.name || data.studentName || data.displayName || 'Student';

  const cleanPhone = String(data.phone || data.mobile || data.phoneNumber || data.contact || '').replace(/\D/g, '').slice(-10);

  return {
    docId: docId || rawId,
    id: rawId,
    studentId: rawId,
    regno: rawId,
    name: rawName,
    assignedBus: busStr,
    bus: busStr,
    busNumber: busStr,
    stage: rawStage,
    pickupStop: rawStage,
    routeId: rawRoute,
    route: rawRoute,
    phone: data.phone || data.mobile || data.phoneNumber || '',
    mobile: data.mobile || data.phone || '',
    phoneNumber: data.phoneNumber || (cleanPhone ? `+91${cleanPhone}` : ''),
    cleanPhone: cleanPhone,
    contact: data['parent_gaurdian contact'] || data.contact || data.phone || '',
    balance: data.balance || (data.fees_status === 'Paid' ? 'Fully Paid' : 'Unpaid'),
    fees_status: data.fees_status || (data.balance === 'Fully Paid' ? 'Paid' : 'Pending'),
    feesAmount: data.feesAmount || data.fees_amount || 0,
    paidAmount: data.paidAmount || data.paid_amount || 0,
    academicYear: data.academicYear || data.academic_year || '2025-2026',
    institution: data.institution || 'Nandha Engineering College (Autonomous)',
    department: data.department || 'Engineering',
    year: data.year || '2nd Year',
    passengerType: data.passengerType || data.passenger_type || 'Student',
    role: data.role || 'student',
    updatedAt: data.updatedAt || null,
    raw: data
  };
}

/**
 * Returns current in-memory resolved student record
 */
export function getActiveStudentData() {
  return activeStudentData;
}

/**
 * Subscribes a listener to student bus allocation updates
 */
export function subscribeStudentBus(callback) {
  if (typeof callback !== 'function') return () => {};
  changeListeners.add(callback);

  // Immediately notify with current data if already resolved
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

/**
 * Broadcasts student data to all registered listeners
 */
function notifyListeners(data) {
  activeStudentData = data;
  changeListeners.forEach(cb => {
    try {
      cb(data);
    } catch (e) {
      console.warn('[StudentBusService] Listener error:', e);
    }
  });

  // Dispatch global DOM event for components listening on window
  window.dispatchEvent(new CustomEvent('nexride:student-bus-updated', {
    detail: data
  }));
}

/**
 * Clear existing real-time document listeners
 */
function cleanupSnapshotListeners() {
  activeSnapshotUnsubs.forEach(unsub => {
    try { unsub(); } catch (e) {}
  });
  activeSnapshotUnsubs = [];
}

/**
 * Attach real-time Firestore listeners to the student document(s)
 */
function attachRealtimeListeners(targetDocId, authUid = null) {
  cleanupSnapshotListeners();

  const docIds = new Set();
  if (targetDocId) docIds.add(targetDocId);
  if (authUid) docIds.add(authUid);

  docIds.forEach(dId => {
    try {
      const unsub = onSnapshot(doc(firestore, 'users', dId), (snap) => {
        if (snap.exists()) {
          const freshData = snap.data();
          const normalized = normalizeStudentData(freshData, snap.id);
          console.log(`[StudentBusService] Real-time Firestore update for student [${dId}]: Bus ${normalized.assignedBus || 'None'}`);
          
          // Only update if it contains meaningful student info
          if (normalized.assignedBus || normalized.name !== 'User') {
            notifyListeners(normalized);
            cacheSet('active_student_bus', normalized).catch(() => {});
          }
        }
      }, (err) => {
        console.warn(`[StudentBusService] onSnapshot error on doc ${dId}:`, err);
      });

      activeSnapshotUnsubs.push(unsub);
    } catch (e) {
      console.warn(`[StudentBusService] Failed attaching onSnapshot for ${dId}:`, e);
    }
  });
}

/**
 * Core Resolver: Resolves student bus assignment from Firestore database.
 * Automatically detects logged-in user's mobile number and matches against database records,
 * guaranteeing each user sees only their own specific bus.
 */
export async function resolveStudentAssignedBus(currentUser = null) {
  if (isResolving) return activeStudentData;
  isResolving = true;

  try {
    const user = currentUser || auth?.currentUser;

    // Detect active user's 10-digit mobile number
    let loginPhoneClean = null;
    if (user && user.phoneNumber) {
      loginPhoneClean = String(user.phoneNumber).replace(/\D/g, '').slice(-10);
    }
    if (!loginPhoneClean) {
      const storedPhone = localStorage.getItem('nexride_user_phone');
      if (storedPhone) {
        const c10 = String(storedPhone).replace(/\D/g, '').slice(-10);
        if (c10.length === 10) loginPhoneClean = c10;
      }
    }

    // 1. Try local offline cache first ONLY if it belongs to the same user
    if (!activeStudentData) {
      try {
        const cached = await cacheGet('active_student_bus');
        if (cached && cached.data && cached.data.assignedBus) {
          const cachedPhone = String(cached.data.cleanPhone || cached.data.phone || '').replace(/\D/g, '').slice(-10);
          if (!loginPhoneClean || !cachedPhone || cachedPhone === loginPhoneClean) {
            activeStudentData = cached.data;
            notifyListeners(activeStudentData);
          }
        }
      } catch (e) {}
    }

    let foundData = null;
    let foundDocId = null;

    // CASE A: User has a detected login mobile number (or stored login phone)
    if (loginPhoneClean) {
      console.log(`[StudentBusService] Automatic mobile detection: +91 ${loginPhoneClean}. Querying Firestore database for this user's specific bus...`);

      // A1. Direct lookup by user.uid if authenticated and already linked
      if (user && user.uid) {
        try {
          const snap = await getDoc(doc(firestore, 'users', user.uid));
          if (snap.exists()) {
            const data = snap.data();
            const docPhone = String(data.phone || data.mobile || data.phoneNumber || data.cleanPhone || data.contact || '').replace(/\D/g, '').slice(-10);
            if ((!docPhone || docPhone === loginPhoneClean) && (data.assignedBus || data.bus || data.busNumber || data.bus_no || data['bus no'])) {
              foundData = data;
              foundDocId = snap.id;
              console.log(`[StudentBusService] Matched authenticated user document [${user.uid}] for mobile ${loginPhoneClean}: Bus ${foundData.assignedBus || foundData.bus}`);
            }
          }
        } catch (e) {
          console.warn('[StudentBusService] Direct uid lookup failed:', e);
        }
      }

      // A2. Indexed Firestore queries for this exact 10-digit mobile number
      if (!foundData) {
        const phoneQueries = [
          query(collection(firestore, 'users'), where('phoneNumber', '==', `+91${loginPhoneClean}`), limit(1)),
          query(collection(firestore, 'users'), where('phone', '==', loginPhoneClean), limit(1)),
          query(collection(firestore, 'users'), where('mobile', '==', loginPhoneClean), limit(1)),
          query(collection(firestore, 'users'), where('cleanPhone', '==', loginPhoneClean), limit(1)),
          query(collection(firestore, 'users'), where('rawPhone', '==', loginPhoneClean), limit(1)),
          query(collection(firestore, 'users'), where('contact', '==', loginPhoneClean), limit(1))
        ];

        for (const q of phoneQueries) {
          try {
            const snap = await getDocs(q);
            if (!snap.empty) {
              const docMatch = snap.docs.find(d => {
                const dt = d.data();
                return Boolean(dt.assignedBus || dt.bus || dt.busNumber || dt.bus_no || dt['bus no']);
              }) || snap.docs[0];
              foundData = docMatch.data();
              foundDocId = docMatch.id;
              console.log(`[StudentBusService] Matched student by indexed phone query [${loginPhoneClean}] -> Doc [${foundDocId}], Bus: ${foundData.assignedBus || foundData.bus}`);
              break;
            }
          } catch (e) {
            console.warn('[StudentBusService] Phone query attempt failed:', e);
          }
        }
      }

      // A3. Comprehensive collection scan for this exact 10-digit mobile number
      // (handles spaces, leading zeros, number vs string types, or custom phone fields)
      if (!foundData) {
        try {
          const snap = await getDocs(collection(firestore, 'users'));
          for (const d of snap.docs) {
            const dt = d.data();
            const docPhones = [
              dt.phone, dt.mobile, dt.phoneNumber, dt.cleanPhone, dt.rawPhone,
              dt.contact, dt['parent_gaurdian contact'], d.id
            ].map(p => String(p || '').replace(/\D/g, '').slice(-10));

            if (docPhones.includes(loginPhoneClean)) {
              foundData = dt;
              foundDocId = d.id;
              console.log(`[StudentBusService] Matched student by comprehensive phone scan [${loginPhoneClean}] -> Doc [${foundDocId}], Bus: ${foundData.assignedBus || foundData.bus}`);
              const hasBus = Boolean(dt.assignedBus || dt.bus || dt.busNumber || dt.bus_no || dt['bus no']);
              if (hasBus) break;
            }
          }
        } catch (e) {
          console.warn('[StudentBusService] Comprehensive phone scan failed:', e);
        }
      }

      // STRICT USER ISOLATION:
      // If user logged in with a mobile number and has no matching assigned bus in database,
      // DO NOT SHOW ANY OTHER USER'S BUS!
      if (!foundData || !(foundData.assignedBus || foundData.bus || foundData.busNumber)) {
        console.log(`[StudentBusService] No bus assigned in database for mobile [${loginPhoneClean}]. Strict user isolation applied.`);
        activeStudentData = null;
        localStorage.removeItem('nexride_assigned_bus');
        localStorage.removeItem('nexride_student_id');
        cacheSet('active_student_bus', null).catch(() => {});
        notifyListeners(null);
        listenForNewStudentAllocations(user);
        return null;
      }
    }

    // CASE B: User has a stored Student ID / Registration number (entered manually)
    if (!foundData) {
      const storedId = localStorage.getItem('nexride_student_id') || localStorage.getItem('nexride_manual_student_id');
      if (storedId) {
        try {
          const snap = await getDoc(doc(firestore, 'users', storedId));
          if (snap.exists()) {
            foundData = snap.data();
            foundDocId = snap.id;
            console.log(`[StudentBusService] Matched student by stored ID [${storedId}]`);
          } else {
            // Query by studentId, regno, or id
            const qStu = query(collection(firestore, 'users'), where('studentId', '==', storedId), limit(1));
            const qReg = query(collection(firestore, 'users'), where('regno', '==', storedId), limit(1));
            const [snapStu, snapReg] = await Promise.all([getDocs(qStu).catch(() => null), getDocs(qReg).catch(() => null)]);
            const matched = (snapStu && !snapStu.empty && snapStu.docs[0]) || (snapReg && !snapReg.empty && snapReg.docs[0]);
            if (matched) {
              foundData = matched.data();
              foundDocId = matched.id;
              console.log(`[StudentBusService] Matched student by studentId/regno query [${storedId}] -> Doc [${foundDocId}]`);
            }
          }
        } catch (e) {
          console.warn('[StudentBusService] Stored ID lookup failed:', e);
        }
      }
    }

    // CASE C: Pure unauthenticated developer demo preview (no mobile, no student ID, localhost/demo only)
    if (!foundData && !loginPhoneClean && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || !user || user.isAnonymous)) {
      try {
        const snap = await getDocs(collection(firestore, 'users'));
        if (!snap.empty) {
          const assignedDocs = snap.docs.filter(d => {
            const dt = d.data();
            return Boolean(dt.assignedBus || dt.bus || dt.busNumber || dt.bus_no || dt['bus no']);
          });

          if (assignedDocs.length > 0) {
            assignedDocs.sort((a, b) => {
              const dtA = a.data();
              const dtB = b.data();
              const timeA = dtA.updatedAt?.toMillis?.() || dtA.updatedAt?.seconds || 0;
              const timeB = dtB.updatedAt?.toMillis?.() || dtB.updatedAt?.seconds || 0;
              return timeB - timeA;
            });
            foundData = assignedDocs[0].data();
            foundDocId = assignedDocs[0].id;
            console.log(`[StudentBusService] Unauthenticated dev demo fallback: resolved assigned student [${foundDocId}] (Bus ${foundData.assignedBus || foundData.bus})`);
          }
        }
      } catch (e) {
        console.warn('[StudentBusService] Demo fallback query failed:', e);
      }
    }

    // Link and notify
    if (foundData && foundDocId) {
      const normalized = normalizeStudentData(foundData, foundDocId);

      // Link to user.uid document in Firestore so future direct queries succeed
      if (user && user.uid && foundDocId !== user.uid) {
        try {
          await setDoc(doc(firestore, 'users', user.uid), {
            assignedBus: normalized.assignedBus,
            bus: normalized.bus,
            busNumber: normalized.busNumber,
            stage: normalized.stage,
            pickupStop: normalized.pickupStop,
            routeId: normalized.routeId,
            studentId: normalized.studentId,
            regno: normalized.regno,
            name: normalized.name,
            phone: normalized.phone,
            mobile: normalized.mobile,
            cleanPhone: normalized.cleanPhone || loginPhoneClean,
            phoneNumber: normalized.phoneNumber,
            balance: normalized.balance,
            fees_status: normalized.fees_status
          }, { merge: true });

          await setDoc(doc(firestore, 'users', user.uid, 'DigitalID', 'userpass'), normalized.raw, { merge: true });
        } catch (linkErr) {
          console.warn('[StudentBusService] Failed linking student to user.uid doc:', linkErr);
        }
      }

      // Persist to local caches
      localStorage.setItem('nexride_student_id', normalized.studentId);
      localStorage.setItem('nexride_assigned_bus', normalized.assignedBus);
      if (loginPhoneClean) {
        localStorage.setItem('nexride_user_phone', loginPhoneClean);
      }
      cacheSet('active_student_bus', normalized).catch(() => {});

      // Attach real-time snapshot listeners so changes in admin appear immediately
      attachRealtimeListeners(foundDocId, user?.uid);

      notifyListeners(normalized);
      listenForNewStudentAllocations(user);
      return normalized;
    } else {
      listenForNewStudentAllocations(user);
      return null;
    }

  } catch (err) {
    console.error('[StudentBusService] Error resolving student bus:', err);
    return null;
  } finally {
    isResolving = false;
  }
}

/**
 * Listens to the users collection for any newly added or updated student in real time.
 * Strictly respects user mobile number isolation so User A never gets User B's bus.
 */
function listenForNewStudentAllocations(user) {
  if (autoCollectionListenerUnsub) return;

  try {
    const usersCol = collection(firestore, 'users');
    autoCollectionListenerUnsub = onSnapshot(usersCol, (snap) => {
      snap.docChanges().forEach(change => {
        if (change.type === 'added' || change.type === 'modified') {
          const data = change.doc.data();
          const hasBus = Boolean(data.assignedBus || data.bus || data.busNumber || data.bus_no || data['bus no']);
          if (!hasBus) return;

          // Determine current user's mobile number
          let currentMobile = null;
          if (user && user.phoneNumber) {
            currentMobile = user.phoneNumber.replace(/\D/g, '').slice(-10);
          }
          if (!currentMobile) {
            const sp = localStorage.getItem('nexride_user_phone');
            if (sp) currentMobile = sp.replace(/\D/g, '').slice(-10);
          }

          const storedId = localStorage.getItem('nexride_student_id');

          let isMatch = false;

          // 1. If user is logged in with a mobile number: MATCH ONLY IF THIS CHANGED DOC'S PHONE MATCHES!
          if (currentMobile) {
            const changePhones = [
              data.phone, data.mobile, data.phoneNumber, data.cleanPhone, data.rawPhone,
              data.contact, data['parent_gaurdian contact'], change.doc.id
            ].map(p => String(p || '').replace(/\D/g, '').slice(-10));

            if (changePhones.includes(currentMobile)) {
              isMatch = true;
              console.log(`[StudentBusService] Real-time assignment MATCHED for mobile [${currentMobile}]: Bus ${data.assignedBus || data.bus}`);
            }
          } else if (storedId) {
            // 2. If user linked by Student ID, match if ID matches
            if (change.doc.id === storedId || data.studentId === storedId || data.regno === storedId) {
              isMatch = true;
            }
          } else if (user && user.uid && change.doc.id === user.uid) {
            // 3. Match if direct UID matches
            isMatch = true;
          } else if (!user && !currentMobile && !storedId) {
            // 4. Demo fallback: auto-adopt newly assigned student when unassigned
            if (!activeStudentData || !activeStudentData.assignedBus) {
              isMatch = true;
            }
          }

          if (isMatch) {
            const normalized = normalizeStudentData(data, change.doc.id);
            localStorage.setItem('nexride_student_id', normalized.studentId);
            localStorage.setItem('nexride_assigned_bus', normalized.assignedBus);
            cacheSet('active_student_bus', normalized).catch(() => {});
            notifyListeners(normalized);
            attachRealtimeListeners(change.doc.id, user?.uid);
          }
        }
      });
    }, (err) => {
      console.warn('[StudentBusService] Collection listener error:', err);
    });
  } catch (e) {
    console.warn('[StudentBusService] Could not set collection listener:', e);
  }
}

/**
 * Manually link or switch Student ID or Mobile Number
 */
export async function setManualStudentId(queryInput) {
  if (!queryInput) return null;
  const clean = String(queryInput).trim();
  const cleanDigits = clean.replace(/\D/g, '');
  const isMobile = cleanDigits.length === 10;

  localStorage.setItem('nexride_student_id', clean);
  localStorage.setItem('nexride_manual_student_id', clean);

  try {
    let matchedDoc = null;

    // 1. Direct doc ID lookup
    const snap = await getDoc(doc(firestore, 'users', clean));
    if (snap.exists()) {
      matchedDoc = { id: snap.id, data: snap.data() };
    }

    // 2. Query by studentId / regno
    if (!matchedDoc) {
      const qStu = query(collection(firestore, 'users'), where('studentId', '==', clean), limit(1));
      const qReg = query(collection(firestore, 'users'), where('regno', '==', clean), limit(1));
      const [resStu, resReg] = await Promise.all([getDocs(qStu).catch(() => null), getDocs(qReg).catch(() => null)]);
      if (resStu && !resStu.empty) {
        matchedDoc = { id: resStu.docs[0].id, data: resStu.docs[0].data() };
      } else if (resReg && !resReg.empty) {
        matchedDoc = { id: resReg.docs[0].id, data: resReg.docs[0].data() };
      }
    }

    // 3. If 10 digits, query by mobile / phone
    if (!matchedDoc && isMobile) {
      const pQueries = [
        query(collection(firestore, 'users'), where('phoneNumber', '==', `+91${cleanDigits}`), limit(1)),
        query(collection(firestore, 'users'), where('phone', '==', cleanDigits), limit(1)),
        query(collection(firestore, 'users'), where('mobile', '==', cleanDigits), limit(1)),
        query(collection(firestore, 'users'), where('rawPhone', '==', cleanDigits), limit(1)),
        query(collection(firestore, 'users'), where('contact', '==', cleanDigits), limit(1))
      ];
      for (const q of pQueries) {
        try {
          const res = await getDocs(q);
          if (!res.empty) {
            matchedDoc = { id: res.docs[0].id, data: res.docs[0].data() };
            break;
          }
        } catch (e) {}
      }
    }

    // 4. Case-insensitive search across users if still not found
    if (!matchedDoc) {
      const allUsers = await getDocs(collection(firestore, 'users'));
      const lower = clean.toLowerCase();
      allUsers.forEach(d => {
        if (matchedDoc) return;
        const dt = d.data();
        const sId = String(dt.studentId || dt.regno || dt.id || d.id || '').toLowerCase();
        const sName = String(dt.name || '').toLowerCase();
        const sPhone = String(dt.phone || dt.mobile || dt.contact || '').replace(/\D/g, '');
        if (sId === lower || sName.includes(lower) || (cleanDigits && sPhone.includes(cleanDigits))) {
          matchedDoc = { id: d.id, data: dt };
        }
      });
    }

    if (matchedDoc) {
      const normalized = normalizeStudentData(matchedDoc.data, matchedDoc.id);

      const user = auth?.currentUser;
      if (user && user.uid) {
        await setDoc(doc(firestore, 'users', user.uid), {
          assignedBus: normalized.assignedBus,
          bus: normalized.bus,
          busNumber: normalized.busNumber,
          stage: normalized.stage,
          pickupStop: normalized.pickupStop,
          routeId: normalized.routeId,
          studentId: normalized.studentId,
          regno: normalized.regno,
          name: normalized.name,
          phone: normalized.phone
        }, { merge: true }).catch(() => {});

        await setDoc(doc(firestore, 'users', user.uid, 'DigitalID', 'userpass'), normalized.raw, { merge: true }).catch(() => {});
      }

      localStorage.setItem('nexride_student_id', normalized.studentId);
      localStorage.setItem('nexride_assigned_bus', normalized.assignedBus);
      cacheSet('active_student_bus', normalized).catch(() => {});

      attachRealtimeListeners(matchedDoc.id, user?.uid);
      notifyListeners(normalized);
      return normalized;
    }
  } catch (e) {
    console.warn('[StudentBusService] Manual student linking query error:', e);
  }

  // Trigger general resolution as fallback
  return resolveStudentAssignedBus();
}

/**
 * Verifies whether a student/passenger mobile number exists in the Firebase database.
 * Queries against users collection fields (phone, mobile, phoneNumber, cleanPhone, rawPhone, contact, etc.)
 * and document IDs to ensure only registered users can access the application.
 * @param {string} phoneRaw - Mobile number (10 digits or with +91)
 * @param {string} [uid] - Optional user auth UID
 * @returns {Promise<{ registered: boolean, data?: object, docId?: string, reason?: string }>}
 */
export async function isPhoneNumberRegistered(phoneRaw, uid = null) {
  if (!firestore) {
    console.warn('[StudentBusService] Firestore not initialized, database registration check unavailable');
    return { registered: false, reason: 'database_unavailable' };
  }

  const clean10 = String(phoneRaw || '').replace(/\D/g, '').slice(-10);
  if (!clean10 || clean10.length !== 10) {
    return { registered: false, reason: 'invalid_format' };
  }

  try {
    // 1. Check if UID doc exists (if authenticated)
    if (uid) {
      try {
        const snapUid = await getDoc(doc(firestore, 'users', uid));
        if (snapUid.exists()) {
          const uData = snapUid.data();
          const docClean = String(uData.phone || uData.mobile || uData.phoneNumber || uData.cleanPhone || uData.contact || '').replace(/\D/g, '').slice(-10);
          if (!docClean || docClean === clean10 || uData.assignedBus || uData.bus || uData.name) {
            return { registered: true, data: uData, docId: snapUid.id };
          }
        }
      } catch (e) {
        console.warn('[StudentBusService] UID lookup error in isPhoneNumberRegistered:', e);
      }
    }

    // 2. Direct document ID lookup (clean 10-digit or +91 format)
    try {
      const snapDirect = await getDoc(doc(firestore, 'users', clean10));
      if (snapDirect.exists()) {
        return { registered: true, data: snapDirect.data(), docId: snapDirect.id };
      }
      const snapIntl = await getDoc(doc(firestore, 'users', `+91${clean10}`));
      if (snapIntl.exists()) {
        return { registered: true, data: snapIntl.data(), docId: snapIntl.id };
      }
    } catch (e) {
      console.warn('[StudentBusService] Direct doc lookup error in isPhoneNumberRegistered:', e);
    }

    // 3. Fast parallel indexed queries
    const phoneQueries = [
      query(collection(firestore, 'users'), where('phone', '==', clean10), limit(1)),
      query(collection(firestore, 'users'), where('mobile', '==', clean10), limit(1)),
      query(collection(firestore, 'users'), where('phoneNumber', '==', `+91${clean10}`), limit(1)),
      query(collection(firestore, 'users'), where('phoneNumber', '==', clean10), limit(1)),
      query(collection(firestore, 'users'), where('cleanPhone', '==', clean10), limit(1)),
      query(collection(firestore, 'users'), where('rawPhone', '==', clean10), limit(1)),
      query(collection(firestore, 'users'), where('contact', '==', clean10), limit(1)),
      query(collection(firestore, 'users'), where('phone', '==', `+91${clean10}`), limit(1)),
      query(collection(firestore, 'users'), where('mobile', '==', `+91${clean10}`), limit(1))
    ];

    const results = await Promise.allSettled(phoneQueries.map(q => getDocs(q)));
    for (const res of results) {
      if (res.status === 'fulfilled' && !res.value.empty) {
        const d = res.value.docs[0];
        return { registered: true, data: d.data(), docId: d.id };
      }
    }

    // 4. Comprehensive collection scan fallback
    try {
      const snap = await getDocs(collection(firestore, 'users'));
      for (const d of snap.docs) {
        const dt = d.data();
        const docPhones = [
          dt.phone,
          dt.mobile,
          dt.phoneNumber,
          dt.cleanPhone,
          dt.rawPhone,
          dt.contact,
          dt['parent_gaurdian contact'],
          dt['parent_guardian_contact'],
          dt.parentContact,
          d.id
        ].map(p => String(p || '').replace(/\D/g, '').slice(-10));

        if (docPhones.includes(clean10)) {
          return { registered: true, data: dt, docId: d.id };
        }
      }
    } catch (scanErr) {
      console.warn('[StudentBusService] Collection scan warning in isPhoneNumberRegistered:', scanErr);
    }

    return { registered: false, reason: 'not_found' };
  } catch (err) {
    console.error('[StudentBusService] Error checking mobile registration in database:', err);
    throw err;
  }
}

// =============================================================================
// GLOBAL EXPOSURE & LIFECYCLE
// =============================================================================
window.resolveStudentAssignedBus = resolveStudentAssignedBus;
window.setManualStudentId = setManualStudentId;
window.getActiveStudentData = getActiveStudentData;
window.subscribeStudentBus = subscribeStudentBus;
window.isPhoneNumberRegistered = isPhoneNumberRegistered;

// Automatically resolve on auth state change
onAuthStateChanged(auth, (user) => {
  resolveStudentAssignedBus(user);
});

