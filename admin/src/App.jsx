import React, { useEffect, useState, useMemo, useRef } from 'react';
import { auth, db, rtdb } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
import { ref, onValue, off } from 'firebase/database';
import { APIProvider, Map, Marker, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import LocationIcon from './assets/svg/location.svg?react';
import SidePanel from './components/SidePanel';
import Login from './pages/Login';
import busMarkerImg from './assets/bus-marker.png';

function getBusCoords(bus, live) {
  let lat = null;
  let lng = null;

  // 1. Live RTDB telematics coordinates
  if (live && live.latitude != null && live.longitude != null) {
    lat = parseFloat(live.latitude);
    lng = parseFloat(live.longitude);
  } else if (live && live.lat != null && live.lng != null) {
    lat = parseFloat(live.lat);
    lng = parseFloat(live.lng);
  } 
  // 2. Real Firestore database bus coordinates
  else if (bus && bus.latitude != null && bus.longitude != null) {
    lat = parseFloat(bus.latitude);
    lng = parseFloat(bus.longitude);
  } else if (bus && bus.lat != null && bus.lng != null) {
    lat = parseFloat(bus.lat);
    lng = parseFloat(bus.lng);
  }

  if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
    return { lat, lng };
  }
  return null;
}

function MapController({ userLocation, setMapLoaded, trackedBus, busesWithPos }) {
  const map = useMap();
  const hasAutoCentered = useRef(false);

  useEffect(() => {
    if (!map) return;
    const listener = window.google.maps.event.addListenerOnce(map, 'tilesloaded', () => {
      setMapLoaded(true);
    });
    return () => window.google.maps.event.removeListener(listener);
  }, [map, setMapLoaded]);

  useEffect(() => {
    if (!map) return;
    if (trackedBus && trackedBus.lat && trackedBus.lng) {
      map.panTo({ lat: trackedBus.lat, lng: trackedBus.lng });
      map.setZoom(15);
    } else if (userLocation) {
      map.panTo(userLocation);
      map.setZoom(14);
    } else if (!hasAutoCentered.current && busesWithPos && busesWithPos.length > 0) {
      hasAutoCentered.current = true;
      if (busesWithPos.length === 1) {
        map.panTo(busesWithPos[0].coords);
        map.setZoom(14);
      } else {
        const bounds = new window.google.maps.LatLngBounds();
        busesWithPos.forEach(item => bounds.extend(item.coords));
        map.fitBounds(bounds, { top: 80, bottom: 80, left: 100, right: 80 });
      }
    }
  }, [map, trackedBus, userLocation, busesWithPos]);
  return null;
}

function LocateMeButton({ userLocation, activeNav }) {
  const map = useMap();
  const isVisible = activeNav === 'live' && userLocation;

  return (
    <button
      onClick={() => {
        if (map && isVisible) {
          map.panTo(userLocation);
          map.setZoom(15);
        }
      }}
      style={{
        position: 'absolute',
        bottom: '32px',
        right: '32px',
        width: '38px',
        height: '38px',
        borderRadius: '12px',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.5)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: isVisible ? 'pointer' : 'default',
        zIndex: 10,
        color: '#134eff',
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.8) translateY(10px)',
        pointerEvents: isVisible ? 'auto' : 'none',
        transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
      title="Re-center to my location"
    >
      <LocationIcon width={24} height={24} />
    </button>
  );
}

