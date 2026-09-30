import React, { useEffect, useRef } from 'react';

/* ── helpers ── */
const fmt = (ts) => {
  if (!ts) return { date: '—', time: '' };
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return {
      date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
  } catch { return { date: String(ts), time: '' }; }
};

const initials = (name) => {
  if (!name) return 'SY';
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
};

/* ── Sub-components ── */
function Label({ children }) {
  return (
    <div style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '500', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
      {children}
    </div>
  );
}

function Value({ children }) {
  return (
    <div style={{ fontSize: '13px', color: '#111827', fontWeight: '500', wordBreak: 'break-word' }}>
      {children || <span style={{ color: '#C4CAD4', fontWeight: '400' }}>—</span>}
    </div>
  );
}

function Field({ label, value, mono }) {
  return (
    <div>
      <Label>{label}</Label>
      <Value>
        {value
          ? <span style={{ fontFamily: mono ? '"SF Mono","Fira Code",monospace' : 'inherit', fontSize: mono ? '12px' : '13px' }}>{value}</span>
          : null
        }
      </Value>
    </div>
  );
}

function Divider() {
  return <div style={{ height: '1px', background: '#F0F2F5', margin: '4px 0' }} />;
}

/* ── Severity / Status styles ── */
const SEV_STYLE = {
  critical: { color: '#E53935', bg: '#FEF2F2' },
  warning:  { color: '#D98B00', bg: '#FFF8EA' },
  info:     { color: '#2563EB', bg: '#EBF2FF' },
};
const STA_DOT = {
  success: '#00A86B',
  failed:  '#E53935',
  pending: '#D98B00',
};

export default function AuditLogDetails({ log, onClose }) {
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!log) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    drawerRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [log, onClose]);

  if (!log) return null;

  const { date, time } = fmt(log.timestamp || log.createdAt);
  const sev = SEV_STYLE[log.severity?.toLowerCase()] || SEV_STYLE.info;
  const dotColor = STA_DOT[log.status?.toLowerCase()] || '#00A86B';
  const ini = initials(log.actor?.name);

  /* compute changed keys only */
  const before = log.changes?.before || {};
  const after  = log.changes?.after  || {};
  const changedKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter(
    k => JSON.stringify(before[k]) !== JSON.stringify(after[k])
  );

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15,23,42,0.15)',
          zIndex: 998,
        }}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Audit event details"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: '440px',
          background: '#fff',
          borderLeft: '1px solid #E7EAF0',
          boxShadow: '-8px 0 32px rgba(15,23,42,0.08)',
          zIndex: 999,
          display: 'flex', flexDirection: 'column',
          outline: 'none',
          animation: 'auditDrawerIn 0.25s ease',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #F0F2F5',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: '700', color: '#111827' }}>
              Audit Details
            </h2>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                background: dotColor === '#00A86B' ? '#E8F8F1' : dotColor === '#E53935' ? '#FEF2F2' : '#FFF8EA',
                color: dotColor, padding: '2px 9px', borderRadius: '100px',
                fontSize: '11px', fontWeight: '600',
              }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: dotColor, display: 'inline-block' }} />
                {log.status === 'failed' ? 'Failed' : 'Success'}
              </span>
              <span style={{
                background: sev.bg, color: sev.color,
                padding: '2px 9px', borderRadius: '100px',
                fontSize: '11px', fontWeight: '600', textTransform: 'capitalize',
              }}>
                {log.severity || 'info'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: '#F6F8FB', border: '1px solid #E7EAF0',
              borderRadius: '8px', width: '32px', height: '32px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#667085', flexShrink: 0,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#EAECF0'}
            onMouseLeave={e => e.currentTarget.style.background = '#F6F8FB'}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M1 1l11 11M12 1L1 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Actor */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '14px 16px',
            background: '#F6F8FB', borderRadius: '12px',
            border: '1px solid #F0F2F5',
          }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '10px', flexShrink: 0,
              background: '#EAF1FF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '13px', fontWeight: '700', color: '#0044CC',
            }}>
              {ini}
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                {log.actor?.name || 'System User'}
              </div>
              <div style={{ fontSize: '12px', color: '#667085', marginTop: '2px' }}>
                {log.actor?.email || '—'} · <span style={{ textTransform: 'capitalize' }}>{log.actor?.role || 'admin'}</span>
              </div>
            </div>
          </div>

          {/* Event Details */}
          <section>
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '12px' }}>
              Event Details
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Field label="Timestamp"  value={`${date} ${time}`} />
              <Divider />
              <Field label="Event ID"   value={log.id}        mono />
              <Divider />
              <Field label="Action"     value={log.action} />
              <Divider />
              <Field label="Module"     value={log.module} />
              <Divider />
              <Field label="Entity"     value={log.entityType ? `${log.entityType}${log.entityId ? ` · ${log.entityId}` : ''}` : null} />
              {log.entityName && <>
                <Divider />
                <Field label="Entity Name" value={log.entityName} />
              </>}
              <Divider />
              <Field label="Description" value={log.description} />
            </div>
          </section>

          {/* Changes */}
          {changedKeys.length > 0 && (
            <section>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '12px' }}>
                Changes
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {changedKeys.map(k => (
                  <div key={k} style={{
                    border: '1px solid #F0F2F5',
                    borderRadius: '10px',
                    overflow: 'hidden',
                  }}>
                    <div style={{ padding: '8px 12px', background: '#F6F8FB', fontSize: '12px', fontWeight: '600', color: '#374151', borderBottom: '1px solid #F0F2F5', textTransform: 'capitalize' }}>
                      {k.replace(/_/g, ' ')}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                      <div style={{ padding: '10px 12px', borderRight: '1px solid #F0F2F5' }}>
                        <div style={{ fontSize: '10px', fontWeight: '600', color: '#9CA3AF', marginBottom: '4px', letterSpacing: '0.4px' }}>BEFORE</div>
                        <div style={{ fontSize: '12px', color: '#111827', wordBreak: 'break-word' }}>
                          {before[k] !== undefined ? String(before[k]) : <span style={{ color: '#C4CAD4' }}>—</span>}
                        </div>
                      </div>
                      <div style={{ padding: '10px 12px' }}>
                        <div style={{ fontSize: '10px', fontWeight: '600', color: '#00A86B', marginBottom: '4px', letterSpacing: '0.4px' }}>AFTER</div>
                        <div style={{ fontSize: '12px', color: '#111827', wordBreak: 'break-word' }}>
                          {after[k] !== undefined ? String(after[k]) : <span style={{ color: '#C4CAD4' }}>—</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Metadata */}
          {log.metadata && (
            <section>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '12px' }}>
                Request Metadata
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <Field label="Platform" value={log.metadata.platform} />
                <Divider />
                <Field label="Language" value={log.metadata.language} />
                <Divider />
                <Field label="User Agent" value={log.metadata.userAgent} />
              </div>
            </section>
          )}

        </div>
      </div>
    </>
  );
}
