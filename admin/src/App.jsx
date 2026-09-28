import React, { useEffect, useState } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { APIProvider, Map, Marker, useMap } from '@vis.gl/react-google-maps';
import LocationIcon from './assets/svg/location.svg?react';
import SidePanel from './components/SidePanel';
import Login from './pages/Login';

function MapController({ userLocation, setMapLoaded }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const listener = window.google.maps.event.addListenerOnce(map, 'tilesloaded', () => {
      setMapLoaded(true);
    });
    return () => window.google.maps.event.removeListener(listener);
  }, [map, setMapLoaded]);

  useEffect(() => {
    if (!map || !userLocation) return;
    map.panTo(userLocation);
    map.setZoom(15);
  }, [map, userLocation]);
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
          defaultCenter={{ lat: 41.0082, lng: 28.9784 }}
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
        </Map>
        <MapController userLocation={userLocation} setMapLoaded={setIsMapLoaded} />
        <LocateMeButton userLocation={userLocation} activeNav={activeNav} />
        <SidePanel
          activeNav={activeNav}
          setActiveNav={setActiveNav}
          isFullView={isFullView}
          setIsFullView={setIsFullView}
          userLocation={userLocation}
        />
      </div>
    </APIProvider>
  );
}
