import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';

import BusList from '../components/buses/BusList';
import BusForm from '../components/buses/BusForm';
import BusDetails from '../components/buses/BusDetails';

export default function Buses() {
  const [buses, setBuses] = useState([]);
  const [viewMode, setViewMode] = useState('list'); // 'list', 'add', 'edit', 'details'
  const [selectedBus, setSelectedBus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Real-time Firestore listener
  useEffect(() => {
    try {
      const unsubscribe = onSnapshot(collection(db, 'buses'), (snapshot) => {
        const busesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Sort by created date descending if available, else by bus number
        busesData.sort((a, b) => {
          if (a.createdAt && b.createdAt) {
             return new Date(b.createdAt) - new Date(a.createdAt);
          }
          return (a.busNumber || '').localeCompare(b.busNumber || '');
        });
        
        setBuses(busesData);
        setBuses(busesData);
        setTimeout(() => setLoading(false), 400);
      }, (err) => {
        console.error("Firestore Error:", err);
        setError("Failed to load buses from database. Please check your Firebase configuration.");
        setTimeout(() => setLoading(false), 400);
      });
      
      return () => unsubscribe();
    } catch (err) {
      console.error("Firebase setup error:", err);
      setError("Firebase is not properly configured. Ensure src/firebase.js has valid credentials.");
      setLoading(false);
    }
  }, []);

  const handleAdd = () => {
    setSelectedBus(null);
    setViewMode('add');
  };

  const handleView = (bus) => {
    setSelectedBus(bus);
    setViewMode('details');
  };

  const handleEdit = (bus) => {
    setSelectedBus(bus);
    setViewMode('edit');
  };

  const handleBackToList = () => {
    setSelectedBus(null);
    setViewMode('list');
  };

  const handleDelete = async (bus) => {
    if (window.confirm(`Are you sure you want to delete bus ${bus.busNumber}?`)) {
      const remarks = window.prompt("Please enter remarks or reason for deletion:");
      if (remarks === null) return; // User cancelled
      
      try {
        await import('firebase/firestore').then(({ deleteDoc, doc }) => {
          return deleteDoc(doc(db, 'buses', bus.id));
        });
      } catch (err) {
        console.error("Failed to delete bus:", err);
        alert("Failed to delete bus.");
      }
    }
  };

  return (
    <div className="blank-page" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="header" style={{ marginBottom: '0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h1>Buses</h1>
          <div style={{ fontSize: '14px', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="18" height="18" style={{ verticalAlign: 'middle', fill: 'currentColor', overflow: 'hidden' }} viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
              <path d="M881.777778 284.444444V199.111111c0-56.888889-59.733333-113.777778-369.777778-113.777778S142.222222 142.222222 142.222222 199.111111v85.333333c-31.288889 0-56.888889 25.6-56.888889 56.888889v56.888889c0 31.288889 25.6 56.888889 56.888889 56.888889v312.888889c0 31.288889 17.066667 59.733333 42.666667 73.955556v54.044444C184.888889 935.822222 216.177778 967.111111 256 967.111111s71.111111-31.288889 71.111111-71.111111V853.333333h369.777778v42.666667c0 39.822222 31.288889 71.111111 71.111111 71.111111s71.111111-31.288889 71.111111-71.111111v-54.044444c25.6-14.222222 42.666667-42.666667 42.666667-73.955556V455.111111c31.288889 0 56.888889-25.6 56.888889-56.888889v-56.888889c0-31.288889-25.6-56.888889-56.888889-56.888889zM312.888889 170.666667h398.222222c17.066667 0 28.444444 11.377778 28.444445 28.444444s-11.377778 28.444444-28.444445 28.444445H312.888889c-17.066667 0-28.444444-11.377778-28.444445-28.444445s11.377778-28.444444 28.444445-28.444444zM256 796.444444c-31.288889 0-56.888889-25.6-56.888889-56.888888s25.6-56.888889 56.888889-56.888889 56.888889 25.6 56.888889 56.888889-25.6 56.888889-56.888889 56.888888z m512 0c-31.288889 0-56.888889-25.6-56.888889-56.888888s25.6-56.888889 56.888889-56.888889 56.888889 25.6 56.888889 56.888889-25.6 56.888889-56.888889 56.888888z m56.888889-284.444444c0 45.511111-36.977778 85.333333-85.333333 85.333333H284.444444c-48.355556 0-85.333333-39.822222-85.333333-85.333333v-142.222222c0-48.355556 36.977778-85.333333 85.333333-85.333334h455.111112c48.355556 0 85.333333 36.977778 85.333333 85.333334v142.222222z" />
            </svg>
            {buses.length} registered
          </div>
        </div>
      </div>
      
      <div style={{ flex: 1, padding: '4px', display: 'flex', flexDirection: 'column', minHeight: 0, marginTop: '16px' }}>
        {error ? (
          <div style={{ padding: '24px', background: '#FEE2E2', color: '#DC2626', borderRadius: '16px' }}>
             <h3>Database Error</h3>
             <p>{error}</p>
          </div>
        ) : loading ? (
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
              <BusList 
                buses={buses} 
                onAdd={handleAdd} 
                onView={handleView} 
                onEdit={handleEdit} 
                onDelete={handleDelete}
              />
            )}
            
            {(viewMode === 'add' || viewMode === 'edit') && (
              <BusForm 
                bus={selectedBus} 
                onBack={handleBackToList} 
                onSaveComplete={handleBackToList} 
              />
            )}
            
            {viewMode === 'details' && selectedBus && (
              <BusDetails 
                bus={selectedBus} 
                onBack={handleBackToList} 
                onEdit={handleEdit}
                onDelete={handleDelete}
                onStatusChange={handleBackToList}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
