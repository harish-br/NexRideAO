import React from 'react';

const ACTIONS    = ['CREATE','UPDATE','DELETE','LOGIN','LOGOUT','EXPORT','APPROVE'];
const MODULES    = ['Dashboard','Bus Management','Driver Management','Student Management','Route Management','Authentication','Audit Logs'];
const SEVERITIES = ['info','warning','critical'];
const DATES      = ['All Time','Today','Yesterday','Last 7 Days','Last 30 Days'];

const selectStyle = {
  height: '40px',
  padding: '0 12px',
  borderRadius: '10px',
  border: '1px solid #E7EAF0',
  background: '#fff',
  fontSize: '13px',
  fontWeight: '500',
  color: '#374151',
  cursor: 'pointer',
  outline: 'none',
  appearance: 'none',
  WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23667085' stroke-width='1.3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  paddingRight: '28px',
  minWidth: '120px',
  transition: 'border-color 0.15s',
};

export default function AuditLogFilters({
  searchTerm, setSearchTerm,
  dateRange, setDateRange,
  actionFilter, setActionFilter,
  moduleFilter, setModuleFilter,
  severityFilter, setSeverityFilter,
}) {
  const hasFilters = dateRange !== 'All Time' || actionFilter || moduleFilter || severityFilter || searchTerm;

  const clearAll = () => {
    setDateRange('All Time');
    setActionFilter('');
    setModuleFilter('');
    setSeverityFilter('');
    setSearchTerm('');
  };

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '10px',
      marginBottom: '16px',
      alignItems: 'center',
    }}>
      {/* Search */}
      <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
        <svg
          width="15" height="15" viewBox="0 0 24 24" fill="none"
          stroke="#9CA3AF" strokeWidth="1.8"
          style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          placeholder="Search by user, action, module..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{
            width: '100%', height: '40px',
            padding: '0 36px 0 38px',
            borderRadius: '10px',
            border: '1px solid #E7EAF0',
            background: '#fff',
            fontSize: '13px', color: '#111827',
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => { e.target.style.borderColor = '#0044CC'; }}
          onBlur={e  => { e.target.style.borderColor = '#E7EAF0'; }}
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            style={{
              position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
              color: '#9CA3AF', display: 'flex', lineHeight: 1,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M1 1l11 11M12 1L1 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>

      {/* Date */}
      <select
        value={dateRange}
        onChange={e => setDateRange(e.target.value)}
        style={selectStyle}
        onFocus={e  => { e.target.style.borderColor = '#0044CC'; }}
        onBlur={e   => { e.target.style.borderColor = '#E7EAF0'; }}
      >
        {DATES.map(d => <option key={d} value={d}>{d}</option>)}
      </select>

      {/* Action */}
      <select
        value={actionFilter}
        onChange={e => setActionFilter(e.target.value)}
        style={selectStyle}
        onFocus={e  => { e.target.style.borderColor = '#0044CC'; }}
        onBlur={e   => { e.target.style.borderColor = '#E7EAF0'; }}
      >
        <option value="">All Actions</option>
        {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
      </select>

      {/* Module */}
      <select
        value={moduleFilter}
        onChange={e => setModuleFilter(e.target.value)}
        style={{ ...selectStyle, minWidth: '140px' }}
        onFocus={e  => { e.target.style.borderColor = '#0044CC'; }}
        onBlur={e   => { e.target.style.borderColor = '#E7EAF0'; }}
      >
        <option value="">All Modules</option>
        {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
      </select>

      {/* Severity */}
      <select
        value={severityFilter}
        onChange={e => setSeverityFilter(e.target.value)}
        style={selectStyle}
        onFocus={e  => { e.target.style.borderColor = '#0044CC'; }}
        onBlur={e   => { e.target.style.borderColor = '#E7EAF0'; }}
      >
        <option value="">All Severities</option>
        {SEVERITIES.map(s => (
          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
        ))}
      </select>

      {/* Clear */}
      {hasFilters && (
        <button
          onClick={clearAll}
          style={{
            height: '40px', padding: '0 14px',
            background: 'none', border: '1px solid #E7EAF0',
            borderRadius: '10px', color: '#667085',
            fontSize: '13px', fontWeight: '500', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
            transition: 'background 0.15s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#F6F8FB'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          Clear
        </button>
      )}
    </div>
  );
}
