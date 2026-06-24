import { db } from './firebase-config.js';
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

// ----------------------------------------------------
// STATE & CONFIG
// ----------------------------------------------------

// BASE CONSTANTS
const BASE_STOPS = [
    { id: 1, name: "Guruvareddiyur", lat: 11.6448201, lng: 77.6818277 },
    { id: 2, name: "Kuttaimuniyappan Kovil", lat: 11.5232544, lng: 77.7051012 },
    { id: 3, name: "Rana Nagar", lat: 11.4572704, lng: 77.6909143 },
    { id: 4, name: "Palani Aandavar Temple", lat: 11.4429531, lng: 77.6832342 },
    { id: 5, name: "Nandha Engineering College", lat: 11.2842104, lng: 77.6196129 }
];

// Placeholder schedules
const MORNING_SCHEDULE = ["07:10", "07:20", "07:30", "07:40", "07:50", "08:00"];
const EVENING_SCHEDULE = ["16:50", "17:00", "17:10", "17:20", "17:30"];

const DEBUG_TRACKING = true;

const trackingState = {
    boardingStopIndex: 0, // Kuttaimuniyappan Kovil is now the first stop
    tripType: 'morning', // 'morning' or 'evening'
    tripStatus: 'active', // 'active', 'ended', 'waiting_evening'
    currentLocation: null,
    lastLocation: null,
    lastLocationTime: 0,
    speed: 0,
    routeDirection: 1, // 1 for morning, -1 for evening
    stops: [], // Active route stops

    // API Throttling
    lastApiCallTime: 0,
    lastApiCallLocation: null,

    // UI Animation State
    gpsBuffer: [],
    currentSegmentIndex: 0,
    progress: 0,
    currentY: 0,
    targetY: 0,
    routePolyline: [],
    routeTotalDistance: 0,
    stopDistances: [],
    polylineDistances: [],

    // New Tracking & Smoother Fields
    lastTravelledDistance: 0,
    smoothedLocation: null,
    lastGpsTime: 0,
    offline: false,
    lastFirebaseUpdate: 0
};

let busTrackerEl = null;
let stopItemsEl = [];
let animationFrameId = null;
let distanceMatrixService = null;
let directionsService = null;
let geometrySpherical = null;

// ----------------------------------------------------
// MATH & ALGORITHMS
// ----------------------------------------------------

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

function getSmoothedLocation(lat, lng) {
    if (!trackingState.smoothedLocation) {
        trackingState.smoothedLocation = { lat, lng };
        return { lat, lng };
    }
    trackingState.smoothedLocation.lat = (trackingState.smoothedLocation.lat * 0.8) + (lat * 0.2);
    trackingState.smoothedLocation.lng = (trackingState.smoothedLocation.lng * 0.8) + (lng * 0.2);
    return trackingState.smoothedLocation;
}

function densifyPolyline(polyline) {
    if (polyline.length >= 100) return polyline;
    let newPolyline = [];
    const factor = Math.ceil(100 / polyline.length) + 1;
    for (let i = 0; i < polyline.length - 1; i++) {
        const p1 = polyline[i];
        const p2 = polyline[i + 1];
        newPolyline.push(p1);
        for (let j = 1; j < factor; j++) {
            newPolyline.push({
                lat: p1.lat + (p2.lat - p1.lat) * (j / factor),
                lng: p1.lng + (p2.lng - p1.lng) * (j / factor)
            });
        }
    }
    newPolyline.push(polyline[polyline.length - 1]);
    return newPolyline;
}

// ----------------------------------------------------
// TRIP LIFECYCLE MANAGEMENT
// ----------------------------------------------------

