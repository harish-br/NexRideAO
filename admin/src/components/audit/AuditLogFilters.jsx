import React from 'react';
import { Search, Filter, Calendar } from 'lucide-react';

export default function AuditLogFilters({ 
  searchTerm, setSearchTerm, 
  dateRange, setDateRange,
  actionFilter, setActionFilter,
  moduleFilter, setModuleFilter,
  severityFilter, setSeverityFilter
}) {
  const actions = ['', 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', 'APPROVE'];
  const modules = ['', 'Dashboard', 'Bus Management', 'Driver Management', 'Student Management', 'Route Management', 'Authentication', 'Audit Logs'];
  const severities = ['', 'info', 'warning', 'critical'];
  const dates = ['All Time', 'Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days'];

  const selectStyle = {
    padding: '0 36px 0 16px', height: '42px', borderRadius: '10px',
    border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)',
    outline: 'none', fontSize: '13px', cursor: 'pointer', appearance: 'none',
    fontWeight: '500', color: '#374151', minWidth: '130px'
  };

  const wrapperStyle = { position: 'relative', display: 'flex', alignItems: 'center' };
  const iconStyle = { position: 'absolute', right: '12px', pointerEvents: 'none', color: '#9CA3AF' };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px', alignItems: 'center' }}>
      <div style={{ position: 'relative', flex: '1', minWidth: '250px' }}>
        <Search size={16} color="#9CA3AF" style={{ position: 'absolute', left: '14px', top: '13px' }} />
        <input 
          type="text" 
          placeholder="Search audit logs..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: '0 16px 0 40px', height: '42px', borderRadius: '10px',
            border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)',
            outline: 'none', width: '100%', fontSize: '14px', transition: 'all 0.2s'
          }}
        />
      </div>

      <div style={wrapperStyle}>
        <select style={selectStyle} value={dateRange} onChange={e => setDateRange(e.target.value)}>
          {dates.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <Calendar size={14} style={iconStyle} />
      </div>

      <div style={wrapperStyle}>
        <select style={selectStyle} value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
          <option value="">All Actions</option>
          {actions.filter(Boolean).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <Filter size={14} style={iconStyle} />
      </div>

      <div style={wrapperStyle}>
        <select style={selectStyle} value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}>
          <option value="">All Modules</option>
          {modules.filter(Boolean).map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <Filter size={14} style={iconStyle} />
      </div>

      <div style={wrapperStyle}>
        <select style={selectStyle} value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}>
          <option value="">All Severities</option>
          {severities.filter(Boolean).map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <Filter size={14} style={iconStyle} />
      </div>
    </div>
  );
}
