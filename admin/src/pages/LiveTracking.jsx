import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { db, rtdb } from '../firebase';
import { ref, onValue, off } from 'firebase/database';
import { collection, onSnapshot } from 'firebase/firestore';
import StopTimeline from '../components/tracking/StopTimeline';

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
  if (live && live.isOnline === false) {
    return STATUS_CFG['Offline'];
  }
  const s = live?.status || bus?.status;
  if (!s) return STATUS_CFG['Offline'];
  return STATUS_CFG[s] || STATUS_CFG['Active'];
}

function getLiveForBus(bus, liveMap) {
  if (!bus || !liveMap) return null;
  const num = String(bus.busNumber || '').trim();
  const id = String(bus.id || '').trim();
  return (
    liveMap[id] ||
    (num ? liveMap[num] : null) ||
    (num ? liveMap['BUS_' + num] : null) ||
    (num ? liveMap['bus_' + num] : null) ||
    null
  );
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
function BusCard({ bus, expanded, onToggle, live, onPositionChange }) {
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

  return (
    <div
      className={`order-card${expanded ? ' expanded active' : ''}`}
      onClick={onToggle}
      style={{ cursor: 'pointer' }}
    >
      {/* ── Row 1: Bus identity + status + chevron ── */}
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
              transition: 'transform 0.24s cubic-bezier(0.16, 1, 0.3, 1)',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              flexShrink: 0,
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
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

      {/* ── Expanded Stop Timeline (Old style matching user app) ── */}
      {expanded && (
        <div
          onClick={e => e.stopPropagation()}
          className="expanded-timeline-section"
          style={{
            marginTop: '12px',
            borderTop: '1px solid rgba(0, 0, 0, 0.06)',
            paddingTop: '6px'
          }}
        >
          <StopTimeline bus={bus} live={live} onPositionChange={onPositionChange} />
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
  const [expandedId, setExpandedId] = useState(null);
  const [liveMap, setLiveMap] = useState({});
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);
  const hasInitialSelected = useRef(false);

  const toggle = useCallback((bus) => {
    setExpandedId(prev => {
      const nextId = prev === bus.id ? null : bus.id;
      if (nextId && onSelectBus) {
        const live = getLiveForBus(bus, liveMap);
        const lat = live?.latitude ?? live?.lat ?? bus?.lat ?? bus?.latitude;
        const lng = live?.longitude ?? live?.lng ?? bus?.lng ?? bus?.longitude;
        if (lat && lng) {
          onSelectBus({
            id: bus.id,
            busNumber: bus.busNumber,
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            status: live?.status || bus.status
          });
        }
      }
      return nextId;
    });
  }, [liveMap, onSelectBus]);

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

      if (!hasInitialSelected.current && data.length > 0) {
        hasInitialSelected.current = true;
        const initialBus = data.find(b => b.status === 'Active' || b.status === 'On Route') || data[0];
        if (initialBus && onSelectBus) {
          const live = getLiveForBus(initialBus, liveMap);
          const lat = live?.latitude ?? live?.lat ?? initialBus.lat ?? initialBus.latitude;
          const lng = live?.longitude ?? live?.lng ?? initialBus.lng ?? initialBus.longitude;
          if (lat && lng) {
            onSelectBus({
              id: initialBus.id,
              busNumber: initialBus.busNumber,
              lat: parseFloat(lat),
              lng: parseFloat(lng),
              status: live?.status || initialBus.status
            });
          }
        }
      }
    }, () => { setError('Failed to load buses.'); setLoading(false); });
    return () => unsub();
  }, [onSelectBus, liveMap]);

  // Subscribe live for all buses across RTDB
  useEffect(() => {
    if (!rtdb) return;
    const r = ref(rtdb, 'bus_live');
    const unsub = onValue(r, snap => {
      setLiveMap(snap.val() || {});
    });
    return () => off(r);
  }, []);

  // Use registered Firestore fleet with real RTDB live telemetry
  const allBuses = useMemo(() => {
    const list = [...buses];
    const ord = { Active: 0, 'On Route': 0, Delayed: 1, 'At Stop': 2, Offline: 3, Halted: 3, Maintenance: 4 };
    return list.sort((a, b) => {
      const liveA = getLiveForBus(a, liveMap);
      const liveB = getLiveForBus(b, liveMap);
      const statusA = liveA?.status || a.status;
      const statusB = liveB?.status || b.status;
      return (ord[statusA] ?? 2) - (ord[statusB] ?? 2);
    });
  }, [buses, liveMap]);

  const filtered = allBuses.filter(bus => {
    const live = getLiveForBus(bus, liveMap);
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
        {/* Expandable search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {searchOpen && (
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Bus, route, driver, simulator…"
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

      {/* Filter tabs */}
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

      {/* Bus list */}
      <div className="orders-list">
        {/* Only show Simulator when user searches for it */}
        {deb && /sim|gps|telematics/i.test(deb) && (
          <a
            href={`${typeof window !== 'undefined' ? window.location.origin : ''}/simulator.html`}
            target="_blank"
            rel="noopener noreferrer"
            className="order-card"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              backgroundColor: '#EFF6FF',
              border: '1.5px solid #BFDBFE',
              borderRadius: '16px',
              textDecoration: 'none',
              marginBottom: '10px',
              cursor: 'pointer',
              transition: 'all 0.18s ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#DBEAFE'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#EFF6FF'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                backgroundColor: '#2563EB',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '17px',
                flexShrink: 0
              }}>
                🎮
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#1E40AF', letterSpacing: '-0.2px' }}>
                  Open GPS Bus Simulator
                </div>
                <div style={{ fontSize: '12px', color: '#3B82F6', fontWeight: '500' }}>
                  Launch live telemetry simulation in new tab
                </div>
              </div>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              fontWeight: '600',
              color: '#2563EB',
              background: '#fff',
              padding: '4px 10px',
              borderRadius: '100px',
              border: '1px solid #BFDBFE'
            }}>
              <span>Open</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </div>
          </a>
        )}

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
        ) : filtered.length === 0 && !/sim|gps|telematics/i.test(deb) ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>No buses found</div>
            <div style={{ fontSize: '13px', color: '#9CA3AF' }}>{deb ? 'Try a different search.' : 'No active buses right now.'}</div>
          </div>
        ) : filtered.map(bus => (
          <BusCard
            key={bus.id}
            bus={bus}
            expanded={expandedId === bus.id}
            onToggle={() => toggle(bus)}
            live={getLiveForBus(bus, liveMap)}
            onPositionChange={onSelectBus}
          />
        ))}
      </div>
    </div>
  );
}
