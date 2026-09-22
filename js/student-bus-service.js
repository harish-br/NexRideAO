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
 * Core Resolver: Resolves student bus assignment from Firestore database
 */
export async function resolveStudentAssignedBus(currentUser = null) {
  if (isResolving) return activeStudentData;
  isResolving = true;

  try {
    const user = currentUser || auth?.currentUser;

    // 1. Try local offline cache first for instant UI responsiveness
    if (!activeStudentData) {
      try {
        const cached = await cacheGet('active_student_bus');
        if (cached && cached.data && cached.data.assignedBus) {
          activeStudentData = cached.data;
          notifyListeners(activeStudentData);
        }
      } catch (e) {}
    }

    let foundData = null;
    let foundDocId = null;

    // 2. Direct lookup by user.uid if authenticated
    if (user && user.uid) {
      try {
        const snap = await getDoc(doc(firestore, 'users', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          if (data.assignedBus || data.bus || data.busNumber || data.bus_no || data['bus no']) {
            foundData = data;
            foundDocId = snap.id;
          }
        }
      } catch (e) {
        console.warn('[StudentBusService] Direct uid lookup failed:', e);
      }
    }

    // 3. Lookup by stored Student ID / Registration number
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

    // 4. Lookup by phone number in Firestore users collection
    if (!foundData && user && user.phoneNumber) {
      const fullPhone = user.phoneNumber;
      const clean10 = fullPhone.replace(/\D/g, '').slice(-10);

      const phoneQueries = [
        query(collection(firestore, 'users'), where('phoneNumber', '==', fullPhone), limit(1)),
        query(collection(firestore, 'users'), where('phone', '==', clean10), limit(1)),
        query(collection(firestore, 'users'), where('mobile', '==', clean10), limit(1)),
        query(collection(firestore, 'users'), where('rawPhone', '==', clean10), limit(1)),
        query(collection(firestore, 'users'), where('contact', '==', clean10), limit(1))
      ];

      for (const q of phoneQueries) {
        try {
          const snap = await getDocs(q);
          if (!snap.empty) {
            foundData = snap.docs[0].data();
            foundDocId = snap.docs[0].id;
            console.log(`[StudentBusService] Matched student by phone [${clean10}] -> Doc [${foundDocId}]`);
            break;
          }
        } catch (e) {
          console.warn('[StudentBusService] Phone query attempt failed:', e);
        }
      }
    }

    // 5. Intelligent Fallback: Query all users with an assigned bus from database
    // Sorts by most recent update timestamp so the newly assigned student is selected
    if (!foundData) {
      try {
        const snap = await getDocs(collection(firestore, 'users'));
        if (!snap.empty) {
          // Find all documents that have an assigned bus
          const assignedDocs = snap.docs.filter(d => {
            const dt = d.data();
            return Boolean(dt.assignedBus || dt.bus || dt.busNumber || dt.bus_no || dt['bus no']);
          });

          if (assignedDocs.length > 0) {
            // Sort by updatedAt descending (newest first)
            assignedDocs.sort((a, b) => {
              const dtA = a.data();
              const dtB = b.data();
              const timeA = dtA.updatedAt?.toMillis?.() || dtA.updatedAt?.seconds || 0;
              const timeB = dtB.updatedAt?.toMillis?.() || dtB.updatedAt?.seconds || 0;
              return timeB - timeA;
            });

            // If stored ID matches any doc, prioritize it
            const storedId = localStorage.getItem('nexride_student_id');
            let pickedDoc = null;
            if (storedId) {
              pickedDoc = assignedDocs.find(d => d.id === storedId || d.data().studentId === storedId || d.data().regno === storedId);
            }

            // Otherwise pick the most recently allocated student
            if (!pickedDoc) {
              pickedDoc = assignedDocs[0];
            }

            if (pickedDoc) {
              foundData = pickedDoc.data();
              foundDocId = pickedDoc.id;
              console.log(`[StudentBusService] Resolved assigned student from database: [${foundDocId}] (Bus ${foundData.assignedBus || foundData.bus})`);
            }
          }
        }
      } catch (e) {
        console.warn('[StudentBusService] Users collection fallback query failed:', e);
      }
    }

    // 6. If student allocation was found, normalize and link
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
            balance: normalized.balance,
            fees_status: normalized.fees_status
          }, { merge: true });

          // Also link digital pass subcollection
          await setDoc(doc(firestore, 'users', user.uid, 'DigitalID', 'userpass'), normalized.raw, { merge: true });
        } catch (linkErr) {
          console.warn('[StudentBusService] Failed linking student to user.uid doc:', linkErr);
        }
      }

      // Persist to local caches
      localStorage.setItem('nexride_student_id', normalized.studentId);
      localStorage.setItem('nexride_assigned_bus', normalized.assignedBus);
      cacheSet('active_student_bus', normalized).catch(() => {});

      // Attach real-time snapshot listeners so changes in admin appear immediately
      attachRealtimeListeners(foundDocId, user?.uid);

      notifyListeners(normalized);

      // Also ensure collection watcher is active in case another allocation happens
      listenForNewStudentAllocations(user);

      return normalized;
    } else {
      // Setup dynamic collection watcher so when admin adds a student, app catches it immediately
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
 * Listens to the users collection for any newly added or updated student in real time
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

          // Check if this student matches current user or if current app has no assigned bus
          let isMatch = false;
          if (user && user.uid && change.doc.id === user.uid) isMatch = true;

          if (user && user.phoneNumber) {
            const cleanUserPhone = user.phoneNumber.replace(/\D/g, '').slice(-10);
            const dataPhone = String(data.phone || data.mobile || data.phoneNumber || data.contact || '').replace(/\D/g, '').slice(-10);
            if (cleanUserPhone && dataPhone && cleanUserPhone === dataPhone) isMatch = true;
          }

          const storedId = localStorage.getItem('nexride_student_id');
          if (storedId && (change.doc.id === storedId || data.studentId === storedId || data.regno === storedId)) {
            isMatch = true;
          }

          // If the app currently has no active student bus, automatically adopt newly added/updated student!
          if (!activeStudentData || !activeStudentData.assignedBus) {
            isMatch = true;
          }

          // In dev/localhost/local IP environments, adopt allocations
          if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || !user || user.isAnonymous) {
            isMatch = true;
          }

          if (isMatch) {
            console.log(`[StudentBusService] Real-time student allocation detected via Firestore onSnapshot: Bus ${data.assignedBus || data.bus}`);
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

// =============================================================================
// GLOBAL EXPOSURE & LIFECYCLE
// =============================================================================
window.resolveStudentAssignedBus = resolveStudentAssignedBus;
window.setManualStudentId = setManualStudentId;
window.getActiveStudentData = getActiveStudentData;
window.subscribeStudentBus = subscribeStudentBus;

// Automatically resolve on auth state change
onAuthStateChanged(auth, (user) => {
  resolveStudentAssignedBus(user);
});