function buildRoute(tripType) {
    let newStops = [];
    if (tripType === 'morning') {
        newStops = BASE_STOPS.map((stop, i) => ({
            ...stop,
            scheduledArrival: MORNING_SCHEDULE[i],
            status: 'upcoming', arrivedAt: null, departedAt: null, etaMinutes: null, delayMinutes: 0
        }));
        trackingState.routeDirection = 1;
    } else {
        // Evening route is reversed
        const reversedBase = [...BASE_STOPS].reverse();
        newStops = reversedBase.map((stop, i) => ({
            ...stop,
            scheduledArrival: EVENING_SCHEDULE[i],
            status: 'upcoming', arrivedAt: null, departedAt: null, etaMinutes: null, delayMinutes: 0
        }));
        trackingState.routeDirection = -1;
    }
    trackingState.stops = newStops;

    // Update UI DOM stop names to match direction
    stopItemsEl.forEach((el, idx) => {
        if (idx < trackingState.stops.length) {
            const nameEl = el.querySelector('.stop-name');
            if (nameEl) nameEl.textContent = trackingState.stops[idx].name;

            const timeEl = el.querySelector('.stop-time');
            if (timeEl) timeEl.textContent = '';
        }
    });
}

function checkTripLifecycle() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentTimeMinutes = hours * 60 + minutes;

    // 12:00 PM = 720 mins. 4:50 PM = 1010 mins.

    if (trackingState.tripType === 'morning' && currentTimeMinutes >= 720 && currentTimeMinutes < 1010) {
        // After 12 PM, prepare evening route
        trackingState.tripType = 'evening';
        trackingState.tripStatus = 'waiting_evening_trip';
        buildRoute('evening');
        updateStatusBanner("Trip Ended. Next trip is on evening 4:50 PM");
        return;
    }

    if (trackingState.tripType === 'evening' && trackingState.tripStatus === 'waiting_evening_trip' && currentTimeMinutes >= 1010) {
        // Start evening trip
        trackingState.tripStatus = 'active';
        updateStatusBanner("Live tracking active", "green");
    }
}

// ----------------------------------------------------
// CORE TRACKING ENGINE
// ----------------------------------------------------

async function fetchRoutePolyline() {
    if (!directionsService || trackingState.stops.length < 2) return;

    const origin = trackingState.stops[0];
    const destination = trackingState.stops[trackingState.stops.length - 1];
    const waypoints = trackingState.stops.slice(1, -1).map(stop => ({
        location: new window.google.maps.LatLng(stop.lat, stop.lng),
        stopover: true
    }));

    return new Promise((resolve) => {
        directionsService.route({
            origin: new window.google.maps.LatLng(origin.lat, origin.lng),
            destination: new window.google.maps.LatLng(destination.lat, destination.lng),
            waypoints: waypoints,
            travelMode: window.google.maps.TravelMode.DRIVING
        }, (response, status) => {
            if (status === 'OK' && response.routes && response.routes[0]) {
                const route = response.routes[0];
                const overviewPath = route.overview_path;
                let decoded = overviewPath.map(p => ({ lat: p.lat(), lng: p.lng() }));
                trackingState.routePolyline = densifyPolyline(decoded);

                trackingState.routeTotalDistance = 0;
                trackingState.stopDistances = [];
                let currentDistance = 0;

                trackingState.stopDistances.push(0);
                for (let i = 0; i < route.legs.length; i++) {
                    currentDistance += route.legs[i].distance.value;
                    trackingState.stopDistances.push(currentDistance);
                }
                trackingState.routeTotalDistance = currentDistance;

                trackingState.polylineDistances = [0];
                let polyDist = 0;
                for (let i = 1; i < trackingState.routePolyline.length; i++) {
                    const p1 = new window.google.maps.LatLng(trackingState.routePolyline[i - 1].lat, trackingState.routePolyline[i - 1].lng);
                    const p2 = new window.google.maps.LatLng(trackingState.routePolyline[i].lat, trackingState.routePolyline[i].lng);
                    polyDist += geometrySpherical.computeDistanceBetween(p1, p2);
                    trackingState.polylineDistances.push(polyDist);
                }
            }
            resolve();
        });
    });
}

