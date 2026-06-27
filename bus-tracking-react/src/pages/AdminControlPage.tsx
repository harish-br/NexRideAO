import React, { useState, useEffect, useRef } from 'react';
import { doc, updateDoc, serverTimestamp, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { ROUTE_STOPS, haversineDistance, calculateDelay, calculateETA } from '../utils/routeMath';

type TrackingStatus = 'stopped' | 'moving' | 'completed' | 'offline';

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
}

export default function AdminControlPage() {
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
    delayMinutes: 0
  });

  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  
  // Ref to hold the interval ID for auto sync
  const autoSyncInterval = useRef<NodeJS.Timeout | null>(null);
  
  // Ref to hold the bus data for the interval closure
  const busDataRef = useRef(busData);
  useEffect(() => {
    busDataRef.current = busData;
  }, [busData]);

  // Ensure document exists
  useEffect(() => {
    const initDoc = async () => {
      const docRef = doc(db, 'buses', 'bus_32');
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        await setDoc(docRef, { ...busData, lastUpdated: serverTimestamp() });
      }
    };
    initDoc();
  }, []);

  const pushToFirebase = async (dataToPush: BusData) => {
    try {
      const docRef = doc(db, 'buses', `bus_${dataToPush.busNumber}`);
      await updateDoc(docRef, {
        ...dataToPush,
        lastUpdated: serverTimestamp()
      });
      setLastSyncTime(new Date());
    } catch (error) {
      console.error("Error updating Firestore:", error);
    }
  };

  const handleStartTracking = () => {
    setIsTracking(true);
    const newData = { ...busData, status: 'moving' as TrackingStatus };
    setBusData(newData);
    pushToFirebase(newData);
    
    // Auto sync every 2 seconds
    if (autoSyncInterval.current) clearInterval(autoSyncInterval.current);
    autoSyncInterval.current = setInterval(() => {
      pushToFirebase(busDataRef.current);
    }, 2000);
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
      delayMinutes: 0
    };
    setBusData(newData);
    pushToFirebase(newData);
  };

  const fetchDeviceGPS = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          updatePosition(position.coords.latitude, position.coords.longitude, position.coords.speed || 0, position.coords.heading || 0);
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

  // Movement Math & Logic
  const updatePosition = (lat: number, lng: number, speedMps: number, heading: number) => {
    if (busData.status === 'completed') return;

    let { currentStopIndex, nextStopIndex, status, delayMinutes } = busData;
    const speedKmph = speedMps * 3.6; 
    
    const nextStop = ROUTE_STOPS[nextStopIndex];
    if (!nextStop) return;

    const distToNext = haversineDistance(lat, lng, nextStop.lat, nextStop.lng);
    let newStatus = status;

    if (distToNext <= 20 && status !== 'stopped') {
      newStatus = 'stopped';
      delayMinutes = calculateDelay(nextStop.scheduledArrival, new Date());
      
      // Stop logic: wait 15 seconds then moving
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

    const eta = calculateETA(distToNext, speedKmph > 0 ? speedKmph : 40); // default to 40kmph for ETA if speed is 0 for simulation

    const newData: BusData = {
      ...busData,
      lat,
      lng,
      speed: speedKmph,
      heading,
      status: newStatus,
      etaMinutes: eta,
      delayMinutes
    };

    setBusData(newData);
    if (!isTracking) {
      pushToFirebase(newData); // push manually if not auto tracking
    }
  };

  // Manual Simulation Logic
  const moveBus = (distanceMeters: number) => {
    if (busData.status === 'completed') return;
    const nextStop = ROUTE_STOPS[busData.nextStopIndex];
    
    // Simple interpolation towards next stop for testing
    const distToNext = haversineDistance(busData.lat, busData.lng, nextStop.lat, nextStop.lng);
    const fraction = distanceMeters / distToNext;
    
    let newLat = busData.lat + (nextStop.lat - busData.lat) * fraction;
    let newLng = busData.lng + (nextStop.lng - busData.lng) * fraction;

    // Adjust speed for simulation
    const fakeSpeed = busData.speed > 0 ? busData.speed : 40; 
    updatePosition(newLat, newLng, fakeSpeed / 3.6, busData.heading);
  };

  const jumpToNextStop = () => {
    if (busData.nextStopIndex >= ROUTE_STOPS.length) return;
    const nextStop = ROUTE_STOPS[busData.nextStopIndex];
    updatePosition(nextStop.lat, nextStop.lng, 0, 0);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-gray-800">Bus Data Control (Admin)</h1>
        
        {/* Top Card: Bus Details */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-xl font-semibold border-b pb-2 mb-4">Bus Details</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-sm text-blue-600 font-medium">Bus Number</p>
              <p className="text-2xl font-bold">{busData.busNumber}</p>
            </div>
            <div className="bg-green-50 p-3 rounded-lg">
              <p className="text-sm text-green-600 font-medium">Status</p>
              <p className="text-lg font-bold capitalize">{busData.status}</p>
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
          {/* Tracking Controls */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-xl font-semibold border-b pb-2 mb-4">Tracking Controls</h2>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={handleStartTracking}
                disabled={isTracking}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg font-medium transition"
              >
                Start Live Tracking
              </button>
              <button 
                onClick={handlePauseTracking}
                disabled={!isTracking}
                className="bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 text-white py-2 px-4 rounded-lg font-medium transition"
              >
                Pause Tracking
              </button>
              <button 
                onClick={handleStopTracking}
                className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg font-medium transition"
              >
                Stop Tracking
              </button>
              <button 
                onClick={handleResetRoute}
                className="bg-gray-800 hover:bg-gray-900 text-white py-2 px-4 rounded-lg font-medium transition"
              >
                Reset Route
              </button>
            </div>
          </div>

          {/* GPS Section */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-xl font-semibold border-b pb-2 mb-4">GPS Data</h2>
            <div className="text-sm space-y-2 mb-4">
              <p><span className="font-medium">Lat:</span> {busData.lat.toFixed(6)}</p>
              <p><span className="font-medium">Lng:</span> {busData.lng.toFixed(6)}</p>
              <p><span className="font-medium">Speed:</span> {Math.round(busData.speed)} km/h</p>
              <p><span className="font-medium">Last Sync:</span> {lastSyncTime ? lastSyncTime.toLocaleTimeString() : 'Never'}</p>
            </div>
            <div className="flex flex-col space-y-2">
              <button onClick={fetchDeviceGPS} className="border border-blue-600 text-blue-600 hover:bg-blue-50 py-1 px-4 rounded-lg transition">
                Fetch Device GPS
              </button>
              <button onClick={() => pushToFirebase(busData)} className="border border-green-600 text-green-600 hover:bg-green-50 py-1 px-4 rounded-lg transition">
                Push GPS to Firebase
              </button>
            </div>
          </div>
        </div>

        {/* Manual Simulation Mode */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-xl font-semibold border-b pb-2 mb-4 text-purple-700">Manual Simulation Mode (Testing)</h2>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => moveBus(10)} className="bg-purple-100 text-purple-700 hover:bg-purple-200 py-2 px-4 rounded-lg font-medium">
              Move Forward 10m
            </button>
            <button onClick={() => moveBus(-10)} className="bg-purple-100 text-purple-700 hover:bg-purple-200 py-2 px-4 rounded-lg font-medium">
              Move Backward 10m
            </button>
            <button onClick={() => setBusData(p => ({...p, speed: p.speed + 5}))} className="bg-purple-100 text-purple-700 hover:bg-purple-200 py-2 px-4 rounded-lg font-medium">
              Increase Speed (+5)
            </button>
            <button onClick={() => setBusData(p => ({...p, speed: Math.max(0, p.speed - 5)}))} className="bg-purple-100 text-purple-700 hover:bg-purple-200 py-2 px-4 rounded-lg font-medium">
              Decrease Speed (-5)
            </button>
            <button onClick={jumpToNextStop} className="bg-purple-600 text-white hover:bg-purple-700 py-2 px-4 rounded-lg font-medium">
              Reach Next Stop
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
