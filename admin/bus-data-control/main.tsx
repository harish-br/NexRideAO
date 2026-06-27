import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, updateDoc, serverTimestamp, setDoc, getDoc } from 'firebase/firestore';

const stripQuotes = (str?: string) => typeof str === 'string' ? str.replace(/^["']|["']$/g, '') : str;

const firebaseConfig = {
    apiKey: stripQuotes(import.meta.env.VITE_FIREBASE_API_KEY) || "YOUR_API_KEY",
    authDomain: stripQuotes(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN) || "YOUR_AUTH_DOMAIN",
    projectId: stripQuotes(import.meta.env.VITE_FIREBASE_PROJECT_ID) || "YOUR_PROJECT_ID",
    storageBucket: stripQuotes(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET) || "YOUR_STORAGE_BUCKET",
    messagingSenderId: stripQuotes(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) || "YOUR_MESSAGING_SENDER_ID",
    appId: stripQuotes(import.meta.env.VITE_FIREBASE_APP_ID) || "YOUR_APP_ID"
};

console.log("[DEBUG ADMIN] Firebase Config initialized:", firebaseConfig);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app); // Ensures auth token is passed to Firestore
const db = getFirestore(app, "nexrideao");

type TrackingStatus = 'stopped' | 'moving' | 'completed' | 'offline';

interface Stop {
  name: string;
  lat: number;
  lng: number;
  scheduledArrival: string; // HH:mm format
}

const ROUTE_STOPS: Stop[] = [
  { name: "Guruvareddiyur", lat: 11.6452378, lng: 77.6818465, scheduledArrival: "06:40" },
  { name: "Kuttaimuniyappan Kovil", lat: 11.5232544, lng: 77.7051012, scheduledArrival: "07:45" },
  { name: "Rana Nagar", lat: 11.4572704, lng: 77.6909143, scheduledArrival: "07:55" },
  { name: "Palani Aandavar Temple", lat: 11.4429531, lng: 77.6832342, scheduledArrival: "08:00" },
  { name: "Nandha Engineering College", lat: 11.2842104, lng: 77.6196129, scheduledArrival: "08:05" }
];

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // meters
  const toRad = (x: number) => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

function calculateDelay(scheduledTimeStr: string, actualTime: Date): number {
  const scheduledMinutes = timeToMinutes(scheduledTimeStr);
  const actualMinutes = actualTime.getHours() * 60 + actualTime.getMinutes();
  const delay = actualMinutes - scheduledMinutes;
  return delay > 0 ? delay : 0;
}

function calculateETA(distanceMeters: number, speedKmph: number): number {
  if (speedKmph <= 0) return 0;
  const speedMpm = (speedKmph * 1000) / 60;
  return Math.ceil(distanceMeters / speedMpm);
}

interface BusData {
  busNumber: number;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  status: TrackingStatus;
  currentStopIndex: number;
  nextStopIndex: number;
  etaMinutes: number;
  delayMinutes: number;
  segmentProgressSeconds?: number;
  simulationTime?: string;
}

type SimStatus = 'idle' | 'running' | 'paused' | 'halted';

function AdminControlPage() {
  const [isTracking, setIsTracking] = useState(false);
  const [busData, setBusData] = useState<BusData>({
    busNumber: 32,
    lat: ROUTE_STOPS[0].lat,
    lng: ROUTE_STOPS[0].lng,
    speed: 0,
    heading: 0,
    status: 'stopped',
    currentStopIndex: 0,
    nextStopIndex: 1,
    etaMinutes: 0,
    delayMinutes: 0,
    segmentProgressSeconds: 0,
    simulationTime: ROUTE_STOPS[0].scheduledArrival
  });

  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const autoSyncInterval = useRef<NodeJS.Timeout | null>(null);
  const busDataRef = useRef(busData);

  // --- Simulation State ---
  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [simStatus, setSimStatus] = useState<SimStatus>('idle');
  const [simSpeedMultiplier, setSimSpeedMultiplier] = useState(100);
  const [simHaltTimeLeft, setSimHaltTimeLeft] = useState(0);

  const simStatusRef = useRef(simStatus);
  const simSpeedRef = useRef(simSpeedMultiplier);
  const simHaltTimeRef = useRef(simHaltTimeLeft);

  useEffect(() => { busDataRef.current = busData; }, [busData]);
  useEffect(() => { simStatusRef.current = simStatus; }, [simStatus]);
  useEffect(() => { simSpeedRef.current = simSpeedMultiplier; }, [simSpeedMultiplier]);
  useEffect(() => { simHaltTimeRef.current = simHaltTimeLeft; }, [simHaltTimeLeft]);

  useEffect(() => {
    const initDoc = async () => {
      try {
        const docRef = doc(db, 'buses', 'bus_32');
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          await setDoc(docRef, { ...busData, lastUpdated: serverTimestamp() });
        }
        setFirebaseError(null);
      } catch (error: any) {
        console.error("[DEBUG ADMIN] Error in initDoc:", error);
        setFirebaseError(error.message || "Permission Denied or Network Error");
      }
    };
    initDoc();
  }, []);

  const pushToFirebase = async (dataToPush: BusData) => {
    console.log("[DEBUG ADMIN] Sending GPS:", dataToPush);
    try {
      const docRef = doc(db, 'buses', `bus_${dataToPush.busNumber}`);
      await updateDoc(docRef, {
        ...dataToPush,
        lastUpdated: serverTimestamp()
      });
      console.log("[DEBUG ADMIN] GPS sent to Firebase successfully");
      setLastSyncTime(new Date());
    } catch (error) {
      console.error("[DEBUG ADMIN] Firebase write failed:", error);
    }
  };

  // ==========================================
  // REAL GPS LOGIC
  // ==========================================
  const handleStartTracking = () => {
    setIsTracking(true);
    const newData = { ...busDataRef.current, status: 'moving' as TrackingStatus };
    setBusData(newData);
    pushToFirebase(newData);
    
    if (autoSyncInterval.current) clearInterval(autoSyncInterval.current);
    
    autoSyncInterval.current = setInterval(() => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const speedMps = position.coords.speed !== null && position.coords.speed !== undefined
              ? position.coords.speed
              : 8.33; 
            updatePosition(position.coords.latitude, position.coords.longitude, speedMps, position.coords.heading || 0, true);
          },
          (error) => {
            console.error("[DEBUG ADMIN] GPS fetch error in interval:", error);
            pushToFirebase(busDataRef.current);
          },
          { enableHighAccuracy: true, maximumAge: 0 }
        );
      } else {
        pushToFirebase(busDataRef.current);
      }
    }, 1000);
  };

  const handlePauseTracking = () => {
    setIsTracking(false);
    if (autoSyncInterval.current) clearInterval(autoSyncInterval.current);
    const newData = { ...busData, status: 'stopped' as TrackingStatus };
    setBusData(newData);
    pushToFirebase(newData);
  };

  const handleStopTracking = () => {
    setIsTracking(false);
    if (autoSyncInterval.current) clearInterval(autoSyncInterval.current);
    const newData = { ...busData, status: 'offline' as TrackingStatus };
    setBusData(newData);
    pushToFirebase(newData);
  };

  const handleResetRoute = () => {
    setIsTracking(false);
    if (autoSyncInterval.current) clearInterval(autoSyncInterval.current);
    const newData: BusData = {
      busNumber: 32,
      lat: ROUTE_STOPS[0].lat,
      lng: ROUTE_STOPS[0].lng,
      speed: 0,
      heading: 0,
      status: 'stopped',
      currentStopIndex: 0,
      nextStopIndex: 1,
      etaMinutes: 0,
      delayMinutes: 0,
      segmentProgressSeconds: 0,
      simulationTime: ROUTE_STOPS[0].scheduledArrival
    };
    setBusData(newData);
    pushToFirebase(newData);
  };

  const fetchDeviceGPS = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const speedMps = position.coords.speed !== null && position.coords.speed !== undefined
            ? position.coords.speed
            : 8.33; 
          updatePosition(position.coords.latitude, position.coords.longitude, speedMps, position.coords.heading || 0);
        },
        (error) => {
          console.error("Error fetching GPS:", error);
          alert("Could not fetch GPS. Please check permissions.");
        },
        { enableHighAccuracy: true }
      );
    } else {
      alert("Geolocation is not supported by this browser.");
    }
  };

  const updatePosition = (lat: number, lng: number, speedMps: number, heading: number, forcePush: boolean = false) => {
    if (busDataRef.current.status === 'completed') return;

    let { currentStopIndex, nextStopIndex, status, delayMinutes } = busDataRef.current;
    const speedKmph = speedMps * 3.6; 
    
    const nextStop = ROUTE_STOPS[nextStopIndex];
    if (!nextStop) return;

    const distToNext = haversineDistance(lat, lng, nextStop.lat, nextStop.lng);
    
    let newStatus = status;
    if (speedMps === null || speedMps === undefined) {
      newStatus = 'offline';
    } else if (speedKmph < 2 && status !== 'stopped') {
      newStatus = 'stopped';
    } else if (speedKmph >= 2 && status !== 'moving') {
      newStatus = 'moving';
    }
    
    // Override if we reached a stop
    if (distToNext <= 20) {
      newStatus = 'stopped';
      delayMinutes = calculateDelay(nextStop.scheduledArrival, new Date());
      
      setTimeout(() => {
        setBusData(prev => {
          if (prev.nextStopIndex >= ROUTE_STOPS.length - 1) {
             return { ...prev, status: 'completed' };
          }
          return {
            ...prev,
            status: 'moving',
            currentStopIndex: prev.nextStopIndex,
            nextStopIndex: prev.nextStopIndex + 1
          };
        });
      }, 15000);
    }

    const eta = calculateETA(distToNext, speedKmph > 0 ? speedKmph : 40); 

    const newData: BusData = {
      ...busDataRef.current,
      lat,
      lng,
      speed: speedKmph,
      heading,
      status: newStatus,
      etaMinutes: eta,
      delayMinutes
    };

    setBusData(newData);
    if (!isTracking || forcePush) {
      pushToFirebase(newData); 
    }
  };

  const moveBus = (distanceMeters: number) => {
    if (busData.status === 'completed') return;
    const nextStop = ROUTE_STOPS[busData.nextStopIndex];
    const distToNext = haversineDistance(busData.lat, busData.lng, nextStop.lat, nextStop.lng);
    const fraction = distanceMeters / distToNext;
    
    let newLat = busData.lat + (nextStop.lat - busData.lat) * fraction;
    let newLng = busData.lng + (nextStop.lng - busData.lng) * fraction;

    const fakeSpeed = busData.speed > 0 ? busData.speed : 40; 
    updatePosition(newLat, newLng, fakeSpeed / 3.6, busData.heading);
  };

  const jumpToNextStop = () => {
    if (busData.nextStopIndex >= ROUTE_STOPS.length) return;
    const nextStop = ROUTE_STOPS[busData.nextStopIndex];
    updatePosition(nextStop.lat, nextStop.lng, 0, 0);
  };

  const handleTestWrite = async () => {
    console.log("[DEBUG ADMIN] Executing Test Write");
    const testData = {
      busNumber: 32,
      lat: 11.5000,
      lng: 77.7000,
      speed: 35,
      heading: 0,
      status: "moving" as TrackingStatus,
      currentStopIndex: 0,
      nextStopIndex: 1,
      etaMinutes: 10,
      delayMinutes: 0
    };
    try {
      const docRef = doc(db, 'buses', 'bus_32');
      await updateDoc(docRef, {
        ...testData,
        lastUpdated: serverTimestamp()
      });
      console.log("[DEBUG ADMIN] Test Write SUCCESS");
      alert("Test write successful! Check user app.");
    } catch (error) {
      console.error("[DEBUG ADMIN] Test Write FAILED:", error);
      alert("Test write failed: " + (error as Error).message);
    }
  };

  // ==========================================
  // SIMULATION LOGIC
  // ==========================================

  useEffect(() => {
    let simInterval: NodeJS.Timeout;
    if (isSimulationMode) {
      simInterval = setInterval(() => {
        tickSimulation();
      }, 1000);
    }
    return () => {
      if (simInterval) clearInterval(simInterval);
    };
  }, [isSimulationMode]);

  function formatSimTime(minutesTotal: number) {
    const h = Math.floor(minutesTotal / 60).toString().padStart(2, '0');
    const m = Math.floor(minutesTotal % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  const tickSimulation = () => {
    const status = simStatusRef.current;
    if (status === 'idle' || status === 'paused') return;

    const currentBus = busDataRef.current;
    if (currentBus.status === 'completed') return;

    if (status === 'halted') {
      const newTime = simHaltTimeRef.current - 1;
      setSimHaltTimeLeft(newTime);
      
      if (newTime <= 0) {
        setSimStatus('running');
        if (currentBus.nextStopIndex >= ROUTE_STOPS.length - 1) {
          setSimStatus('idle');
          const completedData = { ...currentBus, status: 'completed' as TrackingStatus, speed: 0 };
          setBusData(completedData);
          pushToFirebase(completedData);
          return;
        }
        
        const newNext = currentBus.nextStopIndex + 1;
        const newCurrent = currentBus.nextStopIndex;
        const resumedData = { 
          ...currentBus, 
          status: 'moving' as TrackingStatus, 
          currentStopIndex: newCurrent, 
          nextStopIndex: newNext,
          segmentProgressSeconds: 0,
          simulationTime: ROUTE_STOPS[newCurrent].scheduledArrival
        };
        setBusData(resumedData);
      } else {
        pushToFirebase({ ...currentBus, speed: 0, status: 'stopped' });
      }
      return;
    }

    if (status === 'running') {
      const nextStop = ROUTE_STOPS[currentBus.nextStopIndex];
      const prevStop = ROUTE_STOPS[currentBus.currentStopIndex];
      if (!nextStop || !prevStop) return;

      const scheduleStartMin = timeToMinutes(prevStop.scheduledArrival);
      const scheduleEndMin = timeToMinutes(nextStop.scheduledArrival);
      const segmentDurationSeconds = (scheduleEndMin - scheduleStartMin) * 60;
      
      const newProgress = (currentBus.segmentProgressSeconds || 0) + simSpeedRef.current;

      if (newProgress >= segmentDurationSeconds) {
        setSimStatus('halted');
        setSimHaltTimeLeft(10);
        
        const arrivedData: BusData = {
          ...currentBus,
          lat: nextStop.lat,
          lng: nextStop.lng,
          speed: 0,
          status: 'stopped',
          currentStopIndex: currentBus.nextStopIndex,
          segmentProgressSeconds: segmentDurationSeconds,
          simulationTime: nextStop.scheduledArrival
        };
        setBusData(arrivedData);
        pushToFirebase(arrivedData);
      } else {
        const fraction = newProgress / segmentDurationSeconds;
        const newLat = prevStop.lat + (nextStop.lat - prevStop.lat) * fraction;
        const newLng = prevStop.lng + (nextStop.lng - prevStop.lng) * fraction;
        const currentSimMinutes = scheduleStartMin + (newProgress / 60);
        
        const movingData: BusData = {
          ...currentBus,
          lat: newLat,
          lng: newLng,
          speed: simSpeedRef.current,
          status: 'moving',
          segmentProgressSeconds: newProgress,
          simulationTime: formatSimTime(currentSimMinutes)
        };
        setBusData(movingData);
        pushToFirebase(movingData);
      }
    }
  };

  const handleStartSim = () => {
    setSimStatus('running');
    const newData = { ...busDataRef.current, status: 'moving' as TrackingStatus, speed: simSpeedMultiplier };
    setBusData(newData);
    pushToFirebase(newData);
  };
  
  const handlePauseSim = () => {
    setSimStatus('paused');
    const newData = { ...busDataRef.current, speed: 0, status: 'stopped' as TrackingStatus };
    setBusData(newData);
    pushToFirebase(newData);
  };
  
  const handleStopSim = () => {
    setSimStatus('idle');
    const newData = { ...busDataRef.current, speed: 0, status: 'offline' as TrackingStatus };
    setBusData(newData);
    pushToFirebase(newData);
  };
  
  const handleResetSim = () => {
    setSimStatus('idle');
    setSimHaltTimeLeft(0);
    const resetData: BusData = {
      ...busDataRef.current,
      lat: ROUTE_STOPS[0].lat,
      lng: ROUTE_STOPS[0].lng,
      speed: 0,
      status: 'stopped',
      currentStopIndex: 0,
      nextStopIndex: 1,
      etaMinutes: 0,
      delayMinutes: 0,
      segmentProgressSeconds: 0,
      simulationTime: ROUTE_STOPS[0].scheduledArrival
    };
    setBusData(resetData);
    pushToFirebase(resetData);
  };

  const toggleSimulationMode = () => {
    if (!isSimulationMode) {
      handleStopTracking(); // Ensure real GPS stops
    } else {
      handleStopSim();
    }
    setIsSimulationMode(!isSimulationMode);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm">
          <h1 className="text-3xl font-bold text-gray-800">Bus Data Control (Admin)</h1>
          <div className="flex items-center space-x-3">
            <span className="font-semibold text-gray-700">Simulation Mode:</span>
            <button 
              onClick={toggleSimulationMode}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isSimulationMode ? 'bg-purple-600' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isSimulationMode ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
            <span className={`font-bold ${isSimulationMode ? 'text-purple-600' : 'text-gray-400'}`}>{isSimulationMode ? 'ON' : 'OFF'}</span>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-xl font-semibold border-b pb-2 mb-4">Bus Details</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-sm text-blue-600 font-medium">Bus Number</p>
              <p className="text-2xl font-bold">{busData.busNumber}</p>
            </div>
            <div className={`p-3 rounded-lg ${simStatus === 'halted' ? 'bg-orange-50' : 'bg-green-50'}`}>
              <p className={`text-sm font-medium ${simStatus === 'halted' ? 'text-orange-600' : 'text-green-600'}`}>Status</p>
              <p className="text-lg font-bold capitalize">
                {simStatus === 'halted' ? `Halted (${simHaltTimeLeft}s)` : busData.status}
              </p>
            </div>
            <div className="bg-yellow-50 p-3 rounded-lg">
              <p className="text-sm text-yellow-600 font-medium">ETA</p>
              <p className="text-lg font-bold">{busData.etaMinutes} min</p>
            </div>
            <div className="bg-red-50 p-3 rounded-lg">
              <p className="text-sm text-red-600 font-medium">Delay</p>
              <p className="text-lg font-bold">{busData.delayMinutes} min</p>
            </div>
            <div className="col-span-2 bg-gray-50 p-3 rounded-lg">
              <p className="text-sm text-gray-500 font-medium">Current Stop</p>
              <p className="font-bold">{ROUTE_STOPS[busData.currentStopIndex]?.name}</p>
            </div>
            <div className="col-span-2 bg-gray-50 p-3 rounded-lg">
              <p className="text-sm text-gray-500 font-medium">Next Stop</p>
              <p className="font-bold">{ROUTE_STOPS[busData.nextStopIndex]?.name || 'Destination Reached'}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {!isSimulationMode ? (
            <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-blue-500">
              <h2 className="text-xl font-semibold border-b pb-2 mb-4 text-blue-700">Real GPS Controls</h2>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={handleStartTracking} disabled={isTracking} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg font-medium transition">Start Live Tracking</button>
                <button onClick={handlePauseTracking} disabled={!isTracking} className="bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 text-white py-2 px-4 rounded-lg font-medium transition">Pause Tracking</button>
                <button onClick={handleStopTracking} className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg font-medium transition">Stop Tracking</button>
                <button onClick={handleResetRoute} className="bg-gray-800 hover:bg-gray-900 text-white py-2 px-4 rounded-lg font-medium transition">Reset Route</button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-purple-500">
              <h2 className="text-xl font-semibold border-b pb-2 mb-4 text-purple-700">Simulation Controls</h2>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Simulation Multiplier: <span className="font-bold text-purple-600">{simSpeedMultiplier}x</span>
                </label>
                <input 
                  type="range" min="10" max="300" step="10"
                  value={simSpeedMultiplier}
                  onChange={(e) => setSimSpeedMultiplier(parseInt(e.target.value))}
                  className="w-full h-2 bg-purple-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {simStatus !== 'running' && simStatus !== 'halted' ? (
                  <button onClick={handleStartSim} className="bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg font-medium transition">Start Simulation</button>
                ) : (
                  <button onClick={handlePauseSim} disabled={simStatus === 'halted'} className="bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 text-white py-2 px-4 rounded-lg font-medium transition">Pause Simulation</button>
                )}
                {simStatus === 'paused' && (
                  <button onClick={handleStartSim} className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg font-medium transition">Resume Simulation</button>
                )}
                <button onClick={handleStopSim} className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg font-medium transition">Stop Simulation</button>
                <button onClick={handleResetSim} className="bg-gray-800 hover:bg-gray-900 text-white py-2 px-4 rounded-lg font-medium transition">Reset Sim</button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-xl font-semibold border-b pb-2 mb-4">GPS Data</h2>
            <div className="text-sm space-y-2 mb-4">
              <p><span className="font-medium">Lat:</span> {busData.lat.toFixed(6)}</p>
              <p><span className="font-medium">Lng:</span> {busData.lng.toFixed(6)}</p>
              <p><span className="font-medium">Speed:</span> {Math.round(busData.speed)} km/h</p>
              <p><span className="font-medium">Last Sync:</span> {lastSyncTime ? lastSyncTime.toLocaleTimeString() : 'Never'}</p>
            </div>
            {!isSimulationMode && (
              <div className="flex flex-col space-y-2">
                <button onClick={fetchDeviceGPS} className="border border-blue-600 text-blue-600 hover:bg-blue-50 py-1 px-4 rounded-lg transition">Fetch Device GPS</button>
                <button onClick={() => pushToFirebase(busData)} className="border border-green-600 text-green-600 hover:bg-green-50 py-1 px-4 rounded-lg transition">Push GPS to Firebase</button>
              </div>
            )}
          </div>
        </div>

        {!isSimulationMode && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-xl font-semibold border-b pb-2 mb-4 text-gray-700">Manual Simulation (Legacy)</h2>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => moveBus(10)} className="bg-gray-100 text-gray-700 hover:bg-gray-200 py-2 px-4 rounded-lg font-medium">Move Forward 10m</button>
              <button onClick={jumpToNextStop} className="bg-gray-600 text-white hover:bg-gray-700 py-2 px-4 rounded-lg font-medium">Reach Next Stop</button>
              <button onClick={handleTestWrite} className="bg-blue-600 text-white hover:bg-blue-700 py-2 px-4 rounded-lg font-bold shadow-md">Run Test Write</button>
            </div>
          </div>
        )}

        <div className="bg-gray-800 text-green-400 font-mono text-sm rounded-xl p-6 shadow-md">
          <h3 className="text-white font-bold mb-2">Admin Debug Panel</h3>
          <p>Writing to: <span className="text-white">buses/bus_32</span></p>
          <p>Current GPS: <span className="text-white">{busData.lat.toFixed(6)}, {busData.lng.toFixed(6)}</span></p>
          <p>Computed Speed: <span className="text-white">{Math.round(busData.speed)} km/h</span></p>
          <p>Computed Status: <span className="text-white">{busData.status}</span></p>
          <p>Sim Engine Status: <span className="text-purple-400 font-bold">{simStatus} {simStatus === 'halted' ? `(${simHaltTimeLeft}s)` : ''}</span></p>
          <p>Last Sync Time: <span className="text-white">{lastSyncTime ? lastSyncTime.toLocaleTimeString() : 'Never'}</span></p>
          {firebaseError && <p className="text-red-500 mt-2 font-bold">ERROR: {firebaseError}</p>}
        </div>
      </div>
    </div>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<AdminControlPage />);
}
