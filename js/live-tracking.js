import { firestore } from './firebase-config.js';
import { doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

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
let routeStops = [
    { lat: 11.6452378, lng: 77.6818465 }, // Guruvareddiyur
    { lat: 11.5232544, lng: 77.7051012 }, // Kuttaimuniyappan Kovil
    { lat: 11.4572704, lng: 77.6909143 }, // Rana Nagar
    { lat: 11.4429531, lng: 77.6832342 }, // Palani Aandavar Temple
    { lat: 11.2842104, lng: 77.6196129 }  // Nandha Engineering College
];

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

function updateStatusBanner(status, delayMinutes) {
    const statusEl = document.getElementById('bus-status');
    if (!statusEl) return;
    
    if (trackingState.offline) {
        statusEl.textContent = "Bus Offline";
        statusEl.style.color = "#EF4444";
        statusEl.style.textShadow = "none";
        return;
    }

    if (status === 'moving') {
        statusEl.textContent = delayMinutes > 0 ? `Delayed by ${delayMinutes} min` : "Bus in movement";
        statusEl.style.color = delayMinutes > 0 ? "#EAB308" : "#10b981";
        statusEl.style.textShadow = delayMinutes > 0 ? "none" : "0 0 8px rgba(16,185,129,0.18)";
    } else if (status === 'stopped') {
        statusEl.textContent = "Bus stopped";
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

            if (stopStatus === 'arrived') {
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

export function initLiveTracking() {
    busTrackerEl = document.getElementById('dynamic-bus');
    stopItemsEl = Array.from(document.querySelectorAll('#stops-list .stop-item'));

    if (!busTrackerEl || stopItemsEl.length === 0) return;

    updateTrackingLineHeight();

    if (firestore) {
        console.log("[DEBUG USER] Attaching onSnapshot to buses/bus_32");
        const busRef = doc(firestore, 'buses', 'bus_32');
        onSnapshot(busRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                console.log("[DEBUG USER] Received bus data:", data);
                
                // Timestamp freshness check (Step 9)
                const now = Date.now();
                const lastUpdated = data.lastUpdated?.toMillis?.() || Date.now();
                console.log(`[DEBUG USER] Time diff: ${now - lastUpdated}ms`);
                
                // Update Debug Panel (Step 12)
                const dListener = document.getElementById('debug-listener');
                const dStatus = document.getElementById('debug-status');
                const dLatlng = document.getElementById('debug-latlng');
                const dUpdate = document.getElementById('debug-lastupdate');
                if (dListener) dListener.textContent = 'Listener: Connected (Active)';
                if (dStatus) dStatus.textContent = `Status: ${data.status}`;
                if (dLatlng) dLatlng.textContent = `Location: ${data.lat?.toFixed(5)}, ${data.lng?.toFixed(5)}`;
                if (dUpdate) dUpdate.textContent = `Last Update: ${Math.round((now - lastUpdated)/1000)}s ago`;

                if (now - lastUpdated > 20000) {
                    data.status = 'offline';
                    console.warn("[DEBUG USER] Data is stale (>20s). Setting status to offline.");
                }

                trackingState.lastFirebaseUpdate = Date.now();
                trackingState.offline = data.status === 'offline';
                
                updateStatusBanner(data.status, data.delayMinutes);
                updateArrowAnimation(data.status);
                
                if (data.status !== 'offline') {
                    calculateTargetY(data.currentStopIndex, data.nextStopIndex, data.lat, data.lng);
                    updateStopStyles(data.currentStopIndex, data.nextStopIndex, data.status, data.etaMinutes);
                }
            } else {
                console.error("[DEBUG USER] Bus document not found in Firestore!");
                const dListener = document.getElementById('debug-listener');
                if (dListener) dListener.textContent = 'Listener: Document Not Found';
            }
        }, (error) => {
            console.error("[DEBUG USER] onSnapshot error:", error);
            const dListener = document.getElementById('debug-listener');
            if (dListener) dListener.textContent = `Listener: ERROR (${error.code || error.message})`;
        });

        // Offline watcher (20 seconds without update)
        setInterval(() => {
            if (trackingState.lastFirebaseUpdate && (Date.now() - trackingState.lastFirebaseUpdate) > 20000) {
                if (!trackingState.offline) {
                    console.warn("[DEBUG USER] No Firebase updates for 20s. Setting offline locally.");
                    trackingState.offline = true;
                    updateStatusBanner("offline", 0);
                    updateArrowAnimation("offline");
                    
                    const dStatus = document.getElementById('debug-status');
                    if (dStatus) dStatus.textContent = `Status: offline (timeout)`;
                }
            }
        }, 5000);
    } else {
        console.error("[DEBUG USER] firestore is not initialized!");
        const dListener = document.getElementById('debug-listener');
        if (dListener) dListener.textContent = 'Listener: FAILED (No Firestore)';
    }
}

initLiveTracking();
