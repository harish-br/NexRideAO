import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { Search, Download, FileText } from 'lucide-react';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [entityFilter, setEntityFilter] = useState('All');

  useEffect(() => {
    try {
      // Create a query to order by timestamp descending, limit to recent 100 for performance
      const q = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(100));
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const logsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Ensure proper sorting in memory just in case
        logsData.sort((a, b) => {
          const tA = a.timestamp?.seconds || a.timestamp || 0;
          const tB = b.timestamp?.seconds || b.timestamp || 0;
          return tB - tA; 
        });
        
        setLogs(logsData);
        setLoading(false);
      }, (err) => {
        console.error("Firestore error on auditLogs:", err);
        setLoading(false);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  }, []);

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      (log.action || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.entityType || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.entityId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.performedBy || log.admin || '').toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesEntity = entityFilter === 'All' || log.entityType === entityFilter;
    
    return matchesSearch && matchesEntity;
  });

  const getActionStyle = (action) => {
    if (!action) return { color: '#6B7280', bg: '#F3F4F6' };
    const a = action.toLowerCase();
    if (a.includes('create') || a.includes('add')) return { color: '#16A34A', bg: '#F0FDF4' }; // Green
    if (a.includes('update') || a.includes('edit')) return { color: '#2563EB', bg: '#EFF6FF' }; // Blue
    if (a.includes('delete') || a.includes('remove') || a.includes('reject')) return { color: '#DC2626', bg: '#FEF2F2' }; // Red
    if (a.includes('login') || a.includes('auth')) return { color: '#8B5CF6', bg: '#F5F3FF' }; // Purple
    return { color: '#4B5563', bg: '#F3F4F6' }; // Gray
  };
  
  const formatTimestamp = (ts) => {
    if (!ts) return '-';
    try {
      let d;
      if (ts.toDate) {
        d = ts.toDate();
      } else if (ts.seconds) {
        d = new Date(ts.seconds * 1000);
      } else {
        d = new Date(ts);
      }
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second: '2-digit'});
    } catch (e) {
      return String(ts);
    }
  };

  const renderDetails = (log) => {
    if (log.metadata) {
      return JSON.stringify(log.metadata).replace(/[{}]/g, '').replace(/"/g, ' ');
    }
    if (log.title) return log.title;
    if (log.details) return log.details;
    return '-';
  };

  // Get unique entity types for the filter
  const uniqueEntities = ['All', ...new Set(logs.map(log => log.entityType).filter(Boolean))];

  const handleExport = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Action,Entity Type,Entity ID,Performed By,Timestamp,Details\n"
      + filteredLogs.map(log => {
          const action = (log.action || '').replace(/,/g, '');
          const entity = (log.entityType || '').replace(/,/g, '');
          const id = (log.entityId || '').replace(/,/g, '');
          const user = (log.performedBy || log.admin || '').replace(/,/g, '');
          const ts = formatTimestamp(log.timestamp).replace(/,/g, '');
          const details = renderDetails(log).replace(/,/g, ';');
          return `${action},${entity},${id},${user},${ts},${details}`;
        }).join("\n");
        
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="blank-page" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Audit Logs &amp; Traceability</h1>
          <p style={{ color: '#6B7280', fontSize: '14px', margin: '4px 0 0 0' }}>Immutable historical activity records of all administrator actions.</p>
        </div>
        <button 
          onClick={handleExport}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', color: '#374151',
            border: '1px solid #D1D5DB', padding: '10px 16px', borderRadius: '8px', fontSize: '13px',
            fontWeight: '600', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}
        >
          <Download size={16} />
          Export Log
        </button>
      </div>
      
      <div style={{ flex: 1, padding: '4px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', padding: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
              <div className="skeleton" style={{ height: '100px', borderRadius: '12px' }}></div>
              <div className="skeleton" style={{ height: '100px', borderRadius: '12px' }}></div>
              <div className="skeleton" style={{ height: '100px', borderRadius: '12px' }}></div>
              <div className="skeleton" style={{ height: '100px', borderRadius: '12px' }}></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
              <div className="skeleton" style={{ width: '300px', height: '42px', borderRadius: '10px' }}></div>
              <div className="skeleton" style={{ width: '150px', height: '42px', borderRadius: '10px' }}></div>
            </div>
            <div className="skeleton" style={{ flex: 1, width: '100%', borderRadius: '16px', minHeight: '300px' }}></div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            
            {/* Action Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={18} color="#999" style={{ position: 'absolute', left: '12px', top: '10px' }} />
                  <input 
                    type="text" 
                    placeholder="Search logs by action, ID, or user..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                      padding: '0 16px 0 40px', height: '42px', borderRadius: '10px',
                      border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)',
                      outline: 'none', width: '320px', fontSize: '14px', transition: 'border-color 0.2s'
                    }}
                  />
                </div>
                
                <select 
                  value={entityFilter}
                  onChange={(e) => setEntityFilter(e.target.value)}
                  style={{
                    padding: '0 16px', height: '42px', borderRadius: '10px',
                    border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)',
                    outline: 'none', fontSize: '14px', cursor: 'pointer'
                  }}
                >
                  {uniqueEntities.map(ent => (
                    <option key={ent} value={ent}>{ent === 'All' ? 'All Entities' : ent}</option>
                  ))}
                </select>
              </div>
              
              <div style={{ fontSize: '13px', color: '#6B7280', fontWeight: '500' }}>
                Showing {filteredLogs.length} recent records
              </div>
            </div>

            {/* Table */}
            <div style={{ 
              flex: 1, background: 'rgba(255, 255, 255, 0.4)', borderRadius: '16px', 
              border: '1px solid rgba(255,255,255,0.8)', overflow: 'hidden', display: 'flex', flexDirection: 'column'
            }}>
              <div style={{ 
                display: 'grid', gridTemplateColumns: '1.5fr 1fr 1.5fr 1.5fr 1fr 2fr', 
                padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,0.05)',
                fontSize: '12px', fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', textAlign: 'left'
              }}>
                <div>Action</div>
                <div>Entity Type</div>
                <div>Entity ID / Reference</div>
                <div>Performed By</div>
                <div>Timestamp</div>
                <div>Details</div>
              </div>

              <div style={{ overflowY: 'auto', flex: 1 }}>
                {filteredLogs.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <FileText size={32} color="#9CA3AF" />
                    <div>No audit logs found matching your criteria.</div>
                  </div>
                ) : (
                  filteredLogs.map(log => {
                    const style = getActionStyle(log.action);
                    return (
                      <div key={log.id} style={{ 
                        display: 'grid', gridTemplateColumns: '1.5fr 1fr 1.5fr 1.5fr 1fr 2fr', 
                        padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,0.03)',
                        alignItems: 'center', fontSize: '13px', color: '#111'
                      }}>
                        <div>
                          <span style={{ 
                            color: style.color, background: style.bg, padding: '4px 8px', 
                            borderRadius: '6px', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap'
                          }}>
                            {log.action || 'UNKNOWN_ACTION'}
                          </span>
                        </div>
                        <div style={{ color: '#4B5563', fontWeight: '500' }}>{log.entityType || '-'}</div>
                        <div style={{ fontFamily: 'monospace', color: '#2563EB', fontSize: '12px' }}>{log.entityId || log.target || '-'}</div>
                        <div>
                          <div style={{ fontWeight: '500' }}>{log.performedBy || log.admin || 'System User'}</div>
                        </div>
                        <div style={{ fontSize: '12px', color: '#6B7280' }}>{formatTimestamp(log.timestamp)}</div>
                        <div style={{ 
                          fontSize: '12px', color: '#4B5563', whiteSpace: 'nowrap', 
                          overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' 
                        }} title={renderDetails(log)}>
                          {renderDetails(log)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            
          </div>
        )}
      </div>
    </div>
  );
}
