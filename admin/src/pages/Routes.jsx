import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import RouteForm from '../components/routes/RouteForm';
import { Plus, Trash2, Search, Edit2, UserCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import DetailsView from '../components/common/DetailsView';
import ScrollingText from '../components/common/ScrollingText';

export default function Routes() {
  const [routes, setRoutes] = useState([]);
  const [viewMode, setViewMode] = useState('list');
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    try {
      const unsubscribe = onSnapshot(collection(db, 'routes'), (snapshot) => {
        const routesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setRoutes(routesData);
        setTimeout(() => setLoading(false), 400);
      }, (err) => {
        console.error("Firestore error on routes:", err);
        setTimeout(() => setLoading(false), 400);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  }, []);

  const handleAdd = () => {
    setSelectedRoute(null);
    setViewMode('add');
  };

  const handleEdit = (route) => {
    setSelectedRoute(route);
    setViewMode('edit');
  };

  const handleView = (route) => {
    setSelectedRoute(route);
    setViewMode('details');
  };

  const handleBackToList = () => {
    setSelectedRoute(null);
    setViewMode('list');
  };

  const handleDelete = async (route) => {
    if (window.confirm(`Are you sure you want to delete route ${route.routeName}?`)) {
      const remarks = window.prompt("Please enter remarks or reason for deletion:");
      if (remarks === null) return;
      try {
        await deleteDoc(doc(db, 'routes', route.id));
        if (viewMode === 'details') handleBackToList();
      } catch (err) {
        console.error("Failed to delete route:", err);
      }
    }
  };

  const filteredRoutes = routes.filter(r => 
    (r.routeName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.startPoint || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.destination || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredRoutes.length / itemsPerPage);
  const currentRoutes = filteredRoutes.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const getStatusColor = (status) => {
    switch(status?.toLowerCase()) {
      case 'active': return '#16A34A';
      case 'inactive': return '#64748B';
      default: return '#6B7280';
    }
  };

  return (
    <div className="blank-page" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="header" style={{ marginBottom: '0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h1>Routes</h1>
          <div style={{ fontSize: '14px', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <UserCircle size={16} />
            {routes.length} registered
          </div>
        </div>
      </div>
      
      <div style={{ flex: 1, padding: '4px', display: 'flex', flexDirection: 'column', minHeight: 0, marginTop: '16px' }}>
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
          <div className="animate-fade-in-up" style={{ animationDelay: '0.05s', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {viewMode === 'list' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Action Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ position: 'relative' }}>
                      <Search size={18} color="#999" style={{ position: 'absolute', left: '12px', top: '10px' }} />
                      <input 
                        type="text" 
                        placeholder="Search routes..." 
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
                  </div>

                  <button 
                    onClick={handleAdd}
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
                    Create Route
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
                    gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 1fr 80px', 
                    padding: '16px 20px', 
                    borderBottom: '1px solid rgba(0,0,0,0.05)',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6B7280',
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                    textAlign: 'center'
                  }}>
                    <div style={{ textAlign: 'left' }}>Route Name</div>
                    <div>Start Point</div>
                    <div>Destination</div>
                    <div>Total Stops</div>
                    <div>Assigned Bus</div>
                    <div>Status</div>
                    <div>Actions</div>
                  </div>

                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {filteredRoutes.length === 0 ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>
                        No routes found matching your criteria.
                      </div>
                    ) : (
                      currentRoutes.map(route => (
                        <div key={route.id} style={{ 
                          display: 'grid', 
                          gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 1fr 80px', 
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
                          <div style={{ fontWeight: '600', textAlign: 'left', minWidth: 0 }}>
                            <ScrollingText text={route.routeName || '-'} />
                          </div>
                          <div style={{ minWidth: 0 }}><ScrollingText text={route.startPoint || '-'} /></div>
                          <div style={{ minWidth: 0 }}><ScrollingText text={route.destination || '-'} /></div>
                          <div>{route.stops ? `${route.stops.length} Stops` : '0 Stops'}</div>
                          <div style={{ color: '#4b5563', minWidth: 0 }}><ScrollingText text={route.assignedBusName || '-'} /></div>
                          <div>
                            <span style={{ 
                              color: getStatusColor(route.status || 'Active'),
                              background: `${getStatusColor(route.status || 'Active')}15`,
                              padding: '4px 10px',
                              borderRadius: '100px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              {route.status || 'Active'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            <button onClick={() => handleView(route)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }} title="View Details">
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
                  
                  {filteredRoutes.length > 0 && (
                    <div style={{ 
                      padding: '16px 20px', 
                      borderTop: '1px solid rgba(0,0,0,0.05)', 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      background: '#fff'
                    }}>
                      <div style={{ fontSize: '13px', color: '#6B7280' }}>
                        Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredRoutes.length)} to {Math.min(currentPage * itemsPerPage, filteredRoutes.length)} of {filteredRoutes.length} routes
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
            )}
            
            {(viewMode === 'add' || viewMode === 'edit') && (
              <RouteForm 
                route={selectedRoute} 
                onBack={handleBackToList} 
                onSaveComplete={handleBackToList} 
              />
            )}
            {viewMode === 'details' && selectedRoute && (
              <DetailsView
                title={selectedRoute.routeName || 'Unknown Route'}
                subtitle={selectedRoute.status || 'Active'}
                data={[
                  { label: 'Start Point', value: selectedRoute.startPoint },
                  { label: 'Destination', value: selectedRoute.destination },
                  { label: 'Total Stops', value: selectedRoute.stops ? `${selectedRoute.stops.length} Stops` : '0 Stops' },
                  { label: 'Assigned Bus', value: selectedRoute.assignedBusName },
                  { label: 'Distance', value: selectedRoute.distance ? `${selectedRoute.distance} km` : '-' },
                  { label: 'Estimated Time', value: selectedRoute.estimatedTime ? `${selectedRoute.estimatedTime} mins` : '-' }
                ]}
                onBack={handleBackToList}
                onEdit={() => handleEdit(selectedRoute)}
                onDelete={() => handleDelete(selectedRoute)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
