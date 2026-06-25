import { db } from '../js/firebase-config.js';
import { ref, set, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';

// ==========================================
// FIXED ROUTE STOPS
// ==========================================
const routeStops = [
  { name: "Guruvareddiyur", lat: 11.6448201, lng: 77.6818277 },
  { name: "Kuttaimuniyappan Kovil", lat: 11.5232544, lng: 77.7051012 },
  { name: "Rana Nagar", lat: 11.4572704, lng: 77.6909143 },
  { name: "Palani Aandavar Temple", lat: 11.4429531, lng: 77.6832342 },
  { name: "Nandha Engineering College", lat: 11.2842104, lng: 77.6196129 }
];

// ==========================================
// SIMULATION STATE
// ==========================================
const simulationState = {
  mode: 'auto', // 'auto' | 'manual'
  currentIndex: 0,
  isRunning: false,
  isPaused: false,
  currentStopIndex: 0,
  nextStopIndex: 1,
  progress: 0,
  speed: 40, // km/h
  waitTimer: 0,
  routePolyline: [],
  stopIndices: [], // Mapped indices of stops in polyline
  intervalId: null,
  waitIntervalId: null
};

// ==========================================
// MAP & GOOGLE SERVICES
// ==========================================
let map;
let busMarker;
let routePath;
let stopMarkers = [];
let directionsService;
let geometrySpherical;

// ==========================================
// DOM ELEMENTS
// ==========================================
const ui = {
  modeAuto: document.getElementById('mode-auto'),
  modeManual: document.getElementById('mode-manual'),
  autoControls: document.getElementById('auto-controls'),
  manualControls: document.getElementById('manual-controls'),
  btnStart: document.getElementById('btn-start'),
  btnPause: document.getElementById('btn-pause'),
  btnResume: document.getElementById('btn-resume'),
  btnReset: document.getElementById('btn-reset'),
  manualSlider: document.getElementById('manual-slider'),
  manualStopSelect: document.getElementById('manual-stop-select'),
  presetBtns: document.querySelectorAll('.preset-btn'),
  statusBadge: document.getElementById('status-badge'),
  statCurrentStop: document.getElementById('stat-current-stop'),
  statNextStop: document.getElementById('stat-next-stop'),
  statDistanceNext: document.getElementById('stat-distance-next'),
  statPolyIndex: document.getElementById('stat-poly-index'),
  statSpeed: document.getElementById('stat-speed'),
  statCoords: document.getElementById('stat-coords'),
  statProgressText: document.getElementById('stat-progress-text'),
  statProgressFill: document.getElementById('stat-progress-fill'),
  logsBox: document.getElementById('logs-box')
};

// ==========================================
// LOGGER
// ==========================================
function logEvent(msg) {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-time">[${time}]</span> ${msg}`;
  ui.logsBox.appendChild(entry);
  ui.logsBox.scrollTop = ui.logsBox.scrollHeight;
}

// ==========================================
// MODE LOGIC
// ==========================================
function updateModeUI() {
  if (simulationState.mode === 'auto') {
    ui.autoControls.style.display = 'grid';
    ui.manualControls.style.display = 'none';
    ui.manualSlider.disabled = true;
    ui.manualStopSelect.disabled = true;
    ui.presetBtns.forEach(b => b.disabled = true);
    logEvent("Switched to Auto Simulation Mode");
    updateStatusUI('idle');
  } else {
    ui.autoControls.style.display = 'none';
    ui.manualControls.style.display = 'block';
    ui.manualSlider.disabled = false;
    ui.manualStopSelect.disabled = false;
    ui.presetBtns.forEach(b => b.disabled = false);
    
    clearInterval(simulationState.intervalId);
    clearInterval(simulationState.waitIntervalId);
    simulationState.isRunning = false;
    simulationState.waitTimer = 0;
    updateStatusUI('paused');
    logEvent("Switched to Manual Control Mode");
  }
}

ui.modeAuto.addEventListener('change', () => { simulationState.mode = 'auto'; updateModeUI(); });
ui.modeManual.addEventListener('change', () => { simulationState.mode = 'manual'; updateModeUI(); });

// ==========================================
// UPDATE UI
// ==========================================
function updateStatusUI(state) {
  ui.statusBadge.className = 'status-badge';
  
  if (simulationState.mode === 'manual') {
    ui.statusBadge.textContent = 'Manual Mode';
    ui.statusBadge.style.background = '#8B5CF6';
    ui.statusBadge.style.color = '#FFFFFF';
    return;
  }
  
  ui.statusBadge.style.background = '';
  ui.statusBadge.style.color = '';
  
  if (state === 'idle') {
    ui.statusBadge.textContent = 'Idle';
    ui.btnStart.style.display = 'block';
    ui.btnPause.style.display = 'none';
    ui.btnResume.style.display = 'none';
    ui.btnReset.style.display = 'none';
  } else if (state === 'running') {
    ui.statusBadge.textContent = 'Running';
    ui.statusBadge.classList.add('status-running');
    ui.btnStart.style.display = 'none';
    ui.btnPause.style.display = 'block';
    ui.btnResume.style.display = 'none';
    ui.btnReset.style.display = 'none';
  } else if (state === 'paused') {
    ui.statusBadge.textContent = 'Paused';
    ui.statusBadge.classList.add('status-paused');
    ui.btnStart.style.display = 'none';
    ui.btnPause.style.display = 'none';
    ui.btnResume.style.display = 'block';
    ui.btnReset.style.display = 'block';
  } else if (state === 'completed') {
    ui.statusBadge.textContent = 'Completed';
    ui.statusBadge.classList.add('status-completed');
    ui.btnStart.style.display = 'none';
    ui.btnPause.style.display = 'none';
    ui.btnResume.style.display = 'none';
    ui.btnReset.style.display = 'block';
  }
}

function updateStatsUI(lat, lng) {
  const cStop = routeStops[simulationState.currentStopIndex];
  const nStop = routeStops[simulationState.nextStopIndex];
  
  ui.statCurrentStop.textContent = cStop ? cStop.name : '-';
  ui.statNextStop.textContent = nStop ? nStop.name : 'Final Stop';
  
  if (simulationState.mode === 'manual') {
    ui.statSpeed.textContent = 'Manual Drag';
  } else {
    ui.statSpeed.textContent = simulationState.isPaused || simulationState.waitTimer > 0 || !simulationState.isRunning ? '0 km/h' : `${simulationState.speed} km/h`;
  }
  
  ui.statCoords.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  
  if (simulationState.routePolyline.length > 0) {
    const progPct = ((simulationState.currentIndex / (simulationState.routePolyline.length - 1)) * 100).toFixed(1);
    ui.statProgressText.textContent = `${progPct}%`;
    ui.statProgressFill.style.width = `${progPct}%`;
    ui.statPolyIndex.textContent = simulationState.currentIndex;
    
    if (simulationState.mode === 'auto') {
      ui.manualSlider.value = progPct;
    }
  }
  
  if (nStop && geometrySpherical) {
    const dist = geometrySpherical.computeDistanceBetween(
       new window.google.maps.LatLng(lat, lng),
       new window.google.maps.LatLng(nStop.lat, nStop.lng)
    );
    ui.statDistanceNext.textContent = `${Math.round(dist)} m`;
  } else {
    ui.statDistanceNext.textContent = '0 m';
  }
}

// ==========================================
// FIREBASE SYNC
// ==========================================
async function syncToFirebase(lat, lng, speedToPush = null, isOnline = true) {
  if (!db) return;
  try {
    const busRef = ref(db, 'bus_live/BUS_3');
    
    let activeSpeed = 0;
    if (speedToPush !== null) {
      activeSpeed = speedToPush;
    } else {
      activeSpeed = isOnline && !simulationState.isPaused && simulationState.waitTimer === 0 ? simulationState.speed : 0;
    }
    
    await set(busRef, {
      latitude: lat,
      longitude: lng,
      speed: activeSpeed,
      heading: 0,
      isOnline: isOnline,
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    console.error("Firebase sync error:", err);
  }
}

// ==========================================
// INIT MAP
// ==========================================
async function initMap() {
  while (!window.google || !window.google.maps) {
    await new Promise(r => setTimeout(r, 100));
  }
  
  const { Map } = await window.google.maps.importLibrary("maps");
  const { DirectionsService } = await window.google.maps.importLibrary("routes");
  const { spherical } = await window.google.maps.importLibrary("geometry");
  const { Marker } = await window.google.maps.importLibrary("marker");
  
  directionsService = new DirectionsService();
  geometrySpherical = spherical;
  
  const origin = routeStops[0];
  
  map = new Map(document.getElementById("map"), {
    center: { lat: origin.lat, lng: origin.lng },
    zoom: 12,
    mapId: "DEMO_MAP_ID",
    disableDefaultUI: true
  });
  
  // Render Stop Markers
  routeStops.forEach((stop, idx) => {
    const m = new Marker({
      position: { lat: stop.lat, lng: stop.lng },
      map: map,
      title: stop.name,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: idx === 0 ? "#10B981" : "#64748B",
        fillOpacity: 1,
        strokeWeight: 2,
        strokeColor: "#ffffff"
      }
    });
    stopMarkers.push(m);
  });
  
  busMarker = new Marker({
    position: { lat: origin.lat, lng: origin.lng },
    map: map,
    icon: {
      url: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png"
    },
    zIndex: 999
  });
  
  logEvent("Fetching route polyline...");
  
  const waypoints = routeStops.slice(1, -1).map(s => ({
    location: new window.google.maps.LatLng(s.lat, s.lng),
    stopover: true
  }));
  
  directionsService.route({
    origin: new window.google.maps.LatLng(routeStops[0].lat, routeStops[0].lng),
    destination: new window.google.maps.LatLng(routeStops[routeStops.length-1].lat, routeStops[routeStops.length-1].lng),
    waypoints: waypoints,
    travelMode: window.google.maps.TravelMode.DRIVING
  }, (res, status) => {
    if (status === 'OK') {
      const path = res.routes[0].overview_path;
      // Interpolate points for ~1 update per second
      let densePath = [];
      for(let i=0; i<path.length-1; i++){
        const p1 = path[i];
        const p2 = path[i+1];
        densePath.push({lat: p1.lat(), lng: p1.lng()});
        const dist = geometrySpherical.computeDistanceBetween(p1, p2);
        // Approx 10 meters per point (~36 km/h)
        const segments = Math.max(1, Math.floor(dist / 10));
        for(let j=1; j<segments; j++) {
            densePath.push({
                lat: p1.lat() + (p2.lat() - p1.lat()) * (j/segments),
                lng: p1.lng() + (p2.lng() - p1.lng()) * (j/segments)
            });
        }
      }
      densePath.push({lat: path[path.length-1].lat(), lng: path[path.length-1].lng()});
      simulationState.routePolyline = densePath;
      
      // Calculate Stop Indices
      simulationState.stopIndices = routeStops.map(stop => {
        const sLatLng = new window.google.maps.LatLng(stop.lat, stop.lng);
        let closestIdx = 0;
        let minDist = Infinity;
        for(let i=0; i<densePath.length; i++) {
           const d = geometrySpherical.computeDistanceBetween(sLatLng, new window.google.maps.LatLng(densePath[i].lat, densePath[i].lng));
           if (d < minDist) {
              minDist = d;
              closestIdx = i;
           }
        }
        return closestIdx;
      });
      
      routePath = new window.google.maps.Polyline({
        path: densePath,
        geodesic: true,
        strokeColor: "#3B82F6",
        strokeOpacity: 0.5,
        strokeWeight: 4,
        map: map
      });
      
      logEvent("Route fetched successfully.");
      ui.btnStart.disabled = false;
      updateStatsUI(routeStops[0].lat, routeStops[0].lng);
    } else {
      logEvent(`Failed to fetch route: ${status}`);
    }
  });
}

// ==========================================
// SIMULATION ENGINE (AUTO)
// ==========================================
function startWaitTimer(stopName, onComplete) {
  simulationState.waitTimer = 10;
  updateStatusUI('paused');
  
  logEvent(`Reached: ${stopName}`);
  logEvent(`Waiting at stop...`);
  
  simulationState.waitIntervalId = setInterval(() => {
    ui.statusBadge.textContent = `Waiting (${simulationState.waitTimer}s)`;
    simulationState.waitTimer--;
    
    if (simulationState.waitTimer < 0) {
      clearInterval(simulationState.waitIntervalId);
      simulationState.waitTimer = 0;
      logEvent(`Moving to next stop.`);
      updateStatusUI('running');
      onComplete();
    }
  }, 1000);
}

function stopMarkersColorUpdate() {
  for(let i=0; i<stopMarkers.length; i++){
    if (i < simulationState.currentStopIndex) {
      stopMarkers[i].setOptions({ icon: { ...stopMarkers[i].getIcon(), fillColor: "#94A3B8" }}); // Passed
    } else if (i === simulationState.currentStopIndex) {
      stopMarkers[i].setOptions({ icon: { ...stopMarkers[i].getIcon(), fillColor: "#3B82F6" }}); // Current
    } else {
      stopMarkers[i].setOptions({ icon: { ...stopMarkers[i].getIcon(), fillColor: "#64748B" }}); // Upcoming
    }
  }
}

function simulationTick() {
  if (simulationState.isPaused || simulationState.waitTimer > 0) {
    const p = simulationState.routePolyline[simulationState.currentIndex];
    syncToFirebase(p.lat, p.lng, 0, true);
    return;
  }
  
  simulationState.currentIndex++;
  
  if (simulationState.currentIndex >= simulationState.routePolyline.length) {
    completeTrip();
    return;
  }
  
  const pt = simulationState.routePolyline[simulationState.currentIndex];
  busMarker.setPosition(pt);
  map.panTo(pt);
  updateStatsUI(pt.lat, pt.lng);
  syncToFirebase(pt.lat, pt.lng, simulationState.speed, true);
  
  // Check Next Stop Distance
  const nStop = routeStops[simulationState.nextStopIndex];
  if (nStop) {
    const dist = geometrySpherical.computeDistanceBetween(
      new window.google.maps.LatLng(pt.lat, pt.lng),
      new window.google.maps.LatLng(nStop.lat, nStop.lng)
    );
    
    if (dist <= 20) {
      simulationState.currentStopIndex = simulationState.nextStopIndex;
      simulationState.nextStopIndex++;
      ui.manualStopSelect.value = simulationState.currentStopIndex;
      stopMarkersColorUpdate();
      
      if (simulationState.currentStopIndex === routeStops.length - 1) {
        completeTrip();
      } else {
        startWaitTimer(nStop.name, () => {});
      }
    }
  }
}

function completeTrip() {
  clearInterval(simulationState.intervalId);
  simulationState.isRunning = false;
  
  const finalPt = simulationState.routePolyline[simulationState.routePolyline.length - 1];
  busMarker.setPosition(finalPt);
  syncToFirebase(finalPt.lat, finalPt.lng, 0, false);
  
  logEvent(`Reached Final Stop: Nandha Engineering College`);
  logEvent(`Trip completed.`);
  
  updateStatusUI('completed');
  updateStatsUI(finalPt.lat, finalPt.lng);
}

// ==========================================
// MANUAL MODE ENGINE
// ==========================================
function jumpToPolylineIndex(index, speedToPush = 0) {
  if (index < 0) index = 0;
  if (index >= simulationState.routePolyline.length) index = simulationState.routePolyline.length - 1;
  
  simulationState.currentIndex = index;
  const pt = simulationState.routePolyline[index];
  
  // Calculate stops
  let cIndex = 0;
  let nIndex = 1;
  for(let i=0; i<simulationState.stopIndices.length; i++) {
    if (index >= simulationState.stopIndices[i]) {
       cIndex = i;
       nIndex = i + 1 < routeStops.length ? i + 1 : i;
    }
  }
  
  simulationState.currentStopIndex = cIndex;
  simulationState.nextStopIndex = nIndex;
  ui.manualStopSelect.value = cIndex;
  
  busMarker.setPosition(pt);
  map.panTo(pt);
  stopMarkersColorUpdate();
  updateStatsUI(pt.lat, pt.lng);
  
  syncToFirebase(pt.lat, pt.lng, speedToPush, true);
}

// Handlers
ui.manualSlider.addEventListener('input', (e) => {
  if (simulationState.mode !== 'manual') return;
  const pct = parseFloat(e.target.value);
  const maxIdx = simulationState.routePolyline.length - 1;
  const targetIdx = Math.round((pct / 100) * maxIdx);
  jumpToPolylineIndex(targetIdx, 5); // 5km/h for dragging
});

ui.manualStopSelect.addEventListener('change', (e) => {
  if (simulationState.mode !== 'manual') return;
  const stopIdx = parseInt(e.target.value);
  const targetIdx = simulationState.stopIndices[stopIdx];
  logEvent(`Jumped to ${routeStops[stopIdx].name}`);
  jumpToPolylineIndex(targetIdx, 0);
  ui.manualSlider.value = ((targetIdx / (simulationState.routePolyline.length - 1)) * 100).toFixed(1);
});

ui.presetBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    if (simulationState.mode !== 'manual') return;
    const preset = e.target.dataset.preset;
    
    if (preset === 'boarding') {
      logEvent('Preset: At Boarding Stop');
      jumpToPolylineIndex(simulationState.stopIndices[0], 0);
    } 
    else if (preset === 'arrived') {
      const targetIdx = simulationState.stopIndices[simulationState.nextStopIndex];
      logEvent('Preset: Arrived (0m)');
      jumpToPolylineIndex(targetIdx, 0);
    }
    else if (preset === 'departed') {
      const targetIdx = Math.min(simulationState.currentIndex + 5, simulationState.routePolyline.length - 1);
      logEvent('Preset: Departed (+20m)');
      jumpToPolylineIndex(targetIdx, 15);
    }
    else if (preset === '300m' || preset === '100m') {
       const targetDist = preset === '300m' ? 300 : 100;
       const nextStopLatLng = new window.google.maps.LatLng(routeStops[simulationState.nextStopIndex].lat, routeStops[simulationState.nextStopIndex].lng);
       
       let jumpIdx = simulationState.stopIndices[simulationState.nextStopIndex];
       for(let i = jumpIdx; i >= 0; i--) {
          const pt = simulationState.routePolyline[i];
          const dist = geometrySpherical.computeDistanceBetween(new window.google.maps.LatLng(pt.lat, pt.lng), nextStopLatLng);
          if (dist >= targetDist) {
             jumpIdx = i;
             break;
          }
       }
       logEvent(`Preset: ${targetDist}m away`);
       jumpToPolylineIndex(jumpIdx, 35);
    }
    
    ui.manualSlider.value = ((simulationState.currentIndex / (simulationState.routePolyline.length - 1)) * 100).toFixed(1);
  });
});

