# Integrating Live Bus Tracking into Another App

If you are building another app and want to add the **Live Tracking Option** from NexRide AO, you can do so by copying the HTML, CSS, and JavaScript modules below. This will add the "Live" bottom navigation button, the sliding overlay, the bus timeline, and the real-time Firebase tracking logic.

## 1. Firebase Setup

Make sure your new app has Firebase initialized. You will need a `firebase-config.js` file similar to the one in NexRide AO:

```javascript
// firebase-config.js
import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_ID",
    appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
```

## 2. HTML Structure

Add the following HTML to your main file (e.g., `index.html`). This includes the Live Nav Button and the Bus Tracking Overlay.

```html
<!-- 1. The Bottom Navigation Button (Place inside your <nav>) -->
<div id="live-nav-btn" class="nav-item" style="cursor: pointer;">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M11.97 2C6.44997 2 1.96997 6.48 1.96997 12C1.96997 17.52 6.44997 22 11.97 22C17.49 22 21.97 17.52 21.97 12C21.97 6.48 17.5 2 11.97 2ZM12 16.23C9.65997 16.23 7.76997 14.34 7.76997 12C7.76997 9.66 9.65997 7.77 12 7.77C14.34 7.77 16.23 9.66 16.23 12C16.23 14.34 14.34 16.23 12 16.23Z" />
    </svg>
    <span>Live</span>
</div>

<!-- 2. The Bus Tracking Overlay (Place at the end of your <body>) -->
<div id="bus-overlay" class="bus-overlay" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: #ffffff; z-index: 9999; transform: translateY(100%); pointer-events: none; transition: transform 0.3s ease-in-out; display: flex; flex-direction: column;">
    <!-- Header -->
    <div style="position: relative; width: 100%; height: 64px; display: flex; align-items: center;">
        <button id="close-bus-overlay" style="background: none; border: none; cursor: pointer; padding: 16px 20px;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#333333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
        </button>
    </div>
    
    <!-- Title & Status -->
    <div class="route-header-content" style="padding: 0 24px 10px 24px;">
        <h2 style="margin: 0; font-size: 28px; font-weight: 700; color: #111111;">Assigned Bus: <span id="db-bus-number" style="color: #0E46FF;">32</span></h2>
        <p id="live-bus-status" style="margin: 8px 0 0 0; font-size: 16px; font-weight: 600; color: #666666;">Connecting to GPS...</p>
    </div>

    <!-- Timeline Container -->
    <div class="route-timeline-wrapper" style="flex: 1; overflow-y: auto; padding-bottom: 100px;">
        <div class="route-timeline" id="route-timeline-container" style="position: relative; padding: 20px 24px; margin-left: 20px; border-left: 2px dashed #e2e8f0;">
            <!-- Timeline dynamically populated by JavaScript -->
        </div>
    </div>
</div>
```

## 3. CSS Styles

Add these core styles to your `style.css` to properly render the sliding overlay, the timeline stops, and the bus icon.

```css
/* Overlay transition classes */
.bus-overlay {
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Timeline specific styles */
.route-stop {
    position: relative;
    padding-bottom: 30px;
    padding-left: 20px;
    display: flex;
    align-items: flex-start;
}
.route-stop-dot {
    position: absolute;
    left: -27px; /* Aligns with the dashed border */
    top: 0;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background-color: #9ca3af;
    border: 3px solid #ffffff;
    box-shadow: 0 0 0 2px #e2e8f0;
    z-index: 2;
}
.route-stop.past .route-stop-dot { background-color: #3b82f6; box-shadow: 0 0 0 2px #bfdbfe; }
.route-stop.pickup .route-stop-dot { background-color: #10b981; box-shadow: 0 0 0 2px #a7f3d0; }
.route-stop.future .route-stop-dot { background-color: #e5e7eb; }

/* Timeline Text */
.stop-name {
    font-size: 16px;
    font-weight: 600;
    color: #111827;
}
.route-stop.past .stop-name { color: #6b7280; }

/* Bus Marker Image */
.bus-marker {
    position: absolute;
    left: -40px; /* Aligns correctly on the line */
    width: 40px;
    height: 40px;
    z-index: 10;
    transition: top 1s linear;
}
```

## 4. JavaScript Logic

Add this logic to your main JavaScript file (e.g. `main.js`). This handles opening/closing the overlay, connecting to Firebase, calculating ETAs, and moving the bus marker down the timeline.

