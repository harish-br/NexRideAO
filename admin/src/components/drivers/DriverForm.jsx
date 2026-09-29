import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, AlertCircle } from 'lucide-react';
import { db } from '../../firebase';
import { collection, doc, setDoc, updateDoc, getDocs } from 'firebase/firestore';
import { createAuditLog } from '../../services/auditLogger';

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

const FormGroup = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
    <label style={{ fontSize: '12px', fontWeight: '600', color: '#555' }}>{label}</label>
    {children}
  </div>
);

const SectionHeader = ({ title }) => (
  <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#111', margin: '24px 0 16px 0', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>
    {title}
  </h3>
);

export default function DriverForm({ driver, onBack, onSaveComplete }) {
  const isEdit = !!driver;
  
  const [formData, setFormData] = useState({
    driverName: driver?.driverName || '',
    contactNumber: driver?.contactNumber || '',
    emergencyContact: driver?.emergencyContact || '',
    licenseNumber: driver?.licenseNumber || '',
    licenseExpiry: driver?.licenseExpiry || '',
    bloodGroup: driver?.bloodGroup || '',
    status: driver?.status || 'Active',
    assignedBusId: driver?.assignedBusId || '',
    address: driver?.address || ''
  });

  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchBuses = async () => {
      try {
        const busesSnapshot = await getDocs(collection(db, 'buses'));
        const formattedBuses = busesSnapshot.docs.map(doc => ({
          id: doc.id,
          busNumber: doc.data().busNumber || 'Unknown'
        }));
        setBuses(formattedBuses);
      } catch (err) {
        console.error("Failed to fetch buses:", err);
      }
    };
    fetchBuses();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const driverData = {
        ...formData,
        updatedAt: new Date().toISOString()
      };
      
      let driverId = driver?.id;
      
      if (isEdit) {
        await updateDoc(doc(db, 'drivers', driverId), driverData);
      } else {
        driverData.createdAt = new Date().toISOString();
        driverId = `driver_${Date.now()}`;
        await setDoc(doc(db, 'drivers', driverId), driverData);
      }

      await createAuditLog({
        action: isEdit ? 'UPDATE' : 'CREATE',
        module: 'Driver Management',
        entityType: 'driver',
        entityId: driverId,
        entityName: formData.driverName,
        description: isEdit ? `Updated details for driver ${formData.driverName}` : `Added new driver ${formData.driverName}`,
        severity: 'info',
        changes: { before: isEdit ? driver : null, after: driverData }
      });

      onSaveComplete();
    } catch (err) {
      console.error('Save Error:', err);
      setError(`Failed to save driver. Error: ${err.message}`);
      await createAuditLog({
        action: isEdit ? 'UPDATE' : 'CREATE',
        module: 'Driver Management',
        entityType: 'driver',
        entityName: formData.driverName,
        description: `Failed to save driver: ${err.message}`,
        severity: 'warning',
        status: 'failed'
      }).catch(() => {});
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
            {isEdit ? 'Edit Driver' : 'Add New Driver'}
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
          {loading ? <div className="btn-spinner"></div> : 'Save Driver'}
        </button>
      </div>
      
      <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
        {error && (
          <div style={{ padding: '12px', background: '#FEE2E2', color: '#DC2626', borderRadius: '8px', marginBottom: '20px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} style={{ maxWidth: '800px', margin: '0 auto' }}>
          <SectionHeader title="Personal Details" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <FormGroup label="Full Name *">
              <input type="text" required style={inputStyle} value={formData.driverName} onChange={e => setFormData({...formData, driverName: e.target.value})} />
            </FormGroup>
            <FormGroup label="Contact Number *">
              <input type="text" required style={inputStyle} value={formData.contactNumber} onChange={e => setFormData({...formData, contactNumber: e.target.value})} />
            </FormGroup>
            <FormGroup label="Emergency Contact">
              <input type="text" style={inputStyle} value={formData.emergencyContact} onChange={e => setFormData({...formData, emergencyContact: e.target.value})} />
            </FormGroup>
            <FormGroup label="Blood Group">
              <input type="text" style={inputStyle} value={formData.bloodGroup} onChange={e => setFormData({...formData, bloodGroup: e.target.value})} />
            </FormGroup>
          </div>
          
          <FormGroup label="Residential Address">
            <textarea style={{...inputStyle, marginTop: '20px', minHeight: '60px', resize: 'vertical'}} value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
          </FormGroup>

          <SectionHeader title="License & Assignment" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <FormGroup label="License Number *">
              <input type="text" required style={inputStyle} value={formData.licenseNumber} onChange={e => setFormData({...formData, licenseNumber: e.target.value})} />
            </FormGroup>
            <FormGroup label="License Expiry *">
              <input type="date" required style={inputStyle} value={formData.licenseExpiry} onChange={e => setFormData({...formData, licenseExpiry: e.target.value})} />
            </FormGroup>
            <FormGroup label="Assigned Bus">
              <select style={inputStyle} value={formData.assignedBusId} onChange={e => setFormData({...formData, assignedBusId: e.target.value})}>
                <option value="">Unassigned</option>
                {buses.map(b => <option key={b.id} value={b.id}>{b.busNumber}</option>)}
              </select>
            </FormGroup>
            <FormGroup label="Status">
              <select style={inputStyle} value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                <option value="Active">Active</option>
                <option value="On Leave">On Leave</option>
                <option value="Inactive">Inactive</option>
              </select>
            </FormGroup>
          </div>
          <div style={{ height: '60px' }}></div>
        </form>
      </div>
    </div>
  );
}
