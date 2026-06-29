import { firestore } from './firebase-config.js';
import { doc, getDoc, collection, query, where, onSnapshot, getDocs } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';

// ----------------------------------------------------
// STATE & DOM
// ----------------------------------------------------
const trackingState = {
    offline: false,
    lastFirebaseUpdate: 0,
    currentY: 0,
    targetY: 0,
    progress: 0
};

let busTrackerEl = null;
let stopItemsEl = [];
let routeStops = [];
let unsubscribeBus = null;

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // meters
    const toRad = x => x * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ----------------------------------------------------
// CORE UI UPDATES (NO ROUTE LOGIC)
// ----------------------------------------------------

function updateStatusBanner(status, delayMinutes, isOperatingHours = true) {
    const statusEl = document.getElementById('bus-status');
    if (!statusEl) return;
    
    if (trackingState.offline) {
        if (isOperatingHours) {
            statusEl.textContent = "Bus Offline";
            statusEl.style.color = "#EF4444";
        } else {
            statusEl.textContent = "Bus in halt";
            statusEl.style.color = "#6B7280";
        }
        statusEl.style.textShadow = "none";
        return;
    }

    if (status === 'moving') {
        statusEl.textContent = delayMinutes > 0 ? `Delayed by ${delayMinutes} min` : "Bus in movement";
        statusEl.style.color = delayMinutes > 0 ? "#EAB308" : "#10b981";
        statusEl.style.textShadow = delayMinutes > 0 ? "none" : "0 0 8px rgba(16,185,129,0.18)";
    } else if (status === 'stopped') {
        statusEl.textContent = "Bus in halt";
        statusEl.style.color = "#F97316";
        statusEl.style.textShadow = "none";
    } else if (status === 'completed') {
        statusEl.textContent = "Reached Destination";
        statusEl.style.color = "#64748B";
        statusEl.style.textShadow = "none";
    } else if (status === 'offline') {
        statusEl.textContent = "Bus Offline";
        statusEl.style.color = "#EF4444";
        statusEl.style.textShadow = "none";
    }
}

function updateArrowAnimation(status) {
    if (!busTrackerEl) return;
    const arrow = busTrackerEl.querySelector('.tracking-arrow');
    if (!arrow) return;

    if (status === 'moving' && !trackingState.offline) {
        arrow.classList.add('arrow-animating');
    } else {
        arrow.classList.remove('arrow-animating');
    }
}

function calculateTargetY(currentStopIndex, nextStopIndex, lat, lng) {
    if (!busTrackerEl || stopItemsEl.length === 0) return;

    const fromDOM = stopItemsEl[currentStopIndex];
    const toDOM = stopItemsEl[Math.min(nextStopIndex, stopItemsEl.length - 1)];

    if (fromDOM && toDOM) {
        // Calculate visual progress using simple distance
        let progress = 0;
        if (currentStopIndex < nextStopIndex && nextStopIndex < routeStops.length) {
            const fromStop = routeStops[currentStopIndex];
            const toStop = routeStops[nextStopIndex];
            
            const totalDist = haversineDistance(fromStop.lat, fromStop.lng, toStop.lat, toStop.lng);
            const distTravelled = haversineDistance(fromStop.lat, fromStop.lng, lat, lng);
            
            progress = totalDist > 0 ? distTravelled / totalDist : 0;
            progress = Math.max(0, Math.min(1, progress));
        } else if (currentStopIndex >= routeStops.length - 1) {
            progress = 1; // Completed
        }

        const fromY = fromDOM.offsetTop + 12;
        const toY = toDOM.offsetTop + 12;
        
        trackingState.targetY = fromY + ((toY - fromY) * progress);

        // Update CSS transition for smooth animation (lerp over 2s)
        busTrackerEl.style.transition = `transform 1.5s linear`;
        busTrackerEl.style.transform = `translate3d(0, ${trackingState.targetY}px, 0)`;
        busTrackerEl.style.display = 'flex';
    }
}

function getStopStatus(stopIndex, currentStopIndex, nextStopIndex, busStatus) {
    if (busStatus === 'stopped') {
        if (stopIndex === currentStopIndex) return 'arrived';
        if (stopIndex < currentStopIndex) return 'departed';
        return 'upcoming';
    } else {
        if (stopIndex < nextStopIndex) return 'departed';
        return 'upcoming';
    }
}