function processNewGPSPoint(rawLat, rawLng) {
    checkTripLifecycle();

    const nowTime = Date.now();
    const smoothed = getSmoothedLocation(rawLat, rawLng);
    const { lat, lng } = smoothed;

    const busPos = new window.google.maps.LatLng(lat, lng);

    let minDistance = Infinity;
    let nearestIndex = 0;

    if (trackingState.routePolyline && trackingState.routePolyline.length > 0) {
        trackingState.routePolyline.forEach((point, index) => {
            const pLatLng = new window.google.maps.LatLng(point.lat, point.lng);
            const dist = geometrySpherical.computeDistanceBetween(busPos, pLatLng);
            if (dist < minDistance) {
                minDistance = dist;
                nearestIndex = index;
            }
        });
    }

    let travelledDistance = 0;
    if (trackingState.polylineDistances && trackingState.polylineDistances.length > 0) {
        travelledDistance = trackingState.polylineDistances[nearestIndex];
    } else {
        travelledDistance = haversineDistance(trackingState.stops[0].lat, trackingState.stops[0].lng, lat, lng);
    }

    // Detect if driver app jumped backwards (manual simulator)
    if (travelledDistance < trackingState.lastTravelledDistance - 200) {
        trackingState.lastTravelledDistance = travelledDistance;
        trackingState.tripStatus = 'active';
        
        // Reset all stops to upcoming
        trackingState.stops.forEach(s => {
            s.status = 'upcoming';
            s.arrivedAt = null;
            s.departedAt = null;
            if (s.flags) {
                s.flags = { hasTriggered300m: false, hasTriggered100m: false, hasTriggeredArrival: false };
            }
        });
        
        const busTrackerEl = document.getElementById('dynamic-bus');
        if (busTrackerEl) busTrackerEl.style.display = 'flex';
        
        if (typeof updateStatusBanner === 'function') {
            updateStatusBanner("Trip Started", "#22C55E");
        }
    } else if (travelledDistance < trackingState.lastTravelledDistance) {
        // Minor jitter, ignore
        travelledDistance = trackingState.lastTravelledDistance;
    } else {
        trackingState.lastTravelledDistance = travelledDistance;
    }

    if (trackingState.tripStatus !== 'active') return;

    trackingState.currentLocation = { lat, lng };

    // Calculate Speed
    if (trackingState.lastLocation && trackingState.lastLocationTime) {
        const distMoved = haversineDistance(trackingState.lastLocation.lat, trackingState.lastLocation.lng, lat, lng); // meters
        const timeDiffSec = (nowTime - trackingState.lastLocationTime) / 1000;
        if (timeDiffSec > 0) {
            const speedMps = distMoved / timeDiffSec;
            trackingState.speed = speedMps * 3.6; // km/h
        }
    }
    trackingState.lastLocation = { lat, lng };
    trackingState.lastLocationTime = nowTime;

    let bestSegment = 0;
    if (trackingState.stopDistances && trackingState.stopDistances.length > 0) {
        for (let i = 0; i < trackingState.stopDistances.length - 1; i++) {
            if (travelledDistance >= trackingState.stopDistances[i] && travelledDistance <= trackingState.stopDistances[i + 1]) {
                bestSegment = i;
                break;
            } else if (travelledDistance > trackingState.stopDistances[i + 1] && i === trackingState.stopDistances.length - 2) {
                bestSegment = i;
            }
        }
    }
    trackingState.currentSegmentIndex = bestSegment;

    const fromStop = trackingState.stops[bestSegment];
    const toStop = trackingState.stops[bestSegment + 1] || trackingState.stops[trackingState.stops.length - 1];

    let startStopDistance = 0;
    let endStopDistance = 1;
    if (trackingState.stopDistances && trackingState.stopDistances.length > 0) {
        startStopDistance = trackingState.stopDistances[bestSegment];
        endStopDistance = trackingState.stopDistances[Math.min(bestSegment + 1, trackingState.stopDistances.length - 1)];
    }

    let segProgress = 0;
    if (endStopDistance > startStopDistance) {
        segProgress = (travelledDistance - startStopDistance) / (endStopDistance - startStopDistance);
    }
    trackingState.progress = Math.max(0, Math.min(1, segProgress));

    const currentTimeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    let distFromStart = 0;
    let distToEnd = 0;

    if (geometrySpherical) {
        distFromStart = geometrySpherical.computeDistanceBetween(busPos, new window.google.maps.LatLng(fromStop.lat, fromStop.lng));
        distToEnd = geometrySpherical.computeDistanceBetween(busPos, new window.google.maps.LatLng(toStop.lat, toStop.lng));
    } else {
        distFromStart = haversineDistance(fromStop.lat, fromStop.lng, lat, lng);
        distToEnd = haversineDistance(toStop.lat, toStop.lng, lat, lng);
    }

    // Custom Boarding Stop Logic (Index 1)
    if (trackingState.tripType === 'morning') {
        const boardingStop = trackingState.stops[trackingState.boardingStopIndex];
        if (!boardingStop.flags) boardingStop.flags = { hasTriggered300m: false, hasTriggered100m: false, hasTriggeredArrival: false };

        let distToBoarding = 0;
        if (geometrySpherical) {
            distToBoarding = geometrySpherical.computeDistanceBetween(busPos, new window.google.maps.LatLng(boardingStop.lat, boardingStop.lng));
        } else {
            distToBoarding = haversineDistance(lat, lng, boardingStop.lat, boardingStop.lng);
        }

        if (boardingStop.status === 'upcoming') {
            if (distToBoarding <= 300 && distToBoarding > 100) {
                if (!boardingStop.flags.hasTriggered300m) {
                    updateStatusBanner("Bus arriving in 1-2 minutes", "#3B82F6");
                    boardingStop.flags.hasTriggered300m = true;
                }
            } else if (distToBoarding <= 100 && distToBoarding > 35) {
                if (!boardingStop.flags.hasTriggered100m) {
                    updateStatusBanner("Bus is nearby", "#3B82F6");
                    boardingStop.flags.hasTriggered100m = true;
                }
            } else if (distToBoarding <= 35) {
                if (!boardingStop.flags.hasTriggeredArrival) {
                    boardingStop.status = 'arrived';
                    boardingStop.arrivedAt = currentTimeStr;
                    updateStatusBanner("Bus has arrived", "#10B981");
                    if (navigator.vibrate) navigator.vibrate(500);
                    boardingStop.flags.hasTriggeredArrival = true;
                }
            } else {
                updateStatusBanner("Live tracking active", "green");
            }
        } else if (boardingStop.status === 'arrived') {
            updateStatusBanner("Bus has arrived", "#10B981");
            if (distToBoarding > 60) {
                boardingStop.status = 'departed';
                boardingStop.departedAt = currentTimeStr;
                updateStatusBanner("Bus departed from your stop", "#64748B");
                boardingStop.flags = { hasTriggered300m: false, hasTriggered100m: false, hasTriggeredArrival: false };
            }
        }
    }

    if (fromStop.id !== trackingState.boardingStopIndex || trackingState.tripType !== 'morning') {
        if (fromStop.status === 'upcoming' && distFromStart <= 35) {
            fromStop.status = 'arrived';
            fromStop.arrivedAt = currentTimeStr;
        }
        if (fromStop.status === 'arrived' && distFromStart > 60) {
            fromStop.status = 'departed';
            fromStop.departedAt = currentTimeStr;
        }
        if (fromStop.status === 'upcoming' && distFromStart > 60 && trackingState.progress > 0.1) {
            fromStop.status = 'departed';
            fromStop.arrivedAt = currentTimeStr;
            fromStop.departedAt = currentTimeStr;
        }
    }

    if (toStop.id !== trackingState.boardingStopIndex || trackingState.tripType !== 'morning') {
        if (toStop.status === 'upcoming' && distToEnd <= 35) {
            toStop.status = 'arrived';
            toStop.arrivedAt = currentTimeStr;
        }
    }

    const finalStop = trackingState.stops[trackingState.stops.length - 1];
    let distToFinal = 0;
    if (geometrySpherical) {
        distToFinal = geometrySpherical.computeDistanceBetween(busPos, new window.google.maps.LatLng(finalStop.lat, finalStop.lng));
    } else {
        distToFinal = haversineDistance(lat, lng, finalStop.lat, finalStop.lng);
    }
    if (distToFinal <= 35 && finalStop.status === 'upcoming') {
        finalStop.status = 'arrived';
        finalStop.arrivedAt = currentTimeStr;
        trackingState.tripStatus = 'ended';
        updateStatusBanner("Trip completed", "#64748B");

        if (busTrackerEl) busTrackerEl.style.display = 'none';
        updateStopStyles();
        return;
    }

    let shouldCallApi = false;
    if (trackingState.lastApiCallTime === 0) shouldCallApi = true;
    else if ((nowTime - trackingState.lastApiCallTime) > 30000) shouldCallApi = true;
    else if (trackingState.lastApiCallLocation) {
        const distFromLastCall = haversineDistance(trackingState.lastApiCallLocation.lat, trackingState.lastApiCallLocation.lng, lat, lng);
        if (distFromLastCall > 100) shouldCallApi = true;
    }

    if (shouldCallApi && distanceMatrixService) {
        calculateETA(lat, lng);
        trackingState.lastApiCallTime = nowTime;
        trackingState.lastApiCallLocation = { lat, lng };
    } else {
        const boardingStop = trackingState.stops[trackingState.boardingStopIndex];
        if (boardingStop && boardingStop.status === 'upcoming') {
            let distToBoarding = 0;
            if (geometrySpherical) {
                distToBoarding = geometrySpherical.computeDistanceBetween(busPos, new window.google.maps.LatLng(boardingStop.lat, boardingStop.lng));
            } else {
                distToBoarding = haversineDistance(lat, lng, boardingStop.lat, boardingStop.lng);
            }
            if (trackingState.speed > 0) {
                const timeSecs = distToBoarding / (trackingState.speed / 3.6);
                const etaMins = Math.ceil(timeSecs / 60);
                if (typeof updateMainEta === 'function') updateMainEta(`${etaMins} mins remaining`);
                if (typeof updateUpdatesBox === 'function') updateUpdatesBox(`ETA to Boarding Stop: ${etaMins} min`);
            } else {
                if (typeof updateMainEta === 'function') updateMainEta("Bus stopped");
            }
        }

        updateStopStyles();
    }

    calculateTargetY();

    if (DEBUG_TRACKING) {
        console.table({
            rawLat,
            rawLng,
            smoothedLat: lat,
            smoothedLng: lng,
            nearestIndex,
            travelledDistance,
            progress: trackingState.progress,
            currentSegment: trackingState.currentSegmentIndex,
            busY: trackingState.targetY,
            offline: trackingState.offline || false
        });
    }

    updateArrowAnimation();
}

