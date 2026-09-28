import React from 'react';
import { Plus, Search, MoreVertical, Edit2, Eye, Trash2, ShieldAlert } from 'lucide-react';

export default function BusList({ buses, onAdd, onView, onEdit, onDelete }) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('All');

  const filteredBuses = buses.filter(bus => {
    const busNum = bus.busNumber || '';
    const regNum = bus.registrationNumber || bus.regNumber || '';
    const stat = bus.status || '';
    
    const matchesSearch = busNum.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          regNum.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || stat.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status) => {
    switch(status?.toLowerCase()) {
      case 'active': return '#2563EB'; // Blue
      case 'halted': return '#D97706'; // Amber
      case 'maintenance': return '#EA580C'; // Orange
      case 'breakdown': return '#DC2626'; // Red
      case 'spare': return '#64748B'; // Slate
      default: return '#6B7280';
    }
  };

  const getDocStatusBadge = (docs) => {
    if (!docs) return <span style={{ color: '#DC2626', fontWeight: 500 }}>Missing Docs</span>;
    // Basic logic for now - check if all 4 required docs exist
    const { rc, fitness, insurance, pollution } = docs;
    if (!rc || !fitness || !insurance || !pollution) {
      return <span style={{ color: '#D97706', fontWeight: 500 }}>Incomplete</span>;
    }
    return <span style={{ color: '#16A34A', fontWeight: 500 }}>Valid</span>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={18} color="#999" style={{ position: 'absolute', left: '12px', top: '10px' }} />
            <input 
              type="text" 
              placeholder="Search buses..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={(e) => e.target.style.borderColor = '#2563EB'}
              onBlur={(e) => e.target.style.borderColor = 'rgba(0,0,0,0.1)'}
              style={{
                padding: '0 16px 0 40px',
                height: '42px',
                borderRadius: '10px',
                border: '1px solid rgba(0,0,0,0.1)',
                background: 'rgba(255,255,255,0.8)',
                outline: 'none',
                width: '260px',
                fontSize: '14px',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s'
              }}
            />
          </div>
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            onFocus={(e) => e.target.style.borderColor = '#2563EB'}
            onBlur={(e) => e.target.style.borderColor = 'rgba(0,0,0,0.1)'}
            style={{
              padding: '0 36px 0 16px',
              height: '42px',
              borderRadius: '10px',
              border: '1px solid rgba(0,0,0,0.1)',
              background: 'rgba(255,255,255,0.8)',
              outline: 'none',
              fontSize: '14px',
              cursor: 'pointer',
              boxSizing: 'border-box',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              backgroundSize: '16px',
              transition: 'border-color 0.2s'
            }}
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Halted">Halted</option>
            <option value="Maintenance">Maintenance</option>
            <option value="Breakdown">Breakdown</option>
            <option value="Spare">Spare</option>
          </select>
        </div>

        <button 
          onClick={onAdd}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(37, 99, 235, 0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.15)';
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: '#2563EB',
            color: 'white',
            border: 'none',
            padding: '10px 24px',
            height: '42px',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.15)',
            transition: 'all 0.2s ease-in-out'
          }}
        >
          <Plus size={18} strokeWidth={2.5} />
          Add Bus
        </button>
      </div>

      {/* Table */}
      <div style={{ 
        flex: 1, 
        background: 'rgba(255, 255, 255, 0.4)', 
        borderRadius: '16px', 
        border: '1px solid rgba(255,255,255,0.8)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1.2fr 1fr 1fr 1.5fr 1.5fr 1fr 80px', 
          padding: '16px 20px', 
          borderBottom: '1px solid rgba(0,0,0,0.05)',
          fontSize: '12px',
          fontWeight: '600',
          color: '#6B7280',
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          textAlign: 'center'
        }}>
          <div>Bus No</div>
          <div>Registration</div>
          <div>Manufacturer</div>
          <div>Status</div>
          <div>Assigned Route</div>
          <div>Assigned Driver</div>
          <div>Docs</div>
          <div>Actions</div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filteredBuses.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>
              No buses found matching your criteria.
            </div>
          ) : (
            filteredBuses.map(bus => (
              <div key={bus.id} style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1.2fr 1fr 1fr 1.5fr 1.5fr 1fr 80px', 
                padding: '16px 20px', 
                borderBottom: '1px solid rgba(0,0,0,0.03)',
                alignItems: 'center',
                fontSize: '14px',
                color: '#111',
                transition: 'background 0.2s',
                cursor: 'default',
                textAlign: 'center'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.6)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ fontWeight: '600' }}>{bus.busNumber || '-'}</div>
                <div>{bus.registrationNumber || bus.regNumber || '-'}</div>
                <div style={{ color: '#4b5563' }}>{bus.manufacturer || '-'}</div>
                <div>
                  <span style={{ 
                    color: getStatusColor(bus.status || 'Active'),
                    background: `${getStatusColor(bus.status || 'Active')}15`,
                    padding: '4px 10px',
                    borderRadius: '100px',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}>
                    {bus.status || 'Active'}
                  </span>
                </div>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '8px' }}>
                  {bus.assignedRouteName || bus.routeName || bus.route || <span style={{ color: '#9CA3AF' }}>Unassigned</span>}
                </div>
                <div>{bus.assignedDriverName || bus.driverName || <span style={{ color: '#9CA3AF' }}>Unassigned</span>}</div>
                <div>{getDocStatusBadge(bus.documents)}</div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  <button onClick={() => onView(bus)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }} title="View Details">
                    <Eye size={18} />
                  </button>
                  <button onClick={() => onEdit(bus)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }} title="Edit">
                    <Edit2 size={18} />
                  </button>
                  <button onClick={() => onDelete(bus)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444' }} title="Delete">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