function updateStopStyles(currentStopIndex, nextStopIndex, status, etaMinutes) {
    stopItemsEl.forEach((el, idx) => {
        const dot = el.querySelector('.tracking-dot');
        const timeEl = el.querySelector('.stop-time');
        const headingEl = el.querySelector('.heading-towards');

        // Clean up legacy ETA subtitles if they exist
        const etaSubtitle = el.querySelector('.eta-subtitle');
        if (etaSubtitle) etaSubtitle.remove();

        if (timeEl) {
            timeEl.textContent = '';
            timeEl.style.fontSize = '14px';
            timeEl.style.fontWeight = '600';
            timeEl.style.color = '#6B7280';
        }

        let stopStatus = getStopStatus(idx, currentStopIndex, nextStopIndex, status);

        // Final Stop override logic
        if (status === 'completed') {
            if (idx === routeStops.length - 1) {
                stopStatus = 'arrived';
            } else {
                stopStatus = 'departed';
            }
        }

        if (dot) {
            dot.className = 'tracking-dot';

            if (status === 'offline') {
                dot.style.backgroundColor = '#C9CED6'; // Gray
                if (timeEl) {
                    timeEl.textContent = '';
                }
            } else if (stopStatus === 'arrived') {
                dot.style.backgroundColor = '#22C55E'; // Green
                if (timeEl) {
                    timeEl.textContent = 'Arrived';
                    timeEl.style.color = '#4B5563';
                    timeEl.style.fontWeight = '700';
                }
            } else if (stopStatus === 'departed') {
                dot.style.backgroundColor = '#3B82F6'; // Blue
                if (timeEl) {
                    timeEl.textContent = 'Departed';
                    timeEl.style.fontWeight = '700';
                    timeEl.style.color = '#3B82F6';
                }
            } else if (stopStatus === 'upcoming') {
                dot.style.backgroundColor = '#C9CED6'; // Gray
                if (idx === nextStopIndex && status !== 'offline') {
                    if (timeEl) {
                        timeEl.textContent = etaMinutes > 0 ? `ETA: ${etaMinutes} min` : 'Arriving';
                        timeEl.style.color = '#4B5563';
                    }
                }
            }
        }

        if (headingEl) {
            if (idx === nextStopIndex && status !== 'completed' && status !== 'offline') {
                headingEl.classList.remove('hidden');
                headingEl.textContent = 'Heading towards here';
            } else {
                headingEl.classList.add('hidden');
            }
        }
    });
}

// ----------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------

function updateTrackingLineHeight() {
    const track = document.getElementById('tracking-track');
    if (!track || stopItemsEl.length === 0) return;
    const totalStops = stopItemsEl.length;
    const stopSpacing = 80;
    const extraBottomPadding = 86;
    const lineHeight = ((totalStops - 1) * stopSpacing) + extraBottomPadding;
    track.style.height = `${lineHeight}px`;
}

function renderStops(stops) {
    const stopsList = document.getElementById('stops-list');
    if (!stopsList) return;
    
    stopsList.innerHTML = '';
    
    if (!stops || stops.length === 0) {
        stopsList.innerHTML = '<div style="padding: 20px; text-align: center; color: #666; font-size: 14px;">No stops configured for this route.</div>';
        if (busTrackerEl) busTrackerEl.style.display = 'none';
        return;
    }

    stops.forEach((stop, index) => {
        const isFirst = index === 0;
        const html = `
          <div class="stop-item ${isFirst ? 'active' : ''}">
            <div class="stop-icon-wrapper">
              <div class="tracking-dot ${isFirst ? 'green' : 'gray'}"></div>
            </div>
            <div class="stop-info">
              ${isFirst ? '<span class="boarding-text">Your Boarding Stop</span>' : ''}
              <div class="stop-name-row">
                <div class="stop-title-wrap">
                  <div class="heading-towards hidden">Heading towards</div>
                  <span class="stop-name ${isFirst ? 'highlight' : ''}">${stop.stopName || 'Unknown Stop'}</span>
                </div>
                <span class="stop-time"></span>
              </div>
            </div>
          </div>
        `;
        stopsList.insertAdjacentHTML('beforeend', html);
    });

    // Update global array for animations
    stopItemsEl = Array.from(document.querySelectorAll('#stops-list .stop-item'));
    routeStops = stops.map(s => ({ lat: parseFloat(s.latitude) || 0, lng: parseFloat(s.longitude) || 0 }));
    
    updateTrackingLineHeight();
}

