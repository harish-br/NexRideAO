// js/sos-service.js
// Client-side functional logic for NexRide SOS emergencies

import { auth, firestore } from './firebase-config.js';
import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

let activeSOSIncidentId = null;
let activeSOSUnsubscribe = null;

/**
 * Generate unique incident ID in format: SOS-YYYYMMDD-XXXXXX
 */
export function generateSOSIncidentId() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const randomChars = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `SOS-${yyyy}${mm}${dd}-${randomChars}`;
}

/**
 * Detect device platform
 */
export function getDevicePlatform() {
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  return 'Web';
}

/**
 * Detect network connectivity state
 */
export function getNetworkStatus() {
  return navigator.onLine ? 'ONLINE' : 'OFFLINE';
}

/**
 * Fetch current GPS position with high accuracy
 */
export function getCurrentGPSLocation(retryCount = 0) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error('Geolocation is not supported by your browser.'));
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 0),
          timestamp: pos.timestamp || Date.now()
        });
      },
      (err) => {
        // Code 1: PERMISSION_DENIED
        if (err.code === 1) {
          return reject(new Error('Location permission is required to send your emergency location.'));
        }
        // Retry once if timeout/unavailable
        if (retryCount < 1) {
          return getCurrentGPSLocation(retryCount + 1).then(resolve).catch(reject);
        }
        reject(new Error(err.message || 'Unable to retrieve your current location.'));
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0 // Do not use an outdated location and label it as current
      }
    );
  });
}

/**
 * Reverse geocode coordinates to human-readable address if Google Maps is available
 */
export async function reverseGeocode(latitude, longitude) {
  try {
    if (typeof google !== 'undefined' && google.maps && google.maps.Geocoder) {
      const geocoder = new google.maps.Geocoder();
      const response = await geocoder.geocode({
        location: { lat: latitude, lng: longitude }
      });
      if (response && response.results && response.results[0]) {
        return response.results[0].formatted_address;
      }
    }
  } catch (geoErr) {
    console.warn('[SOS] Reverse geocode lookup failed:', geoErr);
  }
  return `Lat: ${latitude.toFixed(5)}, Lng: ${longitude.toFixed(5)}`;
}

/**
 * Fetch authenticated user data
 */
export async function getAuthenticatedUserData() {
  const currentUser = auth ? auth.currentUser : null;
  if (!currentUser) {
    throw new Error('You must be logged in to activate SOS emergency assistance.');
  }

  let userName = currentUser.displayName || '';
  let phoneNumber = currentUser.phoneNumber || '';

  try {
    const userDocRef = doc(firestore, 'users', currentUser.uid);
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      const uData = userSnap.data();
      if (!userName) userName = uData.name || uData.userName || uData.fullName || '';
      if (!phoneNumber) phoneNumber = uData.phone || uData.phoneNumber || uData.mobile || uData.contact || '';
    }
  } catch (err) {
    console.warn('[SOS] User profile lookup fallback:', err);
  }

  return {
    userId: currentUser.uid,
    userName: userName || currentUser.email || 'Student User',
    phoneNumber: phoneNumber || 'Not Provided'
  };
}

/**
 * Trigger SOS Submission after slider is completed
 */
export async function submitSOSIncident(callbacks = {}) {
  const { onStatusChange, onError } = callbacks;

  // 1. Verify network status
  if (!navigator.onLine) {
    const offlineErr = new Error('Network is unavailable. Please check your connectivity and retry.');
    if (onError) onError(offlineErr);
    throw offlineErr;
  }

  // 2. Fetch authenticated user data
  const userData = await getAuthenticatedUserData();

  // 3. Fetch live GPS location
  const locationData = await getCurrentGPSLocation();

  // 4. Reverse geocode location
  const address = await reverseGeocode(locationData.latitude, locationData.longitude);

  // 5. Generate Incident ID
  const incidentId = generateSOSIncidentId();
  const platform = getDevicePlatform();
  const networkStatus = getNetworkStatus();

  // 6. Build incident payload
  const payload = {
    incidentId,
    userId: userData.userId,
    userName: userData.userName,
    phoneNumber: userData.phoneNumber,
    location: {
      latitude: locationData.latitude,
      longitude: locationData.longitude,
      accuracy: locationData.accuracy,
      address: address
    },
    activatedAt: serverTimestamp(),
    status: 'ACTIVE',
    platform,
    networkStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  // 7. Write to Firestore: sosIncidents/{incidentId}
  await setDoc(doc(firestore, 'sosIncidents', incidentId), payload);

  activeSOSIncidentId = incidentId;

  // 8. Start real-time listener for user status updates
  listenToIncidentStatus(incidentId, onStatusChange);

  return {
    incidentId,
    status: 'ACTIVE',
    address
  };
}

/**
 * Listen to status changes of the user's own SOS incident
 * Flow: ACTIVE -> ACKNOWLEDGED -> RESOLVED
 */
export function listenToIncidentStatus(incidentId, onStatusChange) {
  if (activeSOSUnsubscribe) {
    try { activeSOSUnsubscribe(); } catch (e) {}
    activeSOSUnsubscribe = null;
  }

  const incidentRef = doc(firestore, 'sosIncidents', incidentId);
  activeSOSUnsubscribe = onSnapshot(incidentRef, (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    const status = data.status || 'ACTIVE';

    if (onStatusChange) {
      onStatusChange({
        incidentId,
        status,
        acknowledgedBy: data.acknowledgedBy,
        acknowledgedAt: data.acknowledgedAt,
        resolvedBy: data.resolvedBy,
        resolvedAt: data.resolvedAt
      });
    }

    if (status === 'RESOLVED') {
      if (activeSOSUnsubscribe) {
        setTimeout(() => {
          try { activeSOSUnsubscribe(); } catch (e) {}
          activeSOSUnsubscribe = null;
          activeSOSIncidentId = null;
        }, 5000);
      }
    }
  }, (err) => {
    console.warn('[SOS] Listener error for incident:', incidentId, err);
  });
}
