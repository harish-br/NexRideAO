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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
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