// ----------------------------------------------------
// GOOGLE ETA & DELAY LOGIC
// ----------------------------------------------------

function calculateETA(lat, lng) {
    // Find all upcoming stops
    const upcomingDestinations = [];
    const upcomingIndices = [];

    trackingState.stops.forEach((stop, idx) => {
        if (stop.status === 'upcoming') {
            upcomingDestinations.push({ lat: stop.lat, lng: stop.lng });
            upcomingIndices.push(idx);
        }
    });

    if (upcomingDestinations.length === 0) return;

    distanceMatrixService.getDistanceMatrix({
        origins: [{ lat, lng }],
        destinations: upcomingDestinations,
        travelMode: 'DRIVING',
        drivingOptions: {
            departureTime: new Date(),
            trafficModel: 'bestguess'
        }
    }, (response, status) => {
        if (status === 'OK' && response.rows[0]) {
            const elements = response.rows[0].elements;

            elements.forEach((element, i) => {
                if (element.status === 'OK') {
                    // duration in traffic (seconds)
                    const durationSec = element.duration_in_traffic ? element.duration_in_traffic.value : element.duration.value;
                    const etaMins = Math.ceil(durationSec / 60);

                    const stopIndex = upcomingIndices[i];
                    const stop = trackingState.stops[stopIndex];

                    stop.etaMinutes = etaMins;

                    // Calculate Actual Arrival
                    const now = new Date();
                    now.setMinutes(now.getMinutes() + etaMins);
                    const actualTimeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                    stop.actualArrival = actualTimeStr;

                    // Calculate Delay
                    // Parse scheduled vs actual into comparable minutes
                    const parseHM = (timeStr) => {
                        const [time, period] = timeStr.split(' ');
                        let [h, m] = time.split(':').map(Number);
                        if (period === 'PM' && h !== 12) h += 12;
                        if (period === 'AM' && h === 12) h = 0;
                        return h * 60 + m;
                    };

                    const schedMins = parseHM(stop.scheduledArrival);
                    const actualMins = parseHM(stop.actualArrival);

                    stop.delayMinutes = Math.max(0, actualMins - schedMins);
                }
            });
            updateStopStyles();
        }
    });
}

