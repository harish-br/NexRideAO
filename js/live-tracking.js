import { firestore } from './firebase-config.js';
import { doc, getDoc, collection, onSnapshot, getDocs } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';

// Fetch stops from the routes collection using the document ID pattern: route_bus_<busNum>
async function fetchRouteStops(busNum) {
    try {
        const routeDocId = `route_bus_${busNum}`;
        const routeSnap = await getDoc(doc(firestore, 'routes', routeDocId));
        if (routeSnap.exists()) {
            const routeData = routeSnap.data();
            if (Array.isArray(routeData.stops) && routeData.stops.length > 0) {
                console.log('[LiveTracking] Stops loaded from routes collection:', routeDocId);
                return routeData.stops;
            }
        }
    } catch (err) {
        console.warn('[LiveTracking] Could not fetch route stops:', err);
    }
    return null;
}

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
let currentUserStage = '';

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

function calculateTargetY(currentStopIndex, nextStopIndex, lat, lng, busStatus) {
    if (!busTrackerEl || stopItemsEl.length === 0) return;

    const clampedCurrentIdx = Math.max(0, Math.min(currentStopIndex, stopItemsEl.length - 1));
    const fromDOM = stopItemsEl[clampedCurrentIdx];
    const toDOM = stopItemsEl[Math.min(nextStopIndex, stopItemsEl.length - 1)];

    if (fromDOM && toDOM) {
        let progress = 0;

        // When bus is stopped/halted, pin the icon exactly at the current stop (no interpolation)
        if (busStatus === 'stopped' || busStatus === 'offline' || busStatus === 'completed') {
            progress = 0;
        } else if (currentStopIndex < nextStopIndex && nextStopIndex < routeStops.length) {
            // Bus is moving: interpolate using GPS distance between stops
            const fromStop = routeStops[currentStopIndex];
            const toStop = routeStops[nextStopIndex];
            
            if (fromStop && toStop && fromStop.lat && fromStop.lng && toStop.lat && toStop.lng) {
                const totalDist = haversineDistance(fromStop.lat, fromStop.lng, toStop.lat, toStop.lng);
                const distTravelled = haversineDistance(fromStop.lat, fromStop.lng, lat, lng);
                
                progress = totalDist > 0 ? distTravelled / totalDist : 0;
                progress = Math.max(0, Math.min(0.95, progress)); // Cap at 0.95 so bus never overshoots next stop
            }
        } else if (currentStopIndex >= routeStops.length - 1) {
            // At or past last stop — keep at last stop
            progress = 0;
        }

        const fromY = fromDOM.offsetTop + 12;
        const toY = toDOM.offsetTop + 12;
        
        trackingState.targetY = fromY + ((toY - fromY) * progress);

        // Smooth animation when moving, instant snap when halted
        busTrackerEl.style.transition = busStatus === 'moving' ? `transform 1.5s linear` : `transform 0.3s ease`;
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
        const defaultTime = timeEl ? (timeEl.getAttribute('data-default-time') || '') : '';

        // Clean up legacy ETA subtitles if they exist
        const etaSubtitle = el.querySelector('.eta-subtitle');
        if (etaSubtitle) etaSubtitle.remove();

        if (timeEl) {
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
                    timeEl.textContent = defaultTime;
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
                } else {
                    if (timeEl) {
                        timeEl.textContent = defaultTime;
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

function showLiveTrackingSkeleton(count = 5) {
    const stopsList = document.getElementById('stops-list');
    if (!stopsList) return;

    if (busTrackerEl) {
        busTrackerEl.style.display = 'none';
    }

    const widths = [140, 190, 120, 165, 130];
    let skeletonHtml = '';
    for (let i = 0; i < count; i++) {
        const isLast = i === count - 1;
        const w = widths[i % widths.length];
        skeletonHtml += `
          <div class="stop-item-skeleton">
            <div class="stop-icon-wrapper">
              <div class="skeleton-dot skeleton-shimmer"></div>
            </div>
            <div class="stop-info" style="${isLast ? 'border-bottom: none;' : ''}">
              <div class="stop-name-row">
                <div class="skeleton-text skeleton-stop-name skeleton-shimmer" style="width: ${w}px;"></div>
                <div class="skeleton-text skeleton-stop-time skeleton-shimmer"></div>
              </div>
            </div>
          </div>
        `;
    }
    stopsList.innerHTML = skeletonHtml;
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

    let hasBoardingMatch = false;
    if (currentUserStage) {
        hasBoardingMatch = stops.some(s => {
            const name = s.stopName || s.name;
            return name && name.trim().toLowerCase() === currentUserStage.trim().toLowerCase();
        });
    }

    stops.forEach((stop, index) => {
        const isFirst = index === 0;
        let isBoardingStop = false;
        
        const stopNameToDisplay = stop.stopName || stop.name || 'Unknown Stop';
        const scheduledTime = stop.arrivalTime || stop.morningArrival || stop.scheduledArrival || '';
        
        if (hasBoardingMatch) {
            isBoardingStop = stopNameToDisplay !== 'Unknown Stop' && stopNameToDisplay.trim().toLowerCase() === currentUserStage.trim().toLowerCase();
        } else {
            isBoardingStop = index === 0; // fallback if no match
        }

        const html = `
          <div class="stop-item ${isBoardingStop ? 'active' : ''}">
            <div class="stop-icon-wrapper">
              <div class="tracking-dot ${isFirst ? 'green' : 'gray'}"></div>
            </div>
            <div class="stop-info">
              ${isBoardingStop ? '<span class="boarding-text">Your Boarding Stop</span>' : ''}
              <div class="stop-name-row">
                <div class="stop-title-wrap">
                  <div class="heading-towards hidden">Heading towards</div>
                  <span class="stop-name ${isBoardingStop ? 'highlight' : ''}">${stopNameToDisplay}</span>
                </div>
                <span class="stop-time" data-default-time="${scheduledTime}">${scheduledTime}</span>
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

function startBusTracking(busDocId, busNum) {
    if (unsubscribeBus) unsubscribeBus();

    busTrackerEl = document.getElementById('dynamic-bus');
    if (!busTrackerEl) return;

    console.log(`[DEBUG USER] Attaching onSnapshot to buses/${busDocId}`);
    const busRef = doc(firestore, 'buses', busDocId);
    
    unsubscribeBus = onSnapshot(busRef, async (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            console.log("[DEBUG USER] Received bus data:", data);
            
            // Load stops from the routes collection (route_bus_<busNum>) — the authoritative dataset.
            if (stopItemsEl.length === 0) {
                const routeStopsData = await fetchRouteStops(busNum);
                // Fall back to bus doc stops only if route doc has none
                const stopsToRender = routeStopsData || data.stops || [];
                console.log('[LiveTracking] Stops to render:', stopsToRender.length);
                renderStops(stopsToRender);
            }
            
            const now = Date.now();
            const lastUpdated = data.lastUpdated?.toMillis?.();
            
            let isOperatingHours = false;
            const currentTime = new Date();
            const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

            // 1. Check schedule windows if defined
            if (data.schedules) {
                const checkWindow = (dep, arr) => {
                    if (!dep || !arr) return false;
                    const [dh, dm] = dep.split(':').map(Number);
                    const [ah, am] = arr.split(':').map(Number);
                    const startM = dh * 60 + dm;
                    const endM = ah * 60 + am;
                    return currentMinutes >= startM && currentMinutes <= endM;
                };
                if (checkWindow(data.schedules.morningDeparture, data.schedules.morningArrival) ||
                    checkWindow(data.schedules.eveningDeparture, data.schedules.eveningArrival)) {
                    isOperatingHours = true;
                }
            }

            // 2. Fallback to stops sequence arrival times (use rendered routeStops coords)
            if (!isOperatingHours && routeStops.length > 0) {
                // Use data.stops (which came from admin route) for time checks
                const stopsForTime = data.stops && data.stops.length > 0 ? data.stops : [];
                if (stopsForTime.length > 0) {
                    const firstStop = stopsForTime[0];
                    const lastStop = stopsForTime[stopsForTime.length - 1];
                    const firstTime = firstStop.arrivalTime || firstStop.scheduledArrival || firstStop.morningArrival;
                    const lastTime = lastStop.arrivalTime || lastStop.scheduledArrival || lastStop.morningArrival;
                    if (firstTime && lastTime) {
                        const [fh, fm] = firstTime.split(':').map(Number);
                        const [lh, lm] = lastTime.split(':').map(Number);
                        const firstMinutes = fh * 60 + fm;
                        const lastMinutes = lh * 60 + lm;
                        if (currentMinutes >= firstMinutes && currentMinutes <= lastMinutes) {
                            isOperatingHours = true;
                        }
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
                calculateTargetY(data.currentStopIndex || 0, data.nextStopIndex || 1, data.lat || 0, data.lng || 0, data.status);
                updateStopStyles(data.currentStopIndex || 0, data.nextStopIndex || 1, data.status, data.etaMinutes || 0);
            }
        }
    }, (error) => {
        console.error("onSnapshot error:", error);
        // Silently handle the offline error by setting status to offline
        trackingState.offline = true;
        updateStatusBanner('offline', 0, true);
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
    const assignedBusEl = document.getElementById('assigned-bus-number');
    const busStatusEl = document.getElementById('bus-status');
    const stopsList = document.getElementById('stops-list');

    // Show shimmer skeleton placeholders immediately while loading
    if (assignedBusEl && (!assignedBusEl.textContent.trim() || assignedBusEl.innerHTML.includes('skeleton'))) {
        assignedBusEl.innerHTML = '<span class="skeleton-bus-badge skeleton-shimmer"></span>';
    }
    if (busStatusEl && (!busStatusEl.textContent.trim() || busStatusEl.textContent.includes('Bus in halt') || busStatusEl.innerHTML.includes('skeleton'))) {
        busStatusEl.innerHTML = '<span class="skeleton-status-badge skeleton-shimmer"></span>';
    }
    if (stopsList && stopItemsEl.length === 0) {
        showLiveTrackingSkeleton(5);
    }
    
    const auth = getAuth();
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            if (assignedBusEl) assignedBusEl.textContent = "N/A";
            if (busStatusEl) {
                busStatusEl.textContent = "Login required";
                busStatusEl.style.color = "#6B7280";
            }
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
                currentUserStage = userData.stage || '';
            }
            
            // Fallback check in epass subcollection just in case
            if (!busNum || !currentUserStage) {
                const epassRef = collection(firestore, `users/${user.uid}/epass`);
                const epassSnap = await getDocs(epassRef);
                if (!epassSnap.empty) {
                    const epassData = epassSnap.docs[0].data();
                    if (!busNum) busNum = epassData.bus || epassData.busNumber || epassData['bus no'] || epassData.bus_no;
                    if (!currentUserStage) currentUserStage = epassData.stage || '';
                }
            }

            if (!busNum) {
                if (assignedBusEl) assignedBusEl.textContent = "None";
                if (busStatusEl) {
                    busStatusEl.textContent = "No bus assigned";
                    busStatusEl.style.color = "#6B7280";
                }
                if (stopsList) stopsList.innerHTML = '<div style="padding: 20px; text-align: center; color: #666; font-size: 14px;">No bus assigned to your profile.</div>';
                if (busTrackerEl) busTrackerEl.style.display = 'none';
                return;
            }

            busNum = String(busNum).trim();

            if (assignedBusEl) assignedBusEl.textContent = busNum;

            // 2. We don't need a query, the doc ID is just bus_{busNum}
            // By bypassing getDocs(), we avoid throwing a fatal offline error on slow networks!
            startBusTracking(`bus_${busNum}`, busNum);

        } catch (error) {
            console.error("Error loading live tracking:", error);
            // We explicitly do NOT show this error in the UI. 
            // It just silently falls back, leaving the UI clean.
        }
    });
}

initLiveTracking();
