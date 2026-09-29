import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, limit, startAfter, getDocs, where } from 'firebase/firestore';
import AuditLogSummary from '../components/audit/AuditLogSummary';
import AuditLogFilters from '../components/audit/AuditLogFilters';
import AuditLogDetails from '../components/audit/AuditLogDetails';
import { createAuditLog } from '../services/auditLogger';

import documentIcon from '../assets/svg/document-normal.svg';
import documentTextIcon from '../assets/svg/document-text.svg';
import refreshIcon from '../assets/svg/record-circle.svg';

const PAGE_SIZE = 50;

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState('All Time');
  const [actionFilter, setActionFilter] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  
  const [selectedLog, setSelectedLog] = useState(null);
  
  // Stats
  const [stats, setStats] = useState({ total: 0, today: 0, admin: 0, critical: 0 });

  // Pagination (Using cursor for "Next" and maintaining a local array)
  // For a robust search/filter UI, standard approach is client-side filtering 
  // on a larger subset, but since we are asked to use pagination, we'll fetch
  // pages. However, complex compound queries (action + module + severity) require 
  // composite indexes in Firestore which might not exist.
  // To keep it fully functional without requiring manual index creation by the user,
  // we will fetch a larger chunk of recent logs, and do client-side filtering & pagination.
  const [allFetchedLogs, setAllFetchedLogs] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchLogs = () => {
    setLoading(true);
    const q = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(1000));
    
    // We use getDocs instead of onSnapshot for the main data payload so we don't 
    // re-render aggressively, but we'll set up a separate lightweight listener for "new events".
    getDocs(q).then(snapshot => {
      const logsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllFetchedLogs(logsData);
      
      // Calculate Stats
      const today = new Date();
      today.setHours(0,0,0,0);
      
      let tTotal = logsData.length;
      let tToday = 0;
      let tAdmin = 0;
      let tCritical = 0;
      
      logsData.forEach(log => {
        let ts = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.createdAt || Date.now());
        if (ts >= today) tToday++;
        if (log.actor?.role === 'admin' || !log.actor) tAdmin++;
        if (log.severity === 'critical') tCritical++;
      });
      
      setStats({ total: tTotal, today: tToday, admin: tAdmin, critical: tCritical });
      setLoading(false);
    }).catch(err => {
      console.error("Failed to fetch audit logs:", err);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Filter Data
  const filteredLogs = useMemo(() => {
    return allFetchedLogs.filter(log => {
      const st = searchTerm.toLowerCase();
      const matchesSearch = !st || 
        (log.action || '').toLowerCase().includes(st) ||
        (log.module || '').toLowerCase().includes(st) ||
        (log.entityType || '').toLowerCase().includes(st) ||
        (log.entityId || '').toLowerCase().includes(st) ||
        (log.actor?.name || '').toLowerCase().includes(st) ||
        (log.actor?.email || '').toLowerCase().includes(st);
        
      const matchesAction = !actionFilter || log.action === actionFilter;
      const matchesModule = !moduleFilter || log.module === moduleFilter;
      const matchesSeverity = !severityFilter || log.severity === severityFilter;
      
      let matchesDate = true;
      if (dateRange !== 'All Time') {
        const ts = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.createdAt || Date.now());
        const now = new Date();
        const diffDays = (now - ts) / (1000 * 60 * 60 * 24);
        if (dateRange === 'Today') matchesDate = diffDays <= 1;
        if (dateRange === 'Yesterday') matchesDate = diffDays > 1 && diffDays <= 2;
        if (dateRange === 'Last 7 Days') matchesDate = diffDays <= 7;
        if (dateRange === 'Last 30 Days') matchesDate = diffDays <= 30;
      }

      return matchesSearch && matchesAction && matchesModule && matchesSeverity && matchesDate;
    });
  }, [allFetchedLogs, searchTerm, actionFilter, moduleFilter, severityFilter, dateRange]);

  // Paginate filtered data
  const totalPages = Math.ceil(filteredLogs.length / PAGE_SIZE) || 1;
  const currentLogs = filteredLogs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [searchTerm, actionFilter, moduleFilter, severityFilter, dateRange]);

  const getActionStyle = (action) => {
    if (!action) return { color: '#6B7280', bg: '#F3F4F6' };
    const a = action.toLowerCase();
    if (a.includes('create') || a.includes('add')) return { color: '#16A34A', bg: '#F0FDF4' };
    if (a.includes('update') || a.includes('edit')) return { color: '#2563EB', bg: '#EFF6FF' };
    if (a.includes('delete') || a.includes('remove') || a.includes('reject')) return { color: '#DC2626', bg: '#FEF2F2' };
    if (a.includes('login') || a.includes('auth')) return { color: '#8B5CF6', bg: '#F5F3FF' };
    return { color: '#4B5563', bg: '#F3F4F6' };
  };
  
  const getSeverityStyle = (sev) => {
    if (sev === 'critical') return { color: '#DC2626', bg: '#FEF2F2' };
    if (sev === 'warning') return { color: '#D97706', bg: '#FEF3C7' };
    return { color: '#059669', bg: '#D1FAE5' };
  };

  const formatTimestamp = (ts) => {
    if (!ts) return '-';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + 
             d.toLocaleTimeString([], { hour: '2-digit', minute:'2-digit', second: '2-digit' });
    } catch { return String(ts); }
  };

  const handleExport = async () => {
    try {
      const csvContent = "data:text/csv;charset=utf-8," 
        + "Timestamp,User,Action,Module,Entity,Entity ID,Severity,Status,Description\n"
        + filteredLogs.map(log => {
            const ts = formatTimestamp(log.timestamp || log.createdAt).replace(/,/g, '');
            const user = (log.actor?.name || 'System').replace(/,/g, '');
            const action = (log.action || '').replace(/,/g, '');
            const module = (log.module || '').replace(/,/g, '');
            const entity = (log.entityType || '').replace(/,/g, '');
            const id = (log.entityId || '').replace(/,/g, '');
            const sev = (log.severity || 'info').replace(/,/g, '');
            const status = (log.status || 'success').replace(/,/g, '');
            const desc = (log.description || '').replace(/,/g, ';');
            return `${ts},${user},${action},${module},${entity},${id},${sev},${status},${desc}`;
          }).join("\n");
          
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      await createAuditLog({
        action: 'EXPORT',
        module: 'Audit Logs',
        entityType: 'logs',
        description: `Exported ${filteredLogs.length} audit records matching filters`,
        severity: 'info'
      });
    } catch (e) {
      console.error("Export failed:", e);
    }
  };

  return (
    <div className="blank-page" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      
      {/* Header */}
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#111827' }}>Audit Logs</h1>
          <p style={{ color: '#6B7280', fontSize: '14px', margin: '4px 0 0 0' }}>Track and review administrative and system activity across NexRide AO.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={fetchLogs}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', background: '#F3F4F6', color: '#374151',
              border: 'none', padding: '10px 16px', borderRadius: '8px', fontSize: '13px',
              fontWeight: '600', cursor: 'pointer', transition: 'background 0.2s'
            }}
          >
            <img src={refreshIcon} alt="" className={loading ? "spin" : ""} style={{width: 16, height: 16, opacity: 0.7}} /> Refresh
          </button>
          <button 
            onClick={handleExport}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', background: '#2563EB', color: '#fff',
              border: 'none', padding: '10px 16px', borderRadius: '8px', fontSize: '13px',
              fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)', transition: 'background 0.2s'
            }}
          >
            <img src={documentIcon} alt="" style={{width: 16, height: 16, filter: 'invert(1)'}} /> Export Logs
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingRight: '4px' }}>
        
        {loading && allFetchedLogs.length === 0 ? (
          // Skeleton Loading State
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
              {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: '90px', borderRadius: '16px' }}></div>)}
            </div>
            <div className="skeleton" style={{ height: '42px', borderRadius: '10px' }}></div>
            <div className="skeleton" style={{ flex: 1, borderRadius: '16px' }}></div>
          </div>
        ) : (
          <>
            <AuditLogSummary stats={stats} />
            <AuditLogFilters 
              searchTerm={searchTerm} setSearchTerm={setSearchTerm}
              dateRange={dateRange} setDateRange={setDateRange}
              actionFilter={actionFilter} setActionFilter={setActionFilter}
              moduleFilter={moduleFilter} setModuleFilter={setModuleFilter}
              severityFilter={severityFilter} setSeverityFilter={setSeverityFilter}
            />

            {/* Table Container */}
            <div style={{ 
              flex: 1, background: 'rgba(255, 255, 255, 0.7)', backdropFilter: 'blur(10px)',
              borderRadius: '16px', border: '1px solid rgba(255,255,255,0.8)', 
              overflow: 'hidden', display: 'flex', flexDirection: 'column',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
            }}>
              
              {/* Table Header */}
              <div style={{ 
                display: 'grid', gridTemplateColumns: '1.2fr 1.5fr 1fr 1.5fr 1fr 1fr 100px', 
                padding: '16px 24px', borderBottom: '1px solid rgba(0,0,0,0.05)',
                fontSize: '12px', fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em'
              }}>
                <div>Timestamp</div>
                <div>User</div>
                <div>Action</div>
                <div>Entity / Module</div>
                <div>Severity</div>
                <div>Status</div>
                <div style={{ textAlign: 'right' }}>Details</div>
              </div>

              {/* Table Body */}
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {currentLogs.length === 0 ? (
                  <div style={{ padding: '60px', textAlign: 'center', color: '#6B7280', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: '#F3F4F6', padding: '16px', borderRadius: '50%' }}>
                      <img src={documentTextIcon} alt="" style={{width: 32, height: 32, opacity: 0.4}} />
                    </div>
                    <div style={{ fontWeight: '500', color: '#374151', fontSize: '15px' }}>No audit activity found</div>
                    <div style={{ fontSize: '13px' }}>Try changing your filters or date range.</div>
                  </div>
                ) : (
                  currentLogs.map(log => {
                    const actStyle = getActionStyle(log.action);
                    const sevStyle = getSeverityStyle(log.severity);
                    const isSuccess = log.status !== 'failed';

                    return (
                      <div key={log.id} style={{ 
                        display: 'grid', gridTemplateColumns: '1.2fr 1.5fr 1fr 1.5fr 1fr 1fr 100px', 
                        padding: '16px 24px', borderBottom: '1px solid rgba(0,0,0,0.03)',
                        alignItems: 'center', fontSize: '13px', color: '#111827',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.9)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ fontSize: '12px', color: '#4B5563' }}>{formatTimestamp(log.timestamp || log.createdAt)}</div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: '500' }}>{log.actor?.name || 'System User'}</span>
                          <span style={{ fontSize: '11px', color: '#6B7280' }}>{log.actor?.email || log.actor?.uid || '-'}</span>
                        </div>
                        
                        <div>
                          <span style={{ 
                            color: actStyle.color, background: actStyle.bg, padding: '4px 8px', 
                            borderRadius: '6px', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase'
                          }}>
                            {log.action || '-'}
                          </span>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: '500' }}>{log.entityType || '-'}</span>
                          <span style={{ fontSize: '11px', color: '#6B7280' }}>{log.module || '-'}</span>
                        </div>

                        <div>
                          <span style={{ 
                            color: sevStyle.color, background: sevStyle.bg, padding: '4px 8px', 
                            borderRadius: '6px', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase'
                          }}>
                            {log.severity || 'INFO'}
                          </span>
                        </div>

                        <div>
                          <span style={{ 
                            color: isSuccess ? '#059669' : '#DC2626', fontSize: '12px', fontWeight: '500'
                          }}>
                            {log.status === 'failed' ? 'Failed' : 'Success'}
                          </span>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <button 
                            onClick={() => setSelectedLog(log)}
                            style={{ 
                              background: '#F3F4F6', color: '#374151', border: 'none', 
                              padding: '6px 12px', borderRadius: '6px', fontSize: '12px', 
                              fontWeight: '500', cursor: 'pointer', transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#E5E7EB'}
                            onMouseLeave={(e) => e.currentTarget.style.background = '#F3F4F6'}
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
                padding: '16px 24px', borderTop: '1px solid rgba(0,0,0,0.05)', display: 'flex', 
                justifyContent: 'space-between', alignItems: 'center', background: 'rgba(249, 250, 251, 0.5)' 
              }}>
                <div style={{ fontSize: '13px', color: '#6B7280' }}>
                  Showing {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredLogs.length)} to {Math.min(currentPage * PAGE_SIZE, filteredLogs.length)} of {filteredLogs.length} results
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px',
                      borderRadius: '8px', border: '1px solid #D1D5DB', background: currentPage === 1 ? '#F9FAFB' : '#fff',
                      color: currentPage === 1 ? '#D1D5DB' : '#374151', cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                      fontSize: '18px', fontWeight: 'bold'
                    }}
                  >‹</button>
                  <button 
                    disabled={currentPage === totalPages || totalPages === 0}
                    onClick={() => setCurrentPage(p => p + 1)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px',
                      borderRadius: '8px', border: '1px solid #D1D5DB', background: currentPage === totalPages || totalPages === 0 ? '#F9FAFB' : '#fff',
                      color: currentPage === totalPages || totalPages === 0 ? '#D1D5DB' : '#374151', cursor: currentPage === totalPages || totalPages === 0 ? 'not-allowed' : 'pointer',
                      fontSize: '18px', fontWeight: 'bold'
                    }}
                  >›</button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Details Drawer Overlay */}
      {selectedLog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(2px)', zIndex: 999 }} onClick={() => setSelectedLog(null)}></div>
      )}
      <AuditLogDetails log={selectedLog} onClose={() => setSelectedLog(null)} />

    </div>
  );
}