// ==========================================
// EVENT LISTENERS (AUTO)
// ==========================================
ui.btnStart.addEventListener('click', () => {
  if (simulationState.routePolyline.length === 0) return;
  simulationState.isRunning = true;
  simulationState.isPaused = false;
  simulationState.currentIndex = 0;
  simulationState.currentStopIndex = 0;
  simulationState.nextStopIndex = 1;
  
  logEvent(`Bus started from ${routeStops[0].name}`);
  updateStatusUI('running');
  stopMarkersColorUpdate();
  
  simulationState.intervalId = setInterval(simulationTick, 1000);
});

ui.btnPause.addEventListener('click', () => {
  if (simulationState.waitTimer > 0) return;
  simulationState.isPaused = true;
  logEvent(`Simulation paused.`);
  updateStatusUI('paused');
});

ui.btnResume.addEventListener('click', () => {
  simulationState.isPaused = false;
  logEvent(`Simulation resumed.`);
  updateStatusUI('running');
});

ui.btnReset.addEventListener('click', () => {
  clearInterval(simulationState.intervalId);
  clearInterval(simulationState.waitIntervalId);
  
  simulationState.isRunning = false;
  simulationState.isPaused = false;
  simulationState.currentIndex = 0;
  simulationState.currentStopIndex = 0;
  simulationState.nextStopIndex = 1;
  simulationState.waitTimer = 0;
  
  const startPt = simulationState.routePolyline[0];
  busMarker.setPosition(startPt);
  map.panTo(startPt);
  
  syncToFirebase(startPt.lat, startPt.lng, 0, false);
  stopMarkersColorUpdate();
  updateStatusUI('idle');
  updateStatsUI(startPt.lat, startPt.lng);
  ui.manualSlider.value = 0;
  ui.manualStopSelect.value = 0;
  
  ui.logsBox.innerHTML = '';
  logEvent(`Simulation reset.`);
});

// Boot
ui.btnStart.disabled = true;
initMap();