function updateArrowAnimation() {
    if (!busTrackerEl) return;
    const arrow = busTrackerEl.querySelector('.tracking-arrow');
    if (!arrow) return;

    const isRunning = trackingState.tripStatus === 'active' &&
        !trackingState.offline &&
        trackingState.speed > 0;

    if (isRunning) {
        arrow.classList.add('arrow-animating');
    } else {
        arrow.classList.remove('arrow-animating');
    }
}

function updateStatusBanner() {
    const statusEl = document.getElementById('bus-status');
    if (statusEl) {
        if (trackingState.offline) {
            statusEl.textContent = "Bus is in halt";
            statusEl.style.color = "#EF4444";
            statusEl.style.textShadow = "none";
        } else {
            statusEl.textContent = "Trip Started";
            statusEl.style.color = "#10b981";
            statusEl.style.textShadow = "0 0 8px rgba(16,185,129,0.18)";
        }
    }
}

// ----------------------------------------------------
// UI ANIMATION (60fps Interpolation)
// ----------------------------------------------------

function calculateTargetY() {
    if (!busTrackerEl || stopItemsEl.length === 0) return;

    const fromDOM = stopItemsEl[trackingState.currentSegmentIndex];
    const toDOM = stopItemsEl[Math.min(trackingState.currentSegmentIndex + 1, stopItemsEl.length - 1)];

    if (fromDOM && toDOM) {
        const fromY = fromDOM.offsetTop + 12;
        const toY = toDOM.offsetTop + 12;
        trackingState.targetY = fromY + ((toY - fromY) * trackingState.progress);

        let updateInterval = 2000;
        if (trackingState.lastGpsTime) {
            const diff = Date.now() - trackingState.lastGpsTime;
            if (diff > 500 && diff < 10000) {
                updateInterval = diff;
            }
        }
        trackingState.lastGpsTime = Date.now();

        const animDuration = Math.min(updateInterval * 0.8 / 1000, 1.8).toFixed(2);
        busTrackerEl.style.transition = `transform ${animDuration}s linear`;
        busTrackerEl.style.transform = `translate3d(0, ${trackingState.targetY}px, 0)`;
        busTrackerEl.style.display = 'flex';
    }
}

