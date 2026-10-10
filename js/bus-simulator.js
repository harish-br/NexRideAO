// js/bus-simulator.js
// High-Precision Live Bus Simulation Engine for NexRide
// Coordinates increment gradually between stops, syncing telemetry with Firestore in real-time.

import { firestore, db, auth } from './firebase-config.js';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  serverTimestamp,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { ref, set } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js';
import { signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';

// Haversine distance in meters
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = x => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Default realistic sample campus stops if none exist in Firebase
export const DEFAULT_CAMPUS_STOPS = [
  { order: 1, name: 'Campus Main Gate', stopName: 'Campus Main Gate', latitude: 12.971600, longitude: 77.594600, scheduledArrival: '08:00 AM' },
  { order: 2, name: 'Tech Park Junction', stopName: 'Tech Park Junction', latitude: 12.975200, longitude: 77.601500, scheduledArrival: '08:12 AM' },
  { order: 3, name: 'Metro Interchange Station', stopName: 'Metro Interchange Station', latitude: 12.979800, longitude: 77.609200, scheduledArrival: '08:24 AM' },
  { order: 4, name: 'City Central Library', stopName: 'City Central Library', latitude: 12.984500, longitude: 77.616500, scheduledArrival: '08:35 AM' },
  { order: 5, name: 'Sports Complex Arena', stopName: 'Sports Complex Arena', latitude: 12.989200, longitude: 77.623800, scheduledArrival: '08:48 AM' },
  { order: 6, name: 'University Campus Depot', stopName: 'University Campus Depot', latitude: 12.994000, longitude: 77.631500, scheduledArrival: '09:00 AM' }
];

export class BusSimulator {
  constructor(options = {}) {
    this.busNumber = options.busNumber ? String(options.busNumber).trim() : '32';
    this.speedMultiplier = options.speedMultiplier || 1; // 1x, 2x, 5x, 10x
    this.haltDwellSeconds = options.haltDwellSeconds !== undefined ? options.haltDwellSeconds : 6;
    this.autoLoop = options.autoLoop !== undefined ? options.autoLoop : true;
    this.isEngineOn = options.isEngineOn !== undefined ? Boolean(options.isEngineOn) : true;

    // Simulation State
    this.isRunning = false;
    this.isPaused = false;
    this.currentLegIndex = 0; // index of fromStop (0 to stops.length - 2)
    this.progressOnLeg = 0.0; // 0.0 to 1.0 between current stop and next stop
    this.status = 'stopped'; // 'stopped' | 'moving' | 'completed' | 'offline'
    this.dwellRemaining = 0; // seconds remaining in halt

    this.currentLat = 0;
    this.currentLng = 0;
    this.currentSpeed = 0;
    this.etaMinutes = 0;
    this.stops = [];

    this.timerId = null;
    this.tickIntervalMs = 1000; // updates every 1 second
    this.listeners = new Set();
  }

  // Event listener hook for UI components
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify(event, payload = {}) {
    const state = this.getState();
    this.listeners.forEach(fn => {
      try { fn(event, { ...state, ...payload }); } catch (e) { console.error('[Simulator] listener err:', e); }
    });
  }

  getState() {
    const totalLegs = Math.max(1, this.stops.length - 1);
    const overallPercent = Math.min(100, Math.max(0, Math.round(((this.currentLegIndex + this.progressOnLeg) / totalLegs) * 100)));

    return {
      isEngineOn: this.isEngineOn,
      engine: this.isEngineOn ? 'on' : 'off',
      busNumber: this.busNumber,
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      status: this.status,
      speedMultiplier: this.speedMultiplier,
      haltDwellSeconds: this.haltDwellSeconds,
      currentLegIndex: this.currentLegIndex,
      nextLegIndex: Math.min(this.currentLegIndex + 1, Math.max(0, this.stops.length - 1)),
      progressOnLeg: this.progressOnLeg,
      overallPercent,
      dwellRemaining: this.dwellRemaining,
      lat: this.currentLat,
      lng: this.currentLng,
      speed: this.currentSpeed,
      etaMinutes: this.etaMinutes,
      stops: this.stops,
      totalStops: this.stops.length,
      currentStopName: this.stops[this.currentLegIndex]?.stopName || this.stops[this.currentLegIndex]?.name || 'Unknown',
      nextStopName: this.stops[this.currentLegIndex + 1]?.stopName || this.stops[this.currentLegIndex + 1]?.name || 'Destination'
    };
  }

  // Ensure Firebase Auth is initialized for Firestore write permissions
  async ensureAuth() {
    if (!auth.currentUser) {
      try {
        console.log('[Simulator] Signing in anonymously for Firestore write permissions...');
        await signInAnonymously(auth);
      } catch (err) {
        console.warn('[Simulator] Anonymous sign-in warning:', err);
      }
    }
  }

  // Fetch all existing buses from Firestore
  async fetchAllBuses() {
    try {
      const snap = await getDocs(collection(firestore, 'buses'));
      const list = [];
      snap.forEach(d => {
        const data = d.data();
        const num = data.busNumber || data.bus || d.id.replace('bus_', '');
        list.push({
          id: d.id,
          busNumber: String(num).trim(),
          routeName: data.routeName || data.route || '',
          status: data.status || 'Active',
          stopsCount: Array.isArray(data.stops) ? data.stops.length : 0
        });
      });
      return list;
    } catch (err) {
      console.warn('[Simulator] Could not fetch buses list:', err);
      return [];
    }
  }

  // Load stops from Firestore for this bus
  async loadStops(busNum = this.busNumber) {
    this.busNumber = String(busNum).trim();
    let loaded = [];

    try {
      // 1. Check routes/route_bus_<busNum>
      const routeDocId = `route_bus_${this.busNumber}`;
      const routeSnap = await getDoc(doc(firestore, 'routes', routeDocId));
      if (routeSnap.exists() && Array.isArray(routeSnap.data().stops) && routeSnap.data().stops.length > 0) {
        loaded = routeSnap.data().stops;
        console.log('[Simulator] Loaded stops from routes/' + routeDocId, loaded.length);
      }

      // 2. If not found, check routes collection where assignedBus == busNum
      if (loaded.length === 0) {
        let rData = null;
        const q1 = query(collection(firestore, 'routes'), where('assignedBus', 'in', [this.busNumber, `bus_${this.busNumber}`, `bus-${this.busNumber}`]));
        const qSnap1 = await getDocs(q1);
        if (!qSnap1.empty) {
          rData = qSnap1.docs[0].data();
        } else {
          const q2 = query(collection(firestore, 'routes'), where('assignedBusName', '==', this.busNumber));
          const qSnap2 = await getDocs(q2);
          if (!qSnap2.empty) {
            rData = qSnap2.docs[0].data();
          }
        }

        if (rData && Array.isArray(rData.stops) && rData.stops.length > 0) {
          loaded = rData.stops;
          console.log('[Simulator] Loaded stops from routes query:', loaded.length);
        }
      }

      // 3. If not found, check buses/bus_<busNum> and buses/<busNum> doc
      if (loaded.length === 0) {
        const busDocSnap1 = await getDoc(doc(firestore, 'buses', `bus_${this.busNumber}`));
        if (busDocSnap1.exists() && Array.isArray(busDocSnap1.data().stops) && busDocSnap1.data().stops.length > 0) {
          loaded = busDocSnap1.data().stops;
          console.log('[Simulator] Loaded stops from buses/bus_' + this.busNumber, loaded.length);
        } else {
          const busDocSnap2 = await getDoc(doc(firestore, 'buses', this.busNumber));
          if (busDocSnap2.exists() && Array.isArray(busDocSnap2.data().stops) && busDocSnap2.data().stops.length > 0) {
            loaded = busDocSnap2.data().stops;
            console.log('[Simulator] Loaded stops from buses/' + this.busNumber, loaded.length);
          }
        }
      }
    } catch (err) {
      console.warn('[Simulator] Error fetching stops from Firebase:', err);
    }

    const KNOWN_COORDS = {
      'komarayanur': { lat: 11.5830, lng: 77.7018 },
      'p.k.pudhur': { lat: 11.5715, lng: 77.7012 },
      'kittampatti': { lat: 11.5582, lng: 77.7008 },
      'chennampatti': { lat: 11.5451, lng: 77.7005 },
      'c. thaneer pandhal palayam': { lat: 11.5320, lng: 77.7016 },
      'guruvareddiyur': { lat: 11.5185, lng: 77.7032 },
      'sanathi kal': { lat: 11.4921, lng: 77.7061 },
      'vaikkal medu': { lat: 11.4802, lng: 77.7073 },
      'boodhapadi': { lat: 11.4681, lng: 77.7088 },
      'kuthiraikal medu': { lat: 11.4552, lng: 77.7079 },
      'manikkampalayam': { lat: 11.4423, lng: 77.7062 },
      'chittar': { lat: 11.4301, lng: 77.7049 },
      'kesarimangalam': { lat: 11.4182, lng: 77.7028 },
      'kuttaimuniyappan koil': { lat: 11.4051, lng: 77.7014 },
      'palani andavar temple': { lat: 11.3902, lng: 77.6951 },
      'nandha engineering college': { lat: 11.3781, lng: 77.6852 }
    };

    // Normalize stops format
    this.stops = loaded.map((s, idx) => {
      const name = s.name || s.stopName || `Stop ${idx + 1}`;
      const k = name.toLowerCase().trim();
      const fb = KNOWN_COORDS[k];
      const latitude = parseFloat(s.latitude || s.lat) || fb?.lat || (11.5830 - idx * 0.0125);
      const longitude = parseFloat(s.longitude || s.lng) || fb?.lng || (77.7018 - idx * 0.001);
      return {
        order: s.order || idx + 1,
        name,
        stopName: name,
        latitude,
        longitude,
        arrivalTime: s.arrivalTime || s.morningArrival || s.scheduledArrival || `08:${String(idx * 12).padStart(2, '0')} AM`
      };
    });

    if (this.stops.length > 0) {
      this.currentLat = this.stops[0].latitude;
      this.currentLng = this.stops[0].longitude;
    }

    this.notify('stops_loaded', { stops: this.stops });
    return this.stops;
  }

  // Seed realistic sample stops into Firebase for this bus if none exist
  async seedDefaultStops(busNum = this.busNumber) {
    await this.ensureAuth();
    this.busNumber = String(busNum).trim();
    const routeDocId = `route_bus_${this.busNumber}`;

    const routePayload = {
      name: `Route Bus ${this.busNumber} (Campus Express)`,
      assignedBus: this.busNumber,
      assignedBuses: [this.busNumber],
      status: 'Active',
      totalStops: DEFAULT_CAMPUS_STOPS.length,
      stopsCount: DEFAULT_CAMPUS_STOPS.length,
      stops: DEFAULT_CAMPUS_STOPS,
      updatedAt: serverTimestamp()
    };

    const busPayload = {
      busNumber: this.busNumber,
      status: 'stopped',
      currentStopIndex: 0,
      nextStopIndex: 1,
      lat: DEFAULT_CAMPUS_STOPS[0].latitude,
      lng: DEFAULT_CAMPUS_STOPS[0].longitude,
      speed: 0,
      delayMinutes: 0,
      etaMinutes: 0,
      stops: DEFAULT_CAMPUS_STOPS,
      lastUpdated: serverTimestamp()
    };

    try {
      await setDoc(doc(firestore, 'routes', routeDocId), routePayload, { merge: true });
      await setDoc(doc(firestore, 'buses', `bus_${this.busNumber}`), busPayload, { merge: true });
      console.log(`[Simulator] Seeded default campus stops for Bus ${this.busNumber} into Firebase!`);
      await this.loadStops(this.busNumber);
      return this.stops;
    } catch (err) {
      console.error('[Simulator] Failed to seed default stops:', err);
      throw err;
    }
  }

  // Start or resume the simulation
  async start() {
    if (this.isRunning && !this.isPaused) return;

    await this.ensureAuth();

    if (this.stops.length < 2) {
      await this.loadStops();
      if (this.stops.length < 2) {
        console.log('[Simulator] No valid stops found in Firebase. Seeding defaults...');
        await this.seedDefaultStops();
      }
    }

    this.isRunning = true;
    this.isPaused = false;
    this.isEngineOn = true;

    // If starting fresh or stopped at a stop, begin with dwell countdown or immediately move
    if (this.status === 'stopped' && this.dwellRemaining <= 0) {
      this.status = 'moving';
    }

    this.notify('started');
    this.runLoop();
  }

  // Pause simulation
  pause() {
    if (!this.isRunning) return;
    this.isPaused = true;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.notify('paused');
  }

  // Reset to initial stop
  async reset() {
    this.pause();
    this.isRunning = false;
    this.isPaused = false;
    this.currentLegIndex = 0;
    this.progressOnLeg = 0.0;
    this.status = 'stopped';
    this.dwellRemaining = this.haltDwellSeconds;

    if (this.stops.length > 0) {
      this.currentLat = this.stops[0].latitude;
      this.currentLng = this.stops[0].longitude;
    }
    this.currentSpeed = 0;
    this.etaMinutes = 0;

    await this.syncToFirebase({
      status: 'stopped',
      currentStopIndex: 0,
      nextStopIndex: Math.min(1, this.stops.length - 1),
      lat: this.currentLat,
      lng: this.currentLng,
      speed: 0,
      etaMinutes: 0
    });

    this.notify('reset');
  }

  // Jump bus directly to a specific stop index
  async jumpToStop(stopIndex) {
    if (stopIndex < 0 || stopIndex >= this.stops.length) return;

    this.currentLegIndex = Math.min(stopIndex, Math.max(0, this.stops.length - 2));
    this.progressOnLeg = 0.0;
    const targetStop = this.stops[stopIndex];
    this.currentLat = targetStop.latitude;
    this.currentLng = targetStop.longitude;

    if (stopIndex === this.stops.length - 1) {
      this.status = 'completed';
      this.currentSpeed = 0;
      this.etaMinutes = 0;
      this.currentLegIndex = stopIndex;
    } else {
      this.status = 'stopped';
      this.currentSpeed = 0;
      this.dwellRemaining = this.haltDwellSeconds;
    }

    await this.syncToFirebase({
      status: this.status,
      currentStopIndex: stopIndex,
      nextStopIndex: Math.min(stopIndex + 1, this.stops.length - 1),
      lat: this.currentLat,
      lng: this.currentLng,
      speed: 0,
      etaMinutes: 0
    });

    this.notify('jumped', { stopIndex });
  }

  // Set overall route progress manually via interactive slider (0% to 100%)
  async setOverallProgress(percent) {
    if (this.stops.length < 2) return;

    // Pause auto-ticks while manually scrubbing
    if (this.isRunning && !this.isPaused) {
      this.pause();
    }

    const pct = Math.max(0, Math.min(100, Number(percent) || 0));
    const totalLegs = this.stops.length - 1;
    const legDecimal = (pct / 100) * totalLegs;
    const legIndex = Math.min(Math.floor(legDecimal), totalLegs - 1);
    const fraction = legDecimal - legIndex;

    this.currentLegIndex = legIndex;
    this.progressOnLeg = fraction;

    const fromStop = this.stops[legIndex];
    const toStop = this.stops[Math.min(legIndex + 1, totalLegs)];

    if (pct >= 99.8) {
      this.status = 'completed';
      this.currentLat = this.stops[totalLegs].latitude;
      this.currentLng = this.stops[totalLegs].longitude;
      this.currentSpeed = 0;
      this.etaMinutes = 0;
      this.currentLegIndex = totalLegs;
    } else if (fraction <= 0.04) {
      // Halted at fromStop
      this.status = 'stopped';
      this.currentLat = fromStop.latitude;
      this.currentLng = fromStop.longitude;
      this.currentSpeed = 0;
      this.etaMinutes = 0;
      this.dwellRemaining = this.haltDwellSeconds;
    } else {
      // Moving between fromStop and toStop
      this.status = 'moving';
      this.currentLat = fromStop.latitude + (toStop.latitude - fromStop.latitude) * fraction;
      this.currentLng = fromStop.longitude + (toStop.longitude - fromStop.longitude) * fraction;
      this.currentSpeed = Math.round(35 + Math.sin(fraction * Math.PI) * 10);
      const legDist = haversineDistance(this.currentLat, this.currentLng, toStop.latitude, toStop.longitude);
      this.etaMinutes = Math.max(1, Math.round((legDist / (this.currentSpeed * (1000 / 60)))));
    }

    this.notify('manual_slider', {
      overallPercent: pct,
      legIndex,
      fraction,
      status: this.status
    });

    await this.debouncedSyncToFirebase();
  }

  // Debounced sync to avoid flooding Firestore during continuous slider drag
  async debouncedSyncToFirebase() {
    if (this._syncDebounceTimer) {
      clearTimeout(this._syncDebounceTimer);
    }
    return new Promise(resolve => {
      this._syncDebounceTimer = setTimeout(async () => {
        await this.syncToFirebase();
        resolve();
      }, 60);
    });
  }

  // Set Engine ON or OFF
  async setEngine(isOn) {
    this.isEngineOn = Boolean(isOn);
    if (!this.isEngineOn) {
      // Engine turned off -> bus immediately halts
      if (this.isRunning && !this.isPaused) {
        this.pause();
      }
      this.status = 'stopped';
      this.currentSpeed = 0;
    }

    await this.syncToFirebase({
      engine: this.isEngineOn ? 'on' : 'off',
      isEngineOn: this.isEngineOn,
      status: this.status,
      speed: this.currentSpeed
    });

    this.notify('engine_toggled', { isEngineOn: this.isEngineOn });
    return this.isEngineOn;
  }

  toggleEngine() {
    return this.setEngine(!this.isEngineOn);
  }

  // Set speed multiplier (1x, 2x, 5x, 10x)
  setSpeedMultiplier(mult) {
    this.speedMultiplier = Math.max(0.5, Math.min(20, Number(mult) || 1));
    this.notify('speed_changed', { speedMultiplier: this.speedMultiplier });
  }

  // Set halt dwell seconds
  setDwellSeconds(sec) {
    this.haltDwellSeconds = Math.max(1, Number(sec) || 6);
    this.notify('dwell_changed', { haltDwellSeconds: this.haltDwellSeconds });
  }

  // Force a specific bus status manually (for testing UI states)
  async forceStatus(status) {
    this.status = status;
    if (status === 'stopped' || status === 'completed' || status === 'offline') {
      this.currentSpeed = 0;
    } else if (status === 'moving') {
      this.currentSpeed = 38;
    }

    await this.syncToFirebase({
      status: this.status,
      speed: this.currentSpeed
    });
    this.notify('status_forced', { status });
  }

  // Main tick loop
  async runLoop() {
    if (!this.isRunning || this.isPaused) return;

    try {
      await this.tick();
    } catch (err) {
      console.error('[Simulator] Tick error:', err);
    }

    if (this.isRunning && !this.isPaused) {
      this.timerId = setTimeout(() => this.runLoop(), this.tickIntervalMs);
    }
  }

  // Single step tick
  async tick() {
    if (this.stops.length < 2) return;

    // 1. If currently halted at a stop, count down dwell time
    if (this.status === 'stopped') {
      this.currentSpeed = 0;
      this.dwellRemaining -= 1 * this.speedMultiplier;

      if (this.dwellRemaining <= 0) {
        // Halt finished, depart towards next stop
        this.status = 'moving';
        this.progressOnLeg = 0.0;
        this.notify('departed', { fromIndex: this.currentLegIndex, toIndex: this.currentLegIndex + 1 });
      } else {
        // Still halted, ensure Firestore has stopped state
        await this.syncToFirebase({
          status: 'stopped',
          currentStopIndex: this.currentLegIndex,
          nextStopIndex: Math.min(this.currentLegIndex + 1, this.stops.length - 1),
          lat: this.currentLat,
          lng: this.currentLng,
          speed: 0,
          etaMinutes: 0
        });
        this.notify('tick');
        return;
      }
    }

    // 2. If moving between currentLegIndex and currentLegIndex + 1
    if (this.status === 'moving') {
      const fromStop = this.stops[this.currentLegIndex];
      const toStop = this.stops[this.currentLegIndex + 1];

      if (!fromStop || !toStop) {
        this.status = 'completed';
        this.notify('completed');
        return;
      }

      // Step progress: at 1x multiplier, increment by 0.05 (20 steps ~ 20 seconds per stop)
      const stepIncrement = 0.05 * this.speedMultiplier;
      this.progressOnLeg += stepIncrement;

      if (this.progressOnLeg >= 1.0) {
        // Arrived at toStop!
        this.progressOnLeg = 1.0;
        this.currentLat = toStop.latitude;
        this.currentLng = toStop.longitude;
        this.currentLegIndex += 1;

        // Check if reached destination (last stop)
        if (this.currentLegIndex >= this.stops.length - 1) {
          this.status = 'completed';
          this.currentSpeed = 0;
          this.etaMinutes = 0;

          await this.syncToFirebase({
            status: 'completed',
            currentStopIndex: this.currentLegIndex,
            nextStopIndex: this.currentLegIndex,
            lat: this.currentLat,
            lng: this.currentLng,
            speed: 0,
            etaMinutes: 0
          });

          this.notify('completed');

          if (this.autoLoop) {
            console.log('[Simulator] Auto-looping route in 8 seconds...');
            setTimeout(() => {
              if (this.isRunning && this.status === 'completed') {
                this.reset().then(() => this.start());
              }
            }, 8000);
          }
          return;
        }

        // Arrived at intermediate stop -> Enter Halt / Stopped state!
        this.status = 'stopped';
        this.dwellRemaining = this.haltDwellSeconds;
        this.currentSpeed = 0;
        this.etaMinutes = 0;

        await this.syncToFirebase({
          status: 'stopped',
          currentStopIndex: this.currentLegIndex,
          nextStopIndex: Math.min(this.currentLegIndex + 1, this.stops.length - 1),
          lat: this.currentLat,
          lng: this.currentLng,
          speed: 0,
          etaMinutes: 0
        });

        this.notify('halted', { stopIndex: this.currentLegIndex, stopName: toStop.name });
        return;
      }

      // Bus is still in transit between fromStop and toStop:
      // Gradually interpolate coordinates!
      this.currentLat = fromStop.latitude + (toStop.latitude - fromStop.latitude) * this.progressOnLeg;
      this.currentLng = fromStop.longitude + (toStop.longitude - fromStop.longitude) * this.progressOnLeg;

      // Realistic speed curve with subtle jitter (32 - 44 km/h)
      const curve = Math.sin(this.progressOnLeg * Math.PI);
      this.currentSpeed = Math.round(34 + curve * 10 + (Math.random() * 4 - 2));

      // Calculate realistic ETA in minutes based on remaining distance
      const legDist = haversineDistance(this.currentLat, this.currentLng, toStop.latitude, toStop.longitude);
      const remainingLegMinutes = Math.max(1, Math.round((legDist / (this.currentSpeed * (1000 / 60)))));
      this.etaMinutes = remainingLegMinutes;

      await this.syncToFirebase({
        status: 'moving',
        currentStopIndex: this.currentLegIndex,
        nextStopIndex: this.currentLegIndex + 1,
        lat: Number(this.currentLat.toFixed(6)),
        lng: Number(this.currentLng.toFixed(6)),
        speed: this.currentSpeed,
        etaMinutes: this.etaMinutes
      });

      this.notify('tick');
    }
  }

  // Push updated telematics to Firestore buses collection AND RTDB bus_live node
  async syncToFirebase(extraFields = {}) {
    const busNum = String(this.busNumber).trim();
    const resolvedStatus = this.status === 'moving' ? 'On Route' : (this.status === 'stopped' ? 'At Stop' : this.status);
    const payload = {
      busNumber: busNum,
      status: resolvedStatus,
      engine: this.isEngineOn ? 'on' : 'off',
      isEngineOn: this.isEngineOn,
      currentStopIndex: this.currentLegIndex,
      nextStopIndex: Math.min(this.currentLegIndex + 1, Math.max(0, this.stops.length - 1)),
      lat: Number(this.currentLat.toFixed(6)),
      lng: Number(this.currentLng.toFixed(6)),
      latitude: Number(this.currentLat.toFixed(6)),
      longitude: Number(this.currentLng.toFixed(6)),
      speed: this.currentSpeed,
      delayMinutes: 0,
      etaMinutes: this.etaMinutes,
      lastUpdated: serverTimestamp(),
      ...extraFields
    };

    try {
      // 1. Sync to Firestore (both doc keys: bus_<busNum> and <busNum>)
      const busRef1 = doc(firestore, 'buses', `bus_${busNum}`);
      const busRef2 = doc(firestore, 'buses', busNum);
      await Promise.allSettled([
        setDoc(busRef1, payload, { merge: true }),
        setDoc(busRef2, payload, { merge: true })
      ]);
    } catch (err) {
      console.warn('[Simulator] Firestore sync error:', err);
    }

    try {
      // 2. Sync to Realtime Database (RTDB) for immediate live tracking in Admin and User App
      if (db) {
        const rtdbPayload = {
          busNumber: busNum,
          lat: Number(this.currentLat.toFixed(6)),
          lng: Number(this.currentLng.toFixed(6)),
          latitude: Number(this.currentLat.toFixed(6)),
          longitude: Number(this.currentLng.toFixed(6)),
          speed: this.currentSpeed,
          status: resolvedStatus,
          isOnline: this.status !== 'offline',
          currentStopIndex: this.currentLegIndex,
          nextStopIndex: Math.min(this.currentLegIndex + 1, Math.max(0, this.stops.length - 1)),
          etaMinutes: this.etaMinutes,
          timestamp: Date.now()
        };
        await Promise.allSettled([
          set(ref(db, `bus_live/bus_${busNum}`), rtdbPayload),
          set(ref(db, `bus_live/${busNum}`), rtdbPayload)
        ]);
      }
    } catch (err) {
      console.warn('[Simulator] RTDB sync error:', err);
    }
  }
}

// Global singleton instance for easy cross-script access
export const globalSimulator = new BusSimulator({ busNumber: '32', speedMultiplier: 1 });
if (typeof window !== 'undefined') {
  window.NexRideSimulator = globalSimulator;
  window.BusSimulator = BusSimulator;
}
