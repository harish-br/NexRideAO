import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase';
import { getApp } from 'firebase/app';
import { getDatabase, ref, onValue, off } from 'firebase/database';
import { collection, onSnapshot } from 'firebase/firestore';

// ─── Config ────────────────────────────────────────────────────────────────────
const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// ─── Status helpers ────────────────────────────────────────────────────────────
const STATUS_CFG = {
  'Active': { label: 'On Route', dot: '#12B76A', bg: '#ECFDF3', color: '#027A48' },
  'On Route': { label: 'On Route', dot: '#12B76A', bg: '#ECFDF3', color: '#027A48' },
  'At Stop': { label: 'At Stop', dot: '#2563EB', bg: '#EFF6FF', color: '#1D4ED8' },
  'Delayed': { label: 'Delayed', dot: '#F59E0B', bg: '#FFFBEB', color: '#92400E' },
  'Offline': { label: 'Offline', dot: '#9CA3AF', bg: '#F3F4F6', color: '#6B7280' },
  'Halted': { label: 'Offline', dot: '#9CA3AF', bg: '#F3F4F6', color: '#6B7280' },
  'Maintenance': { label: 'Maintenance', dot: '#9CA3AF', bg: '#F3F4F6', color: '#6B7280' },
};

function getBusCfg(bus, live) {
  // Ignore mock Firestore data if there is no live GPS connection.
  // If live is explicitly null (no GPS data found) or isOnline is false, mark as Offline.
  if (live === null || (live && live.isOnline === false)) {
    return STATUS_CFG['Offline'];
  }
  // If live is undefined, it means RTDB hasn't responded yet. We can assume Offline temporarily.
  if (live === undefined) {
    return STATUS_CFG['Offline'];
  }

  return STATUS_CFG[bus.status] || STATUS_CFG['Active'];
}

function StatusBadge({ bus, live }) {
  const cfg = getBusCfg(bus, live);
  return (
    <span className="status-badge" style={{ background: cfg.bg, color: cfg.color }}>
      <span className="dot" style={{ background: cfg.dot }} />
      {cfg.label}
    </span>
  );
}

