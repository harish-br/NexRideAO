import React from 'react';
import { X, Clock, ShieldAlert, CheckCircle, XCircle, Info, User, Monitor, Key } from 'lucide-react';

export default function AuditLogDetails({ log, onClose }) {
  if (!log) return null;

  const getSeverityColor = (sev) => {
    switch(sev?.toLowerCase()) {
      case 'critical': return '#EF4444';
      case 'warning': return '#F59E0B';
      default: return '#3B82F6';
    }
  };

  const sevColor = getSeverityColor(log.severity);
  const isSuccess = log.status !== 'failed';

  const formatTime = (ts) => {
    if (!ts) return '-';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleString();
    } catch { return String(ts); }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: '450px',
      background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
      zIndex: 1000, display: 'flex', flexDirection: 'column',
      animation: 'slideInRight 0.3s ease'
    }}>
      <div style={{ 
        padding: '24px', borderBottom: '1px solid #E5E7EB', display: 'flex', 
        justifyContent: 'space-between', alignItems: 'flex-start', background: '#F9FAFB'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ 
              background: isSuccess ? '#D1FAE5' : '#FEE2E2', 
              color: isSuccess ? '#065F46' : '#991B1B',
              padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase'
            }}>
              {log.status || 'Success'}
            </span>
            <span style={{ 
              background: `${sevColor}15`, color: sevColor,
              padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase'
            }}>
              {log.severity || 'Info'}
            </span>
          </div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>
            {log.action} Event
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#6B7280', fontSize: '12px', marginTop: '6px' }}>
            <Clock size={12} /> {formatTime(log.timestamp || log.createdAt)}
          </div>
        </div>
        <button onClick={onClose} style={{ 
          background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', 
          padding: '4px', borderRadius: '4px' 
        }}>
          <X size={20} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Core Info */}
        <section>
          <h3 style={{ fontSize: '12px', fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.05em' }}>Event Details</h3>
          <div style={{ background: '#F9FAFB', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <DetailRow label="Module" value={log.module} />
            <DetailRow label="Description" value={log.description} />
            <DetailRow label="Target Entity" value={`${log.entityType} (${log.entityId})`} />
            {log.entityName && <DetailRow label="Entity Name" value={log.entityName} />}
          </div>
        </section>

        {/* Actor Info */}
        <section>
          <h3 style={{ fontSize: '12px', fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.05em' }}>Actor Information</h3>
          <div style={{ background: '#F9FAFB', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <DetailRow label="Name" value={log.actor?.name} icon={<User size={14} />} />
            <DetailRow label="Email" value={log.actor?.email} />
            <DetailRow label="Role" value={log.actor?.role} />
            <DetailRow label="UID" value={log.actor?.uid} mono />
          </div>
        </section>

        {/* Changes */}
        {log.changes && (log.changes.before || log.changes.after) && (
          <section>
            <h3 style={{ fontSize: '12px', fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.05em' }}>Changes</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {log.changes.before && (
                <div style={{ background: '#FEF2F2', padding: '12px', borderRadius: '8px', border: '1px solid #FCA5A5' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: '#991B1B', marginBottom: '8px' }}>BEFORE</div>
                  <pre style={{ margin: 0, fontSize: '11px', color: '#7F1D1D', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                    {JSON.stringify(log.changes.before, null, 2)}
                  </pre>
                </div>
              )}
              {log.changes.after && (
                <div style={{ background: '#F0FDF4', padding: '12px', borderRadius: '8px', border: '1px solid #86EFAC', gridColumn: log.changes.before ? 'auto' : 'span 2' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: '#065F46', marginBottom: '8px' }}>AFTER</div>
                  <pre style={{ margin: 0, fontSize: '11px', color: '#14532D', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                    {JSON.stringify(log.changes.after, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Metadata */}
        {log.metadata && (
          <section>
            <h3 style={{ fontSize: '12px', fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.05em' }}>Request Metadata</h3>
            <div style={{ background: '#F9FAFB', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <DetailRow label="Device/Browser" value={log.metadata.userAgent} icon={<Monitor size={14} />} />
              <DetailRow label="Platform" value={log.metadata.platform} />
              <DetailRow label="Language" value={log.metadata.language} />
            </div>
          </section>
        )}

      </div>
    </div>
  );
}

function DetailRow({ label, value, icon, mono }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: '13px', color: '#111827', fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>
        {value}
      </div>
    </div>
  );
}
