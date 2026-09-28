import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import RouteForm from '../components/routes/RouteForm';
import { Plus, Trash2, Search, Edit2 } from 'lucide-react';

export default function Routes() {
  const [routes, setRoutes] = useState([]);
  const [viewMode, setViewMode] = useState('list');
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    try {
      const unsubscribe = onSnapshot(collection(db, 'routes'), (snapshot) => {
        const routesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setRoutes(routesData);
        setLoading(false);
      }, (err) => {
        console.error("Firestore error on routes:", err);
        setLoading(false);
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

  const handleBackToList = () => {
    setSelectedRoute(null);
    setViewMode('list');
  };

  const handleDelete = async (route) => {
    if (window.confirm(`Are you sure you want to delete route ${route.routeName}?`)) {
      try {
        await deleteDoc(doc(db, 'routes', route.id));
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

  const getStatusColor = (status) => {
    switch(status?.toLowerCase()) {
      case 'active': return '#16A34A';
      case 'inactive': return '#64748B';
      default: return '#6B7280';
    }
  };

  return (
    <div className="blank-page" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="header">
        <h1>Routes</h1>
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
          <>
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
                      filteredRoutes.map(route => (
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
                          <div style={{ fontWeight: '600', textAlign: 'left' }}>{route.routeName || '-'}</div>
                          <div>{route.startPoint || '-'}</div>
                          <div>{route.destination || '-'}</div>
                          <div>{route.stops ? `${route.stops.length} Stops` : '0 Stops'}</div>
                          <div style={{ color: '#4b5563' }}>{route.assignedBusName || '-'}</div>
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
                            <button onClick={() => handleEdit(route)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }} title="Edit">
                              <Edit2 size={18} />
                            </button>
                            <button onClick={() => handleDelete(route)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444' }} title="Delete">
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
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
          </>
        )}
      </div>
    </div>
  );
}
