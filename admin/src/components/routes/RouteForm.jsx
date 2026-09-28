import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, AlertCircle, Plus, Trash2, GripVertical } from 'lucide-react';
import { db } from '../../firebase';
import { collection, addDoc, doc, updateDoc, getDocs, setDoc } from 'firebase/firestore';

const FormGroup = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
    <label style={{ fontSize: '12px', fontWeight: '600', color: '#555' }}>{label}</label>
    {children}
  </div>
);

const inputStyle = {
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid rgba(0,0,0,0.15)',
  background: '#fff',
  outline: 'none',
  fontSize: '14px',
  width: '100%',
  boxSizing: 'border-box'
};

export default function RouteForm({ route, onBack, onSaveComplete }) {
  const isEdit = !!route;
  
  const [formData, setFormData] = useState({
    routeName: route?.routeName || '',
    status: route?.status || 'Active',
    startPoint: route?.startPoint || '',
    destination: route?.destination || '',
    assignedBus: route?.assignedBus || '',
    assignedBusName: route?.assignedBusName || '',
    assignedDriver: route?.assignedDriver || '',
    assignedDriverName: route?.assignedDriverName || '',
    description: route?.description || '',
    stops: route?.stops || []
  });

  const [buses, setBuses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const busesSnap = await getDocs(collection(db, 'buses'));
        setBuses(busesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        
        const driversSnap = await getDocs(collection(db, 'drivers'));
        setDrivers(driversSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error("Failed to fetch dropdown data:", err);
      }
    };
    fetchData();
  }, []);

  const handleAddStop = () => {
    setFormData(prev => ({
      ...prev,
      stops: [...prev.stops, { name: '', morningArrival: '', eveningArrival: '', lat: '', lng: '', status: 'Active' }]
    }));
  };

  const handleRemoveStop = (index) => {
    setFormData(prev => ({
      ...prev,
      stops: prev.stops.filter((_, i) => i !== index)
    }));
  };

  const updateStop = (index, field, value) => {
    const newStops = [...formData.stops];
    newStops[index][field] = value;
    setFormData(prev => ({ ...prev, stops: newStops }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const routeData = {
        ...formData,
        updatedAt: new Date().toISOString()
      };
      
      if (isEdit) {
        await updateDoc(doc(db, 'routes', route.id), routeData);
      } else {
        routeData.createdAt = new Date().toISOString();
        await addDoc(collection(db, 'routes'), routeData);
      }
      
      onSaveComplete();
    } catch (err) {
      console.error('Save error:', err);
      setError(`Failed to save route. Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(255, 255, 255, 0.6)', borderRadius: '16px', overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <ArrowLeft size={20} color="#444" />
          </button>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111' }}>
            {isEdit ? 'Edit Route' : 'Create Route'}
          </h2>
        </div>
        <button 
          onClick={handleSubmit}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', background: loading ? '#ccc' : '#2563EB', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          <Save size={18} />
          {loading ? 'Saving...' : 'Save Route'}
        </button>
      </div>
      
      <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
        {error && (
          <div style={{ padding: '12px', background: '#FEE2E2', color: '#DC2626', borderRadius: '8px', marginBottom: '20px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} style={{ maxWidth: '900px', margin: '0 auto' }}>
          
          <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#111', margin: '0 0 16px 0', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>Basic Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <FormGroup label="Route Name *">
              <input type="text" required style={inputStyle} value={formData.routeName} onChange={e => setFormData({...formData, routeName: e.target.value})} placeholder="e.g. Guruvareddiyur" />
            </FormGroup>
            <FormGroup label="Status">
              <select style={inputStyle} value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </FormGroup>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <FormGroup label="Start Point *">
              <input type="text" required style={inputStyle} value={formData.startPoint} onChange={e => setFormData({...formData, startPoint: e.target.value})} placeholder="e.g. Hosur / City Center" />
            </FormGroup>
            <FormGroup label="Destination *">
              <input type="text" required style={inputStyle} value={formData.destination} onChange={e => setFormData({...formData, destination: e.target.value})} placeholder="e.g. Guruvareddiyur" />
            </FormGroup>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <FormGroup label="Assigned Bus">
              <select style={inputStyle} value={formData.assignedBus} onChange={e => {
                const bus = buses.find(b => b.id === e.target.value);
                setFormData({...formData, assignedBus: e.target.value, assignedBusName: bus ? (bus.busNumber || bus.registrationNumber) : ''});
              }}>
                <option value="">No Bus Assigned</option>
                {buses.map(b => (
                  <option key={b.id} value={b.id}>{b.busNumber || b.registrationNumber || b.id}</option>
                ))}
              </select>
            </FormGroup>
            <FormGroup label="Assigned Driver">
              <select style={inputStyle} value={formData.assignedDriver} onChange={e => {
                const driver = drivers.find(d => d.id === e.target.value);
                setFormData({...formData, assignedDriver: e.target.value, assignedDriverName: driver ? driver.driverName : ''});
              }}>
                <option value="">No Driver Assigned</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.driverName}</option>
                ))}
              </select>
            </FormGroup>
          </div>

          <FormGroup label="Description (Optional)">
            <input type="text" style={{...inputStyle, marginBottom: '32px'}} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="e.g. Morning express campus corridor via Highway" />
          </FormGroup>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#111', margin: 0 }}>Route Stops & Timings</h3>
            <button type="button" onClick={handleAddStop} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: '1px solid #2563EB', color: '#2563EB', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
              <Plus size={16} /> Add Stop
            </button>
          </div>

          {formData.stops.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', background: '#f9fafb', borderRadius: '8px', color: '#6b7280', marginBottom: '20px' }}>
              No stops defined. Click "Add Stop" to add route stops.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              {formData.stops.map((stop, index) => (
                <div key={index} style={{ display: 'flex', gap: '12px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', alignItems: 'flex-start' }}>
                  <div style={{ cursor: 'move', color: '#94a3b8', paddingTop: '10px' }}>
                    <GripVertical size={20} />
                  </div>
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <FormGroup label={`Stop Name (Order: ${index + 1})`}>
                      <input type="text" required style={inputStyle} value={stop.name} onChange={e => updateStop(index, 'name', e.target.value)} placeholder="Stop name" />
                    </FormGroup>
                    <FormGroup label="Morning Arrival">
                      <input type="time" style={inputStyle} value={stop.morningArrival} onChange={e => updateStop(index, 'morningArrival', e.target.value)} />
                    </FormGroup>
                    <FormGroup label="Evening Arrival">
                      <input type="time" style={inputStyle} value={stop.eveningArrival} onChange={e => updateStop(index, 'eveningArrival', e.target.value)} />
                    </FormGroup>
                    
                    <FormGroup label="Latitude (Optional)">
                      <input type="text" style={inputStyle} value={stop.lat} onChange={e => updateStop(index, 'lat', e.target.value)} placeholder="e.g. 11.0168" />
                    </FormGroup>
                    <FormGroup label="Longitude (Optional)">
                      <input type="text" style={inputStyle} value={stop.lng} onChange={e => updateStop(index, 'lng', e.target.value)} placeholder="e.g. 76.9558" />
                    </FormGroup>
                    <FormGroup label="Status">
                      <select style={inputStyle} value={stop.status} onChange={e => updateStop(index, 'status', e.target.value)}>
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </FormGroup>
                  </div>
                  <button type="button" onClick={() => handleRemoveStop(index)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '10px' }}>
                    <Trash2 size={20} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button type="button" onClick={handleAddStop} style={{ width: '100%', padding: '12px', background: '#eff6ff', color: '#2563eb', border: '1.5px dashed #bfdbfe', borderRadius: '8px', fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}>
            <Plus size={18} /> Add Another Stop
          </button>

          <div style={{ height: '60px' }}></div>
        </form>
      </div>
    </div>
  );
}