function updateStopStyles() {
    if (trackingState.tripStatus !== 'active') return;

    stopItemsEl.forEach((el, idx) => {
        if (idx >= trackingState.stops.length) return;

        const stopData = trackingState.stops[idx];
        const dot = el.querySelector('.tracking-dot');
        const timeEl = el.querySelector('.stop-time');
        const headingEl = el.querySelector('.heading-towards');
        const nameEl = el.querySelector('.stop-name');

        // Clean up old stop-time
        if (timeEl) timeEl.textContent = '';

        // Handle ETA subtitle
        let etaSubtitle = el.querySelector('.eta-subtitle');
        if (!etaSubtitle && nameEl && nameEl.parentNode) {
            etaSubtitle = document.createElement('div');
            etaSubtitle.className = 'eta-subtitle';
            etaSubtitle.style.fontSize = '14px';
            etaSubtitle.style.color = '#6B7280';
            etaSubtitle.style.marginTop = '2px';
            etaSubtitle.style.fontWeight = '600';
            nameEl.parentNode.appendChild(etaSubtitle);
        }

        if (etaSubtitle) {
            etaSubtitle.textContent = ''; // Reset
            etaSubtitle.style.fontWeight = '600'; // Default bold
            etaSubtitle.style.fontSize = '14px';  // Default size
            etaSubtitle.style.color = '#6B7280';  // Default gray
            etaSubtitle.style.lineHeight = 'normal'; // Default line height
        }

        if (timeEl) {
            timeEl.textContent = ''; // Reset right side text
            timeEl.style.fontSize = '14px';
            timeEl.style.fontWeight = '600';
            timeEl.style.color = '#6B7280';
        }

        if (dot) {
            dot.className = 'tracking-dot';

            if (stopData.status === 'upcoming') {
                dot.style.backgroundColor = '#C9CED6';
                if (etaSubtitle && stopData.etaMinutes !== null) {
                    if (stopData.etaMinutes <= 0) {
                        if (timeEl) {
                            timeEl.textContent = 'Arrived';
                            timeEl.style.color = '#4B5563';
                            timeEl.style.fontWeight = '700';
                            timeEl.style.fontSize = '16px';
                        }
                    }
                }
            } else if (stopData.status === 'arrived') {
                dot.style.backgroundColor = '#22C55E';
                if (timeEl) {
                    timeEl.textContent = 'Arrived';
                    timeEl.style.color = '#4B5563';
                    timeEl.style.fontWeight = '700';
                    timeEl.style.fontSize = '16px';
                }
                if (etaSubtitle && stopData.arrivedAt) {
                    etaSubtitle.textContent = `Arrived at ${stopData.arrivedAt}`;
                }
            } else if (stopData.status === 'departed') {
                dot.style.backgroundColor = '#3B82F6';
                if (timeEl) {
                    timeEl.textContent = 'Departed';
                    timeEl.style.fontWeight = '700';
                    timeEl.style.fontSize = '14px';
                    timeEl.style.color = '#3B82F6';
                }
                if (etaSubtitle && stopData.departedAt) {
                    etaSubtitle.textContent = `Departed at ${stopData.departedAt}`;
                }
            }
        }

        if (headingEl) {
            const firstUpcomingIdx = trackingState.stops.findIndex(s => s.status === 'upcoming');
            if (idx === firstUpcomingIdx && idx !== 0) {
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

    // Dynamic Height Logic
    const totalStops = stopItemsEl.length;
    const stopSpacing = 80; // Vertical gap between stop markers
    const extraBottomPadding = 86; // Accounts for 56px top offset + 30px below last stop

    // Formula: ((totalStops - 1) * stopSpacing) + extraBottomPadding
    const lineHeight = ((totalStops - 1) * stopSpacing) + extraBottomPadding;
    track.style.height = `${lineHeight}px`;
}

export async function initLiveTracking() {
    busTrackerEl = document.getElementById('dynamic-bus');
    stopItemsEl = Array.from(document.querySelectorAll('#stops-list .stop-item'));

    if (!busTrackerEl || stopItemsEl.length === 0) return;

    // Set dynamic height of vertical line
    updateTrackingLineHeight();

    // Wait for Google Maps
    while (!window.google || !window.google.maps) {
        await new Promise(r => setTimeout(r, 100));
    }

    await window.google.maps.importLibrary("geometry");
    await window.google.maps.importLibrary("routes");

    distanceMatrixService = new window.google.maps.DistanceMatrixService();
    directionsService = new window.google.maps.DirectionsService();
    geometrySpherical = window.google.maps.geometry.spherical;

    // Init state
    buildRoute('morning');
    checkTripLifecycle();

    await fetchRoutePolyline();

    calculateTargetY();
    trackingState.currentY = trackingState.targetY;
    busTrackerEl.style.transform = `translate3d(0, ${trackingState.currentY}px, 0)`;

    if (db) {
        const busRef = ref(db, 'bus_live/BUS_3');
        onValue(busRef, (snapshot) => {
            const data = snapshot.val();
            if (data && data.isOnline) {
                trackingState.lastFirebaseUpdate = Date.now();
                processNewGPSPoint(data.latitude, data.longitude);
            }
        });

        setInterval(() => {
            if (trackingState.lastFirebaseUpdate && (Date.now() - trackingState.lastFirebaseUpdate) > 15000) {
                if (!trackingState.offline) {
                    trackingState.offline = true;
                    updateStatusBanner("Bus is offline", "#EF4444");
                }
            } else {
                if (trackingState.offline) {
                    trackingState.offline = false;
                    updateStatusBanner("Live tracking active", "green");
                }
            }
            updateArrowAnimation();
        }, 5000);
    }
}

// Module scripts are deferred by default, so DOM is already ready
initLiveTracking();
