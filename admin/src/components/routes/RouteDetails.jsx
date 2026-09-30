import React, { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { db } from '../../firebase';
import { doc, getDoc } from 'firebase/firestore';

const formatTime = (timeStr) => {
  if (!timeStr) return '-';
  const clean = String(timeStr).trim();
  if (clean.toLowerCase().includes('am') || clean.toLowerCase().includes('pm')) {
    return clean.toUpperCase();
  }
  const parts = clean.split(':');
  if (parts.length >= 2) {
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1].padStart(2, '0');
    if (isNaN(hours)) return clean;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${minutes} ${ampm}`;
  }
  return clean;
};

export default function RouteDetails({ route, onBack, onEdit, onDelete }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [resolvedDriverName, setResolvedDriverName] = useState('');
  const [resolvedBusName, setResolvedBusName] = useState('');

  // Resolve driver name from Firestore if not cached in route
  useEffect(() => {
    const driverName = route?.assignedDriverName || '';
    const driverId = route?.assignedDriver || '';
    if (driverName) {
      setResolvedDriverName(driverName);
    } else if (driverId) {
      getDoc(doc(db, 'drivers', driverId))
        .then(snap => {
          if (snap.exists()) {
            const d = snap.data();
            setResolvedDriverName(d.driverName || d.name || driverId);
          } else {
            setResolvedDriverName(driverId);
          }
        })
        .catch(() => setResolvedDriverName(driverId));
    } else {
      setResolvedDriverName('');
    }
  }, [route?.assignedDriver, route?.assignedDriverName]);

  // Resolve bus name from Firestore if not cached in route
  useEffect(() => {
    const busName = route?.assignedBusName || '';
    const busId = route?.assignedBus || '';
    if (busName) {
      setResolvedBusName(busName);
    } else if (busId) {
      getDoc(doc(db, 'buses', busId))
        .then(snap => {
          if (snap.exists()) {
            const b = snap.data();
            setResolvedBusName(b.busNumber || b.registrationNumber || b.name || busId);
          } else {
            setResolvedBusName(busId);
          }
        })
        .catch(() => setResolvedBusName(busId));
    } else {
      setResolvedBusName('');
    }
  }, [route?.assignedBus, route?.assignedBusName]);

  const stops = useMemo(() => {
    if (!route || !Array.isArray(route.stops)) return [];
    return route.stops.map((s, index) => {
      const name = s.name || s.stopName || s.station || s.title || `Stop ${index + 1}`;
      const morning = s.morningArrival || s.arrivalTime || s.morningTime || s.pickupTime || s.time || '';
      const evening = s.eveningArrival || s.departureTime || s.eveningTime || s.dropTime || '';
      const order = s.order || s.stopOrder || index + 1;
      const lat = s.lat || s.latitude || '';
      const lng = s.lng || s.longitude || '';
      const status = s.status || 'Active';
      return { ...s, name, morning, evening, order, lat, lng, status, index };
    });
  }, [route]);

  const filteredStops = useMemo(() => {
    return stops.filter(stop => {
      const matchSearch =
        stop.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(stop.order).includes(searchTerm);
      if (activeTab === 'morning') return matchSearch && !!stop.morning;
      if (activeTab === 'evening') return matchSearch && !!stop.evening;
      return matchSearch;
    });
  }, [stops, searchTerm, activeTab]);

  const firstMorningStop = stops.find(s => !!s.morning);
  const lastMorningStop = [...stops].reverse().find(s => !!s.morning);

  const routeIsActive = (route?.status || 'Active').toLowerCase() === 'active';

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      background: '#fff',
      borderRadius: '16px',
      border: '1px solid #E9ECF0',
      overflow: 'hidden',
      boxShadow: '0 2px 12px rgba(0,0,0,0.04)'
    }}>

      {/* ── Header ── */}
      <div style={{
        padding: '18px 24px',
        borderBottom: '1px solid #EAECF0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#FAFBFC',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={onBack}
            style={{
              background: '#F3F4F6',
              border: 'none',
              cursor: 'pointer',
              width: '36px',
              height: '36px',
              borderRadius: '9px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s'
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#E5E7EB'}
            onMouseLeave={e => e.currentTarget.style.background = '#F3F4F6'}
          >
            <ArrowLeft size={17} color="#555" />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#111827' }}>
                {route?.routeName || 'Unknown Route'}
              </h2>
              <span style={{
                fontSize: '11px',
                fontWeight: '600',
                color: routeIsActive ? '#2D6A4F' : '#6B7280',
                background: routeIsActive ? '#D8F3DC' : '#F3F4F6',
                padding: '3px 9px',
                borderRadius: '100px',
                letterSpacing: '0.2px'
              }}>
                {route?.status || 'Active'}
              </span>
            </div>
            <div style={{ fontSize: '13px', color: '#8A8F98', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>{route?.startPoint || 'Start'}</span>
              <span style={{ color: '#C4C8CF' }}>→</span>
              <span>{route?.destination || 'Destination'}</span>
              <span style={{ color: '#D1D5DB' }}>·</span>
              <span style={{ fontWeight: '600', color: '#4B6CB7' }}>{stops.length} Stops</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {onEdit && (
            <button
              onClick={onEdit}
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                background: '#F3F4F6', color: '#374151',
                border: '1px solid #E5E7EB', padding: '9px 16px',
                borderRadius: '8px', fontSize: '13px', fontWeight: '600',
                cursor: 'pointer', transition: 'background 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#EAECF0'}
              onMouseLeave={e => e.currentTarget.style.background = '#F3F4F6'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.7999 2.21C15.3899 1.80 14.6799 2.08 14.6799 2.65V6.14C14.6799 7.60 15.9199 8.81 17.4299 8.81C18.3799 8.82 19.6999 8.82 20.8299 8.82C21.3999 8.82 21.6999 8.15 21.2999 7.75C19.8599 6.30 17.2799 3.69 15.7999 2.21Z"/>
                <path d="M20.5 10.19H17.61C15.24 10.19 13.31 8.26 13.31 5.89V3C13.31 2.45 12.86 2 12.31 2H8.07C4.99 2 2.5 4 2.5 7.57V16.43C2.5 20 4.99 22 8.07 22H15.93C19.01 22 21.5 20 21.5 16.43V11.19C21.5 10.64 21.05 10.19 20.5 10.19Z"/>
              </svg>
              Edit Route
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                background: '#FFF5F5', color: '#C0392B',
                border: '1px solid #FECACA', padding: '9px 16px',
                borderRadius: '8px', fontSize: '13px', fontWeight: '600',
                cursor: 'pointer', transition: 'background 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#FFE5E5'}
              onMouseLeave={e => e.currentTarget.style.background = '#FFF5F5'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 5.98C17.67 5.65 14.32 5.48 10.98 5.48C9 5.48 7.02 5.58 5.04 5.78L3 5.98" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8.5 4.97L8.72 3.66C8.88 2.71 9 2 10.69 2H13.31C15 2 15.13 2.75 15.28 3.67L15.5 4.97" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M18.85 9.14L18.2 19.21C18.09 20.78 18 22 15.21 22H8.79C6 22 5.91 20.78 5.80 19.21L5.15 9.14" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Delete
            </button>
          )}
        </div>
      </div>

      {/* ── Scrollable Body ── */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Route Overview Card */}
        <div style={{
          background: '#FAFBFC',
          borderRadius: '12px',
          border: '1px solid #EAECF0',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '13px 18px',
            borderBottom: '1px solid #EAECF0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#374151', letterSpacing: '0.1px' }}>Route Overview</span>
            {firstMorningStop?.morning && (
              <span style={{ fontSize: '12px', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2" strokeLinecap="round"/>
                </svg>
                Service starts <strong style={{ color: '#374151', marginLeft: '3px' }}>{formatTime(firstMorningStop.morning)}</strong>
              </span>
            )}
          </div>
          <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '18px' }}>
            {[
              { label: 'Origin', value: route?.startPoint || '-' },
              { label: 'Final Destination', value: route?.destination || '-' },
              { label: 'Total Stops', value: `${stops.length} Stops`, accent: true },
              { label: 'Assigned Bus', value: resolvedBusName || '-' },
              { label: 'Assigned Driver', value: resolvedDriverName || '-' },
              ...(route?.distance || route?.estimatedTime ? [{
                label: 'Distance & Est. Time',
                value: [route?.distance ? `${route.distance} km` : null, route?.estimatedTime ? `${route.estimatedTime} min` : null].filter(Boolean).join(' · ')
              }] : [])
            ].map(({ label, value, accent }) => (
              <div key={label}>
                <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '4px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
                <div style={{ fontSize: '14px', color: accent ? '#4B6CB7' : '#111827', fontWeight: accent ? '700' : '600' }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Stops & Schedule Card */}
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          border: '1px solid #EAECF0',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0
        }}>
          {/* Section Header */}
          <div style={{
            padding: '13px 18px',
            borderBottom: '1px solid #EAECF0',
            background: '#FAFBFC',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#374151' }}>Route Stops &amp; Schedule</span>
                <span style={{
                  fontSize: '11px', fontWeight: '600',
                  color: '#4B6CB7', background: '#EEF2FF',
                  padding: '2px 8px', borderRadius: '10px'
                }}>
                  {filteredStops.length} {filteredStops.length === 1 ? 'Stop' : 'Stops'}
                </span>
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#9CA3AF' }}>
                Sequential stops with morning pickup and evening return timings.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {/* Tab Switcher */}
              <div style={{ display: 'flex', background: '#F0F1F3', padding: '3px', borderRadius: '8px', gap: '2px' }}>
                {[['all', 'All Stops'], ['morning', 'Morning'], ['evening', 'Evening']].map(([tab, label]) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      border: 'none',
                      background: activeTab === tab ? '#fff' : 'transparent',
                      color: activeTab === tab ? '#374151' : '#6B7280',
                      fontSize: '12px', fontWeight: '600',
                      padding: '5px 11px', borderRadius: '6px',
                      cursor: 'pointer',
                      boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      transition: 'all 0.15s'
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div style={{ position: 'relative' }}>
                <Search size={13} color="#AAAAAA" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Filter stops..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{
                    padding: '0 12px 0 30px',
                    height: '32px',
                    borderRadius: '7px',
                    border: '1px solid #E5E7EB',
                    background: '#fff',
                    outline: 'none',
                    fontSize: '12px',
                    width: '160px',
                    color: '#374151'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Table */}
          {filteredStops.length === 0 ? (
            <div style={{ padding: '56px 20px', textAlign: 'center', color: '#9CA3AF', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: '#F3F4F6', padding: '14px', borderRadius: '50%' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#AAAAAA" strokeWidth="1.5">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="12" cy="9" r="2.5"/>
                </svg>
              </div>
              <div style={{ fontWeight: '600', color: '#374151', fontSize: '14px' }}>
                {stops.length === 0 ? 'No stops added yet' : 'No stops match your filter'}
              </div>
              <div style={{ fontSize: '12px', maxWidth: '340px', lineHeight: '1.5' }}>
                {stops.length === 0
                  ? 'Click "Edit Route" to add stops and schedule.'
                  : 'Try clearing the search or switching to "All Stops".'}
              </div>
            </div>
          ) : (
            <>
              {/* Column Headers */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '60px 2fr 1.2fr 1.2fr 90px',
                padding: '10px 18px',
                background: '#F8F9FB',
                borderBottom: '1px solid #EAECF0',
                fontSize: '11px', fontWeight: '700',
                color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.5px'
              }}>
                <div>#</div>
                <div>Stop Name</div>
                <div>Morning Pickup</div>
                <div>Evening Drop</div>
                <div style={{ textAlign: 'right' }}>Status</div>
              </div>

              {/* Rows */}
              <div style={{ overflowY: 'auto' }}>
                {filteredStops.map((stop, i) => {
                  const isFirst = i === 0;
                  const isLast = i === filteredStops.length - 1;
                  const formattedMorning = formatTime(stop.morning);
                  const formattedEvening = formatTime(stop.evening);
                  const isActive = (stop.status || 'Active').toLowerCase() === 'active';

                  return (
                    <div
                      key={stop.index ?? i}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '60px 2fr 1.2fr 1.2fr 90px',
                        padding: '13px 18px',
                        borderBottom: i === filteredStops.length - 1 ? 'none' : '1px solid #F2F3F5',
                        alignItems: 'center',
                        fontSize: '13px',
                        background: '#fff',
                        transition: 'background 0.12s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#FAFBFC'}
                      onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                    >
                      {/* Order Badge */}
                      <div>
                        <span style={{
                          width: '26px', height: '26px',
                          borderRadius: '7px',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '11px', fontWeight: '700',
                          backgroundColor: isFirst ? '#EEF2FF' : isLast ? '#F0FDF4' : '#F3F4F6',
                          color: isFirst ? '#4B6CB7' : isLast ? '#2D6A4F' : '#6B7280',
                          border: `1px solid ${isFirst ? '#C7D2FE' : isLast ? '#BBF7D0' : '#E5E7EB'}`
                        }}>
                          {stop.order}
                        </span>
                      </div>

                      {/* Stop Name */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <span style={{ fontWeight: '600', color: '#1F2937', fontSize: '13px' }}>{stop.name}</span>
                          {isFirst && (
                            <span style={{ fontSize: '10px', fontWeight: '700', color: '#4B6CB7', background: '#EEF2FF', padding: '1px 6px', borderRadius: '4px' }}>
                              ORIGIN
                            </span>
                          )}
                          {isLast && !isFirst && (
                            <span style={{ fontSize: '10px', fontWeight: '700', color: '#2D6A4F', background: '#F0FDF4', padding: '1px 6px', borderRadius: '4px' }}>
                              DEST
                            </span>
                          )}
                        </div>
                        {(stop.lat || stop.lng) && (
                          <div style={{ fontSize: '11px', color: '#B0B5BE', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="#B0B5BE"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                            {stop.lat}, {stop.lng}
                          </div>
                        )}
                      </div>

                      {/* Morning */}
                      <div>
                        {formattedMorning !== '-' ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                            background: '#F0F4FF', color: '#4B6CB7',
                            padding: '4px 9px', borderRadius: '6px',
                            fontWeight: '600', fontSize: '12px'
                          }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4B6CB7" strokeWidth="2">
                              <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2" strokeLinecap="round"/>
                            </svg>
                            {formattedMorning}
                          </span>
                        ) : (
                          <span style={{ color: '#C4C8CF', fontSize: '12px' }}>—</span>
                        )}
                      </div>

                      {/* Evening */}
                      <div>
                        {formattedEvening !== '-' ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                            background: '#FDF6EC', color: '#A07840',
                            padding: '4px 9px', borderRadius: '6px',
                            fontWeight: '600', fontSize: '12px'
                          }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#A07840" strokeWidth="2">
                              <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2" strokeLinecap="round"/>
                            </svg>
                            {formattedEvening}
                          </span>
                        ) : (
                          <span style={{ color: '#C4C8CF', fontSize: '12px' }}>—</span>
                        )}
                      </div>

                      {/* Status */}
                      <div style={{ textAlign: 'right' }}>
                        <span style={{
                          fontSize: '11px', fontWeight: '600',
                          color: isActive ? '#2D6A4F' : '#6B7280',
                          background: isActive ? '#D8F3DC' : '#F3F4F6',
                          padding: '3px 9px', borderRadius: '100px'
                        }}>
                          {stop.status || 'Active'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div style={{
                padding: '10px 18px',
                background: '#F8F9FB',
                borderTop: '1px solid #EAECF0',
                fontSize: '12px', color: '#9CA3AF',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <span>Showing <strong style={{ color: '#374151' }}>{filteredStops.length}</strong> of <strong style={{ color: '#374151' }}>{stops.length}</strong> stops</span>
                {firstMorningStop?.morning && lastMorningStop?.morning && (
                  <span>
                    Morning window: <strong style={{ color: '#374151' }}>{formatTime(firstMorningStop.morning)}</strong>
                    <span style={{ margin: '0 4px', color: '#D1D5DB' }}>→</span>
                    <strong style={{ color: '#374151' }}>{formatTime(lastMorningStop.morning)}</strong>
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