```javascript
import { db } from './firebase-config.js';
import { ref, onValue } from 'firebase/database';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Overlay Toggle Logic
    const liveNavBtn = document.getElementById('live-nav-btn');
    const busOverlay = document.getElementById('bus-overlay');
    const closeBusOverlay = document.getElementById('close-bus-overlay');

    if (liveNavBtn && busOverlay) {
        liveNavBtn.addEventListener('click', () => {
            busOverlay.style.transform = 'translateY(0%)';
            busOverlay.style.pointerEvents = 'auto';
        });
        if (closeBusOverlay) {
            closeBusOverlay.addEventListener('click', () => {
                busOverlay.style.transform = 'translateY(100%)';
                busOverlay.style.pointerEvents = 'none';
            });
        }
    }

    // 2. Start Firebase Tracking
    initBusTracking();
});

// Define your Route Stops (coordinates)
const ROUTE_STOPS = [
    { name: "Guruvareddiyur", lat: 11.6448201, lng: 77.6818277 },
    { name: "Kuttaimuniyappan Kovil", lat: 11.5232544, lng: 77.7051012 },
    { name: "Rana Nagar", lat: 11.4572704, lng: 77.6909143 },
    { name: "Palani Aandavar Temple", lat: 11.4429531, lng: 77.6832342 }
];

let currentSegmentIndex = 0;

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const toRad = x => x * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function initBusTracking() {
    renderTimeline(); // Initial draw

    const busRef = ref(db, 'bus_live/BUS_3'); // Make sure BUS_3 matches your database!
    onValue(busRef, (snapshot) => {
        const data = snapshot.val();
        if (!data || !data.isOnline) {
            document.getElementById('live-bus-status').textContent = 'Bus is offline';
            return;
        }

        const { latitude, longitude } = data;
        updateBusState(latitude, longitude);
    });
}

function updateBusState(lat, lng) {
    document.getElementById('live-bus-status').textContent = 'Live tracking active';
    
    // Find closest segment to determine bus progress
    let minDeviation = Infinity;
    for (let i = 0; i < ROUTE_STOPS.length - 1; i++) {
        const d1 = haversineDistance(ROUTE_STOPS[i].lat, ROUTE_STOPS[i].lng, lat, lng);
        const d2 = haversineDistance(lat, lng, ROUTE_STOPS[i + 1].lat, ROUTE_STOPS[i + 1].lng);
        const segLen = haversineDistance(ROUTE_STOPS[i].lat, ROUTE_STOPS[i].lng, ROUTE_STOPS[i + 1].lat, ROUTE_STOPS[i + 1].lng);

        const deviation = (d1 + d2) - segLen;
        if (deviation < minDeviation) {
            minDeviation = deviation;
            currentSegmentIndex = i;
        }
    }

    const fromStop = ROUTE_STOPS[currentSegmentIndex];
    const toStop = ROUTE_STOPS[currentSegmentIndex + 1];
    const segmentTotal = haversineDistance(fromStop.lat, fromStop.lng, toStop.lat, toStop.lng);
    const distFromStart = haversineDistance(fromStop.lat, fromStop.lng, lat, lng);

    let progress = Math.max(0, Math.min(1, distFromStart / segmentTotal));
    
    // Visually update the UI timeline and bus icon
    updateTimelineUI(progress);
}

function renderTimeline() {
    const container = document.getElementById('route-timeline-container');
    container.innerHTML = '';

    ROUTE_STOPS.forEach((stop, idx) => {
        container.innerHTML += \`
            <div class="route-stop future" id="route-stop-\${idx}">
                <div class="route-stop-dot"></div>
                <div class="stop-name">\${stop.name}</div>
            </div>
        \`;
    });

    // Add Bus Icon Marker (Ensure you have a bus.png or subject.png image)
    container.innerHTML += \`
        <div class="bus-marker" id="live-bus-marker">
            <div style="background-color: #3b82f6; width: 24px; height: 24px; border-radius: 50%; color: white; display:flex; align-items:center; justify-content:center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">🚌</div>
        </div>
    \`;
}

function updateTimelineUI(progress) {
    ROUTE_STOPS.forEach((stop, idx) => {
        const el = document.getElementById(\`route-stop-\${idx}\`);
        if (el) {
            el.className = 'route-stop';
            if (idx <= currentSegmentIndex) el.classList.add('past');
            else el.classList.add('future');
        }
    });

    const busMarker = document.getElementById('live-bus-marker');
    const fromEl = document.getElementById(\`route-stop-\${currentSegmentIndex}\`);
    const toEl = document.getElementById(\`route-stop-\${Math.min(currentSegmentIndex + 1, ROUTE_STOPS.length - 1)}\`);

    if (busMarker && fromEl && toEl) {
        const fromY = fromEl.offsetTop;
        const toY = toEl.offsetTop;
        const busY = fromY + (toY - fromY) * progress;
        busMarker.style.top = \`\${busY}px\`;
    }
}
```

By following this guide, you can quickly integrate the real-time Firebase live tracking layout natively into any new application.