function startBusTracking(busDocId) {
    if (unsubscribeBus) unsubscribeBus();

    busTrackerEl = document.getElementById('dynamic-bus');
    if (!busTrackerEl) return;

    console.log(`[DEBUG USER] Attaching onSnapshot to buses/${busDocId}`);
    const busRef = doc(firestore, 'buses', busDocId);
    
    unsubscribeBus = onSnapshot(busRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            console.log("[DEBUG USER] Received bus data:", data);
            
            // Re-render stops if they have changed or are not rendered yet
            if (stopItemsEl.length === 0 && data.stops) {
                renderStops(data.stops);
            }
            
            const now = Date.now();
            const lastUpdated = data.lastUpdated?.toMillis?.();
            
            let isOperatingHours = false;
            if (data.stops && data.stops.length > 0) {
                const currentTime = new Date();
                const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
                const firstStop = data.stops[0];
                const lastStop = data.stops[data.stops.length - 1];
                
                if (firstStop.scheduledArrival && lastStop.scheduledArrival) {
                    const firstTimeParts = firstStop.scheduledArrival.split(':').map(Number);
                    const firstMinutes = firstTimeParts[0] * 60 + firstTimeParts[1];
                    
                    const lastTimeParts = lastStop.scheduledArrival.split(':').map(Number);
                    const lastMinutes = lastTimeParts[0] * 60 + lastTimeParts[1];
                    
                    if (currentMinutes >= firstMinutes && currentMinutes <= lastMinutes) {
                        isOperatingHours = true;
                    }
                }
            }

            if (!lastUpdated || (now - lastUpdated > 20000)) {
                data.status = 'offline';
            }

            trackingState.lastFirebaseUpdate = Date.now();
            trackingState.offline = data.status === 'offline';
            
            updateStatusBanner(data.status, data.delayMinutes, isOperatingHours);
            updateArrowAnimation(data.status);
            
            if (stopItemsEl.length > 0) {
                busTrackerEl.style.display = 'flex';
                busTrackerEl.style.opacity = '1';
                calculateTargetY(data.currentStopIndex || 0, data.nextStopIndex || 1, data.lat || 0, data.lng || 0);
                updateStopStyles(data.currentStopIndex || 0, data.nextStopIndex || 1, data.status, data.etaMinutes || 0);
            }
        }
    });

    // Offline watcher
    setInterval(() => {
        if (trackingState.lastFirebaseUpdate && (Date.now() - trackingState.lastFirebaseUpdate) > 20000) {
            if (!trackingState.offline) {
                trackingState.offline = true;
                // For the watcher, we'll assume isOperatingHours is true by default so it shows offline, 
                // since we don't have the full data object here easily. 
                updateStatusBanner('offline', 0, true);
                updateArrowAnimation("offline");
            }
        }
    }, 5000);
}

export function initLiveTracking() {
    busTrackerEl = document.getElementById('dynamic-bus');
    
    const auth = getAuth();
    onAuthStateChanged(auth, async (user) => {
        const assignedBusEl = document.getElementById('assigned-bus-number');
        const stopsList = document.getElementById('stops-list');
        
        if (!user) {
            if (assignedBusEl) assignedBusEl.textContent = "N/A";
            if (stopsList) stopsList.innerHTML = '<div style="padding: 20px; text-align: center; color: #666; font-size: 14px;">Please login to view tracking.</div>';
            return;
        }

        try {
            // 1. Fetch user's assigned bus
            let busNum = null;
            const userRef = doc(firestore, 'users', user.uid);
            const userSnap = await getDoc(userRef);
            
            if (userSnap.exists()) {
                const userData = userSnap.data();
                busNum = userData.bus || userData.busNumber || userData['bus no'] || userData.bus_no;
            }
            
            // Fallback check in epass subcollection just in case
            if (!busNum) {
                const epassRef = collection(firestore, `users/${user.uid}/epass`);
                const epassSnap = await getDocs(epassRef);
                if (!epassSnap.empty) {
                    const epassData = epassSnap.docs[0].data();
                    busNum = epassData.bus || epassData.busNumber || epassData['bus no'] || epassData.bus_no;
                }
            }

            if (!busNum) {
                if (assignedBusEl) assignedBusEl.textContent = "None";
                if (stopsList) stopsList.innerHTML = '<div style="padding: 20px; text-align: center; color: #666; font-size: 14px;">No bus assigned to your profile.</div>';
                if (busTrackerEl) busTrackerEl.style.display = 'none';
                return;
            }

            busNum = String(busNum).trim();

            if (assignedBusEl) assignedBusEl.textContent = busNum;

            // 2. Query the buses collection to find the document with this busNumber
            const busesRef = collection(firestore, 'buses');
            const q = query(busesRef, where("busNumber", "==", busNum));
            let busQuerySnap;
            try {
                busQuerySnap = await getDocs(q);
            } catch (err) {
                console.error("Error querying bus:", err);
                return;
            }

            if (busQuerySnap.empty) {
                console.warn(`No bus found in database with busNumber: ${busNum}`);
                // Let's also check for a document literally named bus_XX just as a fallback
                const fallbackRef = doc(firestore, 'buses', `bus_${busNum}`);
                let fallbackSnap;
                try {
                    fallbackSnap = await getDoc(fallbackRef);
                } catch (err) {
                    console.error("Error fetching fallback bus doc:", err);
                    return;
                }
                
                if (fallbackSnap && fallbackSnap.exists()) {
                    startBusTracking(`bus_${busNum}`);
                } else {
                    if (stopsList) stopsList.innerHTML = `<div style="padding: 20px; text-align: center; color: #666; font-size: 14px;">Bus ${busNum} is not currently active.</div>`;
                    if (busTrackerEl) busTrackerEl.style.display = 'none';
                }
                return;
            }

            // 3. Start tracking the found bus document
            const busDoc = busQuerySnap.docs[0];
            const busData = busDoc.data();
            
            // Pre-render stops if they exist statically right now
            if (busData.stops) {
                renderStops(busData.stops);
            }
            
            startBusTracking(busDoc.id);

        } catch (error) {
            console.error("Error loading live tracking:", error);
            if (stopsList) stopsList.innerHTML = '<div style="padding: 20px; text-align: center; color: #EF4444; font-size: 14px;">Error loading bus data: ' + error.message + '</div>';
        }
    });
}

initLiveTracking();
