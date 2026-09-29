import React, { useState } from 'react';
import { Plus, Search, MoreVertical, Edit2, Trash2, ShieldAlert, ChevronLeft, ChevronRight } from 'lucide-react';
import ScrollingText from '../common/ScrollingText';
import RefreshButton from '../common/RefreshButton';

export default function BusList({ buses, onAdd, onView, onEdit, onDelete }) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('All');
  const [currentPage, setCurrentPage] = React.useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const itemsPerPage = 10;

  const filteredBuses = buses.filter(bus => {
    const busNum = bus.busNumber || '';
    const regNum = bus.registrationNumber || bus.regNumber || '';
    const stat = bus.status || '';
    
    const matchesSearch = busNum.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          regNum.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || stat.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredBuses.length / itemsPerPage);
  const currentBuses = filteredBuses.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

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
          <RefreshButton 
            loading={refreshing} 
            onClick={() => {
              setRefreshing(true);
              setTimeout(() => setRefreshing(false), 400);
            }} 
            label="" 
            title="Refresh buses" 
          />
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
            currentBuses.map(bus => (
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
                <div style={{ fontWeight: '600', minWidth: 0 }}><ScrollingText text={bus.busNumber || '-'} /></div>
                <div style={{ minWidth: 0 }}><ScrollingText text={bus.registrationNumber || bus.regNumber || '-'} /></div>
                <div style={{ color: '#4b5563', minWidth: 0 }}><ScrollingText text={bus.manufacturer || '-'} /></div>
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
                <div style={{ minWidth: 0 }}>
                  <ScrollingText text={bus.assignedRouteName || bus.routeName || bus.route || 'Unassigned'} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <ScrollingText text={bus.assignedDriverName || bus.driverName || 'Unassigned'} />
                </div>
                <div>{getDocStatusBadge(bus.documents)}</div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  <button onClick={() => onView(bus)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }} title="View Details">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                      <path d="M15 22.75H14C13.59 22.75 13.25 22.41 13.25 22C13.25 21.59 13.59 21.25 14 21.25H15C19.61 21.25 21.25 19.61 21.25 15V9C21.25 4.39 19.61 2.75 15 2.75H9C4.39 2.75 2.75 4.39 2.75 9V9.98C2.75 10.39 2.41 10.73 2 10.73C1.59 10.73 1.25 10.39 1.25 9.98V9C1.25 3.57 3.57 1.25 9 1.25H15C20.43 1.25 22.75 3.57 22.75 9V15C22.75 20.43 20.43 22.75 15 22.75Z"/>
                      <path d="M12.9999 11.7507C12.8099 11.7507 12.6199 11.6807 12.4699 11.5307C12.1799 11.2407 12.1799 10.7607 12.4699 10.4707L16.2099 6.7207H13.9999C13.5899 6.7207 13.2499 6.3807 13.2499 5.9707C13.2499 5.5607 13.5799 5.2207 13.9999 5.2207H18.0099C18.3099 5.2207 18.5899 5.4007 18.6999 5.6807C18.8199 5.9607 18.7499 6.2807 18.5399 6.5007L13.5299 11.5307C13.3799 11.6807 13.1899 11.7507 12.9999 11.7507Z"/>
                      <path d="M18.01 10.7407C17.6 10.7407 17.26 10.4007 17.26 9.9907V5.9707C17.26 5.5607 17.6 5.2207 18.01 5.2207C18.42 5.2207 18.76 5.5607 18.76 5.9707V9.9807C18.76 10.4007 18.42 10.7407 18.01 10.7407Z"/>
                      <path d="M7.85 22.75H5.15C2.49 22.75 1.25 21.51 1.25 18.85V16.15C1.25 13.49 2.49 12.25 5.15 12.25H7.85C10.51 12.25 11.75 13.49 11.75 16.15V18.85C11.75 21.51 10.51 22.75 7.85 22.75ZM5.15 13.75C3.31 13.75 2.75 14.31 2.75 16.15V18.85C2.75 20.69 3.31 21.25 5.15 21.25H7.85C9.69 21.25 10.25 20.69 10.25 18.85V16.15C10.25 14.31 9.69 13.75 7.85 13.75H5.15Z"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        
        {filteredBuses.length > 0 && (
          <div style={{ 
            padding: '16px 20px', 
            borderTop: '1px solid rgba(0,0,0,0.05)', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            background: '#fff'
          }}>
            <div style={{ fontSize: '13px', color: '#6B7280' }}>
              Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredBuses.length)} to {Math.min(currentPage * itemsPerPage, filteredBuses.length)} of {filteredBuses.length} buses
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '32px', height: '32px', borderRadius: '6px',
                  background: currentPage === 1 ? 'transparent' : 'white',
                  border: '1px solid',
                  borderColor: currentPage === 1 ? 'transparent' : '#E5E7EB',
                  color: currentPage === 1 ? '#D1D5DB' : '#374151',
                  cursor: currentPage === 1 ? 'default' : 'pointer',
                  boxShadow: currentPage === 1 ? 'none' : '0 1px 2px rgba(0,0,0,0.05)'
                }}
              >
                <ChevronLeft size={16} />
              </button>
              
              <div style={{ fontSize: '13px', color: '#374151', padding: '0 8px' }}>
                Page {currentPage} of {totalPages || 1}
              </div>

              <button 
                disabled={currentPage === totalPages || totalPages === 0}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '32px', height: '32px', borderRadius: '6px',
                  background: currentPage === totalPages || totalPages === 0 ? 'transparent' : 'white',
                  border: '1px solid',
                  borderColor: currentPage === totalPages || totalPages === 0 ? 'transparent' : '#E5E7EB',
                  color: currentPage === totalPages || totalPages === 0 ? '#D1D5DB' : '#374151',
                  cursor: currentPage === totalPages || totalPages === 0 ? 'default' : 'pointer',
                  boxShadow: currentPage === totalPages || totalPages === 0 ? 'none' : '0 1px 2px rgba(0,0,0,0.05)'
                }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
