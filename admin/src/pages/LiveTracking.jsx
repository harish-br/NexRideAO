import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../firebase';
import { getApp } from 'firebase/app';
import { getDatabase, ref, onValue, off } from 'firebase/database';
import { collection, onSnapshot } from 'firebase/firestore';
import StopTimeline from '../components/tracking/StopTimeline';

// ─── Config ────────────────────────────────────────────────────────────────────
const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// ─── Status helpers ────────────────────────────────────────────────────────────
const STATUS_CFG = {
  'Active':      { label: 'On Route',    dot: '#12B76A', bg: '#ECFDF3', color: '#027A48' },
  'On Route':    { label: 'On Route',    dot: '#12B76A', bg: '#ECFDF3', color: '#027A48' },
  'At Stop':     { label: 'At Stop',     dot: '#2563EB', bg: '#EFF6FF', color: '#1D4ED8' },
  'Delayed':     { label: 'Delayed',     dot: '#F59E0B', bg: '#FFFBEB', color: '#92400E' },
  'Offline':     { label: 'Offline',     dot: '#9CA3AF', bg: '#F3F4F6', color: '#6B7280' },
  'Halted':      { label: 'Offline',     dot: '#9CA3AF', bg: '#F3F4F6', color: '#6B7280' },
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
  const ts      = live && (live.lastUpdated || live.timestamp);
  const elapsed = useElapsed(ts);
  const isLive  = live && live.isOnline === true;
  const isStale = ts && (Date.now() - new Date(ts).getTime()) > 120000;
  const lat     = live && (live.latitude  || live.lat);
  const lng     = live && (live.longitude || live.lng);
  const spd     = live && live.speed   != null ? Math.round(live.speed)   + ' km/h' : null;
  const hdg     = live && live.heading != null ? Math.round(live.heading) + '°'     : null;

  const stops  = bus.stops || [];
  const sorted = [...stops].sort((a, b) => (a.order || a.stopOrder || 0) - (b.order || b.stopOrder || 0));
  const origin = sorted[0];
  const dest   = sorted[sorted.length - 1];
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

// ─── Bus card ──────────────────────────────────────────────────────────────────
function BusCard({ bus, expanded, onToggle, live, onPositionChange }) {
  const route = bus.assignedRouteName || bus.routeName || bus.route || null;

  return (
    <div
      className={`order-card${expanded ? ' expanded active' : ''}`}
      onClick={onToggle}
    >
      {/* Header */}
      <div className="card-header">
        <div className="route">
          <span style={{ fontSize: '15px', fontWeight: '700', color: '#111', letterSpacing: '-0.3px', flexShrink: 0 }}>
            {bus.busNumber || '—'}
          </span>
          {route && (
            <span
              style={{ fontSize: '13px', color: '#666', fontWeight: '400', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={route}
            >
              &nbsp;·&nbsp;{route}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <StatusBadge bus={bus} live={live} />
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#9CA3AF"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transition: 'transform 0.3s ease',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)'
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {/* Bus ID row */}
      <p className="order-id">
        {bus.registrationNumber || bus.regNumber || bus.id?.slice(0, 8) || ''}
      </p>

      {/* Expanded Stop Timeline matching Image 2 */}
      {expanded && (
        <div onClick={e => e.stopPropagation()} className="expanded-timeline-section">
          <StopTimeline bus={bus} live={live} onPositionChange={onPositionChange} />
        </div>
      )}
    </div>
  );
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────
const TABS = [
  { key: 'all',      label: 'All' },
  { key: 'on_route', label: 'On Route' },
  { key: 'at_stop',  label: 'At Stop' },
  { key: 'delayed',  label: 'Delayed' },
  { key: 'offline',  label: 'Offline' },
];

function matchTab(bus, live, tab) {
  if (tab === 'all') return true;
  const l = getBusCfg(bus, live).label.toLowerCase().replace(' ', '_');
  return l === tab;
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function LiveTracking({ onSelectBus }) {
  const [buses, setBuses]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [search, setSearch]       = useState('');
  const [deb, setDeb]             = useState('');
  const [tab, setTab]             = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [liveMap, setLiveMap]     = useState({});
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);
  const listeners = useRef({});
  const rtdb = useRef(null);

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

  const toggle = id => {
    setExpandedId(prev => {
      const nextId = prev === id ? null : id;
      if (nextId && onSelectBus) {
        const selected = buses.find(b => b.id === nextId);
        if (selected) {
          const live = liveMap[selected.id];
          const lat = live?.latitude ?? live?.lat ?? selected?.lat ?? selected?.latitude;
          const lng = live?.longitude ?? live?.lng ?? selected?.lng ?? selected?.longitude;
          onSelectBus({
            id: selected.id,
            busNumber: selected.busNumber,
            lat: lat ? parseFloat(lat) : 11.5760,
            lng: lng ? parseFloat(lng) : 77.7014,
            status: selected.status
          });
        }
      } else if (!nextId && onSelectBus) {
        onSelectBus(null);
      }
      return nextId;
    });
  };

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
          transition: width 0.25s ease, opacity 0.2s ease;
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
            <div style={{ fontSize: '24px', marginBottom: '10px' }}>🚌</div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#111', marginBottom: '4px' }}>No buses found</div>
            <div style={{ fontSize: '13px', color: '#9CA3AF' }}>{deb ? 'Try a different search.' : 'No active buses right now.'}</div>
          </div>
        ) : filtered.map(bus => (
          <BusCard
            key={bus.id}
            bus={bus}
            expanded={expandedId === bus.id}
            onToggle={() => toggle(bus.id)}
            live={liveMap[bus.id]}
            onPositionChange={onSelectBus}
          />
        ))}
      </div>
    </div>
  );
}
