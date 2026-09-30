import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db } from '../../firebase';
import { doc, getDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import busImg from '../../assets/Subject.png';
import './StopTimeline.css';

// Approximate coordinates for Salem - Mettur - Bhavani highway stops (used if database lat/lng is missing)
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

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // meters
  const toRad = x => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

export default function StopTimeline({ bus, live, onPositionChange }) {
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busY, setBusY] = useState(0);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [nextIdx, setNextIdx] = useState(1);
  const [isMoving, setIsMoving] = useState(false);

  const containerRef = useRef(null);
  const busTrackerRef = useRef(null);
  const stopRefs = useRef([]);

  // Resolve telemetry (ignore mock bus data if no live GPS data exists)
  const hasLiveData = live !== null && live !== undefined;
  const isOnline = hasLiveData && live.isOnline !== false;
  
  const lat = isOnline ? (live.latitude ?? live.lat ?? bus?.lat ?? bus?.latitude) : null;
  const lng = isOnline ? (live.longitude ?? live.lng ?? bus?.lng ?? bus?.longitude) : null;
  const speed = isOnline ? (live.speed ?? 0) : 0;
  const status = isOnline ? (live.status || bus?.status || 'Active') : 'Offline';

  // Notify parent of location changes for map synchronization
  useEffect(() => {
    if (lat && lng && onPositionChange) {
      onPositionChange({
        id: bus.id,
        busNumber: bus.busNumber,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        status
      });
    }
  }, [lat, lng, bus.id, bus.busNumber, status, onPositionChange]);

  // 1. Fetch & Listen to Route Stops from Firestore
  useEffect(() => {
    let unsub = null;

    async function loadStops() {
      setLoading(true);
      const busNum = String(bus.busNumber || '').trim();
      const routeId = bus.assignedRouteId;

      // 1. If assignedRouteId is known
      if (routeId) {
        unsub = onSnapshot(doc(db, 'routes', routeId), (snap) => {
          if (snap.exists() && Array.isArray(snap.data().stops) && snap.data().stops.length > 0) {
            setStops(sanitizeStops(snap.data().stops));
            setLoading(false);
          } else {
            fallbackBusStops();
          }
        }, () => fallbackBusStops());
        return;
      }

      // 2. Query routes collection
      try {
        const q = query(collection(db, 'routes'), where('assignedBus', 'in', [busNum, `bus_${busNum}`, bus.id]));
        const qSnap = await getDocs(q);
        if (!qSnap.empty) {
          const rDoc = qSnap.docs[0];
          unsub = onSnapshot(doc(db, 'routes', rDoc.id), (snap) => {
            if (snap.exists() && Array.isArray(snap.data().stops)) {
              setStops(sanitizeStops(snap.data().stops));
              setLoading(false);
            }
          });
          return;
        }
      } catch (err) {
        console.warn('[StopTimeline] routes query error:', err);
      }

      fallbackBusStops();
    }

    function fallbackBusStops() {
      if (Array.isArray(bus.stops) && bus.stops.length > 0) {
        setStops(sanitizeStops(bus.stops));
      }
      setLoading(false);
    }

    function sanitizeStops(rawStops) {
      return (rawStops || []).map((s, idx) => {
        const name = s.name || s.stopName || `Stop ${idx + 1}`;
        const key = name.toLowerCase().trim();
        const fallback = KNOWN_COORDS[key] || null;

        const stopLat = parseFloat(s.lat || s.latitude) || fallback?.lat || null;
        const stopLng = parseFloat(s.lng || s.longitude) || fallback?.lng || null;
        const time = s.morningArrival || s.arrivalTime || s.scheduledArrival || s.eveningArrival || '';

        return {
          id: s.id || `stop-${idx}`,
          name,
          time,
          lat: stopLat,
          lng: stopLng,
          order: s.order || s.stopOrder || idx + 1
        };
      });
    }

    loadStops();

    return () => {
      if (unsub) unsub();
    };
  }, [bus.id, bus.busNumber, bus.assignedRouteId, bus.stops]);

  // 2. Calculate Current Leg and Next Leg
  useEffect(() => {
    if (stops.length === 0) return;

    let cIdx = 0;
    let nIdx = 1;
    let moving = speed > 5 || status === 'On Route' || status === 'Active';

    // A) Explicit DB index
    if (typeof live?.currentStopIndex === 'number') {
      cIdx = live.currentStopIndex;
      nIdx = live.nextStopIndex ?? Math.min(cIdx + 1, stops.length - 1);
    } else if (typeof bus?.currentStopIndex === 'number') {
      cIdx = bus.currentStopIndex;
      nIdx = bus.nextStopIndex ?? Math.min(cIdx + 1, stops.length - 1);
    } else if (lat && lng) {
      // B) GPS to stop distance matching
      const busLat = parseFloat(lat);
      const busLng = parseFloat(lng);
      let minDev = Infinity;
      let bestLeg = 0;

      for (let i = 0; i < stops.length - 1; i++) {
        const s1 = stops[i];
        const s2 = stops[i + 1];
        if (s1.lat && s1.lng && s2.lat && s2.lng) {
          const d1 = haversineDistance(s1.lat, s1.lng, busLat, busLng);
          const d2 = haversineDistance(busLat, busLng, s2.lat, s2.lng);
          const total = haversineDistance(s1.lat, s1.lng, s2.lat, s2.lng);
          const deviation = (d1 + d2) - total;
          if (deviation < minDev) {
            minDev = deviation;
            bestLeg = i;
          }
        }
      }
      cIdx = bestLeg;
      nIdx = Math.min(bestLeg + 1, stops.length - 1);
    } else {
      // C) Default fallback if no GPS and no index
      cIdx = 0;
      nIdx = Math.min(1, stops.length - 1);
    }

    if (status === 'Offline' || status === 'Halted' || status === 'Stopped') {
      moving = false;
    }

    setCurrentIdx(cIdx);
    setNextIdx(nIdx);
    setIsMoving(moving);
  }, [stops, lat, lng, speed, status, live?.currentStopIndex, live?.nextStopIndex, bus?.currentStopIndex, bus?.nextStopIndex]);

  // 3. Compute Target Y Position on Timeline Track
  useEffect(() => {
    if (stops.length === 0 || stopRefs.current.length === 0) return;

    const clampedCurrent = Math.max(0, Math.min(currentIdx, stops.length - 1));
    const clampedNext = Math.max(0, Math.min(nextIdx, stops.length - 1));

    const fromEl = stopRefs.current[clampedCurrent];
    const toEl = stopRefs.current[clampedNext];

    if (!fromEl) return;

    let progress = 0;

    if (isMoving && clampedCurrent < clampedNext && lat && lng) {
      const s1 = stops[clampedCurrent];
      const s2 = stops[clampedNext];
      if (s1.lat && s1.lng && s2.lat && s2.lng) {
        const total = haversineDistance(s1.lat, s1.lng, s2.lat, s2.lng);
        const travelled = haversineDistance(s1.lat, s1.lng, parseFloat(lat), parseFloat(lng));
        progress = total > 0 ? Math.max(0, Math.min(0.92, travelled / total)) : 0;
      } else {
        progress = 0.45; // Smooth visual representation between stops
      }
    } else if (isMoving && clampedCurrent < clampedNext) {
      progress = 0.35;
    }

    const fromY = fromEl.offsetTop + 14;
    const toY = toEl ? toEl.offsetTop + 14 : fromY;
    const computedY = fromY + (toY - fromY) * progress;

    setBusY(computedY);

    if (busTrackerRef.current) {
      busTrackerRef.current.style.transition = isMoving
        ? 'transform 1.2s cubic-bezier(0.16, 1, 0.3, 1)'
        : 'transform 0.3s ease';
      busTrackerRef.current.style.transform = `translate3d(0, ${computedY}px, 0)`;
    }
  }, [currentIdx, nextIdx, stops, isMoving, lat, lng]);

  const etaDisplay = useMemo(() => {
    if (live?.etaMinutes) return `${live.etaMinutes} min`;
    if (bus?.etaMinutes) return `${bus.etaMinutes} min`;
    return null;
  }, [live?.etaMinutes, bus?.etaMinutes]);

  if (loading) {
    return (
      <div className="stop-timeline-wrapper">
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: '10px', width: '32px', background: '#F8F9FA' }} />
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="timeline-skeleton-row">
              <div className="timeline-skeleton-dot" />
              <div style={{ flex: 1, padding: '0 16px 0 20px' }}>
                <div className="timeline-skeleton-bar" style={{ width: `${70 + i * 20}px`, marginBottom: '6px' }} />
                <div className="timeline-skeleton-bar" style={{ width: '42px', marginLeft: 'auto' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }


  if (stops.length === 0) {
    return (
      <div className="stop-timeline-wrapper">
        <div style={{ padding: '24px 16px', textAlign: 'center', color: '#6B7280', fontSize: '13px' }}>
          No stop timeline configured for this route.
        </div>
      </div>
    );
  }

  return (
    <div className="stop-timeline-wrapper">
      {/* Live status banner */}
      <div className="timeline-status-banner">
        <div className="timeline-status-left">
          <span
            className={`timeline-pulse-dot ${isMoving ? 'pulse' : ''}`}
            style={{
              backgroundColor: !isOnline ? '#9CA3AF' : isMoving ? '#12B76A' : '#2563EB'
            }}
          />
          <span style={{ color: !isOnline ? '#6B7280' : isMoving ? '#027A48' : '#1D4ED8' }}>
            {!isOnline ? 'Offline' : isMoving ? (speed ? `Moving · ${Math.round(speed)} km/h` : 'On Route') : 'At Stop'}
          </span>
        </div>
        <div className="timeline-status-right">
          {etaDisplay ? `ETA to next stop: ${etaDisplay}` : `${stops.length} Stops`}
        </div>
      </div>

      {/* Main Timeline Scroll Area */}
      <div className="route-timeline-container" ref={containerRef}>
        {/* Stops List */}
        <div className="stops-list">
          {/* Vertical Track on the left (now scales to full height of stops) */}
          <div className="tracking-track" />

          {/* Dynamic Bus Tracker (moves along the route track) */}
          <div className="bus-tracker" ref={busTrackerRef}>
            <img
              src={busImg}
              alt="Bus Icon"
              className="tracking-bus-img"
            />
            <div className={`tracking-arrow ${isMoving ? 'arrow-animating' : ''}`}>
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ filter: 'drop-shadow(0px 3px 4px rgba(0,0,0,0.2))', marginTop: '-2px' }}
              >
                <path
                  d="M3.5 5.5L12 18.5L20.5 5.5H3.5Z"
                  fill="white"
                  stroke="white"
                  strokeWidth="4"
                  strokeLinejoin="round"
                />
                <path
                  d="M3.5 5.5L12 18.5L20.5 5.5H3.5Z"
                  fill="#3B82F6"
                  stroke="#3B82F6"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  transformOrigin="12 10"
                  transform="scale(0.88)"
                />
              </svg>
            </div>
          </div>

          {stops.map((stop, idx) => {
            const isDeparted = idx < currentIdx;
            const isCurrent = idx === currentIdx;
            const isNext = idx === nextIdx && isMoving;
            const isUpcoming = idx > currentIdx;

            return (
              <div
                key={stop.id}
                ref={el => stopRefs.current[idx] = el}
                className={`stop-item ${isCurrent ? 'current-stop' : ''}`}
              >
                <div className="stop-icon-wrapper">
                  <div
                    className={`tracking-dot ${isDeparted ? 'departed' : isCurrent ? 'arrived' : 'upcoming'}`}
                  />
                </div>

                <div className="stop-info">
                  <div className="stop-name-row">
                    <div className="stop-title-wrap">
                      {isNext && (
                        <div className="heading-towards">Heading towards</div>
                      )}
                      <span className="stop-name" title={stop.name}>
                        {stop.name}
                      </span>
                    </div>

                    <span
                      className={`stop-time ${isCurrent && !isMoving ? 'arrived-text' : isDeparted ? 'departed-text' : ''}`}
                    >
                      {stop.time || '—'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