// ─── Elapsed timestamp ────────────────────────────────────────────────────────
function useElapsed(ts) {
  const [v, setV] = useState('');
  useEffect(() => {
    if (!ts) return;
    const tick = () => {
      const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
      setV(s < 60 ? s + 's ago' : s < 3600 ? Math.floor(s / 60) + 'm ago' : Math.floor(s / 3600) + 'h ago');
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [ts]);
  return v;
}

// ─── Google Maps loader (singleton) ──────────────────────────────────────────
let _loaded = false, _loading = false, _q = [];
function loadMaps() {
  return new Promise(res => {
    if (_loaded) return res();
    _q.push(res);
    if (_loading) return;
    _loading = true;
    window.__lbGmReady = () => { _loaded = true; _q.forEach(f => f()); _q = []; };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&callback=__lbGmReady`;
    s.async = true;
    document.head.appendChild(s);
  });
}

// ─── Compact map ──────────────────────────────────────────────────────────────
function BusMap({ lat, lng, stops }) {
  const el = useRef(null);
  const gmap = useRef(null);
  const gmarker = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => { loadMaps().then(() => setReady(true)); }, []);

  useEffect(() => {
    if (!ready || !el.current || !lat || !lng) return;
    const pos = { lat, lng };
    if (!gmap.current) {
      gmap.current = new window.google.maps.Map(el.current, {
        center: pos, zoom: 14,
        mapTypeControl: false, streetViewControl: false, fullscreenControl: false, zoomControl: true,
        styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }],
      });
      gmarker.current = new window.google.maps.Marker({
        position: pos, map: gmap.current,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: '#134eff', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5 },
        zIndex: 10,
      });
      (stops || []).filter(s => s.lat && s.lng).forEach(s => {
        new window.google.maps.Marker({
          position: { lat: s.lat, lng: s.lng }, map: gmap.current,
          icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 4, fillColor: '#9CA3AF', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 1.5 },
          title: s.name || s.stopName,
        });
      });
    } else {
      gmap.current.panTo(pos);
      gmarker.current?.setPosition(pos);
    }
  }, [ready, lat, lng]);

  return (
    <div style={{ height: '200px', borderRadius: '14px', overflow: 'hidden', background: '#E5E7EB', marginBottom: '16px', position: 'relative' }}>
      {!ready && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', color: '#9CA3AF' }}>
          Loading map…
        </div>
      )}
      <div ref={el} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

// ─── Expanded detail (inside the card) ────────────────────────────────────────
function ExpandedDetail({ bus, live }) {
  const ts = live && (live.lastUpdated || live.timestamp);
  const elapsed = useElapsed(ts);
  const isLive = live && live.isOnline === true;
  const isStale = ts && (Date.now() - new Date(ts).getTime()) > 120000;
  const lat = live && (live.latitude || live.lat);
  const lng = live && (live.longitude || live.lng);
  const spd = live && live.speed != null ? Math.round(live.speed) + ' km/h' : null;
  const hdg = live && live.heading != null ? Math.round(live.heading) + '°' : null;

  const stops = bus.stops || [];
  const sorted = [...stops].sort((a, b) => (a.order || a.stopOrder || 0) - (b.order || b.stopOrder || 0));
  const origin = sorted[0];
  const dest = sorted[sorted.length - 1];
  const driver = bus.assignedDriverName || bus.driverName;

  return (
    <div className="expanded-content">

      {/* Live status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
        {isLive && !isStale ? (
          <>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#12B76A', display: 'inline-block', animation: 'lbPulse 1.8s ease infinite' }} />
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#065F46' }}>Live</span>
            {elapsed && <span style={{ fontSize: '12px', color: '#9CA3AF' }}>· {elapsed}</span>}
          </>
        ) : isStale ? (
          <span style={{ fontSize: '12px', color: '#92400E', fontWeight: '500' }}>⚠ Delayed · {elapsed}</span>
        ) : (
          <span style={{ fontSize: '12px', color: '#9CA3AF' }}>{ts ? 'Last seen ' + elapsed : 'Location unavailable'}</span>
        )}
      </div>

      {/* Map */}
      {lat && lng ? (
        <BusMap lat={lat} lng={lng} stops={stops} />
      ) : (
        <div style={{ height: '60px', borderRadius: '12px', background: '#F9FAFB', border: '1px dashed #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#9CA3AF', marginBottom: '16px' }}>
          No live location
        </div>
      )}

      {/* Route timeline */}
      {origin && dest && origin !== dest && (
        <div className="timeline">
          <div style={{ marginBottom: '20px' }}>
            <div className="timeline-icon" />
            <div className="timeline-label">Origin</div>
            <div className="timeline-address">{origin.name || origin.stopName}</div>
          </div>
          <div>
            <div className="timeline-icon outline" />
            <div className="timeline-label">Destination</div>
            <div className="timeline-address">{dest.name || dest.stopName}</div>
          </div>
        </div>
      )}

      {/* Live data row */}
      {(spd || hdg || (lat && lng)) && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {spd && (
            <div style={{ flex: 1, minWidth: '80px', background: '#F9FAFB', borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '500', marginBottom: '2px' }}>Speed</div>
              <div style={{ fontSize: '15px', fontWeight: '700', color: '#111' }}>{spd}</div>
            </div>
          )}
          {hdg && (
            <div style={{ flex: 1, minWidth: '80px', background: '#F9FAFB', borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '500', marginBottom: '2px' }}>Heading</div>
              <div style={{ fontSize: '15px', fontWeight: '700', color: '#111' }}>{hdg}</div>
            </div>
          )}
          {lat && lng && (
            <div style={{ flex: 2, minWidth: '140px', background: '#F9FAFB', borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '500', marginBottom: '2px' }}>Coordinates</div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#111', fontFamily: 'monospace' }}>{lat.toFixed(5)}, {lng.toFixed(5)}</div>
            </div>
          )}
        </div>
      )}

      {/* Driver */}
      {driver && (
        <div className="courier-info">
          <div className="courier-profile">
            <div style={{
              width: '40px', height: '40px', borderRadius: '50%',
              background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '14px', fontWeight: '700', color: '#4F46E5', flexShrink: 0,
            }}>
              {driver.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div className="courier-details">
              <h4>{driver}</h4>
              <p>Assigned Driver</p>
            </div>
          </div>
        </div>
      )}

      {/* Bus reg + timings */}
      {(bus.registrationNumber || bus.regNumber) && (
        <div style={{ fontSize: '12px', color: '#9CA3AF', fontFamily: 'monospace', marginBottom: '4px', textAlign: 'center' }}>
          {bus.registrationNumber || bus.regNumber}
        </div>
      )}
    </div>
  );
}


// ─── 12-Hour Time Formatter ────────────────────────────────────────────────
function formatTime12(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return '';
  const trimmed = timeStr.trim();
  if (!trimmed) return '';
  if (/(am|pm)/i.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match) {
    let hour = parseInt(match[1], 10);
    const minute = match[2];
    const period = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12;
    if (hour === 0) hour = 12;
    return `${hour}:${minute} ${period}`;
  }
  return trimmed;
}

// ─── Bus card ───────────────────────────────────────────────────────────────
function BusCard({ bus, live, isSelected, onCardClick, onPositionChange }) {
  const route = bus.assignedRouteName || bus.routeName || bus.route || null;
  const driver = bus.assignedDriverName || bus.driverName || null;

  // Schedule — support nested (schedules.*) and flat (operatingTimings.*) schemas
  const sched = bus.schedules || {};
  const opTimings = bus.operatingTimings || {};
  const mDep = sched.morningDeparture || opTimings.morning?.departure || bus.morningDeparture || null;
  const mArr = sched.morningArrival || opTimings.morning?.arrival || bus.morningArrival || null;
  const eDep = sched.eveningDeparture || opTimings.evening?.departure || bus.eveningDeparture || null;
  const eArr = sched.eveningArrival || opTimings.evening?.arrival || bus.eveningArrival || null;

  // Show morning (midnight–noon) or evening (noon–midnight)
  const isMorning = new Date().getHours() < 12;
  const showDep = isMorning ? mDep : eDep;
  const showArr = isMorning ? mArr : eArr;
  const dep12 = formatTime12(showDep);
  const arr12 = formatTime12(showArr);
  const hasSchedule = Boolean(dep12 || arr12);

  const fontStack = "'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif";
  const iconStyle = { flexShrink: 0, display: 'block' };

  const handleSelect = () => {
    if (onCardClick) {
      onCardClick(bus);
    }
    if (onPositionChange) {
      const lat = live?.latitude ?? live?.lat ?? bus?.lat ?? bus?.latitude;
      const lng = live?.longitude ?? live?.lng ?? bus?.lng ?? bus?.longitude;
      onPositionChange({
        id: bus.id,
        busNumber: bus.busNumber,
        lat: lat ? parseFloat(lat) : 11.5760,
        lng: lng ? parseFloat(lng) : 77.7014,
        status: bus.status
      });
    }
  };

  return (
    <div
      className={`order-card${isSelected ? ' selected' : ''}`}
      onClick={handleSelect}
      style={{ cursor: 'pointer' }}
    >
      {/* ── Row 1: Bus identity + status ── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: '10px', minWidth: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
          <span style={{
            fontSize: '15px', fontWeight: '700', color: '#111827',
            letterSpacing: '-0.3px', lineHeight: 1.2, flexShrink: 0,
            fontFamily: fontStack,
          }}>
            {bus.busNumber || '—'}
          </span>
          {route && (
            <span style={{
              fontSize: '14px', fontWeight: '500', color: '#4B5563',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              lineHeight: 1.2, fontFamily: fontStack,
            }} title={route}>
              {route}
            </span>
          )}
        </div>
        <div style={{ flexShrink: 0 }}>
          <StatusBadge bus={bus} live={live} />
        </div>
      </div>

      {/* ── Row 2: Driver & Timing horizontally ── */}
      {(driver || hasSchedule) && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: driver && hasSchedule ? 'space-between' : 'flex-start',
          gap: '10px',
          marginTop: '8px',
          minWidth: 0,
        }}>
          {driver && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              minWidth: 0,
              flex: 1,
              overflow: 'hidden',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={iconStyle}>
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
              <span style={{
                fontSize: '13px',
                fontWeight: '500',
                color: '#4B5563',
                fontFamily: fontStack,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                lineHeight: 1.3,
              }} title={driver}>
                {driver}
              </span>
            </div>
          )}

          {hasSchedule && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              flexShrink: 0,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={iconStyle}>
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span style={{
                fontSize: '12px',
                fontWeight: '500',
                color: '#6B7280',
                fontFamily: fontStack,
                whiteSpace: 'nowrap',
                lineHeight: 1.3,
              }}>
                {dep12 && arr12 ? (
                  <>
                    <span>{dep12}</span>
                    <span style={{ color: '#CBD5E1', margin: '0 4px', fontWeight: '400' }}>→</span>
                    <span>{arr12}</span>
                  </>
                ) : (
                  <span>{dep12 || arr12}</span>
                )}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'on_route', label: 'On Route' },
  { key: 'at_stop', label: 'At Stop' },
  { key: 'delayed', label: 'Delayed' },
  { key: 'offline', label: 'Offline' },
];

function matchTab(bus, live, tab) {
  if (tab === 'all') return true;
  const l = getBusCfg(bus, live).label.toLowerCase().replace(' ', '_');
  return l === tab;
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function LiveTracking({ onSelectBus }) {
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [deb, setDeb] = useState('');
  const [tab, setTab] = useState('all');
  const [liveMap, setLiveMap] = useState({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedBus, setSelectedBus] = useState(null);
  const [panelBus, setPanelBus] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const searchRef = useRef(null);
  const listeners = useRef({});
  const rtdb = useRef(null);

  const closePanel = useCallback(() => {
    if (!panelBus || isClosing) return;
    setIsClosing(true);
    setSelectedBus(null);
  }, [panelBus, isClosing]);

  const handleSelectBus = (busItem) => {
    if (selectedBus?.id === busItem.id) {
      closePanel();
    } else {
      setIsClosing(false);
      setSelectedBus(busItem);
      setPanelBus(busItem);
    }
  };

  const handleAnimationEnd = (e) => {
    if (isClosing && e.animationName === 'collapseRightToLeft') {
      setIsClosing(false);
      setPanelBus(null);
    }
  };

  // Close blank panel on Escape or outside click
  useEffect(() => {
    if (!panelBus || isClosing) return;
    const handleDown = (e) => {
      if (!e.target.closest('.bus-detail-panel') && !e.target.closest('.order-card')) {
        closePanel();
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') closePanel();
    };
    window.addEventListener('pointerdown', handleDown);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('pointerdown', handleDown);
      window.removeEventListener('keydown', handleKey);
    };
  }, [panelBus, isClosing, closePanel]);

  useEffect(() => {
    try { rtdb.current = getDatabase(getApp()); } catch (e) { /* no RTDB */ }
  }, []);

  // Debounce search
  useEffect(() => {
    const id = setTimeout(() => setDeb(search), 250);
    return () => clearTimeout(id);
  }, [search]);

  // Focus when search opens
  useEffect(() => {
    if (searchOpen && searchRef.current) searchRef.current.focus();
  }, [searchOpen]);

  // Firestore buses listener
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'buses'), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const ord = { Active: 0, 'On Route': 0, Delayed: 1, 'At Stop': 2, Offline: 3, Halted: 3, Maintenance: 4 };
      data.sort((a, b) => (ord[a.status] ?? 2) - (ord[b.status] ?? 2));
      setBuses(data);
      setLoading(false);
    }, () => { setError('Failed to load buses.'); setLoading(false); });
    return () => unsub();
  }, []);

  // Subscribe live for all buses
  useEffect(() => {
    if (!rtdb.current || buses.length === 0) return;

    buses.forEach(bus => {
      const busId = bus.id;
      if (!listeners.current[busId]) {
        const r = ref(rtdb.current, 'bus_live/' + busId);
        onValue(r, snap => {
          setLiveMap(prev => ({ ...prev, [busId]: snap.val() || null }));
        });
        listeners.current[busId] = r;
      }
    });
  }, [buses]);

  useEffect(() => {
    return () => { Object.values(listeners.current).forEach(r => off(r)); };
  }, []);



  const filtered = buses.filter(bus => {
    const live = liveMap[bus.id];
    if (!matchTab(bus, live, tab)) return false;
    if (!deb) return true;
    const q = deb.toLowerCase();
    return [bus.busNumber, bus.registrationNumber, bus.regNumber, bus.assignedRouteName, bus.routeName, bus.assignedDriverName, bus.driverName]
      .some(f => (f || '').toLowerCase().includes(q));
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <style>{`
        @keyframes lbPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.35;transform:scale(1.5)} }
        @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
        .lb-search-input {
          transition: width 0.25s ease, opacity 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .lb-search-input:focus {
          border-color: #2563EB !important;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12) !important;
        }
      `}</style>

      {/* Header — matches .header h1 exactly */}
      <div className="header">
        <h1>Live Bus</h1>
        {/* Expandable search — matches the reference circular button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {searchOpen && (
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Bus, route, driver…"
              className="lb-search-input"
              style={{
                height: '36px', padding: '0 12px',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: '100px', fontSize: '13px',
                background: '#fff', outline: 'none',
                width: search || searchOpen ? '160px' : '0px',
                opacity: searchOpen ? 1 : 0,
                color: '#111',
              }}
              onBlur={() => { if (!search) setSearchOpen(false); }}
              onKeyDown={e => { if (e.key === 'Escape') { setSearch(''); setSearchOpen(false); } }}
            />
          )}
          <button
            className="search-btn"
            onClick={() => { setSearchOpen(o => !o); if (searchOpen) { setSearch(''); } }}
            title="Search"
          >
            {searchOpen && search ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M1 1l12 12M13 1L1 13" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <circle cx="6.5" cy="6.5" r="5" />
                <path d="M11 11l2.5 2.5" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Filter tabs — matches .tabs / .tab */}
      <div className="tabs">
        {TABS.map(t => (
          <div
            key={t.key}
            className={`tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </div>
        ))}
      </div>

      {/* Bus list — matches .orders-list */}
      <div className="orders-list">
        {loading ? (
          <>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ borderRadius: '16px', padding: '16px', background: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.8)' }}>
                <div className="skeleton" style={{ width: '120px', height: '16px', borderRadius: '6px', marginBottom: '8px' }} />
                <div className="skeleton" style={{ width: '80px', height: '12px', borderRadius: '6px' }} />
              </div>
            ))}
          </>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF', fontSize: '13px' }}>⚠ {error}</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>No buses found</div>
            <div style={{ fontSize: '13px', color: '#9CA3AF' }}>{deb ? 'Try a different search.' : 'No active buses right now.'}</div>
          </div>
        ) : filtered.map(bus => (
          <BusCard
            key={bus.id}
            bus={bus}
            live={liveMap[bus.id]}
            isSelected={selectedBus?.id === bus.id}
            onCardClick={handleSelectBus}
            onPositionChange={onSelectBus}
          />
        ))}
      </div>

      {/* ── Blank Horizontal Bus Detail Panel (Placeholder for Live-Location) ── */}
      {panelBus !== null && createPortal(
        <div
          className={`bus-detail-panel${isClosing ? ' closing' : ''}`}
          onAnimationEnd={handleAnimationEnd}
          aria-label="Bus details"
        />,
        document.body
      )}
    </div>
  );
}