export default function App() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const [userLocation, setUserLocation] = useState(null);
  const [activeNav, setActiveNav] = useState('home');
  const [isFullView, setIsFullView] = useState(true);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [trackedBus, setTrackedBus] = useState(null);
  const [buses, setBuses] = useState([]);
  const [liveMap, setLiveMap] = useState({});
  const [selectedMarkerBus, setSelectedMarkerBus] = useState(null);
  const rtdbListeners = useRef({});

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.error("Error getting user location:", error);
        }
      );
    }
  }, []);

  // Subscribe to buses collection in Firestore
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'buses'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBuses(list);
    }, (err) => {
      console.error("Failed to load buses for map:", err);
    });
    return () => unsub();
  }, [user]);

  // Subscribe to entire RTDB live GPS telemetry node
  useEffect(() => {
    if (!rtdb) return;
    const busLiveRef = ref(rtdb, 'bus_live');
    const unsub = onValue(busLiveRef, (snap) => {
      setLiveMap(snap.val() || {});
    });
    return () => off(busLiveRef);
  }, []);

  // Compute all buses with valid coordinates (merging Firestore & RTDB live fleet)
  const busesWithPos = useMemo(() => {
    const list = [];
    const seen = new Set();

    // Process registered Firestore fleet buses
    buses.forEach(b => {
      const busNum = String(b.busNumber || b.id || '').replace(/^bus_/i, '').replace(/^bus/i, '').trim();
      const live =
        liveMap[b.id] ||
        liveMap[b.busNumber] ||
        liveMap[`BUS_${b.busNumber}`] ||
        liveMap[`bus_${b.busNumber}`] ||
        liveMap[busNum] ||
        liveMap[`BUS_${busNum}`] ||
        liveMap[`bus_${busNum}`];

      const coords = getBusCoords(b, live);
      if (coords) {
        if (busNum) seen.add(busNum);
        seen.add(String(b.id));
        const isSelected = trackedBus && (
          String(trackedBus.id) === String(b.id) ||
          String(trackedBus.busNumber) === String(b.busNumber)
        );
        list.push({
          bus: b,
          live,
          coords,
          isSelected,
          id: b.id
        });
      }
    });

    return list;
  }, [buses, liveMap, trackedBus]);

  // Bus icon definition for Google Maps (increased size for clear visibility)
  const getBusIcon = (isSelected) => {
    const iconUrl = busMarkerImg || '/bus-marker.png';
    if (typeof window !== 'undefined' && window.google?.maps?.Size) {
      const w = isSelected ? 72 : 56;
      const h = isSelected ? 29 : 22;
      return {
        url: iconUrl,
        scaledSize: new window.google.maps.Size(w, h),
        anchor: new window.google.maps.Point(w / 2, h / 2),
      };
    }
    return { url: iconUrl };
  };

  if (authLoading) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '4px solid rgba(37, 99, 235, 0.1)', borderTop: '4px solid #2563EB', borderRadius: '50%', animation: 'spin 1s linear infinite' }}>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <APIProvider apiKey={apiKey}>
      <div className={isMapLoaded ? "" : "map-skeleton-bg"} style={{ position: 'relative', width: '100vw', height: '100vh', transition: 'background 0.5s ease' }}>
        <Map
          style={{ width: '100%', height: '100%' }}
          defaultCenter={{ lat: 11.5760, lng: 77.7014 }}
          defaultZoom={11}
          mapTypeId="terrain"
          gestureHandling="greedy"
          disableDefaultUI={true}
          styles={[
            {
              featureType: "poi",
              stylers: [{ visibility: "off" }]
            }
          ]}
        >
          {/* User Location Marker */}
          {userLocation && (
            <Marker
              position={userLocation}
              title="Your Current Location"
              icon={{
                path: 0,
                fillColor: '#134eff',
                fillOpacity: 1,
                strokeColor: 'white',
                strokeWeight: 2,
                scale: 7
              }}
            />
          )}

          {/* Bus markers on their current location with minimal size */}
          {busesWithPos.map(({ bus, live, coords, isSelected }) => (
            <Marker
              key={bus.id}
              position={coords}
              title={`Bus ${bus.busNumber || bus.id}${bus.assignedRouteName ? ` - ${bus.assignedRouteName}` : ''}`}
              icon={getBusIcon(isSelected)}
              zIndex={isSelected ? 100 : 20}
              onClick={() => {
                setTrackedBus({
                  id: bus.id,
                  busNumber: bus.busNumber,
                  lat: coords.lat,
                  lng: coords.lng,
                  status: bus.status
                });
                setSelectedMarkerBus({ bus, live, coords });
              }}
            />
          ))}

          {/* Compact InfoWindow when a bus is clicked */}
          {selectedMarkerBus && (
            <InfoWindow
              position={selectedMarkerBus.coords}
              onCloseClick={() => setSelectedMarkerBus(null)}
              pixelOffset={[0, -12]}
            >
              <div style={{ padding: '6px 8px', minWidth: '150px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 800, fontSize: '13px', color: '#111827' }}>
                    {selectedMarkerBus.bus.busNumber ? `Bus ${selectedMarkerBus.bus.busNumber}` : (selectedMarkerBus.bus.registrationNumber || 'Bus')}
                  </span>
                  <span style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '999px',
                    fontWeight: 700,
                    backgroundColor: selectedMarkerBus.live?.isOnline ? '#ECFDF3' : '#F3F4F6',
                    color: selectedMarkerBus.live?.isOnline ? '#027A48' : '#4B5563',
                  }}>
                    {selectedMarkerBus.live?.isOnline ? 'GPS Live' : (selectedMarkerBus.bus.status || 'Offline')}
                  </span>
                </div>
                {selectedMarkerBus.bus.assignedRouteName && (
                  <div style={{ fontSize: '11px', color: '#4B5563', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Route: {selectedMarkerBus.bus.assignedRouteName}
                  </div>
                )}
                <div style={{ fontSize: '11px', color: '#6B7280', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {selectedMarkerBus.live?.speed != null && selectedMarkerBus.live.speed > 0 ? (
                    <span>Speed: <strong>{Math.round(selectedMarkerBus.live.speed)} km/h</strong></span>
                  ) : (
                    <span>Status: <strong>{selectedMarkerBus.live?.status || selectedMarkerBus.bus.status || 'At Stop'}</strong></span>
                  )}
                  {selectedMarkerBus.bus.assignedDriverName && (
                    <span>Driver: {selectedMarkerBus.bus.assignedDriverName}</span>
                  )}
                </div>
              </div>
            </InfoWindow>
          )}
        </Map>
        <MapController userLocation={userLocation} setMapLoaded={setIsMapLoaded} trackedBus={trackedBus} busesWithPos={busesWithPos} />
        <LocateMeButton userLocation={userLocation} activeNav={activeNav} trackedBus={trackedBus} />
        <SidePanel
          activeNav={activeNav}
          setActiveNav={setActiveNav}
          isFullView={isFullView}
          setIsFullView={setIsFullView}
          userLocation={userLocation}
          onSelectBus={(busInfo) => {
            setTrackedBus(busInfo);
            const found = busesWithPos.find(b => String(b.bus.id) === String(busInfo.id));
            if (found) {
              setSelectedMarkerBus(found);
            }
          }}
        />
      </div>
    </APIProvider>
  );
}
