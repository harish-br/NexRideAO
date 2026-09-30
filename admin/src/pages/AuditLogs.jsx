import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { createAuditLog } from '../services/auditLogger';
import AuditLogSummary from '../components/audit/AuditLogSummary';
import AuditLogFilters from '../components/audit/AuditLogFilters';
import AuditLogDetails from '../components/audit/AuditLogDetails';
import DocumentDownloadIcon from '../assets/svg/document-download.svg?react';
import RefreshArrowIcon from '../assets/svg/refresh-arrow2.svg?react';
import documentTextIcon from '../assets/svg/document-text.svg';

const PAGE_SIZE = 50;

/* ─── Toast ─── */
function Toast({ toasts, dismiss }) {
  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px',
      zIndex: 2000, display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end',
    }}>
      {toasts.map(t => (
        <div
          key={t.id}
          style={{
            background: '#fff',
            border: `1px solid ${t.type === 'error' ? '#FECACA' : '#E7EAF0'}`,
            borderLeft: `3px solid ${t.type === 'error' ? '#E53935' : t.type === 'warning' ? '#D98B00' : '#00A86B'}`,
            borderRadius: '10px',
            padding: '12px 16px',
            boxShadow: '0 4px 12px rgba(16,24,40,0.10)',
            display: 'flex', alignItems: 'center', gap: '10px',
            animation: 'toastSlideIn 0.25s ease',
            maxWidth: '320px',
          }}
        >
          <span style={{ fontSize: '13px', color: '#111827', fontWeight: '500', flex: 1 }}>{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#98A2B3', padding: '0', display: 'flex' }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

/* ─── Action Badge ─── */
const ACTION_STYLES = {
  CREATE:  { color: '#00A86B', bg: '#E8F8F1' },
  ADD:     { color: '#00A86B', bg: '#E8F8F1' },
  UPDATE:  { color: '#2563EB', bg: '#EBF2FF' },
  EDIT:    { color: '#2563EB', bg: '#EBF2FF' },
  DELETE:  { color: '#E53935', bg: '#FDECEC' },
  REMOVE:  { color: '#E53935', bg: '#FDECEC' },
  REJECT:  { color: '#E53935', bg: '#FDECEC' },
  LOGIN:   { color: '#6C3FCC', bg: '#F3EEFF' },
  LOGOUT:  { color: '#6C3FCC', bg: '#F3EEFF' },
  EXPORT:  { color: '#667085', bg: '#F2F4F7' },
  APPROVE: { color: '#00A86B', bg: '#E8F8F1' },
};
function getActionStyle(action) {
  if (!action) return { color: '#667085', bg: '#F2F4F7' };
  const key = Object.keys(ACTION_STYLES).find(k => action.toUpperCase().includes(k));
  return key ? ACTION_STYLES[key] : { color: '#667085', bg: '#F2F4F7' };
}

/* ─── Severity Style ─── */
const SEV_STYLES = {
  critical: { color: '#E53935', bg: '#FDECEC' },
  warning:  { color: '#D98B00', bg: '#FFF6DF' },
  info:     { color: '#2563EB', bg: '#EBF2FF' },
};
function getSeverityStyle(sev) {
  return SEV_STYLES[sev?.toLowerCase()] || SEV_STYLES.info;
}

/* ─── Timestamp ─── */
function formatTimestamp(ts) {
  if (!ts) return '-';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return {
      date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
  } catch { return { date: String(ts), time: '' }; }
}

/* ─── Initials ─── */
function getInitials(name) {
  if (!name) return 'SY';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

/* ─── Skeleton Row ─── */
function SkeletonRow() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1.1fr 1.6fr 0.9fr 1.4fr 0.8fr 0.8fr 80px',
      padding: '16px 24px', borderBottom: '1px solid #F0F2F5', gap: '16px',
      alignItems: 'center',
    }}>
      {[70, 100, 60, 90, 50, 55, 50].map((w, i) => (
        <div key={i} className="skeleton" style={{ height: '14px', width: `${w}%`, borderRadius: '6px' }} />
      ))}
    </div>
  );
}

/* ─── Main Page ─── */
export default function AuditLogs() {
  const [allFetchedLogs, setAllFetchedLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const [searchTerm, setSearchTerm]     = useState('');
  const [dateRange, setDateRange]       = useState('All Time');
  const [actionFilter, setActionFilter] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');

  const [selectedLog, setSelectedLog]   = useState(null);
  const [currentPage, setCurrentPage]   = useState(1);
  const [stats, setStats]               = useState({ total: 0, today: 0, admin: 0, critical: 0 });
  const [toasts, setToasts]             = useState([]);

  /* ─── Toast helpers ─── */
  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);
  const dismissToast = useCallback((id) => setToasts(t => t.filter(x => x.id !== id)), []);

  /* ─── Fetch ─── */
  const fetchLogs = useCallback(() => {
    setRefreshing(true);
    const q = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(1000));
    getDocs(q)
      .then(snapshot => {
        const logsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAllFetchedLogs(logsData);

        const today = new Date(); today.setHours(0, 0, 0, 0);
        let tTotal = logsData.length, tToday = 0, tAdmin = 0, tCritical = 0;
        logsData.forEach(log => {
          const ts = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.createdAt || Date.now());
          if (ts >= today) tToday++;
          if (log.actor?.role === 'admin' || !log.actor) tAdmin++;
          if (log.severity === 'critical') tCritical++;
        });
        setStats({ total: tTotal, today: tToday, admin: tAdmin, critical: tCritical });
        setLastRefreshed(new Date());
        setLoading(false);
        setRefreshing(false);
      })
      .catch(err => {
        console.error('Failed to fetch audit logs:', err);
        addToast('Unable to load audit logs', 'error');
        setLoading(false);
        setRefreshing(false);
      });
  }, [addToast]);

  useEffect(() => { fetchLogs(); }, []);

  /* ─── Debounced search ─── */
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 250);
    return () => clearTimeout(t);
  }, [searchTerm]);

  /* ─── Filter ─── */
  const filteredLogs = useMemo(() => {
    return allFetchedLogs.filter(log => {
      const st = debouncedSearch.toLowerCase();
      const matchesSearch = !st ||
        (log.action || '').toLowerCase().includes(st) ||
        (log.module || '').toLowerCase().includes(st) ||
        (log.entityType || '').toLowerCase().includes(st) ||
        (log.entityId || '').toLowerCase().includes(st) ||
        (log.actor?.name || '').toLowerCase().includes(st) ||
        (log.actor?.email || '').toLowerCase().includes(st) ||
        (log.id || '').toLowerCase().includes(st);

      const matchesAction   = !actionFilter   || log.action === actionFilter;
      const matchesModule   = !moduleFilter   || log.module === moduleFilter;
      const matchesSeverity = !severityFilter || log.severity === severityFilter;

      let matchesDate = true;
      if (dateRange !== 'All Time') {
        const ts = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.createdAt || Date.now());
        const diffDays = (new Date() - ts) / (1000 * 60 * 60 * 24);
        if (dateRange === 'Today')       matchesDate = diffDays <= 1;
        if (dateRange === 'Yesterday')   matchesDate = diffDays > 1 && diffDays <= 2;
        if (dateRange === 'Last 7 Days') matchesDate = diffDays <= 7;
        if (dateRange === 'Last 30 Days') matchesDate = diffDays <= 30;
      }
      return matchesSearch && matchesAction && matchesModule && matchesSeverity && matchesDate;
    });
  }, [allFetchedLogs, debouncedSearch, actionFilter, moduleFilter, severityFilter, dateRange]);

  const totalPages  = Math.ceil(filteredLogs.length / PAGE_SIZE) || 1;
  const currentLogs = filteredLogs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setCurrentPage(1); }, [debouncedSearch, actionFilter, moduleFilter, severityFilter, dateRange]);

  /* ─── Export ─── */
  const handleExport = async () => {
    setExporting(true);
    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const rows = filteredLogs.map(log => {
        const ts = formatTimestamp(log.timestamp || log.createdAt);
        const clean = (v) => String(v || '').replace(/,/g, ';').replace(/\n/g, ' ');
        return [
          clean(`${ts.date} ${ts.time}`),
          clean(log.actor?.name || 'System'),
          clean(log.actor?.email),
          clean(log.action),
          clean(log.module),
          clean(log.entityType),
          clean(log.entityId),
          clean(log.severity || 'info'),
          clean(log.status || 'success'),
          clean(log.description),
        ].join(',');
      });
      const csv = 'Timestamp,User,Email,Action,Module,Entity Type,Entity ID,Severity,Status,Description\n' + rows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `nexride-audit-logs-${dateStr}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);

      await createAuditLog({
        action: 'EXPORT', module: 'Audit Logs', entityType: 'logs',
        description: `Exported ${filteredLogs.length} audit records`,
        severity: 'info',
      });
      addToast(`✓ Exported ${filteredLogs.length} records — nexride-audit-logs-${dateStr}.csv`);
    } catch (e) {
      console.error('Export failed:', e);
      addToast('Export failed. Please try again.', 'error');
    } finally {
      setExporting(false);
    }
  };

  /* ─── Refresh handler ─── */
  const handleRefresh = () => {
    if (refreshing) return;
    fetchLogs();
    addToast('✓ Audit logs refreshed');
  };

  /* ─── Pagination button style ─── */
  const pgBtn = (disabled) => ({
    width: '34px', height: '34px', borderRadius: '8px',
    border: `1px solid ${disabled ? '#F0F2F5' : '#E7EAF0'}`,
    background: disabled ? '#F8FAFC' : '#fff',
    color: disabled ? '#C4CAD4' : '#374151',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '14px', fontWeight: '500',
    transition: 'background 0.15s, border-color 0.15s',
  });

  /* ─── Column header style ─── */
  const colHeader = {
    fontSize: '11px', fontWeight: '600', color: '#98A2B3',
    textTransform: 'uppercase', letterSpacing: '0.6px',
  };

  return (
    <>
      {/* Global Keyframe styles injected once */}
      <style>{`
        @keyframes drawerSlideIn {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        @keyframes backdropFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes dropdownFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseGreen {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spinOnce {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .audit-spin { animation: spinOnce 0.5s ease; }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
      `}</style>

      <div
        className="blank-page"
        style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
      >
        {/* ── Header ── */}
        <div
          className="header"
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            flexShrink: 0, marginBottom: '20px',
          }}
        >
          <div>

            <h1 style={{
              margin: 0, fontSize: '28px', fontWeight: '700',
              color: '#111827', letterSpacing: '-0.5px', lineHeight: 1.15,
            }}>
              Audit Logs
            </h1>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '14px',
              marginTop: '6px',
            }}>
              <p style={{ color: '#667085', fontSize: '13px', margin: 0 }}>
                Track and review administrative and system activity across NexRide AO.
              </p>
              {/* Live indicator */}
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                fontSize: '11px', fontWeight: '600', color: '#00A86B',
              }}>
                <span style={{
                  width: '7px', height: '7px', borderRadius: '50%',
                  background: '#00A86B', display: 'inline-block',
                  animation: 'pulseGreen 2s ease infinite',
                }} />
                Logging active
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
            {lastRefreshed && (
              <span style={{ fontSize: '11px', color: '#98A2B3', whiteSpace: 'nowrap' }}>
                Updated {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh audit logs"
              aria-label="Refresh audit logs"
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                background: '#fff', color: '#374151',
                border: '1px solid #E7EAF0',
                padding: '0 16px', height: '40px',
                borderRadius: '10px', fontSize: '13px', fontWeight: '600',
                cursor: refreshing ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s, box-shadow 0.15s',
                boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
              }}
              onMouseEnter={e => { if (!refreshing) e.currentTarget.style.background = '#F8FAFC'; }}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              <RefreshArrowIcon
                width={15} height={15}
                style={{ display: 'block' }}
                className={refreshing ? 'audit-spin' : ''}
              />
              Refresh
            </button>

            <button
              onClick={handleExport}
              disabled={exporting}
              title="Export filtered logs as CSV"
              aria-label="Export audit logs"
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                background: exporting ? '#3366CC' : '#0044CC',
                color: '#fff', border: 'none',
                padding: '0 18px', height: '40px',
                borderRadius: '10px', fontSize: '13px', fontWeight: '600',
                cursor: exporting ? 'not-allowed' : 'pointer',
                boxShadow: '0 1px 4px rgba(0,68,204,0.20)',
                transition: 'background 0.15s, transform 0.12s',
              }}
              onMouseEnter={e => { if (!exporting) e.currentTarget.style.background = '#0033AA'; }}
              onMouseLeave={e => { if (!exporting) e.currentTarget.style.background = '#0044CC'; }}
              onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.98)'; }}
              onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              <DocumentDownloadIcon width={15} height={15} style={{ display: 'block', color: '#fff' }} />
              {exporting ? 'Exporting...' : 'Export Logs'}
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

          {loading && allFetchedLogs.length === 0 ? (
            /* Skeleton Loading */
            <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="skeleton" style={{ height: '88px', borderRadius: '16px' }} />
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: '10px' }}>
                <div className="skeleton" style={{ height: '40px', borderRadius: '10px' }} />
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="skeleton" style={{ height: '40px', width: '130px', borderRadius: '10px' }} />
                ))}
              </div>
              <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E7EAF0', overflow: 'hidden', flex: 1 }}>
                <div className="skeleton" style={{ height: '48px', borderRadius: '0' }} />
                {[1, 2, 3, 4, 5, 6].map(i => <SkeletonRow key={i} />)}
              </div>
            </div>
          ) : (
            <div className="animate-fade-in-up" style={{ animationDelay: '0.05s', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

              <AuditLogSummary stats={stats} />

              <AuditLogFilters
                searchTerm={searchTerm}      setSearchTerm={setSearchTerm}
                dateRange={dateRange}        setDateRange={setDateRange}
                actionFilter={actionFilter}  setActionFilter={setActionFilter}
                moduleFilter={moduleFilter}  setModuleFilter={setModuleFilter}
                severityFilter={severityFilter} setSeverityFilter={setSeverityFilter}
              />

              {/* Table Container */}
              <div style={{
                flex: 1, background: '#fff',
                borderRadius: '16px',
                border: '1px solid #E7EAF0',
                boxShadow: '0 1px 4px rgba(16,24,40,0.04)',
                overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
              }}>

                {/* Column Headers */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1.1fr 1.6fr 0.9fr 1.4fr 0.8fr 0.8fr 80px',
                  padding: '14px 24px',
                  borderBottom: '1px solid #F0F2F5',
                  background: '#FAFBFC',
                }}>
                  <div style={colHeader}>Timestamp</div>
                  <div style={colHeader}>User</div>
                  <div style={colHeader}>Action</div>
                  <div style={colHeader}>Entity / Module</div>
                  <div style={colHeader}>Severity</div>
                  <div style={colHeader}>Status</div>
                  <div style={{ ...colHeader, textAlign: 'right' }}>Details</div>
                </div>

                {/* Body */}
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {currentLogs.length === 0 ? (
                    /* Empty State */
                    <div style={{
                      padding: '72px 40px', textAlign: 'center', color: '#98A2B3',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px',
                    }}>
                      <div style={{
                        background: '#F5F7FA', padding: '18px', borderRadius: '16px',
                        border: '1px solid #E7EAF0',
                      }}>
                        <img src={documentTextIcon} alt="" style={{ width: '28px', height: '28px', opacity: 0.3 }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: '600', color: '#374151', fontSize: '15px', marginBottom: '6px' }}>
                          No audit events found
                        </div>
                        <div style={{ fontSize: '13px', color: '#98A2B3', maxWidth: '300px', lineHeight: '1.5' }}>
                          Try changing your filters or search query to find the events you're looking for.
                        </div>
                      </div>
                    </div>
                  ) : (
                    currentLogs.map((log) => {
                      const ts = formatTimestamp(log.timestamp || log.createdAt);
                      const actStyle = getActionStyle(log.action);
                      const sevStyle = getSeverityStyle(log.severity);
                      const isSuccess = log.status !== 'failed';
                      const initials = getInitials(log.actor?.name);

                      return (
                        <div
                          key={log.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1.1fr 1.6fr 0.9fr 1.4fr 0.8fr 0.8fr 80px',
                            padding: '14px 24px',
                            borderBottom: '1px solid #F5F7FA',
                            alignItems: 'center',
                            fontSize: '13px',
                            background: '#fff',
                            transition: 'background 0.12s',
                            cursor: 'default',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#FAFBFC'}
                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                        >
                          {/* Timestamp */}
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: '500', color: '#374151' }}>{ts.date}</div>
                            <div style={{ fontSize: '11px', color: '#98A2B3', marginTop: '2px' }}>{ts.time}</div>
                          </div>

                          {/* User */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '32px', height: '32px', borderRadius: '9px', flexShrink: 0,
                              background: '#EAF1FF',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '11px', fontWeight: '700', color: '#0044CC',
                            }}>
                              {initials}
                            </div>
                            <div>
                              <div style={{ fontWeight: '500', color: '#111827', fontSize: '13px', lineHeight: 1.3 }}>
                                {log.actor?.name || 'System User'}
                              </div>
                              <div style={{ fontSize: '11px', color: '#98A2B3', marginTop: '1px' }}>
                                {log.actor?.email || '-'}
                              </div>
                            </div>
                          </div>

                          {/* Action Badge */}
                          <div>
                            <span style={{
                              display: 'inline-block',
                              color: actStyle.color, background: actStyle.bg,
                              padding: '3px 9px', borderRadius: '100px',
                              fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.3px',
                            }}>
                              {log.action || '-'}
                            </span>
                          </div>

                          {/* Entity / Module */}
                          <div>
                            <div style={{ fontWeight: '500', color: '#111827', fontSize: '13px' }}>
                              {log.entityType || '-'}
                            </div>
                            <div style={{ fontSize: '11px', color: '#98A2B3', marginTop: '2px' }}>
                              {log.module || '-'}
                            </div>
                          </div>

                          {/* Severity Badge */}
                          <div>
                            <span style={{
                              display: 'inline-block',
                              color: sevStyle.color, background: sevStyle.bg,
                              padding: '3px 9px', borderRadius: '100px',
                              fontSize: '11px', fontWeight: '600', textTransform: 'capitalize', letterSpacing: '0.2px',
                            }}>
                              {log.severity || 'Info'}
                            </span>
                          </div>

                          {/* Status */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                              width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                              background: isSuccess ? '#00A86B' : '#E53935',
                              display: 'inline-block',
                            }} />
                            <span style={{ fontSize: '12px', fontWeight: '500', color: isSuccess ? '#00A86B' : '#E53935' }}>
                              {log.status === 'failed' ? 'Failed' : 'Success'}
                            </span>
                          </div>

                          {/* View button */}
                          <div style={{ textAlign: 'right' }}>
                            <button
                              onClick={() => setSelectedLog(log)}
                              aria-label={`View details for ${log.action} event`}
                              style={{
                                background: '#F5F7FA',
                                border: '1px solid #E7EAF0',
                                borderRadius: '7px',
                                padding: '5px 11px',
                                fontSize: '12px', fontWeight: '600',
                                color: '#374151', cursor: 'pointer',
                                transition: 'background 0.12s, border-color 0.12s, transform 0.1s',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = '#EAF1FF'; e.currentTarget.style.borderColor = '#C7D7F8'; e.currentTarget.style.color = '#0044CC'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = '#F5F7FA'; e.currentTarget.style.borderColor = '#E7EAF0'; e.currentTarget.style.color = '#374151'; }}
                              onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                              onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                            >
                              View
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Pagination */}
                <div style={{
                  padding: '14px 24px',
                  borderTop: '1px solid #F0F2F5',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: '#FAFBFC',
                  flexShrink: 0,
                }}>
                  <div style={{ fontSize: '13px', color: '#667085' }}>
                    {filteredLogs.length === 0
                      ? 'No results'
                      : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filteredLogs.length)} of ${filteredLogs.length} events`}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(p => p - 1)}
                      aria-label="Previous page"
                      style={pgBtn(currentPage === 1)}
                      onMouseEnter={e => { if (currentPage !== 1) e.currentTarget.style.background = '#F5F7FA'; }}
                      onMouseLeave={e => { if (currentPage !== 1) e.currentTarget.style.background = '#fff'; }}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M9 11L5 7l4-4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <span style={{ fontSize: '13px', color: '#374151', padding: '0 8px', fontWeight: '500' }}>
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      disabled={currentPage === totalPages || totalPages === 0}
                      onClick={() => setCurrentPage(p => p + 1)}
                      aria-label="Next page"
                      style={pgBtn(currentPage === totalPages || totalPages === 0)}
                      onMouseEnter={e => { if (currentPage !== totalPages && totalPages > 0) e.currentTarget.style.background = '#F5F7FA'; }}
                      onMouseLeave={e => { if (currentPage !== totalPages && totalPages > 0) e.currentTarget.style.background = '#fff'; }}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M5 3l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail Drawer */}
      <AuditLogDetails log={selectedLog} onClose={() => setSelectedLog(null)} />

      {/* Toasts */}
      <Toast toasts={toasts} dismiss={dismissToast} />
    </>
  );
}
